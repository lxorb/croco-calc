import {
  CreateHotkeyOptions,
  Hotkey,
  HotkeyCallback,
  HotkeyCallbackContext,
  createHotkey as registerHotkey,
} from "@tanstack/solid-hotkeys";
import { isAnyPopupVisible } from "../../utils/misc";
import { isInputElementFocused } from "../input-element";

export const NoKey = "" as Hotkey;

export function createHotkey(
  hotkey: Hotkey | (() => Hotkey),
  callback: HotkeyCallback,
  options: () => Partial<
    Omit<
      CreateHotkeyOptions,
      "ignoreInputs" | "stopPropagation" | "preventDefault"
    >
  > = () => ({}),
): void {
  registerHotkey(
    hotkey,
    (e, context) => {
      if (handleHotkeyOnInteractiveElement(e, context)) return;
      e.stopPropagation();
      e.preventDefault();
      callback(e, context);
    },
    () => ({
      ignoreInputs: false, //hotkeys are active on the words input, but not on other interactive elements
      stopPropagation: false, //we set stopPropagation in the callback if the hotkey executes
      preventDefault: false, //we set preventDefault in the callback if the hotkey executes
      requireReset: true,
      conflictBehavior: "replace",
      enabled: (typeof hotkey === "function" ? hotkey() : hotkey) !== NoKey,
      ...options(),
    }),
  );
}

function isInteractiveElementFocused(): boolean {
  if (isInputElementFocused()) return false;

  return (
    document.activeElement?.tagName === "A" ||
    document.activeElement?.tagName === "INPUT" ||
    document.activeElement?.tagName === "TEXTAREA" ||
    document.activeElement?.tagName === "SELECT" ||
    document.activeElement?.tagName === "BUTTON" ||
    document.activeElement?.classList.contains("button") === true ||
    document.activeElement?.classList.contains("textButton") === true ||
    document.activeElement?.classList.contains("modal") === true
  );
}

/**
 * Whether the hotkey should yield to whatever currently has focus.
 *
 * Upstream had a third branch here: `Escape` was swallowed while the test input
 * held an in-progress IME composition, so the first `Escape` cancelled the
 * candidate window rather than the test. `#tasksInput` (CP-053) only ever takes
 * digits and the operator keys, which no IME composes, so
 * `legacy-states/composition` was deleted with the rest of the composition
 * pipeline (CP-064) and `Escape` now always reaches the hotkey.
 */
function handleHotkeyOnInteractiveElement(
  e: KeyboardEvent,
  { hotkey }: HotkeyCallbackContext,
): boolean {
  if (
    (hotkey === "Tab" || hotkey === "Enter") &&
    isInteractiveElementFocused()
  ) {
    return true;
  } else if (hotkey === "Escape" && isAnyPopupVisible()) {
    return true;
  }

  return false;
}
