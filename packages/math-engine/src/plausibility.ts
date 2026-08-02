/**
 * Anti-cheat plausibility thresholds (ME-179 … ME-183).
 *
 * These are the concrete numbers behind INV-148's "tasks-per-minute ceiling,
 * minimum inter-answer interval, `testDuration` vs `timestamp` agreement".
 * Every threshold that fires is reported **with the offending value** — never
 * silently dropped.
 *
 * ME-183 is binding: this layer MUST NOT read `acc` in any form. BL-5 exists
 * because an accuracy floor silently deleted genuine runs, and a math trainer's
 * accuracy carries no cheat signal at all.
 */

import { roundTo2 } from "./metrics";
import type { MathSettings, TaskLogEntry } from "./types";

/**
 * ME-179. The cheapest possible task is a 2-operand `+100` addition with a 1-3
 * digit answer; 120 tpm is a sustained 0.5 s per task over a 60-480 s run, which
 * is already above any demonstrated human rate and leaves >= 2x headroom over
 * the fastest plausible real user (~50-60 tpm on `+100` only).
 */
export const MAX_PLAUSIBLE_TPM = 120;

/** ME-180 — below documented simple-reaction-plus-keystroke floors. */
export const MIN_INTER_ANSWER_MS = 150;

/** ME-180 — a *pattern* of sub-threshold intervals is machine input; one is not. */
export const MAX_SUBTHRESHOLD_FRACTION = 0.05;

/** ME-181 — catches a uniformly fast forged log that ME-180's 5 % band lets through. */
export const MAX_MEDIAN_INTERVAL_FLOOR_MS = 300;

/** ME-182 — croco calc has only fixed-duration tests, so drift is bounded. */
export const MAX_DURATION_DRIFT_MS = 2000;

/** ME-182(c) — no result claiming to have finished more than 5 minutes early. */
export const MAX_SUBMISSION_LAG_MS = 300_000;

/** ME-182(c) — no result from the future beyond one minute of clock skew. */
export const MAX_CLOCK_SKEW_MS = 60_000;

/** ME-181 — the median is not meaningful below this many committed tasks. */
export const MEDIAN_CHECK_MIN_TASKS = 10;

export type PlausibilityViolationCode =
  | "tpm-too-high"
  | "inter-answer-too-fast"
  | "median-interval-too-low"
  | "duration-mismatch"
  | "log-overruns-duration"
  | "negative-start"
  | "timestamp-out-of-window";

export type PlausibilityViolation = {
  code: PlausibilityViolationCode;
  /** Human-readable, and always contains the offending value verbatim. */
  message: string;
  /** The offending value, for structured logging. */
  value: number;
};

export type PlausibilityInput = {
  /** Committed tasks only (ME-159). */
  taskLog: readonly TaskLogEntry[];
  /** Seconds. MUST equal `settings.time * 60` (ME-182a). */
  testDuration: number;
  /** Client-claimed completion time, epoch ms. */
  timestamp: number;
  /** Server clock at validation time, epoch ms. */
  serverNow: number;
  settings: MathSettings;
};

export type PlausibilityResult = {
  ok: boolean;
  violations: PlausibilityViolation[];
  /** The tpm the check derived from the log, for logging alongside a rejection. */
  tpm: number;
};

/** `delta_i = tEnd_i - tEnd_(i-1)`, with `tEnd_(-1) = 0` (ME-180). */
export function interAnswerIntervals(
  taskLog: readonly TaskLogEntry[],
): number[] {
  const deltas: number[] = [];
  let previousEnd = 0;
  for (const entry of taskLog) {
    deltas.push(entry.tEnd - previousEnd);
    previousEnd = entry.tEnd;
  }
  return deltas;
}

