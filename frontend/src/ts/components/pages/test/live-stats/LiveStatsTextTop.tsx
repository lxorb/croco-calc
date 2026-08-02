import { getConfig } from "../../../../config/store";
import {
  getSecondsRemaining,
  getTimerText,
  isTimerFlashHidden,
  showLiveStats,
} from "../../../../states/live-stats";
import { cn } from "../../../../utils/cn";
import { AnimeShow } from "../../../common/anime";
import {
  TEXT_DISPLAY_CLASS,
  TEXT_WRAPPER_CLASS,
  liveStatsTextColor,
} from "./styles";

export function LiveStatsTextTop() {
  return (
    <div
      class={cn(
        TEXT_DISPLAY_CLASS,
        "w-0 justify-self-center",
        liveStatsTextColor(),
      )}
      style={{
        opacity: getConfig.timerOpacity,
      }}
    >
      <div class={cn(TEXT_WRAPPER_CLASS, "bottom-5")}>
        <AnimeShow
          when={
            showLiveStats() &&
            ["text", "flash_text"].includes(getConfig.timerStyle)
          }
        >
          {/* flash_text blanks the text instead of fading it, unlike flash_mini */}
          {/* CP-189 — the timer element carries `data-seconds-remaining`. */}
          <div data-timer="" data-seconds-remaining={getSecondsRemaining()}>
            {isTimerFlashHidden() ? "" : getTimerText()}
          </div>
        </AnimeShow>
      </div>
    </div>
  );
}
