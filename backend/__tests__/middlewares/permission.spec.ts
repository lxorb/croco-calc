import { EndpointMetadata } from "@croco-calc/contracts/util/api";
import { Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TsRestRequestWithContext } from "../../src/api/types";
import * as AdminUids from "../../src/dal/admin-uids";
import * as UserDal from "../../src/dal/user";
import { DecodedToken } from "../../src/middlewares/auth";
import { verifyPermissions } from "../../src/middlewares/permission";
import CrocoError from "../../src/utils/error";
import * as Misc from "../../src/utils/misc";
import { enableCrocoErrorExpects } from "../__testData__/croco-error";

enableCrocoErrorExpects();
const uid = "123456789";

describe("permission middleware", () => {
  const handler = verifyPermissions();
  const res: Response = {} as any;
  const next = vi.fn();
  const getPartialUserMock = vi.spyOn(UserDal, "getPartialUser");
  const isAdminMock = vi.spyOn(AdminUids, "isAdmin");
  const isDevMock = vi.spyOn(Misc, "isDevEnvironment");

  beforeEach(() => {
    next.mockClear();
    getPartialUserMock.mockClear().mockResolvedValue({} as any);
    isDevMock.mockClear().mockReturnValue(false);
    isAdminMock.mockClear().mockResolvedValue(false);
  });
  afterEach(() => {
    //next function must only be called once
    expect(next).toHaveBeenCalledOnce();
  });

  it("should bypass without requiredPermission", async () => {
    //GIVEN
    const req = givenRequest({});
    //WHEN
    await handler(req, res, next);

    //THEN
    expect(next).toHaveBeenCalledWith();
  });
  it("should bypass with empty requiredPermission", async () => {
    //GIVEN
    const req = givenRequest({ requirePermission: [] });
    //WHEN
    await handler(req, res, next);

    //THE
    expect(next).toHaveBeenCalledWith();
  });

  describe("admin check", () => {
    const requireAdminPermission: EndpointMetadata = {
      requirePermission: "admin",
    };

    it("should fail without authentication", async () => {
      //GIVEN
      const req = givenRequest(requireAdminPermission);
      //WHEN
      await handler(req, res, next);

      //THEN
      expect(next).toHaveBeenCalledWith(
        expect.toMatchCrocoError(
          new CrocoError(403, "You don't have permission to do this."),
        ),
      );
    });
    it("should pass without authentication if publicOnDev on dev", async () => {
      //GIVEN
      isDevMock.mockReturnValue(true);
      const req = givenRequest(
        {
          ...requireAdminPermission,
          authenticationOptions: { isPublicOnDev: true },
        },
        { uid },
      );
      //WHEN
      await handler(req, res, next);

      //THEN
      expect(next).toHaveBeenCalledWith();
    });
    it("should fail without authentication if publicOnDev on prod ", async () => {
      //GIVEN
      const req = givenRequest(
        {
          ...requireAdminPermission,
          authenticationOptions: { isPublicOnDev: true },
        },
        { uid },
      );
      //WHEN
      await handler(req, res, next);

      //THEN
      expect(next).toHaveBeenCalledWith(
        expect.toMatchCrocoError(
          new CrocoError(403, "You don't have permission to do this."),
        ),
      );
    });
    it("should fail without admin permissions", async () => {
      //GIVEN
      const req = givenRequest(requireAdminPermission, { uid });

      //WHEN
      await handler(req, res, next);

      //THEN
      expect(next).toHaveBeenCalledWith(
        expect.toMatchCrocoError(
          new CrocoError(403, "You don't have permission to do this."),
        ),
      );
      expect(isAdminMock).toHaveBeenCalledWith(uid);
    });
  });
  describe("user checks", () => {
    it("should fetch user only once", async () => {
      //GIVEN
      const req = givenRequest(
        {
          requirePermission: ["canReport"],
        },
        { uid },
      );

      //WHEN
      await handler(req, res, next);

      //THEN
      expect(getPartialUserMock).toHaveBeenCalledOnce();
      expect(getPartialUserMock).toHaveBeenCalledWith(
        uid,
        "check user permissions",
        ["canReport"],
      );
    });
    it("should fail if authentication is missing", async () => {
      //GIVEN
      const req = givenRequest({
        requirePermission: ["canReport"],
      });

      //WHEN
      await handler(req, res, next);

      //THEN
      expect(next).toHaveBeenCalledWith(
        expect.toMatchCrocoError(
          new CrocoError(
            403,
            "Failed to check permissions, authentication required.",
          ),
        ),
      );
    });
  });
  describe("canReport check", () => {
    const requireCanReport: EndpointMetadata = {
      requirePermission: "canReport",
    };

    it("should fail if user cannot report", async () => {
      //GIVEN
      getPartialUserMock.mockResolvedValue({ canReport: false } as any);
      const req = givenRequest(requireCanReport, { uid });

      //WHEN
      await handler(req, res, next);

      //THEN
      expect(next).toHaveBeenCalledWith(
        expect.toMatchCrocoError(
          new CrocoError(403, "You don't have permission to do this."),
        ),
      );
      expect(getPartialUserMock).toHaveBeenCalledWith(
        uid,
        "check user permissions",
        ["canReport"],
      );
    });
    it("should pass if user can report", async () => {
      //GIVEN
      getPartialUserMock.mockResolvedValue({ canReport: true } as any);
      const req = givenRequest(requireCanReport, { uid });

      //WHEN
      await handler(req, res, next);

      //THEN
      expect(next).toHaveBeenCalledWith();
    });
    it("should pass if canReport is not set", async () => {
      //GIVEN
      getPartialUserMock.mockResolvedValue({} as any);
      const req = givenRequest(requireCanReport, { uid });

      //WHEN
      await handler(req, res, next);

      //THEN
      expect(next).toHaveBeenCalledWith();
    });
  });
});

function givenRequest(
  metadata: EndpointMetadata,
  decodedToken?: Partial<DecodedToken>,
): TsRestRequestWithContext {
  return {
    tsRestRoute: { metadata },
    ctx: { decodedToken },
  } as TsRestRequestWithContext;
}
