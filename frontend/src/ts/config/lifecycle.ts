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
import { restartTestEvent } from "../events/test";
import { migrateConfig } from "./utils";
import { promiseWithResolvers } from "../utils/misc";
import { setConfig } from "./setters";
import { configMetadata } from "./metadata";
import { repairAllOff } from "./coupling";
import { deleteConfig } from "../ape/config";
import { typedKeys } from "@croco-calc/util/objects";

/**
 * SB-055 — derived from the metadata rather than re-listed, so the restart set
 * and the flag that declares it can never drift apart. Today this is exactly
 * the eight settings-bar keys.
 */
const restartKeys: (keyof ConfigSchemas.Config)[] = typedKeys(
  configMetadata,
).filter((key) => configMetadata[key].changeRequiresRestart);

function readRestartKeys(): string {
  return JSON.stringify(restartKeys.map((key) => Config[key]));
}

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
    await resetConfig({ initialLoad: true });
  } else {
    await applyConfig(newConfig, { initialLoad: true });
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
  options?: {
    /**
     * Restart even if no restart-relevant key moved. SB-157 restores the
     * defaults as a single user action and owes the user a fresh test either
     * way.
     */
    forceRestart?: boolean;
    /**
     * The boot-time install of the stored config. Nothing is running yet and
     * `index.ts` builds the first engine itself, so there is nothing to restart.
     */
    initialLoad?: boolean;
  },
): Promise<void> {
  if (partialConfig === undefined || partialConfig === null) return;

  // ME-007 / SB-054 — read before the reset-to-defaults loop below, which would
  // otherwise make every key look changed.
  const restartKeysBefore = readRestartKeys();

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

  /*
   * ME-007 / SB-054 / SB-095. `applyConfig` is the shared tail of the imported
   * settings JSON (`applyConfigFromJson`), the server config applied at sign-in
   * (`config/remote.ts`), `resetConfig` and SB-157. All of them run `setConfig`
   * with `partOfFullConfigChange`, which deliberately says nothing about
   * restarting, so without this the eight generator keys could be rewritten
   * underneath a running test: the task stream would keep the old settings
   * while the submitted `mathSettings` described the new ones, and the server
   * would answer that with `prompt-mismatch` plus an anti-cheat strike.
   *
   * ME-088 — exactly one dispatch per `applyConfig`, however many keys moved
   * and however many times the SB-090/SB-091 cascade fired inside them.
   */
  if (options?.initialLoad === true) return;
  const changed = readRestartKeys() !== restartKeysBefore;
  if (options?.forceRestart === true || changed) {
    restartTestEvent.dispatch();
  }
}

export async function resetConfig(options?: {
  initialLoad?: boolean;
}): Promise<void> {
  await applyConfig(getDefaultConfig(), options);
  await deleteConfig();
  saveFullConfigToLocalStorage(true);
}

/**
 * SB-157 — set all eight settings-bar keys back to the SB-110 defaults in one
 * `applyConfig` call, leaving every appearance/behaviour key untouched, then
 * restart the test. Backs the `restoreDefaultTestSettings` palette command and
 * the clickable "not eligible for leaderboards" notice (SB-181).
 *
 * The restart comes from `applyConfig` rather than from the two call sites, so
 * both surfaces inherit it and it stays a single dispatch (ME-088).
 * `forceRestart` because SB-157 is one deliberate user action: it owes a fresh
 * test even in the corner case where the settings were already the defaults.
 */
export async function restoreDefaultTestSettings(): Promise<void> {
  const defaults = getDefaultConfig();
  await applyConfig(
    {
      ...Config,
      addition: defaults.addition,
      multiplication: defaults.multiplication,
      division: defaults.division,
      fractionAddition: defaults.fractionAddition,
      fractionMultiplication: defaults.fractionMultiplication,
      decimals: defaults.decimals,
      negatives: defaults.negatives,
      time: defaults.time,
    },
    { forceRestart: true },
  );
  saveFullConfigToLocalStorage();
}

const { promise: configLoadPromise, resolve: loadDone } =
  promiseWithResolvers();

export { configLoadPromise };
