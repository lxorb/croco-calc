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
      ignoreInputs: false, //hotkeys are active on the answer input (#answerInput), but not on other interactive elements
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
 * TR-140 — the Enter collision.
 *
 * When `quickRestart === "enter"`, Enter has two meanings: restart the test,
 * and submit / continue inside the arena. The ruling is keyed on the arena's
 * `data-state`:
 *
 * - in `running` and `awaitingContinue`, Enter belongs to the arena and MUST
 *   NOT trigger quick-restart;
 * - in `preStart` and `finished`, Enter triggers quick-restart as configured.
 *
 * Without this guard `quickRestart: "enter"` makes the app unusable — every
 * answer submission would restart the run instead of submitting.
 */
function arenaOwnsEnter(): boolean {
  const state = document
    .querySelector("#taskArena")
    ?.getAttribute("data-state");
  return state === "running" || state === "awaitingContinue";
}

/**
 * Whether the hotkey should yield to whatever currently has focus.
 *
 * The composition branch upstream had here is gone with the word stream:
 * `#answerInput` only ever takes digits and the operator keys, which no IME
 * composes, so `Escape` now always reaches the hotkey (TR-095).
 */
function handleHotkeyOnInteractiveElement(
  e: KeyboardEvent,
  { hotkey }: HotkeyCallbackContext,
): boolean {
  if (hotkey === "Enter" && arenaOwnsEnter()) {
    return true;
  } else if (
    (hotkey === "Tab" || hotkey === "Enter") &&
    isInteractiveElementFocused()
  ) {
    return true;
  } else if (hotkey === "Escape" && isAnyPopupVisible()) {
    return true;
  }

  return false;
}
