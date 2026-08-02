import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { setup } from "../../__testData__/controller-test";
import { ObjectId } from "mongodb";
import * as LeaderboardDal from "../../../src/dal/leaderboards";
import * as ConnectionsDal from "../../../src/dal/connections";
import * as DailyLeaderboards from "../../../src/utils/daily-leaderboards";
import * as WeeklyXpLeaderboard from "../../../src/services/weekly-xp-leaderboard";
import * as Configuration from "../../../src/init/configuration";
import { XpLeaderboardEntry } from "@croco-calc/schemas/leaderboards";

const { mockApp, uid } = setup();

/**
 * The router runs with `jsonQuery: true` (`src/api/routes/index.ts`), so every
 * query value arrives JSON-**decoded** — and the ts-rest client on the frontend
 * JSON-**encodes** them to match (`frontend/src/ts/ape/adapters/ts-rest-adapter.ts`).
 * supertest does neither, so a bare `mode2=8` reaches the schema as the *number*
 * 8 and `LeaderboardMode2Schema` (`z.enum(["4", "8"])`) rejects it with a 422
 * no real client could ever provoke. Encoding here is what the wire actually
 * carries. Only numeric-looking values need it: `JSON.parse("time")` throws and
 * ts-rest falls back to the raw string.
 */
const jsonQuery = (value: string): string => JSON.stringify(value);

const configuration = Configuration.getCachedConfiguration();

/** AC-114 / SB-176: the boards are `time 4` and `time 8`, and nothing else. */
const boardModes = ["time"] as const;
const boardMode2s = ["4", "8"] as const;

