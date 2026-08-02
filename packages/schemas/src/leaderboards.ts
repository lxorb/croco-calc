import { z } from "zod";
import { ScoreSchema, TasksPerMinuteSchema } from "./util";

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
