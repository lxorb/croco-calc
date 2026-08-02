import { describe, it, expect, afterEach, vi } from "vitest";
import { setup } from "../../__testData__/controller-test";
import * as PublicDal from "../../../src/dal/public";

const { mockApp } = setup();

describe("PublicController", () => {
  describe("get score histogram", () => {
    const getScoreHistogramMock = vi.spyOn(PublicDal, "getScoreHistogram");

    afterEach(() => {
      getScoreHistogramMock.mockClear();
    });

    it("gets for time 4", async () => {
      //GIVEN
      getScoreHistogramMock.mockResolvedValue({ "0": 1, "10": 2 });

      //WHEN
      const { body } = await mockApp
        .get("/public/scoreHistogram")
        .query({ mode: "time", mode2: "4" })
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "Public score histogram retrieved",
        data: { "0": 1, "10": 2 },
      });

      expect(getScoreHistogramMock).toHaveBeenCalledWith("time", "4");
    });

    //SB-176: leaderboards, and therefore the histogram, exist for time 4 and 8 only
    it("gets for every leaderboard mode2", async () => {
      getScoreHistogramMock.mockResolvedValue({});

      for (const mode2 of ["4", "8"]) {
        const response = await mockApp
          .get("/public/scoreHistogram")
          .query({ mode: "time", mode2 });

        expect(response.status, `for mode2 ${mode2}`).toEqual(200);
      }
    });

    it("fails for a non-leaderboard mode2", async () => {
      for (const mode2 of ["1", "2", "15", "60"]) {
        const response = await mockApp
          .get("/public/scoreHistogram")
          .query({ mode: "time", mode2 });

        expect(response.status, `for mode2 ${mode2}`).toEqual(422);
      }
    });

    it("fails for missing query", async () => {
      const { body } = await mockApp.get("/public/scoreHistogram").expect(422);

      expect(body).toEqual({
        message: "Invalid query schema",
        validationErrors: ['"mode" Required', '"mode2" Required'],
      });
    });

    it("fails for invalid query", async () => {
      const { body } = await mockApp
        .get("/public/scoreHistogram")
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

    //AC-090 / INV-153: there is no language axis any more
    it("fails for unknown query", async () => {
      const { body } = await mockApp
        .get("/public/scoreHistogram")
        .query({
          mode: "time",
          mode2: "4",
          language: "english",
        })
        .expect(422);

      expect(body).toEqual({
        message: "Invalid query schema",
        validationErrors: ["Unrecognized key(s) in object: 'language'"],
      });
    });
  });

  describe("get site stats", () => {
    const getSiteStatsMock = vi.spyOn(PublicDal, "getSiteStats");

    afterEach(() => {
      getSiteStatsMock.mockClear();
    });

    it("gets without authentication", async () => {
      //GIVEN
      getSiteStatsMock.mockResolvedValue({
        _id: "stats",
        testsCompleted: 23,
        testsStarted: 42,
        timeSpent: 1000,
      });

      //WHEN
      const { body } = await mockApp.get("/public/siteStats").expect(200);

      //THEN
      expect(body).toEqual({
        message: "Public site stats retrieved",
        data: {
          testsCompleted: 23,
          testsStarted: 42,
          timeSpent: 1000,
        },
      });
    });
  });
});
