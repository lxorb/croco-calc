import { describe, expect, it } from "vitest";
import {
  CompletedEventSchema,
  ResultSchema,
  type CompletedEvent,
} from "@croco-calc/schemas/results";
import { PersonalBestSchema } from "@croco-calc/schemas/shared";
import {
  buildSettingsId,
  LEADERBOARD_SETTINGS_ID,
  type MathGeneratorSettings,
} from "@croco-calc/schemas/math";
import { PercentageSchema } from "@croco-calc/schemas/util";

/**
 * BL-5 regression.
 *
 * monkeytype rejected every submitted result with `acc < 75` in the result
 * controller, and its schema additionally floored `acc` at 50 (`.min(50)`).
 * A math trainer legitimately produces 40-70 % accuracy — under those two
 * constraints a large share of genuine croco calc runs would have been silently
 * discarded, and AC-029's `clamp((acc - 50) / 50, 0, 1)` would never have seen a
 * value below 50.
 *
 * Both floors are gone. These tests exist so neither can come back unnoticed:
 * every accuracy-bearing schema on the save path must accept 45 %, and 0 %.
 */

const settings: MathGeneratorSettings = {
  addition: "1000",
  multiplication: "100",
  division: "threeByTwo",
  fractionAddition: "99",
  fractionMultiplication: true,
  decimals: true,
  negatives: true,
};

/**
 * A 45 %-accuracy run: 9 correct, 11 wrong over a 4-minute test. Deliberately the
 * exact shape BL-5 names — score is negative, which is legal (AC-003/C40).
 */
function completedEventWithAcc(acc: number): CompletedEvent {
  return {
    score: -2,
    correct: 9,
    wrong: 11,
    acc,
    tpm: 5,
    spm: -0.5,
    consistency: 60,
    mode: "time",
    mode2: "4",
    timestamp: 1_754_000_000_000,
    testDuration: 240,
    chartData: {
      score: [1, 0, -1, -2],
      tpm: [4, 5, 5, 5],
      wrong: [0, 1, 1, 1],
    },
    uid: "regressionuid000000000000000000",
    settings,
    settingsId: buildSettingsId(settings),
    restartCount: 0,
    incompleteTestSeconds: 0,
    afkDuration: 0,
    hash: "0123456789abcdef0123456789abcdef",
    mathSeed: 4_242_424_242,
    mathSettings: { ...settings, time: 4 },
    engineVersion: "1.0.0",
    taskLog: [
      {
        i: 0,
        kind: "add",
        prompt: "12 + 30",
        expected: "42",
        given: "42",
        correct: true,
        tStart: 0,
        tEnd: 1200,
      },
      {
        i: 1,
        kind: "mul",
        prompt: "7 x 8",
        expected: "56",
        given: "54",
        correct: false,
        tStart: 1200,
        tEnd: 2600,
      },
    ],
    incompleteTests: [],
  };
}

describe("BL-5 — the accuracy floors are gone", () => {
  it("accepts a 45 %-accuracy completed event", () => {
    const parsed = CompletedEventSchema.safeParse(completedEventWithAcc(45));

    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.acc).toBe(45);
  });

  it("accepts 0 % accuracy — C6's nothing-answered case", () => {
    expect(
      CompletedEventSchema.safeParse(completedEventWithAcc(0)).success,
    ).toBe(true);
  });

  it.each([0, 10, 45, 49, 50, 74, 75, 100])(
    "accepts %i %% on every accuracy-bearing save-path schema",
    (acc) => {
      expect(PercentageSchema.safeParse(acc).success).toBe(true);
      expect(
        CompletedEventSchema.safeParse(completedEventWithAcc(acc)).success,
      ).toBe(true);

      const event = completedEventWithAcc(acc);
      expect(
        ResultSchema.safeParse({
          score: event.score,
          correct: event.correct,
          wrong: event.wrong,
          acc: event.acc,
          tpm: event.tpm,
          spm: event.spm,
          consistency: event.consistency,
          mode: event.mode,
          mode2: event.mode2,
          timestamp: event.timestamp,
          testDuration: event.testDuration,
          chartData: event.chartData,
          uid: event.uid,
          settings: event.settings,
          settingsId: event.settingsId,
          _id: "resultid00000000000000000000000",
          name: "regression",
        }).success,
      ).toBe(true);

      expect(
        PersonalBestSchema.safeParse({
          score: -2,
          correct: 9,
          wrong: 11,
          acc,
          tpm: 5,
          spm: -0.5,
          settings,
          settingsId: buildSettingsId(settings),
          timestamp: 1_754_000_000_000,
        }).success,
      ).toBe(true);
    },
  );

  it("still rejects accuracy outside 0…100", () => {
    expect(
      CompletedEventSchema.safeParse(completedEventWithAcc(-1)).success,
    ).toBe(false);
    expect(
      CompletedEventSchema.safeParse(completedEventWithAcc(101)).success,
    ).toBe(false);
  });

  it("C4 — the leaderboard signature is a frozen literal, not a derived default", () => {
    expect(LEADERBOARD_SETTINGS_ID).toBe("1000:100:threeByTwo:99:1:1:1");
    expect(buildSettingsId(settings)).toBe(LEADERBOARD_SETTINGS_ID);
  });
});
