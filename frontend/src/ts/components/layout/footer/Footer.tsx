import { JSXElement, Show } from "solid-js";

import {
  COMING_SOON_TOOLTIP,
  DEFERRED_FEATURES,
  GITHUB_REPO_URL,
  MONKEYTYPE_REPO_URL,
  SOCIAL_LINKS,
} from "../../../constants/links";
import { getIsScreenshotting } from "../../../states/core";
import { showModal } from "../../../states/modals";
import { getFocus } from "../../../states/test";
import { cn } from "../../../utils/cn";
import { Balloon } from "../../common/Balloon";
import { Button } from "../../common/Button";
import { Keytips } from "./Keytips";
import { ThemeIndicator } from "./ThemeIndicator";

/**
 * CP-012 — a fixed button order, each with a fixed-width leading icon. The
 * upstream `twitter` button is gone (CP-013); `support` and `discord` are
 * hidden behind `DEFERRED_FEATURES`, leaving contact / github / terms /
 * security / privacy.
 *
 * The bottom-right cluster is the theme indicator preceded by the upstream
 * credit. The upstream version/commit button that used to follow the theme
 * name is gone — the version check itself still runs on boot from
 * `ts/index.ts`.
 */
export function Footer(): JSXElement {
  const discordUrl = (): string | null => SOCIAL_LINKS.discord;

  return (
    <footer
      class={cn("relative text-xs text-sub", {
        "opacity-0": getIsScreenshotting(),
      })}
    >
      <Keytips />

      <div
        class="-m-2 flex justify-between gap-8 transition-opacity"
        classList={{
          "opacity-0": getFocus(),
        }}
      >
        <div class="grid grid-cols-1 justify-items-start xs:grid-cols-2 sm:grid-cols-4 lg:flex">
          <Button
            variant="text"
            text="contact"
            icon={{
              icon: "ph:envelope-simple-bold",
              fixedWidth: true,
            }}
            onClick={() => showModal("Contact")}
          />
          <Show when={DEFERRED_FEATURES.support}>
            <Button
              variant="text"
              text="support"
              icon={{
                icon: "ph:hand-heart-bold",
                fixedWidth: true,
              }}
              onClick={() => showModal("Support")}
            />
          </Show>
          <Button
            variant="text"
            text="github"
            icon={{
              icon: "ph:code-bold",
              fixedWidth: true,
            }}
            href={GITHUB_REPO_URL}
          />
          {/*
            CP-017, as amended: there is no discord server, so the button is not
            rendered at all. With `DEFERRED_FEATURES.discord` back on it falls
            back to the D4 treatment — a disabled button behind a `coming soon`
            tooltip while `SOCIAL_LINKS.discord` is still `null`. The tooltip
            lives on a wrapper because a disabled button sets
            `pointer-events: none` and would never see the hover itself.
          */}
          <Show when={DEFERRED_FEATURES.discord}>
            <Show
              when={discordUrl()}
              fallback={
                <Balloon text={COMING_SOON_TOOLTIP} position="up" inline>
                  <Button
                    variant="text"
                    text="discord"
                    icon={{
                      icon: "ph:discord-logo-bold",
                      fixedWidth: true,
                    }}
                    disabled
                  />
                </Balloon>
              }
            >
              {(url) => (
                <Button
                  variant="text"
                  text="discord"
                  icon={{
                    icon: "ph:discord-logo-bold",
                    fixedWidth: true,
                  }}
                  href={url()}
                />
              )}
            </Show>
          </Show>
          <Button
            variant="text"
            text="terms"
            icon={{
              icon: "ph:file-text-bold",
              fixedWidth: true,
            }}
            href="/terms-of-service.html"
          />
          <Button
            href="/security-policy.html"
            variant="text"
            text="security"
            icon={{
              icon: "ph:shield-bold",
              fixedWidth: true,
            }}
          />
          <Button
            href="/privacy-policy.html"
            variant="text"
            text="privacy"
            icon={{
              icon: "ph:lock-bold",
              fixedWidth: true,
            }}
          />
        </div>
        {/*
          The credit sits before the theme name so it reads as a trailing note
          rather than a call to action: on `lg` the cluster is a row and the two
          share a line, below that it stacks and the credit is the line above.
          It inherits the footer's `text-xs text-sub`, and `variant="text"`
          keeps it at sub colour until it is hovered, exactly like every other
          control down here.
        */}
        <div class="flex flex-col items-end text-right lg:flex-row">
          <Button
            variant="text"
            text={"Thanks to Miodec <3"}
            href={MONKEYTYPE_REPO_URL}
          />
          <ThemeIndicator />
        </div>
      </div>
    </footer>
  );
}
