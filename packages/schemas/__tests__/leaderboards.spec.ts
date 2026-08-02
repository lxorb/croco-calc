import { describe, it, expect } from "vitest";
import {
  isValidLeaderboard,
  LeaderboardTypeSchema,
  VALID_LEADERBOARD_MATRIX,
} from "@croco-calc/schemas/leaderboards";

describe("VALID_LEADERBOARD_MATRIX (AC-114)", () => {
  it("is exactly the AC-114 literal", () => {
    expect(VALID_LEADERBOARD_MATRIX).toEqual({
      allTime: { time: ["4", "8"] },
      weekly: {},
      daily: { time: ["4", "8"] },
    });
  });

  it("covers every leaderboard type", () => {
    expect(Object.keys(VALID_LEADERBOARD_MATRIX).sort()).toEqual(
      [...LeaderboardTypeSchema.options].sort(),
    );
  });

  it("has `time` as its only axis — AC-113 leaves no third level", () => {
    for (const modes of Object.values(VALID_LEADERBOARD_MATRIX)) {
      expect(Object.keys(modes)).toEqual(
        Object.keys(modes).filter((mode) => mode === "time"),
      );
      for (const mode2s of Object.values(modes)) {
        expect(mode2s.every((mode2) => typeof mode2 === "string")).toBe(true);
      }
    }
  });

  it.each(["4", "8"])("accepts time %s on allTime and daily", (mode2) => {
    expect(isValidLeaderboard("allTime", "time", mode2)).toBe(true);
    expect(isValidLeaderboard("daily", "time", mode2)).toBe(true);
  });

  it.each(["1", "2", "15", "60"])("rejects time %s (AC-112)", (mode2) => {
    expect(isValidLeaderboard("allTime", "time", mode2)).toBe(false);
    expect(isValidLeaderboard("daily", "time", mode2)).toBe(false);
  });

  it("gives weekly xp no time axis at all (AC-112)", () => {
    expect(VALID_LEADERBOARD_MATRIX.weekly).toEqual({});
    expect(isValidLeaderboard("weekly", "time", "8")).toBe(false);
  });

  it("rejects an unknown mode", () => {
    expect(isValidLeaderboard("allTime", "xyz", "8")).toBe(false);
  });
});
