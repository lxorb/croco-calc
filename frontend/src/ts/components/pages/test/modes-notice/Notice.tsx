import { ParentProps, Show } from "solid-js";

import { CommandlineSubgroupKey } from "../../../../commandline/types";
import { showCommandLineForConfig } from "../../../../states/core";
import { cn } from "../../../../utils/cn";
import { OneOf } from "../../../../utils/types";
import { Button } from "../../../common/Button";
import { Icon } from "../../../common/Icon";

/**
 * One entry in the strip under the settings bar. Either a plain `div` or —
 * when `onClick`/`openCommandline` is supplied — a clickable text button that
 * opens the command palette on the relevant subgroup (SB-181).
 *
 * `icon` is an iconify id (master C10), not a font awesome class.
 */
export function Notice(
  props: {
    when: boolean | undefined;
    icon?: string;
    class?: string;
  } & OneOf<{ children: ParentProps["children"]; text: string | undefined }> &
    Partial<
      OneOf<{ onClick: () => void; openCommandline: CommandlineSubgroupKey }>
    >,
) {
  const isButton = () =>
    props.onClick !== undefined || props.openCommandline !== undefined;

  const ButtonNotice = () => (
    <Button
      class={cn("h-full gap-3", props.class)}
      variant="text"
      onClick={
        props.onClick ??
        (() =>
          showCommandLineForConfig(
            props.openCommandline as CommandlineSubgroupKey,
          ))
      }
    >
      <Show when={props.icon !== undefined}>
        <Icon icon={props.icon as string} />
      </Show>
      {props.children ?? props.text}
    </Button>
  );

  const DivNotice = () => (
    <div class={cn("flex items-center gap-2", props.class)}>
      <Show when={props.icon !== undefined}>
        <Icon icon={props.icon as string} />
      </Show>
      {props.children ?? props.text}
    </div>
  );

  return (
    <Show when={props.when}>
      <Show when={isButton()} fallback={<DivNotice />}>
        <ButtonNotice />
      </Show>
    </Show>
  );
}
