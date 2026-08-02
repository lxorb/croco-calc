import { isAnyPopupVisible } from "../../utils/misc";

import { navigate } from "../../controllers/route-controller";
import { restartTestEvent } from "../../events/test";
import { getActivePage } from "../../states/core";
import { hotkeys } from "../../states/hotkeys";
import { createHotkey } from "./utils";

function quickRestart(e: KeyboardEvent): void {
  if (isAnyPopupVisible()) {
    return;
  }

  e.preventDefault();

  if (getActivePage() === "test") {
    restartTestEvent.dispatch({ isQuickRestart: !e.shiftKey });
  } else {
    void navigate("");
  }
}

// CP-087 — one unconditional registration.
//
// Upstream needed two. The first was disabled on a long test bound to `enter`,
// because `Shift+Enter, Shift+Enter` was the bail-out keybind; the second
// existed only to catch the unshifted press on a long test and explain why it
// did nothing. croco calc has neither half of that: bail-out is cut (C38) and
// `canQuickRestart()` is permanently true at the 8-minute maximum (C2 /
// ME-119), so `hotkeys.quickRestart` never carries a `Shift+` prefix and the
// second registration would only shadow the first with the same key.
//
// `enabled` is left to `createHotkey`'s default, which is `!== NoKey` — that is
// what turns the binding off for `quickRestart === "off"` (SB-151's default).
createHotkey(() => hotkeys.quickRestart, quickRestart);
