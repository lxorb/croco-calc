import { Config, ConfigSchema } from "@croco-calc/schemas/configs";
import {
  buildSettingsId,
  isLeaderboardEligible,
  LEADERBOARD_SETTINGS_ID,
} from "@croco-calc/schemas/math";
import { describe, expect, it } from "vitest";

import {
  BAR_ORDER,
  BAR_PILLS,
  getBarLabel,
  getBarTooltip,
  isBarValueOff,
} from "../../src/ts/config/bar-controls";
import {
  applyCoupling,
  BAR_KEYS,
  BarKey,
  getCycleValues,
} from "../../src/ts/config/coupling";
import { configMetadata } from "../../src/ts/config/metadata";
import { getDefaultConfig } from "../../src/ts/constants/default-config";

function cfg(overrides: Partial<Config> = {}): Config {
  return { ...getDefaultConfig(), ...overrides };
}

describe("SB-110 - the defaults", () => {
  const defaults = getDefaultConfig();

  it("matches the SB-110 table exactly", () => {
    expect(defaults.addition).toBe("1000");
    expect(defaults.multiplication).toBe("100");
    expect(defaults.division).toBe("threeByTwo");
    expect(defaults.fractionAddition).toBe("99");
    expect(defaults.fractionMultiplication).toBe(true);
    expect(defaults.decimals).toBe(true);
    expect(defaults.negatives).toBe(true);
    expect(defaults.time).toBe(8);
  });

  it("SB-012 - time is stored in minutes", () => {
    expect(getCycleValues("time")).toEqual([1, 2, 4, 8]);
    expect(defaults.time).toBe(8);
  });

  it("SB-111 - every one of the eight controls renders in the ON style", () => {
    for (const key of BAR_KEYS) {
      expect(isBarValueOff(key, defaults[key] as never)).toBe(false);
    }
  });

  it("SB-110 - the labels shown with the defaults", () => {
    expect(getBarLabel("addition", defaults.addition)).toBe("+1000");
    expect(getBarLabel("multiplication", defaults.multiplication)).toBe(
      "100x100",
    );
    expect(getBarLabel("division", defaults.division)).toBe("xxx/xx");
    expect(getBarLabel("fractionAddition", defaults.fractionAddition)).toBe(
      "+1/xx",
    );
    expect(
      getBarLabel("fractionMultiplication", defaults.fractionMultiplication),
    ).toBe("*x/y");
    expect(getBarLabel("decimals", defaults.decimals)).toBe("4.2");
    expect(getBarLabel("negatives", defaults.negatives)).toBe("-");
    expect(getBarLabel("time", defaults.time)).toBe("8");
  });

  it("SB-112 - applying the defaults fires no coupling override", () => {
    expect(applyCoupling(defaults)).toEqual(defaults);
  });

  it("SB-151 - quickRestart stays off, so Escape opens the palette", () => {
    expect(defaults.quickRestart).toBe("off");
  });

  it("the defaults validate against the config schema", () => {
    expect(ConfigSchema.safeParse(defaults).success).toBe(true);
  });
});

describe("SB-201 - the label and tooltip tables are exhaustive", () => {
  it("every schema value of every bar key has a label", () => {
    for (const key of BAR_KEYS) {
      for (const value of getCycleValues(key)) {
        const label = getBarLabel(key, value as never);
        expect(label, `${key} = ${String(value)}`).toBeTypeOf("string");
        expect(label.length, `${key} = ${String(value)}`).toBeGreaterThan(0);
      }
    }
  });

  it("every schema value of every bar key has a tooltip that names the control (SB-145)", () => {
    for (const key of BAR_KEYS) {
      const name = configMetadata[key].displayString;
      expect(name, key).toBeDefined();
      for (const value of getCycleValues(key)) {
        const tooltip = getBarTooltip(key, value as never, cfg());
        expect(tooltip, `${key} = ${String(value)}`).toContain(name as string);
      }
    }
  });

  it("a schema value with no label is a hard error, never a blank", () => {
    // `getBarLabel` is the single lookup the bar, the mobile modal and the
    // share modal all use, so a missing entry must not degrade silently.
    expect(() => getBarLabel("addition", "9999" as never)).toThrow(
      /No settings-bar label/,
    );
    expect(() => getBarTooltip("addition", "9999" as never, cfg())).toThrow(
      /No settings-bar tooltip/,
    );
  });
});

