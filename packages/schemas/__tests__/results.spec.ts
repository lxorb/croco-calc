import { describe, it, expect } from "vitest";
import {
  CHART_DATA_MAX_POINTS,
  ChartDataSchema,
  CompletedEventSchema,
  RESULT_CSV_HEADER,
  ResultSchema,
  XpBreakdownSchema,
} from "@croco-calc/schemas/results";
import { LEADERBOARD_SETTINGS_ID } from "@croco-calc/schemas/math";

const settings = {
  addition: "1000",
  multiplication: "100",
  division: "threeByTwo",
  fractionAddition: "99",
  fractionMultiplication: true,
  decimals: true,
  negatives: true,
} as const;

function result(overrides: Record<string, unknown> = {}): unknown {
  return {
    _id: "abc123",
    name: "someone",
    score: 190,
    correct: 200,
    wrong: 10,
    acc: 95.24,
    tpm: 26.25,
    spm: 23.75,
    consistency: 71.2,
    mode: "time",
    mode2: "8",
    timestamp: 1770000000000,
    testDuration: 480,
    chartData: { score: [0, 1], tpm: [0, 60], wrong: [0, 0] },
    uid: "someuid",
    settings,
    settingsId: LEADERBOARD_SETTINGS_ID,
    ...overrides,
  };
}

describe("result schema", () => {
  describe("metrics", () => {
    it("accepts a full croco calc result", () => {
      const parsed = ResultSchema.safeParse(result());
      expect(parsed.error?.issues).toBeUndefined();
      expect(parsed.success).toBe(true);
    });

    it("accepts acc below 50 and below 12.5 (BL-5 cleared)", () => {
      expect(ResultSchema.safeParse(result({ acc: 12.5 })).success).toBe(true);
      expect(ResultSchema.safeParse(result({ acc: 0 })).success).toBe(true);
      expect(ResultSchema.safeParse(result({ acc: 49.99 })).success).toBe(true);
    });

    it("still rejects an out-of-range acc", () => {
      expect(ResultSchema.safeParse(result({ acc: -1 })).success).toBe(false);
      expect(ResultSchema.safeParse(result({ acc: 101 })).success).toBe(false);
    });

    it("accepts a negative score and a negative spm (AC-003, AC-006)", () => {
      expect(
        ResultSchema.safeParse(result({ score: -12, spm: -1.5 })).success,
      ).toBe(true);
    });

    it("rejects a fractional score", () => {
      expect(ResultSchema.safeParse(result({ score: 1.5 })).success).toBe(
        false,
      );
    });

    it("rejects a negative tpm", () => {
      expect(ResultSchema.safeParse(result({ tpm: -1 })).success).toBe(false);
    });

    it("exposes exactly the persisted result fields", () => {
      expect(Object.keys(ResultSchema.shape).sort()).toEqual(
        [
          "score",
          "correct",
          "wrong",
          "acc",
          "tpm",
          "spm",
          "consistency",
          "mode",
          "mode2",
          "timestamp",
          "testDuration",
          "chartData",
          "uid",
          "settings",
          "settingsId",
          "restartCount",
          "incompleteTestSeconds",
          "afkDuration",
          "_id",
          "name",
          "isPb",
        ].sort(),
      );
    });

    it("persists the idle metric under the master C37 name", () => {
      expect(Object.keys(ResultSchema.shape)).toContain("afkDuration");
    });
  });

  describe("chart data (master C7)", () => {
    it("caps every series at 481 points, one per second of an 8-minute test", () => {
      expect(CHART_DATA_MAX_POINTS).toBe(481);
      const full = Array.from({ length: 481 }, (_, i) => i);
      expect(
        ChartDataSchema.safeParse({ score: full, tpm: full, wrong: full })
          .success,
      ).toBe(true);
      const tooLong = Array.from({ length: 482 }, (_, i) => i);
      expect(
        ChartDataSchema.safeParse({
          score: tooLong,
          tpm: full,
          wrong: full,
        }).success,
      ).toBe(false);
    });

    it("carries the score / tpm / wrong series (CP-114 … CP-116)", () => {
      expect(Object.keys(ChartDataSchema.shape)).toEqual([
        "score",
        "tpm",
        "wrong",
      ]);
    });
  });

  describe("completed event", () => {
    const completed = {
      ...(result() as Record<string, unknown>),
      restartCount: 0,
      incompleteTestSeconds: 0,
      afkDuration: 0,
      hash: "deadbeef",
      mathSeed: 4294967295,
      mathSettings: { ...settings, time: 8 },
      engineVersion: "1.0.0",
      taskLog: [
        {
          i: 0,
          kind: "add",
          prompt: "12 + 5 =",
          expected: "17",
          given: "17",
          correct: true,
          tStart: 0,
          tEnd: 1200,
        },
      ],
      incompleteTests: [],
    };
    delete (completed as Record<string, unknown>)["_id"];
    delete (completed as Record<string, unknown>)["name"];

    it("accepts the anti-cheat payload (ME-169, ME-173, ME-177)", () => {
      const parsed = CompletedEventSchema.safeParse(completed);
      expect(parsed.error?.issues).toBeUndefined();
      expect(parsed.success).toBe(true);
    });

    it("accepts the ME-176 'toolong' task log degradation", () => {
      expect(
        CompletedEventSchema.safeParse({ ...completed, taskLog: "toolong" })
          .success,
      ).toBe(true);
    });

    it("rejects a seed outside uint32", () => {
      expect(
        CompletedEventSchema.safeParse({ ...completed, mathSeed: 4294967296 })
          .success,
      ).toBe(false);
    });

    it("exposes exactly the submitted fields, and is strict", () => {
      expect(Object.keys(CompletedEventSchema.shape).sort()).toEqual(
        [
          "score",
          "correct",
          "wrong",
          "acc",
          "tpm",
          "spm",
          "consistency",
          "mode",
          "mode2",
          "timestamp",
          "testDuration",
          "chartData",
          "uid",
          "settings",
          "settingsId",
          "restartCount",
          "incompleteTestSeconds",
          "afkDuration",
          "hash",
          "mathSeed",
          "mathSettings",
          "engineVersion",
          "taskLog",
          "incompleteTests",
        ].sort(),
      );
      expect(
        CompletedEventSchema.safeParse({ ...completed, keyOverlap: 1 }).success,
      ).toBe(false);
    });
  });

  describe("xp breakdown (AC-036)", () => {
    it("has exactly the six retained keys, in display order", () => {
      expect(Object.keys(XpBreakdownSchema.shape)).toEqual([
        "base",
        "fullAccuracy",
        "modes",
        "accPenalty",
        "configMultiplier",
        "daily",
      ]);
    });
  });

  describe("csv contract (AC-100, master C37/C38)", () => {
    it("matches the amended header byte for byte", () => {
      expect(RESULT_CSV_HEADER).toBe(
        "_id,isPb,score,correct,wrong,acc,tpm,spm,mode2,testDuration,afkDuration,restartCount," +
          "addition,multiplication,division,fractionAddition,fractionMultiplication,decimals,negatives," +
          "settingsId,timestamp",
      );
    });
  });
});
