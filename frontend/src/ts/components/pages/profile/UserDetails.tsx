import {
  SolveStats as SolveStatsType,
  UserProfile,
  UserProfileDetails,
} from "@croco-calc/schemas/users";
import { differenceInDays } from "date-fns/differenceInDays";
import { formatDate } from "date-fns/format";
import { JSXElement, Show } from "solid-js";

import { addConnection, hasConnection } from "../../../collections/connections";
import { bp } from "../../../states/breakpoints";
import { getUserId, isAuthenticated } from "../../../states/core";
import { showModal } from "../../../states/modals";
import { showNoticeNotification } from "../../../states/notifications";
import { setUserToReport } from "../../../states/user-report";
import { cn } from "../../../utils/cn";
import { secondsToString } from "../../../utils/date-and-time";
import { formatXp, getXpDetails } from "../../../utils/levels";
import { formatTypingStatsRatio } from "../../../utils/misc";
import { AutoShrink } from "../../common/AutoShrink";
import { Balloon, BalloonProps } from "../../common/Balloon";
import { Bar } from "../../common/Bar";
import { Button } from "../../common/Button";
import { UserFlags } from "../../common/UserFlags";
import { EditProfile } from "../../modals/EditProfileModal";
import { Avatar } from "./Avatar";

/**
 * AC-052: the `keyboard` profile field is cut, so monkeytype's
 * `hasBioOrKeyboard` variant is renamed `hasBio` and keeps its layout classes
 * byte-for-byte.
 */
type Variant = "basic" | "hasSocials" | "hasBio" | "full";

/**
 * AC-045 … AC-054 — the profile header card.
 *
 * Streaks (master C17, AC-015) and badges (master C16) are removed; user flags
 * stay. The Discord avatar becomes the crocodile mark (AC-047) and
 * `typingStats` becomes `testStats` carrying `timeSpent` (AC-013, AC-014).
 */
export function UserDetails(props: {
  profile: UserProfile;
  isAccountPage?: true;
}): JSXElement {
  const variant = (): Variant => {
    if (props.profile.banned) return "basic";

    const hasSocials = props.profile.details?.socialProfiles !== undefined;
    const hasBio =
      props.profile.details?.bio !== undefined &&
      props.profile.details.bio !== "";
    if (!hasSocials && !hasBio) return "basic";
    if (hasSocials && !hasBio) return "hasSocials";
    if (!hasSocials && hasBio) return "hasBio";
    return "full";
  };

  return (
    <div class="grid grid-cols-[1fr_minmax(0,2rem)] rounded bg-sub-alt">
      <div
        class={cn(
          "grid items-center gap-4 p-4",
          variant() === "basic" && "md:grid-cols-[17.5rem_auto_1fr]",
          variant() === "hasBio" &&
            "sm:grid-cols-2 md:grid-cols-[17.5rem_auto_auto_auto_1fr] lg:grid-cols-[17.5rem_auto_1fr_auto_2fr]",
          variant() === "hasSocials" &&
            "sm:grid-cols-2 md:grid-cols-[17.5rem_auto_1fr_auto_auto]",
          variant() === "full" &&
            "sm:grid-cols-2 md:grid-cols-[1fr_auto_1fr_auto] lg:grid-cols-[17.5rem_auto_auto_auto_1fr_auto_auto] xl:lg:grid-cols-[17.5rem_auto_1fr_auto_2fr_auto_auto]",
        )}
      >
        <AvatarAndName profile={props.profile} variant={variant()} />
        <Show when={variant() === "full" || variant() === "hasBio"}>
          <Bio details={props.profile.details} variant={variant()} />
        </Show>
        <SolveStats stats={props.profile.testStats} variant={variant()} />
        <Show when={variant() === "full" || variant() === "hasSocials"}>
          <Socials
            socials={props.profile.details?.socialProfiles}
            variant={variant()}
          />
        </Show>
      </div>

      <div class="flex h-full flex-col">
        <ActionButtons
          profile={props.profile}
          isAccountPage={props.isAccountPage}
        />
      </div>
      <Show when={props.isAccountPage === true}>
        <EditProfile />
      </Show>
    </div>
  );
}

