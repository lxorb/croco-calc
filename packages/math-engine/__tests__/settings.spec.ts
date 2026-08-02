import { describe, expect, it } from "vitest";
import {
  DEFAULT_MATH_SETTINGS,
  GENERATOR_KEYS,
  KIND_ORDER,
  MATH_SETTING_VALUES,
  SETTING_KEYS,
  TIME_VALUES,
  applyCoupling,
  assertGeneratable,
  cycleSetting,
  enabledGeneratorCount,
  getEnabledKinds,
  isDefaultTaskSettings,
  isLeaderboardEligible,
  nextSettingValue,
  wouldBeAllOff,
} from "../src/settings";
import { MathGenError } from "../src/errors";
import type { MathSettings } from "../src/types";

const D = DEFAULT_MATH_SETTINGS;

function settings(overrides: Partial<MathSettings> = {}): MathSettings {
  return { ...D, ...overrides };
}

/** Every generator-control combination the bar can actually reach. */
function reachableConfigs(): MathSettings[] {
  const configs: MathSettings[] = [];
  for (const addition of MATH_SETTING_VALUES.addition) {
    for (const division of MATH_SETTING_VALUES.division) {
      for (const fractionAddition of MATH_SETTING_VALUES.fractionAddition) {
        configs.push(
          ...multiplicationVariants({ addition, division, fractionAddition }),
        );
      }
    }
  }
  return configs;
}

function multiplicationVariants(base: Partial<MathSettings>): MathSettings[] {
  const configs: MathSettings[] = [];
  for (const multiplication of MATH_SETTING_VALUES.multiplication) {
    for (const fractionMultiplication of [false, true]) {
      if (multiplication === "off" && fractionMultiplication) continue;
      const s = settings({ ...base, multiplication, fractionMultiplication });
      if (enabledGeneratorCount(s) === 0) continue;
      configs.push(s);
    }
  }
  return configs;
}

const allOffButAddition = settings({
  addition: "1000",
  multiplication: "off",
  division: "off",
  fractionAddition: "off",
  fractionMultiplication: false,
});

describe("config value domain (ME-009 as amended by C2 and C3)", () => {
  it("has exactly the eight bar keys", () => {
    expect(SETTING_KEYS).toEqual([
      "addition",
      "multiplication",
      "division",
      "fractionAddition",
      "fractionMultiplication",
      "decimals",
      "negatives",
      "time",
    ]);
  });

  it("uses the C2 canonical literals, not ME-009's superseded 'free'", () => {
    expect(MATH_SETTING_VALUES.addition).toEqual(["off", "100", "1000"]);
    expect(MATH_SETTING_VALUES.multiplication).toEqual([
      "off",
      "12",
      "20",
      "100",
    ]);
    expect(MATH_SETTING_VALUES.division).toEqual([
      "off",
      "tables",
      "threeByTwo",
    ]);
    expect(MATH_SETTING_VALUES.fractionAddition).toEqual(["off", "12", "99"]);
    expect(MATH_SETTING_VALUES.division).not.toContain("free");
  });

  it("models the three modifier controls as booleans (C3)", () => {
    expect(MATH_SETTING_VALUES.fractionMultiplication).toEqual([false, true]);
    expect(MATH_SETTING_VALUES.decimals).toEqual([false, true]);
    expect(MATH_SETTING_VALUES.negatives).toEqual([false, true]);
  });

  it("stores time in minutes (ME-013, SB-012)", () => {
    expect(TIME_VALUES).toEqual([1, 2, 4, 8]);
  });

  it("names exactly five task-producing controls (ME-014, SB-100)", () => {
    expect(GENERATOR_KEYS).toEqual([
      "addition",
      "multiplication",
      "division",
      "fractionAddition",
      "fractionMultiplication",
    ]);
  });
});

describe("defaults (ME-011)", () => {
  it("ships the specified defaults", () => {
    expect(DEFAULT_MATH_SETTINGS).toEqual({
      addition: "1000",
      multiplication: "100",
      division: "threeByTwo",
      fractionAddition: "99",
      fractionMultiplication: true,
      decimals: true,
      negatives: true,
      time: 8,
    });
  });

  it("satisfies the coupling rules without any override firing (SB-112)", () => {
    expect(applyCoupling(D, "multiplication", "100")).toEqual(D);
    expect(applyCoupling(D, "fractionMultiplication", true)).toEqual(D);
  });

  it("enables all six kinds (ME-122 — each occurs with probability 1/6)", () => {
    expect(getEnabledKinds(D)).toEqual([
      "add",
      "mul",
      "div",
      "fracAdd",
      "fracMul",
      "decimal",
    ]);
  });
});

