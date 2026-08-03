/**
 * Physical-keyboard capture (TR-127 … TR-136).
 *
 * A keystroke either enters the buffer, submits, continues, deletes, or is
 * ignored. Nothing else — CP-036 / ME-152 forbid any pre-commit feedback, so
 * there is no per-character correctness machinery here and there must never be.
 *
 * **Enter is the only submit key** (TR-131). Space is struck (TR-132): CP-037's
 * own justification for it was "preserves monkeytype muscle memory (space
 * commits a word)", which is precisely the typing artefact this design removes,
 * and in the new design Space would additionally have to double as "continue",
 * giving one key two meanings in two states for no benefit.
 *
 * The `event.isComposing` guard is gone with the word stream (TR-095): no IME
 * composes digits, `-`, `.` or `/`.
 */

import { normalizeAnswerChar } from "@croco-calc/math-engine";

import * as TestLogic from "../../test/test-logic";
import { getInputElement } from "../input-element";

const inputEl = getInputElement();

inputEl.addEventListener("keydown", (event) => {
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

  // TR-131 / TR-136 — Enter submits in `running` and continues in
  // `awaitingContinue`. `TestLogic` owns which of the two it is, so the
  // CONTINUE_ARM_MS arming delay (TR-118) cannot be bypassed from here.
  if (event.key === "Enter") {
    event.preventDefault();
    TestLogic.submitOrContinue();
    return;
  }

  // TR-133 — Space is silently ignored and must not scroll the page.
  if (event.key === " " || event.code === "Space") {
    event.preventDefault();
    return;
  }

  // TR-085 — exactly `0`-`9`, `-` (also U+2212/U+2013/U+2014), `.`, `,`, `/`.
  // Anything else is ignored: nothing appended, nothing counted, no state
  // change, and in `preStart` the run does not start.
  if (normalizeAnswerChar(event.key) === null) return;

  event.preventDefault();
  TestLogic.pressCharacter(event.key);
});
