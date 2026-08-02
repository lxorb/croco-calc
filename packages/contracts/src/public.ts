import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { CommonResponses, meta, responseWithData } from "./util/api";
import {
  ScoreHistogramSchema,
  TrainingStatsSchema,
} from "@croco-calc/schemas/public";

/**
 * CP-137: the histogram is keyed by the leaderboard duration alone — `mode` is
 * always `time` and language was removed from the leaderboard entirely, so the
 * query collapses to the two `LEADERBOARD_TIMES` (SB-176). The router runs with
 * `jsonQuery: true`, so `?time=8` arrives JSON-decoded as the number `8`.
 */
export const GetScoreHistogramQuerySchema = z
  .object({
    time: z.union([z.literal(4), z.literal(8)]),
  })
  .strict();
export type GetScoreHistogramQuery = z.infer<
  typeof GetScoreHistogramQuerySchema
>;

export const GetScoreHistogramResponseSchema =
  responseWithData(ScoreHistogramSchema);
export type GetScoreHistogramResponse = z.infer<
  typeof GetScoreHistogramResponseSchema
>;

export const GetTrainingStatsResponseSchema =
  responseWithData(TrainingStatsSchema);
export type GetTrainingStatsResponse = z.infer<
  typeof GetTrainingStatsResponseSchema
>;

const c = initContract();
export const publicContract = c.router(
  {
    getScoreHistogram: {
      summary: "get score histogram",
      description:
        "get number of users personal bests grouped by score level (multiples of ten)",
      method: "GET",
      path: "/scoreHistogram",
      query: GetScoreHistogramQuerySchema,
      responses: {
        200: GetScoreHistogramResponseSchema,
      },
    },

    getTrainingStats: {
      summary: "get training stats",
      description: "get number of tests and time users spend solving.",
      method: "GET",
      path: "/trainingStats",
      responses: {
        200: GetTrainingStatsResponseSchema,
      },
    },
  },
  {
    pathPrefix: "/public",
    strictStatusCodes: true,
    metadata: meta({
      openApiTags: "public",
      authenticationOptions: {
        isPublic: true,
      },
      rateLimit: "publicStatsGet",
    }),
    commonResponses: CommonResponses,
  },
);
