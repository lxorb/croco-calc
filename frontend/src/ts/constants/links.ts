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
 *
 * `DEFERRED_FEATURES` at the bottom of this file is the exception to that: the
 * entry points it lists are hidden entirely rather than shipped disabled.
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

/**
 * The upstream project croco calc is adapted from (CP-147). Linked from the
 * about-page credits, the about-page hero and the footer credit line. GPL-3.0
 * attribution depends on this staying reachable — do not drop the links.
 */
export const MONKEYTYPE_REPO_URL =
  "https://github.com/monkeytypegame/monkeytype";

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

/**
 * Entry points that are hidden outright rather than shipped disabled.
 *
 * D4 used to render these as a disabled `Button` behind a `coming soon`
 * `Balloon`. Advertising a control for something that does not exist reads as
 * clutter, so for the four features below the control is not rendered at all.
 * Everything behind each flag is still in the tree, wrapped in a `<Show>` — set
 * a flag back to `true` and its entry points come back with no other edit:
 *
 * - `support`   — footer `support` button, about-page support section, and the
 *                 mounting of `SupportModal` in `modals/Modals.tsx`. The modal
 *                 component itself is untouched, so it only needs remounting.
 * - `discord`   — footer `discord` button and the about-page contact-grid
 *                 button. Both still read `SOCIAL_LINKS.discord`, so a live
 *                 invite additionally has to be filled in there. Re-enabling
 *                 also wants the contact grid's `lg:grid-cols-3` back
 *                 (`AboutPage.tsx`), which was dropped for the two-item layout.
 * - `supporters`  — about-page `top supporters` section plus the credits entry
 *                 that anchors at it (`#supporters_title`).
 * - `contributors` — about-page `contributors` section (`#contributors_title`).
 *
 * `static/supporters.json` and `static/contributors.json` stay on disk as empty
 * arrays and the queries behind them are untouched.
 */
export const DEFERRED_FEATURES: {
  support: boolean;
  discord: boolean;
  supporters: boolean;
  contributors: boolean;
} = {
  support: false,
  discord: false,
  supporters: false,
  contributors: false,
};
