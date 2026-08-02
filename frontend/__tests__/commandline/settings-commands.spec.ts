import { beforeEach, describe, expect, it, vi } from "vitest";

// `utils/file-storage` opens an IndexedDB at module load (for the custom font
// and custom background uploads); happy-dom has no indexedDB, and none of the
// assertions below touch it.
vi.mock("../../src/ts/utils/file-storage", () => ({
  default: {
    hasFile: async (): Promise<boolean> => false,
    getFile: async (): Promise<string | undefined> => undefined,
    storeFile: async (): Promise<void> => undefined,
    deleteFile: async (): Promise<void> => undefined,
  },
}));

// `states/test.ts` is WP-06's and is mid-migration: it still imports
// `utils/key-converter` and `utils/json-data`, which the INV-118c delete set
// removed. The palette only reads two signals out of it.
vi.mock("../../src/ts/states/test", () => ({
  getLastEventLog: (): null => null,
  getResultVisible: (): boolean => false,
}));

// `ui.ts` is WP-08's and still imports the deleted `utils/json-data`. The
// palette only uses its font preview/apply helpers.
vi.mock("../../src/ts/ui", () => ({
  previewFontFamily: (): void => undefined,
  applyFontFamily: async (): Promise<void> => undefined,
  clearFontPreview: (): void => undefined,
}));

// `controllers/route-controller` pulls in `page-controller`, which still
// imports the deleted `ad-controller` (INV-118e / INV-189). Navigation
// commands only need `navigate` to exist.
vi.mock("../../src/ts/controllers/route-controller", () => ({
  navigate: async (): Promise<void> => undefined,
}));

// The result-screen commands call into WP-06's test engine, which is still
// mid-migration (`test-logic.ts` imports the deleted `challenge-controller`).
// SB-162's "identical to clicking" is asserted on the config mutation, not on
// the restart, so stubs are enough here.
vi.mock("../../src/ts/test/test-logic", () => ({
  restart: async (): Promise<void> => undefined,
}));
vi.mock("../../src/ts/test/test-ui", () => ({
  toggleResultWords: async (): Promise<void> => undefined,
}));
vi.mock("../../src/ts/test/test-screenshot", () => ({
  copyToClipboard: async (): Promise<void> => undefined,
  download: async (): Promise<void> => undefined,
}));

import { commands, getSingleSubgroup } from "../../src/ts/commandline/lists";
import { Command } from "../../src/ts/commandline/types";
import { BAR_KEYS, BarKey, getCycleValues } from "../../src/ts/config/coupling";
import { configMetadata } from "../../src/ts/config/metadata";
import { Config } from "../../src/ts/config/store";
import { __testing } from "../../src/ts/config/testing";
import { getDefaultConfig } from "../../src/ts/constants/default-config";
import { restartTestEvent } from "../../src/ts/events/test";

function commandById(id: string): Command | undefined {
  return commands.list.find((it) => it.id === id);
}

/**
 * Run a command's `exec` and wait for it.
 *
 * `Command.exec` is declared `(options) => void`, but several bodies are
 * `async` — `restoreDefaultTestSettings` among them — and return a real promise
 * at runtime. `Promise.resolve` adopts it, so the assertions run after
 * `applyConfig` has finished, without an `await` on a `void`-typed expression.
 */
async function runCommand(id: string): Promise<void> {
  await Promise.resolve(
    commandById(id)?.exec?.({ commandlineModal: undefined as never }),
  );
}

/** The generated command for a bar key, e.g. `changeAddition`. */
function barCommand(key: BarKey): Command {
  const id = `change${key.charAt(0).toUpperCase()}${key.slice(1)}`;
  const found = commandById(id);
  expect(found, id).toBeDefined();
  return found as Command;
}

beforeEach(() => {
  __testing.replaceConfig({});
});

