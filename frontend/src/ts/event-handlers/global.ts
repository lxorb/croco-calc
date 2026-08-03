import { normalizeAnswerChar } from "@croco-calc/math-engine";

import * as Misc from "../utils/misc";
import * as TestLogic from "../test/test-logic";
import { Config } from "../config/store";
import { showErrorNotification } from "../states/notifications";
import { getActivePage } from "../states/core";
import { ModifierKeys } from "../constants/modifier-keys";
import { focusTasks } from "../test/test-ui";
import { isInputElementFocused } from "../input/input-element";
import { getResultVisible } from "../states/test";
import { isDevEnvironment } from "../utils/env";

/**
 * Elements that legitimately own the keyboard. A click on one of these must not
 * be yanked back to the capture textarea.
 */
const INTERACTIVE_SELECTOR =
  "a, button, input, textarea, select, dialog, [contenteditable], [tabindex]:not([tabindex='-1'])";

/**
 * Clicking the page background used to strand focus on `<body>` for good: the
 * autofocus below was the only way back, and it was gated behind
 * `PageTransition.get()`, which starts `true` and only clears when a page
 * change runs to completion. A stalled transition therefore left the app
 * looking live while silently dropping every keystroke.
 *
 * Restoring focus on a background click removes that whole failure mode, and
 * costs nothing when focus is already where it should be.
 */
document.addEventListener("pointerdown", (e) => {
  if (getActivePage() !== "test") return;
  if (getResultVisible()) return;
  if (isInputElementFocused()) return;
  if (Misc.isAnyPopupVisible()) return;

  const target = e.target as HTMLElement | null;
  if (target?.closest(INTERACTIVE_SELECTOR)) return;

  focusTasks();
});

document.addEventListener("keydown", (e) => {
  if (e.key === undefined) return;

  if (isDevEnvironment()) {
    if (
      (document.activeElement as HTMLElement | undefined)?.dataset[
        "uiElement"
      ] === "signalDevtoolsInput"
    ) {
      return;
    }
  }

  const pageTestActive: boolean = getActivePage() === "test";
  if (pageTestActive && !getResultVisible() && !isInputElementFocused()) {
    const popupVisible: boolean = Misc.isAnyPopupVisible();
    // this is nested because isAnyPopupVisible is a bit expensive
    // and we don't want to call it during the test
    if (
      !popupVisible &&
      !["Enter", " ", "Escape", "Tab", ...ModifierKeys].includes(e.key) &&
      !e.metaKey &&
      !e.ctrlKey
    ) {
      //autofocus
      focusTasks();
      // The keystroke that restored focus was dispatched at `<body>`, so it
      // never reaches the textarea's own listener. Feeding it to the engine
      // here is what stops the first digit from being silently eaten — without
      // it, typing to start needs two presses and looks broken.
      if (normalizeAnswerChar(e.key) !== null) {
        e.preventDefault();
        TestLogic.pressCharacter(e.key);
        return;
      }
      if (Config.showOutOfFocusWarning) {
        e.preventDefault();
      }
    }
  }
});

//stop space scrolling
window.addEventListener("keydown", function (e) {
  if (
    e.code === "Space" &&
    (e.target === document.body || (e.target as HTMLElement)?.id === "result")
  ) {
    e.preventDefault();
  }
});

window.onerror = function (message, url, line, column, error): void {
  if (isDevEnvironment()) {
    showErrorNotification(error?.message ?? "Undefined message", {
      customTitle: "DEV: Unhandled error",
      durationMs: 5000,
      important: true,
    });
    console.error({ message, url, line, column, error });
  }
};

window.onunhandledrejection = function (e): void {
  if (isDevEnvironment()) {
    showErrorNotification(
      (e.reason as Error).message ?? e.reason ?? "Undefined message",
      {
        customTitle: "DEV: Unhandled rejection",
        durationMs: 5000,
        important: true,
      },
    );
  }
};
