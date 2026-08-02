/**
 * Soft-keyboard capture (CP-054, CP-180).
 *
 * `keydown` is unreliable on Android soft keyboards, which frequently report
 * `Unidentified`. `beforeinput` carries the real symbol in `event.data`, so
 * the mobile path goes through here. Desktop keystrokes never reach it because
 * `key.ts` has already called `preventDefault()`.
 *
 * Both paths converge on the same engine calls, which is what CP-193 requires.
 */

import * as TestLogic from "../../test/test-logic";
import { clearInputElement, getInputElement } from "../input-element";

const inputEl = getInputElement();

inputEl.addEventListener("beforeinput", (inputEvent) => {
  const type = inputEvent.inputType;

  if (type.startsWith("delete")) {
    inputEvent.preventDefault();
    TestLogic.deleteCharacter(type === "deleteWordBackward");
    return;
  }

  if (type === "insertLineBreak" || type === "insertParagraph") {
    inputEvent.preventDefault();
    TestLogic.commitAnswer();
    return;
  }

  if (type === "insertText" || type === "insertCompositionText") {
    inputEvent.preventDefault();
    const data = inputEvent.data ?? "";
    for (const ch of data) {
      // CP-037 — a space commits, exactly as Enter does.
      if (ch === " ") TestLogic.commitAnswer();
      else TestLogic.pressCharacter(ch);
    }
    return;
  }

  // Paste, drop, and every other insertion mode are refused outright.
  inputEvent.preventDefault();
});

// Defence in depth: if any path ever slips text into the element, drop it.
inputEl.addEventListener("input", () => {
  if (inputEl.value !== "") clearInputElement();
});
