import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { CommonResponses, meta, responseWithData } from "./util/api";
import {
  ScoreHistogramSchema,
  SiteStatsSchema,
} from "@croco-calc/schemas/public";
import { ModeSchema } from "@croco-calc/schemas/shared";
import { LeaderboardMode2Schema } from "@croco-calc/schemas/math";

export const GetScoreHistogramQuerySchema = z
  .object({
    mode: ModeSchema,
    mode2: LeaderboardMode2Schema,
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

export const GetSiteStatsResponseSchema = responseWithData(SiteStatsSchema);
export type GetSiteStatsResponse = z.infer<typeof GetSiteStatsResponseSchema>;

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

    getSiteStats: {
      summary: "get site stats",
      description: "get number of tests and time users spend solving.",
      method: "GET",
      path: "/siteStats",
      responses: {
        200: GetSiteStatsResponseSchema,
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
