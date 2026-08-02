import { For, JSXElement } from "solid-js";

import {
  getBarLabel,
  getBarTooltip,
  isBarValueOff,
  BAR_PILLS,
} from "../../config/bar-controls";
import { BarKey, isDecimalsDisabled } from "../../config/coupling";
import { configMetadata } from "../../config/metadata";
import { cycleSetting } from "../../config/setters";
import { getConfig } from "../../config/store";
import { restartTestEvent } from "../../events/test";
import { showModal } from "../../states/modals";
import { AnimatedModal } from "../common/AnimatedModal";
import { Button } from "../common/Button";
import { Icon } from "../common/Icon";
import { Separator } from "../common/Separator";

/**
 * The mobile settings bar (SB-166 … SB-168).
 *
 * The eight controls are rendered as full-width rows in three
 * `Separator`-delimited groups matching the three pills of the desktop bar, and
 * each row stays a **single cycling element** — tap advances to the next state.
 * The modal never expands a control into a per-option list, so the interaction
 * model is identical on both layouts (SB-167).
 */
function MobileControl(props: { configKey: BarKey }): JSXElement {
  const value = () => getConfig[props.configKey];
  const isOff = () => isBarValueOff(props.configKey, value());

  const isSettingDisabled = () =>
    props.configKey === "decimals" && isDecimalsDisabled(getConfig);

  const cycle = (direction: 1 | -1): void => {
    if (cycleSetting(props.configKey, direction)) {
      restartTestEvent.dispatch();
    }
  };

  return (
    <Button
      variant="button"
      class="w-full justify-start"
      active={!isOff()}
      disabled={isSettingDisabled()}
      balloon={{ text: getBarTooltip(props.configKey, value(), getConfig) }}
      dataset={{
        "data-setting": props.configKey,
        "data-value": String(value()),
      }}
      onClick={(e) => cycle(e.shiftKey ? -1 : 1)}
    >
      {/* SB-167 — `<icon> <control name>: <label>` */}
      <Icon icon={configMetadata[props.configKey].icon} fixedWidth />
      <span>{configMetadata[props.configKey].displayString}:</span>
      <span
        classList={{
          "[text-decoration-color:currentColor] [text-decoration-thickness:0.1em] line-through":
            isOff(),
        }}
      >
        {getBarLabel(props.configKey, value())}
      </span>
    </Button>
  );
}

function Group(props: { keys: readonly BarKey[] }): JSXElement {
  return (
    <div class="grid gap-2">
      <For each={props.keys}>
        {(configKey) => <MobileControl configKey={configKey} />}
      </For>
    </div>
  );
}

export function MobileTestConfigModal(): JSXElement {
  return (
    <AnimatedModal id="MobileTestConfig" modalClass="grid gap-4">
      <Group keys={BAR_PILLS.left} />
      <Separator />
      <Group keys={BAR_PILLS.centre} />
      <Separator />
      <Group keys={BAR_PILLS.right} />
      <Separator />
      {/* SB-168 — the share row is kept. */}
      <div class="grid gap-2">
        <Button
          variant="button"
          onClick={() => showModal("ShareTestSettings")}
          text="share"
        />
      </div>
    </AnimatedModal>
  );
}
