import { describe, it, expect } from "vitest";
import { getDefaultConfig } from "../../src/ts/constants/default-config";
import { Formatting } from "../../src/ts/utils/format";
import { Config } from "@croco-calc/schemas/configs";

describe("format.ts", () => {
  /**
   * CP-142 — there is one speed unit, `tpm` (tasks per minute). The upstream
   * suite covered the wpm/cpm unit switch, which INV-118c deleted along with
   * `typing-speed-units.ts`; these cases carry the same behaviours over to the
   * one unit that remains.
   */
  describe("tpm", () => {
    it("should format with decimalPlaces from configuration", () => {
      const noDecimals = getInstance({ alwaysShowDecimalPlaces: false });
      expect(noDecimals.tpm(12.5)).toEqual("13");
      expect(noDecimals.tpm(0)).toEqual("0");

      const withDecimals = getInstance({ alwaysShowDecimalPlaces: true });
      expect(withDecimals.tpm(12.5)).toEqual("12.50");
      expect(withDecimals.tpm(0)).toEqual("0.00");
    });

    it("should format with fallback", () => {
      const format = getInstance();
      expect(format.tpm(null)).toEqual("-");
      expect(format.tpm(undefined)).toEqual("-");

      expect(format.tpm(null, { fallback: "none" })).toEqual("none");
      expect(format.tpm(null, { fallback: "" })).toEqual("");
      expect(format.tpm(undefined, { fallback: "none" })).toEqual("none");
      expect(format.tpm(undefined, { fallback: "" })).toEqual("");
      expect(format.tpm(undefined, { fallback: undefined })).toEqual("");
    });

    it("should format with decimals", () => {
      //force with decimals
      const noDecimals = getInstance({ alwaysShowDecimalPlaces: false });
      expect(noDecimals.tpm(100, { showDecimalPlaces: true })).toEqual(
        "100.00",
      );
      //force without decimals
      const withDecimals = getInstance({ alwaysShowDecimalPlaces: true });
      expect(withDecimals.tpm(100, { showDecimalPlaces: false })).toEqual(
        "100",
      );
    });

    it("should format with suffix", () => {
      const format = getInstance({ alwaysShowDecimalPlaces: false });
      expect(format.tpm(100, { suffix: " tpm" })).toEqual("100 tpm");
      expect(format.tpm(100, { suffix: undefined })).toEqual("100");
      expect(format.tpm(0, { suffix: " tpm" })).toEqual("0 tpm");
      expect(format.tpm(null, { suffix: " tpm" })).toEqual("-");
      expect(format.tpm(undefined, { suffix: " tpm" })).toEqual("-");
    });

    it("should format with rounding", () => {
      const format = getInstance({ alwaysShowDecimalPlaces: false });
      expect(format.tpm(80.25)).toEqual("80");
      expect(format.tpm(80.25, { rounding: Math.ceil })).toEqual("81");
      expect(format.tpm(80.75, { rounding: Math.floor })).toEqual("80");
    });
  });

  /**
   * ME-161 / master C33 — `score` is the one displayed value that can go
   * negative, and a negative one renders with U+2212 MINUS SIGN rather than the
   * U+002D HYPHEN-MINUS `Number.prototype.toString` produces.
   */
  describe("score", () => {
    it("should render a negative score with U+2212, not U+002D", () => {
      const format = getInstance();

      expect(format.score(-1)).toEqual("−1");
      expect(format.score(-42)).toEqual("−42");

      expect(format.score(-42)).not.toContain("-");
      expect(format.score(-42).codePointAt(0)).toEqual(0x2212);
    });

    it("should leave a non-negative score untouched", () => {
      const format = getInstance();

      expect(format.score(0)).toEqual("0");
      expect(format.score(42)).toEqual("42");
      expect(format.score(42)).not.toContain("−");
    });

    it("should ignore alwaysShowDecimalPlaces — the score is a whole number", () => {
      const withDecimals = getInstance({ alwaysShowDecimalPlaces: true });

      expect(withDecimals.score(42)).toEqual("42");
      expect(withDecimals.score(-42)).toEqual("−42");
    });

    it("should keep the fallback dash ASCII — it is not a minus sign", () => {
      const format = getInstance();

      expect(format.score(null)).toEqual("-");
      expect(format.score(undefined)).toEqual("-");
      expect(format.score(null, { fallback: "none" })).toEqual("none");
      expect(format.score(undefined, { fallback: "" })).toEqual("");
    });

    it("should only convert the sign, never a hyphen inside a suffix", () => {
      const format = getInstance();

      expect(format.score(-5, { suffix: " pts-total" })).toEqual(
        "−5 pts-total",
      );
      expect(format.score(5, { suffix: " pts-total" })).toEqual("5 pts-total");
    });
  });

  describe("percentage", () => {
    it("should format with decimalPlaces from configuration", () => {
      //no decimals
      const noDecimals = getInstance({ alwaysShowDecimalPlaces: false });
      expect(noDecimals.percentage(12.5)).toEqual("13%");
      expect(noDecimals.percentage(0)).toEqual("0%");

      //with decimals
      const withDecimals = getInstance({ alwaysShowDecimalPlaces: true });
      expect(withDecimals.percentage(12.5)).toEqual("12.50%");
      expect(withDecimals.percentage(0)).toEqual("0.00%");
    });

    it("should format with fallback", () => {
      //default fallback
      const format = getInstance();
      expect(format.percentage(null)).toEqual("-");
      expect(format.percentage(undefined)).toEqual("-");

      //provided fallback
      expect(format.percentage(null, { fallback: "none" })).toEqual("none");
      expect(format.percentage(null, { fallback: "" })).toEqual("");
      expect(format.percentage(undefined, { fallback: "none" })).toEqual(
        "none",
      );

      expect(format.percentage(undefined, { fallback: "" })).toEqual("");
      expect(format.percentage(undefined, { fallback: undefined })).toEqual("");
    });

    it("should format with decimals", () => {
      //force with decimals
      const noDecimals = getInstance({ alwaysShowDecimalPlaces: false });
      expect(noDecimals.percentage(100, { showDecimalPlaces: true })).toEqual(
        "100.00%",
      );
      //force without decimals
      const withDecimals = getInstance({ alwaysShowDecimalPlaces: true });
      expect(
        withDecimals.percentage(100, { showDecimalPlaces: false }),
      ).toEqual("100%");
    });

    it("should format with suffix", () => {
      const format = getInstance({ alwaysShowDecimalPlaces: false });
      expect(format.percentage(100, { suffix: " raw" })).toEqual("100% raw");
      expect(format.percentage(100, { suffix: undefined })).toEqual("100%");
      expect(format.percentage(0, { suffix: " raw" })).toEqual("0% raw");
      expect(format.percentage(null, { suffix: " raw" })).toEqual("-");
      expect(format.percentage(undefined, { suffix: " raw" })).toEqual("-");
    });

    it("should format with rounding", () => {
      const format = getInstance({ alwaysShowDecimalPlaces: false });
      expect(format.percentage(80.25)).toEqual("80%");
      expect(format.percentage(80.25, { rounding: Math.ceil })).toEqual("81%");
      expect(format.percentage(80.75, { rounding: Math.floor })).toEqual("80%");
    });
  });

  describe("accuracy", () => {
    it("should floor decimals by default", () => {
      //no decimals
      const noDecimals = getInstance({ alwaysShowDecimalPlaces: false });
      expect(noDecimals.accuracy(12.75)).toEqual("12%");
      //with decimals
      const withDecimals = getInstance({ alwaysShowDecimalPlaces: true });
      expect(withDecimals.accuracy(12.75)).toEqual("12.75%");
    });

    it("should format with rounding", () => {
      const format = getInstance({ alwaysShowDecimalPlaces: false });
      expect(format.accuracy(80.5)).toEqual("80%");
      expect(format.accuracy(80.25, { rounding: Math.ceil })).toEqual("81%");
      expect(format.accuracy(80.75, { rounding: Math.floor })).toEqual("80%");
    });
  });

  describe("decimals", () => {
    it("should format with decimalPlaces from configuration", () => {
      //no decimals
      const noDecimals = getInstance({ alwaysShowDecimalPlaces: false });
      expect(noDecimals.decimals(12.5)).toEqual("13");
      expect(noDecimals.decimals(0)).toEqual("0");

      //with decimals
      const withDecimals = getInstance({ alwaysShowDecimalPlaces: true });
      expect(withDecimals.decimals(12.5)).toEqual("12.50");
      expect(withDecimals.decimals(0)).toEqual("0.00");
    });

    it("should format with fallback", () => {
      //default fallback
      const format = getInstance();
      expect(format.decimals(null)).toEqual("-");
      expect(format.decimals(undefined)).toEqual("-");

      //provided fallback
      expect(format.decimals(null, { fallback: "none" })).toEqual("none");
      expect(format.decimals(null, { fallback: "" })).toEqual("");
      expect(format.decimals(undefined, { fallback: "none" })).toEqual("none");

      expect(format.decimals(undefined, { fallback: "" })).toEqual("");
      expect(format.decimals(undefined, { fallback: undefined })).toEqual("");
    });

    it("should format with decimals", () => {
      //force with decimals
      const noDecimals = getInstance({ alwaysShowDecimalPlaces: false });
      expect(noDecimals.decimals(100, { showDecimalPlaces: true })).toEqual(
        "100.00",
      );
      //force without decimals
      const withDecimals = getInstance({ alwaysShowDecimalPlaces: true });
      expect(withDecimals.decimals(100, { showDecimalPlaces: false })).toEqual(
        "100",
      );
    });

    it("should format with suffix", () => {
      const format = getInstance({ alwaysShowDecimalPlaces: false });
      expect(format.decimals(100, { suffix: " raw" })).toEqual("100 raw");
      expect(format.decimals(100, { suffix: undefined })).toEqual("100");
      expect(format.decimals(0, { suffix: " raw" })).toEqual("0 raw");
      expect(format.decimals(null, { suffix: " raw" })).toEqual("-");
      expect(format.decimals(undefined, { suffix: " raw" })).toEqual("-");
    });

    it("should format with rounding", () => {
      const format = getInstance({ alwaysShowDecimalPlaces: false });
      expect(format.decimals(80.25)).toEqual("80");
      expect(format.decimals(80.25, { rounding: Math.ceil })).toEqual("81");
      expect(format.decimals(80.75, { rounding: Math.floor })).toEqual("80");
    });
  });

  describe("rank", () => {
    it("should format with default fallback", () => {
      const format = getInstance();
      expect(format.rank(1)).toEqual("1st");
      expect(format.rank(2)).toEqual("2nd");
      expect(format.rank(3)).toEqual("3rd");
      expect(format.rank(4)).toEqual("4th");

      expect(format.rank(11)).toEqual("11th");
      expect(format.rank(12)).toEqual("12th");
      expect(format.rank(13)).toEqual("13th");
      expect(format.rank(14)).toEqual("14th");

      expect(format.rank(21)).toEqual("21st");
      expect(format.rank(22)).toEqual("22nd");
      expect(format.rank(23)).toEqual("23rd");
      expect(format.rank(24)).toEqual("24th");
    });

    it("should format with fallback", () => {
      const format = getInstance();

      expect(format.rank(0)).toEqual("0th");
      expect(format.rank(null)).toEqual("-");
      expect(format.rank(undefined)).toEqual("-");

      expect(format.rank(0, {})).toEqual("0th");
      expect(format.rank(null, {})).toEqual("-");
      expect(format.rank(undefined, {})).toEqual("-");

      expect(format.rank(0, { fallback: "none" })).toEqual("0th");
      expect(format.rank(null, { fallback: "none" })).toEqual("none");
      expect(format.rank(undefined, { fallback: "none" })).toEqual("none");

      expect(format.rank(0, { fallback: "" })).toEqual("0th");
      expect(format.rank(null, { fallback: "" })).toEqual("");
      expect(format.rank(undefined, { fallback: "" })).toEqual("");
    });
  });
});

function getInstance(config?: Partial<Config>): Formatting {
  const target: Config = { ...getDefaultConfig(), ...config };
  return new Formatting(target);
}
