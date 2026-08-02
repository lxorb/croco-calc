/**
 * Derived live-stat text (CP-073 … CP-081).
 *
 * Every branch for word-count / quote / zen / custom mode is gone — croco calc
 * is time-limited only (CP-073) — which is what collapses monkeytype's
 * `live-stats.ts` to this. Live burst is removed (CP-078); the live readouts
 * are the timer, live **acc** and live **tpm** (master C13).
 */

import { createMemo } from "solid-js";

import { getConfig } from "../config/store";
import { secondsToString } from "../utils/date-and-time";
import { currentLiveStats, getFocus, isTestActive } from "./test";

/** Seconds the test counts down from — CP-073, `time` is minutes (C31). */
function getTestTimeLimit(): number {
  return getConfig.time * 60;
}

/**
 * CP-076 — the fixed full-width progress bar at the top of the viewport.
 * Unchanged arithmetic: it empties left-to-right over the test duration.
 */
export function getBarTarget(): {
  width: string;
  duration: number;
  ease?: string;
} {
  const { seconds } = currentLiveStats;
  const limit = getTestTimeLimit();
  if (seconds === undefined || limit === 0) {
    return { width: "100vw", duration: 0 };
  }
  return {
    width: `${100 - ((seconds + 1) / limit) * 100}vw`,
    duration: 1000,
    ease: "linear",
  };
}

/** CP-081 — live stats show only while the test is running and focused. */
export const showLiveStats = createMemo(() => isTestActive() && getFocus());

/** CP-079 — live tpm, displayed as an integer. */
export const getLiveSpeedText = createMemo(() =>
  Math.floor(currentLiveStats.tpm ?? 0).toString(),
);

/** CP-080 — live acc, `NN%`, `100%` with nothing answered yet. */
export const getLiveAccText = createMemo(
  () => `${Math.floor(currentLiveStats.acc ?? 100)}%`,
);

/** CP-074 — the countdown, `m:ss` above 60 s. */
export const getTimerText = createMemo(() => {
  const limit = getTestTimeLimit();
  const seconds = currentLiveStats.seconds ?? 0;
  return secondsToString(limit === 0 ? seconds : limit - seconds);
});

/** CP-189 — the raw remaining seconds, for the `data-seconds-remaining` hook. */
export const getSecondsRemaining = createMemo(() =>
  Math.max(0, getTestTimeLimit() - (currentLiveStats.seconds ?? 0)),
);

/**
 * CP-076 — the two flash styles only reveal the time every 15 seconds.
 */
export const isTimerFlashHidden = createMemo(() => {
  const isFlashStyle =
    getConfig.timerStyle === "flash_mini" ||
    getConfig.timerStyle === "flash_text";
  if (!isFlashStyle) return false;
  return (getTestTimeLimit() - (currentLiveStats.seconds ?? 0)) % 15 !== 0;
});
