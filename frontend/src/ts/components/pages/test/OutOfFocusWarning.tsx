import { Show } from "solid-js";

import { showOutOfFocusWarning, testFocusState } from "../../../states/test";
import { Icon } from "../../common/Icon";

/**
 * CP-083 / TR-148 — appears after 1 s of lost focus, with the two messages
 * unchanged, overlaying `#taskArena`.
 *
 * TR-212 — the JS-measured `outOfFocusMaxHeight` inline style is gone: the
 * warning now covers the arena via `position: absolute; inset: 0` in
 * `test.scss`, so there is nothing left to measure. TR-149: regaining focus
 * lifts this blur and MUST NOT change `data-state` — in particular it never
 * starts a `preStart` run and never continues from `awaitingContinue`.
 */
export function OutOfFocusWarning() {
  const message = () =>
    testFocusState() === "unfocusedWindow"
      ? "Click anywhere to focus the window"
      : "Click here or press any key to focus";

  return (
    <Show when={showOutOfFocusWarning()}>
      <div class="pointer-events-none absolute inset-0 z-999 flex place-content-center items-center gap-2 text-center text-base select-none">
        <div>
          <Icon icon="ph:cursor-bold" fixedWidth />
        </div>
        <div>{message()}</div>
      </div>
    </Show>
  );
}
