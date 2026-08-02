import { describe, expect, it } from "vitest";
import {
  calculateXp,
  modeModifierOf,
} from "../../../src/api/controllers/result";
import type { MathGeneratorSettings } from "@croco-calc/schemas/math";
import type { Configuration } from "@croco-calc/schemas/configuration";

/**
 * AC-025 … AC-039 — the XP formula.
 *
 * DoD-20 names one number: **1694**. AC-027's mode-bonus table is keyed on the
 * **C2 canonical stored literals** (`"1000"`, `"100"`, `"threeByTwo"`, `"99"`),
 * not on the display labels the account page renders (`100x100`, `xxx/xx`,
 * `1/xx`). Keying it on the labels instead would make every lookup miss, pin
 * `modeModifier` at a constant `1`, and silently cut every player's XP roughly
 * in half. AC-027 names this test as the sole guard against exactly that, so it
 * asserts the intermediate values too — a test that only checks the final 1694
 * would still pass if two compensating mistakes were made.
 */

/** SB-011 defaults — the configuration AC-039's worked example runs under. */
const DEFAULT_SETTINGS: MathGeneratorSettings = {
  addition: "1000",
  multiplication: "100",
  division: "threeByTwo",
  fractionAddition: "99",
  fractionMultiplication: true,
  decimals: true,
  negatives: true,
};

/** `gainMultiplier = 1`, no daily bonus — AC-039's stated conditions. */
const XP_CONFIG: Configuration["users"]["xp"] = {
  enabled: true,
  gainMultiplier: 1,
  maxDailyBonus: 0,
  minDailyBonus: 0,
};

/**
 * AC-039: default settings, 8-minute test, 0 s idle, `correct = 200`,
 * `wrong = 10`.
 */
const AC_039_RESULT = {
  acc: 95.24,
  testDuration: 480,
  afkDuration: 0,
  settings: DEFAULT_SETTINGS,
};

describe("AC-027 modeModifierOf", () => {
  it("sums the default settings to exactly 1.95", () => {
    // 0.05 + 0.20 + 0.15 + 0.20 + 0.10 + 0.15 + 0.10 = 0.95
    expect(modeModifierOf(DEFAULT_SETTINGS)).toBeCloseTo(1.95, 10);
  });

  it("is exactly 1 when every setting is at its cheapest", () => {
    expect(
      modeModifierOf({
        addition: "off",
        multiplication: "off",
        division: "off",
        fractionAddition: "off",
        fractionMultiplication: false,
        decimals: false,
        negatives: false,
      }),
    ).toBe(1);
  });

  it("is exactly 1 for addition=100, which is worth nothing", () => {
    expect(
      modeModifierOf({
        addition: "100",
        multiplication: "off",
        division: "off",
        fractionAddition: "off",
        fractionMultiplication: false,
        decimals: false,
        negatives: false,
      }),
    ).toBe(1);
  });

  /**
   * The regression guard proper. Every one of these settings is *individually*
   * bonus-bearing, so if the table were keyed on display labels the modifier
   * would come back as a flat 1 for all of them.
   */
  it.each([
    [{ addition: "1000" } as const, 1.05],
    [{ multiplication: "12" } as const, 1.05],
    [{ multiplication: "20" } as const, 1.1],
    [{ multiplication: "100" } as const, 1.2],
    [{ division: "tables" } as const, 1.05],
    [{ division: "threeByTwo" } as const, 1.15],
    [{ fractionAddition: "12" } as const, 1.1],
    [{ fractionAddition: "99" } as const, 1.2],
    [{ fractionMultiplication: true } as const, 1.1],
    [{ decimals: true } as const, 1.15],
    [{ negatives: true } as const, 1.1],
  ])("%o alone gives %f", (deviation, expected) => {
    const settings: MathGeneratorSettings = {
      addition: "off",
      multiplication: "off",
      division: "off",
      fractionAddition: "off",
      fractionMultiplication: false,
      decimals: false,
      negatives: false,
      ...deviation,
    };
    expect(modeModifierOf(settings)).toBeCloseTo(expected, 10);
  });

  it("never returns a constant across the whole domain (AC-027 keying)", () => {
    // If the bonus tables were keyed on the display labels, every lookup would
    // miss and this list would collapse to a row of 1s.
    const modifiers = (
      [
        { addition: "1000" },
        { multiplication: "100" },
        { division: "threeByTwo" },
        { fractionAddition: "99" },
      ] as const
    ).map((d) =>
      modeModifierOf({
        addition: "off",
        multiplication: "off",
        division: "off",
        fractionAddition: "off",
        fractionMultiplication: false,
        decimals: false,
        negatives: false,
        ...d,
      }),
    );
    // 1.2 appears twice by design (multiplication "100" and fractionAddition
    // "99" are both worth +0.20), so this is a list, not a set.
    expect(modifiers).toEqual([1.05, 1.2, 1.15, 1.2]);
    expect(modifiers.every((m) => m > 1)).toBe(true);
  });
});

