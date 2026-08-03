import { Config } from "../config/store";
import { navigate } from "../controllers/route-controller";
import { restartTestEvent } from "../events/test";
import { focusInputElement } from "../input/input-element";
import { qs } from "../utils/dom";

const testPage = qs(".pageTest");

// CP-098 kept the tags block, but master C15 / INV-186 cut tags entirely, so
// there is no edit-tags handler to register.

/**
 * CP-086 / CP-088 — the restart button. It routes through `restartTestEvent`
 * like every other restart path (a settings change, the logo, the quick-restart
 * hotkey), so `preStart` is re-applied exactly once per restart (CP-052).
 */
testPage?.onChild("click", "#restartTestButton", () => {
  restartTestEvent.dispatch();
  focusInputElement();
});

/** CP-022 — the restart button inside the generation-failed panel. */
testPage?.onChild("click", "#testInitFailed .restart", () => {
  restartTestEvent.dispatch();
});

/** Clicking the stream focuses the hidden capture textarea (CP-083). */
testPage?.onChild("click", "#taskArena", () => {
  focusInputElement();
});

qs(".pageTest #dailyLeaderboardRank")?.on("click", async () => {
  void navigate(
    `/leaderboards?type=daily&mode2=${Config.time}&goToUserPage=true`,
  );
});