describe("SB-152, SB-153 - the eight settings commands", () => {
  it("all eight exist, generated from config metadata", () => {
    for (const key of BAR_KEYS) {
      const command = barCommand(key);
      expect(command.subgroup?.configKey, key).toBe(key);
      // SB-152: generated, so the icon is the one config metadata declares.
      expect(command.icon, key).toBe(configMetadata[key].icon);
    }
  });

  it("SB-153 - they appear in bar order", () => {
    const ids = commands.list.map((it) => it.id);
    const positions = BAR_KEYS.map((key) => ids.indexOf(barCommand(key).id));
    const sorted = [...positions].sort((a, b) => a - b);
    expect(positions).toEqual(sorted);
    expect(positions[0]).toBeGreaterThanOrEqual(0);
  });

  it("SB-153 - they come before every other config command", () => {
    const ids = commands.list.map((it) => it.id);
    const lastBar = Math.max(
      ...BAR_KEYS.map((key) => ids.indexOf(barCommand(key).id)),
    );
    const otherConfigCommands = commands.list.filter(
      (it) =>
        it.subgroup?.configKey !== undefined &&
        !(BAR_KEYS as readonly string[]).includes(it.subgroup.configKey),
    );
    for (const command of otherConfigCommands) {
      expect(ids.indexOf(command.id), command.id).toBeGreaterThan(lastBar);
    }
  });

  it("SB-156 - the display names", () => {
    expect(barCommand("decimals").display).toBe("Decimals...");
    expect(barCommand("negatives").display).toBe("Negative numbers...");
    expect(barCommand("addition").display).toBe("Addition...");
    expect(barCommand("multiplication").display).toBe("Multiplication...");
    expect(barCommand("division").display).toBe("Division...");
    expect(barCommand("fractionAddition").display).toBe("Fraction addition...");
    expect(barCommand("fractionMultiplication").display).toBe(
      "Fraction multiplication...",
    );
    expect(barCommand("time").display).toBe("Time...");
  });

  it("SB-156 - the required aliases", () => {
    const required: Record<BarKey, string[]> = {
      addition: ["plus", "add"],
      multiplication: ["times", "multiply"],
      division: ["divide"],
      fractionAddition: ["fraction", "fractions"],
      fractionMultiplication: ["fraction", "fractions"],
      decimals: ["decimal", "point", "comma"],
      negatives: ["minus", "negative"],
      time: ["duration", "minutes"],
    };
    for (const key of BAR_KEYS) {
      const alias = barCommand(key).alias ?? "";
      for (const word of required[key]) {
        expect(alias.split(" "), `${key} alias`).toContain(word);
      }
    }
  });
});

describe("SB-154, SB-213 - each command lists exactly the schema options in cycle order", () => {
  it.each(BAR_KEYS)("%s", (key: BarKey) => {
    const command = barCommand(key);
    const options = command.subgroup?.list ?? [];
    const values = options.map((it) => it.configValue);
    expect(values).toEqual(getCycleValues(key));
  });

  it("SB-158 - the time command offers no free-text custom duration", () => {
    const command = barCommand("time");
    expect(command.input).toBeUndefined();
    for (const option of command.subgroup?.list ?? []) {
      expect(option.input, option.id).toBeFalsy();
    }
    expect(command.subgroup?.list).toHaveLength(4);
  });
});

describe("SB-155 - the palette option labels", () => {
  function labels(key: BarKey): string[] {
    return (barCommand(key).subgroup?.list ?? []).map((it) => it.display);
  }

  it("renders the OFF state as the word off, never as a struck-through glyph", () => {
    expect(labels("addition")[0]).toBe("off");
    expect(labels("multiplication")[0]).toBe("off");
    expect(labels("division")[0]).toBe("off");
    expect(labels("fractionAddition")[0]).toBe("off");
    expect(labels("fractionMultiplication")[0]).toBe("off");
    expect(labels("decimals")[0]).toBe("off");
    expect(labels("negatives")[0]).toBe("off");
  });

  it("renders ON states with the same label text as the bar", () => {
    expect(labels("addition")).toEqual(["off", "+100", "+1000"]);
    expect(labels("multiplication")).toEqual([
      "off",
      "12x12",
      "20x20",
      "100x100",
    ]);
    expect(labels("division")).toEqual(["off", "144/12", "xxx/xx"]);
    expect(labels("fractionAddition")).toEqual(["off", "+1/12", "+1/xx"]);
    expect(labels("fractionMultiplication")).toEqual(["off", "on"]);
    expect(labels("decimals")).toEqual(["off", "on"]);
    expect(labels("negatives")).toEqual(["off", "on"]);
    expect(labels("time")).toEqual(["1", "2", "4", "8"]);
  });
});

