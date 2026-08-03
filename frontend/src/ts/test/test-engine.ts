/**
 * The croco calc test state machine — the replacement for the upstream
 * prompt-source + input modules and the judging half of `test-logic.ts`.
 *
 * It is **pure**: no DOM, no timers, no globals. Every method that needs the
 * clock takes `nowMs`, so the whole machine is deterministic under test
 * (`frontend/__tests__/test/test-engine.spec.ts`). `test-logic.ts` owns the one
 * live instance and drives it from real events; `test-ui.ts` reads it back.
 *
 * ## Why the tasks are private (master C29, ME-135)
 *
 * `Task` carries `answer` (an exact rational) and `answerDisplay` (the canonical
 * answer string). Both are held in the `tasks` array **inside this factory's
 * closure**. The array is never exported, never attached to `window` (see the
 * `addToGlobal` call in `src/ts/index.ts`, which deliberately does not list the
 * engine), and no accessor on the returned object hands out a `Task`.
 *
 * The only way an answer leaves the engine is {@link TestEngine.viewAt}, and it
 * populates `expected` **only for a task that has already been committed** —
 * exactly the scope C29 grants for the CP-041 hint and the CP-126 history. A
 * task that is upcoming or active reports `expected: undefined`, so a renderer
 * cannot put it in the DOM even by accident.
 */

import {
  ANSWER_MAX_LENGTH,
  appendAnswerChar,
  commitAnswer,
  createTaskBatcher,
  normalizeAnswerChar,
  normalizeForCommit,
} from "@croco-calc/math-engine";
import type {
  MathSettings,
  Task,
  TaskBatcher,
  TaskLogEntry,
} from "@croco-calc/math-engine";

/** CP-045: the stream must never visibly run dry. */
export const MIN_MATERIALISED_AHEAD = 60;

export type TestPhase = "idle" | "active" | "finished";

/** How a task should be drawn. Never carries an uncommitted answer. */
export type TaskView = {
  index: number;
  /** `<span class="prompt">` — the expression plus a trailing ` = ` (CP-032). */
  prompt: string;
  state: "upcoming" | "active" | "committed";
  /** Present only when `state === "committed"`. */
  result?: "correct" | "incorrect";
  /**
   * The canonical correct answer. **Only** set for a committed task (C29) —
   * this is what CP-041 renders as the hint under a wrong answer.
   */
  expected?: string;
  /** What the user entered. For the active task this is the live buffer. */
  given: string;
};

export type PressResult =
  /** the keystroke was ignored by the CP-055 … CP-058 filter */
  | "ignored"
  /** the keystroke entered the buffer */
  | "accepted"
  /** the keystroke entered the buffer *and* started the test (CP-049) */
  | "started";

export type CommitResultKind = "noop" | "correct" | "incorrect";

export type EngineSnapshot = {
  phase: TestPhase;
  activeIndex: number;
  correct: number;
  wrong: number;
  answered: number;
  /** Whole seconds elapsed since the first accepted keystroke. */
  elapsedSeconds: number;
  /** Seconds remaining on the countdown (CP-074). */
  remainingSeconds: number;
};

export type TestEngineOptions = {
  /** ME-169 uint32 from `crypto.getRandomValues`. */
  seed: number;
  settings: MathSettings;
  /** Injected for tests; production passes `createTaskBatcher`. */
  batcherFactory?: (seed: number, settings: MathSettings) => TaskBatcher;
};

