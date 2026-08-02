import {
  buildSettingsId,
  LEADERBOARD_SETTINGS_ID,
} from "@croco-calc/schemas/math";
import { createMemo } from "solid-js";

import { restoreDefaultTestSettings } from "../../../../config/lifecycle";
import { getConfig } from "../../../../config/store";
import { getFocus, isRepeated } from "../../../../states/test";
import { cn } from "../../../../utils/cn";
import { AverageNotice } from "./AverageNotice";
import { Notice } from "./Notice";
import { PbNotice } from "./PbNotice";

/**
 * The strip under the settings bar. Everything monkeytype announced here was
 * typing-specific (language, layout, funbox, lazy mode, pace caret, the min-*
 * fail conditions, difficulty, tags, blind mode, zen, custom text) and is
 * deleted by SB-159, C14, C15, C17, C22 and C41.
 *
 * What survives is what croco calc actually has: result saving, the average
 * and personal-best readouts, and the leaderboard-eligibility notice that
 * SB-180 … SB-183 add.
 */
export function TestModesNotice() {
  return (
    <div
      class={cn(
        "flex flex-wrap justify-center gap-x-4 text-base text-sub transition-opacity duration-125 select-none",
        {
          // SB-183 — the whole strip fades with the bar when the test is focused.
          "opacity-0": getFocus(),
        },
      )}
    >
      <Repeated />
      <ResultSaving />
      <AverageNotice />
      <PbNotice />
      <LeaderboardEligibility />
    </div>
  );
}

function Repeated() {
  return (
    <Notice
      when={isRepeated()}
      class="text-error"
      // SB-061 / C10 — the notice strip sits under the bar and may not mix icon
      // collections, so it draws from SB-060's tabler set like the bar itself.
      icon="tabler:refresh"
      text="repeated"
    />
  );
}

function ResultSaving() {
  return (
    <Notice
      when={!getConfig.resultSaving}
      icon="tabler:device-floppy"
      openCommandline="resultSaving"
      class="text-error"
      text="saving disabled"
    />
  );
}

/**
 * SB-180 … SB-182 — shown whenever the current settings cannot produce a
 * leaderboard entry, and clickable: it runs `restoreDefaultTestSettings`
 * (SB-157), which is the two-click fix.
 *
 * The predicate mirrors the server's (SB-175 as restated by master C31): the
 * seven task-shaping settings must equal the frozen `LEADERBOARD_SETTINGS_ID`
 * and the test length must be 4 or 8 minutes (SB-176 — `1` and `2` produce no
 * leaderboard entries).
 */
function LeaderboardEligibility() {
  const isEligible = createMemo(() => {
    const settingsId = buildSettingsId({
      addition: getConfig.addition,
      multiplication: getConfig.multiplication,
      division: getConfig.division,
      fractionAddition: getConfig.fractionAddition,
      fractionMultiplication: getConfig.fractionMultiplication,
      decimals: getConfig.decimals,
      negatives: getConfig.negatives,
    });
    return (
      settingsId === LEADERBOARD_SETTINGS_ID &&
      (getConfig.time === 4 || getConfig.time === 8)
    );
  });

  return (
    <Notice
      when={!isEligible()}
      icon="tabler:trophy"
      onClick={() => void restoreDefaultTestSettings()}
      text="not eligible for leaderboards"
    />
  );
}
