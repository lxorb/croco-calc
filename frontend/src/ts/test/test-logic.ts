/**
 * Test orchestration (CP-028, CP-049, CP-052, CP-086 … CP-089).
 *
 * Owns the one live {@link TestEngine} instance, the restart paths, and the
 * hand-off of a finished run to the results screen (WP-07) and the save
 * endpoint (WP-10).
 *
 * The engine is **module-private on purpose** (master C29): `getEngine()` is not
 * exported, nothing here is attached to `window`, and the only way the rest of
 * the app touches task data is through the narrow, answer-free functions below.
 */

import {
  MATH_ENGINE_VERSION,
  computeMetrics,
  createTestSeed,
  serializeTaskLog,
} from "@croco-calc/math-engine";
import type { MathSettings } from "@croco-calc/math-engine";
import { buildSettingsId } from "@croco-calc/schemas/math";
import type { CompletedEvent } from "@croco-calc/schemas/results";
import { CHART_DATA_MAX_POINTS } from "@croco-calc/schemas/results";

import { Config } from "../config/store";
import { restartTestEvent } from "../events/test";
import {
  currentLiveStats,
  getIncompleteSeconds,
  getIncompleteTests,
  getRestartCount,
  isPreStart,
  isRepeated,
  pushIncompleteTest,
  resetActiveTaskIndex,
  resetIncompleteTests,
  resetLiveStats,
  setActiveTaskIndex,
  setAnswerLength,
  setIsRepeated,
  setIsTestInvalid,
  setIsTestRestarting,
  setLastResult,
  setResultCalculating,
  setResultVisible,
  setTestActive,
} from "../states/test";
import * as Caret from "./caret";
import {
  logTestEvent,
  resetTestEvents,
  setEventLogContext,
} from "./events/data";
import { createTestEngine } from "./test-engine";
import type { TaskView, TestEngine } from "./test-engine";
import * as TestTimer from "./test-timer";
import * as TestUI from "./test-ui";

/** The payload handed to WP-07's results screen and WP-10's save endpoint. */
export type TestResultPayload = {
  /** `hash` and `uid` are added by the save layer. */
  completedEvent: Omit<CompletedEvent, "hash" | "uid">;
  isRepeated: boolean;
  /**
   * The run *ended* idle — upstream's rule, kept per C19: the last
   * {@link AFK_TRAILING_SECONDS} seconds carried no input at all. Deliberately
   * not `afkDuration >= 60`: C37's `afkDuration` is the **sum** of idle
   * seconds, so sixty scattered pauses in an eight-minute run would trip a
   * flag that means "you walked away".
   */
  afkDetected: boolean;
  /** CP-109 — nothing was answered, so the run is invalid. */
  tooShort: boolean;
  dontSave: boolean;
};

type ResultPresenter = (payload: TestResultPayload) => void | Promise<void>;

let presentResult: ResultPresenter = () => {
  /* replaced by WP-07's result.ts at module load */
};

/**
 * WP-07 registers the results screen here (`Result.registerAsPresenter()`),
 * which keeps the test engine free of a compile-time dependency on the results
 * page and vice versa.
 */
export function registerResultPresenter(presenter: ResultPresenter): void {
  presentResult = presenter;
}

/** C19 — upstream flags a run as abandoned from its last five seconds. */
const AFK_TRAILING_SECONDS = 5;

let engine: TestEngine | undefined;
/** ME-169 — the uint32 the whole run is reproducible from (CP-089). */
let seed = 0;

/** Reads the seven task-shaping settings plus `time` off the live config. */
function readMathSettings(): MathSettings {
  return {
    addition: Config.addition,
    multiplication: Config.multiplication,
    division: Config.division,
    fractionAddition: Config.fractionAddition,
    fractionMultiplication: Config.fractionMultiplication,
    decimals: Config.decimals,
    negatives: Config.negatives,
    time: Config.time,
  };
}

function settingsId(settings: MathSettings): string {
  return buildSettingsId({
    addition: settings.addition,
    multiplication: settings.multiplication,
    division: settings.division,
    fractionAddition: settings.fractionAddition,
    fractionMultiplication: settings.fractionMultiplication,
    decimals: settings.decimals,
    negatives: settings.negatives,
  });
}