export type TestEngine = {
  readonly seed: number;
  readonly settings: MathSettings;
  /** `settings.time * 60` (CP-073). */
  readonly durationSeconds: number;

  snapshot(): EngineSnapshot;
  /** The live answer buffer of the active task. */
  buffer(): string;
  /** How many tasks have been materialised — the renderer's upper bound. */
  materialised(): number;
  /** Draw data for one task. Answers of uncommitted tasks are withheld (C29). */
  viewAt(index: number): TaskView | undefined;

  /**
   * Starts the clock without consuming a keystroke — the start button's path.
   * Idempotent: returns `false` if the test is already active or finished, so
   * the {@link press} path (which starts the engine itself) is unaffected.
   */
  begin(nowMs: number): boolean;
  /** CP-049 / CP-055: feed one keystroke. Starts the test on the first accepted one. */
  press(ch: string, nowMs: number): PressResult;
  /** CP-059: delete one symbol, or the whole answer with `whole`. Never crosses a task. */
  backspace(whole: boolean): boolean;
  /** CP-037 / CP-038 / CP-058a: commit on Enter or Space. */
  commit(nowMs: number): CommitResultKind;

  /** Advances the clock. Returns whether the test finished on this tick. */
  tick(nowMs: number): boolean;
  /** Ends the test immediately (timer expiry, or an external stop). */
  finish(nowMs: number): void;

  /** ME-159 — committed tasks only. */
  taskLog(): readonly TaskLogEntry[];
  /** C37 — whole seconds during which nothing was entered, summed. */
  afkSeconds(): number;
  /**
   * Consecutive idle seconds at the *end* of the run. Upstream's "afk
   * detected" notice keys off this, not off {@link afkSeconds}: a run that is
   * idle for one second in every ten is slow, not abandoned.
   */
  trailingIdleSeconds(): number;
  /** CP-113 … CP-116 — one sample per elapsed second. */
  chartSamples(): { score: number[]; tpm: number[]; wrong: number[] };
  /** ms timestamp of the first accepted keystroke, or `undefined` while idle. */
  startedAt(): number | undefined;
};

