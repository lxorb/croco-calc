import { createEffect, createSignal, JSXElement } from "solid-js";

import { getAcceptedCookies, setAcceptedCookies } from "../../cookies";
import { hideModal, isModalOpen } from "../../states/modals";
import { AnimatedModal } from "../common/AnimatedModal";
import { AnimeSwitch } from "../common/anime";
import { AnimeMatch } from "../common/anime/AnimeMatch";
import { Button } from "../common/Button";
import { H3 } from "../common/Headers";

/**
 * The cookie consent gate (INV-118h).
 *
 * INV-118h keeps the gate and says the analytics/ads consent options may be
 * trimmed — and they have to be, because there is nothing left to consent to:
 * Google Analytics goes with `analytics-controller` (INV-118e), Sentry goes
 * with `sentry.ts` (INV-118d, A-08) and ads are not built in this stage
 * (CP-006). What remains is the strictly necessary category, so the modal is a
 * single acknowledgement rather than a preference sheet.
 *
 * The `more options` route is kept rather than collapsed into one button: it is
 * what lets the essential-only category, and the reason it cannot be switched
 * off, actually be read. If a non-essential category is ever added it slots
 * straight back into `SettingsSection`.
 */
export function CookiesModal(): JSXElement {
  const [showSettings, setShowSettings] = createSignal(false);
  const [accepted, setAccepted] = createSignal(
    getAcceptedCookies() ?? { security: true },
  );

  createEffect(() => {
    if (!isModalOpen("Cookies")) {
      setShowSettings(false);
      setAccepted({ security: true });
    }
  });

  return (
    <AnimatedModal
      id="Cookies"
      modalClass="max-w-[500px]"
      wrapperClass="justify-end items-end"
      closeOnEscape={false}
      closeOnWrapperClick={false}
    >
      <H3
        text="We use cookies by the way"
        icon={{ icon: "ph:cookie-bold" }}
        class="mb-0 pb-0 text-2xl"
      />
      <AnimeSwitch
        exitBeforeEnter
        animeProps={{
          initial: {
            opacity: 0,
            duration: 125,
          },
          animate: {
            opacity: 1,
            duration: 125,
          },
          exit: {
            opacity: 0,
            duration: 125,
          },
        }}
      >
        <AnimeMatch when={!showSettings()}>
          <div class="grid gap-4">
            <div>
              We only use the cookies this site needs to work. There is no
              tracking and no advertising.
            </div>
            <div class="grid gap-2">
              <Button
                text="ok"
                active={true}
                onClick={() => {
                  setAcceptedCookies(accepted());
                  hideModal("Cookies");
                }}
              />
              <Button
                text="more options"
                onClick={() => setShowSettings(true)}
              />
            </div>
          </div>
        </AnimeMatch>
        <AnimeMatch when={showSettings()}>
          <div class="grid gap-4">
            <SettingsSection
              title="security"
              description={
                <div>
                  We use Cloudflare cookies to improve security and performance
                  of our site. They do not store any personal information and
                  are required.
                </div>
              }
              checked={true}
              disabled={true}
            />
            <div class="text-sub">
              That is the whole list — there are no optional categories to turn
              off.
            </div>
            <Button
              text="ok"
              onClick={() => {
                setAcceptedCookies(accepted());
                hideModal("Cookies");
              }}
            />
          </div>
        </AnimeMatch>
      </AnimeSwitch>
    </AnimatedModal>
  );
}

function SettingsSection(props: {
  title: string;
  description: string | JSXElement;
  checked: boolean;
  disabled?: boolean;
  hideCheckbox?: boolean;
  onChange?: (checked: boolean) => void;
}): JSXElement {
  return (
    <label class="grid grid-cols-[auto_1fr] items-center gap-2">
      <div class="grid gap-1">
        <div class="text-sub">{props.title}</div>
        <div class="text-text">{props.description}</div>
      </div>
      <input
        type="checkbox"
        class="text-2xl"
        checked={props.checked}
        disabled={props.disabled}
        hidden={props.hideCheckbox}
        onChange={(e) => props.onChange?.(e.currentTarget.checked)}
      />
    </label>
  );
}