describe("enabled kinds (ME-121, ME-123, ME-092)", () => {
  it("enumerates in the fixed canonical order", () => {
    expect(KIND_ORDER).toEqual([
      "add",
      "mul",
      "div",
      "fracAdd",
      "fracMul",
      "decimal",
    ]);
    const enabled = getEnabledKinds(
      settings({ addition: "100", division: "tables" }),
    );
    expect(enabled).toEqual(
      enabled
        .slice()
        .sort((a, b) => KIND_ORDER.indexOf(a) - KIND_ORDER.indexOf(b)),
    );
  });

  it("drops each kind when its control is off", () => {
    expect(getEnabledKinds(settings({ addition: "off" }))).not.toContain("add");
    expect(getEnabledKinds(settings({ division: "off" }))).not.toContain("div");
    expect(
      getEnabledKinds(settings({ fractionAddition: "off" })),
    ).not.toContain("fracAdd");
    expect(
      getEnabledKinds(settings({ fractionMultiplication: false })),
    ).not.toContain("fracMul");
    expect(getEnabledKinds(settings({ decimals: false }))).not.toContain(
      "decimal",
    );
  });

  it("E10 / ME-092: decimals is inert when add, mul and div are all off", () => {
    const s = settings({
      addition: "off",
      multiplication: "off",
      division: "off",
      fractionMultiplication: false,
      fractionAddition: "99",
      decimals: true,
    });
    expect(getEnabledKinds(s)).toEqual(["fracAdd"]);
  });

  it("keeps decimal enabled when only one of add/mul/div survives", () => {
    const s = settings({
      addition: "off",
      multiplication: "off",
      division: "tables",
      fractionAddition: "off",
      fractionMultiplication: false,
      decimals: true,
    });
    expect(getEnabledKinds(s)).toEqual(["div", "decimal"]);
  });
});

describe("all-off guard (ME-015, ME-016, E11)", () => {
  it("throws a typed MathGenError with zero producers, never returns empty", () => {
    const s = settings({
      addition: "off",
      multiplication: "off",
      division: "off",
      fractionAddition: "off",
      fractionMultiplication: false,
    });
    expect(getEnabledKinds(s)).toEqual([]);
    expect(() => assertGeneratable(s)).toThrow(MathGenError);
    expect(() => assertGeneratable(s)).toThrow(/at least one task type/i);
  });

  it("counts enabled generators over the five generator controls", () => {
    expect(enabledGeneratorCount(D)).toBe(5);
    expect(enabledGeneratorCount(allOffButAddition)).toBe(1);
  });
});

