import * as ConfigSchemas from "@croco-calc/schemas/configs";

import { getOptions } from "../utils/zod";

/**
 * Coupling, guards and cycle arithmetic for the eight settings-bar controls.
 *
 * Everything in this module is **pure**: it takes a config snapshot and returns
 * a value. `setConfig` (setters.ts) and the bar (TestConfig.tsx) are the only
 * things that commit the results, which is what lets SB-101, SB-102 and SB-103
 * share one predicate instead of three (master C36).
 */

/** SB-100 — the five "generator controls". `decimals`/`negatives`/`time` are not. */
export const GENERATOR_KEYS = [
  "addition",
  "multiplication",
  "division",
  "fractionAddition",
  "fractionMultiplication",
] as const;

export type GeneratorKey = (typeof GENERATOR_KEYS)[number];

/** The eight bar keys in DOM/tab order (SB-141): left pill, centre pill, right pill. */
export const BAR_KEYS = [
  "decimals",
  "negatives",
  "addition",
  "multiplication",
  "division",
  "fractionAddition",
  "fractionMultiplication",
  "time",
] as const;

export type BarKey = (typeof BAR_KEYS)[number];

export function isGeneratorKey(key: string): key is GeneratorKey {
  return (GENERATOR_KEYS as readonly string[]).includes(key);
}

/** A generator control counts as enabled when its value is not `"off"` / not `false`. */
export function isGeneratorEnabled(
  key: GeneratorKey,
  config: Readonly<Pick<ConfigSchemas.Config, GeneratorKey>>,
): boolean {
  const value = config[key];
  return value !== "off" && value !== false;
}

/** SB-215 — how many of SB-100's five controls are on. */
export function enabledGeneratorCount(
  config: Readonly<Pick<ConfigSchemas.Config, GeneratorKey>>,
): number {
  return GENERATOR_KEYS.filter((key) => isGeneratorEnabled(key, config)).length;
}

type CouplingConfig = Pick<
  ConfigSchemas.Config,
  "multiplication" | "fractionMultiplication"
>;

/**
 * The multiplication ↔ fraction-multiplication coupling (SB-090, SB-091).
 *
 * Both rules describe the same illegal state — `fractionMultiplication` on
 * while `multiplication` is off — so which one repairs it depends on which
 * control the user just touched:
 *
 * - `changedKey === "fractionMultiplication"` → SB-090: switch multiplication
 *   on at `"100"` (master C21; `"100"` is the shipped default, so a
 *   coupling-forced config stays leaderboard-eligible).
 * - `changedKey === "multiplication"` → SB-091: clear fraction multiplication.
 * - no `changedKey` (a whole-config apply: imported JSON, shared URL, the
 *   server config at login) → SB-090, which preserves the stored intent to
 *   practise fraction multiplication.
 *
 * Idempotent, and never more than one level deep (SB-097, guaranteed by
 * SB-092/SB-093: setting multiplication to a non-off value and setting fraction
 * multiplication to `false` both change nothing else).
 */
export function applyCoupling<T extends CouplingConfig>(
  config: Readonly<T>,
  changedKey?: keyof ConfigSchemas.Config,
): T {
  const illegal =
    config.fractionMultiplication && config.multiplication === "off";
  if (!illegal) return { ...config };

  if (changedKey === "multiplication") {
    // SB-091
    return { ...config, fractionMultiplication: false };
  }
  // SB-090
  return { ...config, multiplication: "100" };
}

