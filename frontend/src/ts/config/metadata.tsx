import * as ConfigSchemas from "@croco-calc/schemas/configs";
import { roundTo1 } from "@croco-calc/util/numbers";
import { JSXElement } from "solid-js";

import { __nonReactive as CustomThemes } from "../collections/custom-themes";
import { isAuthenticated } from "../states/core";
import { showNoticeNotification } from "../states/notifications";
import { applyCoupling, wouldBeAllOff } from "./coupling";

export type OptionMetadata = {
  /**
   * The label rendered for this state — in the settings bar (SB-022) and in the
   * command palette (SB-155). One mapping table, never two.
   */
  displayString?: string;
  /** An iconify id, overriding the config key's own icon for this state. */
  icon?: string;
  visible?: boolean;
};

export type ConfigMetadata<K extends keyof ConfigSchemas.Config> = {
  /**
   * The config key that this metadata is for
   */
  key: K;

  /**
   * Optional display string for the config key.
   */
  displayString?: string;
  /**
   * Should the config change trigger a resize event? handled in ui.ts:108
   */
  triggerResize?: true;

  description?: string | JSXElement;

  /**
   * An iconify id (INV-081). `tabler:*` for the eight settings-bar keys,
   * `ph:*` everywhere else — master C10, SB-060/SB-061.
   */
  icon: string;

  optionsMetadata?: ConfigSchemas.Config[K] extends string | number | symbol
    ? Record<ConfigSchemas.Config[K], OptionMetadata>
    : ConfigSchemas.Config[K] extends boolean
      ? Partial<{
          true: OptionMetadata;
          false: OptionMetadata;
        }>
      : never;

  /**
   * Group that this config belongs to. Used for partial presets
   */
  group: ConfigSchemas.ConfigGroupName;

  /**
   * Is a test restart required after this config change?
   */
  changeRequiresRestart: boolean;
  /**
   * Optional function that checks if the config value is blocked from being set.
   * Returns true if setting the config value should be blocked.
   * @param options - The options object containing the value being set and the current config.
   */
  isBlocked?: (options: {
    value: ConfigSchemas.Config[K];
    currentConfig: Readonly<ConfigSchemas.Config>;
  }) => boolean;
  /**
   * Optional function to override the value before setting it.
   * Returns the modified value.
   * @param options - The options object containing the value being set, the current value, and the current config.
   * @returns The modified value to be set for the config key.
   */
  overrideValue?: (options: {
    value: ConfigSchemas.Config[K];
    currentValue: ConfigSchemas.Config[K];
    currentConfig: Readonly<ConfigSchemas.Config>;
  }) => ConfigSchemas.Config[K];
  /**
   * Optional function to override other config values before this one is set.
   * Returns an object with the config keys and their new values.
   * @param options - The options object containing the value being set and the current config.
   */
  overrideConfig?: (options: {
    value: ConfigSchemas.Config[K];
    currentConfig: Readonly<ConfigSchemas.Config>;
  }) => Partial<ConfigSchemas.Config>;
  /**
   * Optional function that is called after the config value is set.
   * It can be used to perform additional actions, like reloading the page.
   * @param options - The options object containing the nosave flag and the current config.
   */
  afterSet?: (options: {
    nosave: boolean;
    currentConfig: Readonly<ConfigSchemas.Config>;
  }) => void;
};

export type ConfigMetadataObject = {
  [K in keyof ConfigSchemas.Config]: ConfigMetadata<K>;
};

/**
 * Shared by the five generator controls (SB-100). Selecting a value is blocked
 * whenever the configuration it would commit — i.e. the one produced *after*
 * the SB-090/SB-091 coupling cascade — has no enabled generator left
 * (SB-101, SB-215, ME-089, master C36).
 */
function blockIfAllOff<K extends keyof ConfigSchemas.Config>(key: K) {
  return ({
    value,
    currentConfig,
  }: {
    value: ConfigSchemas.Config[K];
    currentConfig: Readonly<ConfigSchemas.Config>;
  }): boolean => {
    if (!wouldBeAllOff(key, value, currentConfig)) return false;
    showNoticeNotification("at least one task type must be enabled");
    return true;
  };
}

