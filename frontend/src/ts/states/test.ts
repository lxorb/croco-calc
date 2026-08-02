/**
 * Reactive test state (WP-06).
 *
 * The engine (`test/test-engine.ts`) owns the authoritative state; this module
 * mirrors the parts Solid components need to re-render on, as plain numbers and
 * booleans. Nothing here holds a `Task`, so master C29 cannot be violated
 * through a signal.
 *
 * Cut relative to monkeytype: quotes, challenges, keymap/layout resources,
 * IME composition, RTL/Korean flags, `bailedOut` (master C38) and the pace
 * caret (CP-071).
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

// #tasks is vanilla DOM, so it is blurred imperatively (see test/test-ui);
// the Solid-owned OutOfFocusWarning and PreStartHint read these signals.
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

// max-height of the warning, kept in sync with the tasks wrapper by test-ui.
export const [outOfFocusMaxHeight, setOutOfFocusMaxHeight] = createSignal<
  number | undefined
>(undefined);

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
 * CP-046 / CP-052 — true from page load and from every restart until the first
 * accepted input character reveals the stream.
 */
export const [isPreStart, setPreStart] = createSignal(true);

export const [
  getActiveTaskIndex,
  { set: setActiveTaskIndex, reset: resetActiveTaskIndex },
] = createSignalWithSetters<number>(0)({
  set: (set, val: number) => set(val),
  reset: (set) => set(0),
});

/**
 * Length of the live answer buffer. The **contents** deliberately do not live
 * in a signal — the rendered `<letter>` elements are the display, and the
 * engine is the source of truth (C29 keeps everything else private).
 */
export const [getAnswerLength, setAnswerLength] = createSignal(0);

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
