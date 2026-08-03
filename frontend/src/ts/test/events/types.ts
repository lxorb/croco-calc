/**
 * The versioned test event log (INV-089, INV-197).
 *
 * The upstream architecture is kept — a flat, timestamped, replayable event
 * stream from which stats and charts are derived post hoc — but the vocabulary
 * is the math one INV-089 specifies: `taskShown` / `answerSubmitted` / `timer`.
 * The keystroke-level `keydown` / `keyup` / `input` / `composition` events are
 * gone; croco calc scores whole answers, not keystrokes (CP-036, ME-152).
 *
 * **C29:** no event carries the expected answer of any task. `answerSubmitted`
 * records what the *user* entered and whether it was right, never what was right.
 */

/**
 * TR-076 — bumped 2 -> 3 for the one-task-at-a-time redesign.
 *
 * No event type was added or removed. `taskShown` changed *meaning* slightly:
 * it now fires when the prompt actually appears on screen, which lags the
 * preceding `answerSubmitted` by the correct-answer dwell or the wrong-answer
 * pause. The version bump is what records that, so a replay of an older log is
 * not misread as having instant advances.
 *
 * TR-167 — this is a debug and replay stream, NOT the anti-cheat artefact.
 * `buildCompletedEvent` reads `engine.taskLog()` and never the event log, and
 * nothing the server validates depends on this constant, which is why the bump
 * is free.
 */
export const EVENT_LOG_VERSION = 3;

export type TestEventType = "taskShown" | "answerSubmitted" | "timer";

type EventProps<T extends TestEventType, TData> = {
  type: T;
  /** Wall-clock `performance.now()` at the moment the event was logged. */
  ms: number;
  /** Milliseconds since the timer `start` event. */
  testMs: number;
  data: TData;
};

/**
 * TR-077 — a task's prompt was rendered. Logged at the moment the prompt
 * actually appears, which is also the moment ME-159's `tStart` is stamped.
 */
export type TaskShownEventData = {
  taskIndex: number;
  /** Public information — the prompt is on screen anyway. */
  prompt: string;
};
export type TaskShownEvent = EventProps<"taskShown", TaskShownEventData>;

/** A committed answer (CP-037). Never carries the correct answer (C29). */
export type AnswerSubmittedEventData = {
  taskIndex: number;
  /** The CP-058a-normalised buffer the user committed. */
  given: string;
  correct: boolean;
};
export type AnswerSubmittedEvent = EventProps<
  "answerSubmitted",
  AnswerSubmittedEventData
>;

export type TimerEventData = {
  event: "start" | "tick" | "end";
  /** Whole seconds elapsed. Present on `tick` and `end`. */
  seconds?: number;
};
export type TimerEvent = EventProps<"timer", TimerEventData>;

export type TestEvent = TaskShownEvent | AnswerSubmittedEvent | TimerEvent;

export type TestEventNoMs =
  | Omit<TaskShownEvent, "ms">
  | Omit<AnswerSubmittedEvent, "ms">
  | Omit<TimerEvent, "ms">;

export type AnswerSubmittedEventNoMs = Omit<AnswerSubmittedEvent, "ms">;

export type TestEventData =
  | TaskShownEventData
  | AnswerSubmittedEventData
  | TimerEventData;

/**
 * Everything a replay needs that is not in the event stream itself.
 * `mathSeed` + `settingsId` are what let the sequence be regenerated
 * (ME-171, ME-174), so a dumped log is fully reproducible.
 */
export type EventLogContext = {
  /** The prompts of the tasks that were shown. Prompts only — never answers. */
  targetPrompts: string[];
  mode: "time";
  mode2: string;
  mathSeed: number;
  settingsId: string;
};

export type EventLog = {
  version: typeof EVENT_LOG_VERSION;
  events: TestEventNoMs[];
  context: EventLogContext;
};
