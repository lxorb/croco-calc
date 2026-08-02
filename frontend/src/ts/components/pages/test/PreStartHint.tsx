import { Show } from "solid-js";

import { isPreStart, showOutOfFocusWarning } from "../../../states/test";
import { Icon } from "../../common/Icon";

/**
 * CP-048 — the affordance over the hidden stream.
 *
 * The original copy `press any key to start` was **false as specified**:
 * CP-050 requires Tab, Escape, Enter, Space, arrows, function keys, modifiers,
 * clicks and focus changes to all do nothing. Master §2.31 corrects it to
 * `type a digit to start`, which names the common case; per CP-049 any accepted
 * answer character (`-`, `.`, `,`, `/` included) starts the test.
 *
 * Geometry is `OutOfFocusWarning`'s, so the two occupy the same box. It yields
 * to that warning rather than stacking two centred messages.
 */
export function PreStartHint() {
  return (
    <Show when={isPreStart() && !showOutOfFocusWarning()}>
      <div
        id="preStartHint"
        class="pointer-events-none absolute z-999 flex h-full w-full place-content-center items-center gap-2 text-center text-base select-none"
      >
        <div>
          <Icon icon="ph:keyboard-bold" fixedWidth />
        </div>
        <div>type a digit to start</div>
      </div>
    </Show>
  );
}