/** The window of tasks the renderer should currently show. */
function currentViews(active: number): TaskView[] {
  if (engine === undefined) return [];
  const { from, to } = TestUI.getRenderWindow(active);
  const views: TaskView[] = [];
  for (let i = from; i <= to; i++) {
    const view = engine.viewAt(i);
    if (view !== undefined) views.push(view);
  }
  return views;
}

/** True while a test is running — the input layer's gate. */
export function isActive(): boolean {
  return engine?.snapshot().phase === "active";
}

export function getBuffer(): string {
  return engine?.buffer() ?? "";
}

export function getDurationSeconds(): number {
  const configured = Config.time * 60;
  return engine?.durationSeconds ?? configured;
}

/**
 * CP-088 — reset the timer to the full duration, discard all committed tasks,
 * generate a fresh task stream, re-apply `preStart`, reset the caret to task 0 /
 * char 0, and record the abandoned run as an incomplete test.
 */
export function restart(options?: {
  /** CP-089 — replay the identical sequence. */
  repeat?: boolean;
  /** Skips the incomplete-test bookkeeping on the very first build. */
  initial?: boolean;
}): void {
  setIsTestRestarting(true);

  const isInitial = options?.initial ?? false;
  const previous = engine;
  if (previous !== undefined && !isInitial) {
    const { phase, elapsedSeconds, correct, answered } = previous.snapshot();
    // An abandoned run is recorded, never saved as a result (CP-088, C38).
    // Every restart of a *started* test counts, including one inside the first
    // second: `restartCount` is derived from this list, and upstream's guard is
    // "the test was active", nothing more.
    if (phase === "active") {
      pushIncompleteTest({
        acc: answered === 0 ? 0 : (correct / answered) * 100,
        seconds: elapsedSeconds,
      });
    }
  }

  TestTimer.stop();
  setTestActive(false);
  setResultVisible(false);
  setResultCalculating(false);
  resetLiveStats();
  resetActiveTaskIndex();
  setAnswerLength(0);
  resetTestEvents();

  const settings = readMathSettings();
  const repeat = options?.repeat ?? false;
  setIsRepeated(repeat);
  // CP-089 requires the same task sequence, which is exactly "the same seed".
  if (!repeat || seed === 0) seed = createTestSeed();

  try {
    engine = createTestEngine({ seed, settings });
    TestUI.hideTestInitFailed();
  } catch (error) {
    // CP-022 — generation can legitimately fail on a hostile settings combo.
    engine = undefined;
    TestUI.showTestInitFailed(error);
    setIsTestRestarting(false);
    return;
  }

  setEventLogContext({
    targetPrompts: [],
    mode: "time",
    mode2: `${settings.time}`,
    mathSeed: seed,
    settingsId: settingsId(settings),
  });

  // CP-046 / CP-052 — the stream goes back behind the mask, every time.
  TestUI.applyPreStart();
  TestTimer.reset(engine);
  Caret.resetPosition();
  Caret.show(true);
  setIsTestRestarting(false);
}

/**
 * CP-049 — the reveal and the clock start are the same event. Called only from
 * the input pipeline, only for an accepted answer symbol.
 */
export function startTest(): void {
  if (engine === undefined || !isPreStart()) return;
  setTestActive(true);
  TestUI.revealStream(currentViews(0));
  TestUI.updateActiveElement(0);
  logTestEvent("taskShown", performance.now(), {
    taskIndex: 0,
    prompt: engine.viewAt(0)?.prompt ?? "",
  });
  TestTimer.start(engine, () => {
    void finish();
  });
}

/** Feeds one accepted symbol in and re-renders the active answer. */
export function pressCharacter(ch: string): void {
  if (engine === undefined) return;
  const result = engine.press(ch, performance.now());
  if (result === "ignored") return;
  if (result === "started") startTest();
  setAnswerLength(engine.buffer().length);
  TestUI.updateActiveAnswer(engine.buffer());
}

/** CP-059 — backspace, never crossing a task boundary (CP-042). */
export function deleteCharacter(whole: boolean): void {
  if (engine === undefined) return;
  if (!engine.backspace(whole)) return;
  setAnswerLength(engine.buffer().length);
  TestUI.updateActiveAnswer(engine.buffer());
}

