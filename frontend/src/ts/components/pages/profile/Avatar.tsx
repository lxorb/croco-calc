import { JSXElement } from "solid-js";

import { cn } from "../../../utils/cn";

/**
 * AC-047 — the profile avatar.
 *
 * The upstream `DiscordAvatar` fetched `cdn.discordapp.com`; Discord is
 * deferred in full (AC-167, INV-190), so v1 renders the crocodile app icon as
 * the one and only avatar. The mark is served as a static asset by WP-12 and is
 * masked into `currentColor` so it inherits the card's text colour and needs no
 * theme-specific artwork.
 */
export function Avatar(props: { class?: string; size?: number }): JSXElement {
  return (
    <div
      class={cn("aspect-square text-sub", props.class)}
      role="img"
      aria-label="avatar"
      style={{
        "mask-image": "url(/images/logo/croco-mark.svg)",
        "mask-size": "contain",
        "mask-repeat": "no-repeat",
        "mask-position": "center",
        "background-color": "currentColor",
        width: props.size !== undefined ? `${props.size}px` : undefined,
      }}
    ></div>
  );
}
