/**
 * The PB crown on the results screen (CP-095, INV-092).
 *
 * Kept verbatim from upstream apart from its host: the crown now hangs off
 * `.group.score`, because a personal best is measured in `score` (CP-110,
 * master C40).
 */

import { applyReducedMotion } from "../utils/misc";
import { qs } from "../utils/dom";

const CROWN_SELECTOR = "#result .stats .score .crown";

export function hide(): void {
  visible = false;
  qs(CROWN_SELECTOR)?.setStyle({ opacity: "0" })?.hide();
}

export type CrownType =
  | "normal"
  | "ineligible"
  | "pending"
  | "error"
  | "warning";

let visible = false;
let currentType: CrownType = "normal";

export function getCurrentType(): CrownType {
  return currentType;
}

export function show(): void {
  if (visible) return;
  visible = true;
  const el = qs(CROWN_SELECTOR);

  el?.animate({
    opacity: [0, 1],
    duration: applyReducedMotion(125),
    onBegin: () => {
      el?.show();
    },
  });
}

export function update(type: CrownType): void {
  currentType = type;
  qs(CROWN_SELECTOR)
    ?.removeClass("ineligible")
    ?.removeClass("pending")
    ?.removeClass("error")
    ?.removeClass("warning")
    ?.addClass(type);
}
