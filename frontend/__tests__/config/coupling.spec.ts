import { Config } from "@croco-calc/schemas/configs";
import { describe, expect, it } from "vitest";

import {
  applyCoupling,
  enabledGeneratorCount,
  GENERATOR_KEYS,
  getCycleValues,
  isDecimalsDisabled,
  nextCycleValue,
  repairAllOff,
  wouldBeAllOff,
} from "../../src/ts/config/coupling";
import { getDefaultConfig } from "../../src/ts/constants/default-config";

/** A full config with the eight bar keys overridden. */
function cfg(overrides: Partial<Config>): Config {
  return { ...getDefaultConfig(), ...overrides };
}

/** Every generator off except the ones named. */
const ALL_GENERATORS_OFF = {
  addition: "off",
  multiplication: "off",
  division: "off",
  fractionAddition: "off",
  fractionMultiplication: false,
} as const satisfies Partial<Config>;

/** Walk a control forward `steps` times, committing each result. */
function walk(
  key: "addition" | "multiplication" | "division" | "fractionAddition",
  direction: 1 | -1,
  start: Config,
  steps: number,
): (string | number | boolean | undefined)[] {
  const seen: (string | number | boolean | undefined)[] = [];
  let current = start;
  for (let i = 0; i < steps; i++) {
    const next = nextCycleValue(key, direction, current);
    seen.push(next);
    if (next === undefined) break;
    current = { ...current, [key]: next };
  }
  return seen;
}

describe("settings bar cycle order (SB-011)", () => {
  it("reads the cycle order off the zod schema, in SB-010 order", () => {
    expect(getCycleValues("addition")).toEqual(["off", "100", "1000"]);
    expect(getCycleValues("multiplication")).toEqual([
      "off",
      "12",
      "20",
      "100",
    ]);
    expect(getCycleValues("division")).toEqual(["off", "tables", "threeByTwo"]);
    expect(getCycleValues("fractionAddition")).toEqual(["off", "12", "99"]);
    expect(getCycleValues("fractionMultiplication")).toEqual([false, true]);
    expect(getCycleValues("decimals")).toEqual([false, true]);
    expect(getCycleValues("negatives")).toEqual([false, true]);
    expect(getCycleValues("time")).toEqual([1, 2, 4, 8]);
  });
});

describe("SB-200 - cycleSetting produces the exact ordered sequences of section 3", () => {
  // Every other generator is on, so nothing is ever blocked by SB-215 and the
  // raw cycle order is observable.
  const unblocked = cfg({
    addition: "1000",
    multiplication: "100",
    division: "threeByTwo",
    fractionAddition: "99",
    fractionMultiplication: true,
  });

  it.each([
    ["addition", ["off", "100", "1000"]],
    ["multiplication", ["off", "12", "20", "100"]],
    ["division", ["off", "tables", "threeByTwo"]],
    ["fractionAddition", ["off", "12", "99"]],
    ["fractionMultiplication", [false, true]],
    ["decimals", [false, true]],
    ["negatives", [false, true]],
    ["time", [1, 2, 4, 8]],
  ] as const)(
    "cycles %s forward through its whole domain and wraps",
    (key, order) => {
      let current: Config = { ...unblocked, [key]: order[0] };
      const seen: unknown[] = [order[0]];

      for (const _ of order) {
        const next = nextCycleValue(key, 1, current);
        expect(next).toBeDefined();
        current = { ...current, [key]: next };
        seen.push(next);
      }

      // length + 1 entries: the whole domain in order, then back to the start.
      expect(seen).toEqual([...order, order[0]]);
    },
  );

  it.each([
    ["addition", ["off", "100", "1000"]],
    ["multiplication", ["off", "12", "20", "100"]],
    ["division", ["off", "tables", "threeByTwo"]],
    ["fractionAddition", ["off", "12", "99"]],
    ["fractionMultiplication", [false, true]],
    ["time", [1, 2, 4, 8]],
  ] as const)(
    "cycles %s backward through its whole domain and wraps",
    (key, order) => {
      const reversed = [...order].reverse();
      let current: Config = { ...unblocked, [key]: reversed[0] };
      const seen: unknown[] = [reversed[0]];

      for (const _ of reversed) {
        const next = nextCycleValue(key, -1, current);
        expect(next).toBeDefined();
        current = { ...current, [key]: next };
        seen.push(next);
      }

      expect(seen).toEqual([...reversed, reversed[0]]);
    },
  );

  it("SB-048 - the time control has no off state in either direction", () => {
    const values = getCycleValues("time");
    expect(values).not.toContain("off");
    expect(values).not.toContain(false);
  });

  it("SB-106 - time is never blocked, whatever the generators are doing", () => {
    const onlyAddition = cfg({ ...ALL_GENERATORS_OFF, addition: "1000" });
    for (const value of getCycleValues("time")) {
      expect(wouldBeAllOff("time", value, onlyAddition)).toBe(false);
    }
    expect(nextCycleValue("time", 1, onlyAddition)).toBeDefined();
  });
});

