/**
 * Physical-keyboard capture (CP-037, CP-050, CP-055, CP-059).
 *
 * The whole per-character correctness machinery monkeytype ran here is gone:
 * CP-036 forbids any pre-commit feedback, so a keystroke either enters the
 * buffer, commits, deletes, or is ignored. Nothing else.
 */

import { normalizeAnswerChar } from "@croco-calc/math-engine";

import * as TestLogic from "../../test/test-logic";
import { getInputElement } from "../input-element";

const inputEl = getInputElement();

/**
 * CP-050 — the keys that MUST NOT start the test. Enter and Space commit, and
 * a commit is inert while idle (the engine enforces that too), so they are safe
 * to handle here without ever reaching `startTest()`.
 */
function isCommitKey(event: KeyboardEvent): boolean {
  return event.key === "Enter" || event.key === " " || event.code === "Space";
}

inputEl.addEventListener("keydown", (event) => {
  if (event.isComposing) return;

  // Let the hotkey layer (WP-05) have Tab, Escape and the palette bindings.
  if (event.ctrlKey || event.metaKey) {
    if (event.key !== "Backspace") return;
  }

  if (event.key === "Backspace") {
    event.preventDefault();
    // CP-059 — Ctrl/Alt + Backspace clears the whole current answer.
    TestLogic.deleteCharacter(event.ctrlKey || event.altKey || event.metaKey);
    return;
  }

  if (isCommitKey(event)) {
    event.preventDefault();
    TestLogic.commitAnswer();
    return;
  }

  // CP-055 — exactly `0`-`9`, `-` (also U+2212), `.`, `,`, `/`. Anything else
  // is ignored: no letter appended, no error counted, and the test stays idle.
  if (normalizeAnswerChar(event.key) === null) return;

  event.preventDefault();
  TestLogic.pressCharacter(event.key);
});