describe("Loaderboard Controller", () => {
  describe("get leaderboard", () => {
    const getLeaderboardMock = vi.spyOn(LeaderboardDal, "get");
    const getLeaderboardCountMock = vi.spyOn(LeaderboardDal, "getCount");

    beforeEach(() => {
      getLeaderboardMock.mockClear();
      getLeaderboardCountMock.mockClear();
      getLeaderboardCountMock.mockResolvedValue(42);
    });

    it("should get for time 8", async () => {
      //GIVEN

      const resultData = {
        count: 42,
        pageSize: 50,
        entries: [
          {
            score: 190,
            correct: 200,
            wrong: 10,
            acc: 90,
            tpm: 20,
            timestamp: 1000,
            uid: "user1",
            name: "user1",
            rank: 1,
          },
          {
            score: 80,
            correct: 90,
            wrong: 10,
            acc: 80,
            tpm: 10,
            timestamp: 1200,
            uid: "user2",
            name: "user2",
            rank: 2,
          },
        ],
      };
      const mockData = resultData.entries.map((it) => ({
        ...it,
        _id: new ObjectId(),
      }));
      getLeaderboardMock.mockResolvedValue(mockData);
      getLeaderboardCountMock.mockResolvedValue(42);

      //WHEN

      const { body } = await mockApp
        .get("/leaderboards")
        .query({ mode: "time", mode2: jsonQuery("8") })
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "Leaderboard retrieved",
        data: resultData,
      });

      expect(getLeaderboardMock).toHaveBeenCalledWith(
        "time",
        "8",
        0,
        50,
        undefined,
      );

      expect(getLeaderboardCountMock).toHaveBeenCalledWith(
        "time",
        "8",
        undefined,
      );
    });

    it("should get for time 8 with page", async () => {
      //GIVEN
      getLeaderboardMock.mockResolvedValue([]);
      getLeaderboardCountMock.mockResolvedValue(0);
      const page = 0;
      const pageSize = 25;

      //WHEN

      const { body } = await mockApp
        .get("/leaderboards")
        .query({
          mode: "time",
          mode2: jsonQuery("8"),
          page,
          pageSize,
        })
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "Leaderboard retrieved",
        data: {
          count: 0,
          pageSize: 25,
          entries: [],
        },
      });

      expect(getLeaderboardMock).toHaveBeenCalledWith(
        "time",
        "8",
        page,
        pageSize,
        undefined,
      );
    });

    it("should get for friendsOnly", async () => {
      //GIVEN
      await enableConnectionsFeature(true);
      getLeaderboardMock.mockResolvedValue([]);
      getLeaderboardCountMock.mockResolvedValue(2);

      //WHEN

      const { body } = await mockApp
        .get("/leaderboards")
        .set("Authorization", `Bearer ${uid}`)
        .query({
          mode: "time",
          mode2: jsonQuery("8"),
          friendsOnly: true,
        })
        .expect(200);

      //THEN
      expect(body.data.count).toEqual(2);

      expect(getLeaderboardMock).toHaveBeenCalledWith("time", "8", 0, 50, uid);
      expect(getLeaderboardCountMock).toHaveBeenCalledWith("time", "8", uid);
    });

    describe("should get for modes", async () => {
      beforeEach(() => {
        getLeaderboardMock.mockResolvedValue([]);
      });

      // AC-114 / SB-176: `time 4` and `time 8` are the whole matrix. `2` and
      // `1` are legal *test* lengths with no board, so they are 422 at the
      // schema rather than 404 at the controller (`LeaderboardMode2Schema`).
      const testCases = [
        { mode: "time", mode2: "4", expectStatus: 200 },
        { mode: "time", mode2: "8", expectStatus: 200 },
        { mode: "time", mode2: "2", expectStatus: 422 },
        { mode: "time", mode2: "1", expectStatus: 422 },
        { mode: "time", mode2: "60", expectStatus: 422 },
      ];
      it.for(testCases)(
        `expect $expectStatus for mode $mode, mode2 $mode2`,
        async ({ mode, mode2, expectStatus }) => {
          await mockApp
            .get("/leaderboards")
            .query({ mode, mode2: jsonQuery(mode2) })
            .expect(expectStatus);
        },
      );
    });

    it("fails for missing query", async () => {
      const { body } = await mockApp.get("/leaderboards").expect(422);

      expect(body).toEqual({
        message: "Invalid query schema",
        validationErrors: ['"mode" Required', '"mode2" Required'],
      });
    });
    it("fails for invalid query", async () => {
      const { body } = await mockApp
        .get("/leaderboards")
        .query({
          mode: "unknownMode",
          mode2: "unknownMode2",
          page: -1,
          pageSize: 500,
        })
        .expect(422);

      expect(body).toEqual({
        message: "Invalid query schema",
        validationErrors: [
          `"mode" Invalid enum value. Expected 'time', received 'unknownMode'`,
          `"mode2" Invalid enum value. Expected '4' | '8', received 'unknownMode2'`,
          '"page" Number must be greater than or equal to 0',
          '"pageSize" Number must be less than or equal to 200',
        ],
      });
    });
    it("fails for unknown query", async () => {
      const { body } = await mockApp
        .get("/leaderboards")
        .query({
          mode: "time",
          mode2: jsonQuery("8"),
          extra: "value",
        })
        .expect(422);

      expect(body).toEqual({
        message: "Invalid query schema",
        validationErrors: ["Unrecognized key(s) in object: 'extra'"],
      });
    });
    it("fails while leaderboard is updating", async () => {
      //GIVEN
      getLeaderboardMock.mockResolvedValue(false);

      //WHEN
      const { body } = await mockApp
        .get("/leaderboards")
        .query({
          mode: "time",
          mode2: jsonQuery("8"),
        })
        .expect(503);

      expect(body.message).toEqual(
        "Leaderboard is currently updating. Please try again in a few seconds.",
      );
    });
  });

  describe("get rank", () => {
    const getLeaderboardRankMock = vi.spyOn(LeaderboardDal, "getRank");

    afterEach(() => {
      getLeaderboardRankMock.mockClear();
    });

    it("fails withouth authentication", async () => {
      await mockApp
        .get("/leaderboards/rank")
        .query({ mode: "time", mode2: jsonQuery("8") })
        .expect(401);
    });

    it("should get for time 8", async () => {
      //GIVEN

      const entryId = new ObjectId();
      const resultEntry = {
        _id: entryId,
        score: 80,
        correct: 90,
        wrong: 10,
        acc: 80,
        tpm: 10,
        timestamp: 1200,
        uid: "user2",
        name: "user2",
        rank: 2,
      };
      getLeaderboardRankMock.mockResolvedValue(resultEntry);

      //WHEN

      const { body } = await mockApp
        .get("/leaderboards/rank")
        .query({ mode: "time", mode2: jsonQuery("8") })
        .set("Authorization", `Bearer ${uid}`)
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "Rank retrieved",
        data: { ...resultEntry, _id: undefined },
      });

      expect(getLeaderboardRankMock).toHaveBeenCalledWith(
        "time",
        "8",
        uid,
        false,
      );
    });
    it("should get for time 8 friends only", async () => {
      //GIVEN
      await enableConnectionsFeature(true);
      getLeaderboardRankMock.mockResolvedValue({} as any);

      //WHEN
      await mockApp
        .get("/leaderboards/rank")
        .query({
          mode: "time",
          mode2: jsonQuery("8"),
          friendsOnly: true,
        })
        .set("Authorization", `Bearer ${uid}`)
        .expect(200);

      //THEN
      expect(getLeaderboardRankMock).toHaveBeenCalledWith(
        "time",
        "8",
        uid,
        true,
      );
    });
    it("should get null if no rank", async () => {
      //GIVEN
      await enableConnectionsFeature(true);
      getLeaderboardRankMock.mockResolvedValue(null);

      //WHEN
      const { body } = await mockApp
        .get("/leaderboards/rank")
        .query({
          mode: "time",
          mode2: jsonQuery("8"),
          friendsOnly: true,
        })
        .set("Authorization", `Bearer ${uid}`)
        .expect(200);

      //THEN
      expect(getLeaderboardRankMock).toHaveBeenCalledWith(
        "time",
        "8",
        uid,
        true,
      );
      expect(body).toEqual({
        message: "Rank retrieved",
        data: null,
      });
    });
    it("should get for mode", async () => {
      getLeaderboardRankMock.mockResolvedValue({} as any);
      for (const mode of boardModes) {
        const response = await mockApp
          .get("/leaderboards/rank")
          .set("Authorization", `Bearer ${uid}`)
          .query({ mode, mode2: jsonQuery("8") });
        expect(response.status, `for mode ${mode}`).toEqual(200);
      }
    });

    it("should get for mode2", async () => {
      getLeaderboardRankMock.mockResolvedValue({} as any);
      for (const mode2 of boardMode2s) {
        const response = await mockApp
          .get("/leaderboards/rank")
          .set("Authorization", `Bearer ${uid}`)
          .query({ mode: "time", mode2: jsonQuery(mode2) });

        expect(response.status, `for mode2 ${mode2}`).toEqual(200);
      }
    });
    it("fails for missing query", async () => {
      const { body } = await mockApp
        .get("/leaderboards/rank")
        .set("Authorization", `Bearer ${uid}`)
        .expect(422);

      expect(body).toEqual({
        message: "Invalid query schema",
        validationErrors: ['"mode" Required', '"mode2" Required'],
      });
    });
    it("fails for invalid query", async () => {
      const { body } = await mockApp
        .get("/leaderboards/rank")
        .query({
          mode: "unknownMode",
          mode2: "unknownMode2",
        })
        .set("Authorization", `Bearer ${uid}`)
        .expect(422);

      expect(body).toEqual({
        message: "Invalid query schema",
        validationErrors: [
          `"mode" Invalid enum value. Expected 'time', received 'unknownMode'`,
          `"mode2" Invalid enum value. Expected '4' | '8', received 'unknownMode2'`,
        ],
      });
    });
    it("fails for unknown query", async () => {
      const { body } = await mockApp
        .get("/leaderboards/rank")
        .query({
          mode: "time",
          mode2: jsonQuery("8"),
          extra: "value",
        })
        .set("Authorization", `Bearer ${uid}`)
        .expect(422);

      expect(body).toEqual({
        message: "Invalid query schema",
        validationErrors: ["Unrecognized key(s) in object: 'extra'"],
      });
    });
    it("fails while leaderboard is updating", async () => {
      //GIVEN
      getLeaderboardRankMock.mockResolvedValue(false);

      //WHEN
      const { body } = await mockApp
        .get("/leaderboards/rank")
        .query({
          mode: "time",
          mode2: jsonQuery("8"),
        })
        .set("Authorization", `Bearer ${uid}`)
        .expect(503);

      expect(body.message).toEqual(
        "Leaderboard is currently updating. Please try again in a few seconds.",
      );
    });
  });

  describe("get daily leaderboard", () => {
    const getDailyLeaderboardMock = vi.spyOn(
      DailyLeaderboards,
      "getDailyLeaderboard",
    );
    const getFriendsUidsMock = vi.spyOn(ConnectionsDal, "getFriendsUids");
    const getResultMock = vi.fn();

    beforeEach(async () => {
      [getDailyLeaderboardMock, getFriendsUidsMock, getResultMock].forEach(
        (it) => it.mockClear(),
      );
      vi.useFakeTimers();
      vi.setSystemTime(1722606812000);
      await dailyLeaderboardEnabled(true);

      getDailyLeaderboardMock.mockReturnValue({
        getResults: getResultMock,
      } as any);

      getResultMock.mockResolvedValue(null);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should get for time 8", async () => {
      //GIVEN
      const lbConf = (await configuration).dailyLeaderboards;

      const resultData = {
        minScore: 10,
        entries: [
          {
            name: "user1",
            rank: 1,
            tpm: 20,
            acc: 90,
            timestamp: 1000,
            consistency: 80,
            uid: "user1",
          },
          {
            tpm: 10,
            rank: 2,
            acc: 80,
            timestamp: 1200,
            consistency: 72,
            uid: "user2",
            name: "user2",
          },
        ],
      };

      getResultMock.mockResolvedValue({
        count: 2,
        minScore: 10,
        entries: resultData,
      });

      //WHEN
      const { body } = await mockApp
        .get("/leaderboards/daily")
        .query({ mode: "time", mode2: jsonQuery("8") })
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "Daily leaderboard retrieved",
        data: {
          count: 2,
          pageSize: 50,
          minScore: 10,
          entries: resultData,
        },
      });

      expect(getDailyLeaderboardMock).toHaveBeenCalledWith(
        "time",
        "8",
        lbConf,
        -1,
      );

      expect(getResultMock).toHaveBeenCalledWith(0, 50, lbConf, undefined);
    });

    it("should get for time 8 for yesterday", async () => {
      //GIVEN
      const lbConf = (await configuration).dailyLeaderboards;

      //WHEN
      const { body } = await mockApp
        .get("/leaderboards/daily")
        .query({
          mode: "time",
          mode2: jsonQuery("8"),
          daysBefore: 1,
        })
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "Daily leaderboard retrieved",
        data: {
          entries: [],
          count: 0,
          pageSize: 50,
          minScore: 0,
        },
      });

      expect(getDailyLeaderboardMock).toHaveBeenCalledWith(
        "time",
        "8",
        lbConf,
        1722470400000,
      );
    });
    it("should get for time 8 with page and pageSize", async () => {
      //GIVEN
      const lbConf = (await configuration).dailyLeaderboards;
      const page = 2;
      const pageSize = 25;

      getResultMock.mockResolvedValue({ entries: [] });

      //WHEN
      const { body } = await mockApp
        .get("/leaderboards/daily")
        .query({
          mode: "time",
          mode2: jsonQuery("8"),
          page,
          pageSize,
        })
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "Daily leaderboard retrieved",
        data: {
          entries: [],
          count: 0,
          pageSize,
          minScore: 0,
        },
      });

      expect(getDailyLeaderboardMock).toHaveBeenCalledWith(
        "time",
        "8",
        lbConf,
        -1,
      );

      expect(getResultMock).toHaveBeenCalledWith(
        page,
        pageSize,
        lbConf,
        undefined,
      );
    });

    it("should get for friends", async () => {
      //GIVEN
      const lbConf = (await configuration).dailyLeaderboards;
      await enableConnectionsFeature(true);
      const friends = [
        new ObjectId().toHexString(),
        new ObjectId().toHexString(),
      ];
      getFriendsUidsMock.mockResolvedValue(friends);

      //WHEN
      await mockApp
        .get("/leaderboards/daily")
        .set("Authorization", `Bearer ${uid}`)
        .query({
          mode: "time",
          mode2: jsonQuery("8"),
          friendsOnly: true,
        })
        .expect(200);

      //THEN

      expect(getDailyLeaderboardMock).toHaveBeenCalledWith(
        "time",
        "8",
        lbConf,
        -1,
      );

      expect(getResultMock).toHaveBeenCalledWith(0, 50, lbConf, friends);
    });

    it("fails for daysBefore not one", async () => {
      const { body } = await mockApp
        .get("/leaderboards/daily")
        .query({
          mode: "time",
          mode2: jsonQuery("8"),
          daysBefore: 2,
        })
        .expect(422);

      expect(body).toEqual({
        message: "Invalid query schema",
        validationErrors: ['"daysBefore" Invalid literal value, expected 1'],
      });
    });

    it("fails if daily leaderboards are disabled", async () => {
      await dailyLeaderboardEnabled(false);

      const { body } = await mockApp.get("/leaderboards/daily").expect(503);

      expect(body.message).toEqual(
        "Daily leaderboards are not available at this time.",
      );
    });

    it("should get for mode", async () => {
      for (const mode of boardModes) {
        const response = await mockApp
          .get("/leaderboards/daily")
          .query({ mode, mode2: jsonQuery("8") });
        expect(response.status, `for mode ${mode}`).toEqual(200);
      }
    });

    it("should get for mode2", async () => {
      for (const mode2 of boardMode2s) {
        const response = await mockApp
          .get("/leaderboards/daily")
          .query({ mode: "time", mode2: jsonQuery(mode2) });

        expect(response.status, `for mode2 ${mode2}`).toEqual(200);
      }
    });

    it("fails for missing query", async () => {
      const { body } = await mockApp.get("/leaderboards").expect(422);

      expect(body).toEqual({
        message: "Invalid query schema",
        validationErrors: ['"mode" Required', '"mode2" Required'],
      });
    });

    it("fails for invalid query", async () => {
      const { body } = await mockApp
        .get("/leaderboards/daily")
        .query({
          mode: "unknownMode",
          mode2: "unknownMode2",
        })
        .expect(422);

      expect(body).toEqual({
        message: "Invalid query schema",
        validationErrors: [
          `"mode" Invalid enum value. Expected 'time', received 'unknownMode'`,
          `"mode2" Invalid enum value. Expected '4' | '8', received 'unknownMode2'`,
        ],
      });
    });
    it("fails for unknown query", async () => {
      const { body } = await mockApp
        .get("/leaderboards/daily")
        .query({
          mode: "time",
          mode2: jsonQuery("8"),
          extra: "value",
        })
        .expect(422);

      expect(body).toEqual({
        message: "Invalid query schema",
        validationErrors: ["Unrecognized key(s) in object: 'extra'"],
      });
    });
    it("fails while leaderboard is missing", async () => {
      //GIVEN
      getDailyLeaderboardMock.mockReturnValue(null);

      //WHEN
      const { body } = await mockApp
        .get("/leaderboards/daily")
        .query({
          mode: "time",
          mode2: jsonQuery("8"),
        })
        .expect(404);

      expect(body.message).toEqual(
        "There is no daily leaderboard for this mode",
      );
    });
  });

  describe("get daily leaderboard rank", () => {
    const getDailyLeaderboardMock = vi.spyOn(
      DailyLeaderboards,
      "getDailyLeaderboard",
    );
    const getRankMock = vi.fn();
    const getFriendsUidsMock = vi.spyOn(ConnectionsDal, "getFriendsUids");

    beforeEach(async () => {
      [getDailyLeaderboardMock, getRankMock, getFriendsUidsMock].forEach((it) =>
        it.mockClear(),
      );

      getDailyLeaderboardMock.mockReturnValue({
        getRank: getRankMock,
      } as any);

      vi.useFakeTimers();
      vi.setSystemTime(1722606812000);
      await dailyLeaderboardEnabled(true);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("fails withouth authentication", async () => {
      await mockApp
        .get("/leaderboards/daily/rank")

        .query({ mode: "time", mode2: jsonQuery("8") })
        .expect(401);
    });
    it("should get for time 8", async () => {
      //GIVEN
      const lbConf = (await configuration).dailyLeaderboards;
      const rankData = {
        min: 100,
        count: 1000,
        rank: 12,
        entry: {
          tpm: 10,
          rank: 2,
          acc: 80,
          timestamp: 1200,
          consistency: 72,
          uid: "user2",
          name: "user2",
        },
      };

      getRankMock.mockResolvedValue(rankData);

      //WHEN
      const { body } = await mockApp
        .get("/leaderboards/daily/rank")
        .set("Authorization", `Bearer ${uid}`)
        .query({ mode: "time", mode2: jsonQuery("8") })
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "Daily leaderboard rank retrieved",
        data: rankData,
      });

      expect(getDailyLeaderboardMock).toHaveBeenCalledWith(
        "time",
        "8",
        lbConf,
        -1,
      );

      expect(getRankMock).toHaveBeenCalledWith(uid, lbConf, undefined);
    });

    it("should get for time 8 friends only", async () => {
      //GIVEN
      await enableConnectionsFeature(true);
      const lbConf = (await configuration).dailyLeaderboards;
      getRankMock.mockResolvedValue({});
      const friends = ["friendOne", "friendTwo"];
      getFriendsUidsMock.mockResolvedValue(friends);

      //WHEN
      await mockApp
        .get("/leaderboards/daily/rank")
        .set("Authorization", `Bearer ${uid}`)
        .query({
          mode: "time",
          mode2: jsonQuery("8"),
          friendsOnly: true,
        })
        .expect(200);

      //THEN

      expect(getDailyLeaderboardMock).toHaveBeenCalledWith(
        "time",
        "8",
        lbConf,
        -1,
      );

      expect(getRankMock).toHaveBeenCalledWith(uid, lbConf, friends);
      expect(getFriendsUidsMock).toHaveBeenCalledWith(uid);
    });

    it("fails if daily leaderboards are disabled", async () => {
      await dailyLeaderboardEnabled(false);

      const { body } = await mockApp
        .get("/leaderboards/daily/rank")
        .set("Authorization", `Bearer ${uid}`)
        .expect(503);

      expect(body.message).toEqual(
        "Daily leaderboards are not available at this time.",
      );
    });

    it("should get for mode", async () => {
      for (const mode of boardModes) {
        const response = await mockApp
          .get("/leaderboards/daily/rank")
          .set("Authorization", `Bearer ${uid}`)
          .query({ mode, mode2: jsonQuery("8") });
        expect(response.status, `for mode ${mode}`).toEqual(200);
      }
    });

    it("should get for mode2", async () => {
      for (const mode2 of boardMode2s) {
        const response = await mockApp
          .get("/leaderboards/daily/rank")
          .set("Authorization", `Bearer ${uid}`)
          .query({ mode: "time", mode2: jsonQuery(mode2) });

        expect(response.status, `for mode2 ${mode2}`).toEqual(200);
      }
    });

    it("fails for missing query", async () => {
      const { body } = await mockApp
        .get("/leaderboards/daily/rank")
        .set("Authorization", `Bearer ${uid}`)
        .expect(422);

      expect(body).toEqual({
        message: "Invalid query schema",
        validationErrors: ['"mode" Required', '"mode2" Required'],
      });
    });

    it("fails for invalid query", async () => {
      const { body } = await mockApp
        .get("/leaderboards/daily/rank")
        .query({
          mode: "unknownMode",
          mode2: "unknownMode2",
        })
        .set("Authorization", `Bearer ${uid}`)
        .expect(422);

      expect(body).toEqual({
        message: "Invalid query schema",
        validationErrors: [
          `"mode" Invalid enum value. Expected 'time', received 'unknownMode'`,
          `"mode2" Invalid enum value. Expected '4' | '8', received 'unknownMode2'`,
        ],
      });
    });

    it("fails for unknown query", async () => {
      const { body } = await mockApp
        .get("/leaderboards/daily/rank")
        .query({
          mode: "time",
          mode2: jsonQuery("8"),
          extra: "value",
        })
        .set("Authorization", `Bearer ${uid}`)
        .expect(422);

      expect(body).toEqual({
        message: "Invalid query schema",
        validationErrors: ["Unrecognized key(s) in object: 'extra'"],
      });
    });

    it("fails while leaderboard is missing", async () => {
      //GIVEN
      getDailyLeaderboardMock.mockReturnValue(null);

      //WHEN
      const { body } = await mockApp
        .get("/leaderboards/daily/rank")
        .set("Authorization", `Bearer ${uid}`)
        .query({
          mode: "time",
          mode2: jsonQuery("8"),
        })
        .expect(404);

      expect(body.message).toEqual(
        "There is no daily leaderboard for this mode",
      );
    });
  });

  describe("get xp weekly leaderboard", () => {
    const getXpWeeklyLeaderboardMock = vi.spyOn(WeeklyXpLeaderboard, "get");
    const getResultMock = vi.fn();
    const getFriendsUidsMock = vi.spyOn(ConnectionsDal, "getFriendsUids");

    beforeEach(async () => {
      [getXpWeeklyLeaderboardMock, getResultMock, getFriendsUidsMock].forEach(
        (it) => it.mockClear(),
      );
      vi.useFakeTimers();
      vi.setSystemTime(1722606812000);
      await weeklyLeaderboardEnabled(true);

      getXpWeeklyLeaderboardMock.mockReturnValue({
        getResults: getResultMock,
      } as any);

      getResultMock.mockResolvedValue(null);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should get", async () => {
      //GIVEN
      const lbConf = (await configuration).leaderboards.weeklyXp;

      const resultData: XpLeaderboardEntry[] = [
        {
          totalXp: 100,
          rank: 1,
          timeSpentSeconds: 100,
          uid: "user1",
          name: "user1",
          lastActivityTimestamp: 1000,
        },
        {
          totalXp: 75,
          rank: 2,
          timeSpentSeconds: 200,
          uid: "user2",
          name: "user2",
          lastActivityTimestamp: 2000,
        },
      ];

      getResultMock.mockResolvedValue({ count: 2, entries: resultData });

      //WHEN
      const { body } = await mockApp
        .get("/leaderboards/xp/weekly")
        .query({})
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "Weekly xp leaderboard retrieved",
        data: {
          entries: resultData,
          count: 2,
          pageSize: 50,
        },
      });

      expect(getXpWeeklyLeaderboardMock).toHaveBeenCalledWith(lbConf, -1);

      expect(getResultMock).toHaveBeenCalledWith(0, 50, lbConf, undefined);
    });

    it("should get for last week", async () => {
      //GIVEN
      const lbConf = (await configuration).leaderboards.weeklyXp;

      //WHEN
      const { body } = await mockApp
        .get("/leaderboards/xp/weekly")
        .query({
          weeksBefore: 1,
        })
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "Weekly xp leaderboard retrieved",
        data: {
          count: 0,
          entries: [],
          pageSize: 50,
        },
      });

      expect(getXpWeeklyLeaderboardMock).toHaveBeenCalledWith(
        lbConf,
        1721606400000,
      );
    });

    it("should get with skip and limit", async () => {
      //GIVEN
      const lbConf = (await configuration).leaderboards.weeklyXp;
      const page = 2;
      const pageSize = 25;

      //WHEN
      const { body } = await mockApp
        .get("/leaderboards/xp/weekly")
        .query({
          page,
          pageSize,
        })
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "Weekly xp leaderboard retrieved",
        data: {
          entries: [],
          count: 0,
          pageSize,
        },
      });

      expect(getXpWeeklyLeaderboardMock).toHaveBeenCalledWith(lbConf, -1);

      expect(getResultMock).toHaveBeenCalledWith(
        page,
        pageSize,
        lbConf,
        undefined,
      );
    });

    it("should get for friends", async () => {
      //GIVEN
      const lbConf = (await configuration).leaderboards.weeklyXp;
      await enableConnectionsFeature(true);
      const page = 2;
      const pageSize = 25;
      const friends = [
        new ObjectId().toHexString(),
        new ObjectId().toHexString(),
      ];
      getFriendsUidsMock.mockResolvedValue(friends);

      //WHEN
      await mockApp
        .get("/leaderboards/xp/weekly")
        .set("Authorization", `Bearer ${uid}`)
        .query({
          page,
          pageSize,
          friendsOnly: true,
        })
        .expect(200);

      //THEN

      expect(getXpWeeklyLeaderboardMock).toHaveBeenCalledWith(lbConf, -1);

      expect(getResultMock).toHaveBeenCalledWith(
        page,
        pageSize,
        lbConf,
        friends,
      );
    });

    it("fails if daily leaderboards are disabled", async () => {
      await weeklyLeaderboardEnabled(false);

      const { body } = await mockApp.get("/leaderboards/xp/weekly").expect(503);

      expect(body.message).toEqual(
        "Weekly XP leaderboards are not available at this time.",
      );
    });

    it("fails for weeksBefore not one", async () => {
      const { body } = await mockApp
        .get("/leaderboards/xp/weekly")
        .query({
          weeksBefore: 2,
        })
        .expect(422);

      expect(body).toEqual({
        message: "Invalid query schema",
        validationErrors: ['"weeksBefore" Invalid literal value, expected 1'],
      });
    });

    it("fails for unknown query", async () => {
      const { body } = await mockApp
        .get("/leaderboards/xp/weekly")
        .query({
          extra: "value",
        })
        .expect(422);

      expect(body).toEqual({
        message: "Invalid query schema",
        validationErrors: ["Unrecognized key(s) in object: 'extra'"],
      });
    });

    it("fails while leaderboard is missing", async () => {
      //GIVEN
      getXpWeeklyLeaderboardMock.mockReturnValue(null);

      //WHEN
      const { body } = await mockApp.get("/leaderboards/xp/weekly").expect(404);

      expect(body.message).toEqual("XP leaderboard for this week not found.");
    });
  });

  describe("get xp weekly leaderboard rank", () => {
    const getXpWeeklyLeaderboardMock = vi.spyOn(WeeklyXpLeaderboard, "get");
    const getRankMock = vi.fn();
    const getFriendsUidsMock = vi.spyOn(ConnectionsDal, "getFriendsUids");

    beforeEach(async () => {
      [getXpWeeklyLeaderboardMock, getRankMock, getFriendsUidsMock].forEach(
        (it) => it.mockClear(),
      );

      await weeklyLeaderboardEnabled(true);
      vi.useFakeTimers();
      vi.setSystemTime(1722606812000);

      getXpWeeklyLeaderboardMock.mockReturnValue({
        getRank: getRankMock,
      } as any);
    });

    it("fails withouth authentication", async () => {
      await mockApp.get("/leaderboards/xp/weekly/rank").expect(401);
    });

    it("should get", async () => {
      //GIVEN
      const lbConf = (await configuration).leaderboards.weeklyXp;

      const resultData: XpLeaderboardEntry = {
        totalXp: 100,
        rank: 1,
        timeSpentSeconds: 100,
        uid: "user1",
        name: "user1",
        lastActivityTimestamp: 1000,
      };

      getRankMock.mockResolvedValue(resultData);

      //WHEN
      const { body } = await mockApp
        .get("/leaderboards/xp/weekly/rank")
        .set("Authorization", `Bearer ${uid}`)
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "Weekly xp leaderboard rank retrieved",
        data: resultData,
      });

      expect(getXpWeeklyLeaderboardMock).toHaveBeenCalledWith(lbConf, -1);

      expect(getRankMock).toHaveBeenCalledWith(uid, lbConf, undefined);
    });

    it("should get for last week", async () => {
      //GIVEN
      const lbConf = (await configuration).leaderboards.weeklyXp;
      getRankMock.mockResolvedValue({});

      //WHEN
      const { body } = await mockApp
        .get("/leaderboards/xp/weekly/rank")
        .query({ weeksBefore: 1 })
        .set("Authorization", `Bearer ${uid}`)
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "Weekly xp leaderboard rank retrieved",
        data: {},
      });

      expect(getXpWeeklyLeaderboardMock).toHaveBeenCalledWith(
        lbConf,
        1721606400000,
      );

      expect(getRankMock).toHaveBeenCalledWith(uid, lbConf, undefined);
    });

    it("should get for friendsOnly", async () => {
      //GIVEN
      const lbConf = (await configuration).leaderboards.weeklyXp;
      await enableConnectionsFeature(true);
      getRankMock.mockResolvedValue({});
      const friends = ["friendOne", "friendTwo"];
      getFriendsUidsMock.mockResolvedValue(friends);

      //WHEN
      const { body } = await mockApp
        .get("/leaderboards/xp/weekly/rank")
        .query({ friendsOnly: true })
        .set("Authorization", `Bearer ${uid}`)
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "Weekly xp leaderboard rank retrieved",
        data: {},
      });

      expect(getXpWeeklyLeaderboardMock).toHaveBeenCalledWith(lbConf, -1);

      expect(getRankMock).toHaveBeenCalledWith(uid, lbConf, friends);
    });

    it("fails if daily leaderboards are disabled", async () => {
      await weeklyLeaderboardEnabled(false);

      const { body } = await mockApp
        .get("/leaderboards/xp/weekly/rank")
        .set("Authorization", `Bearer ${uid}`)
        .expect(503);

      expect(body.message).toEqual(
        "Weekly XP leaderboards are not available at this time.",
      );
    });

    it("fails for weeksBefore not one", async () => {
      const { body } = await mockApp
        .get("/leaderboards/xp/weekly/rank")
        .set("Authorization", `Bearer ${uid}`)
        .query({
          weeksBefore: 2,
        })
        .expect(422);

      expect(body).toEqual({
        message: "Invalid query schema",
        validationErrors: ['"weeksBefore" Invalid literal value, expected 1'],
      });
    });

    it("fails for unknown query", async () => {
      const { body } = await mockApp
        .get("/leaderboards/xp/weekly/rank")
        .set("Authorization", `Bearer ${uid}`)
        .query({
          extra: "value",
        })
        .expect(422);

      expect(body).toEqual({
        message: "Invalid query schema",
        validationErrors: ["Unrecognized key(s) in object: 'extra'"],
      });
    });

    it("fails while leaderboard is missing", async () => {
      //GIVEN
      getXpWeeklyLeaderboardMock.mockReturnValue(null);

      //WHEN
      const { body } = await mockApp
        .get("/leaderboards/xp/weekly/rank")
        .set("Authorization", `Bearer ${uid}`)
        .expect(404);

      expect(body.message).toEqual("XP leaderboard for this week not found.");
    });
  });
});

async function dailyLeaderboardEnabled(enabled: boolean): Promise<void> {
  const mockConfig = await configuration;
  mockConfig.dailyLeaderboards = {
    ...mockConfig.dailyLeaderboards,
    enabled: enabled,
  };

  vi.spyOn(Configuration, "getCachedConfiguration").mockResolvedValue(
    mockConfig,
  );
}
async function weeklyLeaderboardEnabled(enabled: boolean): Promise<void> {
  const mockConfig = await configuration;
  mockConfig.leaderboards.weeklyXp = {
    ...mockConfig.leaderboards.weeklyXp,
    enabled,
  };

  vi.spyOn(Configuration, "getCachedConfiguration").mockResolvedValue(
    mockConfig,
  );
}
async function enableConnectionsFeature(enabled: boolean): Promise<void> {
  const mockConfig = await configuration;
  mockConfig.connections = { ...mockConfig.connections, enabled };

  vi.spyOn(Configuration, "getCachedConfiguration").mockResolvedValue(
    mockConfig,
  );
}