describe("section 3 - the exact labels of every state", () => {
  it("SB-024 - addition", () => {
    expect(getBarLabel("addition", "off")).toBe("+100");
    expect(getBarLabel("addition", "100")).toBe("+100");
    expect(getBarLabel("addition", "1000")).toBe("+1000");
  });

  it("SB-027 - multiplication", () => {
    expect(getBarLabel("multiplication", "off")).toBe("12x12");
    expect(getBarLabel("multiplication", "12")).toBe("12x12");
    expect(getBarLabel("multiplication", "20")).toBe("20x20");
    expect(getBarLabel("multiplication", "100")).toBe("100x100");
  });

  it("SB-030, SB-031 - division, whose OFF label is the single character /", () => {
    expect(getBarLabel("division", "off")).toBe("/");
    expect(getBarLabel("division", "tables")).toBe("144/12");
    expect(getBarLabel("division", "threeByTwo")).toBe("xxx/xx");
  });

  it("SB-034 - fraction addition", () => {
    expect(getBarLabel("fractionAddition", "off")).toBe("+1/12");
    expect(getBarLabel("fractionAddition", "12")).toBe("+1/12");
    expect(getBarLabel("fractionAddition", "99")).toBe("+1/xx");
  });

  it("SB-037 - fraction multiplication keeps *x/y in both states", () => {
    expect(getBarLabel("fractionMultiplication", false)).toBe("*x/y");
    expect(getBarLabel("fractionMultiplication", true)).toBe("*x/y");
  });

  it("SB-040, SB-043 - decimals and negatives keep their glyph in both states", () => {
    expect(getBarLabel("decimals", false)).toBe("4.2");
    expect(getBarLabel("decimals", true)).toBe("4.2");
    expect(getBarLabel("negatives", false)).toBe("-");
    expect(getBarLabel("negatives", true)).toBe("-");
  });

  it("SB-046 - time", () => {
    expect(getBarLabel("time", 1)).toBe("1");
    expect(getBarLabel("time", 2)).toBe("2");
    expect(getBarLabel("time", 4)).toBe("4");
    expect(getBarLabel("time", 8)).toBe("8");
  });
});

