/**
 * The croco calc frontend Worker (INF-022 fallback).
 *
 * INF-020 fixes an exact `Cache-Control` per path prefix and INF-022 states the
 * policy is non-negotiable. `_headers` alone cannot express it: Cloudflare
 * **appends** the values of every matching rule rather than letting the more
 * specific one win, so the `/*` catch-all and the `/js/*` rule combined into
 *
 *     Cache-Control: no-cache, no-store, must-revalidate, public, max-age=31536000, immutable
 *
 * on production. `no-store` wins per RFC 9111, so every content-hashed asset was
 * refetched on every navigation and the year-long immutable caching did nothing.
 * Reordering the file does not help — the concatenation is by file order, not by
 * specificity, so `no-store` is in the list either way.
 *
 * INF-022 prescribes this fallback verbatim: a minimal Worker with an `assets`
 * binding that sets the headers in `fetch()`. `Headers.set` replaces, so the
 * value below is the whole value regardless of what the asset server attached.
 *
 * `Cache-Control` is therefore owned **here** and deliberately absent from
 * `frontend/static/_headers`, which keeps only the INF-021 security headers.
 * Those are single-valued and never conflict, so appending is harmless for them.
 */

/** The static-asset binding declared in `wrangler.jsonc`. */
type AssetsBinding = { fetch: (request: Request) => Promise<Response> };
type Env = { ASSETS: AssetsBinding };

const IMMUTABLE = "public, max-age=31536000, immutable";
const LONG_LIVED = "public, max-age=31536000";
const THEMES = "public, max-age=3600";
const NO_STORE = "no-cache, no-store, must-revalidate";

/**
 * Content-hashed output. The filename changes whenever the bytes change, so a
 * client may keep these for a year without ever going stale.
 */
const IMMUTABLE_PREFIXES = ["/js/", "/css/", "/webfonts/"];

/** Not content-hashed, but effectively immutable in practice. */
const LONG_LIVED_PREFIXES = ["/images/", "/sounds/"];

/**
 * Never cached. A stale shell pins a client to asset hashes that no longer
 * exist, which is an unrecoverable white page until the user hard-reloads;
 * `version.json` and the service workers gate their own update checks.
 */
const NO_STORE_PATHS = new Set([
  "/",
  "/index.html",
  "/version.json",
  "/manifest.json",
  "/sw.js",
  "/service-worker.js",
]);

/**
 * The INF-020 table, as a pure function so it can be unit-tested without
 * workerd — which matters because workerd has no build for every dev machine.
 * @param pathname URL pathname of the request.
 * @returns The `Cache-Control` value that path must be served with.
 */
export function cacheControlFor(pathname: string): string {
  if (NO_STORE_PATHS.has(pathname)) return NO_STORE;
  if (IMMUTABLE_PREFIXES.some((p) => pathname.startsWith(p))) return IMMUTABLE;
  if (LONG_LIVED_PREFIXES.some((p) => pathname.startsWith(p))) {
    return LONG_LIVED;
  }
  if (pathname.startsWith("/themes/")) return THEMES;
  // The `/*` catch-all. Every SPA route (/account, /leaderboards, …) lands here
  // via not_found_handling, and each one serves the shell, so the shell rule has
  // to be the default rather than an enumeration of known routes.
  return NO_STORE;
}

/** Statuses whose response must have a null body (RFC 9110). */
const NULL_BODY_STATUSES = new Set([101, 204, 205, 304]);

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const response = await env.ASSETS.fetch(request);

    try {
      const { pathname } = new URL(request.url);
      const body = NULL_BODY_STATUSES.has(response.status)
        ? null
        : response.body;
      const rewritten = new Response(body, response);
      rewritten.headers.set("Cache-Control", cacheControlFor(pathname));
      return rewritten;
    } catch {
      // Serving the asset with the wrong cache header beats serving a 500. The
      // policy is important; the site being up is more important.
      return response;
    }
  },
};
