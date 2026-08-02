import * as ConfigSchemas from "@croco-calc/schemas/configs";
import { parseWithSchema as parseJsonWithSchema } from "@croco-calc/util/json";
import {
  showSuccessNotification,
  showErrorNotification,
} from "../states/notifications";
import {
  configLS,
  saveToLocalStorage,
  saveFullConfigToLocalStorage,
} from "./persistence";
import { Config, setFullConfigStore } from "./store";
import { getDefaultConfig } from "../constants/default-config";
import { configEvent } from "../events/config";
import { migrateConfig } from "./utils";
import { promiseWithResolvers } from "../utils/misc";
import { setConfig } from "./setters";
import { repairAllOff } from "./coupling";
import { deleteConfig } from "../ape/config";
import { typedKeys } from "@croco-calc/util/objects";

export async function applyConfigFromJson(json: string): Promise<void> {
  try {
    const parsedConfig = parseJsonWithSchema(
      json,
      ConfigSchemas.PartialConfigSchema.strip(),
      {
        migrate: (value) => {
          if (Array.isArray(value)) {
            throw new Error("Invalid config");
          }
          return migrateConfig(value);
        },
      },
    );
    await applyConfig(parsedConfig);
    saveFullConfigToLocalStorage();
    showSuccessNotification("Done");
  } catch (e) {
    console.error(e);
    showErrorNotification("Failed to import settings", { error: e });
  }
}

export async function loadFromLocalStorage(): Promise<void> {
  console.log("loading localStorage config");
  const newConfig = configLS.get();
  if (newConfig === undefined) {
    await resetConfig();
  } else {
    await applyConfig(newConfig);
    saveFullConfigToLocalStorage(true);
  }
  loadDone();
}

/**
 * Applied last, after every other key is in place, because they are the two
 * halves of the SB-090/SB-091 coupling: applying them against a half-built
 * config would let the cascade fire on a state the user never stored.
 */
const lastConfigsToApply: Set<keyof ConfigSchemas.Config> = new Set([
  "multiplication",
  "fractionMultiplication",
]);

export async function applyConfig(
  partialConfig: Partial<ConfigSchemas.Config>,
): Promise<void> {
  if (partialConfig === undefined || partialConfig === null) return;

  //migrate old values if needed, remove additional keys and merge with default config
  const migrated: ConfigSchemas.Config = migrateConfig(partialConfig);

  // SB-104: a stored or remote config with every generator control off (a
  // hand-edited account config) is repaired rather than rejected — the default
  // `addition` value comes back and the correction is persisted below, the way
  // monkeytype re-saves keys that failed to apply.
  const fullConfig = repairAllOff(migrated);
  const wasRepaired = JSON.stringify(migrated) !== JSON.stringify(fullConfig);

  configEvent.dispatch({ key: "fullConfigChange" });

  const defaultConfig = getDefaultConfig();
  for (const key of typedKeys(fullConfig)) {
    //@ts-expect-error this is fine, both are of type config
    Config[key] = defaultConfig[key];
  }

  const configKeysToReset: (keyof ConfigSchemas.Config)[] = [];

  const firstKeys = typedKeys(fullConfig).filter(
    (key) => !lastConfigsToApply.has(key),
  );

  for (const configKey of [...firstKeys, ...lastConfigsToApply]) {
    const configValue = fullConfig[configKey];

    const set = setConfig(configKey, configValue, {
      nosave: true,
      partOfFullConfigChange: true,
    });

    if (!set) {
      configKeysToReset.push(configKey);
    }
  }

  for (const key of configKeysToReset) {
    saveToLocalStorage(key);
  }

  if (wasRepaired) {
    saveToLocalStorage("addition");
    saveToLocalStorage("multiplication");
    saveToLocalStorage("fractionMultiplication");
  }

  configEvent.dispatch({ key: "fullConfigChangeFinished" });
  setFullConfigStore(fullConfig);
}

export async function resetConfig(): Promise<void> {
  await applyConfig(getDefaultConfig());
  await deleteConfig();
  saveFullConfigToLocalStorage(true);
}

/**
 * SB-157 — set all eight settings-bar keys back to the SB-110 defaults in one
 * `applyConfig` call, leaving every appearance/behaviour key untouched. Backs
 * the `restoreDefaultTestSettings` palette command and the clickable
 * "not eligible for leaderboards" notice (SB-181).
 */
export async function restoreDefaultTestSettings(): Promise<void> {
  const defaults = getDefaultConfig();
  await applyConfig({
    ...Config,
    addition: defaults.addition,
    multiplication: defaults.multiplication,
    division: defaults.division,
    fractionAddition: defaults.fractionAddition,
    fractionMultiplication: defaults.fractionMultiplication,
    decimals: defaults.decimals,
    negatives: defaults.negatives,
    time: defaults.time,
  });
  saveFullConfigToLocalStorage();
}

const { promise: configLoadPromise, resolve: loadDone } =
  promiseWithResolvers();

export { configLoadPromise };
