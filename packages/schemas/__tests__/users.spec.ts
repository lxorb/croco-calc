import { describe, it, expect } from "vitest";
import {
  BooleanFilterSchema,
  ResultFiltersSchema,
  SolveStatsSchema,
  UserProfileSchema,
} from "@croco-calc/schemas/users";

/**
 * AC-078's fourth column — the **stored** values. AC-081 as amended by master C2
 * requires these, and not AC-078's third ("labels shown") column, to be the keys
 * of `ResultFiltersSchema`.
 */
const AC078_STORED_VALUES = {
  pb: ["true", "false"],
  time: ["1", "2", "4", "8"],
  addition: ["off", "100", "1000"],
  multiplication: ["off", "12", "20", "100"],
  division: ["off", "tables", "threeByTwo"],
  fractionAddition: ["off", "12", "99"],
  fractionMultiplication: ["true", "false"],
  decimals: ["true", "false"],
  negatives: ["true", "false"],
} as const;

function allOn(values: readonly string[]): Record<string, boolean> {
  return Object.fromEntries(values.map((value) => [value, true]));
}

function validFilters(): unknown {
  return {
    _id: "abcdef0123456789abcdef01",
    name: "all",
    ...Object.fromEntries(
      Object.entries(AC078_STORED_VALUES).map(([group, values]) => [
        group,
        allOn(values),
      ]),
    ),
    date: {
      last_day: false,
      last_week: false,
      last_month: false,
      last_3months: false,
      all: true,
    },
  };
}

describe("ResultFiltersSchema", () => {
  it("has exactly the AC-078 groups plus date (AC-079)", () => {
    expect(Object.keys(ResultFiltersSchema.shape).sort()).toEqual(
      ["_id", "name", "date", ...Object.keys(AC078_STORED_VALUES)].sort(),
    );
  });

  it("accepts the AC-078 stored literals as keys", () => {
    const parsed = ResultFiltersSchema.safeParse(validFilters());
    expect(parsed.success).toBe(true);
  });

  describe.each(["pb", "fractionMultiplication", "decimals", "negatives"])(
    "%s is keyed on the C2 stored literals, not the display labels (AC-081)",
    (group) => {
      it('uses "true"/"false"', () => {
        const filters = validFilters() as Record<string, unknown>;
        expect(Object.keys(filters[group] as object).sort()).toEqual([
          "false",
          "true",
        ]);
        expect(ResultFiltersSchema.safeParse(filters).success).toBe(true);
      });

      it.each([
        ["on", "off"],
        ["yes", "no"],
      ])("rejects the %s/%s labels", (a, b) => {
        const filters = validFilters() as Record<string, unknown>;
        filters[group] = { [a]: true, [b]: false };
        expect(ResultFiltersSchema.safeParse(filters).success).toBe(false);
      });
    },
  );

  it("lets a consumer index a boolean group with String(storedValue)", () => {
    const filters = ResultFiltersSchema.parse(validFilters());
    const storedDecimals = false;
    // this is the expression AC-081 exists to make work
    expect(filters.decimals[String(storedDecimals) as "false"]).toBe(true);
  });

  it("rejects unknown keys in a boolean group", () => {
    expect(
      BooleanFilterSchema.safeParse({ true: true, false: true, on: true })
        .success,
    ).toBe(false);
  });
});

describe("SolveStatsSchema (AC-013 / AC-014)", () => {
  it("carries startedTests, completedTests and timeSpent", () => {
    expect(Object.keys(SolveStatsSchema.shape).sort()).toEqual([
      "completedTests",
      "startedTests",
      "timeSpent",
    ]);
  });

  it("has no timeTyping field", () => {
    expect(Object.keys(SolveStatsSchema.shape)).not.toContain("timeTyping");
    expect(Object.keys(UserProfileSchema.shape)).not.toContain("typingStats");
  });
});
