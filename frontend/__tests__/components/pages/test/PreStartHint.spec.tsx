import { cleanup, render } from "@solidjs/testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PreStartHint } from "../../../../src/ts/components/pages/test/PreStartHint";
import { setPreStart } from "../../../../src/ts/states/test";

/**
 * CP-048 / CP-051 — the hint over the hidden stream, and its fade.
 *
 * CP-051 is explicit that the hint "MUST fade out over the same 0.25 s" as the
 * reveal. Unmounting it the instant `preStart` drops satisfies neither the
 * requirement nor the `transition` declared for `#preStartHint` in `test.scss`,
 * so the node has to outlive the signal by exactly one transition.
 *
 * Note: the shared jsx harness replaces `document.querySelector` with a stub,
 * so everything below queries through the render container instead.
 */
describe("PreStartHint", () => {
  let container: HTMLElement;

  beforeEach(() => {
    vi.useFakeTimers();
    setPreStart(true);
    container = render(() => <PreStartHint />).container;
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  function hint(): HTMLElement | null {
    return container.querySelector<HTMLElement>("#preStartHint");
  }

  it("is shown, fully opaque, while the stream is hidden (CP-048)", () => {
    expect(hint()).not.toBeNull();
    expect(hint()?.classList.contains("hidden-hint")).toBe(false);
    expect(hint()?.textContent).toContain("type a digit to start");
  });

  it("fades for 0.25 s before it leaves the document (CP-051)", () => {
    setPreStart(false);
    // Still mounted, now transparent — this is the fade the requirement asks
    // for; a bare `<Show>` on `isPreStart()` would already have removed it.
    expect(hint()).not.toBeNull();
    expect(hint()?.classList.contains("hidden-hint")).toBe(true);

    vi.advanceTimersByTime(249);
    expect(hint()).not.toBeNull();

    vi.advanceTimersByTime(1);
    expect(hint()).toBeNull();
  });

  it("comes back fully opaque when the test restarts (CP-052)", () => {
    setPreStart(false);
    vi.advanceTimersByTime(250);
    expect(hint()).toBeNull();

    setPreStart(true);
    expect(hint()).not.toBeNull();
    expect(hint()?.classList.contains("hidden-hint")).toBe(false);
  });

  it("cancels a pending fade if the stream is re-hidden mid-transition", () => {
    setPreStart(false);
    vi.advanceTimersByTime(100);
    setPreStart(true);
    expect(hint()?.classList.contains("hidden-hint")).toBe(false);

    // The cancelled timeout must not fire and unmount a visible hint.
    vi.advanceTimersByTime(500);
    expect(hint()).not.toBeNull();
    expect(hint()?.classList.contains("hidden-hint")).toBe(false);
  });
});
