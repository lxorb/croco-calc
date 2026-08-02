/**
 * The countdown (CP-073 … CP-077, CP-189).
 *
 * croco calc is time-limited only, so the upstream length/passage/zen branches and
 * its `time = 0` infinite mode are gone. What is kept is the drift-corrected
 * scheduling: each tick is scheduled against the *absolute* start time rather
 * than by chaining `setInterval`, so an 8-minute test does not accumulate the
 * timer's own lateness.
 *
 * The timer starts on the first accepted input symbol and never on page
 * load, focus, or restart (CP-075) — `TestLogic` is the only caller of
 * {@link start}, and it calls it from the same event that lifts the pre-start
 * blur (CP-049).
 */

import { setCurrentLiveStats } from "../states/test";
import { qs } from "../utils/dom";
import { logTestEvent } from "./events/data";
import type { TestEngine } from "./test-engine";

let handle: ReturnType<typeof setTimeout> | undefined;
let debug = false;
let ticks = 0;
let worstDriftMs = 0;

export function enableTimerDebug(): void {
  debug = !debug;
  console.log(`Timer debug ${debug ? "enabled" : "disabled"}`);
}

export function getTimerStats(): { ticks: number; worstDriftMs: number } {
  return { ticks, worstDriftMs };
}

/** CP-189 — the remaining seconds are exposed on the timer element. */
function publish(engine: TestEngine): void {
  const { elapsedSeconds, remainingSeconds, correct, answered } =
    engine.snapshot();

  setCurrentLiveStats({
    seconds: elapsedSeconds,
    // CP-079 — answered tasks per elapsed minute, wrong answers included.
    tpm: elapsedSeconds > 0 ? answered / (elapsedSeconds / 60) : 0,
    // CP-080 — floor(correct / answered * 100); 100 % with nothing answered.
    acc: answered === 0 ? 100 : Math.floor((correct / answered) * 100),
  });

  for (const el of document.querySelectorAll<HTMLElement>("[data-timer]")) {
    el.dataset["secondsRemaining"] = String(remainingSeconds);
  }
  qs("#tasks")?.native.setAttribute(
    "data-seconds-remaining",
    String(remainingSeconds),
  );
}

export function stop(): void {
  if (handle !== undefined) {
    clearTimeout(handle);
    handle = undefined;
  }
}

export function reset(engine?: TestEngine): void {
  stop();
  ticks = 0;
  worstDriftMs = 0;
  setCurrentLiveStats({ seconds: 0, tpm: 0, acc: 100 });
  if (engine !== undefined) publish(engine);
}

/**
 * Runs the countdown until the duration expires, then calls `onFinish` once.
 * The engine decides when the test is over — this module only supplies the clock.
 */
export function start(engine: TestEngine, onFinish: () => void): void {
  stop();
  const startedAt = engine.startedAt();
  if (startedAt === undefined) return;

  logTestEvent("timer", performance.now(), { event: "start" });

  const step = (): void => {
    const now = performance.now();
    const finished = engine.tick(now);
    const { elapsedSeconds } = engine.snapshot();

    ticks++;
    const drift = Math.abs(now - startedAt - elapsedSeconds * 1000);
    if (drift > worstDriftMs) worstDriftMs = drift;
    if (debug) {
      console.debug(
        `timer tick ${elapsedSeconds}s drift ${drift.toFixed(1)}ms`,
      );
    }

    publish(engine);

    if (finished) {
      logTestEvent("timer", now, { event: "end", seconds: elapsedSeconds });
      handle = undefined;
      onFinish();
      return;
    }

    logTestEvent("timer", now, { event: "tick", seconds: elapsedSeconds });

    // Schedule against the absolute start so lateness never accumulates.
    const nextBoundary = startedAt + (elapsedSeconds + 1) * 1000;
    handle = setTimeout(step, Math.max(0, nextBoundary - performance.now()));
  };

  handle = setTimeout(step, Math.max(0, startedAt + 1000 - performance.now()));
}
