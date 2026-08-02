import type { AnyFieldApi } from "@tanstack/solid-form";

import { Match, Switch } from "solid-js";

import { Balloon } from "../../common/Balloon";
import { Icon } from "../../common/Icon";
import { LoadingCircle } from "../../common/LoadingCircle";

export type FieldIndicatorProps = {
  field: AnyFieldApi;
  alwaysShow?: boolean;
};

export function FieldIndicator(props: FieldIndicatorProps) {
  //@ts-expect-error custom meta attributes
  const hasWarning = () => props.field.getMeta().hasWarning as boolean;
  //@ts-expect-error custom meta attributes
  const getWarnings = () => props.field.getMeta().warnings as string[];
  return (
    <div class="col-start-1 row-start-1 self-center justify-self-end pr-[0.40em]">
      <Switch>
        <Match when={props.field.state.meta.isValidating}>
          <LoadingCircle />
        </Match>
        <Match
          when={
            props.field.state.meta.isTouched && !props.field.state.meta.isValid
          }
        >
          <Balloon
            position="left"
            length="large"
            text={props.field.state.meta.errors.join(", ")}
          >
            <Icon icon="ph:x-bold" class="text-error" fixedWidth />
          </Balloon>
        </Match>
        <Match when={hasWarning()}>
          <Balloon
            position="left"
            length="large"
            text={getWarnings().join(", ")}
          >
            <Icon icon="ph:warning-bold" class="text-main" />
          </Balloon>
        </Match>
        <Match
          when={
            props.field.state.meta.isValid &&
            (props.alwaysShow === true ||
              (props.field.state.meta.isTouched &&
                !props.field.state.meta.isDefaultValue))
          }
        >
          <Icon icon="ph:check-bold" class="text-main" fixedWidth />
        </Match>
      </Switch>
    </div>
  );
}
