import { createForm } from "@tanstack/solid-form";
import { compressToURI } from "lz-ts";
import { For, JSXElement, Show } from "solid-js";

import { getBarLabel, BAR_ORDER } from "../../config/bar-controls";
import { configMetadata } from "../../config/metadata";
import { getConfig } from "../../config/store";
import { showSuccessNotification } from "../../states/notifications";
import { capitalizeFirstLetter } from "../../utils/strings";
import { AnimatedModal } from "../common/AnimatedModal";
import { Button } from "../common/Button";
import { Icon } from "../common/Icon";
import { Checkbox } from "../ui/form/Checkbox";

/**
 * SB-193 — the shared-settings URL encodes croco calc's eight config keys
 * instead of monkeytype's `[mode, mode2, customText, punctuation, numbers,
 * language, difficulty, funbox]` tuple. The `?testSettings=` parameter name and
 * the `lz-ts` `compressToURI` encoding are unchanged, so the whole surrounding
 * mechanism (and `controllers/url-handler.tsx`) keeps working.
 *
 * The tuple order below is the wire format. It MUST match
 * `SHARED_SETTINGS_ORDER` in `controllers/url-handler.tsx`, which is imported
 * from here so there is exactly one declaration.
 */
export const SHARED_SETTINGS_ORDER = [
  "addition",
  "multiplication",
  "division",
  "fractionAddition",
  "fractionMultiplication",
  "decimals",
  "negatives",
  "time",
] as const;

export type SharedTestSettings = (string | number | boolean | null)[];

export function ShareTestSettings(): JSXElement {
  const form = createForm(() => ({
    defaultValues: Object.fromEntries(
      SHARED_SETTINGS_ORDER.map((key) => [key, true]),
    ) as Record<(typeof SHARED_SETTINGS_ORDER)[number], boolean>,
  }));

  const formValues = form.useStore((s) => s.values);

  const url = () => {
    const baseUrl = `${location.origin}?testSettings=`;
    const values = formValues();
    const settings: SharedTestSettings = SHARED_SETTINGS_ORDER.map((key) =>
      values[key] ? getConfig[key] : null,
    );

    return baseUrl + compressToURI(JSON.stringify(settings));
  };

  return (
    <AnimatedModal id="ShareTestSettings" title="Share test settings">
      <For each={BAR_ORDER}>
        {(key) => (
          <form.Field name={key}>
            {(field) => (
              <Checkbox
                field={() => field()}
                class="items-start"
                label={
                  <div>
                    <div>
                      {capitalizeFirstLetter(
                        configMetadata[key].displayString ?? key,
                      )}
                    </div>
                    <div class="text-em-xs text-sub">
                      {getBarLabel(key, getConfig[key] as never)}
                    </div>
                  </div>
                }
              />
            )}
          </form.Field>
        )}
      </For>
      <textarea
        placeholder="url"
        value={url()}
        readOnly
        onClick={(e) => e.currentTarget.select()}
      ></textarea>
      <Button
        variant="button"
        text="copy to clipboard"
        onClick={() => {
          void navigator.clipboard
            .writeText(url())
            .then(() => {
              showSuccessNotification("URL copied to clipboard");
            })
            .catch((error: unknown) => {
              showSuccessNotification("Failed to copy URL", { error });
            });
        }}
      >
        <Icon icon="ph:copy-bold" />
      </Button>
      <Show when={url().length > 2000}>
        <div class="flex place-items-center gap-2 text-xs text-error">
          <Icon icon="ph:warning-bold" />
          <span>The URL is over 2000 characters long - it might not work</span>
        </div>
      </Show>
    </AnimatedModal>
  );
}
