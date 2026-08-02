import { z } from "zod";
import { ScoreSchema, TasksPerMinuteSchema } from "./util";
import { LeaderboardMode2, LeaderboardMode2Schema } from "./math";
import { Mode } from "./shared";

/** The three boards the page offers (AC-105 … AC-112). */
export const LeaderboardTypeSchema = z.enum(["allTime", "weekly", "daily"]);
export type LeaderboardType = z.infer<typeof LeaderboardTypeSchema>;

/** `mode` → the `mode2` values that board offers; an empty record means "no time axis". */
export type ValidLeaderboardModes = Readonly<
  Partial<Record<Mode, readonly LeaderboardMode2[]>>
>;

/**
 * AC-114: the valid-leaderboard matrix, replacing monkeytype's hard-coded
 * `{ time: { "15": ["english"], "60": ["english"] } }` and the
 * configuration-driven daily rules. `weekly` is XP-only, so it carries no time
 * axis at all (AC-112 hides the time group for it). Defined here rather than in
 * the page so the sidebar, the URL parser and the server all read one source.
 */
export const VALID_LEADERBOARD_MATRIX = {
  allTime: { time: LeaderboardMode2Schema.options },
  weekly: {},
  daily: { time: LeaderboardMode2Schema.options },
} as const satisfies Readonly<Record<LeaderboardType, ValidLeaderboardModes>>;

/** AC-114: is this `type`/`mode`/`mode2` triple a board that exists? */
export function isValidLeaderboard(
  type: LeaderboardType,
  mode: string,
  mode2: string,
): boolean {
  const modes: Record<string, readonly string[] | undefined> =
    VALID_LEADERBOARD_MATRIX[type];
  return modes[mode]?.includes(mode2) ?? false;
}

const FriendsRankSchema = z
  .number()
  .nonnegative()
  .int()
  .optional()
  .describe("only available on friendsOnly leaderboard");

/**
 * AC-131 / INV-036: score, accuracy, tpm and correct/wrong are the leaderboard
 * columns. The boards are split by `mode2` alone (SB-176); master C5 keeps
 * consistency off this surface and master C16 keeps user flags but cuts badges.
 */
export const LeaderboardEntrySchema = z.object({
  score: ScoreSchema,
  correct: z.number().int().nonnegative(),
  wrong: z.number().int().nonnegative(),
  acc: z.number().nonnegative().min(0).max(100),
  tpm: TasksPerMinuteSchema,
  timestamp: z.number().int().nonnegative(),
  uid: z.string(),
  name: z.string(),
  rank: z.number().nonnegative().int(),
  friendsRank: FriendsRankSchema,
});
export type LeaderboardEntry = z.infer<typeof LeaderboardEntrySchema>;

/** The stored shape of a daily-leaderboard row; rank is assigned at read time. */
export const DailyLeaderboardEntrySchema = LeaderboardEntrySchema.omit({
  rank: true,
  friendsRank: true,
});
export type DailyLeaderboardEntry = z.infer<typeof DailyLeaderboardEntrySchema>;

/**
 * The stored shape of a weekly-XP row. `timeTypedSeconds` is renamed
 * `timeSpentSeconds` (AC-014).
 */
export const XpLeaderboardEntryBaseSchema = z.object({
  uid: z.string(),
  name: z.string(),
  lastActivityTimestamp: z.number().int().nonnegative(),
  timeSpentSeconds: z.number().nonnegative(),
});
export type XpLeaderboardEntryBase = z.infer<
  typeof XpLeaderboardEntryBaseSchema
>;

export const XpLeaderboardScoreSchema = z.number().int().nonnegative();
export type XpLeaderboardScore = z.infer<typeof XpLeaderboardScoreSchema>;

export const XpLeaderboardEntrySchema = XpLeaderboardEntryBaseSchema.extend({
  totalXp: XpLeaderboardScoreSchema,
  // dynamically added when generating response on the backend
  rank: z.number().nonnegative().int(),
  friendsRank: FriendsRankSchema,
});
export type XpLeaderboardEntry = z.infer<typeof XpLeaderboardEntrySchema>;
