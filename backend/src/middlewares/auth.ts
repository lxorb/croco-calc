import CrocoError from "../utils/error";
import { verifyIdToken } from "../utils/auth";
import { isDevEnvironment } from "../utils/misc";
import { NextFunction, Response } from "express";
import { AppRoute, AppRouter } from "@ts-rest/core";
import {
  EndpointMetadata,
  RequestAuthenticationOptions,
} from "@croco-calc/contracts/util/api";
import { AsyncTsRestRequestHandler, getMetadata } from "./utility";
import { TsRestRequestWithContext } from "../api/types";

/**
 * croco calc authenticates every request with a Firebase ID token. The token is
 * deliberately provider-agnostic: email/password, Google and GitHub sign-ins all
 * produce the same kind of token and are all verified through the same path
 * (INV-196, master §5.1). Nothing below may branch on the sign-in provider.
 */
export type DecodedToken = {
  type: "Bearer" | "None";
  uid: string;
  email: string;
};

const DEFAULT_OPTIONS: RequestAuthenticationOptions = {
  isPublic: false,
  requireFreshToken: false,
  isPublicOnDev: false,
};

/**
 * Authenticate request based on the auth settings of the route.
 * By default a Bearer token with user authentication is required.
 * @returns
 */
export function authenticateTsRestRequest<
  T extends AppRouter | AppRoute,
>(): AsyncTsRestRequestHandler<T> {
  return async (
    req: TsRestRequestWithContext,
    _res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const options = {
      ...DEFAULT_OPTIONS,
      ...((getMetadata(req).authenticationOptions ?? {}) as EndpointMetadata),
    };

    let token: DecodedToken;

    const isPublic =
      options.isPublic === true ||
      (options.isPublicOnDev && isDevEnvironment());

    const { authorization: authHeader } = req.headers;

    try {
      if (authHeader !== undefined && authHeader !== "") {
        token = await authenticateWithAuthHeader(authHeader, options);
      } else if (isPublic === true) {
        token = {
          type: "None",
          uid: "",
          email: "",
        };
      } else {
        throw new CrocoError(
          401,
          "Unauthorized",
          `endpoint: ${req.baseUrl} no authorization header found`,
        );
      }

      req.ctx = {
        ...req.ctx,
        decodedToken: token,
      };
    } catch (error) {
      next(error);
      return;
    }

    next();
  };
}

async function authenticateWithAuthHeader(
  authHeader: string,
  options: RequestAuthenticationOptions,
): Promise<DecodedToken> {
  const [authScheme, token] = authHeader.split(" ");

  if (token === undefined) {
    throw new CrocoError(
      401,
      "Missing authentication token",
      "authenticateWithAuthHeader",
    );
  }

  const normalizedAuthScheme = authScheme?.trim();

  switch (normalizedAuthScheme) {
    case "Bearer":
      return await authenticateWithBearerToken(token, options);
    case "Uid":
      return await authenticateWithUid(token);
  }

  throw new CrocoError(
    401,
    "Unknown authentication scheme",
    `The authentication scheme "${authScheme}" is not implemented`,
  );
}

async function authenticateWithBearerToken(
  token: string,
  options: RequestAuthenticationOptions,
): Promise<DecodedToken> {
  try {
    const decodedToken = await verifyIdToken(
      token,
      (options.requireFreshToken ?? false) || (options.noCache ?? false),
    );

    if (options.requireFreshToken) {
      const now = Date.now();
      const tokenIssuedAt = new Date(decodedToken.iat * 1000).getTime();

      if (now - tokenIssuedAt > 60 * 1000) {
        throw new CrocoError(
          401,
          "Unauthorized",
          `This endpoint requires a fresh token`,
        );
      }
    }

    return {
      type: "Bearer",
      uid: decodedToken.uid,
      email: decodedToken.email ?? "",
    };
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("An internal error has occurred")
    ) {
      throw new CrocoError(
        503,
        "Firebase returned an internal error when trying to verify the token.",
        "authenticateWithBearerToken",
      );
    }

    // oxlint-disable-next-line no-unsafe-member-access
    const errorCode = error?.errorInfo?.code as string | undefined;

    if (errorCode?.includes("auth/id-token-expired")) {
      throw new CrocoError(
        401,
        "Token expired - please login again",
        "authenticateWithBearerToken",
      );
    } else if (errorCode?.includes("auth/id-token-revoked")) {
      throw new CrocoError(
        401,
        "Token revoked - please login again",
        "authenticateWithBearerToken",
      );
    } else if (errorCode?.includes("auth/user-not-found")) {
      throw new CrocoError(
        404,
        "User not found",
        "authenticateWithBearerToken",
      );
    } else if (errorCode?.includes("auth/argument-error")) {
      throw new CrocoError(
        400,
        "Incorrect Bearer token format",
        "authenticateWithBearerToken",
      );
    } else {
      throw error;
    }
  }
}

async function authenticateWithUid(token: string): Promise<DecodedToken> {
  if (!isDevEnvironment()) {
    throw new CrocoError(401, "Bearer type uid is not supported");
  }
  const [uid, email] = token.split("|");

  if (uid === undefined || uid === "") {
    throw new CrocoError(401, "Missing uid");
  }

  return {
    type: "Bearer",
    uid: uid,
    email: email ?? "",
  };
}
