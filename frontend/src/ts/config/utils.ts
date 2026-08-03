import type {
  Config as ConfigSchema,
  PartialConfig,
  ThemeName,
} from "@croco-calc/schemas/configs";
import * as ConfigSchemas from "@croco-calc/schemas/configs";
import { typedKeys } from "@croco-calc/util/objects";

import { getDefaultConfig } from "../constants/default-config";
import { sanitize } from "../utils/sanitize";
import { Config } from "./store";

/**
 * migrates possible outdated config and merges with the default config values
 * @param config partial or possible outdated config
 * @returns
 */
export function migrateConfig(config: PartialConfig | object): ConfigSchema {
  return mergeWithDefaultConfig(sanitizeConfig(replaceLegacyValues(config)));
}

function mergeWithDefaultConfig(config: PartialConfig): ConfigSchema {
  const defaultConfig = getDefaultConfig();
  const mergedConfig = {} as ConfigSchema;
  for (const key of typedKeys(defaultConfig)) {
    const newValue = config[key] ?? defaultConfig[key];
    //@ts-expect-error cant be bothered to deal with this
    mergedConfig[key] = newValue;
  }
  return mergedConfig;
}

/**
 * remove all values from the config which are not valid
 */
function sanitizeConfig(
  config: ConfigSchemas.PartialConfig,
): ConfigSchemas.PartialConfig {
  //make sure to use strip()
  return sanitize(ConfigSchemas.PartialConfigSchema.strip(), config);
}

/**
 * SB-122 — a stored config that fails validation is *repaired*, never
 * discarded. Two families of repair live here:
 *
 * 1. monkeytype's own legacy shapes for the keys croco calc kept
 *    (`quickTab`, `swapEscAndTab`, string `fontSize`, …).
 * 2. croco calc's own migration: a four-element `accountChart` is padded with a
 *    fifth `"on"` (§6.1 arity note, AC-085), monkeytype's second-based `time` is
 *    translated into croco calc's minutes (SB-012), and the `comfy` palette is
 *    renamed to `croco` (OQ-16).
 */
/**
 * OQ-16 — the palette upstream called `comfy` is croco calc's default under the
 * name `croco`. Stored configs written before the rename still say `comfy`,
 * which is no longer a member of `ThemeNameSchema`; without this the key would
 * be stripped as invalid and silently reset.
 */
function renameLegacyTheme(name: string): ThemeName {
  return name === "comfy" ? "croco" : (name as ThemeName);
}

function replaceLegacyValues(
  configObj: ConfigSchemas.PartialConfig,
): ConfigSchemas.PartialConfig {
  //@ts-expect-error legacy configs
  if (configObj.quickTab === true && configObj.quickRestart === undefined) {
    configObj.quickRestart = "tab";
  }

  if (
    //@ts-expect-error legacy configs
    configObj.swapEscAndTab === true &&
    configObj.quickRestart === undefined
  ) {
    configObj.quickRestart = "esc";
  }

  //@ts-expect-error legacy configs
  if (configObj.showAverage === "wpm") {
    configObj.showAverage = "speed";
  }

  if (
    //@ts-expect-error legacy configs
    configObj.showTimerProgress === false &&
    configObj.timerStyle === undefined
  ) {
    configObj.timerStyle = "off";
  }

  if (typeof configObj.fontSize === "string") {
    //legacy values use strings
    const oldValue: string = configObj.fontSize;
    let newValue = parseInt(oldValue);

    if (oldValue === "125") {
      newValue = 1.25;
    } else if (oldValue === "15") {
      newValue = 1.5;
    }

    configObj.fontSize = newValue;
  } else if (configObj.fontSize !== undefined && configObj.fontSize < 0) {
    configObj.fontSize = 1;
  }

  // §6.1 arity note: pad monkeytype's four-element chart toggle array with the
  // fifth `Per minute` entry (AC-085). Anything else is reset.
  if (Array.isArray(configObj.accountChart)) {
    const stored = configObj.accountChart as ("on" | "off")[];
    if (stored.length === 4) {
      configObj.accountChart = [...stored, "on"] as ConfigSchemas.AccountChart;
    } else if (stored.length !== 5) {
      configObj.accountChart = ["on", "on", "on", "on", "on"];
    }
  }

  // SB-012: monkeytype stored `time` in seconds (15/30/60/120 plus custom
  // values). croco calc stores minutes, so anything outside 1|2|4|8 is mapped
  // onto the nearest legal length rather than thrown away.
  if (
    typeof configObj.time === "number" &&
    ![1, 2, 4, 8].includes(configObj.time)
  ) {
    const minutes = configObj.time / 60;
    const legal = [1, 2, 4, 8] as const;
    configObj.time = legal.reduce((best, candidate) =>
      Math.abs(candidate - minutes) < Math.abs(best - minutes)
        ? candidate
        : best,
    );
  }

  // OQ-16: `comfy` -> `croco`, across every key that stores a theme name.
  for (const key of ["theme", "themeLight", "themeDark"] as const) {
    const stored = configObj[key];
    if (stored !== undefined) configObj[key] = renameLegacyTheme(stored);
  }
  if (Array.isArray(configObj.favThemes)) {
    configObj.favThemes = configObj.favThemes.map((name) =>
      renameLegacyTheme(name),
    );
  }

  if (
    Array.isArray(configObj.customThemeColors) &&
    //@ts-expect-error legacy configs
    configObj.customThemeColors.length === 9
  ) {
    // migrate existing configs missing sub alt color
    const colors = configObj.customThemeColors;
    colors.splice(4, 0, "#000000");
    configObj.customThemeColors = colors;
  }

  if (
    Array.isArray(configObj.customBackgroundFilter) &&
    //@ts-expect-error legacy configs
    configObj.customBackgroundFilter.length === 5
  ) {
    const arr = configObj.customBackgroundFilter;
    configObj.customBackgroundFilter = [arr[0], arr[1], arr[2], arr[3]];
  }

  if (configObj.maxLineWidth !== undefined) {
    if (configObj.maxLineWidth < 20 && configObj.maxLineWidth !== 0) {
      configObj.maxLineWidth = 20;
    } else if (configObj.maxLineWidth > 1000) {
      configObj.maxLineWidth = 1000;
    }
  }

  return configObj;
}

export function getConfigChanges(): Partial<ConfigSchema> {
  const configChanges: Partial<ConfigSchema> = {};
  typedKeys(Config)
    .filter((key) => {
      return Config[key] !== getDefaultConfig()[key];
    })
    .forEach((key) => {
      //@ts-expect-error this is fine
      configChanges[key] = Config[key];
    });
  return configChanges;
}
