/**
 * The answer input (TR-079 … TR-095).
 *
 * A single **visible** `<input id="answerInput">`. It replaces the hidden
 * capture textarea, which existed only because the old design rendered the
 * answer as one element per character and therefore needed somewhere off-screen
 * to catch keystrokes. There is no such indirection any more: the user types
 * into the field they are looking at, and the browser's own caret — themed with
 * `--caret-color` (TR-020) — is the only caret on the page.
 *
 * `type` is `text`, never `number` (TR-080): a `number` input rejects `/`,
 * parses by locale, adds spinner controls and reports an empty `value` for
 * intermediate states. All four are wrong for an answer that may be `7/12`.
 *
 * ## The mirror contract (TR-089)
 *
 * The engine's buffer is the single source of truth. `#answerInput.value` is a
 * **mirror** of it and never the other way round. Every mutation goes through
 * `beforeinput`, which `preventDefault()`s unconditionally and then asks the
 * engine to apply the corresponding operation; the resulting buffer is written
 * back here. That is what keeps the ME-151 16-character cap and the `judge.ts`
 * character filter in exactly one place.
 */

const el = document.querySelector<HTMLInputElement>("#answerInput");

if (el === null) {
  throw new Error("Answer input element not found");
}

const input: HTMLInputElement = el;

export function getInputElement(): HTMLInputElement {
  return input;
}

export function isInputElementFocused(): boolean {
  return document.activeElement === input;
}

export function focusInputElement(preventScroll = false): void {
  input.focus({ preventScroll });
}

export function blurInputElement(): void {
  input.blur();
}

/**
 * TR-091 — collapse the selection to the end after every write.
 *
 * Mid-string editing is deliberately unsupported (TR-092): clicking into the
 * middle of the answer and typing appends at the end. Answers are at most 16
 * characters and are almost always corrected by backspacing, so the cost is
 * negligible, and the alternative — a controlled input reconciling arbitrary
 * cursor positions against a filtered buffer — is a great deal of machinery for
 * no user benefit.
 */
export function moveInputElementCaretToTheEnd(): void {
  input.setSelectionRange(input.value.length, input.value.length);
}

/** TR-089 — write the engine's buffer into the mirror and re-collapse. */
export function setInputValue(buffer: string): void {
  if (input.value !== buffer) input.value = buffer;
  moveInputElementCaretToTheEnd();
}

export function clearInputElement(): void {
  setInputValue("");
}
