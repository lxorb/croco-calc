/**
 * Soft-keyboard and every other mutation path (TR-090, TR-093).
 *
 * `keydown` is unreliable on Android soft keyboards, which frequently report
 * `Unidentified`. `beforeinput` carries the real symbol in `event.data`, so the
 * mobile path goes through here. Desktop keystrokes never reach it because
 * `key.ts` has already called `preventDefault()`.
 *
 * TR-090 — **every** `inputType` is prevented without exception, and the
 * corresponding engine operation is applied instead. The engine's buffer is
 * then written back to the element, so `#answerInput.value` is only ever a
 * mirror of the buffer (TR-089).
 */

import * as TestLogic from "../../test/test-logic";
import { getInputElement, setInputValue } from "../input-element";

const inputEl = getInputElement();

/** TR-090 — the insertion modes whose data is filtered and appended. */
const INSERT_TYPES = new Set([
  "insertText",
  "insertCompositionText",
  "insertFromPaste",
  "insertFromDrop",
  "insertReplacementText",
]);

/** TR-090 — the deletions that clear the whole buffer rather than one char. */
const DELETE_WHOLE_TYPES = new Set([
  "deleteWordBackward",
  "deleteHardLineBackward",
  "deleteSoftLineBackward",
]);

inputEl.addEventListener("beforeinput", (inputEvent) => {
  const type = inputEvent.inputType;
  // TR-090 — unconditional, for every inputType, before any branch runs.
  inputEvent.preventDefault();

  if (type === "insertLineBreak" || type === "insertParagraph") {
    // TR-105 — the iOS keypad has no return key, but a hardware keyboard or an
    // `enterkeyhint="done"` press still arrives as a line break.
    TestLogic.submitOrContinue();
    return;
  }

  if (DELETE_WHOLE_TYPES.has(type)) {
    TestLogic.deleteCharacter(true);
    return;
  }

  if (type.startsWith("delete")) {
    TestLogic.deleteCharacter(false);
    return;
  }

  if (INSERT_TYPES.has(type)) {
    // Applying the filter to pasted text rather than refusing the paste
    // outright is deliberate (TR-090): a paste that survives the filter is
    // indistinguishable from typing the same characters, so refusing it bought
    // nothing and only annoyed users.
    for (const ch of inputEvent.data ?? "") TestLogic.pressCharacter(ch);
    return;
  }

  // Everything else: prevented above, no engine call (TR-090).
});

/**
 * TR-093 — defence in depth. If `#answerInput.value` ever diverges from the
 * engine's buffer (an input path no `beforeinput` covered, an extension writing
 * into the field), it is rewritten from the engine rather than trusted.
 */
inputEl.addEventListener("input", () => {
  const buffer = TestLogic.getBuffer();
  if (inputEl.value !== buffer) setInputValue(buffer);
});
