import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
  vi,
} from "vitest";
import { setup } from "../../__testData__/controller-test";
import * as Configuration from "../../../src/init/configuration";
import { generateCurrentTestActivity } from "../../../src/api/controllers/user";
import * as UserDal from "../../../src/dal/user";
import * as AuthUtils from "../../../src/utils/auth";
import * as BlocklistDal from "../../../src/dal/blocklist";
import * as ConfigDal from "../../../src/dal/config";
import * as ResultDal from "../../../src/dal/result";
import * as ReportDal from "../../../src/dal/report";
import * as DailyLeaderboards from "../../../src/utils/daily-leaderboards";
import * as LeaderboardDal from "../../../src/dal/leaderboards";
import * as Captcha from "../../../src/utils/captcha";
import * as LogDal from "../../../src/dal/logs";
import { ObjectId } from "mongodb";
import { PersonalBest } from "@croco-calc/schemas/shared";
import { randomUUID } from "node:crypto";
import { CrocoMail } from "@croco-calc/schemas/users";
import CrocoError, { isFirebaseError } from "../../../src/utils/error";
import * as WeeklyXpLeaderboard from "../../../src/services/weekly-xp-leaderboard";
import * as ConnectionsDal from "../../../src/dal/connections";
import { pb } from "../../__testData__/users";
import Test from "supertest/lib/test";

const { mockApp, uid, mockAuth } = setup();
const configuration = Configuration.getCachedConfiguration();

/**
 * The router runs with `jsonQuery: true` (`src/api/routes/index.ts`), so every
 * query value arrives JSON-**decoded** — and the ts-rest client on the frontend
 * JSON-**encodes** them to match (`frontend/src/ts/ape/adapters/ts-rest-adapter.ts`).
 * supertest does neither, so a bare `mode2=8` reaches `Mode2Schema`
 * (`z.enum(["1", "2", "4", "8"])`) as the *number* 8 and is rejected with a 422
 * no real client could provoke. Only numeric-looking values need this:
 * `JSON.parse("time")` throws and ts-rest falls back to the raw string.
 */
const jsonQuery = (value: string): string => JSON.stringify(value);

