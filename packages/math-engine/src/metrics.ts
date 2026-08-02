/**
 * Result metrics owned by the math engine (ME-160 … ME-165), with the field
 * names ruled by C40 and AC-001 … AC-006: `correct`, `wrong`, `score`, `acc`,
 * `tpm`, `spm`. The identifier `net` appears nowhere.
 *
 * `roundTo2` and `kogasa` are transcribed verbatim from
 * `packages/util/src/numbers.ts` rather than imported, so this package stays
 * dependency-free (ME-002) — `numbers.ts` pins the platform's unseeded generator
 * at module scope and ME-166 bans that symbol here. The formulas are
 * identical, which is what keeps the results page, the charts and the about-page
 * wording honest (C5).
 */

import type { TaskLogEntry } from "./types";

/** Verbatim from `packages/util/src/numbers.ts` `roundTo2`. */
export function roundTo2(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

/**
 * Verbatim from `packages/util/src/numbers.ts` `kogasa`: maps a coefficient of
 * variation from `[0, +inf)` onto `(0, 100]`.
 */
export function kogasa(cov: number): number {
  return (
    100 * (1 - Math.tanh(cov + Math.pow(cov, 3) / 3 + Math.pow(cov, 5) / 5))
  );
}

export type MathMetrics = {
  /** ME-160 — task-log entries with `correct === true`. */
  correct: number;
  /** ME-160 — task-log entries with `correct === false`. */
  wrong: number;
  /** ME-161 / C40 — the headline metric, `correct - wrong`. MAY be negative. */
  score: number;
  /** ME-162 / AC-004 — `correct / (correct + wrong) * 100`, or 0 when nothing was answered. */
  acc: number;
  /** ME-163 / AC-005 — responses per minute, wrong answers included. */
  tpm: number;
  /** AC-006 — score per minute, so runs of different durations share an axis. */
  spm: number;
  /** ME-165 / C5 — kogasa over the CV of per-task response times. */
  consistency: number;
};

/**
 * @param taskLog committed tasks only — a task partially answered when the timer
 * expires is discarded and never appears here (ME-157, E31).
 * @param testDurationSeconds `mathSettings.time * 60`.
 */
export function computeMetrics(
  taskLog: readonly TaskLogEntry[],
  testDurationSeconds: number,
): MathMetrics {
  let correct = 0;
  for (const entry of taskLog) if (entry.correct) correct++;
  const answered = taskLog.length;
  const wrong = answered - correct;
  const score = correct - wrong;

  // ME-162 / E32 / C6: stored as 0 when nothing was answered; the results page
  // displays `-` in that case (CP-103).
  const acc = answered === 0 ? 0 : roundTo2((correct / answered) * 100);

  const minutes = testDurationSeconds / 60;
  const tpm = minutes > 0 ? roundTo2(answered / minutes) : 0;
  const spm = minutes > 0 ? roundTo2(score / minutes) : 0;

  return {
    correct,
    wrong,
    score,
    acc,
    tpm,
    spm,
    consistency: consistencyOf(taskLog),
  };
}

/**
 * ME-165 — monkeytype's `kogasa` transform applied to the coefficient of
 * variation of the per-task response times (`tEnd - tStart`, ME-159).
 * Fewer than two answered tasks has no meaningful variance, so it reports 0
 * (the results page renders `-` there, CP-107/C5).
 */
export function consistencyOf(taskLog: readonly TaskLogEntry[]): number {
  if (taskLog.length < 2) return 0;
  const times = taskLog.map((entry) => entry.tEnd - entry.tStart);
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  if (mean === 0) return 0;
  const variance =
    times.reduce((acc, t) => acc + (t - mean) * (t - mean), 0) / times.length;
  return roundTo2(kogasa(Math.sqrt(variance) / mean));
}
