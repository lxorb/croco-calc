import { Show } from "solid-js";

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
import { liveStatsTextColor } from "./styles";

/**
 * The readouts row (TR-031 … TR-037).
 *
 * Master C13's three readouts — the countdown timer, live tpm, live acc — in a
 * single horizontal row directly above `#taskPrompt`, in the fixed order
 * **timer, tpm, acc**. TR-031: no fourth readout may be added.
 *
 * This replaces `LiveStatsTextTop`, `LiveStatsTextBottom` and `LiveStatsMini`,
 * which between them implemented monkeytype's "oversized number behind the
 * content" treatment — `text-[4rem] … xl:text-[10rem]`, `z-[-1]`, `h-0`, `w-0`
 * and a negative-margin overlay. All of that is **struck** (TR-037): it existed
 * to sit behind a wrapping word stream, and in the new arena the readouts are a
 * normal, in-flow row.
 *
 * `BarTimerProgress` is deliberately untouched — `timerStyle: "bar"` is still
 * the fixed full-width bar at the top of the viewport (CP-076).
 */

/** TR-032 — `text` / `flash_text` render at twice the row's base size. */
const LARGE_CLASS = "text-[2em] leading-none";
const BASE_CLASS = "text-[1em] leading-none";

export function TaskReadouts() {
  const timerLarge = (): boolean =>
    getConfig.timerStyle === "text" || getConfig.timerStyle === "flash_text";

  // TR-032 — `off` hides it; `bar` moves it to the CP-076 progress bar, so the
  // row shows nothing for it either.
  const showTimer = (): boolean =>
    ["mini", "flash_mini", "text", "flash_text"].includes(getConfig.timerStyle);

  return (
    <div
      id="taskReadouts"
      class={cn(
        "flex items-baseline justify-center gap-[1em] tabular-nums",
        liveStatsTextColor(),
      )}
      style={{ opacity: getConfig.timerOpacity }}
    >
      {/*
        TR-043 — the timer renders in `preStart` too, showing the full
        configured duration, so the user can see what they are about to start.
        tpm and acc are gated on `showLiveStats()` (TR-036), which is
        `isTestActive() && getFocus()`.
      */}
      <Show when={showTimer()}>
        {/* CP-189 / TR-252 — the timer element carries `data-seconds-remaining`. */}
        <div
          data-timer=""
          data-seconds-remaining={getSecondsRemaining()}
          class={timerLarge() ? LARGE_CLASS : BASE_CLASS}
          // TR-033 — `flash_text` blanks the text; `flash_mini` fades it.
          style={{
            opacity:
              getConfig.timerStyle === "flash_mini" && isTimerFlashHidden()
                ? 0
                : 1,
          }}
        >
          {getConfig.timerStyle === "flash_text" && isTimerFlashHidden()
            ? ""
            : getTimerText()}
        </div>
      </Show>

      <Show when={showLiveStats() && getConfig.liveSpeedStyle !== "off"}>
        <div
          class={getConfig.liveSpeedStyle === "text" ? LARGE_CLASS : BASE_CLASS}
        >
          {getLiveSpeedText()}
        </div>
      </Show>

      <Show when={showLiveStats() && getConfig.liveAccStyle !== "off"}>
        <div
          class={getConfig.liveAccStyle === "text" ? LARGE_CLASS : BASE_CLASS}
        >
          {getLiveAccText()}
        </div>
      </Show>
    </div>
  );
}
