import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as ResultDal from "../../../src/dal/result";
import { ObjectId } from "mongodb";
import * as UserDal from "../../../src/dal/user";
import { DBResult } from "../../../src/utils/result";
import {
  buildSettingsId,
  type MathGeneratorSettings,
} from "@croco-calc/schemas/math";

/**
 * `backend/src/dal/result.ts`.
 *
 * Every "should call replaceLegacyValues" case is gone with the function: the
 * legacy shapes it migrated (`correctChars`/`incorrectChars`, `funbox` as a
 * `#`-joined string, `chartData.raw`) are all deleted by AC-007 / ME-164 / C15
 * and croco calc starts from an empty `results` collection. `tags` are cut by
 * C15/INV-186, so the ordering assertions that keyed on them are re-expressed
 * against `score`, which is a real persisted field.
 */

let uid: string;
const timestamp = Date.now() - 60000;

const SETTINGS: MathGeneratorSettings = {
  addition: "1000",
  multiplication: "100",
  division: "threeByTwo",
  fractionAddition: "99",
  fractionMultiplication: true,
  decimals: true,
  negatives: true,
};

async function createDummyData(
  uid: string,
  count: number,
  modify?: Partial<DBResult>,
): Promise<void> {
  const dummyUser: UserDal.DBUser = {
    _id: new ObjectId(),
    uid,
    addedAt: 0,
    email: "test@example.com",
    name: "Bob",
    personalBests: { time: {} },
  };

  vi.spyOn(UserDal, "getUser").mockResolvedValue(dummyUser);

  for (let i = 0; i < count; i++) {
    await ResultDal.addResult(uid, {
      _id: new ObjectId(),
      score: i,
      correct: i,
      wrong: 0,
      acc: 100,
      tpm: i,
      spm: i,
      consistency: 100,
      mode: "time",
      mode2: "8",
      timestamp,
      testDuration: 480,
      chartData: { score: [], tpm: [], wrong: [] },
      settings: SETTINGS,
      settingsId: buildSettingsId(SETTINGS),
      isPb: false,
      uid,
      name: "Test",
      ...modify,
    });
  }
}

describe("ResultDal", () => {
  beforeEach(() => {
    uid = new ObjectId().toHexString();
  });
  afterEach(async () => {
    if (uid) await ResultDal.deleteAll(uid);
  });

  describe("getResults", () => {
    it("should read latest 10 results ordered by timestamp", async () => {
      //GIVEN
      await createDummyData(uid, 10, { timestamp: timestamp - 2000 });
      await createDummyData(uid, 20, { score: 999 });

      //WHEN
      const results = await ResultDal.getResults(uid, { limit: 10 });

      //THEN
      expect(results).toHaveLength(10);
      let last = results[0]?.timestamp as number;
      results.forEach((it) => {
        expect(it.score).toBe(999);
        expect(it.timestamp).toBeGreaterThanOrEqual(last);
        last = it.timestamp;
      });
    });

    it("should read all if not limited", async () => {
      //GIVEN
      await createDummyData(uid, 10, { timestamp: timestamp - 2000 });
      await createDummyData(uid, 20);

      //WHEN
      const results = await ResultDal.getResults(uid, {});

      //THEN
      expect(results).toHaveLength(30);
    });

    it("should read results onOrAfterTimestamp", async () => {
      //GIVEN
      await createDummyData(uid, 10, { timestamp: timestamp - 2000 });
      await createDummyData(uid, 20, { score: 999 });

      //WHEN
      const results = await ResultDal.getResults(uid, {
        onOrAfterTimestamp: timestamp,
      });

      //THEN
      expect(results).toHaveLength(20);
      results.forEach((it) => {
        expect(it.score).toBe(999);
      });
    });

    it("should read next 10 results", async () => {
      //GIVEN
      await createDummyData(uid, 10, {
        timestamp: timestamp - 2000,
        score: -1,
      });
      await createDummyData(uid, 20);

      //WHEN
      const results = await ResultDal.getResults(uid, {
        limit: 10,
        offset: 20,
      });

      //THEN
      expect(results).toHaveLength(10);
      results.forEach((it) => {
        expect(it.score).toBe(-1);
      });
    });

    it("BL-5/C40 — round-trips a low accuracy and a negative score", async () => {
      //GIVEN — the exact shape BL-5 says the old floors would have deleted.
      await createDummyData(uid, 1, { acc: 12.5, score: -7 });

      //WHEN
      const [stored] = await ResultDal.getResults(uid, {});

      //THEN
      expect(stored?.acc).toBe(12.5);
      expect(stored?.score).toBe(-7);
    });
  });

  describe("getResult", () => {
    it("should read a single result by id", async () => {
      //GIVEN
      await createDummyData(uid, 1, { score: 42 });
      const resultId = (await ResultDal.getLastResult(uid))._id.toHexString();

      //WHEN
      const result = await ResultDal.getResult(uid, resultId);

      //THEN
      expect(result._id.toHexString()).toBe(resultId);
      expect(result.score).toBe(42);
    });
  });

  describe("getLastResult", () => {
    it("should read the most recent result", async () => {
      //GIVEN
      await createDummyData(uid, 1, { timestamp: timestamp - 2000, score: 1 });
      await createDummyData(uid, 1, { score: 2 });

      //WHEN
      const result = await ResultDal.getLastResult(uid);

      //THEN
      expect(result.score).toBe(2);
    });
  });

  describe("getResultByTimestamp", () => {
    it("should read the result at that timestamp", async () => {
      //GIVEN
      await createDummyData(uid, 1, { score: 77 });

      //WHEN
      const result = await ResultDal.getResultByTimestamp(uid, timestamp);

      //THEN
      expect(result?.score).toBe(77);
    });
  });
});
