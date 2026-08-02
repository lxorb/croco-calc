import { describe, it, expect, beforeEach, vi } from "vitest";
import { Config as ConfigType } from "@croco-calc/schemas/configs";
import { compressToURI } from "lz-ts";
import * as UpdateConfig from "../../src/ts/config/setters";
import * as Notifications from "../../src/ts/states/notifications";
import * as TestLogic from "../../src/ts/test/test-logic";
import * as Misc from "../../src/ts/utils/misc";
import { Config } from "../../src/ts/config/store";
import { __testing } from "../../src/ts/config/testing";
import { SHARED_SETTINGS_ORDER } from "../../src/ts/components/modals/ShareTestSettings";
import { loadTestSettingsFromUrl } from "../../src/ts/controllers/url-handler";

//mock modules to avoid dependencies
vi.mock("../../src/ts/test/test-logic", () => ({
  restart: vi.fn(),
}));

type SharedKey = (typeof SHARED_SETTINGS_ORDER)[number];

/**
 * SB-193 / SB-194 — the `?testSettings=` URL.
 *
 * Rewritten for croco calc: monkeytype encoded
 * `[mode, mode2, customText, punctuation, numbers, language, difficulty,
 * funbox]`; croco calc encodes the eight settings-bar keys in
 * `SHARED_SETTINGS_ORDER`. The parameter name and the `lz-ts` `compressToURI`
 * encoding are unchanged, so the shape of these tests is monkeytype's.
 */
const urlData = (data: Partial<Pick<ConfigType, SharedKey>>): string =>
  compressToURI(
    JSON.stringify(SHARED_SETTINGS_ORDER.map((key) => data[key] ?? null)),
  );

