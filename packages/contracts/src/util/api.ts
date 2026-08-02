import { z, ZodSchema } from "zod";
import { RateLimiterId } from "../rate-limit";
import { RequireConfiguration } from "../require-configuration";

export type OpenApiTag =
  | "configs"
  | "admin"
  | "psas"
  | "public"
  | "leaderboards"
  | "results"
  | "configuration"
  | "development"
  | "users"
  | "connections";

export type PermissionId = "canReport" | "admin";

export type EndpointMetadata = {
  /** Authentication options, by default a bearer token is required. */
  authenticationOptions?: RequestAuthenticationOptions;

  openApiTags?: OpenApiTag | OpenApiTag[];

  /** RateLimitId */
  rateLimit?: RateLimiterId;

  /** Role/Rples needed to  access the endpoint*/
  requirePermission?: PermissionId | PermissionId[];

  /** Endpoint is only available if configuration allows it */
  requireConfiguration?: RequireConfiguration | RequireConfiguration[];
};

/**
 *
 * @param metadata Ensure the type of metadata is `EndpointMetadata`.
 * Ts-rest does not allow to specify the type of `metadata`.
 * @returns
 */
export function meta(metadata: EndpointMetadata): EndpointMetadata {
  return metadata;
}

export type RequestAuthenticationOptions = {
  /** Endpoint is accessible without any authentication. If `false` bearer authentication is required. */
  isPublic?: boolean;
  /** Endpoint requires an authentication token which is younger than one minute.  */
  requireFreshToken?: boolean;
  noCache?: boolean;
  /** Allow unauthenticated requests on dev  */
  isPublicOnDev?: boolean;
};

export const MonkeyResponseSchema = z.object({
  message: z.string(),
});
export type MonkeyResponseType = z.infer<typeof MonkeyResponseSchema>;

export const MonkeyValidationErrorSchema = MonkeyResponseSchema.extend({
  validationErrors: z.array(z.string()),
});
export type MonkeyValidationError = z.infer<typeof MonkeyValidationErrorSchema>;

export const MonkeyClientError = MonkeyResponseSchema;
export type MonkeyClientErrorType = z.infer<typeof MonkeyClientError>;

export const MonkeyServerError = MonkeyClientError.extend({
  errorId: z.string(),
  uid: z.string().optional(),
});
export type MonkeyServerErrorType = z.infer<typeof MonkeyServerError>;

export function responseWithNullableData<T extends ZodSchema>(
  dataSchema: T,
): z.ZodObject<
  z.objectUtil.extendShape<
    typeof MonkeyResponseSchema.shape,
    {
      data: z.ZodNullable<T>;
    }
  >
> {
  return MonkeyResponseSchema.extend({
    data: dataSchema.nullable(),
  });
}

export function responseWithData<T extends ZodSchema>(
  dataSchema: T,
): z.ZodObject<
  z.objectUtil.extendShape<
    typeof MonkeyResponseSchema.shape,
    {
      data: T;
    }
  >
> {
  return MonkeyResponseSchema.extend({
    data: dataSchema,
  });
}

export const CommonResponses = {
  400: MonkeyClientError.describe("Generic client error"),
  401: MonkeyClientError.describe(
    "Authentication required but not provided or invalid",
  ),
  403: MonkeyClientError.describe("Operation not permitted"),
  422: MonkeyValidationErrorSchema.describe("Request validation failed"),
  429: MonkeyClientError.describe("Rate limit exceeded"),
  500: MonkeyServerError.describe("Generic server error"),
  503: MonkeyServerError.describe(
    "Endpoint disabled or server is under maintenance",
  ),
};

export type CommonResponsesType =
  | {
      status: 400 | 401 | 403 | 429;
      body: MonkeyClientErrorType;
    }
  | {
      status: 422;
      body: MonkeyValidationError;
    }
  | {
      status: 500 | 503;
      body: MonkeyServerErrorType;
    };
