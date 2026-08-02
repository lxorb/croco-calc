import { z } from "zod";

/**
 * The eight croco calc test settings.
 *
 * The value domains below are normative (master C2, from SB-010) and the member
 * order is the settings-bar cycle order (SB-011) — both the bar and the generated
 * command-palette option lists derive their order from these schemas.
 *
 * The three on/off controls are booleans, never `"off"`/`"on"` strings (master C3).
 */

export const AdditionSchema = z.enum(["off", "100", "1000"]);
export type Addition = z.infer<typeof AdditionSchema>;

export const MultiplicationSchema = z.enum(["off", "12", "20", "100"]);
export type Multiplication = z.infer<typeof MultiplicationSchema>;

export const DivisionSchema = z.enum(["off", "tables", "threeByTwo"]);
export type Division = z.infer<typeof DivisionSchema>;

export const FractionAdditionSchema = z.enum(["off", "12", "99"]);
export type FractionAddition = z.infer<typeof FractionAdditionSchema>;

/** Test length in **minutes** (SB-012, ME-013). Seconds only ever appear as `testDuration`. */
export const TestTimeSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(4),
  z.literal(8),
]);
export type TestTime = z.infer<typeof TestTimeSchema>;

export const TEST_TIMES = [1, 2, 4, 8] as const;

/**
 * The seven task-shaping settings. `time` is deliberately excluded: it is the
 * leaderboard's second axis, not part of the settings signature (SB-172, AC-012).
 */
export const MathGeneratorSettingsSchema = z
  .object({
    addition: AdditionSchema,
    multiplication: MultiplicationSchema,
    division: DivisionSchema,
    fractionAddition: FractionAdditionSchema,
    fractionMultiplication: z.boolean(),
    decimals: z.boolean(),
    negatives: z.boolean(),
  })
  .strict();
export type MathGeneratorSettings = z.infer<typeof MathGeneratorSettingsSchema>;

/**
 * ME-012 / ME-173: the full eight-key snapshot consumed by the math engine and by
 * the server-side regeneration of a submitted task log.
 */
export const MathSettingsSchema = MathGeneratorSettingsSchema.extend({
  time: TestTimeSchema,
}).strict();
export type MathSettings = z.infer<typeof MathSettingsSchema>;

/** ME-004: there are exactly six task kinds and no others. */
export const TaskKindSchema = z.enum([
  "add",
  "mul",
  "div",
  "fracAdd",
  "fracMul",
  "decimal",
]);
export type TaskKind = z.infer<typeof TaskKindSchema>;

/** ME-123: the canonical enumeration order of the enabled-kinds set. */
export const TASK_KIND_ORDER = [
  "add",
  "mul",
  "div",
  "fracAdd",
  "fracMul",
  "decimal",
] as const satisfies readonly TaskKind[];

/**
 * SB-170: the `:`-joined signature of the seven task-shaping settings, in the
 * fixed order below, with the three booleans encoded as `1`/`0`.
 */
export const SettingsIdSchema = z
  .string()
  .regex(
    /^(off|100|1000):(off|12|20|100):(off|tables|threeByTwo):(off|12|99):[01]:[01]:[01]$/,
    "Not a valid settings id",
  );
export type SettingsId = z.infer<typeof SettingsIdSchema>;

/**
 * SB-173 / SB-174 (master C4): a frozen literal. It MUST NOT be derived from the
 * default config — if a product default ever changes, historical results have to
 * stay comparable, so moving the leaderboard baseline is a separate, reviewed act.
 */
export const LEADERBOARD_SETTINGS_ID = "1000:100:threeByTwo:99:1:1:1";

/** SB-170: build the settings signature of a settings snapshot. */
export function buildSettingsId(settings: MathGeneratorSettings): string {
  return [
    settings.addition,
    settings.multiplication,
    settings.division,
    settings.fractionAddition,
    settings.fractionMultiplication ? "1" : "0",
    settings.decimals ? "1" : "0",
    settings.negatives ? "1" : "0",
  ].join(":");
}

/**
 * ME-017 as amended by master C4: a derived boolean, equal to
 * `settingsId === LEADERBOARD_SETTINGS_ID`. ME-019 — the server computes this, it
 * is never trusted from the client.
 */
export function isDefaultSettingsId(settingsId: string): boolean {
  return settingsId === LEADERBOARD_SETTINGS_ID;
}

/** SB-176: leaderboards exist for `time` 4 and 8 only. */
export const LEADERBOARD_TIMES = [4, 8] as const;

/** The `mode2` values that produce leaderboard entries (master C31). */
export const LeaderboardMode2Schema = z.enum(["4", "8"]);
export type LeaderboardMode2 = z.infer<typeof LeaderboardMode2Schema>;

/**
 * SB-175 restated by master C31: eligibility turns on the settings signature and
 * on `mode2`, never on a client-supplied flag.
 */
export function isLeaderboardEligible(
  settingsId: string,
  mode2: string,
): boolean {
  return isDefaultSettingsId(settingsId) && (mode2 === "4" || mode2 === "8");
}
