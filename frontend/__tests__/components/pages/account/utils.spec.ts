import { describe, it, expect } from "vitest";
import defaultResultFilters from "../../../../src/ts/constants/default-result-filters";
import {
  enabledSettings,
  mergeWithDefaultFilters,
  SETTING_KEYS,
  settingBalloon,
  settingLabel,
} from "../../../../src/ts/components/pages/account/utils";
import { MathGeneratorSettings } from "@croco-calc/schemas/math";

/** The C2 canonical stored default settings (AC-011 / SB-173). */
const defaultSettings: MathGeneratorSettings = {
  addition: "1000",
  multiplication: "100",
  division: "threeByTwo",
  fractionAddition: "99",
  fractionMultiplication: true,
  decimals: true,
  negatives: true,
};

describe("utils.ts", () => {
  describe("mergeWithDefaultFilters", () => {
    it("should merge with default filters correctly", () => {
      const tests = [
        {
          input: {
            pb: {
              false: false,
              true: false,
            },
          },
          expected: () => {
            const expected = structuredClone(defaultResultFilters);
            expected.pb.false = false;
            expected.pb.true = false;
            return expected;
          },
        },
        {
          // AC-078: the stored literals are the filter keys, never the labels.
          input: {
            multiplication: {
              "100": false,
            },
          },
          expected: () => {
            const expected = structuredClone(defaultResultFilters);
            expected.multiplication["100"] = false;
            return expected;
          },
        },
        {
          input: {
            time: {
              "8": false,
            },
          },
          expected: () => {
            const expected = structuredClone(defaultResultFilters);
            expected.time["8"] = false;
            return expected;
          },
        },
        {
          // AC-079: the deleted typing-era groups are dropped, not merged in.
          input: {
            words: { "10": false },
            language: { english: false },
            tags: { none: false },
          },
          expected: () => structuredClone(defaultResultFilters),
        },
        {
          input: {
            blah: true,
          },
          expected: () => structuredClone(defaultResultFilters),
        },
        {
          input: 1,
          expected: () => structuredClone(defaultResultFilters),
        },
        {
          input: null,
          expected: () => structuredClone(defaultResultFilters),
        },
        {
          input: undefined,
          expected: () => structuredClone(defaultResultFilters),
        },
        {
          input: {},
          expected: () => structuredClone(defaultResultFilters),
        },
      ];
      tests.forEach((test) => {
        const merged = mergeWithDefaultFilters(test.input as never);
        expect(merged).toEqual(test.expected());
      });
    });

    it("carries exactly the AC-078 groups and no typing-era ones", () => {
      const merged = mergeWithDefaultFilters({});

      expect(Object.keys(merged).sort()).toEqual(
        ["_id", "name", "pb", "time", "date", ...SETTING_KEYS].sort(),
      );
    });
  });

  describe("settingLabel", () => {
    it("maps the stored literal through the shared label table (AC-102)", () => {
      expect(settingLabel("multiplication", "100")).toBe("100x100");
      expect(settingLabel("multiplication", "12")).toBe("12x12");
      expect(settingLabel("division", "threeByTwo")).toBe("xxx/xx");
      expect(settingLabel("division", "tables")).toBe("144/12");
      expect(settingLabel("addition", "1000")).toBe("+1000");
      expect(settingLabel("fractionAddition", "99")).toBe("+1/xx");
    });

    it("renders off/on for the boolean and off states", () => {
      expect(settingLabel("multiplication", "off")).toBe("off");
      expect(settingLabel("decimals", false)).toBe("off");
      expect(settingLabel("decimals", true)).toBe("on");
    });
  });

  describe("settingBalloon", () => {
    it("names the group and the level (AC-102)", () => {
      expect(settingBalloon("multiplication", "100")).toBe(
        "multiplication 100x100",
      );
      expect(settingBalloon("fractionMultiplication", true)).toBe(
        "fraction multiplication on",
      );
    });
  });

  describe("enabledSettings", () => {
    it("returns every setting that was generating tasks", () => {
      expect(enabledSettings(defaultSettings).map((it) => it.key)).toEqual([
        ...SETTING_KEYS,
      ]);
    });

    it("drops the off and false ones", () => {
      expect(
        enabledSettings({
          ...defaultSettings,
          multiplication: "off",
          division: "off",
          decimals: false,
        }).map((it) => it.key),
      ).toEqual([
        "addition",
        "fractionAddition",
        "fractionMultiplication",
        "negatives",
      ]);
    });
  });
});