function medianOf(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? (sorted[mid] as number)
    : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

/**
 * Runs every ME-179 … ME-182 check. Returns all violations rather than the first
 * one, so a rejection can be logged in full.
 */
export function checkPlausibility(
  input: PlausibilityInput,
): PlausibilityResult {
  const { taskLog, testDuration, timestamp, serverNow, settings } = input;
  const violations: PlausibilityViolation[] = [];

  // -- ME-179: tasks-per-minute ceiling ------------------------------------
  const minutes = testDuration / 60;
  const tpm = minutes > 0 ? roundTo2(taskLog.length / minutes) : 0;
  if (tpm > MAX_PLAUSIBLE_TPM) {
    violations.push({
      code: "tpm-too-high",
      message: `tasksPerMinute ${tpm} exceeds the ceiling of ${MAX_PLAUSIBLE_TPM} (ME-179)`,
      value: tpm,
    });
  }

  // -- ME-180: minimum inter-answer interval -------------------------------
  const deltas = interAnswerIntervals(taskLog);
  const subThreshold = deltas.filter((d) => d < MIN_INTER_ANSWER_MS).length;
  // A single sub-threshold interval MUST NOT reject: double-commit and key
  // repeat produce isolated ones. The 5 % band and the 2-interval minimum are
  // the false-positive guard demanded by the BL-5 lesson.
  if (
    subThreshold >= 2 &&
    deltas.length > 0 &&
    subThreshold / deltas.length > MAX_SUBTHRESHOLD_FRACTION
  ) {
    violations.push({
      code: "inter-answer-too-fast",
      message: `${subThreshold} of ${deltas.length} inter-answer intervals are below ${MIN_INTER_ANSWER_MS} ms (ME-180)`,
      value: subThreshold,
    });
  }

  // -- ME-181: median interval floor ---------------------------------------
  if (taskLog.length >= MEDIAN_CHECK_MIN_TASKS) {
    const median = medianOf(deltas);
    if (median < MAX_MEDIAN_INTERVAL_FLOOR_MS) {
      violations.push({
        code: "median-interval-too-low",
        message: `median inter-answer interval ${median} ms is below ${MAX_MEDIAN_INTERVAL_FLOOR_MS} ms (ME-181)`,
        value: median,
      });
    }
  }

  // -- ME-182(a): testDuration is exactly time * 60 ------------------------
  const expectedDuration = settings.time * 60;
  if (testDuration !== expectedDuration) {
    violations.push({
      code: "duration-mismatch",
      message: `testDuration ${testDuration} !== settings.time * 60 (${expectedDuration}) (ME-182a)`,
      value: testDuration,
    });
  }

  // -- ME-182(b): the log fits inside the test -----------------------------
  const lastEnd =
    taskLog.length > 0 ? (taskLog[taskLog.length - 1] as TaskLogEntry).tEnd : 0;
  const ceiling = testDuration * 1000 + MAX_DURATION_DRIFT_MS;
  if (lastEnd > ceiling) {
    violations.push({
      code: "log-overruns-duration",
      message: `last tEnd ${lastEnd} ms exceeds ${ceiling} ms (ME-182b)`,
      value: lastEnd,
    });
  }
  const firstStart =
    taskLog.length > 0 ? (taskLog[0] as TaskLogEntry).tStart : 0;
  if (firstStart < 0) {
    violations.push({
      code: "negative-start",
      message: `first tStart ${firstStart} ms is negative (ME-182b)`,
      value: firstStart,
    });
  }

  // -- ME-182(c): the timestamp window -------------------------------------
  const floor = serverNow - testDuration * 1000 - MAX_SUBMISSION_LAG_MS;
  const cap = serverNow + MAX_CLOCK_SKEW_MS;
  if (timestamp < floor || timestamp > cap) {
    violations.push({
      code: "timestamp-out-of-window",
      message: `timestamp ${timestamp} is outside [${floor}, ${cap}] (ME-182c)`,
      value: timestamp,
    });
  }

  return { ok: violations.length === 0, violations, tpm };
}
