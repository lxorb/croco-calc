/**
 * Server-side revalidation (ME-173 … ME-177).
 *
 * The central anti-cheat primitive: the whole task sequence is recomputable from
 * `(mathSeed, mathSettings)` alone (ME-171), so the server regenerates it and
 * checks every logged entry against the regenerated task.
 *
 * ME-175: this sits **on top of** monkeytype's existing `objectHash` anti-cheat
 * and duplicate-hash check (`backend/src/api/controllers/result.ts`), it does not
 * replace them.
 */

import { generateSequence } from "./generate";
import { judgeAnswer } from "./judge";
import type { MathSettings, TaskLogEntry } from "./types";
import { checkEngineVersion } from "./version";

/**
 * ME-176 — the `"toolong"` degradation, following the existing precedent for
 * `keyDuration` / `keySpacing` (`packages/schemas/src/results.ts`).
 */
export const TASK_LOG_TOOLONG = "toolong";
export const TASK_LOG_MAX_ENTRIES = 1000;
export const TASK_LOG_SAMPLE_SIZE = 50;

export type SerializedTaskLog = TaskLogEntry[] | typeof TASK_LOG_TOOLONG;

/** ME-176 — replaces an oversized log with the literal `"toolong"`. */
export function serializeTaskLog(
  taskLog: readonly TaskLogEntry[],
): SerializedTaskLog {
  return taskLog.length > TASK_LOG_MAX_ENTRIES
    ? TASK_LOG_TOOLONG
    : [...taskLog];
}

/**
 * ME-176 — the deterministic 50-index sample. Evenly spaced so it spans the whole
 * run, and derived only from `count`, so the client cannot influence which
 * indices are checked.
 */
export function sampleIndices(
  count: number,
  sampleSize = TASK_LOG_SAMPLE_SIZE,
): number[] {
  if (count <= 0) return [];
  const size = Math.min(sampleSize, count);
  const indices: number[] = [];
  for (let i = 0; i < size; i++) {
    indices.push(Math.floor((i * count) / size));
  }
  return indices;
}

export type RevalidationFailureCode =
  | "engine-version-unsupported"
  | "prompt-mismatch"
  | "answer-mismatch"
  | "judgement-mismatch"
  | "index-mismatch"
  | "kind-mismatch"
  | "regeneration-failed";

export type RevalidationFailure = {
  code: RevalidationFailureCode;
  index: number;
  message: string;
};

export type RevalidationInput = {
  mathSeed: number;
  mathSettings: MathSettings;
  taskLog: SerializedTaskLog;
  /** ME-177 — the engine version the client generated with. */
  engineVersion: string;
  /**
   * Number of tasks the run actually committed. Required when `taskLog` is
   * `"toolong"`; ignored otherwise.
   */
  committedCount?: number;
};

export type RevalidationResult = {
  ok: boolean;
  failures: RevalidationFailure[];
  /** How many log entries were actually cross-checked. */
  checked: number;
  /** True when ME-176's degraded path ran instead of a full check. */
  sampled: boolean;
};

/**
 * ME-174 — regenerates tasks `0 … n-1` and asserts, for every logged entry:
 * the regenerated prompt equals the logged `prompt`, the regenerated exact
 * answer equals the logged `expected`, and re-judging the logged `given`
 * reproduces the logged `correct` flag. Any mismatch rejects the result, in the
 * same manner as the existing hash mismatch.
 */
