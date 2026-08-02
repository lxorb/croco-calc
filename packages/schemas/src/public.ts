import { z } from "zod";
import { StringNumberSchema } from "./util";

/** AC-090: site-wide personal bests bucketed by score (default bucket = 10 points). */
export const ScoreHistogramSchema = z.record(
  StringNumberSchema,
  z.number().int(),
);
export type ScoreHistogram = z.infer<typeof ScoreHistogramSchema>;

/** monkeytype's site-wide `TypingStats`, renamed with the AC-014 vocabulary. */
export const SiteStatsSchema = z.object({
  timeSpent: z.number().nonnegative(),
  testsCompleted: z.number().int().nonnegative(),
  testsStarted: z.number().int().nonnegative(),
});
export type SiteStats = z.infer<typeof SiteStatsSchema>;
