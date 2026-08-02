import {
  __testing as iconHtmlTesting,
  renderIconHtml,
} from "../utils/icon-html";

/**
 * Iconify markup for the command palette (master C30, WP-04 exit criterion:
 * zero font awesome class strings anywhere in `frontend/src`, per DoD-12).
 *
 * `commandline.ts` builds its suggestion list as one big HTML string, so it
 * cannot mount `<Icon />` as a component. The rendering and caching live in
 * `utils/icon-html.ts`, which the input-field status indicator shares; this
 * module only adds the palette's fallback-icon rule on top.
 */

/** The palette's fallback icon — the reference used a chevron glyph here. */
export const DEFAULT_COMMAND_ICON = "ph:caret-right-bold";

export function getIconHtml(icon?: string, extraClass?: string): string {
  const id = icon !== undefined && icon !== "" ? icon : DEFAULT_COMMAND_ICON;
  return renderIconHtml(id, { fixedWidth: true, class: extraClass });
}

/**
 * An empty, correctly sized box, used where the reference rendered a bare
 * fixed-width font awesome `<i>` purely to reserve the checkmark column. The
 * width matches `svg.icon-fw` in `styles/icons.scss`, which is qualified with
 * `svg` and therefore cannot be reused on a placeholder element.
 */
export const BLANK_ICON_HTML = `<span style="display:inline-block;width:1.25em"></span>`;

export const __testing = iconHtmlTesting;