describe("SB-162 - executing a command is identical to clicking the control", () => {
  it("writes the value through setConfig, coupling and all", () => {
    __testing.replaceConfig({
      multiplication: "off",
      fractionMultiplication: false,
    });
    const on = barCommand("fractionMultiplication").subgroup?.list.find(
      (it) => it.configValue === true,
    );
    expect(on).toBeDefined();
    on?.exec?.({ commandlineModal: undefined as never });

    expect(Config.fractionMultiplication).toBe(true);
    // SB-090 cascaded through the same overrideConfig the bar uses.
    expect(Config.multiplication).toBe("100");
  });

  it("is blocked by the SB-215 guard exactly as the bar is", () => {
    __testing.replaceConfig({
      addition: "1000",
      multiplication: "off",
      division: "off",
      fractionAddition: "off",
      fractionMultiplication: false,
    });
    const off = barCommand("addition").subgroup?.list.find(
      (it) => it.configValue === "off",
    );
    off?.exec?.({ commandlineModal: undefined as never });
    expect(Config.addition).toBe("1000");
  });
});

describe("SB-157 - restoreDefaultTestSettings", () => {
  it("exists with the required display, icon and alias", () => {
    const command = commandById("restoreDefaultTestSettings");
    expect(command).toBeDefined();
    expect(command?.display).toBe("Restore default test settings");
    expect(command?.icon).toBe("tabler:refresh");
    for (const word of ["default", "leaderboard", "eligible"]) {
      expect(command?.alias?.split(" ")).toContain(word);
    }
  });

  it("executing it puts all eight keys back to the SB-110 defaults", async () => {
    __testing.replaceConfig({
      addition: "100",
      multiplication: "12",
      division: "off",
      fractionAddition: "12",
      fractionMultiplication: false,
      decimals: false,
      negatives: false,
      time: 8,
    });

    await runCommand("restoreDefaultTestSettings");

    const defaults = getDefaultConfig();
    for (const key of BAR_KEYS) {
      expect(Config[key], key).toEqual(defaults[key]);
    }
  });

  it("SB-054 - and restarts the test, like the eight generated commands do", async () => {
    const restartSpy = vi.spyOn(restartTestEvent, "dispatch");
    restartSpy.mockClear();

    __testing.replaceConfig({ addition: "100", time: 1 });

    await runCommand("restoreDefaultTestSettings");

    expect(restartSpy).toHaveBeenCalled();
    restartSpy.mockRestore();
  });
});

