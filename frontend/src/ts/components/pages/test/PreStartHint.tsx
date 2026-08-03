import { Show, createEffect, createSignal, on, onCleanup } from "solid-js";

import { focusInputElement } from "../../../input/input-element";
import { isPreStart, showOutOfFocusWarning } from "../../../states/test";
import * as TestLogic from "../../../test/test-logic";
import { Button } from "../../common/Button";

/**
 * CP-048 — the affordance over the hidden stream.
 *
 * This used to be the passive hint `type a digit to start`. That made starting
 * a run depend entirely on the hidden capture textarea holding focus, and
 * nothing reliably restored that focus once a click moved it to `<body>` — the
 * page then looked live but swallowed every keystroke. The primary affordance
 * is now a real button, which cannot be defeated by focus living elsewhere.
 *
 * Typing an accepted symbol still starts the test (see `input/listeners/key.ts`
 * and `event-handlers/global.ts`), because it is faster for repeat users, but
 * it is now a shortcut rather than the only way in.
 *
 * Geometry is `OutOfFocusWarning`'s, so the two occupy the same box. It yields
 * to that warning rather than stacking two centred messages.
 *
 * CP-051 — the control fades out over the same 0.25 s the reveal takes, so it
 * cannot simply be unmounted when `preStart` drops. `hidden-hint` drives the
 * `opacity` transition declared in `test.scss`; the node is removed only once
 * that has played out.
 */
const FADE_MS = 250;

/**
 * The one place the button's start path lives: reveal + clock, then hand the
 * keyboard to the capture textarea so the user types the first answer without
 * a second click.
 */
export function startTestFromButton(): void {
  TestLogic.startTest();
  focusInputElement(true);
}

export function PreStartHint() {
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
        id="preStartHint"
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
