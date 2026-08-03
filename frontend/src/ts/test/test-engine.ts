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
 * exactly the scope C29 grants for the TR-052 reveal and the CP-126 history. A
 * task that is upcoming or active reports `expected: undefined`, so a renderer
 * cannot put it in the DOM even by accident (TR-155).
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

/**
 * ME-158 — the rolling generation batch: keep this many tasks materialised
 * ahead of the active one.
 *
 * The CP-045 rationale this used to cite ("the stream must never visibly run
 * dry") is gone with the stream — only one task is ever on screen. What
 * survives is the generation rule itself: batching keeps `batcher.take()` off
 * the critical path of a commit.
 */
export const MIN_MATERIALISED_AHEAD = 60;

export type TestPhase = "idle" | "active" | "finished";

/** How a task should be drawn. Never carries an uncommitted answer. */
export type TaskView = {
  index: number;
  /**
   * The expression, with the engine's trailing ` =` intact. TR-030: the arena
   * strips that for **display only** — this string is what reaches the task log
   * and `#taskAnnouncer`, and ME-174 regenerates and compares it server-side.
   */
  prompt: string;
  /**
   * TR-155 — `upcoming` is deliberately retained. It is what lets `viewAt` be
   * asked about a task that is not in play and answer honestly *without*
   * disclosing anything: an upcoming task reports `expected: undefined`, which
   * is the C29 guarantee the engine tests assert over a 20-task window.
   */
  state: "upcoming" | "active" | "committed";
  /** Present only when `state === "committed"`. */
  result?: "correct" | "incorrect";
  /**
   * The canonical correct answer. **Only** set for a committed task (C29) —
   * this is what `#taskReveal` shows during `awaitingContinue` (TR-052).
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
  /**
   * TR-071 — records that the task now on screen *became visible* at `nowMs`,
   * which is what ME-159's `tStart` has always meant ("ms from test start at
   * which the task became active").
   *
   * Before the one-task-at-a-time redesign this was the same instant as the
   * previous commit, so `commit()` set it itself. It no longer is: the
   * correct-answer dwell and the wrong-answer pause sit between the two, and a
   * user's response time for a task must not include the time they spent
   * looking at the previous task's correct answer. `test-logic.ts` calls this
   * from the single place a prompt reaches the screen.
   */
  markTaskShown(nowMs: number): void;
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

  /**
   * TR-071 / TR-073 — the whole of the new `tStart` semantics.
   *
   * TR-074 proves this is anti-cheat-safe: ME-180/ME-181 derive their
   * inter-answer intervals from `tEnd` deltas and never read `tStart`, and the
   * dwell and the pause only ever increase those deltas, which moves every
   * plausibility check strictly *away* from its rejection boundary. ME-165's
   * consistency is computed from the same submitted log on both client and
   * server, so the two agree by construction.
   */
  function markTaskShown(nowMs: number): void {
    if (phase !== "active" || startMs === undefined) return;
    taskStartedAt = nowMs - startMs;
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
    // TR-071 — `taskStartedAt` is NOT set here any more. The next task's
    // `tStart` is stamped by `markTaskShown()` when its prompt actually
    // renders, which is the dwell or the wrong-answer pause later. Setting it
    // to `tEnd` here would fold that pause into the next task's response time.
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
    markTaskShown,
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
