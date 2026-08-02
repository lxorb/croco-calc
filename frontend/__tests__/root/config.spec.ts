import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import * as Config from "../../src/ts/config/setters";
import * as Lifecycle from "../../src/ts/config/lifecycle";
import * as ConfigUtils from "../../src/ts/config/utils";
import { __testing } from "../../src/ts/config/testing";
import * as Misc from "../../src/ts/utils/misc";
import * as Env from "../../src/ts/utils/env";
import {
  ConfigKey,
  Config as ConfigType,
  CaretStyleSchema,
} from "@croco-calc/schemas/configs";
import * as ConfigValidation from "../../src/ts/config/validation";
import { configEvent } from "../../src/ts/events/config";
import { restartTestEvent } from "../../src/ts/events/test";
import * as ApeConfig from "../../src/ts/ape/config";
import * as Notifications from "../../src/ts/states/notifications";
import { getDefaultConfig } from "../../src/ts/constants/default-config";

const { replaceConfig, getConfig } = __testing;

/**
 * The generic `setConfig` / `applyConfig` machinery (WP-05 §6.1, SB-053,
 * SB-095, SB-104, SB-121 … SB-127, SB-157).
 *
 * Rewritten for croco calc. monkeytype's version of this file drove the
 * machinery through typing keys (`funbox`, `tapeMode`, `monkey`, `numbers`,
 * `punctuation`, `customLayoutfluid`, `minWpm`, `ads`, `keymapLayout`) and the
 * `config/funbox-validation` module, none of which exist any more — the import
 * alone made the suite unloadable. The behaviours below are the same ones, but
 * exercised through the keys §6.1 actually keeps. The bar-specific rules
 * (cycling, coupling truth table, all-off guard) live in
 * `__tests__/config/setters.spec.ts` and `__tests__/config/coupling.spec.ts`.
 */