describe("url-handler", () => {
  describe("loadTestSettingsFromUrl", () => {
    const findGetParameterMock = vi.spyOn(Misc, "findGetParameter");

    const setConfigMock = vi.spyOn(UpdateConfig, "setConfig");
    const restartTestMock = vi.spyOn(TestLogic, "restart");
    const notifySuccessMock = vi.spyOn(
      Notifications,
      "showSuccessNotification",
    );
    const notifyMock = vi.spyOn(Notifications, "showNoticeNotification");

    beforeEach(() => {
      [
        setConfigMock,
        findGetParameterMock,
        restartTestMock,
        notifySuccessMock,
        notifyMock,
      ].forEach((it) => it.mockClear());

      findGetParameterMock.mockImplementation((override) => override);
      __testing.replaceConfig({});
    });

    it("SB-193 - the wire format is the eight settings-bar keys, in bar order", () => {
      expect([...SHARED_SETTINGS_ORDER]).toEqual([
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

    it("does nothing without the parameter", () => {
      //GIVEN
      findGetParameterMock.mockReturnValue(null);

      //WHEN
      loadTestSettingsFromUrl("");

      //THEN
      expect(setConfigMock).not.toHaveBeenCalled();
      expect(restartTestMock).not.toHaveBeenCalled();
    });

    it("handles an all-null tuple", () => {
      //GIVEN
      findGetParameterMock.mockReturnValue(urlData({}));

      //WHEN
      loadTestSettingsFromUrl("");

      //THEN — nothing applied, but the test is still restarted
      expect(setConfigMock).not.toHaveBeenCalled();
      expect(restartTestMock).toHaveBeenCalled();
      expect(notifySuccessMock).not.toHaveBeenCalled();
    });

    it("sets addition", () => {
      findGetParameterMock.mockReturnValue(urlData({ addition: "100" }));

      loadTestSettingsFromUrl("");

      expect(setConfigMock).toHaveBeenCalledWith("addition", "100", {
        nosave: true,
      });
      expect(Config.addition).toBe("100");
      expect(restartTestMock).toHaveBeenCalled();
    });

    it("sets multiplication", () => {
      findGetParameterMock.mockReturnValue(urlData({ multiplication: "20" }));

      loadTestSettingsFromUrl("");

      expect(setConfigMock).toHaveBeenCalledWith("multiplication", "20", {
        nosave: true,
      });
      expect(Config.multiplication).toBe("20");
    });

    it("sets division", () => {
      findGetParameterMock.mockReturnValue(urlData({ division: "tables" }));

      loadTestSettingsFromUrl("");

      expect(setConfigMock).toHaveBeenCalledWith("division", "tables", {
        nosave: true,
      });
      expect(Config.division).toBe("tables");
    });

    it("sets fractionAddition", () => {
      findGetParameterMock.mockReturnValue(urlData({ fractionAddition: "12" }));

      loadTestSettingsFromUrl("");

      expect(setConfigMock).toHaveBeenCalledWith("fractionAddition", "12", {
        nosave: true,
      });
      expect(Config.fractionAddition).toBe("12");
    });

    it("sets the boolean controls, including `false`", () => {
      findGetParameterMock.mockReturnValue(
        urlData({
          fractionMultiplication: true,
          decimals: false,
          negatives: false,
        }),
      );

      loadTestSettingsFromUrl("");

      expect(setConfigMock).toHaveBeenCalledWith(
        "fractionMultiplication",
        true,
        { nosave: true },
      );
      expect(setConfigMock).toHaveBeenCalledWith("decimals", false, {
        nosave: true,
      });
      expect(setConfigMock).toHaveBeenCalledWith("negatives", false, {
        nosave: true,
      });
      expect(Config.fractionMultiplication).toBe(true);
      expect(Config.decimals).toBe(false);
      expect(Config.negatives).toBe(false);
    });

    it("sets time", () => {
      findGetParameterMock.mockReturnValue(urlData({ time: 8 }));

      loadTestSettingsFromUrl("");

      expect(setConfigMock).toHaveBeenCalledWith("time", 8, { nosave: true });
      expect(Config.time).toBe(8);
    });

    it("leaves an unticked (null) slot at the recipient's own value", () => {
      //GIVEN the recipient is on addition="100", and the sharer unticked it
      __testing.replaceConfig({ addition: "100" });
      findGetParameterMock.mockReturnValue(urlData({ time: 4 }));

      //WHEN
      loadTestSettingsFromUrl("");

      //THEN
      expect(setConfigMock).not.toHaveBeenCalledWith(
        "addition",
        expect.anything(),
        expect.anything(),
      );
      expect(Config.addition).toBe("100");
      expect(Config.time).toBe(4);
    });

    it("SB-194 - the SB-090 coupling still fires", () => {
      //GIVEN a URL that turns fraction multiplication on while multiplication
      //is off — illegal, and repaired by the cascade rather than let through
      __testing.replaceConfig({ multiplication: "off", addition: "1000" });
      findGetParameterMock.mockReturnValue(
        urlData({ fractionMultiplication: true }),
      );

      //WHEN
      loadTestSettingsFromUrl("");

      //THEN
      expect(Config.fractionMultiplication).toBe(true);
      expect(Config.multiplication).toBe("100");
    });

    it("SB-194 - the SB-215 all-off guard still blocks", () => {
      //GIVEN addition is the only enabled generator
      __testing.replaceConfig({
        addition: "1000",
        multiplication: "off",
        division: "off",
        fractionAddition: "off",
        fractionMultiplication: false,
      });
      findGetParameterMock.mockReturnValue(urlData({ addition: "off" }));

      //WHEN
      loadTestSettingsFromUrl("");

      //THEN — rejected, and not reported as applied
      expect(Config.addition).toBe("1000");
      expect(notifySuccessMock).not.toHaveBeenCalled();
    });

    it("adds a notification listing the applied settings", () => {
      findGetParameterMock.mockReturnValue(
        urlData({
          addition: "100",
          multiplication: "20",
          division: "tables",
          fractionAddition: "12",
          fractionMultiplication: true,
          decimals: false,
          negatives: false,
          time: 8,
        }),
      );

      loadTestSettingsFromUrl("");

      expect(notifySuccessMock).toHaveBeenCalledWith(expect.anything(), {
        durationMs: 10000,
        useInnerHtml: true,
      });
      const message = notifySuccessMock.mock.calls[0]?.[0] as string;
      // the bar labels, not the raw stored literals (SB-022)
      expect(message).toContain("addition: +100");
      expect(message).toContain("multiplication: 20x20");
      expect(message).toContain("time: 8");
    });

    it("rejects out-of-domain values before they reach setConfig", () => {
      //GIVEN a hand-edited URL
      findGetParameterMock.mockReturnValue(
        compressToURI(
          JSON.stringify([
            "9999",
            "off",
            "free",
            "off",
            false,
            true,
            true,
            999,
          ]),
        ),
      );

      //WHEN
      loadTestSettingsFromUrl("");

      //THEN
      expect(setConfigMock).not.toHaveBeenCalled();
      expect(notifyMock).toHaveBeenCalledWith(
        expect.stringContaining("Failed to load test settings from URL:"),
      );
    });

    it("rejects a tuple of the wrong length", () => {
      findGetParameterMock.mockReturnValue(
        compressToURI(JSON.stringify(["100", "20", "tables"])),
      );

      loadTestSettingsFromUrl("");

      expect(setConfigMock).not.toHaveBeenCalled();
      expect(notifyMock).toHaveBeenCalledWith(
        expect.stringContaining("Failed to load test settings from URL:"),
      );
    });

    it("rejects an undecodable parameter", () => {
      findGetParameterMock.mockReturnValue("not-compressed-at-all");

      loadTestSettingsFromUrl("");

      expect(setConfigMock).not.toHaveBeenCalled();
      expect(notifyMock).toHaveBeenCalledWith(
        expect.stringContaining("Failed to load test settings from URL:"),
      );
    });
  });
});
