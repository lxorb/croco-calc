import * as PageTransition from "../legacy-states/page-transition";
import { requestDebouncedAnimationFrame } from "../utils/debounced-animation-frame";
import { getFocus, isTestActive, setFocus } from "../states/test";
import { qsa, ElementsWithUtils } from "../utils/dom";

const unfocusPx = 3;

let cacheReady = false;
/**
 * Tracked separately from `getFocus()` because the two are no longer the same
 * thing: during a run the pointer comes back on the first mouse movement while
 * the chrome stays hidden (see the `mousemove` handler below).
 */
let cursorHidden = false;
let cache: {
  focus?: ElementsWithUtils;
  cursor?: ElementsWithUtils;
} = {};

function initializeCache(): void {
  if (cacheReady) return;

  // INV-050 removed the banner and the four ad wrappers from `index.html`, so
  // the upstream selector list is down to the three chrome containers that
  // `main.focus` actually dims.
  const elementsSelector = ["app", "footer", "main"].join(",");

  cache.focus = qsa(elementsSelector);

  cacheReady = true;
}

/**
 * Re-queried every time rather than cached, because buttons and anchors mount
 * and unmount as pages change and a stale list leaves new ones with the wrong
 * cursor.
 */
function setCursorHidden(hidden: boolean): void {
  cache.cursor = qsa("body, button, a");
  cache.cursor.setStyle({ cursor: hidden ? "none" : "" });
  cursorHidden = hidden;
}

// with cursor is a special case that is only used on the initial page load
// to avoid the cursor being invisible and confusing the user
export function set(value: boolean, withCursor = false): void {
  requestDebouncedAnimationFrame("focus.set", () => {
    initializeCache();

    // Deliberately not short-circuited on `value === getFocus()`: the cursor
    // and the chrome can now be out of step (a mouse movement mid-run restores
    // the pointer while focus stays on), so entering focus mode has to be able
    // to re-hide the cursor for the *next* run even though nothing about the
    // chrome changed. Every call site is cold — page navigation, palette open,
    // test start — so the extra frame costs nothing.
    if (value) {
      setFocus(true);
      if (cache.focus) {
        cache.focus.addClass("focus");
      }
      setCursorHidden(!withCursor);
    } else {
      setFocus(false);
      if (cache.focus) {
        cache.focus.removeClass("focus");
      }
      setCursorHidden(false);
    }
  });
}

/**
 * Mouse movement releases focus mode — **except while a run is active**.
 *
 * Upstream (monkeytype) this is right: a typing test streams words and you may
 * well want to reach for the settings mid-flow, so the first twitch of the
 * mouse brings the header, the settings bar and the footer back. Here it is
 * wrong. The user is looking at one arithmetic problem, and an accidental desk
 * bump repainting the whole page around it is pure distraction — reported as
 * "while in a test and hovering with the mouse cursor, nothing should really
 * happen (the settings shouldn't come back)".
 *
 * Only *passive movement* is made inert. Everything deliberate still works:
 *
 * - clicks are untouched (nothing here listens for them), so a real control
 *   that is still on screen can still be clicked on purpose;
 * - `tab > enter` still reaches `#restartTestButton`, which `test.scss` makes
 *   visible again on `:focus-visible` (TR-137, TR-138);
 * - Escape / the command palette calls `set(false)` explicitly (`commandline`),
 *   as does navigation (`page-controller`), so the chrome comes back the moment
 *   the user actually asks for it;
 * - the run ends — finished, restarted or navigated away — and `isTestActive()`
 *   is false again, so the very next movement releases the chrome as before.
 *   That is what uncovers the results screen's surroundings.
 *
 * The cursor is the one thing movement still restores. It is hidden when the
 * run starts (it has no job while you are answering, and a pointer parked over
 * the prompt is exactly the kind of clutter this screen is meant to avoid), but
 * once the user moves the mouse they are evidently reaching for something, and
 * an invisible pointer would make that unaimable — the same reasoning that put
 * `withCursor` on the initial page load.
 */
document.addEventListener("mousemove", function (event) {
  if (PageTransition.get()) return;
  if (!getFocus()) return;
  if (
    // To avoid mouse/desk vibration from creating a flashy effect, we'll unfocus @ >5px instead of >0px
    event.movementX <= unfocusPx &&
    event.movementY <= unfocusPx
  ) {
    return;
  }

  if (isTestActive()) {
    if (cursorHidden) setCursorHidden(false);
    return;
  }

  set(false);
});