/** CP-037 / CP-038 — commit on Enter or Space; an empty commit is a no-op. */
export function commitAnswer(): void {
  if (engine === undefined) return;
  const index = engine.snapshot().activeIndex;
  const now = performance.now();
  const outcome = engine.commit(now);
  if (outcome === "noop") return;

  const committed = engine.viewAt(index);
  const next = engine.snapshot().activeIndex;

  logTestEvent("answerSubmitted", now, {
    taskIndex: index,
    given: committed?.given ?? "",
    correct: outcome === "correct",
  });

  if (committed !== undefined) TestUI.commitTask(committed, next);
  setActiveTaskIndex(next);
  setAnswerLength(0);
  TestUI.updateActiveAnswer("");

  const upcoming = engine.viewAt(next);
  if (upcoming !== undefined) {
    logTestEvent("taskShown", now, {
      taskIndex: next,
      prompt: upcoming.prompt,
    });
  }

  // Keep the runway rendered so the stream never visibly runs dry (CP-045).
  if (next > 0 && next % 20 === 0) TestUI.renderStream(currentViews(next));
}

/** Builds the complete, seed-carrying payload (ME-169, ME-173, ME-177). */
function buildCompletedEvent(
  active: TestEngine,
): Omit<CompletedEvent, "hash" | "uid"> {
  const settings = readMathSettings();
  const taskLog = active.taskLog();
  const metrics = computeMetrics(taskLog, active.durationSeconds);
  const samples = active.chartSamples();
  const clamp = <T>(values: T[]): T[] => values.slice(0, CHART_DATA_MAX_POINTS);

  return {
    score: metrics.score,
    correct: metrics.correct,
    wrong: metrics.wrong,
    acc: metrics.acc,
    tpm: metrics.tpm,
    spm: metrics.spm,
    consistency: metrics.consistency,
    mode: "time",
    mode2: `${settings.time}`,
    timestamp: Date.now(),
    testDuration: active.durationSeconds,
    chartData: {
      score: clamp(samples.score),
      tpm: clamp(samples.tpm),
      wrong: clamp(samples.wrong),
    },
    settings: {
      addition: settings.addition,
      multiplication: settings.multiplication,
      division: settings.division,
      fractionAddition: settings.fractionAddition,
      fractionMultiplication: settings.fractionMultiplication,
      decimals: settings.decimals,
      negatives: settings.negatives,
    },
    settingsId: settingsId(settings),
    restartCount: getRestartCount(),
    incompleteTestSeconds: getIncompleteSeconds(),
    // C37 — persisted as `afkDuration`, displayed as `idle`.
    afkDuration: active.afkSeconds(),
    mathSeed: seed,
    mathSettings: settings,
    engineVersion: MATH_ENGINE_VERSION,
    // ME-176 — degrades to the literal "toolong" past 1000 entries.
    taskLog: serializeTaskLog(taskLog),
    incompleteTests: getIncompleteTests(),
  };
}

/**
 * C19 / C37 — "you walked away", not "you were slow". A run shorter than the
 * window is judged on its whole length, which is upstream's `slice(-5)`.
 */
function isAfkDetected(active: TestEngine): boolean {
  const elapsed = active.snapshot().elapsedSeconds;
  if (elapsed === 0) return false;
  return (
    active.trailingIdleSeconds() >= Math.min(AFK_TRAILING_SECONDS, elapsed)
  );
}

/** The timer expired. The only path that produces a saveable result (C38). */
export async function finish(): Promise<void> {
  const active = engine;
  if (active === undefined) return;

  setResultCalculating(true);
  TestTimer.stop();
  active.finish(performance.now());
  TestUI.setTestState("finished");
  Caret.hide();
  setTestActive(false);

  const completedEvent = buildCompletedEvent(active);
  setLastResult(completedEvent);

  // CP-109 — a run with nothing answered is invalid: never saved, never a PB,
  // never on a leaderboard. The results screen shows the standard notice.
  const answered = completedEvent.correct + completedEvent.wrong;
  const invalid = answered === 0;
  setIsTestInvalid(invalid);

  await presentResult({
    completedEvent,
    isRepeated: isRepeated(),
    afkDetected: isAfkDetected(active),
    tooShort: invalid,
    dontSave: invalid || !Config.resultSaving,
  });

  setResultCalculating(false);
  setResultVisible(true);
  resetIncompleteTests();
}

/** CP-028 / CP-052 — every restart path funnels through the shared event. */
restartTestEvent.subscribe(() => {
  restart();
});

/** Live-stat mirror for the modes notice and the progress bar. */
export function getElapsedSeconds(): number {
  return currentLiveStats.seconds ?? 0;
}
