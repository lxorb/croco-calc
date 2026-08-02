import { JSXElement, Show } from "solid-js";

import { cn } from "../../utils/cn";
import { Icon, IconProps } from "./Icon";

export function H2(props: {
  id?: string;
  class?: string;
  text: string;
  icon?: IconProps;
}): JSXElement {
  return (
    <h2
      id={props.id}
      class={cn(
        "flex place-items-center gap-[0.5em] pb-[0.5em] text-[2.25em] text-sub",
        props.class,
      )}
    >
      <Show when={props.icon}>
        <Icon {...(props.icon as IconProps)} />
      </Show>
      {props.text}
    </h2>
  );
}

// oxlint-disable-next-line croco-calc-rules/one-component-per-file
export function H3(props: {
  id?: string;
  class?: string;
  text: string;
  icon: IconProps;
}): JSXElement {
  return (
    <h3
      id={props.id}
      class={cn(
        "flex place-items-center gap-[0.5em] pb-[0.5em] text-[1em] text-sub",
        props.class,
      )}
    >
      <Icon {...props.icon} />
      {props.text}
    </h3>
  );
}
