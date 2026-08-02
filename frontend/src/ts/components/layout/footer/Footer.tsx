import { JSXElement, Show } from "solid-js";

import {
  COMING_SOON_TOOLTIP,
  GITHUB_REPO_URL,
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
import { VersionButton } from "./VersionButton";

/**
 * CP-012 — exactly seven buttons, in this order, each with a fixed-width
 * leading icon. The upstream `twitter` button is gone (CP-013).
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
          <Button
            variant="text"
            text="support"
            icon={{
              icon: "ph:hand-heart-bold",
              fixedWidth: true,
            }}
            onClick={() => showModal("Support")}
          />
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
            CP-017: the discord invite does not exist yet, so the button renders
            disabled with a `coming soon` tooltip rather than linking nowhere.
            The tooltip lives on a wrapper because a disabled button sets
            `pointer-events: none` and would never see the hover itself.
          */}
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
        <div class="flex flex-col items-end text-right lg:flex-row">
          <ThemeIndicator />
          <VersionButton />
        </div>
      </div>
    </footer>
  );
}
