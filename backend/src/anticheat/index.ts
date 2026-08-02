/**
 * croco calc's anti-cheat layer.
 *
 * monkeytype shipped a **stub** here: one environment variable made
 * `implemented()` return `true` while both validators unconditionally returned
 * `true`, because the real module is closed-source. That stub is gone, escape
 * hatch and all — DoD-04a's grep for its name must find nothing anywhere in the
 * repo, so the name is not repeated here either. croco calc's math engine is
 * deterministic and seeded, so the server can simply regenerate the whole test
 * and check it.
 *
 * Two layers, both required (WP-10 brief):
 *
 *  1. **Regeneration** — ME-174: rebuild tasks `0 … n-1` from
 *     `(mathSeed, mathSettings)` and assert every logged prompt, expected answer
 *     and verdict reproduces. Gated by ME-177/ME-184's engine-version window.
 *  2. **Plausibility** — ME-179 … ME-182: a tasks-per-minute ceiling, an
 *     inter-answer floor with a false-positive band, a median-interval floor, and
 *     `testDuration`/`timestamp` agreement.
 *
 * ME-183 is binding and is the direct lesson of BL-5: **no code path in this
 * directory reads `acc`**. A math trainer legitimately scores 40-70 %, and
 * accuracy carries no cheat signal whatsoever. The keystroke-biometric checks
 * monkeytype ran (`validateKeys`, `keySpacingStats`, `keyDurationStats`) have no
 * counterpart here and are deleted rather than stubbed (A-13).
 *
 * The `objectHash` check and the duplicate-hash check stay in the controller,
 * on top of this (ME-175).
 */

import {
  checkEngineVersion,
  checkPlausibility,
  revalidateResult,
  MAX_PLAUSIBLE_TPM,
  TASK_LOG_TOOLONG,
  type MathSettings,
  type PlausibilityViolation,
  type RevalidationFailure,
} from "@croco-calc/math-engine";
import { CompletedEvent } from "@croco-calc/schemas/results";

/**
 * The two rejection codes the contract reserves for this layer
 * (`packages/contracts/src/results.ts`). ME-184 requires the version rejection to
 * be **distinct** so the client can say "please reload" instead of
 * "result invalid".
 */
export const ANTICHEAT_STATUS = {
  /** The task log does not reproduce from `(mathSeed, mathSettings)`. */
  TASK_LOG_INVALID: 467,
  /** ME-177 / ME-184 — an engine version the server cannot reproduce. */
  ENGINE_VERSION_UNSUPPORTED: 468,
} as const;

export type AntiCheatFailureCode =
  | "engine-version-unsupported"
  | "task-log-invalid"
  | "implausible";

export type AntiCheatFailure = {
  code: AntiCheatFailureCode;
  /** HTTP status to reject with. */
  status: number;
  /** User-facing message. */
  message: string;
  /**
   * Structured detail for `addLog` — every threshold that fires is logged **with
   * the offending value** (ME §17.1), never silently dropped.
   */
  details: Record<string, unknown>;
};

export type AntiCheatVerdict =
  | { valid: true }
  | { valid: false; failure: AntiCheatFailure };

export type ValidateResultInput = {
  mathSeed: number;
  mathSettings: MathSettings;
  engineVersion: string;
  taskLog: CompletedEvent["taskLog"];
  testDuration: number;
  timestamp: number;
  /**
   * Committed task count. Only consulted on ME-176's `"toolong"` path, where the
   * entries themselves are gone.
   */
  answered: number;
  /** Server clock at validation time, epoch ms. Injected so tests are stable. */
  serverNow: number;
};

/**
 * Runs both layers and returns the **first** failing one, with everything that
 * fired inside it. Regeneration runs first: a mismatch there is unambiguous
 * evidence, whereas a plausibility violation is a heuristic.
 */
export function validateResult(input: ValidateResultInput): AntiCheatVerdict {
  // -- ME-177 / ME-184: the engine-version window ---------------------------
  //
  // Checked before anything else so a user on a stale cached bundle is told to
  // reload rather than being accused of forging a log they generated honestly.
  if (checkEngineVersion(input.engineVersion) === "unsupported") {
    return {
      valid: false,
      failure: {
        code: "engine-version-unsupported",
        status: ANTICHEAT_STATUS.ENGINE_VERSION_UNSUPPORTED,
        message:
          "Your version of croco calc is out of date. Please refresh the page and try again.",
        details: { engineVersion: input.engineVersion },
      },
    };
  }

  // -- Layer 1, ME-174: full regeneration ----------------------------------
  const revalidation = revalidateResult({
    mathSeed: input.mathSeed,
    mathSettings: input.mathSettings,
    taskLog:
      input.taskLog === TASK_LOG_TOOLONG
        ? TASK_LOG_TOOLONG
        : [...input.taskLog],
    engineVersion: input.engineVersion,
    committedCount: input.answered,
  });

  if (!revalidation.ok) {
    return {
      valid: false,
      failure: {
        code: "task-log-invalid",
        status: ANTICHEAT_STATUS.TASK_LOG_INVALID,
        message: "Result data doesn't make sense",
        details: {
          checked: revalidation.checked,
          sampled: revalidation.sampled,
          // Cap the payload: a forged run can fail on every one of a thousand
          // entries and the log document has to stay readable.
          failures: revalidation.failures.slice(0, 10),
          failureCount: revalidation.failures.length,
        },
      },
    };
  }

  // -- Layer 2, ME-179 … ME-182: plausibility ------------------------------
  const violations = checkAllPlausibility(input);
  if (violations.length > 0) {
    return {
      valid: false,
      failure: {
        code: "implausible",
        status: ANTICHEAT_STATUS.TASK_LOG_INVALID,
        message: "Result data doesn't make sense",
        details: { violations },
      },
    };
  }

  return { valid: true };
}

function checkAllPlausibility(
  input: ValidateResultInput,
): PlausibilityViolation[] {
  if (input.taskLog !== TASK_LOG_TOOLONG) {
    return checkPlausibility({
      taskLog: input.taskLog,
      testDuration: input.testDuration,
      timestamp: input.timestamp,
      serverNow: input.serverNow,
      settings: input.mathSettings,
    }).violations;
  }

  // ME-176's degraded path: the per-task timings are gone, so the interval
  // checks cannot run. The tpm ceiling still can, from the committed count —
  // and in practice always fires, because >1000 tasks inside the longest
  // possible run (480 s) is already >120 tpm.
  const minutes = input.testDuration / 60;
  const tpm = minutes > 0 ? input.answered / minutes : 0;
  const violations: PlausibilityViolation[] = [];
  if (tpm > MAX_PLAUSIBLE_TPM) {
    violations.push({
      code: "tpm-too-high",
      message: `tasksPerMinute ${tpm} exceeds the ceiling of ${MAX_PLAUSIBLE_TPM} (ME-179)`,
      value: tpm,
    });
  }
  return violations;
}

export type { PlausibilityViolation, RevalidationFailure };