/** AC-053 on `/account`, AC-154 on a public profile. */
function ActionButtons(props: {
  profile: UserProfile;
  isAccountPage?: true;
}): JSXElement {
  const isUsersProfile = () =>
    props.profile.uid !== undefined &&
    props.profile.uid === (getUserId() ?? "");

  const showFriendsButton = () =>
    isAuthenticated() && !isUsersProfile() && !hasConnection(props.profile.uid);

  const handleAddFriend = () => {
    void addConnection({
      receiverName: props.profile.name,
      receiverUid: props.profile.uid,
    });
  };

  return (
    <Show
      when={props.isAccountPage === true}
      fallback={
        <>
          <Show when={!isUsersProfile()}>
            <Button
              balloon={{ text: "Report user", position: "left" }}
              class={cn(
                "h-full rounded-none rounded-tr text-sub hover:text-bg",
                {
                  "rounded-br": !showFriendsButton(),
                },
              )}
              icon={{ icon: "ph:flag-bold", fixedWidth: true }}
              onClick={() => {
                if (!isAuthenticated()) {
                  showNoticeNotification(
                    "You must be logged in to submit a report",
                  );
                  return;
                }
                setUserToReport(props.profile);
                showModal("UserReport");
              }}
            />
          </Show>
          <Show when={showFriendsButton()}>
            <Button
              balloon={{ text: "Send friend request", position: "left" }}
              class="h-full rounded-none rounded-br text-sub hover:text-bg"
              icon={{ icon: "ph:user-plus-bold", fixedWidth: true }}
              onClick={() => handleAddFriend()}
            />
          </Show>
        </>
      }
    >
      <Button
        balloon={{ text: "Edit profile", position: "left" }}
        class="h-full rounded-none rounded-tr text-sub hover:text-bg"
        icon={{ icon: "ph:pencil-simple-bold", fixedWidth: true }}
        onClick={() => {
          if (props.profile.banned === true) {
            showNoticeNotification("Banned users cannot edit their profile");
            return;
          }
          showModal("EditProfile");
        }}
      />
      <Button
        balloon={{ text: "Copy public link", position: "left" }}
        class="h-full rounded-none rounded-br text-sub hover:text-bg"
        icon={{ icon: "ph:link-bold", fixedWidth: true }}
        onClick={() => {
          const url = `${location.origin}/profile/${props.profile.name}`;

          navigator.clipboard.writeText(url).then(
            function () {
              showNoticeNotification("URL Copied to clipboard");
            },
            function () {
              alert(
                `Failed to copy using the Clipboard API. Here's the link: ${
                  url
                }`,
              );
            },
          );
        }}
      />
    </Show>
  );
}

function AvatarAndName(props: {
  profile: UserProfile;
  variant: Variant;
}): JSXElement {
  /** AC-049: `{N} day(s) ago`, on the `Joined` balloon. */
  const accountAgeHint = () => {
    const creationDate = new Date(props.profile.addedAt);
    const diffDays = differenceInDays(new Date(), creationDate);
    return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;
  };

  const balloonPosition = (): BalloonProps["position"] =>
    bp().md ? "right" : "up";

  return (
    <div
      class={cn(
        "grid w-full grid-cols-[5rem_1fr] items-center gap-4 self-center text-sub",
        props.variant === "hasSocials" && "sm:col-span-2 md:col-span-1",
      )}
    >
      <Avatar class="h-auto w-full place-self-center" />

      <div class="flex h-min flex-col gap-1 text-xs [&>div]:w-fit">
        <AutoShrink upperLimitRem={2} class="flex text-text">
          {props.profile.name}

          <div class="flex flex-row gap-1 pl-1 text-sub">
            <UserFlags
              {...props.profile}
              isFriend={hasConnection(props.profile.uid, "accepted")}
            />
          </div>
        </AutoShrink>
        <div class="grid">
          <Balloon inline text={accountAgeHint()} position={balloonPosition()}>
            Joined {formatDate(props.profile.addedAt ?? 0, "dd MMM yyyy")}
          </Balloon>
        </div>
      </div>

      <LevelAndBar xp={props.profile.xp} />
    </div>
  );
}

/** AC-050: level number, progress bar, `{current}/{max}` — all three ballooned. */
function LevelAndBar(props: { xp?: number }): JSXElement {
  const xpDetails = () => getXpDetails(props.xp ?? 0);
  const bar = () => xpDetails().levelProgressPercent;

  return (
    <div class="col-span-2 flex w-full items-center gap-2">
      <Balloon
        class="shrink-0 text-text"
        text={`${formatXp(props.xp ?? 0)} total xp`}
      >
        {xpDetails().level}
      </Balloon>
      <Bar percent={bar()} fill="main" bg="bg" showPercentageOnHover />
      <Balloon
        class="shrink-0 text-xs"
        text={`${formatXp(
          xpDetails().levelMaxXp - xpDetails().levelCurrentXp,
        )} xp until next level`}
      >
        {formatXp(xpDetails().levelCurrentXp)}/
        {formatXp(xpDetails().levelMaxXp)}{" "}
      </Balloon>
    </div>
  );
}

