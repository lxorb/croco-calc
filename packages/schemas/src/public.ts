import { z } from "zod";
import { StringNumberSchema } from "./util";

/** AC-090: site-wide personal bests bucketed by score (default bucket = 10 points). */
export const ScoreHistogramSchema = z.record(
  StringNumberSchema,
  z.number().int(),
);
export type ScoreHistogram = z.infer<typeof ScoreHistogramSchema>;

/**
 * CP-135: monkeytype's site-wide `TypingStats`, renamed with the AC-014
 * vocabulary. The wire field is `timeTraining` (seconds); the Mongo document in
 * the `public` collection may keep storing it as `timeSpent`.
 */
export const TrainingStatsSchema = z.object({
  timeTraining: z.number().nonnegative(),
  testsCompleted: z.number().int().nonnegative(),
  testsStarted: z.number().int().nonnegative(),
});
export type TrainingStats = z.infer<typeof TrainingStatsSchema>;