describe("section 3 - the exact tooltip of every state", () => {
  it("SB-025 - addition", () => {
    expect(getBarTooltip("addition", "off", cfg())).toBe("addition: off");
    expect(getBarTooltip("addition", "100", cfg())).toBe("addition: +100");
    expect(getBarTooltip("addition", "1000", cfg())).toBe("addition: +1000");
  });

  it("SB-028 - multiplication", () => {
    expect(getBarTooltip("multiplication", "off", cfg())).toBe(
      "multiplication: off",
    );
    expect(getBarTooltip("multiplication", "12", cfg())).toBe(
      "multiplication: 12x12",
    );
    expect(getBarTooltip("multiplication", "20", cfg())).toBe(
      "multiplication: 20x20",
    );
    expect(getBarTooltip("multiplication", "100", cfg())).toBe(
      "multiplication: 100x100",
    );
  });

  it("SB-032 - division", () => {
    expect(getBarTooltip("division", "off", cfg())).toBe("division: off");
    expect(getBarTooltip("division", "tables", cfg())).toBe("division: 144/12");
    expect(getBarTooltip("division", "threeByTwo", cfg())).toBe(
      "division: xxx/xx",
    );
  });

  it("SB-035 - fraction addition", () => {
    expect(getBarTooltip("fractionAddition", "off", cfg())).toBe(
      "fraction addition: off",
    );
    expect(getBarTooltip("fractionAddition", "12", cfg())).toBe(
      "fraction addition: max denominator 12",
    );
    expect(getBarTooltip("fractionAddition", "99", cfg())).toBe(
      "fraction addition: max denominator 99",
    );
  });

  it("SB-038, SB-094 - the fraction multiplication tooltip mirrors the current multiplication size", () => {
    expect(getBarTooltip("fractionMultiplication", false, cfg())).toBe(
      "fraction multiplication: off",
    );
    expect(
      getBarTooltip(
        "fractionMultiplication",
        true,
        cfg({ multiplication: "12" }),
      ),
    ).toBe("fraction multiplication: max 12");
    expect(
      getBarTooltip(
        "fractionMultiplication",
        true,
        cfg({ multiplication: "20" }),
      ),
    ).toBe("fraction multiplication: max 20");
    expect(
      getBarTooltip(
        "fractionMultiplication",
        true,
        cfg({ multiplication: "100" }),
      ),
    ).toBe("fraction multiplication: max 100");
  });

  it("SB-041, SB-044 - decimals and negatives", () => {
    expect(getBarTooltip("decimals", false, cfg())).toBe("decimals: off");
    expect(getBarTooltip("decimals", true, cfg())).toBe("decimals: on");
    expect(getBarTooltip("negatives", false, cfg())).toBe(
      "negative numbers: off",
    );
    expect(getBarTooltip("negatives", true, cfg())).toBe(
      "negative numbers: on",
    );
  });

  it("SB-047 - time is singular at 1 minute and plural above it", () => {
    expect(getBarTooltip("time", 1, cfg())).toBe("time: 1 minute");
    expect(getBarTooltip("time", 2, cfg())).toBe("time: 2 minutes");
    expect(getBarTooltip("time", 4, cfg())).toBe("time: 4 minutes");
    expect(getBarTooltip("time", 8, cfg())).toBe("time: 8 minutes");
  });
});

describe("SB-071, SB-072, SB-048 - which states render struck through", () => {
  it("only the off / false state of a non-time control is off", () => {
    expect(isBarValueOff("addition", "off")).toBe(true);
    expect(isBarValueOff("addition", "100")).toBe(false);
    expect(isBarValueOff("multiplication", "off")).toBe(true);
    expect(isBarValueOff("division", "off")).toBe(true);
    expect(isBarValueOff("fractionAddition", "off")).toBe(true);
    expect(isBarValueOff("fractionMultiplication", false)).toBe(true);
    expect(isBarValueOff("decimals", false)).toBe(true);
    expect(isBarValueOff("negatives", false)).toBe(true);
  });

  it("SB-048 - the time control never renders in the OFF style", () => {
    for (const value of getCycleValues("time")) {
      expect(isBarValueOff("time", value)).toBe(false);
    }
  });
});

describe("SB-084, SB-086, SB-141 - grouping and tab order", () => {
  it("the three pills hold exactly the eight controls, once each", () => {
    const flattened = [
      ...BAR_PILLS.left,
      ...BAR_PILLS.centre,
      ...BAR_PILLS.right,
    ];
    expect(flattened).toHaveLength(8);
    expect(new Set(flattened).size).toBe(8);
  });

  it("SB-084 - left = the two modifiers, centre = the five generators, right = time", () => {
    expect([...BAR_PILLS.left]).toEqual(["decimals", "negatives"]);
    expect([...BAR_PILLS.centre]).toEqual([
      "addition",
      "multiplication",
      "division",
      "fractionAddition",
      "fractionMultiplication",
    ]);
    expect([...BAR_PILLS.right]).toEqual(["time"]);
  });

  it("SB-141 - tab order is DOM order, left pill then centre then right", () => {
    expect([...BAR_ORDER]).toEqual([
      "decimals",
      "negatives",
      "addition",
      "multiplication",
      "division",
      "fractionAddition",
      "fractionMultiplication",
      "time",
    ]);
    expect([...BAR_ORDER]).toEqual([
      ...BAR_PILLS.left,
      ...BAR_PILLS.centre,
      ...BAR_PILLS.right,
    ]);
  });
});

