/**
 * ME-184's coupling gate.
 *
 * ME-177 makes the server reject any result produced by an engine version it
 * cannot reproduce. The SPA is cached, so a user can hold a stale bundle across
 * a deploy — and ME-177 alone would then silently break result saving for them:
 * they would finish an eight-minute run and be told their result is invalid.
 *
 * ME-184's answer is that the `COMPATIBILITY_CHECK_HEADER` value MUST be bumped
 * in the **same commit** as any engine-semantics bump, so the client is told to
 * reload *before* it starts a test whose result would be thrown away. And,
 * verbatim:
 *
 *   "A CI check MUST fail when `packages/math-engine/package.json`'s version
 *    changes without the compatibility constant changing."
 *
 * This file is that check's data. `ENGINE_COMPATIBILITY_LEDGER` is an
 * **append-only** record of every `(engineVersion, compatibilityCheck)` pair
 * that has ever shipped. `__tests__/anticheat/engine-compatibility.spec.ts`
 * enforces four invariants over it, and CI runs that spec through
 * `pnpm test-be`:
 *
 *   1. `MATH_ENGINE_VERSION` equals `packages/math-engine/package.json`'s
 *      `version` — the gate is worthless if the constant can drift from the
 *      package it claims to describe;
 *   2. the ledger's last row names exactly `MATH_ENGINE_VERSION`, so bumping the
 *      package forces a new row;
 *   3. that row's `compatibilityCheck` equals the live `COMPATIBILITY_CHECK`;
 *   4. the mapping is **injective** — no two engine versions may share a
 *      compatibility number.
 *
 * Together, (2) + (4) + (3) are the gate: a new engine version needs a new row,
 * a new row needs a compatibility number no earlier row used, and that number
 * has to be the one the middleware is actually serving. There is no way to bump
 * the engine and leave `COMPATIBILITY_CHECK` alone that leaves the suite green.
 *
 * **Appending a row is the whole procedure for an engine bump.** Bump
 * `packages/math-engine/package.json`, bump `MATH_ENGINE_VERSION` and move the
 * old value to `PREVIOUS_MATH_ENGINE_VERSION` (both in
 * `packages/math-engine/src/version.ts`), bump `COMPATIBILITY_CHECK` in
 * `packages/contracts/src/index.ts`, then append the pair here. Never edit or
 * remove an existing row: the history is what makes (4) meaningful.
 */

import { COMPATIBILITY_CHECK } from "@croco-calc/contracts";
import { MATH_ENGINE_VERSION } from "@croco-calc/math-engine";

export type EngineCompatibilityRow = {
  /** `packages/math-engine/package.json` `version` at the time of the bump. */
  engineVersion: string;
  /** The `COMPATIBILITY_CHECK` shipped alongside it. */
  compatibilityCheck: number;
};

/**
 * Append-only. The last row is the current pairing.
 *
 * `6` is monkeytype's inherited value, carried unchanged into croco calc's first
 * release: the engine is new, but no croco calc client has ever cached an older
 * one, so there is nothing to force a reload past.
 */
export const ENGINE_COMPATIBILITY_LEDGER: readonly EngineCompatibilityRow[] = [
  { engineVersion: "1.0.0", compatibilityCheck: 6 },
] as const;

/** The pairing this build ships. */
export const CURRENT_ENGINE_COMPATIBILITY: EngineCompatibilityRow =
  ENGINE_COMPATIBILITY_LEDGER[
    ENGINE_COMPATIBILITY_LEDGER.length - 1
  ] as EngineCompatibilityRow;

export type CompatibilityViolation = {
  code:
    | "engine-version-not-in-ledger"
    | "compatibility-check-not-bumped"
    | "compatibility-check-reused";
  message: string;
};

/**
 * The gate, as a pure function so it can be asserted from a test **and** called
 * from a script without duplicating the rules.
 *
 * @param packageVersion `packages/math-engine/package.json` `version`.
 * @returns every violation, empty when the coupling holds.
 */
export function checkEngineCompatibilityLedger(
  packageVersion: string,
): CompatibilityViolation[] {
  const violations: CompatibilityViolation[] = [];

  if (CURRENT_ENGINE_COMPATIBILITY.engineVersion !== packageVersion) {
    violations.push({
      code: "engine-version-not-in-ledger",
      message:
        `packages/math-engine is at ${packageVersion} but the last ` +
        `ENGINE_COMPATIBILITY_LEDGER row is ${CURRENT_ENGINE_COMPATIBILITY.engineVersion}. ` +
        `ME-184: append { engineVersion: "${packageVersion}", compatibilityCheck: <new> } ` +
        `and bump COMPATIBILITY_CHECK in the same commit.`,
    });
  }

  if (CURRENT_ENGINE_COMPATIBILITY.compatibilityCheck !== COMPATIBILITY_CHECK) {
    violations.push({
      code: "compatibility-check-not-bumped",
      message:
        `COMPATIBILITY_CHECK is ${COMPATIBILITY_CHECK} but the ledger records ` +
        `${CURRENT_ENGINE_COMPATIBILITY.compatibilityCheck} for engine ` +
        `${CURRENT_ENGINE_COMPATIBILITY.engineVersion} (ME-184).`,
    });
  }

  const seen = new Map<number, string>();
  for (const row of ENGINE_COMPATIBILITY_LEDGER) {
    const previous = seen.get(row.compatibilityCheck);
    if (previous !== undefined) {
      violations.push({
        code: "compatibility-check-reused",
        message:
          `compatibilityCheck ${row.compatibilityCheck} is claimed by both ` +
          `${previous} and ${row.engineVersion}. ME-184 requires a bump per ` +
          `engine version, or cached clients are never told to reload.`,
      });
    }
    seen.set(row.compatibilityCheck, row.engineVersion);
  }

  return violations;
}

/** Convenience for the common call site: the engine's own reported version. */
export function checkEngineCompatibility(): CompatibilityViolation[] {
  return checkEngineCompatibilityLedger(MATH_ENGINE_VERSION);
}