/**
 * SB-215, the single source of truth for the all-off guard. Used by `isBlocked`
 * (SB-101), by `nextCycleValue` (SB-102) and by `setConfig` (SB-103) alike.
 *
 * The predicate is evaluated on the **post-cascade** configuration, exactly as
 * ME-089 requires — otherwise `multiplication = "off"` looks legal while
 * `fractionMultiplication` is the only other enabled generator, and SB-091
 * would then cascade it off too, leaving the engine with zero kinds (ME-016).
 *
 * DELIBERATE DEVIATION from SB-215's normative pseudocode: the spec spells the
 * cascade as `applyCoupling({ ...current, [key]: candidateValue })` with **no**
 * `changedKey`, which selects SB-090 (turn multiplication back on at `"100"`).
 * That reading contradicts SB-215's own worked example and SB-203(c): with
 * `multiplication="100"` + `fractionMultiplication=true` and everything else
 * off, `multiplication = "off"` would be repaired back to `"100"`, the count
 * would be 2, the guard would pass — and the user's click would visibly do
 * nothing while the spec says it MUST be blocked. Passing `key` selects SB-091
 * (cascade `fractionMultiplication` off), the count becomes 0, and the click is
 * blocked as SB-203(c) requires. Pinned by the SB-203 tests.
 */
export function wouldBeAllOff<K extends keyof ConfigSchemas.Config>(
  key: K,
  value: ConfigSchemas.Config[K],
  current: Readonly<ConfigSchemas.Config>,
): boolean {
  if (!isGeneratorKey(key)) return false;
  const next = applyCoupling({ ...current, [key]: value }, key);
  return enabledGeneratorCount(next) === 0;
}

/**
 * SB-105 — `decimals` is rendered disabled (but keeps its stored value) while
 * `addition`, `multiplication` and `division` are all off, because a decimal
 * task is derived from one of those three kinds (ME-091, master C39).
 */
export function isDecimalsDisabled(
  config: Readonly<ConfigSchemas.Config>,
): boolean {
  return (
    config.addition === "off" &&
    config.multiplication === "off" &&
    config.division === "off"
  );
}

/**
 * The cycle order of a bar control (SB-011): the zod enum member order, which
 * both the bar and the generated palette command list read from the schema so
 * they can never disagree.
 */
export function getCycleValues<K extends BarKey>(
  key: K,
): ConfigSchemas.Config[K][] {
  const schema = ConfigSchemas.ConfigSchema.shape[key];
  const options = getOptions(schema) as ConfigSchemas.Config[K][] | undefined;
  if (options === undefined) {
    throw new Error(`Config key "${key}" has no enumerable cycle values.`);
  }
  return options;
}

export type CycleDirection = 1 | -1;

/**
 * SB-050/SB-051/SB-052 — the next allowed state of a control.
 *
 * Steps by `direction`, wraps modulo the list length, and **skips** any state
 * that the SB-215 guard disallows. Returns `undefined` when every other state
 * is disallowed, which makes the click a no-op (SB-052).
 *
 * Consequence (SB-102): the last enabled generator wraps from its final ON
 * state straight back to its first ON state without ever showing OFF.
 */
export function nextCycleValue<K extends BarKey>(
  key: K,
  direction: CycleDirection,
  current: Readonly<ConfigSchemas.Config>,
): ConfigSchemas.Config[K] | undefined {
  const values = getCycleValues(key);
  const currentIndex = values.findIndex((value) => value === current[key]);
  const startIndex = currentIndex === -1 ? 0 : currentIndex;

  for (let step = 1; step <= values.length; step++) {
    const index =
      (((startIndex + direction * step) % values.length) + values.length) %
      values.length;
    const candidate = values[index] as ConfigSchemas.Config[K];
    if (candidate === current[key]) continue;
    if (wouldBeAllOff(key, candidate, current)) continue;
    return candidate;
  }

  return undefined;
}

/**
 * SB-104 — a stored or remote config that nevertheless arrives with all five
 * generator controls off (a hand-edited account config) is repaired by
 * restoring the default `addition` value rather than being rejected.
 * The caller persists the correction.
 */
export function repairAllOff<T extends ConfigSchemas.Config>(config: T): T {
  const coupled = applyCoupling(config) as T;
  if (enabledGeneratorCount(coupled) > 0) return coupled;
  return { ...coupled, addition: "1000" };
}
