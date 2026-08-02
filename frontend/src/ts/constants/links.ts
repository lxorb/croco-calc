/**
 * Every outbound address croco calc's shell, about page and modals link to,
 * in one place.
 *
 * CP-017 (footer discord), CP-146 (about-page contact grid), CP-156 (one
 * contact address, not six inlined copies) and CP-162 (`SUPPORT_LINKS`) all
 * require the target to come from a single build-time constant so that a link
 * can be turned on later by editing one line. Anything that is not live yet is
 * `null`, and every consumer renders a disabled control with a
 * `coming soon` tooltip instead of pointing at a dead address.
 */

/** Tooltip shown on every control whose target is still `null`. */
export const COMING_SOON_TOOLTIP = "coming soon";

/**
 * CP-129 — the bare hostname, and the single build-time constant every other
 * name here is built from, so none of them can drift apart.
 *
 * The screenshot watermark reads this. `src/html/head.html` carries the same
 * host in its `og:url`, `preconnect` and social-image tags; TypeScript cannot
 * read HTML, so that file is the one place the literal is written twice and
 * DoD's `head.html` assertion is what keeps the two in step.
 */
export const SITE_DOMAIN = "crococalc.com";

/** CP-156 — the address the contact modal and the about page write to. */
export const CONTACT_EMAIL = `contact@${SITE_DOMAIN}`;

/**
 * The second address decision D2 provisions. Deliberately **not** used by the
 * contact modal: CP-155 requires all six of its buttons to `mailto:` the one
 * `CONTACT_EMAIL`, so support routing has to happen on the mailbox side (an
 * alias or a filter on the `[Bug] ` / `[Account] ` subject prefixes) rather
 * than in the markup.
 */
export const SUPPORT_EMAIL = `support@${SITE_DOMAIN}`;

/** The public repository, linked from the footer, the about page and credits. */
export const GITHUB_REPO_URL = "https://github.com/lxorb/croco-calc";

/** Where CP-147's contributor link points. */
export const GITHUB_CONTRIBUTORS_URL = `${GITHUB_REPO_URL}/graphs/contributors`;

/**
 * The public status page, read by the outage/maintenance banners in
 * `elements/psa.tsx`.
 *
 * `null` until one is provisioned. While it is `null` the banners still fire on
 * a 503 or a failed request — they just say so in prose instead of linking to a
 * page that does not exist, and the summary fetch is skipped entirely so a dead
 * host cannot slow the boot path down.
 *
 * The upstream site used an Instatus page; the summary endpoint this expects is
 * `${STATUS_PAGE_URL}/summary.json`, so any Instatus-compatible host drops in.
 */
export const STATUS_PAGE_URL: string | null = null;

/**
 * CP-017 — social targets. `discord` is `null` until a server exists, at which
 * point the footer and about-page buttons light up with no other change.
 */
export const SOCIAL_LINKS: {
  discord: string | null;
  github: string;
} = {
  discord: null,
  github: GITHUB_REPO_URL,
};

/**
 * CP-162 — the three support targets. `ads` is a flag rather than a URL
 * because the reference opens a command-palette subgroup rather than a link;
 * that subgroup does not exist while ads are deferred (CP-163), so the button
 * ships disabled.
 */
export const SUPPORT_LINKS: {
  ads: boolean;
  kofi: string | null;
  patreon: string | null;
} = {
  ads: false,
  kofi: null,
  patreon: null,
};
