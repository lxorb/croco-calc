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
  getArenaState,
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
  setIsRepeated,
  setIsTestInvalid,
  setIsTestRestarting,
  setLastResult,
  setResultCalculating,
  setResultVisible,
  setTestActive,
} from "../states/test";
import {
  logTestEvent,
  resetTestEvents,
  setEventLogContext,
} from "./events/data";
import * as Focus from "./focus";
import { createTestEngine } from "./test-engine";
import type { TestEngine } from "./test-engine";
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

/**
 * Replaced by WP-07's `test/result.ts` at module load. If it is ever still in
 * place when a run finishes, the results screen was never imported by the boot
 * path — fail loudly rather than swallowing the run in silence.
 */
let presentResult: ResultPresenter = () => {
  console.error(
    "No result presenter registered: `test/result.ts` was never imported, so " +
      "the finished run cannot be displayed. `index.ts` must keep its " +
      '`import "./test/result";` side-effect import.',
  );
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

/**
 * Reads the seven task-shaping settings plus `time` off the live config.
 *
 * ME-006 — this is the ONLY place the live config may be read for generation
 * purposes, and it may only be called from {@link restart}, which freezes the
 * result onto the engine. Everything downstream (the submitted payload above
 * all) MUST read `engine.settings` instead, so the settings that describe a run
 * are always the settings the run was generated from.
 */
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

/**
 * The presentation-only sub-state timers (TR-059).
 *
 * `dwellHandle` is the 180 ms correct-answer confirmation; `wrongAt` is when
 * the current `awaitingContinue` began, for the TR-118 arming delay. Neither
 * gates correctness, scoring, the task log, the chart samples or the timer —
 * `engine.commit()` has already run synchronously by the time either is set
 * (TR-060, TR-117). If an animation is dropped, the run is still correct.
 */
let dwellHandle: ReturnType<typeof setTimeout> | undefined;
let wrongAt: number | undefined;

/** TR-119 — entering any state cancels whatever the last one left in flight. */
function cancelPending(): void {
  if (dwellHandle !== undefined) {
    clearTimeout(dwellHandle);
    dwellHandle = undefined;
  }
  wrongAt = undefined;
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
 * CP-088 / TR-174 — reset the timer to the full duration, discard all committed
 * tasks, generate a fresh sequence, return to `preStart`, and record the
 * abandoned run as an incomplete test.
 *
 * TR-063 — reachable from every state, including mid-dwell and mid-reveal, and
 * always lands in `preStart` with nothing left in flight.
 */
export function restart(options?: {
  /** CP-089 — replay the identical sequence. */
  repeat?: boolean;
  /** Skips the incomplete-test bookkeeping on the very first build. */
  initial?: boolean;
}): void {
  setIsTestRestarting(true);
  cancelPending();

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

  // TR-038 / TR-039 — back to `preStart`, which means the arena is *emptied*.
  // There is no mask to re-apply and no blur to restore: the pre-start
  // guarantee is that nothing is rendered, so there is nothing to read.
  TestUI.resetArena();
  TestTimer.reset(engine);
  setIsTestRestarting(false);
}

/**
 * TR-071 / TR-077 — render task `index` and record that it became active *now*.
 *
 * This is the single place a prompt reaches the screen, so it is also the
 * single place `tStart` and the `taskShown` event are stamped. ME-159 always
 * defined `tStart` as "ms from test start at which the task became active", and
 * before this redesign that was the same instant as the previous commit. It no
 * longer is: the dwell and the wrong-answer pause sit in between, and a user's
 * response time must not include the time they spent reading the previous
 * task's correct answer.
 *
 * TR-074 — this is anti-cheat-safe, and provably so: ME-180/ME-181 compute
 * their intervals from `tEnd` deltas and never read `tStart`, and the dwell and
 * the pause only ever *increase* those deltas, moving every plausibility check
 * strictly away from its rejection boundary.
 */
function showTask(index: number, nowMs: number): void {
  if (engine === undefined) return;
  const view = engine.viewAt(index);
  if (view === undefined) return;

  engine.markTaskShown(nowMs);
  // TR-030 — the DOM gets the display form (no trailing `=`); the log and the
  // announcer get `task.prompt` verbatim, because ME-174 regenerates and
  // compares that exact string server-side.
  TestUI.renderPrompt(view.prompt, index);
  setActiveTaskIndex(index);
  logTestEvent("taskShown", nowMs, { taskIndex: index, prompt: view.prompt });
}

/**
 * TR-066 — the clock starts on the same event that first renders a task, and
 * never on page load, focus, restart, modal close or any other input.
 *
 * Reached from two places: the input pipeline (an accepted answer character,
 * where the engine has already started itself inside `press`) and the start
 * button, which has no keystroke to feed in. `engine.begin` covers the second
 * case and is a no-op for the first, so both paths start the clock exactly once.
 */
export function startTest(): void {
  if (engine === undefined || !isPreStart()) return;
  const now = performance.now();
  engine.begin(now);
  setTestActive(true);
  // CP-081 / TR-036 — the readouts are gated on `isTestActive() && getFocus()`.
  // Starting a run *is* entering focus mode: without this the countdown, the
  // live tpm and the live acc never render at all, because nothing else in the
  // app turns the signal back on after `page-controller` clears it on
  // navigation.
  Focus.set(true);
  TestUI.setTestState("running");
  TestUI.setFeedback("none");
  showTask(0, now);
  // TR-145 — a fresh prompt is announced verbatim.
  TestUI.announce(engine.viewAt(0)?.prompt ?? "");
  TestTimer.start(engine, () => {
    void finish();
  });
}

/**
 * Feeds one accepted character in and mirrors the engine's buffer back into
 * `#answerInput` (TR-089).
 */
export function pressCharacter(ch: string): void {
  if (engine === undefined) return;

  // TR-136 — a digit typed during `awaitingContinue` is **discarded**, not
  // buffered for the next task. The pause exists to make the user read the
  // correct answer; silently banking their keystrokes would defeat it.
  if (getArenaState() === "awaitingContinue") return;

  // TR-110 — the dwell is cancellable. A fast user never waits: the pending
  // advance completes immediately and this character lands in the new task's
  // buffer. No keystroke may be dropped by an animation.
  if (dwellHandle !== undefined) finishDwell();

  const result = engine.press(ch, performance.now());
  if (result === "ignored") return;
  if (result === "started") startTest();
  TestUI.syncAnswer(engine.buffer());
}

/** CP-059 — backspace, never crossing a task boundary (CP-042). */
export function deleteCharacter(whole: boolean): void {
  if (engine === undefined) return;
  // TR-056 — the wrong answer is `readonly` once the correct one is on screen.
  if (getArenaState() === "awaitingContinue") return;
  if (!engine.backspace(whole)) return;
  TestUI.syncAnswer(engine.buffer());
}

/**
 * TR-131 / TR-136 — Enter's two meanings, resolved by state.
 *
 * This is the only entry point for Enter, so the TR-118 arming delay cannot be
 * bypassed by any caller.
 */
export function submitOrContinue(): void {
  if (getArenaState() === "awaitingContinue") {
    // TR-118 — an Enter that arrives less than CONTINUE_ARM_MS after the wrong
    // submit is ignored. Without it a user who double-taps Enter blows straight
    // past the correct answer and never sees it, which defeats the feature.
    if (
      wrongAt !== undefined &&
      performance.now() - wrongAt < TestUI.CONTINUE_ARM_MS
    ) {
      return;
    }
    continueAfterWrong();
    return;
  }
  // TR-111 — Enter during the dwell is ignored. The new buffer is empty, so a
  // commit would be a no-op anyway (TR-061), but this is explicit so the
  // behaviour is not accidental.
  if (dwellHandle !== undefined) return;
  commitAnswer();
}

/** TR-115 — leave `awaitingContinue` and render the next task. */
function continueAfterWrong(): void {
  if (engine === undefined) return;
  cancelPending();
  const now = performance.now();

  // TR-157 — emptied, not hidden, and *before* the next prompt renders.
  TestUI.clearReveal();
  TestUI.setAnswerReadonly(false);
  TestUI.setFeedback("none");
  TestUI.setResult(undefined);
  TestUI.setTestState("running");
  TestUI.syncAnswer("");

  const next = engine.snapshot().activeIndex;
  showTask(next, now);
  TestUI.announce(engine.viewAt(next)?.prompt ?? "");
  TestUI.playAdvanceIn();
}

/** TR-107 — the correct-answer dwell has elapsed (or been cancelled short). */
function finishDwell(): void {
  if (engine === undefined) return;
  if (dwellHandle !== undefined) {
    clearTimeout(dwellHandle);
    dwellHandle = undefined;
  }
  const now = performance.now();

  TestUI.setFeedback("none");
  TestUI.setResult(undefined);
  TestUI.syncAnswer("");

  const next = engine.snapshot().activeIndex;
  const view = engine.viewAt(next);
  showTask(next, now);
  // TR-145 — after a correct answer the confirmation is spoken with the prompt.
  TestUI.announce(`correct. ${view?.prompt ?? ""}`);
  TestUI.playAdvanceIn();
}

/**
 * TR-060 — `engine.commit()` runs **exactly once per submit, synchronously,
 * before any animation starts**. The engine advances `activeIndex` at that
 * moment; everything below is presentation.
 */
export function commitAnswer(): void {
  if (engine === undefined) return;
  const index = engine.snapshot().activeIndex;
  const now = performance.now();
  const outcome = engine.commit(now);
  // TR-061 — a no-op commit changes nothing: no state, no animation, no
  // advance, no count. The arena stays in `running` awaiting an answer.
  if (outcome === "noop") return;

  const committed = engine.viewAt(index);

  // TR-077 / TR-158 — records what the user entered and whether it was right,
  // never what was right. The event log stays answer-free at every moment.
  logTestEvent("answerSubmitted", now, {
    taskIndex: index,
    given: committed?.given ?? "",
    correct: outcome === "correct",
  });

  if (outcome === "correct") {
    // TR-047 / TR-049 — the submitted answer stays on screen and turns
    // `--main-color`. No correct answer is revealed: the user produced it.
    TestUI.setFeedback("correct");
    TestUI.setResult("correct");
    dwellHandle = setTimeout(() => {
      dwellHandle = undefined;
      TestUI.playAdvanceOut();
      dwellHandle = setTimeout(finishDwell, TestUI.FEEDBACK_PHASE_MS);
    }, TestUI.FEEDBACK_PHASE_MS);
    return;
  }

  // TR-050 … TR-056 — the wrong-answer pause. The user's answer stays on
  // screen in the error colour, the correct answer appears below it, and the
  // run waits indefinitely for an explicit continue.
  //
  // TR-062 — the timer is NOT paused here, and must never be. The cost of an
  // error is time; that is the entire point of the design.
  wrongAt = now;
  TestUI.setFeedback("wrong");
  TestUI.setResult("wrong");
  TestUI.setTestState("awaitingContinue");
  TestUI.setAnswerReadonly(true);
  // C29 — `committed.expected` is populated by the engine only for a task that
  // has already been committed, so this cannot reveal an answer still in play.
  const expected = committed?.expected ?? "";
  TestUI.showReveal(expected);
  TestUI.announce(
    `incorrect. correct answer ${expected}. press enter to continue.`,
  );
}

/** Builds the complete, seed-carrying payload (ME-169, ME-173, ME-177). */
function buildCompletedEvent(
  active: TestEngine,
): Omit<CompletedEvent, "hash" | "uid"> {
  // ME-006 — the frozen snapshot the sequence was generated from, never the
  // live config. Reading `Config` here would let a mid-run settings change ship
  // a `mathSettings` that does not regenerate the submitted `taskLog`, which
  // the server answers with `prompt-mismatch` and an anti-cheat strike.
  const settings = active.settings;
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
 * C19 / C37 (as amended for `afkDetected`) — "you walked away", not "you were
 * slow". True when the last {@link AFK_TRAILING_SECONDS} seconds all carried no
 * input; a run shorter than the window is judged on its whole length, which is
 * upstream's `slice(-5)` exactly.
 *
 * Deliberately not `afkDuration >= 60`: `afkDuration` sums *every* silent
 * second, and in a math trainer silence is thinking time, so a summed threshold
 * accuses an attentive user of leaving. See the C37 amendment in
 * `docs/REQUIREMENTS.md`.
 *
 * `elapsed === 0` returns false rather than upstream's vacuous `[].every()`
 * true: a run in which no second has passed cannot meaningfully have been
 * abandoned, and it is already flagged `too short` (CP-109).
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
  // TR-058 — if the timer expires mid-dwell or mid-reveal the run finishes
  // immediately: the dwell is cancelled and the reveal is discarded. TR-172:
  // a task committed *before* the pause still counts — only a task with an
  // uncommitted buffer is discarded (ME-157), and the engine owns that.
  cancelPending();
  active.finish(performance.now());
  TestUI.clearReveal();
  TestUI.setAnswerReadonly(false);
  TestUI.setFeedback("none");
  TestUI.setResult(undefined);
  TestUI.setTestState("finished");
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
