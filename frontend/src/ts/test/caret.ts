/**
 * The single live caret instance and the thin API the test page drives it with
 * (CP-067 … CP-070). The pace caret is gone (CP-071).
 */

import { Config } from "../config/store";
import { Caret } from "../elements/caret";
import { configEvent } from "../events/config";
import { getActiveTaskIndex, getAnswerLength } from "../states/test";
import { qsr } from "../utils/dom";

export const caret = new Caret(qsr("#caret"), Config.caretStyle);

export function stopAnimation(): void {
  caret.stopBlinking();
}

export function startAnimation(): void {
  caret.startBlinking();
}

export function hide(): void {
  caret.hide();
}

/** CP-088 — restart puts the caret back on task 0, character 0. */
export function resetPosition(): void {
  caret.stopAllAnimations();
  caret.clearMargins();
  caret.goTo({ taskIndex: 0, charIndex: 0, animate: false });
}

export function updatePosition(noAnim = false): void {
  caret.goTo({
    taskIndex: getActiveTaskIndex(),
    charIndex: getAnswerLength(),
    animate: Config.smoothCaret !== "off" && !noAnim,
  });
}

export function show(noAnim = false): void {
  caret.show();
  updatePosition(noAnim);
  startAnimation();
}

configEvent.subscribe(({ key }) => {
  if (key === "caretStyle") {
    caret.setStyle(Config.caretStyle);
    updatePosition(true);
  }
  if (key === "smoothCaret") {
    caret.updateBlinkingAnimation();
  }
});
