import { JSXElement, Show } from "solid-js";

import { useCustomThemesLiveQuery } from "../../../collections/custom-themes";
import { setConfig } from "../../../config/setters";
import { Config } from "../../../config/store";
import { getThemeIndicator, isAuthenticated } from "../../../states/core";
import { showModal } from "../../../states/modals";
import { showNoticeNotification } from "../../../states/notifications";
import { Icon } from "../../common/Icon";

export function ThemeIndicator(): JSXElement {
  const themes = useCustomThemesLiveQuery();

  const handleClick = (e: MouseEvent): void => {
    if (e.shiftKey) {
      if (Config.customTheme) {
        setConfig("customTheme", false);
        return;
      }
      if (isAuthenticated() && themes().length < 1) {
        showNoticeNotification("No custom themes!");
        setConfig("customTheme", false);
        return;
      }
      setConfig("customTheme", true);
    } else {
      // CP-014 — the indicator opens the theme modal, which hosts both the
      // preset picker and the custom-theme editor (C9).
      showModal("Theme");
    }
  };

  return (
    <button
      type="button"
      class="textButton"
      aria-label="Shift-click to toggle custom theme"
      data-balloon-pos="left"
      onClick={handleClick}
    >
      <div class="relative">
        <Show when={getThemeIndicator().isFavorite}>
          <div class="absolute top-[-0.5em] right-[-0.5em] flex rounded-full bg-bg p-[0.25em]">
            <Icon icon="ph:star-bold" size={0.5} />
          </div>
        </Show>
        <Icon icon="ph:palette-bold" fixedWidth />
      </div>
      <div class="text">{getThemeIndicator().text}</div>
    </button>
  );
}
