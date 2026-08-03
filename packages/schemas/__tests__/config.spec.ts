import { describe, it, expect } from "vitest";
import {
  AccountChartSchema,
  ConfigGroupNameSchema,
  ConfigSchema,
  CustomBackgroundSchema,
  TEST_CONFIG_KEYS,
} from "@croco-calc/schemas/configs";

/** §6.1 of the master document: the ConfigSchema MUST contain exactly these keys. */
const EXPECTED_CONFIG_KEYS = [
  // the eight settings-bar controls
  "addition",
  "multiplication",
  "division",
  "fractionAddition",
  "fractionMultiplication",
  "decimals",
  "negatives",
  "time",
  // behavior
  "quickRestart",
  "resultSaving",
  "singleListCommandLine",
  // appearance
  "timerStyle",
  "liveSpeedStyle",
  "liveAccStyle",
  "timerColor",
  "timerOpacity",
  "alwaysShowDecimalPlaces",
  "startGraphsAtZero",
  "maxLineWidth",
  "fontSize",
  "fontFamily",
  // theme
  "flipTestColors",
  "colorfulMode",
  "customBackground",
  "customBackgroundSize",
  "customBackgroundFilter",
  "autoSwitchTheme",
  "themeLight",
  "themeDark",
  "randomTheme",
  "favThemes",
  "theme",
  "customTheme",
  "customThemeColors",
  // hide elements
  "showKeyTips",
  "showOutOfFocusWarning",
  "showAverage",
  "showPb",
  // hidden
  "accountChart",
];

describe("config schema", () => {
  it("contains exactly the §6.1 key set and nothing else", () => {
    expect(Object.keys(ConfigSchema.shape).sort()).toEqual(
      [...EXPECTED_CONFIG_KEYS].sort(),
    );
  });

  it("backs the settings bar with the eight test keys (SB-010, SB-016)", () => {
    expect(TEST_CONFIG_KEYS).toEqual([
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

  it("keeps the live speed and live acc styles (review gap 3, CP-078)", () => {
    expect(Object.keys(ConfigSchema.shape)).toContain("liveSpeedStyle");
    expect(Object.keys(ConfigSchema.shape)).toContain("liveAccStyle");
  });

  it("makes accountChart a five-element array (AC-085)", () => {
    expect(AccountChartSchema.items).toHaveLength(5);
    expect(
      AccountChartSchema.safeParse(["on", "on", "on", "on", "on"]).success,
    ).toBe(true);
    expect(AccountChartSchema.safeParse(["on", "on", "on", "on"]).success).toBe(
      false,
    );
  });

  it("TR-203 — the caret config keys are struck", () => {
    // The custom caret element existed only because the old design hid the
    // input, so there was no native caret to see. `#answerInput` is visible and
    // has one, themed with `--caret-color` (TR-020), so neither key has
    // anything left to control.
    expect(ConfigSchema.shape).not.toHaveProperty("smoothCaret");
    expect(ConfigSchema.shape).not.toHaveProperty("caretStyle");
  });

  it("has config groups without sound, input or ads", () => {
    expect(ConfigGroupNameSchema.options).toEqual([
      "test",
      "behavior",
      "appearance",
      "theme",
      "hideElements",
      "hidden",
    ]);
  });

  it("is strict, so a removed key cannot be smuggled back", () => {
    expect(
      ConfigSchema.partial().safeParse({ punctuation: true }).success,
    ).toBe(false);
    expect(ConfigSchema.partial().safeParse({ funBox: [] }).success).toBe(
      false,
    );
  });

  describe("CustomBackgroundSchema", () => {
    it.for([
      {
        name: "http",
        input: `http://example.com/path/image.png`,
      },
      {
        name: "https",
        input: `https://example.com/path/image.png`,
      },
      {
        name: "png",
        input: `https://example.com/path/image.png`,
      },
      {
        name: "gif",
        input: `https://example.com/path/image.gif?width=5`,
      },
      {
        name: "jpeg",
        input: `https://example.com/path/image.jpeg`,
      },
      {
        name: "jpg",
        input: `https://example.com/path/image.jpg`,
      },
      {
        name: "tiff",
        input: `https://example.com/path/image.tiff`,
        expectedError: "Unsupported image format",
      },
      {
        name: "non-url",
        input: `test`,
        expectedError: "Needs to be an URI",
      },
      {
        name: "single quotes",
        input: `https://example.com/404.jpg?q=alert('1')`,
        expectedError: "May not contain quotes",
      },
      {
        name: "double quotes",
        input: `https://example.com/404.jpg?q=alert("1")`,
        expectedError: "May not contain quotes",
      },
      {
        name: "back tick",
        input: `https://example.com/404.jpg?q=alert(\`1\`)`,
        expectedError: "May not contain quotes",
      },
      {
        name: "javascript url",
        input: `javascript:alert('asdf');//https://example.com/img.jpg`,
        expectedError: "Unsupported protocol",
      },
      {
        name: "data url",
        input: `data:image/gif;base64,data`,
        expectedError: "Unsupported protocol",
      },
      {
        name: "long url",
        input: `https://example.com/path/image.jpeg?q=${new Array(2048)
          .fill("x")
          .join()}`,
        expectedError: "URL is too long",
      },
    ])(`$name`, ({ input, expectedError }) => {
      const parsed = CustomBackgroundSchema.safeParse(input);
      if (expectedError !== undefined) {
        expect(parsed.success).toEqual(false);
        expect(parsed.error?.issues[0]?.message).toEqual(expectedError);
      } else {
        expect(parsed.success).toEqual(true);
      }
    });
  });
});
