import {
  buildSettingsId,
  LEADERBOARD_SETTINGS_ID,
} from "@croco-calc/schemas/math";
import { PersonalBest, PersonalBests } from "@croco-calc/schemas/shared";
import {
  RankAndCount,
  UserProfile as UserProfileType,
} from "@croco-calc/schemas/users";
import { formatDate } from "date-fns/format";
import { createMemo, For, JSXElement, Show } from "solid-js";

import { getConfig } from "../../../config/store";
import { getFormatting } from "../../../states/core";
import { showPbTablesModal } from "../../../states/pb-tables-modal";
import { formatTopPercentage } from "../../../utils/misc";
import { Button } from "../../common/Button";
import { ActivityCalendar } from "./ActivityCalendar";
import { UserDetails } from "./UserDetails";

/** AC-060: both PB cards show the same four durations, in minutes. */
const PB_DURATIONS = ["1", "2", "4", "8"] as const;

export function UserProfile(props: {
  profile: UserProfileType;
  isAccountPage?: true;
}): JSXElement {
  /**
   * AC-060 right card: the signature currently selected in the settings bar.
   * Built through the one shared helper (SB-170) so it can never drift from the
   * `settingsId` stored on a result.
   */
  const currentSettingsId = createMemo(() =>
    buildSettingsId({
      addition: getConfig.addition,
      multiplication: getConfig.multiplication,
      division: getConfig.division,
      fractionAddition: getConfig.fractionAddition,
      fractionMultiplication: getConfig.fractionMultiplication,
      decimals: getConfig.decimals,
      negatives: getConfig.negatives,
    }),
  );

  return (
    <div class="grid w-full gap-8">
      <UserDetails
        profile={props.profile}
        isAccountPage={props.isAccountPage}
      />
      <Show when={!props.profile.banned && !props.profile.lbOptOut}>
        <LeaderboardPosition
          top4={props.profile.allTimeLbs?.time?.["4"]}
          top8={props.profile.allTimeLbs?.time?.["8"]}
        />
      </Show>
      <div class="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <PbCard
          caption="default settings"
          settingsId={LEADERBOARD_SETTINGS_ID}
          pbs={props.profile.personalBests.time}
          isAccountPage={props.isAccountPage}
        />
        <PbCard
          caption="current settings"
          settingsId={currentSettingsId()}
          pbs={props.profile.personalBests.time}
          isAccountPage={props.isAccountPage}
        />
      </div>
      <Show when={props.profile.lbOptOut}>
        <span class="text-center text-xs text-sub">
          Note: This account has opted out of the leaderboards, meaning their
          results aren&apos;t verified by the anticheat system and may not be
          legitimate.
        </span>
      </Show>

      <ActivityCalendar
        testActivity={
          props.isAccountPage ? undefined : props.profile.testActivity
        }
        isAccountPage={props.isAccountPage}
      />
    </div>
  );
}

/**
 * AC-055 … AC-058 — the all-time ranks strip. The language axis is gone
 * (AC-113), so the caption drops the language word and the two cells are the
 * `time 4` and `time 8` boards rather than monkeytype's 15 / 60 seconds.
 */
function LeaderboardPosition(props: {
  top4?: RankAndCount;
  top8?: RankAndCount;
}): JSXElement {
  const format = getFormatting;

  return (
    <div class="grid w-full grid-cols-1 items-center gap-4 rounded bg-sub-alt p-4 text-sub md:grid-cols-2 lg:grid-cols-3">
      <span class="text-center md:col-span-2 lg:col-span-1">
        All-Time Leaderboards
      </span>
      <Show when={props.top4 !== undefined}>
        <div class="grid grid-cols-2 gap-x-4">
          <div class="justify-self-end">4 minutes</div>
          <div class="row-span-2 text-3xl text-text">
            {format().rank(props.top4?.rank)}
          </div>
          <div class="justify-self-end text-xs">
            {formatTopPercentage(props.top4)}
          </div>
        </div>
      </Show>
      <Show when={props.top8 !== undefined}>
        <div class="grid grid-cols-2 gap-x-4">
          <div class="justify-self-end">8 minutes</div>
          <div class="row-span-2 text-3xl text-text">
            {format().rank(props.top8?.rank)}
          </div>
          <div class="justify-self-end text-xs">
            {formatTopPercentage(props.top8)}
          </div>
        </div>
      </Show>
    </div>
  );
}

/**
 * AC-059 … AC-063 — one personal-best card.
 *
 * croco calc has a single mode axis, so the second card is split by settings
 * signature rather than by mode (AC-060). Both cards therefore share the same
 * unit word and the caption is what makes each cell identifiable.
 */
function PbCard(props: {
  caption: string;
  settingsId: string;
  pbs: PersonalBests["time"];
  isAccountPage?: true;
}): JSXElement {
  const format = getFormatting;

  const bests = createMemo(() =>
    PB_DURATIONS.map((mode2) => {
      const pbArray = props.pbs[mode2] ?? [];

      /** AC-064: the reducer selects on `score`, keyed by `settingsId` (C4). */
      const best = pbArray
        .filter((pb) => pb.settingsId === props.settingsId)
        .reduce<PersonalBest | undefined>(
          (max, current) =>
            max === undefined || current.score > max.score ? current : max,
          undefined,
        );

      return { mode2, pb: best };
    }),
  );

  const durationLabel = (mode2: string): string =>
    mode2 === "1" ? "1 minute" : `${mode2} minutes`;

  return (
    <div class="grid grid-cols-[1fr_minmax(0,2rem)] rounded bg-sub-alt">
      <div class="grid">
        <div class="px-4 pt-4 text-center text-sub">{props.caption}</div>
        <div class="grid grid-cols-2 gap-8 p-4 md:grid-cols-4">
          <For each={bests()}>
            {(item) => (
              <div class="group grid items-center">
                <div
                  class={
                    item.pb !== undefined
                      ? "col-start-1 row-start-1 text-center transition-opacity group-hover:opacity-0"
                      : "col-start-1 row-start-1 text-center"
                  }
                >
                  <div class="text-xs text-sub">
                    {durationLabel(item.mode2)}
                  </div>
                  <div class="text-4xl">
                    {format().decimals(item.pb?.score)}
                  </div>
                  <div class="text-xl opacity-75">
                    {format().accuracy(item.pb?.acc, {
                      showDecimalPlaces: false,
                    })}
                  </div>
                </div>

                <Show when={item.pb !== undefined}>
                  <div class="col-start-1 row-start-1 grid bg-sub-alt text-center text-xs opacity-0 transition-opacity group-hover:opacity-100">
                    <div class="text-sub">{durationLabel(item.mode2)}</div>
                    <div>{format().decimals(item.pb?.score)} score</div>
                    <div>
                      {format().decimals(item.pb?.tpm, {
                        showDecimalPlaces: true,
                      })}{" "}
                      tpm
                    </div>
                    <div>{format().accuracy(item.pb?.acc)} acc</div>
                    <div class="text-sub">
                      {formatDate(item.pb?.timestamp ?? 0, "dd MMM yyyy")}
                    </div>
                  </div>
                </Show>
              </div>
            )}
          </For>
        </div>
      </div>
      <Show when={props.isAccountPage}>
        <div class="flex h-full flex-col">
          <Button
            balloon={{ text: "Show all personal bests", position: "left" }}
            class="h-full rounded-none rounded-r text-sub hover:text-bg"
            icon={{ icon: "ph:dots-three-vertical-bold" }}
            onClick={() => showPbTablesModal("time")}
          />
        </div>
      </Show>
    </div>
  );
}
