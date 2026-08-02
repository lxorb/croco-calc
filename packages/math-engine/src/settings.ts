/**
 * Settings model, coupling and guards (ME-009 … ME-018, ME-082 … ME-089,
 * ME-121 … ME-123), as amended by C2 (canonical literals), C3 (booleans),
 * C21 (the coupling forces `"100"`, not `"12"`) and C36/SB-215 (the all-off
 * guard is evaluated **after** the cascade).
 *
 * Everything here is pure: the settings bar (WP-05) and the backend (WP-10) both
 * drive these helpers so there is exactly one implementation of the guard, not
 * two (SB-103).
 */

import { MathGenError } from "./errors";
import type {
  GeneratorKey,
  MathSettingKey,
  MathSettings,
  TaskKind,
  TimeSetting,
} from "./types";

/** The eight bar keys, in bar order (SB-010). */
export const SETTING_KEYS = [
  "addition",
  "multiplication",
  "division",
  "fractionAddition",
  "fractionMultiplication",
  "decimals",
  "negatives",
  "time",
] as const satisfies readonly MathSettingKey[];

/** The five task-producing controls (ME-014, SB-100). */
export const GENERATOR_KEYS = [
  "addition",
  "multiplication",
  "division",
  "fractionAddition",
  "fractionMultiplication",
] as const satisfies readonly GeneratorKey[];

export const TIME_VALUES = [
  1, 2, 4, 8,
] as const satisfies readonly TimeSetting[];

/**
 * Cycle order, left to right, wrapping (ME-010). The zod enum member order in
 * `packages/schemas` MUST equal this (SB-011).
 */
export const MATH_SETTING_VALUES = {
  addition: ["off", "100", "1000"],
  multiplication: ["off", "12", "20", "100"],
  division: ["off", "tables", "threeByTwo"],
  fractionAddition: ["off", "12", "99"],
  fractionMultiplication: [false, true],
  decimals: [false, true],
  negatives: [false, true],
  time: TIME_VALUES,
} as const satisfies { [K in MathSettingKey]: readonly MathSettings[K][] };

/**
 * ME-011 — the shipped defaults, and what "reset settings" restores.
 *
 * SB-110 makes `frontend/src/ts/constants/default-config.ts` the app-level
 * single source of truth; its eight math keys MUST be these values (WP-05
 * imports them from here rather than restating them). This is a product
 * default, **not** a leaderboard baseline: SB-174 keeps those two apart on
 * purpose — see the note at the bottom of this file.
 */
export const DEFAULT_MATH_SETTINGS: MathSettings = {
  addition: "1000",
  multiplication: "100",
  division: "threeByTwo",
  fractionAddition: "99",
  fractionMultiplication: true,
  decimals: true,
  negatives: true,
  time: 8,
};

/** The fixed canonical mixing order (ME-123). */
export const KIND_ORDER = [
  "add",
  "mul",
  "div",
  "fracAdd",
  "fracMul",
  "decimal",
] as const satisfies readonly TaskKind[];

/** ME-158 — rolling batch sizing. */
export const INITIAL_BATCH_SIZE = 60;
export const BATCH_EXTENSION_SIZE = 30;
export const BATCH_REFILL_THRESHOLD = 15;

/** True when the generator control `key` is not in its off state. */
export function isGeneratorEnabled(
  settings: MathSettings,
  key: GeneratorKey,
): boolean {
  const value = settings[key];
  return typeof value === "boolean" ? value : value !== "off";
}

/** Counts the enabled controls among GENERATOR_KEYS (SB-215). */
export function enabledGeneratorCount(settings: MathSettings): number {
  let count = 0;
  for (const key of GENERATOR_KEYS) {
    if (isGeneratorEnabled(settings, key)) count++;
  }
  return count;
}

/**
 * The enabled-kinds set in canonical order (ME-121, ME-123).
 *
 * `decimal` is enabled only when `decimals` is on **and** at least one of
 * add/mul/div is enabled — otherwise it is inert (ME-092, E10).
 */
export function getEnabledKinds(settings: MathSettings): TaskKind[] {
  const hasAdd = settings.addition !== "off";
  const hasMul = settings.multiplication !== "off";
  const hasDiv = settings.division !== "off";

  const kinds: TaskKind[] = [];
  if (hasAdd) kinds.push("add");
  if (hasMul) kinds.push("mul");
  if (hasDiv) kinds.push("div");
  if (settings.fractionAddition !== "off") kinds.push("fracAdd");
  if (settings.fractionMultiplication) kinds.push("fracMul");
  if (settings.decimals && (hasAdd || hasMul || hasDiv)) kinds.push("decimal");
  return kinds;
}