export function createTestEngine(options: TestEngineOptions): TestEngine {
  const { seed, settings } = options;
  const durationSeconds = settings.time * 60;
  const makeBatcher = options.batcherFactory ?? createTaskBatcher;

  // --- private state --------------------------------------------------------
  // `tasks` is the C29 boundary. Nothing below hands one of these objects out.
  const batcher = makeBatcher(seed, settings);
  const tasks = [batcher.take()];
  /** Per-task committed outcome, parallel to `tasks`. Only committed entries. */
  const committed = new Map<
    number,
    { correct: boolean; expected: string; given: string }
  >();

  let phase: TestPhase = "idle";
  let activeIndex = 0;
  let buffer = "";
  let correct = 0;
  let wrong = 0;
  let startMs: number | undefined;
  /** ms from start at which the active task became active (ME-159 `tStart`). */
  let taskStartedAt = 0;
  let elapsedSeconds = 0;
  const log: TaskLogEntry[] = [];

  let afk = 0;
  /** Consecutive idle seconds at the tail of the run, for `trailingIdleSeconds`. */
  let trailingIdle = 0;
  let inputSinceTick = false;
  const chart = {
    score: [] as number[],
    tpm: [] as number[],
    wrong: [] as number[],
  };
  let wrongThisSecond = 0;

  function materialiseTo(index: number): void {
    while (tasks.length <= index) tasks.push(batcher.take());
  }

  /** CP-045: keep a deep runway in front of the active task at all times. */
  function ensureRunway(): void {
    materialiseTo(activeIndex + MIN_MATERIALISED_AHEAD);
  }

  ensureRunway();

  function taskAt(index: number): Task | undefined {
    materialiseTo(index);
    return tasks[index];
  }

  // --- public surface -------------------------------------------------------

  function snapshot(): EngineSnapshot {
    return {
      phase,
      activeIndex,
      correct,
      wrong,
      answered: correct + wrong,
      elapsedSeconds,
      remainingSeconds: Math.max(0, durationSeconds - elapsedSeconds),
    };
  }

  function viewAt(index: number): TaskView | undefined {
    if (index < 0 || index >= tasks.length) return undefined;
    const task = taskAt(index);
    if (task === undefined) return undefined;

    const done = committed.get(index);
    if (done !== undefined) {
      return {
        index,
        prompt: task.prompt,
        state: "committed",
        result: done.correct ? "correct" : "incorrect",
        // C29: safe — this task is committed, so revealing it is CP-041/CP-126.
        expected: done.expected,
        given: done.given,
      };
    }

    return {
      index,
      prompt: task.prompt,
      state: index === activeIndex ? "active" : "upcoming",
      // C29: deliberately absent. An uncommitted answer never leaves the closure.
      expected: undefined,
      given: index === activeIndex ? buffer : "",
    };
  }

  function start(nowMs: number): void {
    phase = "active";
    startMs = nowMs;
    taskStartedAt = 0;
    elapsedSeconds = 0;
  }

  function begin(nowMs: number): boolean {
    if (phase !== "idle") return false;
    start(nowMs);
    return true;
  }

  function press(ch: string, nowMs: number): PressResult {
    if (phase === "finished") return "ignored";
    // CP-055 / CP-050: only a keystroke the filter accepts may start the test,
    // and it must be the *same* event that starts the clock (CP-049).
    if (normalizeAnswerChar(ch) === null) return "ignored";
    const next = appendAnswerChar(buffer, ch);
    if (next === buffer) return "ignored";

    const starting = phase === "idle";
    if (starting) start(nowMs);
    buffer = next;
    inputSinceTick = true;
    return starting ? "started" : "accepted";
  }

  function backspace(whole: boolean): boolean {
    // CP-042 / CP-059: a committed task is never revisitable, so an empty
    // buffer swallows the keystroke instead of stepping back a task.
    if (phase !== "active" || buffer.length === 0) return false;
    buffer = whole ? "" : buffer.slice(0, -1);
    inputSinceTick = true;
    return true;
  }

  function commit(nowMs: number): CommitResultKind {
    // CP-050: Enter / Space never start the test.
    if (phase !== "active") return "noop";
    const task = taskAt(activeIndex);
    if (task === undefined) return "noop";

    const outcome = commitAnswer(task, buffer);
    // CP-038 / ME-141: an empty (or digit-less) commit changes nothing at all.
    if (outcome.outcome === "noop") return "noop";

    const isCorrect = outcome.outcome === "correct";
    if (isCorrect) {
      correct++;
    } else {
      wrong++;
      wrongThisSecond++;
    }

    const tEnd = startMs === undefined ? 0 : nowMs - startMs;
    log.push({
      i: activeIndex,
      kind: task.kind,
      prompt: task.prompt,
      expected: task.answerDisplay,
      given: outcome.given,
      correct: isCorrect,
      tStart: taskStartedAt,
      tEnd,
    });
    committed.set(activeIndex, {
      correct: isCorrect,
      expected: task.answerDisplay,
      given: outcome.given,
    });

    // CP-040: the pointer advances by exactly one.
    activeIndex++;
    buffer = "";
    taskStartedAt = tEnd;
    inputSinceTick = true;
    ensureRunway();

    return isCorrect ? "correct" : "incorrect";
  }

  function sampleSecond(): void {
    chart.score.push(correct - wrong);
    const minutes = elapsedSeconds / 60;
    chart.tpm.push(minutes > 0 ? (correct + wrong) / minutes : 0);
    chart.wrong.push(wrongThisSecond);
    wrongThisSecond = 0;
  }

  function tick(nowMs: number): boolean {
    if (phase !== "active" || startMs === undefined) return false;
    const next = Math.floor((nowMs - startMs) / 1000);
    if (next <= elapsedSeconds) return false;

    while (elapsedSeconds < next && elapsedSeconds < durationSeconds) {
      elapsedSeconds++;
      if (inputSinceTick) {
        trailingIdle = 0;
      } else {
        afk++;
        trailingIdle++;
      }
      inputSinceTick = false;
      sampleSecond();
    }

    if (elapsedSeconds >= durationSeconds) {
      phase = "finished";
      return true;
    }
    return false;
  }

  function finish(): void {
    if (phase === "finished") return;
    phase = "finished";
  }

  return {
    seed,
    settings,
    durationSeconds,
    snapshot,
    buffer: () => buffer,
    materialised: () => tasks.length,
    viewAt,
    begin,
    press,
    backspace,
    commit,
    tick,
    finish,
    taskLog: () => log,
    afkSeconds: () => afk,
    trailingIdleSeconds: () => trailingIdle,
    chartSamples: () => ({
      score: [...chart.score],
      tpm: [...chart.tpm],
      wrong: [...chart.wrong],
    }),
    startedAt: () => startMs,
  };
}

/** Re-exported so the input layer does not have to import the engine package. */
export { ANSWER_MAX_LENGTH, normalizeAnswerChar, normalizeForCommit };
