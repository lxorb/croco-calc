import { JSXElement, Show } from "solid-js";

import { get as getServerConfiguration } from "../../../ape/server-configuration";
import { signOut } from "../../../auth";
import { getSnapshot } from "../../../states/snapshot";
import { Button } from "../../common/Button";
import { NotificationBubble } from "../../common/NotificationBubble";

type Props = {
  showFriendsNotificationBubble?: boolean;
};

export function AccountMenu(props: Props): JSXElement {
  const buttonClass =
    "w-full justify-start px-3 py-2 whitespace-nowrap gap-2 bg-transparent";

  return (
    <div
      class="pointer-events-none absolute right-0 z-1000 w-auto text-xs opacity-0 transition-opacity duration-125"
      data-ui-element="accountMenu"
    >
      <div class="h-3"></div>
      <div
        class="grid grid-flow-row rounded bg-sub-alt ring-6 ring-bg"
        data-ui-element="accountMenu"
      >
        <Button
          text="User stats"
          class={buttonClass}
          icon={{
            icon: "ph:chart-line-bold",
            fixedWidth: true,
          }}
          href="/account"
          router-link
        />
        <Show when={getServerConfiguration()?.connections.enabled}>
          <Button
            text="Friends"
            class={`${buttonClass} relative`}
            icon={{
              icon: "ph:users-bold",
              fixedWidth: true,
            }}
            href="/friends"
            router-link
          >
            <NotificationBubble
              show={props.showFriendsNotificationBubble ?? false}
              variant="center"
              class="right-2 left-auto"
            />
          </Button>
        </Show>
        <Button
          text="Public profile"
          class={buttonClass}
          icon={{
            icon: "ph:globe-hemisphere-west-bold",
            fixedWidth: true,
          }}
          href={`/profile/${getSnapshot()?.name ?? ""}`}
          router-link
        />
        <Button
          text="Account settings"
          class={buttonClass}
          icon={{
            icon: "ph:gear-bold",
            fixedWidth: true,
          }}
          href="/account-settings"
          router-link
        />
        <Button
          text="Sign out"
          class={buttonClass}
          icon={{
            icon: "ph:sign-out-bold",
            fixedWidth: true,
          }}
          onClick={() => {
            signOut();
          }}
        />
      </div>
    </div>
  );
}