describe("SB-090..SB-098, SB-202 - the multiplication / fraction-multiplication coupling truth table", () => {
  const multiplicationValues = ["off", "12", "20", "100"] as const;

  it("SB-090 - turning fraction multiplication on while multiplication is off forces 100 (master C21)", () => {
    const next = applyCoupling(
      cfg({ multiplication: "off", fractionMultiplication: true }),
      "fractionMultiplication",
    );
    expect(next.multiplication).toBe("100");
    expect(next.fractionMultiplication).toBe(true);
  });

  it("SB-091 - turning multiplication off also clears fraction multiplication", () => {
    const next = applyCoupling(
      cfg({ multiplication: "off", fractionMultiplication: true }),
      "multiplication",
    );
    expect(next.fractionMultiplication).toBe(false);
    expect(next.multiplication).toBe("off");
  });

  it("SB-092 - setting multiplication to any non-off value never touches fraction multiplication", () => {
    for (const value of multiplicationValues.filter((v) => v !== "off")) {
      for (const fraction of [false, true]) {
        const next = applyCoupling(
          cfg({ multiplication: value, fractionMultiplication: fraction }),
          "multiplication",
        );
        expect(next.fractionMultiplication).toBe(fraction);
        expect(next.multiplication).toBe(value);
      }
    }
  });

  it("SB-093 - setting fraction multiplication to false never touches multiplication", () => {
    for (const value of multiplicationValues) {
      const next = applyCoupling(
        cfg({ multiplication: value, fractionMultiplication: false }),
        "fractionMultiplication",
      );
      expect(next.multiplication).toBe(value);
      expect(next.fractionMultiplication).toBe(false);
    }
  });

  it("the full 4 x 2 truth table has exactly one illegal combination", () => {
    const illegal: string[] = [];
    for (const value of multiplicationValues) {
      for (const fraction of [false, true]) {
        const state = cfg({
          multiplication: value,
          fractionMultiplication: fraction,
        });
        // A whole-config apply (no changedKey) repairs towards SB-090.
        const repaired = applyCoupling(state);
        if (
          repaired.multiplication !== value ||
          repaired.fractionMultiplication !== fraction
        ) {
          illegal.push(`${value}/${String(fraction)}`);
        }
      }
    }
    expect(illegal).toEqual(["off/true"]);
  });

  it("SB-097 - coupling is idempotent and never recurses more than one level", () => {
    for (const value of multiplicationValues) {
      for (const fraction of [false, true]) {
        const once = applyCoupling(
          cfg({ multiplication: value, fractionMultiplication: fraction }),
        );
        const twice = applyCoupling(once);
        expect(twice).toEqual(once);
      }
    }
  });

  it("SB-098 - decimals and negatives are coupled to nothing", () => {
    for (const decimals of [false, true]) {
      for (const negatives of [false, true]) {
        const before = cfg({ decimals, negatives });
        const after = applyCoupling(before);
        expect(after).toEqual(before);
      }
    }
  });
});

