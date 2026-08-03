import { getConfig } from "../../../../config/store";

/**
 * TR-034 — `timerColor` and `timerOpacity` keep applying to all three readouts
 * and to the progress bar, unchanged (CP-077).
 *
 * TR-037 — the `TEXT_DISPLAY_CLASS` / `TEXT_WRAPPER_CLASS` pair that used to
 * live here is struck. It implemented monkeytype's oversized-number-behind-the-
 * stream treatment (`text-[4rem] … xl:text-[10rem]`, `z-[-1]`, `h-0`, `w-0` and
 * a negative-margin overlay), which only made sense behind a wrapping word
 * stream. `TaskReadouts` renders a normal in-flow row instead.
 */
export const liveStatsTextColor = (): Record<string, boolean> => ({
  "text-main": getConfig.timerColor === "main",
  "text-sub": getConfig.timerColor === "sub",
  "text-text": getConfig.timerColor === "text",
  "text-[#000000]": getConfig.timerColor === "black",
});

export const liveStatsBgColor = (): Record<string, boolean> => ({
  "bg-main": getConfig.timerColor === "main",
  "bg-sub": getConfig.timerColor === "sub",
  "bg-text": getConfig.timerColor === "text",
  "bg-[#000000]": getConfig.timerColor === "black",
});