describe("user controller test", () => {
  describe("user signup", () => {
    const blocklistContainsMock = vi.spyOn(BlocklistDal, "contains");
    const firebaseDeleteUserMock = vi.spyOn(AuthUtils, "deleteUser");
    const usernameAvailableMock = vi.spyOn(UserDal, "isNameAvailable");
    const verifyCaptchaMock = vi.spyOn(Captcha, "verify");
    beforeEach(async () => {
      await enableSignup(true);
      usernameAvailableMock.mockResolvedValue(true);
    });
    afterEach(() => {
      [
        blocklistContainsMock,
        firebaseDeleteUserMock,
        usernameAvailableMock,
      ].forEach((it) => it.mockClear());
    });

    it("should fail if blocklisted", async () => {
      //GIVEN
      blocklistContainsMock.mockResolvedValue(true);
      firebaseDeleteUserMock.mockResolvedValue();

      const newUser = {
        name: "NewUser",
        uid: uid,
        email: "newuser@mail.com",
        captcha: "captcha",
      };

      //WHEN
      const result = await mockApp
        .post("/users/signup")
        .set("Authorization", `Bearer ${uid}`)
        .send(newUser)
        .expect(409);

      //THEN
      expect(result.body.message).toEqual("Username or email blocked");
      expect(blocklistContainsMock).toHaveBeenCalledWith({
        name: "NewUser",
        email: "newuser@mail.com",
      });

      //user will be created in firebase from the frontend, make sure we remove it
      expect(firebaseDeleteUserMock).toHaveBeenCalledWith(uid);
      expect(verifyCaptchaMock).toHaveBeenCalledWith("captcha");
    });

    it("should fail if domain is blacklisted", async () => {
      for (const domain of ["tidal.lol", "selfbot.cc"]) {
        //GIVEN
        firebaseDeleteUserMock.mockResolvedValue();
        mockAuth.modifyToken({
          email: `newuser@${domain}`,
        });

        const newUser = {
          name: "NewUser",
          uid: uid,
          email: `newuser@${domain}`,
          captcha: "captcha",
        };

        //WHEN
        const result = await mockApp
          .post("/users/signup")
          .set("Authorization", `Bearer ${uid}`)
          .send(newUser)
          .set({
            Accept: "application/json",
          })
          .expect(400);

        //THEN
        expect(result.body.message).toEqual("Invalid domain");

        //user will be created in firebase from the frontend, make sure we remove it
        expect(firebaseDeleteUserMock).toHaveBeenCalledWith(uid);
      }
    });

    it("should fail if username is taken", async () => {
      //GIVEN
      usernameAvailableMock.mockResolvedValue(false);
      firebaseDeleteUserMock.mockResolvedValue();

      const newUser = {
        name: "NewUser",
        uid: uid,
        email: "newuser@mail.com",
        captcha: "captcha",
      };

      //WHEN
      const result = await mockApp
        .post("/users/signup")
        .set("Authorization", `Bearer ${uid}`)
        .send(newUser)
        .expect(409);

      //THEN
      expect(result.body.message).toEqual("Username unavailable");
      expect(usernameAvailableMock).toHaveBeenCalledWith("NewUser", uid);

      //user will be created in firebase from the frontend, make sure we remove it
      expect(firebaseDeleteUserMock).toHaveBeenCalledWith(uid);
    });
    it("should fail if capture is invalid", async () => {
      //GIVEN
      verifyCaptchaMock.mockResolvedValue(false);

      const newUser = {
        name: "NewUser",
        uid: uid,
        email: "newuser@mail.com",
        captcha: "captcha",
      };

      //WHEN
      const { body } = await mockApp
        .post("/users/signup")
        .set("Authorization", `Bearer ${uid}`)
        .send(newUser)
        .expect(422);

      //THEN
      expect(body.message).toEqual("Captcha challenge failed");
    });
    it("should fail if username too long", async () => {
      //GIVEN
      const newUser = {
        uid: uid,
        email: "newuser@mail.com",
        captcha: "captcha",
      };

      //WHEN
      const { body } = await mockApp
        .post("/users/signup")
        .set("Authorization", `Bearer ${uid}`)
        .send({ ...newUser, name: new Array(17).fill("x").join("") })
        .expect(422);

      //THEN
      expect(body).toEqual({
        message: "Invalid request data schema",
        validationErrors: [
          '"name" String must contain at most 16 character(s)',
        ],
      });
    });
    it("should fail if username contains disallowed word", async () => {
      //GIVEN
      const newUser = {
        uid: uid,
        email: "newuser@mail.com",
        captcha: "captcha",
      };

      //WHEN
      const { body } = await mockApp
        .post("/users/signup")
        .set("Authorization", `Bearer ${uid}`)
        .send({ ...newUser, name: "miodec" })
        .expect(422);

      //THEN
      expect(body).toEqual({
        message: "Invalid request data schema",
        validationErrors: [
          '"name" Disallowed word detected. Please remove it. If you believe this is a mistake, please contact us (miodec).',
        ],
      });
    });
  });
  describe("checkName", () => {
    const userIsNameAvailableMock = vi.spyOn(UserDal, "isNameAvailable");

    beforeEach(() => {
      userIsNameAvailableMock.mockClear();
    });

    it("returns available if name is available", async () => {
      //GIVEN
      userIsNameAvailableMock.mockResolvedValue(true);

      //WHEN
      const { body } = await mockApp
        .get("/users/checkName/bob")
        //no authentication required
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "Check username",
        data: { available: true },
      });
      expect(userIsNameAvailableMock).toHaveBeenCalledWith("bob", "");
    });

    it("returns taken if name is not available", async () => {
      //GIVEN
      userIsNameAvailableMock.mockResolvedValue(false);

      //WHEN
      const { body } = await mockApp
        .get("/users/checkName/bob")
        //no authentication required
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "Check username",
        data: { available: false },
      });

      expect(userIsNameAvailableMock).toHaveBeenCalledWith("bob", "");
    });
    it("returns ok if name is our own", async () => {
      //GIVEN
      userIsNameAvailableMock.mockResolvedValue(true);

      //WHEN
      const { body } = await mockApp
        .get("/users/checkName/bob")
        .set("Authorization", `Bearer ${uid}`)
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "Check username",
        data: { available: true },
      });
      expect(userIsNameAvailableMock).toHaveBeenCalledWith("bob", uid);
    });
    it("returns 422 if username contains disallowed word", async () => {
      await mockApp
        .get("/users/checkName/newMiodec")
        //no authentication required
        .expect(422);
    });
  });
  describe("getTestActivity", () => {
    const getUserMock = vi.spyOn(UserDal, "getPartialUser");
    afterAll(() => {
      getUserMock.mockClear();
    });
    //C16/INV-190: premium is cut, so test activity is available to every user
    it("should send data for any user", async () => {
      //given
      getUserMock.mockResolvedValue({
        testActivity: { "2023": [1, 2, 3], "2024": [4, 5, 6] },
      } as Partial<UserDal.DBUser> as UserDal.DBUser);

      //when
      const response = await mockApp
        .get("/users/testActivity")
        .set("Authorization", `Bearer ${uid}`)
        .send()
        .expect(200);

      //then
      const result = response.body.data;
      expect(result["2023"]).toEqual([1, 2, 3]);
      expect(result["2024"]).toEqual([4, 5, 6]);
    });
    it("should send null without any data", async () => {
      //given
      getUserMock.mockResolvedValue({} as UserDal.DBUser);

      //when
      const response = await mockApp
        .get("/users/testActivity")
        .set("Authorization", `Bearer ${uid}`)
        .send()
        .expect(200);

      //then
      expect(response.body.data).toBeNull();
    });
  });

  describe("generateCurrentTestActivity", () => {
    beforeAll(() => {
      vi.useFakeTimers().setSystemTime(1712102400000);
    });
    it("without any data", () => {
      expect(generateCurrentTestActivity(undefined)).toBeUndefined();
    });
    it("with current year only", () => {
      //given
      const data = {
        "2024": fillYearWithDay(94).map((it) => 2024000 + it),
      };

      //when
      const testActivity = generateCurrentTestActivity(data);

      //then
      expect(testActivity?.lastDay).toEqual(1712102400000);

      const testsByDays = testActivity?.testsByDays ?? [];
      expect(testsByDays).toHaveLength(372);
      expect(testsByDays[6]).toEqual(undefined); //2023-04-04
      expect(testsByDays[277]).toEqual(undefined); //2023-12-31
      expect(testsByDays[278]).toEqual(2024001); //2024-01-01
      expect(testsByDays[371]).toEqual(2024094); //2024-01
    });
    it("with current and last year", () => {
      //given
      const data = {
        "2023": fillYearWithDay(365).map((it) => 2023000 + it),
        "2024": fillYearWithDay(94).map((it) => 2024000 + it),
      };

      //when
      const testActivity = generateCurrentTestActivity(data);

      //then
      expect(testActivity?.lastDay).toEqual(1712102400000);

      const testsByDays = testActivity?.testsByDays ?? [];
      expect(testsByDays).toHaveLength(372);
      expect(testsByDays[6]).toEqual(2023094); //2023-04-04
      expect(testsByDays[277]).toEqual(2023365); //2023-12-31
      expect(testsByDays[278]).toEqual(2024001); //2024-01-01
      expect(testsByDays[371]).toEqual(2024094); //2024-01
    });
    it("with current and missing days of last year", () => {
      //given
      const data = {
        "2023": fillYearWithDay(20).map((it) => 2023000 + it),
        "2024": fillYearWithDay(94).map((it) => 2024000 + it),
      };

      //when
      const testActivity = generateCurrentTestActivity(data);

      //then
      expect(testActivity?.lastDay).toEqual(1712102400000);

      const testsByDays = testActivity?.testsByDays ?? [];
      expect(testsByDays).toHaveLength(372);
      expect(testsByDays[6]).toEqual(undefined); //2023-04-04
      expect(testsByDays[277]).toEqual(undefined); //2023-12-31
      expect(testsByDays[278]).toEqual(2024001); //2024-01-01
      expect(testsByDays[371]).toEqual(2024094); //2024-01
    });
  });
  describe("delete user ", () => {
    const getUserMock = vi.spyOn(UserDal, "getPartialUser");
    const deleteUserMock = vi.spyOn(UserDal, "deleteUser");
    const firebaseDeleteUserMock = vi.spyOn(AuthUtils, "deleteUser");
    const deleteConfigMock = vi.spyOn(ConfigDal, "deleteConfig");
    const deleteAllResultMock = vi.spyOn(ResultDal, "deleteAll");
    const purgeUserFromDailyLeaderboardsMock = vi.spyOn(
      DailyLeaderboards,
      "purgeUserFromDailyLeaderboards",
    );
    const purgeUserFromXpLeaderboardsMock = vi.spyOn(
      WeeklyXpLeaderboard,
      "purgeUserFromXpLeaderboards",
    );
    const blocklistAddMock = vi.spyOn(BlocklistDal, "add");
    const connectionsDeletebyUidMock = vi.spyOn(ConnectionsDal, "deleteByUid");
    const logsDeleteUserMock = vi.spyOn(LogDal, "deleteUserLogs");

    beforeEach(() => {
      [
        firebaseDeleteUserMock,
        deleteUserMock,
        blocklistAddMock,
        deleteConfigMock,
        purgeUserFromDailyLeaderboardsMock,
        purgeUserFromXpLeaderboardsMock,
        connectionsDeletebyUidMock,
        logsDeleteUserMock,
      ].forEach((it) => it.mockResolvedValue(undefined));

      deleteAllResultMock.mockResolvedValue({} as any);
    });

    afterEach(() => {
      [
        getUserMock,
        deleteUserMock,
        blocklistAddMock,
        firebaseDeleteUserMock,
        deleteConfigMock,
        deleteAllResultMock,
        purgeUserFromDailyLeaderboardsMock,
        purgeUserFromXpLeaderboardsMock,
        connectionsDeletebyUidMock,
        logsDeleteUserMock,
      ].forEach((it) => it.mockClear());
    });

    it("should delete user", async () => {
      //GIVEN
      const user = {
        uid,
        name: "name",
        email: "email",
        banned: true,
      } as Partial<UserDal.DBUser> as UserDal.DBUser;
      getUserMock.mockResolvedValue(user);

      //WHEN
      await mockApp
        .delete("/users/")
        .set("Authorization", `Bearer ${uid}`)
        .expect(200);

      //THEN
      expect(blocklistAddMock).toHaveBeenCalledWith(user);

      expect(deleteUserMock).toHaveBeenCalledWith(uid);
      expect(firebaseDeleteUserMock).toHaveBeenCalledWith(uid);
      expect(deleteConfigMock).toHaveBeenCalledWith(uid);
      expect(deleteAllResultMock).toHaveBeenCalledWith(uid);
      expect(connectionsDeletebyUidMock).toHaveBeenCalledWith(uid);
      expect(purgeUserFromDailyLeaderboardsMock).toHaveBeenCalledWith(
        uid,
        (await configuration).dailyLeaderboards,
      );
      expect(purgeUserFromXpLeaderboardsMock).toHaveBeenCalledWith(
        uid,
        (await configuration).leaderboards.weeklyXp,
      );
      expect(logsDeleteUserMock).toHaveBeenCalledWith(uid);
    });

    it("should delete user without adding to blocklist if not banned", async () => {
      //GIVEN
      const user = {
        uid,
        name: "name",
        email: "email",
      } as Partial<UserDal.DBUser> as UserDal.DBUser;
      getUserMock.mockResolvedValue(user);

      //WHEN
      await mockApp
        .delete("/users/")
        .set("Authorization", `Bearer ${uid}`)
        .expect(200);

      //THEN
      expect(blocklistAddMock).not.toHaveBeenCalled();
    });

    it("should not fail if userInfo cannot be found", async () => {
      //GIVEN
      getUserMock.mockRejectedValue(new CrocoError(404, "user not found"));

      //WHEN
      await mockApp
        .delete("/users/")
        .set("Authorization", `Bearer ${uid}`)
        .expect(200);

      //THEN
      expect(blocklistAddMock).not.toHaveBeenCalled();

      expect(deleteUserMock).toHaveBeenCalledWith(uid);
      expect(firebaseDeleteUserMock).toHaveBeenCalledWith(uid);
      expect(deleteConfigMock).toHaveBeenCalledWith(uid);
      expect(deleteAllResultMock).toHaveBeenCalledWith(uid);
      expect(connectionsDeletebyUidMock).toHaveBeenCalledWith(uid);
      expect(purgeUserFromDailyLeaderboardsMock).toHaveBeenCalledWith(
        uid,
        (await configuration).dailyLeaderboards,
      );
      expect(purgeUserFromXpLeaderboardsMock).toHaveBeenCalledWith(
        uid,
        (await configuration).leaderboards.weeklyXp,
      );
      expect(logsDeleteUserMock).toHaveBeenCalledWith(uid);
    });

    it("should fail for unknown error from UserDal", async () => {
      //GIVEN
      getUserMock.mockRejectedValue(new Error("oops"));

      //WHEN
      await mockApp
        .delete("/users/")
        .set("Authorization", `Bearer ${uid}`)
        .expect(500);

      //THEN
      expect(blocklistAddMock).not.toHaveBeenCalled();
      expect(deleteUserMock).not.toHaveBeenCalledWith(uid);
      expect(firebaseDeleteUserMock).not.toHaveBeenCalledWith(uid);
      expect(deleteConfigMock).not.toHaveBeenCalledWith(uid);
      expect(deleteAllResultMock).not.toHaveBeenCalledWith(uid);
      expect(connectionsDeletebyUidMock).not.toHaveBeenCalledWith(uid);
      expect(purgeUserFromDailyLeaderboardsMock).not.toHaveBeenCalledWith(
        uid,
        (await configuration).dailyLeaderboards,
      );
      expect(purgeUserFromXpLeaderboardsMock).not.toHaveBeenCalledWith(
        uid,
        (await configuration).leaderboards.weeklyXp,
      );
      expect(logsDeleteUserMock).not.toHaveBeenCalled();
    });
    it("should not fail if firebase user cannot be found", async () => {
      //GIVEN
      const user = {
        uid,
        name: "name",
        email: "email",
      } as Partial<UserDal.DBUser> as UserDal.DBUser;
      getUserMock.mockResolvedValue(user);
      firebaseDeleteUserMock.mockRejectedValue({
        code: "user-not-found",
        codePrefix: "auth",
        errorInfo: { code: "auth/user-not-found", message: "user not found" },
      });

      //WHEN
      await mockApp
        .delete("/users/")
        .set("Authorization", `Bearer ${uid}`)
        .expect(200);

      //THEN
      expect(blocklistAddMock).not.toHaveBeenCalled();

      expect(deleteUserMock).toHaveBeenCalledWith(uid);
      expect(firebaseDeleteUserMock).toHaveBeenCalledWith(uid);
      expect(deleteConfigMock).toHaveBeenCalledWith(uid);
      expect(deleteAllResultMock).toHaveBeenCalledWith(uid);
      expect(connectionsDeletebyUidMock).toHaveBeenCalledWith(uid);
      expect(purgeUserFromDailyLeaderboardsMock).toHaveBeenCalledWith(
        uid,
        (await configuration).dailyLeaderboards,
      );
      expect(purgeUserFromXpLeaderboardsMock).toHaveBeenCalledWith(
        uid,
        (await configuration).leaderboards.weeklyXp,
      );
      expect(logsDeleteUserMock).toHaveBeenCalledWith(uid);
    });

    it("should fail for unknown error from firebase", async () => {
      //GIVEN
      const user = {
        uid,
        name: "name",
        email: "email",
      } as Partial<UserDal.DBUser> as UserDal.DBUser;
      getUserMock.mockResolvedValue(user);
      firebaseDeleteUserMock.mockRejectedValue({
        code: "unknown",
        codePrefix: "auth",
        errorInfo: { code: "auth/unknown", message: "unknown" },
      });

      //WHEN
      await mockApp
        .delete("/users/")
        .set("Authorization", `Bearer ${uid}`)
        .expect(500);

      //THEN
      expect(blocklistAddMock).not.toHaveBeenCalled();
      expect(deleteUserMock).toHaveBeenCalledWith(uid);
      expect(firebaseDeleteUserMock).toHaveBeenCalledWith(uid);
      expect(deleteConfigMock).toHaveBeenCalledWith(uid);
      expect(deleteAllResultMock).toHaveBeenCalledWith(uid);
      expect(connectionsDeletebyUidMock).toHaveBeenCalledWith(uid);
      expect(purgeUserFromDailyLeaderboardsMock).toHaveBeenCalledWith(
        uid,
        (await configuration).dailyLeaderboards,
      );
      expect(purgeUserFromXpLeaderboardsMock).toHaveBeenCalledWith(
        uid,
        (await configuration).leaderboards.weeklyXp,
      );
    });
  });
  describe("resetUser", () => {
    const getPartialUserMock = vi.spyOn(UserDal, "getPartialUser");
    const resetUserMock = vi.spyOn(UserDal, "resetUser");
    const deleteAllResultsMock = vi.spyOn(ResultDal, "deleteAll");
    const deleteConfigMock = vi.spyOn(ConfigDal, "deleteConfig");
    const purgeUserFromDailyLeaderboardsMock = vi.spyOn(
      DailyLeaderboards,
      "purgeUserFromDailyLeaderboards",
    );
    const purgeUserFromXpLeaderboardsMock = vi.spyOn(
      WeeklyXpLeaderboard,
      "purgeUserFromXpLeaderboards",
    );

    const addImportantLogMock = vi.spyOn(LogDal, "addImportantLog");

    beforeEach(() => {
      getPartialUserMock.mockClear().mockResolvedValue({
        banned: false,
        name: "bob",
        email: "bob@example.com",
      } as any);
      deleteAllResultsMock.mockClear().mockResolvedValue(null as any);
      [
        purgeUserFromXpLeaderboardsMock,
        addImportantLogMock,
        resetUserMock,
        deleteConfigMock,
        purgeUserFromDailyLeaderboardsMock,
      ].forEach((it) => it.mockClear().mockResolvedValue());
    });

    it("should reset user", async () => {
      //GIVEN

      //WHEN
      const { body } = await mockApp
        .patch("/users/reset")
        .set("Authorization", `Bearer ${uid}`)
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "User reset",
        data: null,
      });

      for (const it of [
        resetUserMock,
        deleteAllResultsMock,
        deleteConfigMock,
      ]) {
        expect(it).toHaveBeenCalledWith(uid);
      }
      expect(purgeUserFromDailyLeaderboardsMock).toHaveBeenCalledWith(
        uid,
        (await Configuration.getLiveConfiguration()).dailyLeaderboards,
      );
      expect(purgeUserFromXpLeaderboardsMock).toHaveBeenCalledWith(
        uid,
        (await configuration).leaderboards.weeklyXp,
      );
      /*TODO
      expect(addImportantLogMock).toHaveBeenCalledWith(
        "user_reset",
        "bob@example.com bob",
        uid
      );*/
    });
    it("should fail resetting a banned user", async () => {
      //GIVEN
      getPartialUserMock.mockResolvedValue({ banned: true } as any);

      //WHEN
      const { body } = await mockApp
        .patch("/users/reset")
        .set("Authorization", `Bearer ${uid}`)
        .expect(403);

      //THEN
      expect(body.message).toEqual("Banned users cannot reset their account");
    });
  });
  describe("update name", () => {
    const blocklistContainsMock = vi.spyOn(BlocklistDal, "contains");
    const getPartialUserMock = vi.spyOn(UserDal, "getPartialUser");
    const updateNameMock = vi.spyOn(UserDal, "updateName");
    const connectionsUpdateNameMock = vi.spyOn(ConnectionsDal, "updateName");
    const addImportantLogMock = vi.spyOn(LogDal, "addImportantLog");

    beforeEach(() => {
      [
        blocklistContainsMock,
        getPartialUserMock,
        updateNameMock,
        connectionsUpdateNameMock,
        addImportantLogMock,
      ].forEach((it) => {
        it.mockClear().mockResolvedValue(null as never);
      });
    });

    it("should update the username", async () => {
      //GIVEN
      getPartialUserMock.mockResolvedValue({
        name: "Bob",
        lastNameChange: 1000,
      } as any);
      //WHEN
      const { body } = await mockApp
        .patch("/users/name")
        .set("Authorization", `Bearer ${uid}`)
        .send({ name: "newName" })
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "User's name updated",
        data: null,
      });

      expect(updateNameMock).toHaveBeenCalledWith(uid, "newName", "Bob");
      expect(addImportantLogMock).toHaveBeenCalledWith(
        "user_name_updated",
        "changed name from Bob to newName",
        uid,
      );
      expect(connectionsUpdateNameMock).toHaveBeenCalledWith(uid, "newName");
    });

    it("should fail if username is blocked", async () => {
      //GIVEN
      blocklistContainsMock.mockResolvedValue(true);

      //WHEN
      const { body } = await mockApp
        .patch("/users/name")
        .set("Authorization", `Bearer ${uid}`)
        .send({ name: "newName" })
        .expect(409);

      //THEN
      expect(body.message).toEqual("Username blocked");
      expect(updateNameMock).not.toHaveBeenCalled();
      expect(connectionsUpdateNameMock).not.toHaveBeenCalled();
    });

    it("should fail for banned users", async () => {
      //GIVEN
      getPartialUserMock.mockResolvedValue({ banned: true } as any);

      //WHEN
      const { body } = await mockApp
        .patch("/users/name")
        .set("Authorization", `Bearer ${uid}`)
        .send({ name: "newName" })
        .expect(403);

      //THEN
      expect(body.message).toEqual("Banned users cannot change their name");
      expect(updateNameMock).not.toHaveBeenCalled();
    });
    it("should fail changing name within last 30 days", async () => {
      //GIVEN
      getPartialUserMock.mockResolvedValue({
        lastNameChange: Date.now().valueOf() - 60_000,
      } as any);

      //WHEN
      const { body } = await mockApp
        .patch("/users/name")
        .set("Authorization", `Bearer ${uid}`)
        .send({ name: "newName" })
        .expect(409);

      //THEN
      expect(body.message).toEqual(
        "You can change your name once every 30 days",
      );
      expect(updateNameMock).not.toHaveBeenCalled();
    });
    it("should update the username within 30 days if user needs to change", async () => {
      //GIVEN
      getPartialUserMock.mockResolvedValue({
        name: "Bob",
        lastNameChange: Date.now().valueOf() - 60_000,
        needsToChangeName: true,
      } as any);
      //WHEN
      const { body } = await mockApp
        .patch("/users/name")
        .set("Authorization", `Bearer ${uid}`)
        .send({ name: "newName" })
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "User's name updated",
        data: null,
      });

      expect(updateNameMock).toHaveBeenCalledWith(uid, "newName", "Bob");
    });
    it("should fail without mandatory properties", async () => {
      //WHEN
      const { body } = await mockApp
        .patch("/users/name")
        .set("Authorization", `Bearer ${uid}`)
        .expect(422);

      //THEN
      expect(body).toEqual({
        message: "Invalid request data schema",
        validationErrors: ['"name" Required'],
      });
    });
    it("should fail without unknown properties", async () => {
      //WHEN
      const { body } = await mockApp
        .patch("/users/name")
        .set("Authorization", `Bearer ${uid}`)
        .send({ name: "newName", extra: "value" })
        .expect(422);

      //THEN
      expect(body).toEqual({
        message: "Invalid request data schema",
        validationErrors: ["Unrecognized key(s) in object: 'extra'"],
      });
    });
    it("should fail if username contains disallowed word", async () => {
      //WHEN
      const { body } = await mockApp
        .patch("/users/name")
        .set("Authorization", `Bearer ${uid}`)
        .send({ name: "miodec" })
        .expect(422);

      //THEN
      expect(body).toEqual({
        message: "Invalid request data schema",
        validationErrors: [
          '"name" Disallowed word detected. Please remove it. If you believe this is a mistake, please contact us (miodec).',
        ],
      });
    });
  });
  describe("clear PBs", () => {
    const clearPbMock = vi.spyOn(UserDal, "clearPb");
    const purgeUserFromDailyLeaderboardsMock = vi.spyOn(
      DailyLeaderboards,
      "purgeUserFromDailyLeaderboards",
    );
    const addImportantLogMock = vi.spyOn(LogDal, "addImportantLog");

    beforeEach(() => {
      [
        clearPbMock,
        purgeUserFromDailyLeaderboardsMock,
        addImportantLogMock,
      ].forEach((it) => it.mockClear().mockResolvedValue());
    });

    it("should clear pb", async () => {
      //GIVEN

      //WHEN
      const { body } = await mockApp
        .delete("/users/personalBests")
        .set("Authorization", `Bearer ${uid}`)
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "User's PB cleared",
        data: null,
      });
      expect(clearPbMock).toHaveBeenCalledWith(uid);
      expect(purgeUserFromDailyLeaderboardsMock).toHaveBeenCalledWith(
        uid,
        (await Configuration.getLiveConfiguration()).dailyLeaderboards,
      );
      expect(addImportantLogMock).toHaveBeenCalledWith(
        "user_cleared_pbs",
        "",
        uid,
      );
    });
  });
  describe("opt out of leaderboard", () => {
    const optOutOfLeaderboardsMock = vi.spyOn(UserDal, "optOutOfLeaderboards");
    const purgeUserFromDailyLeaderboardsMock = vi.spyOn(
      DailyLeaderboards,
      "purgeUserFromDailyLeaderboards",
    );
    const addImportantLogMock = vi.spyOn(LogDal, "addImportantLog");

    beforeEach(() => {
      [
        optOutOfLeaderboardsMock.mockClear(),
        purgeUserFromDailyLeaderboardsMock,
        addImportantLogMock,
      ].forEach((it) => it.mockClear().mockResolvedValue());
    });
    it("should opt out", async () => {
      //GIVEN

      //WHEN
      const { body } = await mockApp
        .post("/users/optOutOfLeaderboards")
        .set("Authorization", `Bearer ${uid}`)
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "User opted out of leaderboards",
        data: null,
      });

      expect(optOutOfLeaderboardsMock).toHaveBeenCalledWith(uid);
      expect(purgeUserFromDailyLeaderboardsMock).toHaveBeenCalledWith(
        uid,
        (await Configuration.getLiveConfiguration()).dailyLeaderboards,
      );
      expect(addImportantLogMock).toHaveBeenCalledWith(
        "user_opted_out_of_leaderboards",
        "",
        uid,
      );
    });
    // it("should fail with unknown properties", async () => {
    //WHEN
    // const { body } = await mockApp
    //   .post("/users/optOutOfLeaderboards")
    //   .set("Authorization", `Bearer ${uid}`)
    //   .send({ extra: "value" });
    //TODO.expect(422);
    //THEN
    /* TODO:
        expect(body).toEqual({});
        */
    // });
  });
  describe("update email", () => {
    const authUpdateEmailMock = vi.spyOn(AuthUtils, "updateUserEmail");
    const userUpdateEmailMock = vi.spyOn(UserDal, "updateEmail");
    const addImportantLogMock = vi.spyOn(LogDal, "addImportantLog");

    beforeEach(() => {
      [authUpdateEmailMock, userUpdateEmailMock, addImportantLogMock].forEach(
        (it) => it.mockClear().mockResolvedValue(null as never),
      );
    });
    it("should update users email", async () => {
      //GIVEN
      const newEmail = "newEmail@example.com";

      //WHEN
      const { body } = await mockApp
        .patch("/users/email")
        .set("Authorization", `Bearer ${uid}`)
        .send({ newEmail, previousEmail: "previousEmail@example.com" })
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "Email updated",
        data: null,
      });

      expect(authUpdateEmailMock).toHaveBeenCalledWith(
        uid,
        newEmail.toLowerCase(),
      );
      expect(userUpdateEmailMock).toHaveBeenCalledWith(
        uid,
        newEmail.toLowerCase(),
      );
      expect(addImportantLogMock).toHaveBeenCalledWith(
        "user_email_updated",
        "changed email from previousemail@example.com to newemail@example.com",
        uid,
      );
    });
    it("should fail for duplicate email", async () => {
      //GIVEN
      const mockFirebaseError = {
        code: "auth/email-already-exists",
        codePrefix: "auth",
        errorInfo: {
          code: "auth/email-already-exists",
          message: "Email already exists",
        },
      };
      authUpdateEmailMock.mockRejectedValue(mockFirebaseError);
      expect(isFirebaseError(mockFirebaseError)).toBe(true);

      //WHEN
      const { body } = await mockApp
        .patch("/users/email")
        .set("Authorization", `Bearer ${uid}`)
        .send({
          newEmail: "newEmail@example.com",
          previousEmail: "previousEmail@example.com",
        })
        .expect(409);

      expect(body.message).toEqual(
        "The email address is already in use by another account",
      );

      expect(userUpdateEmailMock).not.toHaveBeenCalled();
    });

    it("should fail for invalid email", async () => {
      //GIVEN
      const mockFirebaseError = {
        code: "auth/invalid-email",
        codePrefix: "auth",
        errorInfo: {
          code: "auth/invalid-email",
          message: "Invalid email",
        },
      };
      authUpdateEmailMock.mockRejectedValue(mockFirebaseError);
      expect(isFirebaseError(mockFirebaseError)).toBe(true);

      //WHEN
      const { body } = await mockApp
        .patch("/users/email")
        .set("Authorization", `Bearer ${uid}`)
        .send({
          newEmail: "newEmail@example.com",
          previousEmail: "previousEmail@example.com",
        })
        .expect(400);

      expect(body.message).toEqual("Invalid email address");

      expect(userUpdateEmailMock).not.toHaveBeenCalled();
    });
    it("should fail for too many requests", async () => {
      //GIVEN
      const mockFirebaseError = {
        code: "auth/too-many-requests",
        codePrefix: "auth",
        errorInfo: {
          code: "auth/too-many-requests",
          message: "Too many requests",
        },
      };
      authUpdateEmailMock.mockRejectedValue(mockFirebaseError);
      expect(isFirebaseError(mockFirebaseError)).toBe(true);

      //WHEN
      const { body } = await mockApp
        .patch("/users/email")
        .set("Authorization", `Bearer ${uid}`)
        .send({
          newEmail: "newEmail@example.com",
          previousEmail: "previousEmail@example.com",
        })
        .expect(429);

      expect(body.message).toEqual("Too many requests. Please try again later");

      expect(userUpdateEmailMock).not.toHaveBeenCalled();
    });
    it("should fail for unknown user", async () => {
      //GIVEN
      const mockFirebaseError = {
        code: "auth/user-not-found",
        codePrefix: "auth",
        errorInfo: {
          code: "auth/user-not-found",
          message: "User not found",
        },
      };
      authUpdateEmailMock.mockRejectedValue(mockFirebaseError);
      expect(isFirebaseError(mockFirebaseError)).toBe(true);

      //WHEN
      const { body } = await mockApp
        .patch("/users/email")
        .set("Authorization", `Bearer ${uid}`)
        .send({
          newEmail: "newEmail@example.com",
          previousEmail: "previousEmail@example.com",
        })
        .expect(404);

      expect(body.message).toEqual(
        "User not found in the auth system\nStack: update email",
      );

      expect(userUpdateEmailMock).not.toHaveBeenCalled();
    });
    it("should fail for invalid user token", async () => {
      //GIVEN
      authUpdateEmailMock.mockRejectedValue({
        code: "auth/invalid-user-token",
        codePrefix: "auth",
        errorInfo: {
          code: "auth/invalid-user-token",
          message: "Invalid user token",
        },
      });

      //WHEN
      const { body } = await mockApp
        .patch("/users/email")
        .set("Authorization", `Bearer ${uid}`)
        .send({
          newEmail: "newEmail@example.com",
          previousEmail: "previousEmail@example.com",
        })
        .expect(401);

      expect(body.message).toEqual("Invalid user token\nStack: update email");

      expect(userUpdateEmailMock).not.toHaveBeenCalled();
    });
    it("should fail for unknown error", async () => {
      //GIVEN
      authUpdateEmailMock.mockRejectedValue({});

      //WHEN
      await mockApp
        .patch("/users/email")
        .set("Authorization", `Bearer ${uid}`)
        .send({
          newEmail: "newEmail@example.com",
          previousEmail: "previousEmail@example.com",
        })
        .expect(500);
    });
    it("should fail without mandatory properties", async () => {
      //WHEN
      const { body } = await mockApp
        .patch("/users/email")
        .set("Authorization", `Bearer ${uid}`)
        .expect(422);

      expect(body).toEqual({
        message: "Invalid request data schema",
        validationErrors: ['"newEmail" Required', '"previousEmail" Required'],
      });
    });
    it("should fail with unknown properties", async () => {
      //WHEN
      const { body } = await mockApp
        .patch("/users/email")
        .set("Authorization", `Bearer ${uid}`)
        .send({
          newEmail: "newEmail@example.com",
          previousEmail: "previousEmail@example.com",
          extra: "value",
        })
        .expect(422);

      expect(body).toEqual({
        message: "Invalid request data schema",
        validationErrors: ["Unrecognized key(s) in object: 'extra'"],
      });
    });
  });
  describe("update password", () => {
    const updatePasswordMock = vi.spyOn(AuthUtils, "updateUserPassword");

    beforeEach(() => {
      updatePasswordMock.mockClear().mockResolvedValue(null as never);
    });

    it("should update password", async () => {
      //WHEN
      const { body } = await mockApp
        .patch("/users/password")
        .set("Authorization", `Bearer ${uid}`)
        .send({ newPassword: "sw0rdf1sh" })
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "Password updated",
        data: null,
      });
      expect(updatePasswordMock).toHaveBeenCalledWith(uid, "sw0rdf1sh");
    });
    it("should fail without mandatory properties", async () => {
      //WHEN
      const { body } = await mockApp
        .patch("/users/password")
        .set("Authorization", `Bearer ${uid}`)
        .expect(422);

      //THEN
      expect(body).toEqual({
        message: "Invalid request data schema",
        validationErrors: ['"newPassword" Required'],
      });
    });
    it("should fail with unknown properties", async () => {
      //WHEN
      const { body } = await mockApp
        .patch("/users/password")
        .set("Authorization", `Bearer ${uid}`)
        .send({ newPassword: "sw0rdf1sh", extra: "value" })
        .expect(422);

      //THEN
      expect(body).toEqual({
        message: "Invalid request data schema",
        validationErrors: ["Unrecognized key(s) in object: 'extra'"],
      });
    });
    it("should fail with password too short", async () => {
      //WHEN
      const { body } = await mockApp
        .patch("/users/password")
        .set("Authorization", `Bearer ${uid}`)
        .send({ newPassword: "test" })
        .expect(422);

      //THEN
      expect(body).toEqual({
        message: "Invalid request data schema",
        validationErrors: [
          '"newPassword" String must contain at least 6 character(s)',
        ],
      });
    });
  });
  describe("add result filter preset", () => {
    // AC-078 / AC-081: the filter dimensions are the croco calc settings plus
    // `time`, `pb` and `date`, and nothing else (AC-079). Keys are the C2
    // canonical stored literals. monkeytype's difficulty / mode / words / quote /
    // punctuation / numbers / tags / language / funbox axes are all gone.
    const validPreset = {
      _id: "66c61b7a2a65715e66a0cc95",
      name: "newPreset",
      pb: { true: true, false: true },
      time: { "1": false, "2": false, "4": true, "8": true },
      addition: { off: false, "100": true, "1000": false },
      multiplication: { off: false, "12": true, "20": false, "100": false },
      division: { off: true, tables: false, threeByTwo: false },
      fractionAddition: { off: true, "12": false, "99": false },
      fractionMultiplication: { true: false, false: true },
      decimals: { true: false, false: true },
      negatives: { true: false, false: true },
      date: {
        last_day: false,
        last_week: false,
        last_month: false,
        last_3months: false,
        all: true,
      },
    };
    const generatedId = new ObjectId();

    const addResultFilterPresetMock = vi.spyOn(
      UserDal,
      "addResultFilterPreset",
    );

    beforeEach(async () => {
      addResultFilterPresetMock.mockClear().mockResolvedValue(generatedId);
      await enableResultFilterPresets(true);
    });
    it("should add", async () => {
      //GIVEN

      //WHEN
      const { body } = await mockApp
        .post("/users/resultFilterPresets")
        .set("Authorization", `Bearer ${uid}`)
        .send(validPreset)
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "Result filter preset created",
        data: generatedId.toHexString(),
      });

      expect(addResultFilterPresetMock).toHaveBeenCalledWith(
        uid,
        validPreset,
        (await Configuration.getLiveConfiguration()).results.filterPresets
          .maxPresetsPerUser,
      );
    });
    it("should fail without mandatory properties", async () => {
      //WHEN
      const { body } = await mockApp
        .post("/users/resultFilterPresets")
        .set("Authorization", `Bearer ${uid}`)
        .expect(422);

      //THEN
      expect(body).toEqual({
        message: "Invalid request data schema",
        // AC-079: exactly these dimensions, and nothing else.
        validationErrors: [
          '"_id" Required',
          '"name" Required',
          '"pb" Required',
          '"time" Required',
          '"addition" Required',
          '"multiplication" Required',
          '"division" Required',
          '"fractionAddition" Required',
          '"fractionMultiplication" Required',
          '"decimals" Required',
          '"negatives" Required',
          '"date" Required',
        ],
      });
    });
    it("should fail with unknown properties", async () => {
      //WHEN
      const { body } = await mockApp
        .post("/users/resultFilterPresets")
        .set("Authorization", `Bearer ${uid}`)
        .send({ ...validPreset, extra: "value" })
        .expect(422);

      //THEN
      expect(body).toEqual({
        message: "Invalid request data schema",
        validationErrors: ["Unrecognized key(s) in object: 'extra'"],
      });
    });
    it("should fail if feature is disabled", async () => {
      //GIVEN
      await enableResultFilterPresets(false);
      //WHEN
      const { body } = await mockApp
        .post("/users/resultFilterPresets")
        .set("Authorization", `Bearer ${uid}`)
        .send({ validPreset })
        .expect(503);

      //THEN
      expect(body.message).toEqual(
        "Result filter presets are not available at this time.",
      );
    });
  });
  describe("remove result filter preset", () => {
    const removeResultFilterPresetMock = vi.spyOn(
      UserDal,
      "removeResultFilterPreset",
    );

    beforeEach(async () => {
      await enableResultFilterPresets(true);
      removeResultFilterPresetMock.mockClear().mockResolvedValue();
    });

    it("should remove filter preset", async () => {
      //WHEN
      const { body } = await mockApp
        .delete("/users/resultFilterPresets/myId")
        .set("Authorization", `Bearer ${uid}`)
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "Result filter preset deleted",
        data: null,
      });
      expect(removeResultFilterPresetMock).toHaveBeenCalledWith(uid, "myId");
    });
    it("should fail if feature is disabled", async () => {
      //GIVEN
      await enableResultFilterPresets(false);

      //WHEN
      const { body } = await mockApp
        .delete("/users/resultFilterPresets/myId")
        .set("Authorization", `Bearer ${uid}`)
        .expect(503);

      //THEN
      expect(body.message).toEqual(
        "Result filter presets are not available at this time.",
      );
    });
  });
  describe("update lb memory", () => {
    const updateLbMemoryMock = vi.spyOn(UserDal, "updateLbMemory");
    beforeEach(() => {
      updateLbMemoryMock.mockClear().mockResolvedValue();
    });

    // INV-153: the leaderboard has no language axis, so `language` is gone from
    // the request and from `UserDAL.updateLbMemory`. Mode2 is "1" | "2" | "4" | "8".
    it("should update lb", async () => {
      //WHEN
      const { body } = await mockApp
        .patch("/users/leaderboardMemory")
        .send({
          mode: "time",
          mode2: "8",
          rank: 7,
        })
        .set("Authorization", `Bearer ${uid}`)
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "Leaderboard memory updated",
        data: null,
      });

      expect(updateLbMemoryMock).toHaveBeenCalledWith(uid, "time", "8", 7);
    });

    it("should fail without mandatory properties", async () => {
      //WHEN
      const { body } = await mockApp
        .patch("/users/leaderboardMemory")
        .set("Authorization", `Bearer ${uid}`)
        .expect(422);

      //THEN
      expect(body).toEqual({
        message: "Invalid request data schema",
        validationErrors: [
          '"mode" Required',
          '"mode2" Needs to be "1", "2", "4" or "8".',
          '"rank" Required',
        ],
      });
    });
    it("should fail with unknown properties", async () => {
      //WHEN
      const { body } = await mockApp
        .patch("/users/leaderboardMemory")
        .set("Authorization", `Bearer ${uid}`)
        .send({
          mode: "time",
          mode2: "8",
          rank: 7,
          extra: "value",
        })
        .expect(422);

      //THEN
      expect(body).toEqual({
        message: "Invalid request data schema",
        validationErrors: ["Unrecognized key(s) in object: 'extra'"],
      });
    });
  });
  describe("get custom themes", () => {
    const getThemesMock = vi.spyOn(UserDal, "getThemes");
    beforeEach(() => {
      getThemesMock.mockClear();
    });
    it("should get custom themes", async () => {
      //GIVEN
      const themeOne: UserDal.DBCustomTheme = {
        _id: new ObjectId(),
        name: "themeOne",
        colors: new Array(10).fill("#000000") as any,
      };
      const themeTwo: UserDal.DBCustomTheme = {
        _id: new ObjectId(),
        name: "themeTwo",
        colors: new Array(10).fill("#FFFFFF") as any,
      };
      getThemesMock.mockResolvedValue([themeOne, themeTwo]);

      //WHEN
      const { body } = await mockApp
        .get("/users/customThemes")
        .set("Authorization", `Bearer ${uid}`)
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "Custom themes retrieved",
        data: [
          { ...themeOne, _id: themeOne._id.toHexString() },
          { ...themeTwo, _id: themeTwo._id.toHexString() },
        ],
      });
    });
  });
  describe("add custom theme", () => {
    const addThemeMock = vi.spyOn(UserDal, "addTheme");
    beforeEach(() => {
      addThemeMock.mockClear();
    });

    it("should add", async () => {
      //GIVEN
      const addedTheme: UserDal.DBCustomTheme = {
        _id: new ObjectId(),
        name: "custom",
        colors: new Array(10).fill("#000000") as any,
      };
      addThemeMock.mockResolvedValue(addedTheme);

      //WHEN
      const { body } = await mockApp
        .post("/users/customThemes")
        .set("Authorization", `Bearer ${uid}`)
        .send({
          name: "customTheme",
          colors: new Array(10).fill("#000000") as any,
        })
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "Custom theme added",
        data: { ...addedTheme, _id: addedTheme._id.toHexString() },
      });
      expect(addThemeMock).toHaveBeenCalledWith(uid, {
        name: "customTheme",
        colors: new Array(10).fill("#000000") as any,
      });
    });
    it("should fail without mandatory properties", async () => {
      //WHEN
      const { body } = await mockApp
        .post("/users/customThemes")
        .set("Authorization", `Bearer ${uid}`)
        .expect(422);

      //THEN
      expect(body).toEqual({
        message: "Invalid request data schema",
        validationErrors: ['"name" Required', '"colors" Required'],
      });
    });
    it("should fail with unknown properties", async () => {
      //WHEN
      const { body } = await mockApp
        .post("/users/customThemes")
        .set("Authorization", `Bearer ${uid}`)
        .send({
          name: "customTheme",
          colors: new Array(10).fill("#000000") as any,
          extra: "value",
        })
        .expect(422);

      //THEN
      expect(body).toEqual({
        message: "Invalid request data schema",
        validationErrors: ["Unrecognized key(s) in object: 'extra'"],
      });
    });
    it("should fail with invalid properties", async () => {
      //WHEN
      const { body } = await mockApp
        .post("/users/customThemes")
        .set("Authorization", `Bearer ${uid}`)
        .send({
          name: "customThemecustomThemecustomThemecustomTheme",
          colors: new Array(9).fill("#000") as any,
        })
        .expect(422);

      //THEN
      expect(body).toEqual({
        message: "Invalid request data schema",
        validationErrors: [
          '"name" String must contain at most 16 character(s)',
          '"colors" Array must contain at least 10 element(s)',
        ],
      });
    });
  });
  describe("remove custom theme", () => {
    const removeThemeMock = vi.spyOn(UserDal, "removeTheme");

    beforeEach(() => {
      removeThemeMock.mockClear().mockResolvedValue();
    });

    it("should remove theme", async () => {
      //GIVEN
      const themeId = new ObjectId().toHexString();

      //WHEN
      const { body } = await mockApp
        .delete("/users/customThemes")
        .set("Authorization", `Bearer ${uid}`)
        .send({ themeId })
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "Custom theme removed",
        data: null,
      });
      expect(removeThemeMock).toHaveBeenCalledWith(uid, themeId);
    });
    it("should fail without mandatory properties", async () => {
      //WHEN
      const { body } = await mockApp
        .delete("/users/customThemes")
        .set("Authorization", `Bearer ${uid}`)
        .expect(422);

      //THEN
      expect(body).toEqual({
        message: "Invalid request data schema",
        validationErrors: ['"themeId" Required'],
      });
    });
    it("should fail with unknown properties", async () => {
      //WHEN
      const { body } = await mockApp
        .delete("/users/customThemes")
        .set("Authorization", `Bearer ${uid}`)
        .send({ themeId: new ObjectId().toHexString(), extra: "value" })
        .expect(422);

      //THEN
      expect(body).toEqual({
        message: "Invalid request data schema",
        validationErrors: ["Unrecognized key(s) in object: 'extra'"],
      });
    });
  });
  describe("edit custom theme", () => {
    const editThemeMock = vi.spyOn(UserDal, "editTheme");
    beforeEach(() => {
      editThemeMock.mockClear().mockResolvedValue();
    });

    it("should edit custom theme", async () => {
      //GIVEN
      const themeId = new ObjectId().toHexString();
      const theme = {
        name: "newName",
        colors: new Array(10).fill("#000000") as any,
      };

      //WHEN
      const { body } = await mockApp
        .patch("/users/customThemes")
        .set("Authorization", `Bearer ${uid}`)
        .send({
          themeId,
          theme,
        })
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "Custom theme updated",
        data: null,
      });
      expect(editThemeMock).toHaveBeenCalledWith(uid, themeId, theme);
    });
    it("should fail without mandatory properties", async () => {
      //WHEN
      const { body } = await mockApp
        .patch("/users/customThemes")
        .set("Authorization", `Bearer ${uid}`)
        .expect(422);

      //THEN
      expect(body).toEqual({
        message: "Invalid request data schema",
        validationErrors: ['"themeId" Required', '"theme" Required'],
      });
    });
    it("should fail with unknown properties", async () => {
      //WHEN
      const { body } = await mockApp
        .patch("/users/customThemes")
        .set("Authorization", `Bearer ${uid}`)
        .send({
          themeId: new ObjectId().toHexString(),
          theme: {
            name: "newName",
            colors: new Array(10).fill("#000000") as any,
            extra2: "value",
          },
          extra: "value",
        })
        .expect(422);

      //THEN
      expect(body).toEqual({
        message: "Invalid request data schema",
        validationErrors: [
          `"theme" Unrecognized key(s) in object: 'extra2'`,
          "Unrecognized key(s) in object: 'extra'",
        ],
      });
    });
  });
  describe("get personal bests", () => {
    const getPBMock = vi.spyOn(UserDal, "getPersonalBests");
    beforeEach(() => {
      getPBMock.mockClear();
    });

    it("should get pbs", async () => {
      //GIVEN
      const personalBest: PersonalBest = pb(15);
      getPBMock.mockResolvedValue(personalBest);

      //WHEN
      const { body } = await mockApp
        .get("/users/personalBests")
        .set("Authorization", `Bearer ${uid}`)
        .query({ mode: "time", mode2: jsonQuery("8") })
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "Personal bests retrieved",
        data: personalBest,
      });
      expect(getPBMock).toHaveBeenCalledWith(uid, "time", "8");
    });
    it("should fail without mandatory query parameters", async () => {
      //WHEN
      const { body } = await mockApp
        .get("/users/personalBests")
        .set("Authorization", `Bearer ${uid}`)
        .expect(422);

      //THEN
      expect(body).toEqual({
        message: "Invalid query schema",
        validationErrors: ['"mode" Required'],
      });
    });
    it("should fail with unknown query parameters", async () => {
      //WHEN
      const { body } = await mockApp
        .get("/users/personalBests")
        .set("Authorization", `Bearer ${uid}`)
        .query({ mode: "time", mode2: jsonQuery("8"), extra: "value" })
        .expect(422);

      //THEN
      expect(body).toEqual({
        message: "Invalid query schema",
        validationErrors: ["Unrecognized key(s) in object: 'extra'"],
      });
    });
    it("should fail with invalid query parameters", async () => {
      //WHEN
      const { body } = await mockApp
        .get("/users/personalBests")
        .set("Authorization", `Bearer ${uid}`)
        .query({ mode: "mood", mode2: "happy" })

        .expect(422);

      //THEN
      // SB-176 / INV-153: `time` is the only mode croco calc has.
      expect(body).toEqual({
        message: "Invalid query schema",
        validationErrors: [
          `"mode" Invalid enum value. Expected 'time', received 'mood'`,
          `"mode2" Needs to be "1", "2", "4" or "8".`,
        ],
      });
    });
  });
  describe("get stats", () => {
    const getStatsMock = vi.spyOn(UserDal, "getStats");
    beforeEach(() => {
      getStatsMock.mockClear();
    });

    it("should get stats", async () => {
      //GIVEN
      const stats: Pick<
        UserDal.DBUser,
        "startedTests" | "completedTests" | "timeSpent"
      > = {
        startedTests: 5,
        completedTests: 3,
        timeSpent: 42,
      };
      getStatsMock.mockResolvedValue(stats);

      //WHEN
      const { body } = await mockApp
        .get("/users/stats")
        .set("Authorization", `Bearer ${uid}`)
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "Personal stats retrieved",
        data: stats,
      });

      expect(getStatsMock).toHaveBeenCalledWith(uid);
    });
  });
  describe("get profile", () => {
    const getUserMock = vi.spyOn(UserDal, "getUser");
    const getUserByNameMock = vi.spyOn(UserDal, "getUserByName");
    const leaderboardGetRankMock = vi.spyOn(LeaderboardDal, "getRank");
    const leaderboardGetCountMock = vi.spyOn(LeaderboardDal, "getCount");

    const foundUser: Partial<UserDal.DBUser> = {
      _id: new ObjectId(),
      uid: new ObjectId().toHexString(),
      name: "bob",
      banned: false,
      profileDetails: {
        bio: "bio",
        socialProfiles: {
          twitter: "twitter",
          github: "github",
        },
      },
      //AC-064: `time` is the only personal-best axis, keyed 1/2/4/8
      personalBests: {
        time: {
          "1": [pb(15), pb(16)],
          "2": [pb(30), pb(31)],
          "4": [pb(60), pb(61)],
          "8": [pb(120), pb(121)],
        },
      },
      completedTests: 23,
      startedTests: 42,
      timeSpent: 234,
      addedAt: 1000,
      xp: 10,
      lbOptOut: false,
      testActivity: {
        "2024": fillYearWithDay(94),
      },
    };

    beforeEach(async () => {
      getUserMock.mockClear();
      getUserByNameMock.mockClear();
      leaderboardGetRankMock.mockClear();
      leaderboardGetCountMock.mockClear();
      await enableProfiles(true);
    });

    it("should get by name without authentication", async () => {
      //GIVEN

      getUserByNameMock.mockResolvedValue(foundUser as any);

      const rank = { rank: 24 } as LeaderboardDal.DBLeaderboardEntry;
      leaderboardGetRankMock.mockResolvedValue(rank);
      leaderboardGetCountMock.mockResolvedValue(100);

      //WHEN
      const { body } = await mockApp.get("/users/bob/profile").expect(200);

      //THEN
      expect(body).toEqual({
        message: "Profile retrieved",
        data: {
          uid: foundUser.uid,
          name: "bob",
          banned: false,
          addedAt: 1000,
          testStats: {
            completedTests: 23,
            startedTests: 42,
            timeSpent: 234,
          },
          personalBests: {
            time: {
              "1": foundUser.personalBests?.time["1"],
              "2": foundUser.personalBests?.time["2"],
              "4": foundUser.personalBests?.time["4"],
              "8": foundUser.personalBests?.time["8"],
            },
          },
          xp: 10,
          lbOptOut: false,
          //SB-176: only time 4 and 8 have all-time leaderboards
          allTimeLbs: {
            time: {
              "4": { count: 100, rank: 24 },
              "8": { count: 100, rank: 24 },
            },
          },
          details: foundUser.profileDetails,
        },
      });
      expect(getUserByNameMock).toHaveBeenCalledWith("bob", "get user profile");
      expect(getUserMock).not.toHaveBeenCalled();
    });
    it("should get testActivity if enabled", async () => {
      //GIVEN
      vi.useFakeTimers().setSystemTime(1712102400000);
      getUserByNameMock.mockResolvedValue({
        ...foundUser,
        profileDetails: { showActivityOnPublicProfile: true },
      } as any);
      const rank = { rank: 24 } as LeaderboardDal.DBLeaderboardEntry;
      leaderboardGetRankMock.mockResolvedValue(rank);
      leaderboardGetCountMock.mockResolvedValue(100);

      //WHEN
      const { body } = await mockApp.get("/users/bob/profile").expect(200);

      //THEN
      expect(body.data.testActivity).toEqual(
        expect.objectContaining({
          lastDay: 1712102400000,
          testsByDays: expect.arrayContaining([]),
        }),
      );
    });
    it("should not get testActivity if disabled", async () => {
      //GIVEN
      vi.useFakeTimers().setSystemTime(1712102400000);
      getUserByNameMock.mockResolvedValue({
        ...foundUser,
        profileDetails: { showActivityOnPublicProfile: false },
      } as any);
      const rank = { rank: 24 } as LeaderboardDal.DBLeaderboardEntry;
      leaderboardGetRankMock.mockResolvedValue(rank);
      leaderboardGetCountMock.mockResolvedValue(100);

      //WHEN
      const { body } = await mockApp.get("/users/bob/profile").expect(200);

      //THEN
      expect(body.data.testActivity).toBeUndefined();
    });

    it("should get base profile for banned user", async () => {
      //GIVEN
      getUserByNameMock.mockResolvedValue({
        ...foundUser,
        banned: true,
      } as any);

      const rank = { rank: 24 } as LeaderboardDal.DBLeaderboardEntry;
      leaderboardGetRankMock.mockResolvedValue(rank);
      leaderboardGetCountMock.mockResolvedValue(100);

      //WHEN
      const { body } = await mockApp.get("/users/bob/profile").expect(200);

      //THEN
      expect(body).toEqual({
        message: "Profile retrived: banned user",
        data: {
          name: "bob",
          banned: true,
          addedAt: 1000,
          testStats: {
            completedTests: 23,
            startedTests: 42,
            timeSpent: 234,
          },
          personalBests: {
            time: {
              "1": foundUser.personalBests?.time["1"],
              "2": foundUser.personalBests?.time["2"],
              "4": foundUser.personalBests?.time["4"],
              "8": foundUser.personalBests?.time["8"],
            },
          },
          xp: 10,
          lbOptOut: false,
        },
      });
      expect(getUserByNameMock).toHaveBeenCalledWith("bob", "get user profile");
      expect(getUserMock).not.toHaveBeenCalled();
    });
    it("should get by uid without authentication", async () => {
      //GIVEN
      const uid = foundUser.uid;
      getUserMock.mockResolvedValue(foundUser as any);

      const rank = { rank: 24 } as LeaderboardDal.DBLeaderboardEntry;
      leaderboardGetRankMock.mockResolvedValue(rank);
      leaderboardGetCountMock.mockResolvedValue(100);

      //WHEN
      const { body } = await mockApp
        .get(`/users/${uid}/profile`)
        .query({ isUid: "" })
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "Profile retrieved",
        data: expect.objectContaining({
          uid: foundUser.uid,
        }),
      });
      expect(getUserByNameMock).not.toHaveBeenCalled();
      expect(getUserMock).toHaveBeenCalledWith(uid, "get user profile");
    });
    it("should fail if feature is disabled", async () => {
      //GIVEN
      await enableProfiles(false);

      //WHEN
      const { body } = await mockApp.get(`/users/bob/profile`).expect(503);

      //THEN
      expect(body.message).toEqual("Profiles are not available at this time");
    });
  });
  describe("update profile", () => {
    const getPartialUserMock = vi.spyOn(UserDal, "getPartialUser");
    const updateProfileMock = vi.spyOn(UserDal, "updateProfile");

    // AC-052: the profile is `bio` plus socials. monkeytype's `keyboard` field is
    // dropped, and C16/INV-190 cut badges, so there is no `inventory` to read and
    // `UserDAL.updateProfile` takes no badge argument.
    beforeEach(async () => {
      getPartialUserMock.mockClear().mockResolvedValue({} as any);
      updateProfileMock.mockClear().mockResolvedValue();
      await enableProfiles(true);
    });

    it("should update", async () => {
      //GIVEN
      const newProfile = {
        bio: "newBio",
        socialProfiles: {
          github: "github",
          twitter: "twitter",
          website: "https://crococalc.com",
        },
        showActivityOnPublicProfile: false,
      };

      //WHEN
      const { body } = await mockApp
        .patch("/users/profile")
        .set("Authorization", `Bearer ${uid}`)
        .send(newProfile)
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "Profile updated",
        data: newProfile,
      });
      expect(updateProfileMock).toHaveBeenCalledWith(uid, {
        bio: "newBio",
        socialProfiles: {
          github: "github",
          twitter: "twitter",
          website: "https://crococalc.com",
        },
        showActivityOnPublicProfile: false,
      });
    });
    it("should update with empty strings", async () => {
      //GIVEN
      const newProfile = {
        bio: "",
        socialProfiles: {
          github: "",
          twitter: "",
          website: "",
        },
      };

      //WHEN
      const { body } = await mockApp
        .patch("/users/profile")
        .set("Authorization", `Bearer ${uid}`)
        .send(newProfile)
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "Profile updated",
        data: newProfile,
      });
      expect(updateProfileMock).toHaveBeenCalledWith(uid, {
        bio: "",
        socialProfiles: {
          github: "",
          twitter: "",
          website: "",
        },
      });
    });
    it("should fail with unknown properties", async () => {
      //WHEN
      const { body } = await mockApp
        .patch("/users/profile")
        .set("Authorization", `Bearer ${uid}`)
        .send({
          extra: "value",
          socialProfiles: {
            extra2: "value",
          },
        })
        .expect(422);

      //THEN
      expect(body).toEqual({
        message: "Invalid request data schema",
        validationErrors: [
          `"socialProfiles" Unrecognized key(s) in object: 'extra2'`,
          "Unrecognized key(s) in object: 'extra'",
        ],
      });
    });
    it("should sanitize inputs", async () => {
      //WHEN
      await mockApp
        .patch("/users/profile")
        .set("Authorization", `Bearer ${uid}`)
        .send({
          bio: "Line1\n\n\nLine2\n\n\n\nLine3",
        })
        .expect(200);

      //THEN
      expect(updateProfileMock).toHaveBeenCalledWith(uid, {
        bio: "Line1\n\nLine2\n\nLine3",
        socialProfiles: {},
      });
    });
    it("should fail with disallowed word", async () => {
      //WHEN
      const { body } = await mockApp
        .patch("/users/profile")
        .set("Authorization", `Bearer ${uid}`)
        .send({
          bio: "miodec",
          socialProfiles: {
            twitter: "miodec",
            github: "miodec",
            website: "https://i-luv-miodec.com",
          },
        })
        .expect(422);

      //THEN
      expect(body).toEqual({
        message: "Invalid request data schema",
        validationErrors: [
          '"bio" Disallowed word detected. Please remove it. If you believe this is a mistake, please contact us (miodec).',
          '"socialProfiles.twitter" Disallowed word detected. Please remove it. If you believe this is a mistake, please contact us (miodec).',
          '"socialProfiles.github" Disallowed word detected. Please remove it. If you believe this is a mistake, please contact us (miodec).',
          '"socialProfiles.website" Disallowed word detected. Please remove it. If you believe this is a mistake, please contact us (https://i-luv-miodec.com).',
        ],
      });
    });
    it("should fail with properties exceeding max lengths", async () => {
      //WHEN
      const { body } = await mockApp
        .patch("/users/profile")
        .set("Authorization", `Bearer ${uid}`)
        .send({
          bio: new Array(251).fill("x").join(""),
          socialProfiles: {
            twitter: new Array(16).fill("x").join(""),
            github: new Array(40).fill("x").join(""),
            website: `https://${new Array(201 - "https://".length)
              .fill("x")
              .join("")}`,
          },
        })
        .expect(422);

      //THEN
      expect(body).toEqual({
        message: "Invalid request data schema",
        validationErrors: [
          '"bio" String must contain at most 250 character(s)',
          '"socialProfiles.twitter" String must contain at most 15 character(s)',
          '"socialProfiles.github" String must contain at most 39 character(s)',
          '"socialProfiles.website" String must contain at most 200 character(s)',
        ],
      });
    });
    it("should fail with website not using https", async () => {
      //WHEN
      const { body } = await mockApp
        .patch("/users/profile")
        .set("Authorization", `Bearer ${uid}`)
        .send({
          socialProfiles: {
            website: "http://crococalc.com",
          },
        })
        .expect(422);

      //THEN
      expect(body).toEqual({
        message: "Invalid request data schema",
        validationErrors: [
          '"socialProfiles.website" Invalid input: must start with "https://"',
        ],
      });
    });
    it("should fail if feature is disabled", async () => {
      //GIVEN
      await enableProfiles(false);

      //WHEN
      const { body } = await mockApp
        .patch("/users/profile")
        .set("Authorization", `Bearer ${uid}`)
        .send({})
        .expect(503);

      //THEN
      expect(body.message).toEqual("Profiles are not available at this time");
    });
  });
  describe("get inbox", () => {
    const getInboxMock = vi.spyOn(UserDal, "getInbox");

    beforeEach(async () => {
      getInboxMock.mockClear();
      await enableInbox(true);
    });

    it("should get inbox", async () => {
      //GIVEN
      const mailOne: CrocoMail = {
        id: randomUUID(),
        subject: "subjectOne",
        body: "bodyOne",
        timestamp: 100,
        read: false,
        rewards: [],
      };
      const mailTwo: CrocoMail = {
        id: randomUUID(),
        subject: "subjectTwo",
        body: "bodyTwo",
        timestamp: 100,
        read: false,
        rewards: [],
      };
      getInboxMock.mockResolvedValue([mailOne, mailTwo]);

      //WHEN
      const { body } = await mockApp
        .get("/users/inbox")
        .set("Authorization", `Bearer ${uid}`)
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "Inbox retrieved",
        data: {
          inbox: [mailOne, mailTwo],
          maxMail: (await Configuration.getLiveConfiguration()).users.inbox
            .maxMail,
        },
      });
      expect(getInboxMock).toHaveBeenCalledWith(uid);
    });
    it("should fail if feature is disabled", async () => {
      //GIVEN
      await enableInbox(false);

      //WHEN
      const { body } = await mockApp
        .get("/users/inbox")
        .set("Authorization", `Bearer ${uid}`)
        .expect(503);

      //THEN
      expect(body.message).toEqual("Your inbox is not available at this time.");
    });
  });
  describe("update inbox", () => {
    const updateInboxMock = vi.spyOn(UserDal, "updateInbox");
    const mailIdOne = randomUUID();
    const mailIdTwo = randomUUID();
    beforeEach(async () => {
      updateInboxMock.mockClear().mockResolvedValue();
      await enableInbox(true);
    });

    it("should update", async () => {
      //WHEN
      const { body } = await mockApp
        .patch("/users/inbox")
        .set("Authorization", `Bearer ${uid}`)
        .send({
          mailIdsToDelete: [mailIdOne],
          mailIdsToMarkRead: [mailIdOne, mailIdTwo],
        })
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "Inbox updated",
        data: null,
      });

      expect(updateInboxMock).toHaveBeenCalledWith(
        uid,
        [mailIdOne, mailIdTwo],
        [mailIdOne],
      );
    });
    it("should update without body", async () => {
      //WHEN
      const { body } = await mockApp
        .patch("/users/inbox")
        .set("Authorization", `Bearer ${uid}`)
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "Inbox updated",
        data: null,
      });

      expect(updateInboxMock).toHaveBeenCalledWith(uid, [], []);
    });
    it("should fail with empty arrays", async () => {
      //WHEN
      const { body } = await mockApp
        .patch("/users/inbox")
        .set("Authorization", `Bearer ${uid}`)
        .send({
          mailIdsToDelete: [],
          mailIdsToMarkRead: [],
        })
        .expect(422);

      //THEN
      expect(body).toEqual({
        message: "Invalid request data schema",
        validationErrors: [
          '"mailIdsToDelete" Array must contain at least 1 element(s)',
          '"mailIdsToMarkRead" Array must contain at least 1 element(s)',
        ],
      });
    });
    it("should fail if feature is disabled", async () => {
      //GIVEN
      await enableInbox(false);

      //WHEN
      const { body } = await mockApp
        .patch("/users/inbox")
        .set("Authorization", `Bearer ${uid}`)
        .expect(503);

      //THEN
      expect(body.message).toEqual("Your inbox is not available at this time.");
    });
  });
  describe("report user", () => {
    const createReportMock = vi.spyOn(ReportDal, "createReport");
    const verifyCaptchaMock = vi.spyOn(Captcha, "verify");
    const getPartialUserMock = vi.spyOn(UserDal, "getPartialUser"); //todo replace with getPartialUser
    beforeEach(async () => {
      vi.useFakeTimers();
      vi.setSystemTime(125000);
      createReportMock.mockClear().mockResolvedValue();
      verifyCaptchaMock.mockClear().mockResolvedValue(true);
      getPartialUserMock.mockClear().mockResolvedValue({} as any);

      await enableReporting(true);
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("should report", async () => {
      //WHEN
      const uidToReport = new ObjectId().toHexString();

      const { body } = await mockApp
        .post("/users/report")
        .set("Authorization", `Bearer ${uid}`)
        .send({
          uid: uidToReport,
          reason: "Suspected cheating",
          comment: "comment",
          captcha: "captcha",
        })
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "User reported",
        data: null,
      });
      expect(createReportMock).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "user",
          timestamp: 125000,
          uid,
          contentId: uidToReport,
          reason: "Suspected cheating",
          comment: "comment",
        }),
        (await Configuration.getLiveConfiguration()).users.reporting.maxReports,
        (await Configuration.getLiveConfiguration()).users.reporting
          .contentReportLimit,
      );
      expect(verifyCaptchaMock).toHaveBeenCalledWith("captcha");
    });
    it("should fail without mandatory properties", async () => {
      //WHEN
      const { body } = await mockApp
        .post("/users/report")
        .set("Authorization", `Bearer ${uid}`)
        .expect(422);

      //THEN
      expect(body).toEqual({
        message: "Invalid request data schema",
        validationErrors: [
          '"uid" Required',
          '"reason" Required',
          '"captcha" Required',
        ],
      });
    });
    it("should fail with unknown properties", async () => {
      //WHEN
      const { body } = await mockApp
        .post("/users/report")
        .set("Authorization", `Bearer ${uid}`)
        .send({
          uid: new ObjectId().toHexString(),
          reason: "Suspected cheating",
          comment: "comment",
          captcha: "captcha",
          extra: "value",
        })
        .expect(422);

      //THEN
      expect(body).toEqual({
        message: "Invalid request data schema",
        validationErrors: ["Unrecognized key(s) in object: 'extra'"],
      });
    });
    it("should fail with invalid captcha", async () => {
      //GIVEN
      verifyCaptchaMock.mockResolvedValue(false);

      //WHEN
      const { body } = await mockApp
        .post("/users/report")
        .set("Authorization", `Bearer ${uid}`)
        .send({
          uid: new ObjectId().toHexString(),
          reason: "Suspected cheating",
          comment: "comment",
          captcha: "captcha",
        })
        .expect(422);

      //THEN
      expect(body.message).toEqual("Captcha challenge failed");
      /* TODO
      expect(body).toEqual({});
      */
    });
    it("should fail with invalid properties", async () => {
      //WHEN
      const { body } = await mockApp
        .post("/users/report")
        .set("Authorization", `Bearer ${uid}`)
        .send({
          uid: new Array(51).fill("x").join(""),
          reason: "unfriendly",
          comment: new Array(251).fill("x").join(""),
          captcha: "captcha",
        })
        .expect(422);

      //THEN
      expect(body).toEqual({
        message: "Invalid request data schema",
        validationErrors: [
          `"reason" Invalid enum value. Expected 'Inappropriate name' | 'Inappropriate bio' | 'Inappropriate social links' | 'Suspected cheating', received 'unfriendly'`,
          '"comment" String must contain at most 250 character(s)',
        ],
      });
    });
    it("should fail if user can not report", async () => {
      //GIVEN
      getPartialUserMock.mockResolvedValue({ canReport: false } as any);

      //WHEN
      const { body } = await mockApp
        .post("/users/report")
        .set("Authorization", `Bearer ${uid}`)
        .send({
          uid: new ObjectId().toHexString(),
          reason: "Suspected cheating",
          comment: "comment",
          captcha: "captcha",
        })
        .expect(403);

      //THEN
      expect(body.message).toEqual("You don't have permission to do this.");
    });
    it("should fail if feature is disabled", async () => {
      //GIVEN
      await enableReporting(false);

      //WHEN
      const { body } = await mockApp
        .post("/users/report")
        .set("Authorization", `Bearer ${uid}`)
        .send({
          uid: new ObjectId().toHexString(),
          reason: "Suspected cheating",
          comment: "comment",
          captcha: "captcha",
        })
        .expect(503);

      //THEN
      expect(body.message).toEqual("User reporting is unavailable.");
    });
  });
  describe("revoke all token", () => {
    const removeTokensByUidMock = vi.spyOn(AuthUtils, "revokeTokensByUid");
    const addImportantLogMock = vi.spyOn(LogDal, "addImportantLog");

    beforeEach(() => {
      removeTokensByUidMock.mockClear().mockResolvedValue();
      addImportantLogMock.mockClear().mockResolvedValue();
    });
    it("should revoke all tokens", async () => {
      //WHEN
      const { body } = await mockApp
        .post("/users/revokeAllTokens")
        .set("Authorization", `Bearer ${uid}`)
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "All tokens revoked",
        data: null,
      });
      expect(removeTokensByUidMock).toHaveBeenCalledWith(uid);
      expect(addImportantLogMock).toHaveBeenCalledWith(
        "user_tokens_revoked",
        "",
        uid,
      );
    });
  });
  describe("getCurrentTestActivity", () => {
    const getUserMock = vi.spyOn(UserDal, "getPartialUser");

    afterEach(() => {
      getUserMock.mockClear();
    });
    it("gets", async () => {
      //GIVEN
      vi.useFakeTimers().setSystemTime(1712102400000);
      const user = {
        uid: uid,
        testActivity: {
          "2024": fillYearWithDay(94),
        },
      } as Partial<UserDal.DBUser> as UserDal.DBUser;
      getUserMock.mockResolvedValue(user);

      //WHEN
      const result = await mockApp
        .get("/users/currentTestActivity")
        .set("Authorization", `Bearer ${uid}`)
        .send()
        .expect(200);

      //THEN
      expect(result.body.data.lastDay).toEqual(1712102400000);
      const testsByDays = result.body.data.testsByDays;
      expect(testsByDays).toHaveLength(372);
      expect(testsByDays[6]).toEqual(null); //2023-04-04
      expect(testsByDays[277]).toEqual(null); //2023-12-31
      expect(testsByDays[278]).toEqual(1); //2024-01-01
      expect(testsByDays[371]).toEqual(94); //2024-01
    });
  });
  describe("get friends", () => {
    const getFriendsMock = vi.spyOn(UserDal, "getFriends");

    beforeEach(async () => {
      await enableConnectionsEndpoints(true);
      getFriendsMock.mockClear();
    });

    it("gets the friend list", async () => {
      //GIVEN
      const friend: UserDal.DBFriend = {
        name: "Bob",
        xp: 1234,
      } as any;
      getFriendsMock.mockResolvedValue([friend]);

      //WHEN
      const { body } = await mockApp
        .get("/users/friends")
        .set("Authorization", `Bearer ${uid}`)
        .expect(200);

      //THEN
      expect(body.data).toEqual([{ name: "Bob", xp: 1234 }]);
      expect(getFriendsMock).toHaveBeenCalledWith(uid);
    });

    it("should fail if friends endpoints are disabled", async () => {
      await expectFailForDisabledEndpoint(
        mockApp.get("/users/friends").set("Authorization", `Bearer ${uid}`),
      );
    });

    it("should fail without authentication", async () => {
      await mockApp.get("/users/friends").expect(401);
    });
  });
});

