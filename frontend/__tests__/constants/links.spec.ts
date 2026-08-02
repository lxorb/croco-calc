import { describe, expect, it } from "vitest";

import {
  CONTACT_EMAIL,
  GITHUB_CONTRIBUTORS_URL,
  GITHUB_REPO_URL,
  SITE_DOMAIN,
  SUPPORT_EMAIL,
} from "../../src/ts/constants/links";

/**
 * CP-129 — the screenshot watermark reads croco calc's domain "sourced from the
 * same build-time constant used elsewhere so it never drifts". These cases pin
 * the derivation itself, not just today's value: re-hardcoding either address
 * would still pass an equality check but fails the `endsWith` ones below.
 */
describe("constants/links.ts", () => {
  it("should expose the bare hostname", () => {
    expect(SITE_DOMAIN).toEqual("crococalc.com");
    expect(SITE_DOMAIN).not.toContain("@");
    expect(SITE_DOMAIN).not.toContain("/");
  });

  it("should derive both addresses from SITE_DOMAIN", () => {
    expect(CONTACT_EMAIL).toEqual("contact@crococalc.com");
    expect(SUPPORT_EMAIL).toEqual("support@crococalc.com");

    expect(CONTACT_EMAIL.endsWith(`@${SITE_DOMAIN}`)).toBe(true);
    expect(SUPPORT_EMAIL.endsWith(`@${SITE_DOMAIN}`)).toBe(true);
  });

  it("should derive the contributors link from the repo url", () => {
    expect(GITHUB_CONTRIBUTORS_URL.startsWith(`${GITHUB_REPO_URL}/`)).toBe(
      true,
    );
  });

  it("should not name the upstream project anywhere", () => {
    for (const value of [
      SITE_DOMAIN,
      CONTACT_EMAIL,
      SUPPORT_EMAIL,
      GITHUB_REPO_URL,
      GITHUB_CONTRIBUTORS_URL,
    ]) {
      expect(value.toLowerCase()).not.toContain("monkeytype");
    }
  });
});
