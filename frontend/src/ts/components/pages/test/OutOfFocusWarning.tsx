import { Show } from "solid-js";

import {
  outOfFocusMaxHeight,
  showOutOfFocusWarning,
  testFocusState,
} from "../../../states/test";
import { Icon } from "../../common/Icon";

/**
 * CP-083 — appears after 1 s of lost focus, with monkeytype's two messages
 * unchanged. CP-085: regaining focus lifts *this* blur and never the pre-start
 * one, which is a separate class on a separate signal.
 */
export function OutOfFocusWarning() {
  const message = () =>
    testFocusState() === "unfocusedWindow"
      ? "Click anywhere to focus the window"
      : "Click here or press any key to focus";

  return (
    <Show when={showOutOfFocusWarning()}>
      <div
        class="pointer-events-none absolute z-999 flex h-full w-full place-content-center items-center gap-2 text-center text-base select-none"
        style={{
          "max-height":
            outOfFocusMaxHeight() !== undefined
              ? `${outOfFocusMaxHeight()}px`
              : undefined,
        }}
      >
        <div>
          <Icon icon="ph:cursor-bold" fixedWidth />
        </div>
        <div>{message()}</div>
      </div>
    </Show>
  );
}
