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

/** CP-156 — the address the contact modal and the about page write to. */
export const CONTACT_EMAIL = "contact@crococalc.com";

/**
 * The address used for the bug and account subjects of the contact modal
 * (CP-155). Kept separate from `CONTACT_EMAIL` so support traffic can be
 * routed independently.
 */
export const SUPPORT_EMAIL = "support@crococalc.com";

/** The public repository, linked from the footer, the about page and credits. */
export const GITHUB_REPO_URL = "https://github.com/lxorb/croco-calc";

/** Where CP-147's contributor link points. */
export const GITHUB_CONTRIBUTORS_URL = `${GITHUB_REPO_URL}/graphs/contributors`;

/**
 * The upstream project croco calc is adapted from. CP-147 makes this credit
 * mandatory — it is the one place in `frontend/src` where the DoD-07 vocabulary
 * grep is allowed to match, and it may not be removed.
 */
export const UPSTREAM_REPO_URL = "https://github.com/monkeytypegame/monkeytype";

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
