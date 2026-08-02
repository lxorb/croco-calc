import { Show, createEffect, createSignal, on, onCleanup } from "solid-js";

import { isPreStart, showOutOfFocusWarning } from "../../../states/test";
import { Icon } from "../../common/Icon";

/**
 * CP-048 — the affordance over the hidden stream.
 *
 * The original copy `press any key to start` was **false as specified**:
 * CP-050 requires Tab, Escape, Enter, Space, arrows, function keys, modifiers,
 * clicks and focus changes to all do nothing. Master §2.31 corrects it to
 * `type a digit to start`, which names the common case; per CP-049 any accepted
 * answer symbol (`-`, `.`, `,`, `/` included) starts the test.
 *
 * Geometry is `OutOfFocusWarning`'s, so the two occupy the same box. It yields
 * to that warning rather than stacking two centred messages.
 *
 * CP-051 — the hint fades out over the same 0.25 s the reveal takes, so it
 * cannot simply be unmounted when `preStart` drops. `hidden-hint` drives the
 * `opacity` transition declared in `test.scss`; the node is removed only once
 * that has played out.
 */
const FADE_MS = 250;

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
        <div>
          <Icon icon="ph:keyboard-bold" fixedWidth />
        </div>
        <div>type a digit to start</div>
      </div>
    </Show>
  );
}
