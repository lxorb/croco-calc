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

    // CP-137: the query collapsed to `{ time: 4 | 8 }` — a *number*, not the old
    // `{ mode, mode2 }` string pair. The router runs with `jsonQuery: true`
    // (src/api/routes/index.ts), so ts-rest runs each raw query value through
    // JSON.parse before validation: `?time=4` arrives as the number 4 and
    // matches the literal union directly. No encoding helper is needed here
    // precisely because the value is numeric.
    it("gets for time 4", async () => {
      //GIVEN
      getScoreHistogramMock.mockResolvedValue({ "0": 1, "10": 2 });

      //WHEN
      const { body } = await mockApp
        .get("/public/scoreHistogram")
        .query({ time: 4 })
        .expect(200);

      //THEN
      expect(body).toEqual({
        message: "Public score histogram retrieved",
        data: { "0": 1, "10": 2 },
      });

      expect(getScoreHistogramMock).toHaveBeenCalledWith(4);
    });

    //SB-176: leaderboards, and therefore the histogram, exist for time 4 and 8 only
    it("gets for every leaderboard time", async () => {
      getScoreHistogramMock.mockResolvedValue({});

      for (const time of [4, 8]) {
        const response = await mockApp
          .get("/public/scoreHistogram")
          .query({ time });

        expect(response.status, `for time ${time}`).toEqual(200);
        expect(getScoreHistogramMock).toHaveBeenCalledWith(time);
      }
    });

    it("fails for a non-leaderboard time", async () => {
      for (const time of [1, 2, 15, 60]) {
        const response = await mockApp
          .get("/public/scoreHistogram")
          .query({ time });

        expect(response.status, `for time ${time}`).toEqual(422);
      }
    });

    it("fails for missing query", async () => {
      const { body } = await mockApp.get("/public/scoreHistogram").expect(422);

      expect(body.message).toEqual("Invalid query schema");
    });

    it("fails for invalid query", async () => {
      const { body } = await mockApp
        .get("/public/scoreHistogram")
        .query({ time: "unknownTime" })
        .expect(422);

      expect(body.message).toEqual("Invalid query schema");
    });

    //AC-090 / INV-153: there is no language axis any more, and CP-137 removed
    //`mode`/`mode2` — the schema is strict, so either is now an unknown key.
    it("fails for unknown query", async () => {
      const { body } = await mockApp
        .get("/public/scoreHistogram")
        .query({ time: 4, language: "english" })
        .expect(422);

      expect(body).toEqual({
        message: "Invalid query schema",
        validationErrors: ["Unrecognized key(s) in object: 'language'"],
      });
    });
  });

  // CP-135: `GET /public/siteStats` became `GET /public/trainingStats`, and the
  // wire field `timeSpent` became `timeTraining`. The DAL returns the wire shape
  // (the stored document keeps `timeSpent`), so the mock returns `timeTraining`.
  describe("get training stats", () => {
    const getTrainingStatsMock = vi.spyOn(PublicDal, "getTrainingStats");

    afterEach(() => {
      getTrainingStatsMock.mockClear();
    });

    it("gets without authentication", async () => {
      //GIVEN
      getTrainingStatsMock.mockResolvedValue({
        testsCompleted: 23,
        testsStarted: 42,
        timeTraining: 1000,
      });

      //WHEN
      const { body } = await mockApp.get("/public/trainingStats").expect(200);

      //THEN
      expect(body).toEqual({
        message: "Public training stats retrieved",
        data: {
          testsCompleted: 23,
          testsStarted: 42,
          timeTraining: 1000,
        },
      });
    });
  });
});
