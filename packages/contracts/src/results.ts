import { initContract } from "@ts-rest/core";
import { z } from "zod";
import {
  CommonResponses,
  meta,
  MonkeyClientError,
  MonkeyResponseSchema,
  responseWithData,
} from "./util/api";
import {
  CompletedEventSchema,
  PostResultResponseSchema,
  ResultMinifiedSchema,
  ResultSchema,
} from "@croco-calc/schemas/results";
import { IdSchema } from "@croco-calc/schemas/util";

export const GetResultsQuerySchema = z.object({
  onOrAfterTimestamp: z
    .number()
    .int()
    .min(1589428800000)
    .optional()
    .describe(
      "Timestamp of the earliest result to fetch. If omitted the most recent results are fetched.",
    ),
  offset: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe("Offset of the item at which to begin the response."),
  limit: z
    .number()
    .int()
    .nonnegative()
    .max(1000)
    .optional()
    .describe("Limit results to the given amount."),
});
export type GetResultsQuery = z.infer<typeof GetResultsQuerySchema>;

export const GetResultsResponseSchema = responseWithData(
  z.array(ResultMinifiedSchema),
);
export type GetResultsResponse = z.infer<typeof GetResultsResponseSchema>;

export const GetResultByIdPathSchema = z.object({
  resultId: IdSchema,
});
export type GetResultByIdPath = z.infer<typeof GetResultByIdPathSchema>;

export const GetResultByIdResponseSchema = responseWithData(ResultSchema);

export type GetResultByIdResponse = z.infer<typeof GetResultByIdResponseSchema>;

export const AddResultRequestSchema = z.object({
  result: CompletedEventSchema,
});
export type AddResultRequest = z.infer<typeof AddResultRequestSchema>;

export const AddResultResponseSchema = responseWithData(
  PostResultResponseSchema,
);
export type AddResultResponse = z.infer<typeof AddResultResponseSchema>;

export const GetLastResultResponseSchema = responseWithData(ResultSchema);
export type GetLastResultResponse = z.infer<typeof GetLastResultResponseSchema>;

const c = initContract();
export const resultsContract = c.router(
  {
    get: {
      summary: "get results",
      description: "Gets up to 1000 results",
      method: "GET",
      path: "",
      query: GetResultsQuerySchema.strict(),
      responses: {
        200: GetResultsResponseSchema,
      },
      metadata: meta({
        rateLimit: "resultsGet",
      }),
    },
    getById: {
      summary: "get result by id",
      description: "Get result by id",
      method: "GET",
      path: "/id/:resultId",
      pathParams: GetResultByIdPathSchema,
      responses: {
        200: GetResultByIdResponseSchema,
      },
      metadata: meta({
        rateLimit: "resultByIdGet",
      }),
    },
    add: {
      summary: "add result",
      description: "Add a test result for the current user",
      method: "POST",
      path: "",
      body: AddResultRequestSchema.strict(),
      responses: {
        200: AddResultResponseSchema,
        460: MonkeyClientError.describe("Test too short"),
        461: MonkeyClientError.describe("Result hash invalid"),
        463: MonkeyClientError.describe("Result data invalid"),
        465: MonkeyClientError.describe("Bot detected"),
        466: MonkeyClientError.describe("Duplicate result"),
        467: MonkeyClientError.describe("Task log does not match the seed"),
        468: MonkeyClientError.describe("Unsupported math engine version"),
      },
      metadata: meta({
        rateLimit: "resultsAdd",
        requireConfiguration: {
          path: "results.savingEnabled",
          invalidMessage: "Results are not being saved at this time.",
        },
      }),
    },
    deleteAll: {
      summary: "delete all results",
      description: "Delete all results for the current user",
      method: "DELETE",
      path: "",
      body: c.noBody(),
      responses: {
        200: MonkeyResponseSchema,
      },
      metadata: meta({
        authenticationOptions: {
          requireFreshToken: true,
        },
        rateLimit: "resultsDeleteAll",
      }),
    },
    getLast: {
      summary: "get last result",
      description: "Gets a user's last saved result",
      path: "/last",
      method: "GET",
      responses: {
        200: GetLastResultResponseSchema,
      },
      metadata: meta({
        rateLimit: "resultsGet",
      }),
    },
  },
  {
    pathPrefix: "/results",
    strictStatusCodes: true,
    metadata: meta({
      openApiTags: "results",
    }),
    commonResponses: CommonResponses,
  },
);