/** The enabled subset of `{add, mul, div}` a decimal task draws its base from (ME-091). */
export function getDecimalBaseKinds(
  settings: MathSettings,
): ("add" | "mul" | "div")[] {
  const kinds: ("add" | "mul" | "div")[] = [];
  if (settings.addition !== "off") kinds.push("add");
  if (settings.multiplication !== "off") kinds.push("mul");
  if (settings.division !== "off") kinds.push("div");
  return kinds;
}

/**
 * ME-016 — throws rather than silently generating nothing.
 * The settings bar is what prevents this (ME-015, B3); the engine is the backstop.
 */
export function assertGeneratable(settings: MathSettings): void {
  if (enabledGeneratorCount(settings) === 0) {
    throw new MathGenError(
      "no-enabled-generators",
      "at least one task type must be enabled (ME-015, ME-016)",
    );
  }
  if (settings.fractionMultiplication && settings.multiplication === "off") {
    throw new MathGenError(
      "fraction-multiplication-without-multiplication",
      "fractionMultiplication requires a non-off multiplication setting: its bound N follows setting 2 (ME-074, ME-084)",
    );
  }
}

/**
 * The `overrideConfig` cascade of ME-082 … ME-087 / SB-090 … SB-093, as a single
 * transactional update (ME-088). `key`/`value` is the change the user made; the
 * cascade fires only for the two coupled transitions.
 *
 * C21: enabling fraction multiplication forces `multiplication = "100"` (the
 * shipped default), **not** ME-083's `"12"` — so a coupling-forced config equals
 * the default config and the user stays leaderboard-eligible.
 *
 * Idempotent and non-recursive (ME-097): applying the result again is a no-op.
 */
export function applyCoupling<K extends MathSettingKey>(
  current: MathSettings,
  key: K,
  value: MathSettings[K],
): MathSettings {
  const next: MathSettings = { ...current, [key]: value };

  if (key === "fractionMultiplication" && value === true) {
    // ME-082 + C21
    if (next.multiplication === "off") next.multiplication = "100";
  } else if (key === "multiplication" && value === "off") {
    // ME-084
    next.fractionMultiplication = false;
  }
  // ME-085, ME-086, ME-087, SB-098: no other transition couples anything.
  return next;
}

/**
 * SB-215 / ME-089 — the guard predicate, evaluated on the **post-cascade**
 * configuration. This is the single source of truth used by `isBlocked`,
 * `cycleSetting` and `setConfig` alike.
 */
export function wouldBeAllOff<K extends MathSettingKey>(
  current: MathSettings,
  key: K,
  value: MathSettings[K],
): boolean {
  return enabledGeneratorCount(applyCoupling(current, key, value)) === 0;
}

/**
 * The next value for `key` when the control is clicked (ME-010), skipping any
 * state that would leave zero enabled generators after the cascade
 * (ME-015, SB-102, C36).
 *
 * Consequence: with only one producer enabled, its `"off"` state never appears
 * in the cycle — e.g. addition cycles `"100"` -> `"1000"` -> `"100"` -> …
 */
export function nextSettingValue<K extends MathSettingKey>(
  current: MathSettings,
  key: K,
): MathSettings[K] {
  const values = MATH_SETTING_VALUES[
    key
  ] as unknown as readonly MathSettings[K][];
  const at = values.indexOf(current[key]);
  const start = at === -1 ? 0 : at;

  for (let step = 1; step <= values.length; step++) {
    const candidate = values[(start + step) % values.length] as MathSettings[K];
    if (!wouldBeAllOff(current, key, candidate)) return candidate;
  }
  // Unreachable: `current[key]` itself is always a legal value, so the loop
  // finds at worst the value it started from.
  return current[key];
}

/** `nextSettingValue` plus the cascade, i.e. what a bar click commits. */
export function cycleSetting(
  current: MathSettings,
  key: MathSettingKey,
): MathSettings {
  return applyCoupling(current, key, nextSettingValue(current, key));
}

/*
 * ME-017 / ME-018 (leaderboard eligibility) are deliberately **not implemented
 * here**, and this package must never grow such a predicate.
 *
 * C4 rules that the leaderboard key is the persisted `settingsId` and that
 * `LEADERBOARD_SETTINGS_ID` is a frozen literal (SB-173/SB-174), precisely so
 * that changing a product default cannot silently re-scope every historical
 * entry. A predicate that compares a settings snapshot against
 * `DEFAULT_MATH_SETTINGS` is exactly the derivation SB-174 forbids, whatever it
 * is named.
 *
 * The single implementation lives in `packages/schemas/src/math.ts`:
 *   LEADERBOARD_SETTINGS_ID   — the frozen literal "1000:100:threeByTwo:99:1:1:1"
 *   buildSettingsId(settings) — SB-170's `:`-joined signature
 *   isDefaultSettingsId(id)   — ME-017, server-side only (ME-019)
 *   isLeaderboardEligible(id, mode2) — SB-175 / C31
 *
 * `__tests__/settings.spec.ts` asserts that this module exports no eligibility
 * predicate, so the violation cannot come back by accident.
 */
