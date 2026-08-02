import { JSXElement, Show } from "solid-js";
import { envConfig } from "virtual:env-config";

import { getIsScreenshotting } from "../../../states/core";
import { showModal } from "../../../states/modals";
import { cn } from "../../../utils/cn";
import { isDevEnvironment } from "../../../utils/env";
import { Button } from "../../common/Button";
import { Icon } from "../../common/Icon";
import { ScrollToTop } from "../footer/ScrollToTop";
import { Banners } from "./Banners";
import { FpsCounter } from "./FpsCounter";
import { LoaderBar } from "./LoaderBar";
import { MediaQueryDebugger } from "./MediaQueryDebugger";
import { Notifications } from "./Notifications";

export function Overlays(): JSXElement {
  return (
    <>
      <ScrollToTop />
      <button
        type="button"
        id="commandLineMobileButton"
        class={cn(
          "fixed bottom-8 left-8 z-99 hidden h-12 w-12 rounded-full bg-main text-center leading-12 text-bg",
          {
            "opacity-0": getIsScreenshotting(),
          },
        )}
        onClick={() => {
          showModal("Commandline");
        }}
        tabIndex="-1"
      >
        <Icon icon="ph:terminal-window-bold" />
      </button>
      <Banners />
      <Notifications />
      <MediaQueryDebugger />
      <LoaderBar />
      <FpsCounter />
      <Show when={isDevEnvironment()}>
        <DevButtons />
      </Show>
    </>
  );
}

function DevButtons(): JSXElement {
  return (
    <div class="fixed top-30 left-0 z-10000 flex w-max flex-col gap-2 text-xs">
      <Button
        href={`${envConfig.backendUrl}/configure/`}
        balloon={{
          text: "Configure server",
          position: "right",
        }}
        icon={{
          icon: "ph:hard-drives-bold",
        }}
        class="rounded-tl-none rounded-bl-none p-2"
      />
      <Button
        balloon={{
          text: "Dev options",
          position: "right",
        }}
        onClick={() => showModal("DevOptions")}
        icon={{
          icon: "ph:flask-bold",
        }}
        class="rounded-tl-none rounded-bl-none p-2"
      />
    </div>
  );
}