describe("AC-039 worked example (DoD-20)", () => {
  it("awards exactly 1694 XP", async () => {
    const result = await calculateXp(AC_039_RESULT, XP_CONFIG, null, 0);
    expect(result.xp).toBe(1694);
  });

  it("awards no daily bonus when there is no previous result", async () => {
    const result = await calculateXp(AC_039_RESULT, XP_CONFIG, null, 0);
    expect(result.dailyBonus).toBe(false);
    expect(result.breakdown?.daily).toBeUndefined();
  });

  it("reproduces every intermediate value AC-039 states", async () => {
    const { breakdown } = await calculateXp(AC_039_RESULT, XP_CONFIG, null, 0);

    // AC-026 — base = round((testDuration - afkDuration) * 2) = 960.
    expect(breakdown?.base).toBe(960);

    // AC-037 — the mode rows are base * (modeModifier - 1) = round(960 * 0.95).
    expect(breakdown?.modes).toBe(912);

    // AC-028 — acc is 95.24, not 100, so there is no perfect-accuracy bonus.
    expect(breakdown?.fullAccuracy).toBeUndefined();

    // AC-030/AC-031 — xpWithModifiers = round(960 * 1.95) = 1872, and
    // accPenalty = 1872 - 1694 = 178.
    expect(breakdown?.accPenalty).toBe(1872 - 1694);

    // AC-033 — gainMultiplier is 1, so it is not surfaced.
    expect(breakdown?.configMultiplier).toBeUndefined();

    // AC-037 — the rows sum to the awarded XP.
    const summed =
      (breakdown?.base ?? 0) +
      (breakdown?.modes ?? 0) +
      (breakdown?.fullAccuracy ?? 0) -
      (breakdown?.accPenalty ?? 0);
    expect(summed).toBe(1694);
  });

  it("still awards 1694 from the unrounded accuracy 200/210", async () => {
    // The spec quotes acc as 95.24; the client sends whatever it computed. Both
    // must land on the same integer, or the acceptance test is checking the
    // rounding of the input rather than the formula.
    const result = await calculateXp(
      { ...AC_039_RESULT, acc: (200 / 210) * 100 },
      XP_CONFIG,
      null,
      0,
    );
    expect(result.xp).toBe(1694);
  });
});

describe("XP formula edge cases", () => {
  it("returns 0 and no breakdown when XP is disabled", async () => {
    const result = await calculateXp(
      AC_039_RESULT,
      { ...XP_CONFIG, enabled: false },
      null,
      0,
    );
    expect(result).toEqual({ xp: 0 });
  });

  it("AC-029 — 0 % accuracy yields 0 XP, never negative (BL-5/AC-034)", async () => {
    const result = await calculateXp(
      { ...AC_039_RESULT, acc: 0 },
      XP_CONFIG,
      null,
      0,
    );
    expect(result.xp).toBe(0);
    expect(result.xp).toBeGreaterThanOrEqual(0);
  });

  it("AC-029 — accuracy at or below 50 % is clamped to a zero multiplier", async () => {
    for (const acc of [0, 12.5, 25, 49.9, 50]) {
      const result = await calculateXp(
        { ...AC_039_RESULT, acc },
        XP_CONFIG,
        null,
        0,
      );
      expect(result.xp, `acc=${acc}`).toBe(0);
    }
  });

  it("AC-028 — 100 % accuracy adds the +0.5 perfect bonus", async () => {
    const { xp, breakdown } = await calculateXp(
      { ...AC_039_RESULT, acc: 100 },
      XP_CONFIG,
      null,
      0,
    );
    // modifier 1.95 + 0.5 = 2.45; base 960 -> 2352; accuracyModifier = 1.
    expect(breakdown?.fullAccuracy).toBe(Math.round(960 * 0.5));
    expect(xp).toBe(2352);
  });

  it("AC-026 — idle time is subtracted from the base", async () => {
    const { breakdown } = await calculateXp(
      { ...AC_039_RESULT, afkDuration: 80 },
      XP_CONFIG,
      null,
      0,
    );
    expect(breakdown?.base).toBe((480 - 80) * 2);
  });

  it("AC-034 — an all-idle run yields 0 XP rather than a negative base", async () => {
    const { xp } = await calculateXp(
      { ...AC_039_RESULT, afkDuration: 480, acc: 100 },
      XP_CONFIG,
      null,
      0,
    );
    expect(xp).toBe(0);
  });

  it("AC-033 — gainMultiplier is applied and surfaced", async () => {
    const { xp, breakdown } = await calculateXp(
      AC_039_RESULT,
      { ...XP_CONFIG, gainMultiplier: 2 },
      null,
      0,
    );
    expect(breakdown?.configMultiplier).toBe(2);
    expect(xp).toBe(1694 * 2);
  });

  it("AC-035 — the daily bonus fires on the first result of a new UTC day", async () => {
    const yesterday = Date.now() - 48 * 60 * 60 * 1000;
    const { xp, dailyBonus, breakdown } = await calculateXp(
      AC_039_RESULT,
      { ...XP_CONFIG, maxDailyBonus: 1000, minDailyBonus: 100 },
      yesterday,
      10_000,
    );
    // proportional = round(10000 * 0.05) = 500, inside [100, 1000].
    expect(breakdown?.daily).toBe(500);
    expect(dailyBonus).toBe(true);
    expect(xp).toBe(1694 + 500);
  });

  it("AC-035 — no daily bonus for a second result on the same UTC day", async () => {
    const { xp, dailyBonus, breakdown } = await calculateXp(
      AC_039_RESULT,
      { ...XP_CONFIG, maxDailyBonus: 1000, minDailyBonus: 100 },
      Date.now(),
      10_000,
    );
    expect(breakdown?.daily).toBeUndefined();
    expect(dailyBonus).toBe(false);
    expect(xp).toBe(1694);
  });

  it("harder settings always pay at least as much as easier ones", async () => {
    const easiest = await calculateXp(
      {
        ...AC_039_RESULT,
        settings: {
          addition: "100",
          multiplication: "off",
          division: "off",
          fractionAddition: "off",
          fractionMultiplication: false,
          decimals: false,
          negatives: false,
        },
      },
      XP_CONFIG,
      null,
      0,
    );
    const hardest = await calculateXp(AC_039_RESULT, XP_CONFIG, null, 0);
    // AC-027's rationale: grinding the easiest pool is never optimal.
    expect(hardest.xp).toBeGreaterThan(easiest.xp);
  });
});