export function revalidateResult(input: RevalidationInput): RevalidationResult {
  const failures: RevalidationFailure[] = [];

  // ME-177 / ME-184 — a version we cannot reproduce is rejected with its own
  // code so the client can show "please reload" rather than "result invalid".
  if (checkEngineVersion(input.engineVersion) === "unsupported") {
    return {
      ok: false,
      checked: 0,
      sampled: false,
      failures: [
        {
          code: "engine-version-unsupported",
          index: -1,
          message: `engine version ${input.engineVersion} cannot be reproduced by the server (ME-177)`,
        },
      ],
    };
  }

  if (input.taskLog === TASK_LOG_TOOLONG) {
    return revalidateSampled(input, failures);
  }

  const log = input.taskLog;
  let regenerated;
  try {
    regenerated = generateSequence(
      input.mathSeed,
      input.mathSettings,
      log.length,
    );
  } catch (error) {
    return {
      ok: false,
      checked: 0,
      sampled: false,
      failures: [
        {
          code: "regeneration-failed",
          index: -1,
          message: `could not regenerate the sequence: ${String(error)}`,
        },
      ],
    };
  }

  for (let i = 0; i < log.length; i++) {
    const entry = log[i] as TaskLogEntry;
    const task = regenerated[i];
    if (task === undefined) continue;

    if (entry.i !== i) {
      failures.push({
        code: "index-mismatch",
        index: i,
        message: `logged index ${entry.i} !== position ${i}`,
      });
      continue;
    }
    if (entry.kind !== task.kind) {
      failures.push({
        code: "kind-mismatch",
        index: i,
        message: `logged kind ${entry.kind} !== regenerated ${task.kind}`,
      });
    }
    if (entry.prompt !== task.prompt) {
      failures.push({
        code: "prompt-mismatch",
        index: i,
        message: `logged prompt ${JSON.stringify(entry.prompt)} !== regenerated ${JSON.stringify(task.prompt)}`,
      });
    }
    if (entry.expected !== task.answerDisplay) {
      failures.push({
        code: "answer-mismatch",
        index: i,
        message: `logged expected ${JSON.stringify(entry.expected)} !== regenerated ${JSON.stringify(task.answerDisplay)}`,
      });
    }
    if (judgeAnswer(task.answer, entry.given) !== entry.correct) {
      failures.push({
        code: "judgement-mismatch",
        index: i,
        message: `re-judging ${JSON.stringify(entry.given)} does not reproduce correct=${entry.correct}`,
      });
    }
  }

  return {
    ok: failures.length === 0,
    failures,
    checked: log.length,
    sampled: false,
  };
}

/**
 * ME-176's degraded path.
 *
 * NOTE (reported to WP-10): with `"toolong"` the entries themselves are gone, so
 * there is nothing to cross-check against — the only thing still verifiable is
 * that `(mathSeed, mathSettings)` regenerates cleanly at 50 deterministic
 * indices, which catches a corrupt seed/settings pair and an incompatible engine
 * build but cannot catch a forged log. This path is unreachable for any
 * plausible result anyway: `MAX_PLAUSIBLE_TPM` (120) over the longest run
 * (480 s) caps a legitimate log at 960 entries, below `TASK_LOG_MAX_ENTRIES`.
 */
function revalidateSampled(
  input: RevalidationInput,
  failures: RevalidationFailure[],
): RevalidationResult {
  const count = input.committedCount ?? 0;
  const indices = sampleIndices(count);
  if (indices.length === 0) {
    return { ok: failures.length === 0, failures, checked: 0, sampled: true };
  }

  // ME-125 chains task `i` to task `i-1`, so the canonical task at a sampled
  // index is only defined relative to the whole prefix. Regenerate the prefix
  // once rather than walking it again per sampled index.
  let regenerated;
  try {
    regenerated = generateSequence(input.mathSeed, input.mathSettings, count);
  } catch (error) {
    failures.push({
      code: "regeneration-failed",
      index: -1,
      message: `could not regenerate the sequence: ${String(error)}`,
    });
    return { ok: false, failures, checked: 0, sampled: true };
  }

  for (const index of indices) {
    if (regenerated[index] === undefined) {
      failures.push({
        code: "regeneration-failed",
        index,
        message: `no task was regenerated at sampled index ${index}`,
      });
    }
  }

  return {
    ok: failures.length === 0,
    failures,
    checked: indices.length,
    sampled: true,
  };
}