describe("SB-055, SB-060, SB-061, SB-130 - the metadata of the eight bar keys", () => {
  it.each(BAR_KEYS)(
    "%s carries restart, group test and a tabler icon",
    (key: BarKey) => {
      const meta = configMetadata[key];
      expect(meta.changeRequiresRestart).toBe(true);
      expect(meta.group).toBe("test");
      expect(meta.icon.startsWith("tabler:")).toBe(true);
    },
  );

  it("SB-060 - the exact iconify ids of the eight controls", () => {
    expect(configMetadata.addition.icon).toBe("tabler:plus");
    expect(configMetadata.multiplication.icon).toBe("tabler:x");
    expect(configMetadata.division.icon).toBe("tabler:divide");
    expect(configMetadata.fractionAddition.icon).toBe("tabler:math-1-divide-2");
    expect(configMetadata.fractionMultiplication.icon).toBe(
      "tabler:math-x-divide-y",
    );
    expect(configMetadata.decimals.icon).toBe("tabler:decimal");
    expect(configMetadata.negatives.icon).toBe("tabler:minus");
    expect(configMetadata.time.icon).toBe("tabler:clock");
  });

  it("SB-061 - no other config key borrows the tabler collection", () => {
    const barKeys = new Set<string>(BAR_KEYS);
    for (const [key, meta] of Object.entries(configMetadata)) {
      if (barKeys.has(key)) continue;
      expect(meta.icon.startsWith("ph:"), `${key} -> ${meta.icon}`).toBe(true);
    }
  });

  it("INV-081 - every retained config key has a non-empty icon", () => {
    for (const [key, meta] of Object.entries(configMetadata)) {
      expect(meta.icon, key).toBeTypeOf("string");
      expect(meta.icon.length, key).toBeGreaterThan(0);
    }
  });
});

describe("SB-204, SB-205 - the leaderboard settings signature", () => {
  it("SB-171, SB-204 - the default config produces LEADERBOARD_SETTINGS_ID", () => {
    expect(buildSettingsId(getDefaultConfig())).toBe(
      "1000:100:threeByTwo:99:1:1:1",
    );
    expect(buildSettingsId(getDefaultConfig())).toBe(LEADERBOARD_SETTINGS_ID);
  });

  it("SB-172 - time is not part of the signature", () => {
    for (const time of getCycleValues("time")) {
      expect(buildSettingsId(cfg({ time }))).toBe(LEADERBOARD_SETTINGS_ID);
    }
  });

  it("SB-205 - default settings are eligible at 4 and 8 minutes only", () => {
    const id = buildSettingsId(getDefaultConfig());
    expect(isLeaderboardEligible(id, "4")).toBe(true);
    expect(isLeaderboardEligible(id, "8")).toBe(true);
    expect(isLeaderboardEligible(id, "1")).toBe(false);
    expect(isLeaderboardEligible(id, "2")).toBe(false);
  });

  it("SB-205 - any single-setting deviation from the defaults is ineligible", () => {
    const deviations: Partial<Config>[] = [
      { addition: "off" },
      { addition: "100" },
      { multiplication: "off" },
      { multiplication: "12" },
      { multiplication: "20" },
      { division: "off" },
      { division: "tables" },
      { fractionAddition: "off" },
      { fractionAddition: "12" },
      { fractionMultiplication: false },
      { decimals: false },
      { negatives: false },
    ];

    for (const deviation of deviations) {
      const id = buildSettingsId(cfg(deviation));
      expect(id, JSON.stringify(deviation)).not.toBe(LEADERBOARD_SETTINGS_ID);
      expect(isLeaderboardEligible(id, "8"), JSON.stringify(deviation)).toBe(
        false,
      );
    }
  });

  it("SB-174 - the constant is a frozen literal, not derived from the defaults", () => {
    // Reading it back as a literal is the only assertion available in-process;
    // the point of the requirement is that this line has to be edited by hand.
    expect(LEADERBOARD_SETTINGS_ID).toBe("1000:100:threeByTwo:99:1:1:1");
  });
});
