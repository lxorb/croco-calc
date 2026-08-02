import { createRoot } from "solid-js";

import { Icon } from "../components/common/Icon";

/**
 * Iconify markup for the command palette (master C30, WP-04 exit criterion:
 * zero `fa-` class strings anywhere in `frontend/src`).
 *
 * `commandline.ts` builds its suggestion list as one big HTML string, so it
 * cannot mount `<Icon />` as a component. Rather than duplicate the generated
 * icon bundle — which only `components/common/Icon.tsx` owns (WP-04) — this
 * renders that component once per id in a detached reactive root and caches the
 * resulting `outerHTML`.
 *
 * The read happens **after** `createRoot` returns: Solid flushes the effect
 * queue in `completeUpdates` before handing control back, and it is that effect
 * which writes the icon body into the `<svg>`. Reading inside the root callback
 * would therefore yield an empty element.
 */
const cache = new Map<string, string>();

/** The palette's fallback icon — monkeytype used `fa-chevron-right` here. */
export const DEFAULT_COMMAND_ICON = "ph:caret-right-bold";

export function getIconHtml(icon?: string, extraClass?: string): string {
  const id = icon !== undefined && icon !== "" ? icon : DEFAULT_COMMAND_ICON;
  const cacheKey = `${id}|${extraClass ?? ""}`;

  const cached = cache.get(cacheKey);
  if (cached !== undefined) return cached;

  let svg: SVGSVGElement | undefined;
  const dispose = createRoot((dispose) => {
    svg = Icon({ icon: id, fixedWidth: true, class: extraClass }) as
      | SVGSVGElement
      | undefined;
    return dispose;
  });

  const html = svg?.outerHTML ?? "";
  dispose();

  cache.set(cacheKey, html);
  return html;
}

/**
 * An empty, correctly sized box, used where monkeytype rendered a bare
 * `<i class="fas fa-fw"></i>` purely to reserve the checkmark column. The
 * width matches `svg.icon-fw` in `styles/icons.scss`, which is qualified with
 * `svg` and therefore cannot be reused on a placeholder element.
 */
export const BLANK_ICON_HTML = `<span style="display:inline-block;width:1.25em"></span>`;

export const __testing = { cache };