describe("SB-159, C14, C15, C22, C38, C41 - commands that must not exist", () => {
  const forbidden = [
    "changeLanguage",
    "changeQuoteLength",
    "changePunctuation",
    "changeNumbers",
    "changeMode",
    "changeWords",
    "changeCustomModeText",
    "viewQuoteSearchPopup",
    "changeBritishEnglish",
    "changeLazyMode",
    "changeCustomPolyglot",
    "changeCustomLayoutfluid",
    "changeLayout",
    "changeKeymapMode",
    "changeKeymapStyle",
    "changeKeymapLegendStyle",
    "changeKeymapSize",
    "changeKeymapLayout",
    "changeKeymapKeys",
    "changeFunbox",
    "loadChallenge",
    "watchVideoAd",
    "changeAds",
    "changeMinBurst",
    "changeDifficulty",
    "changeMinWpm",
    "changeMinAcc",
    "changeBlindMode",
    "bailOut",
    "changeSoundVolume",
    "playSoundOnClick",
    "playSoundOnError",
    "changeCapsLockWarning",
    "changeFreedomMode",
    "changePaceCaret",
    "changeLiveBurstStyle",
    "changeTapeMode",
    "changeTypingSpeedUnit",
    "addTag",
    "changePreset",
    "practiseWords",
    "copyWordsToClipboard",
  ];

  it.each(forbidden)("%s is gone", (id) => {
    expect(commandById(id)).toBeUndefined();
  });

  it("no command anywhere in the tree carries a font awesome icon (C30)", () => {
    const seen: string[] = [];
    const walk = (list: Command[]): void => {
      for (const command of list) {
        if (command.icon?.startsWith("fa-") === true) {
          seen.push(`${command.id}: ${command.icon}`);
        }
        if (command.subgroup) walk(command.subgroup.list);
      }
    };
    walk(commands.list);
    expect(seen).toEqual([]);
  });
});

describe("SB-160 - commands that must survive", () => {
  const kept = [
    "changeResultSaving",
    "changeQuickRestart",
    "changeSingleListCommandLine",
    "changeSmoothCaret",
    "changeCaretStyle",
    "changeTimerStyle",
    "changeTimerColor",
    "changeTimerOpacity",
    "changeLiveSpeedStyle",
    "changeLiveAccStyle",
    // input-only commands, so `buildInputCommand` names them set...Custom
    "setFontSizeCustom",
    "changeFontFamily",
    "setMaxLineWidthCustom",
    "changeAlwaysShowDecimalPlaces",
    "changeStartGraphsAtZero",
    "changeShowKeyTips",
    "changeShowOutOfFocusWarning",
    "changeShowAverage",
    "changeShowPb",
    "changeTheme",
    "changeCustomTheme",
    "changeRandomTheme",
    "randomizeTheme",
    "changeFlipTestColors",
    "changeColorfulMode",
    "changeCustomBackgroundSize",
    "importSettingsJSON",
    "exportSettingsJSON",
    "clearNotifications",
    "signOut",
    "nextTest",
    "repeatTest",
    "shareTestSettings",
  ];

  it.each(kept)("%s is kept", (id) => {
    expect(commandById(id)).toBeDefined();
  });

  it("C9 - the settings nav command opens the theme modal instead of a dead route", () => {
    const command = commandById("viewSettings");
    expect(command).toBeDefined();
    expect(command?.opensModal).toBe(true);
  });
});

describe("SB-161 - singleListCommandLine flattens the eight commands", () => {
  it("produces one row per option, labelled '<Command> > <option>'", async () => {
    const single = await getSingleSubgroup();
    const ids = single.list.map((it) => it.id);

    for (const key of BAR_KEYS) {
      for (const value of getCycleValues(key)) {
        const optionId = `set${key.charAt(0).toUpperCase()}${key.slice(1)}${String(
          value,
        )
          .charAt(0)
          .toUpperCase()}${String(value).slice(1)}`;
        expect(ids, `${key} = ${String(value)}`).toContain(optionId);
      }
    }

    const flattened = single.list.find((it) => it.id === "setTime8");
    expect(flattened?.singleListDisplayNoIcon).toBe("Time 8");
    expect(flattened?.configKey).toBe("time");
  });
});

describe("SB-131 - the settings JSON round-trips all eight keys", () => {
  it("export writes every bar key", () => {
    const command = commandById("exportSettingsJSON");
    const json = command?.defaultValue?.() ?? "";
    const parsed = JSON.parse(json) as Record<string, unknown>;
    const defaults = getDefaultConfig();
    for (const key of BAR_KEYS) {
      expect(parsed[key], key).toEqual(defaults[key]);
    }
  });
});