/**
 * SB-090 + SB-091, expressed through monkeytype's own `overrideConfig`
 * mechanism so the cascade fires identically from every entry point (SB-095):
 * a bar click, the mobile modal, the palette, an imported settings JSON, a
 * shared-settings URL and the server config applied at login.
 */
function couplingOverride<
  K extends "multiplication" | "fractionMultiplication",
>(key: K) {
  return ({
    value,
    currentConfig,
  }: {
    value: ConfigSchemas.Config[K];
    currentConfig: Readonly<ConfigSchemas.Config>;
  }): Partial<ConfigSchemas.Config> => {
    const next = applyCoupling({ ...currentConfig, [key]: value }, key);
    const changes: Partial<ConfigSchemas.Config> = {};
    if (
      key !== "multiplication" &&
      next.multiplication !== currentConfig.multiplication
    ) {
      changes.multiplication = next.multiplication;
    }
    if (
      key !== "fractionMultiplication" &&
      next.fractionMultiplication !== currentConfig.fractionMultiplication
    ) {
      changes.fractionMultiplication = next.fractionMultiplication;
    }
    return changes;
  };
}

export const configMetadata: ConfigMetadataObject = {
  // ------------------------------------------------------------------
  // test — the eight settings-bar controls.
  // All eight: group "test" (SB-130), changeRequiresRestart (SB-055),
  // a `tabler:*` icon (SB-060), and a label per state (SB-024 … SB-047).
  // ------------------------------------------------------------------
  addition: {
    key: "addition",
    displayString: "addition",
    icon: "tabler:plus",
    changeRequiresRestart: true,
    group: "test",
    isBlocked: blockIfAllOff("addition"),
    optionsMetadata: {
      off: { displayString: "+100" },
      "100": { displayString: "+100" },
      "1000": { displayString: "+1000" },
    },
  },
  multiplication: {
    key: "multiplication",
    displayString: "multiplication",
    icon: "tabler:x",
    changeRequiresRestart: true,
    group: "test",
    isBlocked: blockIfAllOff("multiplication"),
    // SB-091: switching multiplication off also clears fraction multiplication.
    overrideConfig: couplingOverride("multiplication"),
    optionsMetadata: {
      off: { displayString: "12x12" },
      "12": { displayString: "12x12" },
      "20": { displayString: "20x20" },
      "100": { displayString: "100x100" },
    },
  },
  division: {
    key: "division",
    displayString: "division",
    icon: "tabler:divide",
    changeRequiresRestart: true,
    group: "test",
    isBlocked: blockIfAllOff("division"),
    optionsMetadata: {
      // SB-031: the OFF label is the single character `/`, not `144/12`.
      off: { displayString: "/" },
      tables: { displayString: "144/12" },
      threeByTwo: { displayString: "xxx/xx" },
    },
  },
  fractionAddition: {
    key: "fractionAddition",
    displayString: "fraction addition",
    icon: "tabler:math-1-divide-2",
    changeRequiresRestart: true,
    group: "test",
    isBlocked: blockIfAllOff("fractionAddition"),
    optionsMetadata: {
      off: { displayString: "+1/12" },
      "12": { displayString: "+1/12" },
      "99": { displayString: "+1/xx" },
    },
  },
  fractionMultiplication: {
    key: "fractionMultiplication",
    displayString: "fraction multiplication",
    icon: "tabler:math-x-divide-y",
    changeRequiresRestart: true,
    group: "test",
    isBlocked: blockIfAllOff("fractionMultiplication"),
    // SB-090: turning it on while multiplication is off forces `"100"` (C21).
    overrideConfig: couplingOverride("fractionMultiplication"),
    optionsMetadata: {
      false: { displayString: "*x/y" },
      true: { displayString: "*x/y" },
    },
  },
  decimals: {
    key: "decimals",
    displayString: "decimals",
    icon: "tabler:decimal",
    changeRequiresRestart: true,
    group: "test",
    optionsMetadata: {
      false: { displayString: "4.2" },
      true: { displayString: "4.2" },
    },
  },
  negatives: {
    key: "negatives",
    displayString: "negative numbers",
    icon: "tabler:minus",
    changeRequiresRestart: true,
    group: "test",
    optionsMetadata: {
      false: { displayString: "-" },
      true: { displayString: "-" },
    },
  },
  time: {
    key: "time",
    displayString: "time",
    icon: "tabler:clock",
    changeRequiresRestart: true,
    group: "test",
    optionsMetadata: {
      1: { displayString: "1" },
      2: { displayString: "2" },
      4: { displayString: "4" },
      8: { displayString: "8" },
    },
  },

  // ------------------------------------------------------------------
  // behavior
  // ------------------------------------------------------------------
  resultSaving: {
    key: "resultSaving",
    icon: "ph:floppy-disk-bold",
    displayString: "result saving",
    changeRequiresRestart: false,
    group: "behavior",
  },
  quickRestart: {
    key: "quickRestart",
    icon: "ph:fast-forward-bold",
    displayString: "quick restart",
    changeRequiresRestart: false,
    group: "behavior",
  },
  singleListCommandLine: {
    key: "singleListCommandLine",
    icon: "ph:list-bold",
    displayString: "single list command line",
    changeRequiresRestart: false,
    group: "behavior",
  },

  // ------------------------------------------------------------------
  // appearance
  // ------------------------------------------------------------------
  timerStyle: {
    key: "timerStyle",
    icon: "ph:clock-bold",
    displayString: "timer style",
    changeRequiresRestart: false,
    group: "appearance",
  },
  liveSpeedStyle: {
    key: "liveSpeedStyle",
    icon: "ph:gauge-bold",
    displayString: "live tpm style",
    changeRequiresRestart: false,
    group: "appearance",
  },
  liveAccStyle: {
    key: "liveAccStyle",
    icon: "ph:target-bold",
    displayString: "live acc style",
    changeRequiresRestart: false,
    group: "appearance",
  },
  timerColor: {
    key: "timerColor",
    icon: "ph:palette-bold",
    displayString: "timer color",
    changeRequiresRestart: false,
    group: "appearance",
  },
  timerOpacity: {
    key: "timerOpacity",
    icon: "ph:drop-bold",
    displayString: "timer opacity",
    changeRequiresRestart: false,
    group: "appearance",
  },
  alwaysShowDecimalPlaces: {
    key: "alwaysShowDecimalPlaces",
    icon: "ph:list-numbers-bold",
    displayString: "always show decimal places",
    changeRequiresRestart: false,
    group: "appearance",
  },
  startGraphsAtZero: {
    key: "startGraphsAtZero",
    icon: "ph:chart-line-bold",
    displayString: "start graphs at zero",
    changeRequiresRestart: false,
    group: "appearance",
  },
  maxLineWidth: {
    key: "maxLineWidth",
    icon: "ph:arrows-horizontal-bold",
    displayString: "max line width",
    changeRequiresRestart: false,
    group: "appearance",
    triggerResize: true,
    overrideValue: ({ value }) => {
      if (value < 20 && value !== 0) return 20;
      if (value > 1000) return 1000;
      return value;
    },
  },
  fontSize: {
    key: "fontSize",
    icon: "ph:ruler-bold",
    displayString: "font size",
    changeRequiresRestart: false,
    group: "appearance",
    triggerResize: true,
    overrideValue: ({ value }) => (value < 0 ? 1 : roundTo1(value)),
  },
  fontFamily: {
    key: "fontFamily",
    icon: "ph:text-aa-bold",
    displayString: "font family",
    changeRequiresRestart: false,
    group: "appearance",
    triggerResize: true,
  },

  // ------------------------------------------------------------------
  // theme
  // ------------------------------------------------------------------
  flipTestColors: {
    key: "flipTestColors",
    icon: "ph:arrows-left-right-bold",
    displayString: "flip test colors",
    changeRequiresRestart: false,
    group: "theme",
  },
  colorfulMode: {
    key: "colorfulMode",
    icon: "ph:paint-brush-bold",
    displayString: "colorful mode",
    changeRequiresRestart: false,
    group: "theme",
  },
  customBackground: {
    key: "customBackground",
    icon: "ph:image-bold",
    displayString: "custom background",
    changeRequiresRestart: false,
    group: "theme",
    overrideValue: ({ value }) => value.trim(),
  },
  customBackgroundSize: {
    key: "customBackgroundSize",
    icon: "ph:arrows-out-bold",
    displayString: "custom background size",
    changeRequiresRestart: false,
    group: "theme",
  },
  customBackgroundFilter: {
    key: "customBackgroundFilter",
    icon: "ph:sliders-horizontal-bold",
    displayString: "custom background filter",
    changeRequiresRestart: false,
    group: "theme",
  },
  autoSwitchTheme: {
    key: "autoSwitchTheme",
    icon: "ph:circle-half-bold",
    displayString: "auto switch theme",
    changeRequiresRestart: false,
    group: "theme",
  },
  themeLight: {
    key: "themeLight",
    icon: "ph:sun-bold",
    displayString: "light theme",
    changeRequiresRestart: false,
    group: "theme",
  },
  themeDark: {
    key: "themeDark",
    icon: "ph:circle-half-bold",
    displayString: "dark theme",
    changeRequiresRestart: false,
    group: "theme",
  },
  randomTheme: {
    key: "randomTheme",
    icon: "ph:shuffle-bold",
    displayString: "random theme",
    changeRequiresRestart: false,
    group: "theme",
    isBlocked: ({ value }) => {
      if (value === "custom" && !isAuthenticated()) {
        showNoticeNotification(
          "Random custom theme requires an account with custom themes",
        );
        return true;
      }
      if (value === "custom" && CustomThemes.getCustomThemes().length === 0) {
        showNoticeNotification("You need to create a custom theme first");
        return true;
      }
      return false;
    },
  },
  favThemes: {
    key: "favThemes",
    icon: "ph:star-bold",
    displayString: "favorite themes",
    changeRequiresRestart: false,
    group: "theme",
  },
  theme: {
    key: "theme",
    icon: "ph:palette-bold",
    displayString: "theme",
    changeRequiresRestart: false,
    group: "theme",
    overrideConfig: ({ currentConfig }) =>
      currentConfig.customTheme ? { customTheme: false } : {},
  },
  customTheme: {
    key: "customTheme",
    icon: "ph:pen-nib-bold",
    displayString: "custom theme",
    changeRequiresRestart: false,
    group: "theme",
  },
  customThemeColors: {
    key: "customThemeColors",
    icon: "ph:paint-bucket-bold",
    displayString: "custom theme colors",
    changeRequiresRestart: false,
    group: "theme",
  },

  // ------------------------------------------------------------------
  // hide elements
  // ------------------------------------------------------------------
  showKeyTips: {
    key: "showKeyTips",
    icon: "ph:keyboard-bold",
    displayString: "key tips",
    changeRequiresRestart: false,
    group: "hideElements",
  },
  showOutOfFocusWarning: {
    key: "showOutOfFocusWarning",
    icon: "ph:eye-bold",
    displayString: "out of focus warning",
    changeRequiresRestart: false,
    group: "hideElements",
  },
  showAverage: {
    key: "showAverage",
    icon: "ph:chart-bar-bold",
    displayString: "average",
    changeRequiresRestart: false,
    group: "hideElements",
  },
  showPb: {
    key: "showPb",
    icon: "ph:crown-bold",
    displayString: "personal best",
    changeRequiresRestart: false,
    group: "hideElements",
  },

  // ------------------------------------------------------------------
  // other (hidden)
  // ------------------------------------------------------------------
  accountChart: {
    key: "accountChart",
    icon: "ph:chart-line-bold",
    displayString: "account chart",
    changeRequiresRestart: false,
    group: "hidden",
    // AC-085 extends the tuple from four toggles to five (`Per minute`), but
    // monkeytype's guard on the first two still applies: index 0 is `Score`
    // and index 1 is `Accuracy`, and with both off the history chart has
    // nothing left to draw. Turning the *other* one on means the toggle the
    // user just clicked keeps the state they asked for.
    overrideValue: ({ value, currentValue }) => {
      if (value[0] === "off" && value[1] === "off") {
        const changedIndex = value[0] === currentValue[0] ? 0 : 1;
        value[changedIndex] = "on";
      }
      return value;
    },
  },
};