describe("multiplication <-> fraction multiplication coupling (ME-082 … ME-089, C21)", () => {
  it("E12 / C21: enabling fracMul while mul is off forces mul to '100', not '12'", () => {
    const s = settings({
      multiplication: "off",
      fractionMultiplication: false,
    });
    const next = applyCoupling(s, "fractionMultiplication", true);
    expect(next.fractionMultiplication).toBe(true);
    expect(next.multiplication).toBe("100");
  });

  it("E13 / ME-084: switching mul off forces fracMul off", () => {
    const s = settings({ multiplication: "100", fractionMultiplication: true });
    const next = applyCoupling(s, "multiplication", "off");
    expect(next.multiplication).toBe("off");
    expect(next.fractionMultiplication).toBe(false);
  });

  it("ME-085: cycling mul between non-off states leaves fracMul untouched", () => {
    for (const value of ["12", "20", "100"] as const) {
      const s = settings({
        multiplication: "12",
        fractionMultiplication: true,
      });
      expect(
        applyCoupling(s, "multiplication", value).fractionMultiplication,
      ).toBe(true);
      const t = settings({
        multiplication: "12",
        fractionMultiplication: false,
      });
      expect(
        applyCoupling(t, "multiplication", value).fractionMultiplication,
      ).toBe(false);
    }
  });

  it("E14 / ME-086: mul off -> '12' afterwards does not re-enable fracMul", () => {
    const start = settings({
      multiplication: "100",
      fractionMultiplication: true,
    });
    const off = applyCoupling(start, "multiplication", "off");
    expect(off.fractionMultiplication).toBe(false);
    const back = applyCoupling(off, "multiplication", "12");
    expect(back.fractionMultiplication).toBe(false);
  });

  it("ME-087: switching fracMul off does not change multiplication", () => {
    const s = settings({ multiplication: "20", fractionMultiplication: true });
    const next = applyCoupling(s, "fractionMultiplication", false);
    expect(next.multiplication).toBe("20");
  });

  it("ME-097: coupling is idempotent and never recurses", () => {
    const s = settings({
      multiplication: "off",
      fractionMultiplication: false,
    });
    const once = applyCoupling(s, "fractionMultiplication", true);
    const twice = applyCoupling(once, "fractionMultiplication", true);
    expect(twice).toEqual(once);
  });

  it("ME-088: returns one new object, i.e. one transactional update", () => {
    const s = settings({
      multiplication: "off",
      fractionMultiplication: false,
    });
    const next = applyCoupling(s, "fractionMultiplication", true);
    expect(next).not.toBe(s);
    expect(s.multiplication).toBe("off");
  });

  it("ME-098 / SB-098: decimals and negatives never couple to anything", () => {
    for (const key of ["decimals", "negatives"] as const) {
      for (const value of [true, false]) {
        const next = applyCoupling(D, key, value);
        expect({ ...next, [key]: D[key] }).toEqual(D);
      }
    }
  });

  it("covers the full SB-202 truth table (4 mul states x 2 fracMul states)", () => {
    const table: Array<
      [
        MathSettings["multiplication"],
        boolean,
        "multiplication" | "fractionMultiplication",
        string | boolean,
        MathSettings["multiplication"],
        boolean,
      ]
    > = [
      ["off", false, "fractionMultiplication", true, "100", true],
      ["off", true, "fractionMultiplication", true, "100", true],
      ["12", false, "fractionMultiplication", true, "12", true],
      ["20", true, "fractionMultiplication", false, "20", false],
      ["100", true, "multiplication", "off", "off", false],
      ["100", false, "multiplication", "off", "off", false],
      ["12", true, "multiplication", "100", "100", true],
      ["20", false, "multiplication", "12", "12", false],
    ];
    for (const [mul, frac, key, value, expMul, expFrac] of table) {
      const s = settings({ multiplication: mul, fractionMultiplication: frac });
      const next = applyCoupling(
        s,
        key,
        value as MathSettings["multiplication"] & boolean,
      );
      expect([next.multiplication, next.fractionMultiplication]).toEqual([
        expMul,
        expFrac,
      ]);
    }
  });
});

describe("post-cascade all-off guard (ME-089, C36 / SB-215)", () => {
  it("E15: mul cannot be switched off when fracMul is the only other producer", () => {
    const s = settings({
      addition: "off",
      division: "off",
      fractionAddition: "off",
      multiplication: "100",
      fractionMultiplication: true,
    });
    expect(wouldBeAllOff(s, "multiplication", "off")).toBe(true);
    // ...but fraction multiplication itself can still be switched off.
    expect(wouldBeAllOff(s, "fractionMultiplication", false)).toBe(false);
  });

  it("blocks the off state of the single remaining producer", () => {
    expect(wouldBeAllOff(allOffButAddition, "addition", "off")).toBe(true);
    expect(wouldBeAllOff(allOffButAddition, "addition", "100")).toBe(false);
  });

  it("allows switching a producer off while two others remain", () => {
    const s = settings({
      addition: "1000",
      division: "tables",
      multiplication: "off",
      fractionAddition: "off",
      fractionMultiplication: false,
    });
    expect(wouldBeAllOff(s, "addition", "off")).toBe(false);
    expect(wouldBeAllOff(s, "division", "off")).toBe(false);
  });

  it("never blocks decimals, negatives or time (SB-106)", () => {
    expect(wouldBeAllOff(allOffButAddition, "decimals", false)).toBe(false);
    expect(wouldBeAllOff(allOffButAddition, "negatives", false)).toBe(false);
    expect(wouldBeAllOff(allOffButAddition, "time", 1)).toBe(false);
  });
});

