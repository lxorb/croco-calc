import { describe, it, expect } from "vitest";
import { cacheControlFor } from "../../worker/index";

const IMMUTABLE = "public, max-age=31536000, immutable";
const LONG_LIVED = "public, max-age=31536000";
const THEMES = "public, max-age=3600";
const NO_STORE = "no-cache, no-store, must-revalidate";

/**
 * INF-020 is a table, so this is a table test. The live defect it guards
 * against was `no-store` leaking onto hashed assets, which is why every case
 * asserts the WHOLE header value and not a substring — the broken production
 * value contained `immutable` too.
 */
describe("INF-020 cache policy", () => {
  it.each([
    ["/js/index.NvXpMG3y.js", IMMUTABLE],
    ["/js/app-utils.BeWJO9Lm.js", IMMUTABLE],
    ["/css/style.abc123.css", IMMUTABLE],
    ["/webfonts/Lexend-abc123.woff2", IMMUTABLE],
    ["/images/mtsocial.png", LONG_LIVED],
    ["/sounds/click1.wav", LONG_LIVED],
    ["/themes/serika_dark.css", THEMES],
    ["/", NO_STORE],
    ["/index.html", NO_STORE],
    ["/version.json", NO_STORE],
    ["/manifest.json", NO_STORE],
    ["/sw.js", NO_STORE],
    ["/service-worker.js", NO_STORE],
  ])("%s -> %s", (pathname, expected) => {
    expect(cacheControlFor(pathname)).toBe(expected);
  });

  it.each([
    "/account",
    "/leaderboards",
    "/login",
    "/settings",
    "/about",
    "/privacy-policy",
    "/email-handler",
    "/webfonts-preview/Lexend.png",
    "/robots.txt",
  ])("catch-all keeps %s uncached", (pathname) => {
    expect(cacheControlFor(pathname)).toBe(NO_STORE);
  });

  it("never lets no-store reach a hashed asset (the production defect)", () => {
    for (const p of ["/js/a.hash.js", "/css/a.hash.css", "/webfonts/a.woff2"]) {
      expect(cacheControlFor(p)).not.toContain("no-store");
    }
  });

  it("serves the shell uncached so it can never pin a client to dead hashes", () => {
    expect(cacheControlFor("/")).not.toContain("max-age=31536000");
  });
});
