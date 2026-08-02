import { z } from "zod";
import { MathGeneratorSettingsSchema, SettingsIdSchema } from "./math";
import { ScoreSchema } from "./util";

/**
 * croco calc has exactly one test mode, so `mode` is retained purely so that
 * monkeytype's personal-best storage shape and `utils/pb.ts` keep working
 * unchanged (AC-008, master C31). `mode2` is the test length in minutes.
 */
export const Mode2Schema = z.enum(["1", "2", "4", "8"], {
  errorMap: () => ({ message: 'Needs to be "1", "2", "4" or "8".' }),
});

/**
 * AC-064: personal bests carry the croco calc metrics plus the settings snapshot
 * they were achieved under. Master C4 rules that the signature field is
 * `settingsId`. Consistency is deliberately absent (master C5, AC-064).
 */
export const PersonalBestSchema = z.object({
  score: ScoreSchema,
  correct: z.number().int().nonnegative(),
  wrong: z.number().int().nonnegative(),
  acc: z.number().nonnegative().max(100),
  tpm: z.number().nonnegative(),
  spm: z.number(),
  settings: MathGeneratorSettingsSchema,
  settingsId: SettingsIdSchema,
  timestamp: z.number().nonnegative(),
});
export type PersonalBest = z.infer<typeof PersonalBestSchema>;

/** AC-064: `{ time: Record<"1"|"2"|"4"|"8", PersonalBest[]> }` and nothing else. */
export const PersonalBestsSchema = z.object({
  time: z.record(Mode2Schema, z.array(PersonalBestSchema)),
});
export type PersonalBests = z.infer<typeof PersonalBestsSchema>;

export const ModeSchema = PersonalBestsSchema.keyof();
export type Mode = z.infer<typeof ModeSchema>;

export type Mode2<M extends Mode> = M extends M
  ? keyof PersonalBests[M]
  : never;
