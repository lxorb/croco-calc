import { createRoot } from "solid-js";

import { Icon } from "../components/common/Icon";

/**
 * Iconify markup as an HTML **string**, for the handful of places that build
 * their DOM by string concatenation rather than as Solid components (the
 * command palette's suggestion list, the input-field status indicator).
 *
 * DoD-12 forbids a single font awesome class string in `frontend/src`, and
 * `styles/fontawesome-5.scss` is deleted (INV-116), so a legacy `<i class="fas
 * …">` renders nothing at all — not a fallback glyph, nothing. Everything that
 * used to emit one now comes through here.
 *
 * The generated icon bundle is owned by `components/common/Icon.tsx` alone
 * (WP-04, C10), so this renders that component once per id in a detached
 * reactive root and caches the resulting `outerHTML` rather than duplicating
 * any geometry.
 *
 * The read happens **after** `createRoot` returns: Solid flushes the effect
 * queue in `completeUpdates` before handing control back, and it is that effect
 * which writes the icon body into the `<svg>`. Reading inside the root callback
 * would therefore yield an empty element.
 */
const cache = new Map<string, string>();

export type IconHtmlOptions = {
  /** Pins the box to `1.25em`, replacing font awesome's fixed-width class. */
  fixedWidth?: boolean;
  /** Rotates continuously, replacing font awesome's spin class. */
  spin?: boolean;
  class?: string;
};

export function renderIconHtml(
  icon: string,
  options?: IconHtmlOptions,
): string {
  const cacheKey = `${icon}|${options?.fixedWidth ?? false}|${
    options?.spin ?? false
  }|${options?.class ?? ""}`;

  const cached = cache.get(cacheKey);
  if (cached !== undefined) return cached;

  let svg: SVGSVGElement | undefined;
  const dispose = createRoot((dispose) => {
    svg = Icon({
      icon,
      fixedWidth: options?.fixedWidth,
      spin: options?.spin,
      class: options?.class,
    }) as SVGSVGElement | undefined;
    return dispose;
  });

  const html = svg?.outerHTML ?? "";
  dispose();

  cache.set(cacheKey, html);
  return html;
}

export const __testing = { cache };
