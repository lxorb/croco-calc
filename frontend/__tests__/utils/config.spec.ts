import { describe, it, expect } from "vitest";
import { getDefaultConfig } from "../../src/ts/constants/default-config";
import { migrateConfig } from "../../src/ts/config/utils";
import { PartialConfig } from "@croco-calc/schemas/configs";

const defaultConfig = getDefaultConfig();

/**
 * SB-122 — a stored config that fails schema validation MUST be *repaired* by
 * `migrateConfig`, never discarded.
 *
 * Rewritten for croco calc: monkeytype's suite exercised migrations for keys
 * §6.1 struck (`minWpm`, `alwaysShowCPM`, `soundVolume`, `playSoundOnError`,
 * `funbox`, `customLayoutfluid`, `indicateTypos`, `tapeMargin`, the
 * `showLiveWpm`/`showLiveAcc`/`showLiveBurst` family, …). Those keys no longer
 * exist in `ConfigSchema`, so `sanitizeConfig` strips them before
 * `replaceLegacyValues` ever sees them and there is nothing left to assert.
 * What remains below is exactly the repair surface `config/utils.ts` actually
 * implements, plus the two croco-calc-specific migrations (AC-085, SB-012).
 */
describe("config/utils.ts", () => {
  describe("migrateConfig", () => {
    it("should carry over properties from the default config", () => {
      const partialConfig = {} as PartialConfig;

      const result = migrateConfig(partialConfig);
      expect(result).toEqual(expect.objectContaining(getDefaultConfig()));
      for (const [key, value] of Object.entries(getDefaultConfig())) {
        expect(result).toHaveProperty(key, value);
      }
    });

    it("should not merge properties which are not in the default config (legacy properties)", () => {
      const partialConfig = {
        legacy: true,
      } as PartialConfig;

      const result = migrateConfig(partialConfig);
      expect(result).toEqual(expect.objectContaining(getDefaultConfig()));
      expect(result).not.toHaveProperty("legacy");
    });

    it("should drop the config keys §6.1 struck", () => {
      // A verbatim monkeytype config fragment. Every key here was deleted with
      // the typing engine; none may survive into the merged config.
      const result = migrateConfig({
        mode: "quote",
        punctuation: true,
        numbers: true,
        language: "english",
        difficulty: "expert",
        funbox: ["58008"],
        freedomMode: true,
        paceCaret: "average",
        soundVolume: 0.5,
        capsLockWarning: true,
        ads: "sellout",
        minWpm: "custom",
        keymapMode: "next",
      });

      for (const key of [
        "mode",
        "punctuation",
        "numbers",
        "language",
        "difficulty",
        "funbox",
        "freedomMode",
        "paceCaret",
        "soundVolume",
        "capsLockWarning",
        "ads",
        "minWpm",
        "keymapMode",
      ]) {
        expect(result).not.toHaveProperty(key);
      }
      expect(result).toEqual(getDefaultConfig());
    });

    it("should correctly merge properties of various types", () => {
      const result = migrateConfig({
        addition: "100",
        fractionMultiplication: true,
        multiplication: "20",
        maxLineWidth: 700,
        favThemes: ["nord"],
      });

      expect(result.addition).toEqual("100");
      expect(result.fractionMultiplication).toEqual(true);
      expect(result.multiplication).toEqual("20");
      expect(result.maxLineWidth).toEqual(700);
      expect(result.favThemes).toEqual(["nord"]);
      // untouched keys still come from the defaults
      expect(result.time).toEqual(defaultConfig.time);
      expect(result.theme).toEqual(defaultConfig.theme);
    });

    describe("should replace value with default config if invalid", () => {
      it.for([
        {
          given: { theme: "invalid" },
          expected: { theme: defaultConfig.theme },
        },
        {
          given: { addition: "10000" },
          expected: { addition: defaultConfig.addition },
        },
        {
          given: { division: "free" },
          expected: { division: defaultConfig.division },
        },
        {
          given: { fractionAddition: "100" },
          expected: { fractionAddition: defaultConfig.fractionAddition },
        },
        {
          given: { decimals: "on" },
          expected: { decimals: defaultConfig.decimals },
        },
        {
          given: { customThemeColors: ["#ffffff"] },
          expected: { customThemeColors: defaultConfig.customThemeColors },
        },
        {
          given: { accountChart: [true, false, false, true] },
          expected: { accountChart: defaultConfig.accountChart },
        },
        {
          given: {
            favThemes: ["nord", "invalid", "serika_dark", "invalid2", "8008"],
          },
          expected: { favThemes: ["nord", "serika_dark", "8008"] },
        },
      ])(`$given`, ({ given, expected }) => {
        const description = `given: ${JSON.stringify(
          given,
        )}, expected: ${JSON.stringify(expected)} `;
        const result = migrateConfig(given);
        expect(result, description).toEqual(expect.objectContaining(expected));
      });
    });

    describe("should not convert legacy values if current values are already present", () => {
      it.for([
        {
          given: { quickTab: true, quickRestart: "enter" },
          expected: { quickRestart: "enter" },
        },
        {
          given: { swapEscAndTab: true, quickRestart: "enter" },
          expected: { quickRestart: "enter" },
        },
        {
          given: { showTimerProgress: false, timerStyle: "mini" },
          expected: { timerStyle: "mini" },
        },
      ])(`$given`, ({ given, expected }) => {
        const description = `given: ${JSON.stringify(
          given,
        )}, expected: ${JSON.stringify(expected)} `;

        const result = migrateConfig(given);
        expect(result, description).toEqual(expect.objectContaining(expected));
      });
    });

    describe("should convert legacy values", () => {
      it.for([
        { given: { quickTab: true }, expected: { quickRestart: "tab" } },
        { given: { swapEscAndTab: true }, expected: { quickRestart: "esc" } },
        { given: { smoothCaret: true }, expected: { smoothCaret: "medium" } },
        { given: { smoothCaret: false }, expected: { smoothCaret: "off" } },
        { given: { showAverage: "wpm" }, expected: { showAverage: "speed" } },
        {
          given: { showTimerProgress: false },
          expected: { timerStyle: "off" },
        },
        { given: { fontSize: "2" }, expected: { fontSize: 2 } },
        { given: { fontSize: "15" }, expected: { fontSize: 1.5 } },
        { given: { fontSize: "125" }, expected: { fontSize: 1.25 } },
        { given: { fontSize: 15 }, expected: { fontSize: 15 } },
        { given: { fontSize: -0.5 }, expected: { fontSize: 1 } },
        { given: { maxLineWidth: 0 }, expected: { maxLineWidth: 0 } },
        { given: { maxLineWidth: 19 }, expected: { maxLineWidth: 20 } },
        { given: { maxLineWidth: 1001 }, expected: { maxLineWidth: 1000 } },
        {
          // a nine-colour custom theme gains the sub-alt colour
          given: {
            customThemeColors: [
              "#111111",
              "#222222",
              "#333333",
              "#444444",
              "#555555",
              "#666666",
              "#777777",
              "#888888",
              "#999999",
            ],
          },
          expected: {
            customThemeColors: [
              "#111111",
              "#222222",
              "#333333",
              "#444444",
              "#000000",
              "#555555",
              "#666666",
              "#777777",
              "#888888",
              "#999999",
            ],
          },
        },
        {
          // monkeytype's five-element filter loses its trailing entry
          given: { customBackgroundFilter: [1, 1, 1, 1, 1] },
          expected: { customBackgroundFilter: [1, 1, 1, 1] },
        },
      ])(`$given`, ({ given, expected }) => {
        const description = `given: ${JSON.stringify(
          given,
        )}, expected: ${JSON.stringify(expected)} `;

        const result = migrateConfig(given);
        expect(result, description).toEqual(expect.objectContaining(expected));
      });
    });

    describe("§6.1 arity note / AC-085 — accountChart gains a fifth series", () => {
      it.for([
        {
          given: { accountChart: ["off", "off", "off", "off"] },
          expected: { accountChart: ["off", "off", "off", "off", "on"] },
        },
        {
          given: { accountChart: ["on", "off", "on", "off"] },
          expected: { accountChart: ["on", "off", "on", "off", "on"] },
        },
        {
          given: { accountChart: ["off", "off", "off", "off", "off"] },
          expected: { accountChart: ["off", "off", "off", "off", "off"] },
        },
        {
          // any other arity is reset rather than guessed at
          given: { accountChart: ["off", "off"] },
          expected: { accountChart: ["on", "on", "on", "on", "on"] },
        },
      ])(`$given`, ({ given, expected }) => {
        const description = `given: ${JSON.stringify(
          given,
        )}, expected: ${JSON.stringify(expected)} `;

        const result = migrateConfig(given);
        expect(result, description).toEqual(expect.objectContaining(expected));
      });
    });

    describe("SB-012 — monkeytype stored `time` in seconds, croco calc in minutes", () => {
      it.for([
        { given: { time: 15 }, expected: { time: 1 } },
        { given: { time: 30 }, expected: { time: 1 } },
        { given: { time: 60 }, expected: { time: 1 } },
        { given: { time: 120 }, expected: { time: 2 } },
        { given: { time: 300 }, expected: { time: 4 } },
        { given: { time: 600 }, expected: { time: 8 } },
        // anything else illegal is read as seconds too and clamped to the
        // nearest legal length rather than thrown away (SB-122)
        { given: { time: 3 }, expected: { time: 1 } },
        { given: { time: 99999 }, expected: { time: 8 } },
        // already-legal minute values are left alone
        { given: { time: 1 }, expected: { time: 1 } },
        { given: { time: 2 }, expected: { time: 2 } },
        { given: { time: 4 }, expected: { time: 4 } },
        { given: { time: 8 }, expected: { time: 8 } },
      ])(`$given`, ({ given, expected }) => {
        const description = `given: ${JSON.stringify(
          given,
        )}, expected: ${JSON.stringify(expected)} `;

        const result = migrateConfig(given);
        expect(result, description).toEqual(expect.objectContaining(expected));
      });
    });
  });
});
