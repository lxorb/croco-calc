import { getConfig } from "../../../../config/store";
import {
  getLiveAccText,
  getLiveSpeedText,
  getSecondsRemaining,
  getTimerText,
  isTimerFlashHidden,
  showLiveStats,
} from "../../../../states/live-stats";
import { cn } from "../../../../utils/cn";
import { AnimeShow } from "../../../common/anime";
import { liveStatsTextColor } from "./styles";

export function LiveStatsMini() {
  return (
    <div class="full-width">
      <div
        class={cn(
          "mt-[-1.25em] flex h-0 w-0 justify-start gap-[0.5em] leading-[1em]",
          liveStatsTextColor(),
        )}
        style={{
          "font-size": `${getConfig.fontSize}rem`,
          opacity: getConfig.timerOpacity,
          "margin-left": "0.25em",
        }}
      >
        <AnimeShow
          when={
            showLiveStats() &&
            ["mini", "flash_mini"].includes(getConfig.timerStyle)
          }
        >
          {/* the fade animates the wrapper opacity, so the flash gate lives on the child */}
          {/* CP-189 — the timer element carries `data-seconds-remaining`. */}
          <div
            data-timer=""
            data-seconds-remaining={getSecondsRemaining()}
            style={{ opacity: isTimerFlashHidden() ? 0 : 1 }}
          >
            {getTimerText()}
          </div>
        </AnimeShow>
        <AnimeShow
          when={showLiveStats() && getConfig.liveSpeedStyle === "mini"}
        >
          {getLiveSpeedText()}
        </AnimeShow>
        <AnimeShow when={showLiveStats() && getConfig.liveAccStyle === "mini"}>
          {getLiveAccText()}
        </AnimeShow>
      </div>
    </div>
  );
}
