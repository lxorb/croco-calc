import { beforeEach, describe, expect, it } from "vitest";

import * as PageTransition from "../../src/ts/legacy-states/page-transition";
import { getFocus, setTestActive } from "../../src/ts/states/test";
import * as Focus from "../../src/ts/test/focus";

/**
 * Focus mode and the mouse.
 *
 * The user's report: "while in a test and hovering with the mouse cursor,
 * nothing should really happen (the settings shouldn't come back)". Upstream,
 * the first mouse twitch drops focus mode and repaints the header, the settings
 * bar and the footer around a run in progress — right for a word stream you may
 * want to reconfigure mid-flow, wrong for a screen showing one arithmetic
 * problem you are concentrating on.
 *
 * These are `#taskArena`-free on purpose: the mechanic is the chrome, not the
 * arena, and `main.focus` plus the `getFocus()` signal are what every hidden
 * element (settings bar, nav, footer, keytips) actually binds to.
 */

// `Focus.set` batches through `requestDebouncedAnimationFrame`, and jsdom's rAF
// is timer-driven. Running the frame inline lets each assertion follow its call
// directly instead of interleaving a timer flush into every step.
globalThis.requestAnimationFrame = (cb: FrameRequestCallback): number => {
  cb(0);
  return 0;
};
globalThis.cancelAnimationFrame = (): void => {
  // Nothing is ever pending — the frame above has already run.
};

// The three chrome containers `focus.ts` caches. The cache is built once, on
// the first `set()`, so this has to be in place before any test runs.
document.body.innerHTML = `<app></app><main></main><footer></footer>`;

/** Movement above `unfocusPx` — i.e. a real move, not desk vibration. */
function mousemove(distance = 10): void {
  const event = new MouseEvent("mousemove", { bubbles: true });
  Object.defineProperty(event, "movementX", { value: distance });
  Object.defineProperty(event, "movementY", { value: distance });
  document.dispatchEvent(event);
}

const chromeHidden = (): boolean =>
  document.querySelector("main")?.classList.contains("focus") ?? false;
const pointerHidden = (): boolean => document.body.style.cursor === "none";

describe("focus mode and the mouse", () => {
  beforeEach(() => {
    // `page-transition` starts `true`, which makes the handler a no-op.
    PageTransition.set(false);
    setTestActive(false);
    Focus.set(false);
  });

  it("hides the chrome and the pointer when a run starts", () => {
    setTestActive(true);
    Focus.set(true);

    expect(getFocus()).toBe(true);
    expect(chromeHidden()).toBe(true);
    expect(pointerHidden()).toBe(true);
  });

  it("keeps the chrome hidden when the mouse moves during a run", () => {
    setTestActive(true);
    Focus.set(true);

    mousemove();

    // The defect: this used to be `false` / `false`, and the settings bar,
    // header and footer came back over a run in progress.
    expect(getFocus()).toBe(true);
    expect(chromeHidden()).toBe(true);
  });

  it("no amount of movement brings the chrome back mid-run", () => {
    setTestActive(true);
    Focus.set(true);

    for (let i = 0; i < 20; i++) mousemove(50);

    expect(getFocus()).toBe(true);
    expect(chromeHidden()).toBe(true);
  });

  it("brings the pointer back on movement so a deliberate click stays aimable", () => {
    setTestActive(true);
    Focus.set(true);
    expect(pointerHidden()).toBe(true);

    mousemove();

    expect(pointerHidden()).toBe(false);
    // …and that is the *only* thing movement restores.
    expect(chromeHidden()).toBe(true);
  });

  it("re-hides the pointer when the next run starts", () => {
    setTestActive(true);
    Focus.set(true);
    mousemove();
    expect(pointerHidden()).toBe(false);

    // A restart leaves focus mode on, so the second `set(true)` is a no-op as
    // far as the chrome is concerned — it must still re-hide the pointer.
    Focus.set(true);

    expect(pointerHidden()).toBe(true);
  });

  it("still releases the chrome on movement when no run is active", () => {
    // Pre-start and the results screen both live here: there is nothing to
    // concentrate on, so the upstream behaviour is the right one.
    Focus.set(true);
    expect(chromeHidden()).toBe(true);

    mousemove();

    expect(getFocus()).toBe(false);
    expect(chromeHidden()).toBe(false);
    expect(pointerHidden()).toBe(false);
  });

  it("releases the chrome on the first movement after a run ends", () => {
    setTestActive(true);
    Focus.set(true);
    mousemove();
    expect(chromeHidden()).toBe(true);

    // `finish()` and `restart()` both clear this.
    setTestActive(false);
    mousemove();

    expect(getFocus()).toBe(false);
    expect(chromeHidden()).toBe(false);
  });

  it("leaves the escape hatches alone: an explicit release still works mid-run", () => {
    setTestActive(true);
    Focus.set(true);

    // What the command palette (`commandline.ts`) and every navigation
    // (`page-controller.ts`) call. Only *passive movement* was made inert.
    Focus.set(false);

    expect(getFocus()).toBe(false);
    expect(chromeHidden()).toBe(false);
  });

  it("ignores sub-threshold jitter outside a run, as before", () => {
    Focus.set(true);

    mousemove(1);

    expect(getFocus()).toBe(true);
    expect(chromeHidden()).toBe(true);
  });

  it("does nothing at all during a page transition", () => {
    PageTransition.set(true);
    Focus.set(true);

    mousemove();

    expect(getFocus()).toBe(true);
  });
});