describe("cycling (ME-010, ME-015, SB-102)", () => {
  it("cycles forward and wraps", () => {
    expect(nextSettingValue(D, "time")).toBe(1);
    expect(nextSettingValue(settings({ time: 1 }), "time")).toBe(2);
    expect(nextSettingValue(settings({ time: 2 }), "time")).toBe(4);
    expect(nextSettingValue(settings({ time: 4 }), "time")).toBe(8);
  });

  it("cycles the arithmetic controls in schema order (SB-011)", () => {
    const s = settings({ addition: "off" });
    expect(nextSettingValue(s, "addition")).toBe("100");
    expect(nextSettingValue(settings({ addition: "100" }), "addition")).toBe(
      "1000",
    );
  });

  it("toggles booleans", () => {
    expect(nextSettingValue(settings({ negatives: false }), "negatives")).toBe(
      true,
    );
    expect(nextSettingValue(settings({ negatives: true }), "negatives")).toBe(
      false,
    );
  });

  it("ME-015: skips 'off' for the last enabled producer", () => {
    // with only addition enabled, "1000" -> "100" (never "off")
    expect(nextSettingValue(allOffButAddition, "addition")).toBe("100");
    const at100 = { ...allOffButAddition, addition: "100" as const };
    expect(nextSettingValue(at100, "addition")).toBe("1000");
  });

  it("SB-102/C36: cycling mul skips 'off' when fracMul is the only other producer", () => {
    const s = settings({
      addition: "off",
      division: "off",
      fractionAddition: "off",
      multiplication: "100",
      fractionMultiplication: true,
    });
    // "100" -> "off" is blocked -> wraps past it to "12"
    expect(nextSettingValue(s, "multiplication")).toBe("12");
    // fraction multiplication itself can still be turned off
    expect(nextSettingValue(s, "fractionMultiplication")).toBe(false);
  });

  it("cycleSetting applies the coupling cascade in the same transaction", () => {
    const s = settings({
      multiplication: "off",
      fractionMultiplication: false,
    });
    const next = cycleSetting(s, "fractionMultiplication");
    expect(next.fractionMultiplication).toBe(true);
    expect(next.multiplication).toBe("100");
  });

  it("cycling never reaches the all-off state from any reachable config", () => {
    const configs = reachableConfigs();
    expect(configs.length).toBeGreaterThan(50);
    for (const s of configs) {
      for (const key of GENERATOR_KEYS) {
        const next = cycleSetting(s, key);
        expect(enabledGeneratorCount(next)).toBeGreaterThan(0);
        expect(() => assertGeneratable(next)).not.toThrow();
      }
    }
  });
});

describe("leaderboard eligibility (ME-017, ME-018)", () => {
  it("ME-017: time is excluded from the default-settings check", () => {
    expect(isDefaultTaskSettings(D)).toBe(true);
    for (const time of TIME_VALUES) {
      expect(isDefaultTaskSettings(settings({ time }))).toBe(true);
    }
  });

  it("ME-017: any non-default task control breaks it", () => {
    expect(isDefaultTaskSettings(settings({ addition: "100" }))).toBe(false);
    expect(isDefaultTaskSettings(settings({ multiplication: "20" }))).toBe(
      false,
    );
    expect(isDefaultTaskSettings(settings({ division: "tables" }))).toBe(false);
    expect(isDefaultTaskSettings(settings({ fractionAddition: "12" }))).toBe(
      false,
    );
    expect(
      isDefaultTaskSettings(settings({ fractionMultiplication: false })),
    ).toBe(false);
    expect(isDefaultTaskSettings(settings({ decimals: false }))).toBe(false);
    expect(isDefaultTaskSettings(settings({ negatives: false }))).toBe(false);
  });

  it("ME-018: eligible only at time 4 or 8", () => {
    expect(isLeaderboardEligible(settings({ time: 8 }))).toBe(true);
    expect(isLeaderboardEligible(settings({ time: 4 }))).toBe(true);
    expect(isLeaderboardEligible(settings({ time: 2 }))).toBe(false);
    expect(isLeaderboardEligible(settings({ time: 1 }))).toBe(false);
    expect(isLeaderboardEligible(settings({ time: 8, negatives: false }))).toBe(
      false,
    );
  });
});
