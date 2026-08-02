import { describe, it, expect } from "vitest";
import * as Strings from "../../src/ts/utils/strings";

/**
 * `strings.ts` was reduced to its generic core (INV-118c): the prose input
 * pipeline it mostly served — RTL detection, glyph equivalence, space
 * classification, `countChars`, the language catalogue helpers — is gone with
 * the features that needed it, and so are the suites that covered them. What is
 * left is exercised here.
 */
describe("string utils", () => {
  describe("replaceSpecialChars", () => {
    it("strips combining accents", () => {
      expect(Strings.replaceSpecialChars("café")).toBe("cafe");
      expect(Strings.replaceSpecialChars("Ünïcôdé")).toBe("Unicode");
    });
    it("leaves unaccented input alone", () => {
      expect(Strings.replaceSpecialChars("serika dark")).toBe("serika dark");
    });
    it("handles the empty string", () => {
      expect(Strings.replaceSpecialChars("")).toBe("");
    });
  });

  describe("capitalizeEachSegment", () => {
    it("capitalizes every space-separated segment", () => {
      expect(Strings.capitalizeEachSegment("account settings")).toBe(
        "Account Settings",
      );
    });
    it("handles a single segment", () => {
      expect(Strings.capitalizeEachSegment("about")).toBe("About");
    });
    it("collapses runs of spaces", () => {
      expect(Strings.capitalizeEachSegment("a  b")).toBe("A B");
    });
    it("handles the empty string", () => {
      expect(Strings.capitalizeEachSegment("")).toBe("");
    });
  });

  describe("capitalizeFirstLetter", () => {
    it("capitalizes only the first letter", () => {
      expect(Strings.capitalizeFirstLetter("croco calc")).toBe("Croco calc");
    });
    it("handles the empty string", () => {
      expect(Strings.capitalizeFirstLetter("")).toBe("");
    });
  });

  describe("normalizeName", () => {
    it("trims the edges", () => {
      expect(Strings.normalizeName("  my theme  ")).toBe("my_theme");
    });
    it("collapses inner whitespace runs to a single underscore", () => {
      expect(Strings.normalizeName("my   nice\ttheme")).toBe("my_nice_theme");
    });
    it("leaves an already-normalized name unchanged", () => {
      expect(Strings.normalizeName("serika_dark")).toBe("serika_dark");
    });
  });

  describe("underscore/space round trip", () => {
    it("replaces underscores with spaces (CP-168)", () => {
      expect(Strings.replaceUnderscoresWithSpaces("serika_dark")).toBe(
        "serika dark",
      );
    });
    it("replaces spaces with underscores", () => {
      expect(Strings.replaceSpacesWithUnderscores("serika dark")).toBe(
        "serika_dark",
      );
    });
    it("round trips", () => {
      const name = "botanical_lofi";
      expect(
        Strings.replaceSpacesWithUnderscores(
          Strings.replaceUnderscoresWithSpaces(name),
        ),
      ).toBe(name);
    });
  });

  describe("toHex", () => {
    it("encodes bytes as lowercase hex, zero padded", () => {
      const buffer = new Uint8Array([0x00, 0x0f, 0xa5, 0xff]).buffer;
      expect(Strings.toHex(buffer)).toBe("000fa5ff");
    });
    it("returns an empty string for an empty buffer", () => {
      expect(Strings.toHex(new Uint8Array([]).buffer)).toBe("");
    });
  });
});
