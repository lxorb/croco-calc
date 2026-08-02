import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as AuthUtils from "../../src/utils/auth";
import * as Auth from "../../src/middlewares/auth";
import { getCachedConfiguration } from "../../src/init/configuration";
import { DecodedIdToken } from "firebase-admin/auth";
import { NextFunction, Request, Response } from "express";
import CrocoError from "../../src/utils/error";
import * as Misc from "../../src/utils/misc";
import {
  EndpointMetadata,
  RequestAuthenticationOptions,
} from "@croco-calc/contracts/util/api";
import { TsRestRequestWithContext } from "../../src/api/types";
import { enableCrocoErrorExpects } from "../__testData__/croco-error";

enableCrocoErrorExpects();
const mockDecodedToken: DecodedIdToken = {
  uid: "123456789",
  email: "newuser@mail.com",
  iat: 0,
} as DecodedIdToken;

vi.spyOn(AuthUtils, "verifyIdToken").mockResolvedValue(mockDecodedToken);

const isDevModeMock = vi.spyOn(Misc, "isDevEnvironment");
let mockRequest: Partial<TsRestRequestWithContext>;
let mockResponse: Partial<Response>;
let nextFunction: NextFunction;

describe("middlewares/auth", () => {
  beforeEach(async () => {
    isDevModeMock.mockReturnValue(true);
    const config = await getCachedConfiguration(true);
    mockRequest = {
      baseUrl: "/api/v1",
      route: {
        path: "/",
      },
      headers: {
        authorization: "Bearer 123456789",
      },
      ctx: {
        configuration: config,
        decodedToken: {
          type: "None",
          uid: "",
          email: "",
        },
      },
    };
    mockResponse = {
      json: vi.fn(),
    };
    nextFunction = vi.fn((error) => {
      if (error !== undefined) {
        throw error;
      }
      return "Next function called";
    });
  });

  afterEach(() => {
    isDevModeMock.mockClear();
  });

  describe("authenticateTsRestRequest", () => {
    it("should fail if token is not fresh", async () => {
      //GIVEN
      Date.now = vi.fn(() => 60001);
      const expectedError = new CrocoError(
        401,
        "Unauthorized\nStack: This endpoint requires a fresh token",
      );

      //WHEN
      await expect(async () =>
        authenticate({}, { requireFreshToken: true }),
      ).rejects.toMatchCrocoError(expectedError);

      //THEN

      expect(nextFunction).toHaveBeenLastCalledWith(
        expect.toMatchCrocoError(expectedError),
      );
    });
    it("should allow the request if token is fresh", async () => {
      //GIVEN
      Date.now = vi.fn(() => 10000);

      //WHEN
      const result = await authenticate({}, { requireFreshToken: true });

      //THEN
      const decodedToken = result.decodedToken;
      expect(decodedToken?.type).toBe("Bearer");
      expect(decodedToken?.email).toBe(mockDecodedToken.email);
      expect(decodedToken?.uid).toBe(mockDecodedToken.uid);
      expect(nextFunction).toHaveBeenCalledOnce();
    });
    it("should allow the request with authentation on public endpoint", async () => {
      //WHEN
      const result = await authenticate({}, { isPublic: true });

      //THEN
      const decodedToken = result.decodedToken;
      expect(decodedToken?.type).toBe("Bearer");
      expect(decodedToken?.email).toBe(mockDecodedToken.email);
      expect(decodedToken?.uid).toBe(mockDecodedToken.uid);
      expect(nextFunction).toHaveBeenCalledTimes(1);
    });
    it("should allow the request without authentication on public endpoint", async () => {
      //WHEN
      const result = await authenticate({ headers: {} }, { isPublic: true });

      //THEN
      const decodedToken = result.decodedToken;
      expect(decodedToken?.type).toBe("None");
      expect(decodedToken?.email).toBe("");
      expect(decodedToken?.uid).toBe("");
      expect(nextFunction).toHaveBeenCalledTimes(1);
    });
    it("should allow request with Uid on dev", async () => {
      //WHEN
      const result = await authenticate({
        headers: { authorization: "Uid 123" },
      });

      //THEN
      const decodedToken = result.decodedToken;
      expect(decodedToken?.type).toBe("Bearer");
      expect(decodedToken?.email).toBe("");
      expect(decodedToken?.uid).toBe("123");
      expect(nextFunction).toHaveBeenCalledTimes(1);
    });
    it("should allow request with Uid and email on dev", async () => {
      const result = await authenticate({
        headers: { authorization: "Uid 123|test@example.com" },
      });

      //THEN
      const decodedToken = result.decodedToken;
      expect(decodedToken?.type).toBe("Bearer");
      expect(decodedToken?.email).toBe("test@example.com");
      expect(decodedToken?.uid).toBe("123");
      expect(nextFunction).toHaveBeenCalledTimes(1);
    });
    it("should fail request with Uid on non-dev", async () => {
      //GIVEN
      isDevModeMock.mockReturnValue(false);

      //WHEN / THEN
      await expect(async () =>
        authenticate({ headers: { authorization: "Uid 123" } }),
      ).rejects.toMatchCrocoError(
        new CrocoError(401, "Bearer type uid is not supported"),
      );
    });
    it("should fail without authentication", async () => {
      await expect(async () => authenticate({ headers: {} })).rejects.toThrow(
        "Unauthorized\nStack: endpoint: /api/v1 no authorization header found",
      );

      //THEH
    });
    it("should fail with empty authentication", async () => {
      await expect(async () =>
        authenticate({ headers: { authorization: "" } }),
      ).rejects.toThrow(
        "Unauthorized\nStack: endpoint: /api/v1 no authorization header found",
      );

      //THEH
    });
    it("should fail with missing authentication token", async () => {
      await expect(async () =>
        authenticate({ headers: { authorization: "Bearer" } }),
      ).rejects.toThrow(
        "Missing authentication token\nStack: authenticateWithAuthHeader",
      );

      //THEH
    });
    it("should fail with unknown authentication scheme", async () => {
      await expect(async () =>
        authenticate({ headers: { authorization: "unknown format" } }),
      ).rejects.toThrow(
        'Unknown authentication scheme\nStack: The authentication scheme "unknown" is not implemented',
      );

      //THEH
    });
    it("should allow the request with authentation on dev public endpoint", async () => {
      //WHEN
      const result = await authenticate({}, { isPublicOnDev: true });

      //THEN
      const decodedToken = result.decodedToken;
      expect(decodedToken?.type).toBe("Bearer");
      expect(decodedToken?.email).toBe(mockDecodedToken.email);
      expect(decodedToken?.uid).toBe(mockDecodedToken.uid);
      expect(nextFunction).toHaveBeenCalledTimes(1);
    });
    it("should allow the request without authentication on dev public endpoint", async () => {
      //WHEN
      const result = await authenticate(
        { headers: {} },
        { isPublicOnDev: true },
      );

      //THEN
      const decodedToken = result.decodedToken;
      expect(decodedToken?.type).toBe("None");
      expect(decodedToken?.email).toBe("");
      expect(decodedToken?.uid).toBe("");
      expect(nextFunction).toHaveBeenCalledTimes(1);
    });
    it("should allow the request with authentation on dev public endpoint in production", async () => {
      //WHEN
      isDevModeMock.mockReturnValue(false);
      const result = await authenticate({}, { isPublicOnDev: true });

      //THEN
      const decodedToken = result.decodedToken;
      expect(decodedToken?.type).toBe("Bearer");
      expect(decodedToken?.email).toBe(mockDecodedToken.email);
      expect(decodedToken?.uid).toBe(mockDecodedToken.uid);
      expect(nextFunction).toHaveBeenCalledTimes(1);
    });
    it("should fail without authentication on dev public endpoint in production", async () => {
      //WHEN
      isDevModeMock.mockReturnValue(false);

      //THEN
      await expect(async () =>
        authenticate({ headers: {} }, { isPublicOnDev: true }),
      ).rejects.toThrow("Unauthorized");
    });
  });
});

async function authenticate(
  request: Partial<Request>,
  authenticationOptions?: RequestAuthenticationOptions,
): Promise<{ decodedToken: Auth.DecodedToken }> {
  const mergedRequest = {
    ...mockRequest,
    ...request,
    tsRestRoute: {
      metadata: { authenticationOptions } as EndpointMetadata,
    },
  } as any;

  await Auth.authenticateTsRestRequest()(
    mergedRequest,
    mockResponse as Response,
    nextFunction,
  );

  return { decodedToken: mergedRequest.ctx.decodedToken };
}