/** AC-052: bio only — the `keyboard` block is removed with the schema field. */
function Bio(props: {
  details?: UserProfileDetails;
  variant: Variant;
}): JSXElement {
  return (
    <>
      <div
        class={cn(
          "hidden h-full w-2 rounded bg-bg",
          props.variant === "hasBio" && "md:order-3 md:block",
          props.variant === "full" && "md:block lg:order-3",
        )}
      ></div>
      <div
        class={cn(
          "flex h-full flex-col content-center justify-around gap-2 overflow-hidden text-sm whitespace-pre-line",
          props.variant === "hasBio" && "md:order-4",
          props.variant === "full" && "md:col-span-2 lg:order-4 lg:col-span-1",
        )}
      >
        <Show
          when={
            props.details?.bio !== undefined && props.details.bio.length > 0
          }
        >
          <div>
            <div class="text-sub">bio</div>
            <div>{props.details?.bio}</div>
          </div>
        </Show>
      </div>
    </>
  );
}

/** AC-051: `tests started`, `tests completed`, `time spent`. */
function SolveStats(props: {
  stats: SolveStatsType;
  variant: Variant;
}): JSXElement {
  const ratios = () => formatTypingStatsRatio(props.stats);

  return (
    <>
      <div
        class={cn(
          "hidden h-full w-2 rounded bg-bg",
          props.variant === "basic" && "md:block",
          props.variant === "hasBio" && "md:order-1 md:block",
          props.variant === "hasSocials" && "md:block",
          props.variant === "full" && "lg:order-1 lg:block",
        )}
      ></div>
      <div
        class={cn(
          "grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-2",
          props.variant === "basic" &&
            "sm:grid-cols-3 md:grid-cols-1 lg:grid-cols-3 lg:text-[1.25rem]",
          props.variant === "hasBio" &&
            "sm:col-span-2 md:order-2 md:col-span-1 md:grid-cols-1",
          props.variant === "hasSocials" &&
            "sm:col-span-2 sm:grid-cols-3 md:col-span-1 md:grid-cols-1 lg:grid-cols-3 xl:text-[1.25rem]",
          props.variant === "full" &&
            "sm:col-span-2 sm:grid-cols-3 md:col-span-3 md:grid-cols-3 lg:order-2 lg:col-span-1 lg:grid-cols-1",
        )}
      >
        <div class="flex flex-col">
          <div class="text-em-sm text-sub">tests started</div>
          <div class="text-em-2xl leading-8">{props.stats.startedTests}</div>
        </div>
        <Balloon
          class="flex w-max flex-col"
          text={
            ratios().completedPercentage !== ""
              ? `${ratios().completedPercentage}% (${ratios().restartRatio} restarts per completed test)`
              : undefined
          }
        >
          <div class="text-em-sm text-sub">tests completed</div>
          <div class="text-em-2xl leading-8">{props.stats.completedTests}</div>
        </Balloon>
        <div class="flex flex-col">
          <div class="text-em-sm text-sub">time spent</div>
          <div class="text-em-2xl leading-8">
            {secondsToString(
              Math.round(props.stats.timeSpent ?? 0),
              true,
              true,
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function Socials(props: {
  socials?: UserProfileDetails["socialProfiles"];
  variant: Variant;
}): JSXElement {
  return (
    <>
      <div
        class={cn(
          "hidden h-full w-2 rounded bg-bg",
          props.variant === "hasSocials" && "md:block",
          props.variant === "full" && "md:hidden lg:order-5 lg:block",
        )}
      ></div>
      <div
        class={cn(
          "grid h-full md:place-content-center",
          props.variant === "full" && "lg:order-6",
        )}
      >
        <Show
          when={Object.values(props.socials ?? {}).some(
            (it) => it !== undefined && it.length > 0,
          )}
        >
          <div
            class={cn(
              "text-sm text-sub md:hidden",
              props.variant === "full" && "md:block lg:hidden",
            )}
          >
            socials
          </div>
        </Show>
        <div
          class={cn(
            "flex gap-2 text-2xl text-text md:flex-col lg:h-full lg:flex-col lg:justify-around [&>a]:p-0 [&>a]:text-text [&>a]:hover:text-main",
            props.variant === "full" && "md:flex-row",
          )}
        >
          <Show when={props.socials?.github}>
            <Button
              variant="text"
              icon={{ icon: "ph:github-logo-bold", fixedWidth: true }}
              href={`https://github.com/${props.socials?.github}`}
              balloon={{ text: props.socials?.github ?? "" }}
            />
          </Show>
          <Show when={props.socials?.twitter}>
            <Button
              variant="text"
              icon={{ icon: "ph:twitter-logo-bold", fixedWidth: true }}
              href={`https://x.com/${props.socials?.twitter}`}
              balloon={{ text: props.socials?.twitter ?? "" }}
            />
          </Show>
          <Show when={props.socials?.website}>
            <Button
              variant="text"
              icon={{ icon: "ph:globe-bold", fixedWidth: true }}
              href={props.socials?.website ?? ""}
              balloon={{ text: props.socials?.website ?? "" }}
            />
          </Show>
        </div>
      </div>
    </>
  );
}
