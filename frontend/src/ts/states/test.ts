/**
 * Reactive test state (WP-06).
 *
 * The engine (`test/test-engine.ts`) owns the authoritative state; this module
 * mirrors the parts Solid components need to re-render on, as plain numbers and
 * booleans. Nothing here holds a `Task`, so master C29 cannot be violated
 * through a signal.
 *
 * Cut relative to upstream: passages, challenges, `bailedOut` (master C38), and
 * — with the one-task-at-a-time redesign (doc 07) — the caret's position
 * mirror, the pre-start mask flag and the out-of-focus height measurement.
 * `getAnswerLength` existed only to position the custom caret and went with it
 * (TR-191); the browser's native caret in `#answerInput` needs no help.
 */

import { createMemo, createSignal } from "solid-js";
import { createStore } from "solid-js/store";

import type {
  CompletedEvent,
  IncompleteTest,
} from "@croco-calc/schemas/results";
import { getConfig } from "../config/store";
import { createSignalWithSetters } from "../hooks/createSignalWithSetters";
import { clearTimeouts } from "../utils/misc";

export const [getResultVisible, setResultVisible] = createSignal(false);
/**
 * True from the first line of `TestLogic.finish()` until the result is built,
 * so it covers the stream fade-out that `getResultVisible()` is still false during.
 */
export const [isResultCalculating, setResultCalculating] = createSignal(false);
export const [getFocus, setFocus] = createSignal(false);

// #taskArena is vanilla DOM, so it is blurred imperatively (see test/test-ui);
// the Solid-owned OutOfFocusWarning and StartGate read these signals.
const outOfFocusTimeouts: (number | NodeJS.Timeout)[] = [];
export type TestFocusState = "focused" | "unfocused" | "unfocusedWindow";
export const [testFocusState, { setTestFocusState }] =
  createSignalWithSetters<TestFocusState>("focused")({
    setTestFocusState: (set, val: TestFocusState) => {
      if (val === "focused") {
        clearTimeouts(outOfFocusTimeouts);
        set(val);
      } else {
        // CP-083 — the warning appears after 1 s of lost focus.
        outOfFocusTimeouts.push(
          setTimeout(() => {
            set(val);
          }, 1000),
        );
      }
    },
  });

export const showOutOfFocusWarning = createMemo(
  () => getConfig.showOutOfFocusWarning && testFocusState() !== "focused",
);

export const [isTestInvalid, setIsTestInvalid] = createSignal(false);
export const [getLastResult, setLastResult] = createSignal<Omit<
  CompletedEvent,
  "hash" | "uid"
> | null>(null);

export const [
  getIncompleteTests,
  { push: pushIncompleteTest, reset: resetIncompleteTests },
] = createSignalWithSetters<IncompleteTest[]>([])({
  push: (set, val: IncompleteTest) => set((arr) => [...arr, val]),
  reset: (set) => set([]),
});
export const getRestartCount = createMemo(() => getIncompleteTests().length);
export const getIncompleteSeconds = createMemo(() =>
  getIncompleteTests().reduce((sum, test) => sum + test.seconds, 0),
);

/** CP-089 — "repeat test" replays the identical seeded sequence. */
export const [isRepeated, setIsRepeated] = createSignal(false);

export const [getLastSignedOutResult, setLastSignedOutResult] =
  createSignal<CompletedEvent | null>(null);

export const [isTestActive, setTestActive] = createSignal(false);
export const [isTestRestarting, setIsTestRestarting] = createSignal(false);

/**
 * TR-010 — the arena's four states, as a signal.
 *
 * This is the single source for both `#taskArena[data-state]` (written by
 * `test/test-ui.ts`) and the Solid components that need to re-render on it, so
 * the attribute and the components can never disagree. TR-059: it is a
 * *projection* of engine phase plus the two presentation-only sub-states, and
 * is never authoritative for anything the result payload is derived from.
 */
export type ArenaState =
  | "preStart"
  | "running"
  | "awaitingContinue"
  | "finished";

export const [getArenaState, setArenaState] =
  createSignal<ArenaState>("preStart");

/** Convenience for the components that only care about the pre-start case. */
export const isPreStart = (): boolean => getArenaState() === "preStart";

export const [
  getActiveTaskIndex,
  { set: setActiveTaskIndex, reset: resetActiveTaskIndex },
] = createSignalWithSetters<number>(0)({
  set: (set, val: number) => set(val),
  reset: (set) => set(0),
});

/**
 * Live test stats, rendered by the Solid live-stat displays (the mini and text
 * variants and the progress bar). The test engine is vanilla, so it pushes
 * plain numbers in here as it goes. `undefined` means "no data yet".
 */
export const [currentLiveStats, setCurrentLiveStats] = createStore<{
  /** CP-079 — responses per minute, wrong answers included. */
  tpm?: number;
  /** CP-080 — `floor(correct / answered * 100)`. */
  acc?: number;
  /** Whole seconds elapsed since the test started. */
  seconds?: number;
}>({});

export function resetLiveStats(): void {
  setCurrentLiveStats({ tpm: undefined, acc: undefined, seconds: undefined });
}
