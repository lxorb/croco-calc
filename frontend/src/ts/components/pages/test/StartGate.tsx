import { Show, createEffect, createSignal, on, onCleanup } from "solid-js";

import { focusInputElement } from "../../../input/input-element";
import { isPreStart, showOutOfFocusWarning } from "../../../states/test";
import * as TestLogic from "../../../test/test-logic";
import { Button } from "../../common/Button";

/**
 * TR-040 — the `start test` control that owns the `preStart` arena.
 *
 * This was a passive `type a digit to start` hint. That made starting a run
 * depend entirely on a hidden field holding focus, and nothing reliably
 * restored that focus once a click moved it to `<body>` — the page then looked
 * live but swallowed every keystroke. A real, focusable button cannot be
 * defeated by focus living elsewhere, and that fix is preserved here verbatim.
 *
 * TR-041 — typing an accepted answer character still starts the run, and that
 * character still enters the buffer (it is not consumed by the start). The
 * button is the discoverable path; the keystroke is the fast path for repeat
 * users. Both funnel through the same `TestLogic.startTest()` routine.
 *
 * It yields to the out-of-focus warning rather than stacking two centred
 * messages in the same box.
 */
const FADE_MS = 250;

/**
 * The button's start path: start the run, then hand the keyboard to
 * `#answerInput` so the user types the first answer without a second click.
 */
export function startTestFromButton(): void {
  TestLogic.startTest();
  focusInputElement(true);
}

export function StartGate() {
  const wanted = (): boolean => isPreStart() && !showOutOfFocusWarning();
  const [mounted, setMounted] = createSignal(wanted());
  const [fading, setFading] = createSignal(false);
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const clear = (): void => {
    if (timeout === undefined) return;
    clearTimeout(timeout);
    timeout = undefined;
  };

  createEffect(
    on(wanted, (show, previous) => {
      if (show) {
        clear();
        setFading(false);
        setMounted(true);
        return;
      }
      // `previous === undefined` is the first run: nothing is on screen to fade.
      if (previous !== true) return;
      setFading(true);
      timeout = setTimeout(() => {
        timeout = undefined;
        setMounted(false);
        setFading(false);
      }, FADE_MS);
    }),
  );

  onCleanup(clear);

  return (
    <Show when={mounted()}>
      <div
        id="startGate"
        classList={{ "hidden-hint": fading() }}
        class="pointer-events-none absolute z-999 flex h-full w-full place-content-center items-center gap-2 text-center text-base select-none"
      >
        <Button
          variant="button"
          text="start test"
          icon={{ icon: "ph:play-bold", fixedWidth: true }}
          class="pointer-events-auto px-[1.25em]"
          dataset={{ "data-test-id": "startTestButton" }}
          onClick={startTestFromButton}
        />
      </div>
    </Show>
  );
}
