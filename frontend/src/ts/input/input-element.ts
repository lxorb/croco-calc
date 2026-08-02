/**
 * The hidden capture textarea (CP-053, CP-054).
 *
 * Renamed from `#wordsInput`. Every anti-interference attribute monkeytype
 * carried is preserved in `test.html`, plus `inputmode="decimal"` so mobile
 * browsers open a numeric keypad — which is exactly why the CP-191 symbol row
 * exists, since that keypad has no `/` and no `-`.
 *
 * Unlike monkeytype there is no leading-space sentinel and the element's value
 * is never read: the input listeners `preventDefault()` everything and feed
 * characters straight to the engine, so the textarea is a pure focus target.
 */

const el = document.querySelector("#tasksInput") as HTMLTextAreaElement | null;

if (el === null) {
  throw new Error("Tasks input element not found");
}

const input: HTMLTextAreaElement = el;

export function getInputElement(): HTMLTextAreaElement {
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

/** Keeps the (invisible) native selection collapsed at the end. */
export function moveInputElementCaretToTheEnd(): void {
  input.setSelectionRange(input.value.length, input.value.length);
}

/** The textarea must never accumulate text — the engine owns the buffer. */
export function clearInputElement(): void {
  input.value = "";
}
