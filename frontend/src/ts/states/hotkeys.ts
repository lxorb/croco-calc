import { QuickRestart } from "@croco-calc/schemas/configs";
import { Hotkey } from "@tanstack/solid-hotkeys";
import { createEffect } from "solid-js";
import { createStore } from "solid-js/store";
import { getConfig } from "../config/store";
import { NoKey } from "../input/hotkeys/utils";

export const quickRestartHotkeyMap: Record<QuickRestart, Hotkey> = {
  off: NoKey,
  esc: "Escape",
  tab: "Tab",
  enter: "Enter",
};

type Hotkeys = {
  quickRestart: Hotkey;
  commandline: Hotkey;
};

export const [hotkeys, setHotkeys] = createStore<Hotkeys>(updateHotkeys());

// `quickRestart` is the only input left, so the effect tracks it through
// `updateHotkeys()` and no longer has to re-read the active page.
createEffect(() => {
  setHotkeys(updateHotkeys());
});

/**
 * Neither hotkey ever needs the shift modifier any more.
 *
 * Upstream added `Shift+` when the key the user had bound also had to reach the
 * test input — a tab character inside the words, a newline inside the words, or
 * a funbox that swallowed it — and when the run was long enough that an
 * accidental restart would hurt. All three inputs are gone: tasks are numeric
 * (C29), funboxes were cut (SB-159), and `canQuickRestart()`
 * (`utils/quick-restart.ts`) is permanently true because the longest test is
 * 8 minutes (480 s, C2 / ME-119) against upstream's 900 s threshold.
 *
 * So both bindings are the plain key, and the only decision left is SB-150's:
 * `Escape` opens the palette unless `quickRestart === "esc"`, in which case the
 * palette moves to `Tab`.
 */
function updateHotkeys(): Hotkeys {
  const commandlineIsTab = getConfig.quickRestart === "esc";

  return {
    quickRestart: quickRestartHotkeyMap[getConfig.quickRestart],
    commandline: commandlineIsTab ? "Tab" : "Escape",
  };
}
