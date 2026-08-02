import { COMPATIBILITY_CHECK } from "@croco-calc/contracts";
import { JSXElement, Show, createSignal } from "solid-js";
import { envConfig } from "virtual:env-config";

import { lastSeenServerCompatibility } from "../../../ape/adapters/ts-rest-adapter";
import { getVersion } from "../../../states/core";
import { showModal } from "../../../states/modals";
import { isDevEnvironment } from "../../../utils/env";
import { Icon } from "../../common/Icon";

export function VersionButton(): JSXElement {
  const [indicatorVisible, setIndicatorVisible] = createSignal(true);
  const getVersionText = (): string => {
    if (isDevEnvironment()) {
      return "localhost";
    }
    return getVersion().text;
  };

  const handleClick = (e: MouseEvent): void => {
    if (e.shiftKey) {
      alert(
        JSON.stringify(
          {
            clientVersion: envConfig.clientVersion,
            clientCompatibility: COMPATIBILITY_CHECK,
            lastSeenServerCompatibility,
          },
          null,
          2,
        ),
      );
    } else {
      showModal("VersionHistory");
      setIndicatorVisible(false);
    }
  };

  const handleIndicatorClick = (e: MouseEvent): void => {
    e.stopPropagation();
    setIndicatorVisible(false);
  };

  const showNewIndicator = (): boolean =>
    !isDevEnvironment() && getVersion().isNew && indicatorVisible();

  return (
    <button type="button" class="textButton flex" onClick={handleClick}>
      <Icon icon="ph:git-branch-bold" fixedWidth />
      <div class="text">{getVersionText()}</div>
      <Show when={showNewIndicator()}>
        <div
          class="rounded-half bg-main px-1 text-bg"
          onClick={handleIndicatorClick}
        >
          new
        </div>
      </Show>
    </button>
  );
}
