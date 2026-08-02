import { Icon } from "../../common/Icon";

/**
 * `test.html` is static markup, so the icons it needs are mounted rather than
 * written as `<i class="fas …">` — CP-001 leaves no font-awesome markup
 * anywhere, and C30's exit criterion greps for exactly that.
 *
 * CP-022 / CP-086 — the restart glyph, on both the failure panel and the button.
 */
export function RestartIcon() {
  return <Icon icon="ph:arrow-counter-clockwise-bold" fixedWidth />;
}
