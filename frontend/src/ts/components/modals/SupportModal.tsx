import { For, JSXElement, Show } from "solid-js";

import { COMING_SOON_TOOLTIP, SUPPORT_LINKS } from "../../constants/links";
import { AnimatedModal } from "../common/AnimatedModal";
import { Balloon } from "../common/Balloon";
import { Button } from "../common/Button";
import { Icon } from "../common/Icon";

/**
 * CP-157 … CP-163.
 *
 * monkeytype's `Buy Merch` button is gone (CP-159), leaving three buttons in a
 * three-column grid (CP-161). Ads, ko-fi and patreon are all deferred, so each
 * button reads its target from `SUPPORT_LINKS` and renders disabled with a
 * `coming soon` tooltip while that target is `null`/`false` (CP-162, CP-163).
 * The tooltip sits on a wrapper because a disabled button sets
 * `pointer-events: none` and would never see the hover itself.
 */
const BUTTONS: { label: string; icon: string; href: () => string | null }[] = [
  {
    label: "Enable Ads",
    icon: "ph:megaphone-bold",
    href: () => null,
  },
  {
    label: "Donate",
    icon: "ph:hand-heart-bold",
    href: () => SUPPORT_LINKS.kofi,
  },
  {
    label: "Join Patreon",
    icon: "ph:patreon-logo-bold",
    href: () => SUPPORT_LINKS.patreon,
  },
];

export function SupportModal(): JSXElement {
  const buttonClass =
    "p-4 flex flex-col text-md h-full justify-center items-center";
  const iconScale = 2;

  return (
    <AnimatedModal
      id="Support"
      title="Support croco calc"
      modalClass="max-w-4xl"
    >
      <div>
        Thank you so much for thinking about supporting this project. It would
        not be possible without you and your continued support.{" "}
        <Icon icon="ph:heart-fill" />
      </div>
      <div class="grid grid-cols-1 gap-4 xs:grid-cols-2 md:grid-cols-3">
        <For each={BUTTONS}>
          {(button) => (
            <Show
              when={button.href()}
              fallback={
                <Balloon text={COMING_SOON_TOOLTIP} position="up">
                  <Button
                    variant="button"
                    disabled
                    icon={{
                      icon: button.icon,
                      fixedWidth: true,
                      size: iconScale,
                    }}
                    text={button.label}
                    class={`${buttonClass} w-full`}
                  />
                </Balloon>
              }
            >
              {(href) => (
                <Button
                  variant="button"
                  href={href()}
                  icon={{
                    icon: button.icon,
                    fixedWidth: true,
                    size: iconScale,
                  }}
                  text={button.label}
                  class={buttonClass}
                />
              )}
            </Show>
          )}
        </For>
      </div>
    </AnimatedModal>
  );
}
