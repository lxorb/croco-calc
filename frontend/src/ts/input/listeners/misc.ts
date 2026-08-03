/**
 * TR-094 — `copy` and `cut` are allowed: the user's own answer is theirs, and
 * the input is visible now, so preventing them would be user-hostile.
 *
 * `paste` is **not** prevented here — `beforeinput` filters it through the
 * engine instead (TR-090), which is strictly better than refusing it. `drop` is
 * prevented outright.
 *
 * The `select` / `selectstart` `preventDefault()` loop is struck: it was a
 * hidden-textarea hack, and with a visible input it would stop the user
 * selecting their own answer.
 */

import {
  getInputElement,
  moveInputElementCaretToTheEnd,
} from "../input-element";

const inputEl = getInputElement();

inputEl.addEventListener("focus", () => {
  moveInputElementCaretToTheEnd();
});

inputEl.addEventListener("drop", (event) => {
  event.preventDefault();
});