describe("Config", () => {
  const isDevEnvironmentMock = vi.spyOn(Env, "isDevEnvironment");
  beforeEach(() => {
    isDevEnvironmentMock.mockClear();
    replaceConfig({});
  });

  describe("setConfig with mocks", () => {
    const isConfigValueValidMock = vi.spyOn(
      ConfigValidation,
      "isConfigValueValid",
    );
    const dispatchConfigEventMock = vi.spyOn(configEvent, "dispatch");
    const dbSaveConfigMock = vi.spyOn(ApeConfig, "saveConfig");
    const notificationAddMock = vi.spyOn(
      Notifications,
      "showNoticeNotification",
    );
    const miscTriggerResizeMock = vi.spyOn(Misc, "triggerResize");

    const mocks = [
      isConfigValueValidMock,
      dispatchConfigEventMock,
      dbSaveConfigMock,
      notificationAddMock,
      miscTriggerResizeMock,
    ];

    beforeEach(async () => {
      vi.useFakeTimers();
      mocks.forEach((it) => it.mockClear());

      isConfigValueValidMock.mockReturnValue(true);
      dbSaveConfigMock.mockResolvedValue();

      replaceConfig({});
    });

    afterAll(() => {
      mocks.forEach((it) => it.mockRestore());
      vi.useRealTimers();
    });

    it("should throw if config key is not found in metadata", () => {
      expect(() => {
        Config.setConfig("nonExistentKey" as ConfigKey, true);
      }).toThrow(`Config metadata for key "nonExistentKey" is not defined.`);
    });

    it("should fail if config is blocked", () => {
      //GIVEN — the only enabled generator (SB-101)
      replaceConfig({
        addition: "1000",
        multiplication: "off",
        division: "off",
        fractionAddition: "off",
        fractionMultiplication: false,
      });

      //WHEN / THEN
      expect(Config.setConfig("addition", "off")).toBe(false);
      expect(notificationAddMock).toHaveBeenCalledWith(
        "at least one task type must be enabled",
      );
    });

    it("should use overrideValue", () => {
      //WHEN — maxLineWidth clamps into [20, 1000] (0 stays 0)
      Config.setConfig("maxLineWidth", 19);
      expect(getConfig().maxLineWidth).toEqual(20);

      Config.setConfig("maxLineWidth", 1001);
      expect(getConfig().maxLineWidth).toEqual(1000);

      //and customBackground is trimmed
      Config.setConfig("customBackground", "  https://example.com/image.png  ");
      expect(getConfig().customBackground).toEqual(
        "https://example.com/image.png",
      );
    });

    it("fails if config is invalid", () => {
      //GIVEN
      isConfigValueValidMock.mockReturnValue(false);

      //WHEN / THEN
      expect(Config.setConfig("caretStyle", "banana" as never)).toBe(false);
      expect(isConfigValueValidMock).toHaveBeenCalledWith(
        "caret style",
        "banana",
        CaretStyleSchema,
      );
    });

    it("sets overrideConfigs", () => {
      //GIVEN — SB-091: switching multiplication off clears fraction
      //multiplication, and the cascaded key gets its own event (SB-095)
      replaceConfig({
        addition: "1000",
        multiplication: "100",
        fractionMultiplication: true,
      });

      //WHEN
      Config.setConfig("multiplication", "off");

      //THEN
      expect(dispatchConfigEventMock).toHaveBeenCalledWith({
        key: "fractionMultiplication",
        newValue: false,
        nosave: false,
        previousValue: true,
      });

      expect(dispatchConfigEventMock).toHaveBeenCalledWith({
        key: "multiplication",
        newValue: "off",
        nosave: false,
        previousValue: "100",
      });
    });

    it("does not dispatch for an overrideConfig key that is already correct", () => {
      //GIVEN
      replaceConfig({
        addition: "1000",
        multiplication: "100",
        fractionMultiplication: false,
      });

      //WHEN
      Config.setConfig("multiplication", "off");

      //THEN
      expect(dispatchConfigEventMock).not.toHaveBeenCalledWith(
        expect.objectContaining({ key: "fractionMultiplication" }),
      );
    });

    it("SB-121/SB-123 - saves to the database if nosave=false", async () => {
      //GIVEN
      replaceConfig({ decimals: false });

      //WHEN
      Config.setConfig("decimals", true);

      //THEN — wait for the 1000 ms debounce
      await vi.advanceTimersByTimeAsync(2500);

      expect(dbSaveConfigMock).toHaveBeenCalledWith({ decimals: true });
    });

    it("SB-123 - sends the configOverride keys too", async () => {
      //GIVEN
      replaceConfig({
        addition: "1000",
        multiplication: "100",
        fractionMultiplication: true,
      });

      //WHEN
      Config.setConfig("multiplication", "off");

      //THEN
      await vi.advanceTimersByTimeAsync(2500);

      expect(dbSaveConfigMock).toHaveBeenCalledWith({
        multiplication: "off",
        fractionMultiplication: false,
      });
    });

    it("does not save if nosave=true", async () => {
      //GIVEN
      replaceConfig({ decimals: false });

      //WHEN
      Config.setConfig("decimals", true, { nosave: true });

      //THEN
      await vi.advanceTimersByTimeAsync(2500);

      expect(dbSaveConfigMock).not.toHaveBeenCalled();
    });

    it("dispatches event on set", () => {
      //GIVEN
      replaceConfig({ decimals: false });

      //WHEN
      Config.setConfig("decimals", true, { nosave: true });

      //THEN
      expect(dispatchConfigEventMock).toHaveBeenCalledWith({
        key: "decimals",
        newValue: true,
        nosave: true,
        previousValue: false,
      });
    });

    it("triggers resize if property is set", () => {
      Config.setConfig("maxLineWidth", 50);
      expect(miscTriggerResizeMock).toHaveBeenCalled();
    });

    it("does not trigger resize if property is not set", () => {
      Config.setConfig("startGraphsAtZero", true);
      expect(miscTriggerResizeMock).not.toHaveBeenCalled();
    });

    it("does not trigger resize on nosave", () => {
      Config.setConfig("maxLineWidth", 50, { nosave: true });
      expect(miscTriggerResizeMock).not.toHaveBeenCalled();
    });
  });

  describe("apply", () => {
    it("should fill missing values with defaults", async () => {
      //GIVEN
      replaceConfig({ time: 8, decimals: false });
      await Lifecycle.applyConfig({
        addition: "100",
        negatives: false,
      });
      const config = getConfig();
      expect(config.addition).toBe("100");
      expect(config.negatives).toBe(false);
      // everything not in the partial comes back to the defaults
      expect(config.time).toBe(getDefaultConfig().time);
      expect(config.decimals).toBe(getDefaultConfig().decimals);
    });

    describe("should reset to default if setting failed", () => {
      const testCases: {
        display: string;
        value: Partial<ConfigType>;
        expected: Partial<ConfigType>;
      }[] = [
        {
          display: "invalid enum value",
          value: { division: "free" as never },
          expected: { division: getDefaultConfig().division },
        },
        {
          display: "sanitizes config, removes extra keys",
          value: {
            time: 2,
            unknownKey: true,
            unknownArray: [1, 2],
          } as never,
          expected: { time: 2 },
        },
        {
          display: "applies config migration",
          value: { time: 2, swapEscAndTab: true } as never,
          expected: { time: 2, quickRestart: "esc" },
        },
        {
          display: "SB-012 migration of a monkeytype seconds value",
          value: { time: 120 } as never,
          expected: { time: 2 },
        },
      ];

      it.each(testCases)("$display", async ({ value, expected }) => {
        await Lifecycle.applyConfig(value);

        const config = getConfig();
        const applied = Object.fromEntries(
          Object.entries(config).filter(([key]) =>
            Object.keys(expected).includes(key),
          ),
        );
        expect(applied).toEqual(expected);
      });
    });

    describe("SB-090 - applies the coupled keys last so a stored pair survives", () => {
      it("keeps fractionMultiplication on and turns multiplication back on", async () => {
        // A stored config that is illegal on its face: the whole-config path
        // has no `changedKey`, so SB-090 wins and multiplication comes back at
        // "100" rather than the user's intent being cleared.
        await Lifecycle.applyConfig({
          ...getDefaultConfig(),
          multiplication: "off",
          fractionMultiplication: true,
        });
        const config = getConfig();
        expect(config.fractionMultiplication).toBe(true);
        expect(config.multiplication).toBe("100");
      });

      it("leaves a legal pair untouched", async () => {
        await Lifecycle.applyConfig({
          ...getDefaultConfig(),
          multiplication: "20",
          fractionMultiplication: true,
        });
        const config = getConfig();
        expect(config.multiplication).toBe("20");
        expect(config.fractionMultiplication).toBe(true);
      });
    });

    it("SB-104 - repairs a config that arrives with every generator off", async () => {
      await Lifecycle.applyConfig({
        ...getDefaultConfig(),
        addition: "off",
        multiplication: "off",
        division: "off",
        fractionAddition: "off",
        fractionMultiplication: false,
      });
      const config = getConfig();
      expect(config.addition).toBe("1000");
      expect(config.multiplication).toBe("off");
      expect(config.division).toBe("off");
      expect(config.fractionAddition).toBe("off");
      expect(config.fractionMultiplication).toBe(false);
    });

    it("should apply a partial config but keep the rest unchanged", async () => {
      replaceConfig({ negatives: false });
      await Lifecycle.applyConfig({
        ...ConfigUtils.getConfigChanges(),
        decimals: false,
      });
      const config = getConfig();
      expect(config.negatives).toBe(false);
      expect(config.decimals).toBe(false);
    });
  });

  describe("SB-157 - restoreDefaultTestSettings", () => {
    const restartSpy = vi.spyOn(restartTestEvent, "dispatch");

    beforeEach(() => {
      restartSpy.mockClear();
      replaceConfig({});
    });

    afterAll(() => {
      restartSpy.mockRestore();
    });

    it("puts all eight settings-bar keys back to the SB-110 defaults", async () => {
      replaceConfig({
        addition: "100",
        multiplication: "12",
        division: "off",
        fractionAddition: "12",
        fractionMultiplication: false,
        decimals: false,
        negatives: false,
        time: 8,
      });

      await Lifecycle.restoreDefaultTestSettings();

      const defaults = getDefaultConfig();
      const config = getConfig();
      for (const key of [
        "addition",
        "multiplication",
        "division",
        "fractionAddition",
        "fractionMultiplication",
        "decimals",
        "negatives",
        "time",
      ] as const) {
        expect(config[key], key).toEqual(defaults[key]);
      }
    });

    it("SB-054/SB-181 - restarts the test", async () => {
      replaceConfig({ addition: "100", time: 8 });

      await Lifecycle.restoreDefaultTestSettings();

      expect(restartSpy).toHaveBeenCalled();
    });

    it("leaves the appearance and behaviour keys alone", async () => {
      replaceConfig({
        addition: "100",
        theme: "nord",
        fontSize: 3,
        timerStyle: "text",
        quickRestart: "esc",
      });

      await Lifecycle.restoreDefaultTestSettings();

      const config = getConfig();
      expect(config.theme).toEqual("nord");
      expect(config.fontSize).toEqual(3);
      expect(config.timerStyle).toEqual("text");
      expect(config.quickRestart).toEqual("esc");
    });
  });
});
