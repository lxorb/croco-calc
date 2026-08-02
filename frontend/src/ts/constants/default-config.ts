import { Config, CustomThemeColors } from "@croco-calc/schemas/configs";

/**
 * The single source of truth for croco calc's default config (SB-110).
 *
 * Consumed by `config/store.ts`, `config/persistence.ts`, `config/remote.ts`
 * and `config/utils.ts`. The key set is exactly §6.1 of the master document:
 * the eight settings-bar keys plus the retained appearance/behaviour keys.
 *
 * The eight bar defaults are chosen so that every control renders in the ON
 * style (SB-111), so that no coupling override fires when they are applied
 * (SB-112), and so that `buildSettingsId(getDefaultConfig())` equals the frozen
 * `LEADERBOARD_SETTINGS_ID` (SB-171, SB-204).
 *
 * `theme: "serika_dark"` is monkeytype's own default, kept so the first-run
 * screen matches the reference screenshots (OQ-16, INV-082).
 */
const obj: Config = {
  // test — the eight settings-bar controls (SB-110)
  addition: "1000", // +1000
  multiplication: "100", // 100x100
  division: "threeByTwo", // xxx/xx
  fractionAddition: "99", // +1/xx
  fractionMultiplication: true, // *x/y
  decimals: true, // 4.2
  negatives: true, // -
  time: 8, // 8 minutes (SB-012: minutes, never seconds)

  // behavior
  quickRestart: "off", // SB-151 — so Escape opens the command palette
  resultSaving: true,
  singleListCommandLine: "on",

  // caret (restored by master C11)
  smoothCaret: "medium",
  caretStyle: "default",

  // appearance
  timerStyle: "mini",
  liveSpeedStyle: "off",
  liveAccStyle: "off",
  timerColor: "main",
  timerOpacity: "1",
  alwaysShowDecimalPlaces: false,
  startGraphsAtZero: true,
  maxLineWidth: 0,
  fontSize: 2,
  fontFamily: "Roboto_Mono",

  // theme
  flipTestColors: false,
  colorfulMode: false,
  customBackground: "",
  customBackgroundSize: "cover",
  customBackgroundFilter: [0, 1, 1, 1],
  autoSwitchTheme: false,
  themeLight: "serika",
  themeDark: "serika_dark",
  randomTheme: "off",
  favThemes: [],
  theme: "serika_dark",
  customTheme: false,
  customThemeColors: [
    "#323437",
    "#e2b714",
    "#e2b714",
    "#646669",
    "#2c2e31",
    "#d1d0c5",
    "#ca4754",
    "#7e2a33",
    "#ca4754",
    "#7e2a33",
  ] as CustomThemeColors,

  // hide elements
  showKeyTips: true,
  showOutOfFocusWarning: true,
  showAverage: "off",
  showPb: false,

  // other (hidden) — five entries, one per account-page chart series (AC-085)
  accountChart: ["on", "on", "on", "on", "on"],
};

export function getDefaultConfig(): Config {
  return structuredClone(obj);
}