function fillYearWithDay(days: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < days; i++) {
    result.push(i + 1);
  }
  return result;
}

async function enableSignup(signUp: boolean): Promise<void> {
  const mockConfig = await configuration;
  mockConfig.users = { ...mockConfig.users, signUp };

  vi.spyOn(Configuration, "getCachedConfiguration").mockResolvedValue(
    mockConfig,
  );
}

async function enableResultFilterPresets(enabled: boolean): Promise<void> {
  const mockConfig = await configuration;
  mockConfig.results.filterPresets = {
    ...mockConfig.results.filterPresets,
    enabled,
  };

  vi.spyOn(Configuration, "getCachedConfiguration").mockResolvedValue(
    mockConfig,
  );
}

async function enableProfiles(enabled: boolean): Promise<void> {
  const mockConfig = await configuration;
  mockConfig.users.profiles = { ...mockConfig.users.profiles, enabled };

  vi.spyOn(Configuration, "getCachedConfiguration").mockResolvedValue(
    mockConfig,
  );
}
async function enableInbox(enabled: boolean): Promise<void> {
  const mockConfig = await configuration;
  mockConfig.users.inbox = { ...mockConfig.users.inbox, enabled };

  vi.spyOn(Configuration, "getCachedConfiguration").mockResolvedValue(
    mockConfig,
  );
}

async function enableReporting(enabled: boolean): Promise<void> {
  const mockConfig = await configuration;
  mockConfig.users.reporting = { ...mockConfig.users.reporting, enabled };

  vi.spyOn(Configuration, "getCachedConfiguration").mockResolvedValue(
    mockConfig,
  );
}

async function enableConnectionsEndpoints(enabled: boolean): Promise<void> {
  const mockConfig = await configuration;
  mockConfig.connections = { ...mockConfig.connections, enabled };

  vi.spyOn(Configuration, "getCachedConfiguration").mockResolvedValue(
    mockConfig,
  );
}

async function expectFailForDisabledEndpoint(call: Test): Promise<void> {
  await enableConnectionsEndpoints(false);
  const { body } = await call.expect(503);
  expect(body.message).toEqual("Connections are not available at this time.");
}
