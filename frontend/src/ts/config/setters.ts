import * as ConfigSchemas from "@croco-calc/schemas/configs";
import { typedKeys } from "@croco-calc/util/objects";
import { ZodType as ZodSchema } from "zod";

import { saveToLocalStorage } from "../config/persistence";
import { configEvent } from "../events/config";
import { triggerResize } from "../utils/misc";
import { CycleDirection, nextCycleValue, BarKey } from "./coupling";
import { configMetadata } from "./metadata";
import { Config, setConfigStore } from "./store";
import { isConfigValueValid } from "./validation";

export function setConfig<T extends keyof ConfigSchemas.Config>(
  key: T,
  value: ConfigSchemas.Config[T],
  options?: {
    nosave?: boolean;
    partOfFullConfigChange?: boolean;
  },
): boolean {
  const metadata = configMetadata[key];
  if (metadata === undefined) {
    throw new Error(`Config metadata for key "${key}" is not defined.`);
  }

  if (metadata.overrideValue) {
    value = metadata.overrideValue({
      value,
      currentValue: Config[key],
      currentConfig: Config,
    });
  }

  const previousValue = Config[key];

  // SB-101/SB-103/SB-215: the all-off guard lives here, evaluated on the
  // post-cascade configuration, so every entry point shares one predicate.
  if (metadata.isBlocked?.({ value, currentConfig: Config })) {
    console.warn(
      `Could not set config key "${key}" with value "${JSON.stringify(
        value,
      )}" - blocked.`,
    );
    return false;
  }

  const schema = ConfigSchemas.ConfigSchema.shape[key] as ZodSchema;

  if (!isConfigValueValid(metadata.displayString ?? key, value, schema)) {
    console.warn(
      `Could not set config key "${key}" with value "${JSON.stringify(
        value,
      )}" - invalid value.`,
    );
    return false;
  }

  // SB-090/SB-091: the coupling cascade, run through monkeytype's own
  // `overrideConfig` mechanism so it fires from every entry point (SB-095).
  if (metadata.overrideConfig) {
    const targetConfig = metadata.overrideConfig({
      value,
      currentConfig: Config,
    });

    for (const targetKey of typedKeys(targetConfig)) {
      const targetValue = targetConfig[
        targetKey
      ] as ConfigSchemas.Config[keyof typeof configMetadata];

      if (Config[targetKey] === targetValue) {
        continue; // no need to set if the value is already the same
      }

      const set = setConfig(targetKey, targetValue, options);
      if (!set) {
        throw new Error(
          `Failed to set config key "${targetKey}" with value "${String(
            targetValue,
          )}" for ${metadata.displayString ?? key} config override.`,
        );
      }
    }
  }

  Config[key] = value;
  if (!options?.nosave) saveToLocalStorage(key, options?.nosave);

  // @ts-expect-error i can't figure this out
  configEvent.dispatch({
    key: key,
    newValue: value,
    nosave: options?.nosave ?? false,
    previousValue: previousValue,
  });

  if (!options?.partOfFullConfigChange) {
    setConfigStore(key, value);
  }

  if (metadata.triggerResize && !options?.nosave) {
    triggerResize();
  }

  metadata.afterSet?.({
    nosave: options?.nosave ?? false,
    currentConfig: Config,
  });
  return true;
}

/**
 * SB-050/SB-051/SB-052 — advance a settings-bar control one step.
 *
 * `direction` is `1` for a primary click / `Enter` / `Space` and `-1` for
 * `Shift`+click, `Shift`+`Enter`, `Shift`+`Space` and the context-menu event.
 * States disallowed by the SB-215 guard are skipped silently; when every other
 * state is disallowed the call is a no-op and returns `false` (SB-052).
 *
 * The eight controls share this one helper, so the bar, the mobile modal and
 * the keyboard path can never drift apart.
 */
export function cycleSetting(
  key: BarKey,
  direction: CycleDirection = 1,
): boolean {
  const next = nextCycleValue(key, direction, Config);
  if (next === undefined) return false;
  return setConfig(key, next);
}