describe("SB-101, SB-102, SB-215 (master C36) - the post-cascade all-off guard", () => {
  it("SB-203(a) - with only addition on, cycling addition never yields off", () => {
    const only = cfg({ ...ALL_GENERATORS_OFF, addition: "1000" });

    expect(wouldBeAllOff("addition", "off", only)).toBe(true);
    // Forward from "1000" wraps straight back to "100", skipping "off".
    expect(nextCycleValue("addition", 1, only)).toBe("100");
    // Backward from "1000" is "100" too; from "100" it wraps to "1000".
    expect(
      nextCycleValue(
        "addition",
        -1,
        cfg({ ...ALL_GENERATORS_OFF, addition: "100" }),
      ),
    ).toBe("1000");

    // A full loop in either direction never produces "off".
    expect(walk("addition", 1, only, 6)).not.toContain("off");
    expect(walk("addition", -1, only, 6)).not.toContain("off");
  });

  it("SB-203(b) - with two independent generators on, either can be switched off", () => {
    const two = cfg({
      ...ALL_GENERATORS_OFF,
      addition: "1000",
      division: "tables",
    });

    expect(wouldBeAllOff("addition", "off", two)).toBe(false);
    expect(wouldBeAllOff("division", "off", two)).toBe(false);
    // Forward from the last value of each domain reaches "off" by wrapping.
    expect(nextCycleValue("addition", 1, two)).toBe("off");
    expect(nextCycleValue("division", 1, two)).toBe("threeByTwo");
    expect(nextCycleValue("division", -1, two)).toBe("off");
  });

  it("SB-203(c) - multiplication cannot be switched off when the cascade would take fraction multiplication with it", () => {
    const coupledPair = cfg({
      ...ALL_GENERATORS_OFF,
      multiplication: "100",
      fractionMultiplication: true,
    });

    // The whole point of master C36: pre-cascade the count is 2, post-cascade
    // it is 0, so this MUST be blocked.
    expect(enabledGeneratorCount(coupledPair)).toBe(2);
    expect(wouldBeAllOff("multiplication", "off", coupledPair)).toBe(true);
    // ...and fraction multiplication can still be switched off, because
    // SB-093 leaves multiplication alone.
    expect(wouldBeAllOff("fractionMultiplication", false, coupledPair)).toBe(
      false,
    );

    // Cycling multiplication forward from "100" therefore skips "off" and
    // lands on "12".
    expect(nextCycleValue("multiplication", 1, coupledPair)).toBe("12");
    expect(nextCycleValue("fractionMultiplication", 1, coupledPair)).toBe(
      false,
    );
  });

  it("SB-052 - a control with no legal alternative state is a no-op", () => {
    // fractionMultiplication is the only generator on, so it cannot be turned
    // off and it has no other on-state to move to.
    const only = cfg({
      ...ALL_GENERATORS_OFF,
      multiplication: "off",
      fractionMultiplication: true,
    });
    expect(nextCycleValue("fractionMultiplication", 1, only)).toBeUndefined();
    expect(nextCycleValue("fractionMultiplication", -1, only)).toBeUndefined();
  });

  it("the guard never fires for the three non-generator controls", () => {
    const only = cfg({ ...ALL_GENERATORS_OFF, addition: "1000" });
    expect(wouldBeAllOff("decimals", false, only)).toBe(false);
    expect(wouldBeAllOff("negatives", false, only)).toBe(false);
    expect(wouldBeAllOff("time", 1, only)).toBe(false);
  });

  it("SB-100 - the generator set is exactly the five controls named", () => {
    expect([...GENERATOR_KEYS]).toEqual([
      "addition",
      "multiplication",
      "division",
      "fractionAddition",
      "fractionMultiplication",
    ]);
  });
});

describe("SB-104 - a stored config with every generator off is repaired, not rejected", () => {
  it("restores the default addition value", () => {
    const broken = cfg(ALL_GENERATORS_OFF);
    const repaired = repairAllOff(broken);
    expect(repaired.addition).toBe("1000");
    expect(enabledGeneratorCount(repaired)).toBe(1);
  });

  it("repairs the illegal coupled pair without touching anything else", () => {
    const broken = cfg({
      ...ALL_GENERATORS_OFF,
      multiplication: "off",
      fractionMultiplication: true,
    });
    const repaired = repairAllOff(broken);
    expect(repaired.multiplication).toBe("100");
    expect(repaired.fractionMultiplication).toBe(true);
    expect(repaired.addition).toBe("off");
  });

  it("leaves a healthy config byte-identical", () => {
    const healthy = getDefaultConfig();
    expect(repairAllOff(healthy)).toEqual(healthy);
  });
});

describe("SB-105 - decimals is disabled only while addition, multiplication and division are all off", () => {
  it("is disabled when all three are off", () => {
    expect(
      isDecimalsDisabled(
        cfg({ ...ALL_GENERATORS_OFF, fractionAddition: "99" }),
      ),
    ).toBe(true);
  });

  it.each(["addition", "multiplication", "division"] as const)(
    "becomes interactive again as soon as %s is on",
    (key) => {
      const values = {
        addition: "100",
        multiplication: "12",
        division: "tables",
      } as const;
      expect(
        isDecimalsDisabled(cfg({ ...ALL_GENERATORS_OFF, [key]: values[key] })),
      ).toBe(false);
    },
  );

  it("is not disabled by the defaults", () => {
    expect(isDecimalsDisabled(getDefaultConfig())).toBe(false);
  });
});
