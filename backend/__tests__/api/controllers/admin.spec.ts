import { describe, it, expect, beforeEach, vi } from "vitest";
import { setup } from "../../__testData__/controller-test";
import { ObjectId } from "mongodb";
import * as Configuration from "../../../src/init/configuration";
import * as AdminUuidDal from "../../../src/dal/admin-uids";
import * as UserDal from "../../../src/dal/user";
import * as ReportDal from "../../../src/dal/report";
import * as LogsDal from "../../../src/dal/logs";

import { enableRateLimitExpects } from "../../__testData__/rate-limit";
import Test from "supertest/lib/test";

const { mockApp, uid } = setup();
const configuration = Configuration.getCachedConfiguration();
enableRateLimitExpects();

describe("AdminController", () => {
  const isAdminMock = vi.spyOn(AdminUuidDal, "isAdmin");
  const logsAddImportantLog = vi.spyOn(LogsDal, "addImportantLog");

  beforeEach(async () => {
    isAdminMock.mockClear();
    await enableAdminEndpoints(true);
    isAdminMock.mockResolvedValue(true);
    logsAddImportantLog.mockClear().mockResolvedValue();
  });

  describe("check for admin", () => {
    it("should succeed if user is admin", async () => {
      //GIVEN

      //WHEN
      const { body } = await mockApp
        .get("/admin")
        .set("Authorization", `Bearer ${uid}`)
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "OK",
        data: null,
      });

      expect(isAdminMock).toHaveBeenCalledWith(uid);
    });
    it("should fail if user is no admin", async () => {
      await expectFailForNonAdmin(
        mockApp.get("/admin").set("Authorization", `Bearer ${uid}`),
      );
    });
    it("should fail if admin endpoints are disabled", async () => {
      await expectFailForDisabledEndpoint(
        mockApp.get("/admin").set("Authorization", `Bearer ${uid}`),
      );
    });
    it("should be rate limited", async () => {
      await expect(
        mockApp.get("/admin").set("Authorization", `Bearer ${uid}`),
      ).toBeRateLimited({ max: 1, windowMs: 5000 });
    });
  });

  describe("toggle ban", () => {
    const userBannedMock = vi.spyOn(UserDal, "setBanned");
    const getUserMock = vi.spyOn(UserDal, "getPartialUser");

    beforeEach(() => {
      [userBannedMock, getUserMock].forEach((it) => it.mockClear());
      userBannedMock.mockResolvedValue();
    });

    //INV-190: banning no longer announces anything to Discord
    it("should ban user", async () => {
      //GIVEN
      const victimUid = new ObjectId().toHexString();
      getUserMock.mockResolvedValue({
        banned: false,
      } as any);

      //WHEN
      const { body } = await mockApp
        .post("/admin/toggleBan")
        .send({ uid: victimUid })
        .set("Authorization", `Bearer ${uid}`)
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "Ban toggled",
        data: { banned: true },
      });

      expect(getUserMock).toHaveBeenCalledWith(victimUid, "toggle ban", [
        "banned",
      ]);
      expect(userBannedMock).toHaveBeenCalledWith(victimUid, true);
    });
    it("should unban user", async () => {
      //GIVEN
      const victimUid = new ObjectId().toHexString();
      getUserMock.mockResolvedValue({
        banned: true,
      } as any);

      //WHEN
      const { body } = await mockApp
        .post("/admin/toggleBan")
        .send({ uid: victimUid })
        .set("Authorization", `Bearer ${uid}`)
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "Ban toggled",
        data: { banned: false },
      });

      expect(getUserMock).toHaveBeenCalledWith(victimUid, "toggle ban", [
        "banned",
      ]);
      expect(userBannedMock).toHaveBeenCalledWith(victimUid, false);
    });
    it("should fail without mandatory properties", async () => {
      //GIVEN

      //WHEN
      const { body } = await mockApp
        .post("/admin/toggleBan")
        .send({})
        .set("Authorization", `Bearer ${uid}`)
        .expect(422);

      //THEN
      expect(body).toEqual({
        message: "Invalid request data schema",
        validationErrors: ['"uid" Required'],
      });
    });
    it("should fail with unknown properties", async () => {
      //GIVEN

      //WHEN
      const { body } = await mockApp
        .post("/admin/toggleBan")
        .send({ uid: new ObjectId().toHexString(), extra: "value" })
        .set("Authorization", `Bearer ${uid}`)
        .expect(422);

      //THEN
      expect(body).toEqual({
        message: "Invalid request data schema",
        validationErrors: ["Unrecognized key(s) in object: 'extra'"],
      });
    });
    it("should fail if user is no admin", async () => {
      await expectFailForNonAdmin(
        mockApp
          .post("/admin/toggleBan")
          .send({ uid: new ObjectId().toHexString() })
          .set("Authorization", `Bearer ${uid}`),
      );
    });
    it("should fail if admin endpoints are disabled", async () => {
      //GIVEN
      await expectFailForDisabledEndpoint(
        mockApp
          .post("/admin/toggleBan")
          .send({ uid: new ObjectId().toHexString() })
          .set("Authorization", `Bearer ${uid}`),
      );
    });
    it("should be rate limited", async () => {
      //GIVEN
      const victimUid = new ObjectId().toHexString();
      getUserMock.mockResolvedValue({
        banned: false,
      } as any);

      //WHEN
      await expect(
        mockApp
          .post("/admin/toggleBan")
          .send({ uid: victimUid })
          .set("Authorization", `Bearer ${uid}`),
      ).toBeRateLimited({ max: 1, windowMs: 5000 });
    });
  });

  describe("accept reports", () => {
    const getReportsMock = vi.spyOn(ReportDal, "getReports");
    const deleteReportsMock = vi.spyOn(ReportDal, "deleteReports");
    const addToInboxMock = vi.spyOn(UserDal, "addToInbox");

    beforeEach(() => {
      [getReportsMock, deleteReportsMock, addToInboxMock].forEach((it) =>
        it.mockClear(),
      );
      deleteReportsMock.mockResolvedValue();
    });

    it("should accept reports", async () => {
      //GIVEN
      const reportOne = {
        id: "1",
        reason: "one",
      } as any as ReportDal.DBReport;
      const reportTwo = {
        id: "2",
        reason: "two",
      } as any as ReportDal.DBReport;
      getReportsMock.mockResolvedValue([reportOne, reportTwo]);

      //WHEN
      const { body } = await mockApp
        .post("/admin/report/accept")
        .send({
          reports: [{ reportId: reportOne.id }, { reportId: reportTwo.id }],
        })
        .set("Authorization", `Bearer ${uid}`)
        .expect(200);

      expect(body).toEqual({
        message: "Reports removed and users notified.",
        data: null,
      });

      expect(addToInboxMock).toHaveBeenCalledTimes(2);
      expect(deleteReportsMock).toHaveBeenCalledWith(["1", "2"]);
    });
    it("should fail wihtout mandatory properties", async () => {
      //WHEN
      const { body } = await mockApp
        .post("/admin/report/accept")
        .send({})
        .set("Authorization", `Bearer ${uid}`)
        .expect(422);

      expect(body).toEqual({
        message: "Invalid request data schema",
        validationErrors: ['"reports" Required'],
      });
    });
    it("should fail with empty reports", async () => {
      //WHEN
      const { body } = await mockApp
        .post("/admin/report/accept")
        .send({ reports: [] })
        .set("Authorization", `Bearer ${uid}`)
        .expect(422);

      expect(body).toEqual({
        message: "Invalid request data schema",
        validationErrors: [
          '"reports" Array must contain at least 1 element(s)',
        ],
      });
    });
    it("should fail with unknown properties", async () => {
      //WHEN
      const { body } = await mockApp
        .post("/admin/report/accept")
        .send({ reports: [{ reportId: "1", extra2: "value" }], extra: "value" })
        .set("Authorization", `Bearer ${uid}`)
        .expect(422);

      expect(body).toEqual({
        message: "Invalid request data schema",
        validationErrors: [
          `"reports.0" Unrecognized key(s) in object: 'extra2'`,
          "Unrecognized key(s) in object: 'extra'",
        ],
      });
    });
    it("should fail if user is no admin", async () => {
      await expectFailForNonAdmin(
        mockApp
          .post("/admin/report/accept")
          .send({ reports: [] })
          .set("Authorization", `Bearer ${uid}`),
      );
    });
    it("should fail if admin endpoints are disabled", async () => {
      //GIVEN
      await expectFailForDisabledEndpoint(
        mockApp
          .post("/admin/report/accept")
          .send({ reports: [] })
          .set("Authorization", `Bearer ${uid}`),
      );
    });
    it("should be rate limited", async () => {
      //GIVEN
      getReportsMock.mockResolvedValue([{ id: "1", reason: "one" } as any]);

      //WHEN
      await expect(
        mockApp
          .post("/admin/report/accept")
          .send({ reports: [{ reportId: "1" }] })
          .set("Authorization", `Bearer ${uid}`),
      ).toBeRateLimited({ max: 1, windowMs: 5000 });
    });
  });
  describe("reject reports", () => {
    const getReportsMock = vi.spyOn(ReportDal, "getReports");
    const deleteReportsMock = vi.spyOn(ReportDal, "deleteReports");
    const addToInboxMock = vi.spyOn(UserDal, "addToInbox");

    beforeEach(() => {
      [getReportsMock, deleteReportsMock, addToInboxMock].forEach((it) => {
        it.mockClear();
        deleteReportsMock.mockResolvedValue();
      });
    });

    it("should reject reports", async () => {
      //GIVEN
      const reportOne = {
        id: "1",
        reason: "one",
      } as any as ReportDal.DBReport;
      const reportTwo = {
        id: "2",
        reason: "two",
      } as any as ReportDal.DBReport;
      getReportsMock.mockResolvedValue([reportOne, reportTwo]);

      //WHEN
      const { body } = await mockApp
        .post("/admin/report/reject")
        .send({
          reports: [
            { reportId: reportOne.id, reason: "test" },
            { reportId: reportTwo.id },
          ],
        })
        .set("Authorization", `Bearer ${uid}`)
        .expect(200);

      expect(body).toEqual({
        message: "Reports removed and users notified.",
        data: null,
      });

      expect(addToInboxMock).toHaveBeenCalledTimes(2);
      expect(deleteReportsMock).toHaveBeenCalledWith(["1", "2"]);
    });
    it("should fail wihtout mandatory properties", async () => {
      //WHEN
      const { body } = await mockApp
        .post("/admin/report/reject")
        .send({})
        .set("Authorization", `Bearer ${uid}`)
        .expect(422);

      expect(body).toEqual({
        message: "Invalid request data schema",
        validationErrors: ['"reports" Required'],
      });
    });
    it("should fail with empty reports", async () => {
      //WHEN
      const { body } = await mockApp
        .post("/admin/report/reject")
        .send({ reports: [] })
        .set("Authorization", `Bearer ${uid}`)
        .expect(422);

      expect(body).toEqual({
        message: "Invalid request data schema",
        validationErrors: [
          '"reports" Array must contain at least 1 element(s)',
        ],
      });
    });
    it("should fail with unknown properties", async () => {
      //WHEN
      const { body } = await mockApp
        .post("/admin/report/reject")
        .send({ reports: [{ reportId: "1", extra2: "value" }], extra: "value" })
        .set("Authorization", `Bearer ${uid}`)
        .expect(422);

      expect(body).toEqual({
        message: "Invalid request data schema",
        validationErrors: [
          `"reports.0" Unrecognized key(s) in object: 'extra2'`,
          "Unrecognized key(s) in object: 'extra'",
        ],
      });
    });
    it("should fail if user is no admin", async () => {
      await expectFailForNonAdmin(
        mockApp
          .post("/admin/report/reject")
          .send({ reports: [] })
          .set("Authorization", `Bearer ${uid}`),
      );
    });
    it("should fail if admin endpoints are disabled", async () => {
      //GIVEN
      await expectFailForDisabledEndpoint(
        mockApp
          .post("/admin/report/reject")
          .send({ reports: [] })
          .set("Authorization", `Bearer ${uid}`),
      );
    });
    it("should be rate limited", async () => {
      //GIVEN
      getReportsMock.mockResolvedValue([{ id: "1", reason: "one" } as any]);

      //WHEN
      await expect(
        mockApp
          .post("/admin/report/reject")
          .send({ reports: [{ reportId: "1" }] })
          .set("Authorization", `Bearer ${uid}`),
      ).toBeRateLimited({ max: 1, windowMs: 5000 });
    });
  });

  async function expectFailForNonAdmin(call: Test): Promise<void> {
    isAdminMock.mockResolvedValue(false);
    const { body } = await call.expect(403);
    expect(body.message).toEqual("You don't have permission to do this.");
  }
  async function expectFailForDisabledEndpoint(call: Test): Promise<void> {
    await enableAdminEndpoints(false);
    const { body } = await call.expect(503);
    expect(body.message).toEqual("Admin endpoints are currently disabled.");
  }
});
async function enableAdminEndpoints(enabled: boolean): Promise<void> {
  const mockConfig = await configuration;
  mockConfig.admin = { ...mockConfig.admin, endpointsEnabled: enabled };

  vi.spyOn(Configuration, "getCachedConfiguration").mockResolvedValue(
    mockConfig,
  );
}
