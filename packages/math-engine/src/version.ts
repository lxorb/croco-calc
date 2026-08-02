/**
 * Engine version and client compatibility (ME-177, ME-184).
 *
 * ME-177: server-side revalidation MUST run against the same engine version the
 * client used, so the result payload carries this string and the server rejects
 * versions it cannot reproduce.
 *
 * ME-184: any change to **generation, mixing or judging** semantics MUST bump
 * this value *and*, in the same commit, the value returned to the
 * `COMPATIBILITY_CHECK_HEADER` (`backend/src/middlewares/compatibilityCheck.ts`),
 * so a client on a stale cached bundle is told to reload **before** it finishes a
 * test whose result would be rejected. Cosmetic-looking changes count: operator
 * glyphs feed `prompt`, which ME-174 verifies.
 *
 * The rollout window accepts exactly two versions — `current` and `current - 1` —
 * and anything older gets a distinct code so the client can show "please reload"
 * rather than "result invalid".
 */

/** MUST equal `packages/math-engine/package.json` `version`. */
export const MATH_ENGINE_VERSION = "1.0.0";

/**
 * The one older version still accepted during a rollout. `null` on the first
 * release. When bumping `MATH_ENGINE_VERSION`, move the old value here.
 */
export const PREVIOUS_MATH_ENGINE_VERSION: string | null = null;

export const SUPPORTED_ENGINE_VERSIONS: readonly string[] =
  PREVIOUS_MATH_ENGINE_VERSION === null
    ? [MATH_ENGINE_VERSION]
    : [MATH_ENGINE_VERSION, PREVIOUS_MATH_ENGINE_VERSION];

export type EngineVersionStatus =
  /** Same version the server runs — revalidate normally. */
  | "current"
  /** One version behind, still inside the rollout window. */
  | "stale-but-supported"
  /** Too old (or unknown) to reproduce — tell the client to reload. */
  | "unsupported";

export function checkEngineVersion(submitted: string): EngineVersionStatus {
  if (submitted === MATH_ENGINE_VERSION) return "current";
  if (
    PREVIOUS_MATH_ENGINE_VERSION !== null &&
    submitted === PREVIOUS_MATH_ENGINE_VERSION
  ) {
    return "stale-but-supported";
  }
  return "unsupported";
}
