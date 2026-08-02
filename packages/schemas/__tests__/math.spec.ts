import { describe, it, expect } from "vitest";
import {
  AdditionSchema,
  buildSettingsId,
  DivisionSchema,
  FractionAdditionSchema,
  isDefaultSettingsId,
  isLeaderboardEligible,
  LEADERBOARD_SETTINGS_ID,
  MathGeneratorSettings,
  MathGeneratorSettingsSchema,
  MathSettingsSchema,
  MultiplicationSchema,
  SettingsIdSchema,
  TestTimeSchema,
} from "@croco-calc/schemas/math";

/** SB-110 defaults, spelled out rather than imported so this test cannot drift silently. */
const DEFAULT_SETTINGS: MathGeneratorSettings = {
  addition: "1000",
  multiplication: "100",
  division: "threeByTwo",
  fractionAddition: "99",
  fractionMultiplication: true,
  decimals: true,
  negatives: true,
};

describe("math settings", () => {
  describe("value domains (master C2/C3)", () => {
    it("uses the canonical stored literals in cycle order (SB-010, SB-011)", () => {
      expect(AdditionSchema.options).toEqual(["off", "100", "1000"]);
      expect(MultiplicationSchema.options).toEqual(["off", "12", "20", "100"]);
      expect(DivisionSchema.options).toEqual(["off", "tables", "threeByTwo"]);
      expect(FractionAdditionSchema.options).toEqual(["off", "12", "99"]);
    });

    it("models the three modifier controls as booleans (master C3)", () => {
      const shape = MathGeneratorSettingsSchema.shape;
      for (const key of [
        "fractionMultiplication",
        "decimals",
        "negatives",
      ] as const) {
        expect(shape[key].safeParse(true).success).toBe(true);
        expect(shape[key].safeParse("on").success).toBe(false);
      }
    });

    it("rejects the superseded division literal", () => {
      expect(DivisionSchema.safeParse("free").success).toBe(false);
    });

    it("stores time in minutes, 1/2/4/8 only (SB-012, ME-013)", () => {
      expect(TestTimeSchema.options.map((option) => option.value)).toEqual([
        1, 2, 4, 8,
      ]);
      expect(TestTimeSchema.safeParse(30).success).toBe(false);
      expect(TestTimeSchema.safeParse(480).success).toBe(false);
    });

    it("keeps time out of the generator settings (SB-172)", () => {
      expect(Object.keys(MathGeneratorSettingsSchema.shape)).toEqual([
        "addition",
        "multiplication",
        "division",
        "fractionAddition",
        "fractionMultiplication",
        "decimals",
        "negatives",
      ]);
      expect(Object.keys(MathSettingsSchema.shape)).toContain("time");
    });
  });

  describe("settingsId (SB-170 … SB-174, master C4)", () => {
    it("joins the seven settings with ':' in the fixed order", () => {
      expect(buildSettingsId(DEFAULT_SETTINGS)).toBe(
        "1000:100:threeByTwo:99:1:1:1",
      );
    });

    it("equals the frozen leaderboard constant for the defaults (SB-171, SB-204)", () => {
      expect(buildSettingsId(DEFAULT_SETTINGS)).toBe(LEADERBOARD_SETTINGS_ID);
      expect(isDefaultSettingsId(buildSettingsId(DEFAULT_SETTINGS))).toBe(true);
    });

    it("encodes the booleans as 1/0", () => {
      expect(buildSettingsId({ ...DEFAULT_SETTINGS, decimals: false })).toBe(
        "1000:100:threeByTwo:99:1:0:1",
      );
      expect(
        buildSettingsId({
          ...DEFAULT_SETTINGS,
          fractionMultiplication: false,
          negatives: false,
        }),
      ).toBe("1000:100:threeByTwo:99:0:1:0");
    });

    it("produces a value the schema accepts, for every reachable combination", () => {
      for (const addition of AdditionSchema.options) {
        for (const multiplication of MultiplicationSchema.options) {
          for (const division of DivisionSchema.options) {
            for (const fractionAddition of FractionAdditionSchema.options) {
              for (const flags of [0, 1, 2, 3, 4, 5, 6, 7]) {
                const id = buildSettingsId({
                  addition,
                  multiplication,
                  division,
                  fractionAddition,
                  fractionMultiplication: (flags & 1) !== 0,
                  decimals: (flags & 2) !== 0,
                  negatives: (flags & 4) !== 0,
                });
                expect(SettingsIdSchema.safeParse(id).success).toBe(true);
              }
            }
          }
        }
      }
    });

    it("rejects the struck '|'-joined signature (master C4)", () => {
      expect(
        SettingsIdSchema.safeParse("1000|100x100|xxx/xx|1/xx|on|on|on").success,
      ).toBe(false);
    });
  });

  describe("leaderboard eligibility (SB-175 as restated by master C31)", () => {
    const defaultId = LEADERBOARD_SETTINGS_ID;

    it("is true for default settings at time 4 and 8", () => {
      expect(isLeaderboardEligible(defaultId, "4")).toBe(true);
      expect(isLeaderboardEligible(defaultId, "8")).toBe(true);
    });

    it("is false for default settings at time 1 and 2 (SB-176)", () => {
      expect(isLeaderboardEligible(defaultId, "1")).toBe(false);
      expect(isLeaderboardEligible(defaultId, "2")).toBe(false);
    });

    it("is false for any single-setting deviation (SB-205, AC-121)", () => {
      const deviations: Partial<MathGeneratorSettings>[] = [
        { addition: "100" },
        { addition: "off" },
        { multiplication: "20" },
        { division: "tables" },
        { fractionAddition: "12" },
        { fractionMultiplication: false },
        { decimals: false },
        { negatives: false },
      ];
      for (const deviation of deviations) {
        const id = buildSettingsId({ ...DEFAULT_SETTINGS, ...deviation });
        expect(isLeaderboardEligible(id, "4")).toBe(false);
        expect(isLeaderboardEligible(id, "8")).toBe(false);
      }
    });
  });
});
