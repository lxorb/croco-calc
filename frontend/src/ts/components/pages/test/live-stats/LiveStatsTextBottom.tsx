import { getConfig } from "../../../../config/store";
import {
  getLiveAccText,
  getLiveSpeedText,
  showLiveStats,
} from "../../../../states/live-stats";
import { cn } from "../../../../utils/cn";
import { AnimeShow } from "../../../common/anime";
import {
  TEXT_DISPLAY_CLASS,
  TEXT_WRAPPER_CLASS,
  liveStatsTextColor,
} from "./styles";

export function LiveStatsTextBottom() {
  return (
    <div
      class={cn(TEXT_DISPLAY_CLASS, "mx-auto w-full", liveStatsTextColor())}
      style={{
        opacity: getConfig.timerOpacity,
      }}
    >
      <div class={cn(TEXT_WRAPPER_CLASS, "top-4")}>
        <AnimeShow
          when={showLiveStats() && getConfig.liveSpeedStyle === "text"}
        >
          {getLiveSpeedText()}
        </AnimeShow>
        <AnimeShow when={showLiveStats() && getConfig.liveAccStyle === "text"}>
          {getLiveAccText()}
        </AnimeShow>
      </div>
    </div>
  );
}
