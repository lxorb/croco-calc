import { ResultFilters, ResultFiltersSchema } from "@croco-calc/schemas/users";
import { MathGeneratorSettings } from "@croco-calc/schemas/math";

import defaultResultFilters from "../../../constants/default-result-filters";
import { sanitize } from "../../../utils/sanitize";
import { typedKeys } from "@croco-calc/util/objects";
import { configMetadata } from "../../../config/metadata";

export function mergeWithDefaultFilters(
  filters: Partial<ResultFilters>,
): ResultFilters {
  try {
    const merged = {} as ResultFilters;
    for (const groupKey of typedKeys(defaultResultFilters)) {
      if (groupKey === "_id") {
        let id = filters[groupKey] ?? defaultResultFilters[groupKey];
        if (id === "default-result-filters-id" || id === "") {
          id = "default";
        }
        merged[groupKey] = id;
      } else if (groupKey === "name") {
        merged[groupKey] = filters[groupKey] ?? defaultResultFilters[groupKey];
      } else {
        // @ts-expect-error i cant figure this out
        merged[groupKey] = {
          ...defaultResultFilters[groupKey],
          ...filters[groupKey],
        };
      }
    }
    return merged;
  } catch (e) {
    return defaultResultFilters;
  }
}

export function verifyResultFiltersStructure(
  filterIn: ResultFilters,
): ResultFilters {
  const filter = mergeWithDefaultFilters(
    sanitize(ResultFiltersSchema.partial().strip(), structuredClone(filterIn)),
  );

  return filter;
}

/** The seven task-shaping settings, in the order every account surface lists them. */
export const SETTING_KEYS = [
  "addition",
  "multiplication",
  "division",
  "fractionAddition",
  "fractionMultiplication",
  "decimals",
  "negatives",
] as const satisfies readonly (keyof MathGeneratorSettings)[];

export type SettingKey = (typeof SETTING_KEYS)[number];

/** AC-078: the heading each setting group renders on the filters block. */
export const SETTING_HEADINGS: Record<SettingKey, string> = {
  addition: "addition",
  multiplication: "multiplication",
  division: "division",
  fractionAddition: "fraction addition",
  fractionMultiplication: "fraction multiplication",
  decimals: "decimals",
  negatives: "negatives",
};

/** AC-078 / AC-082 / AC-102: one icon per setting group. */
export const SETTING_ICONS: Record<SettingKey, string> = {
  addition: "ph:plus-bold",
  multiplication: "ph:x-bold",
  division: "ph:divide-bold",
  fractionAddition: "ph:plus-minus-bold",
  fractionMultiplication: "ph:asterisk-bold",
  decimals: "ph:circle-bold",
  negatives: "ph:minus-bold",
};

/**
 * AC-102 (master §2.31 gap 4): map the **stored** value through the shared
 * SB-024 … SB-047 label table rather than string-matching a display literal
 * against it. The bar renders `off` with the first ON label greyed out
 * (SB-026); on the account surfaces `off` has to read `off`, so that one case
 * is spelled out here and every other label comes from the shared table.
 */
export function settingLabel(key: SettingKey, value: string | boolean): string {
  if (value === "off" || value === false) return "off";
  if (value === true) return "on";

  const options = configMetadata[key].optionsMetadata as
    | Record<string, { displayString?: string } | undefined>
    | undefined;

  return options?.[value]?.displayString ?? value;
}

/** AC-102: `multiplication 100x100`, built from the stored value. */
export function settingBalloon(
  key: SettingKey,
  value: string | boolean,
): string {
  return `${SETTING_HEADINGS[key]} ${settingLabel(key, value)}`;
}

/** AC-087 / AC-102: the settings that were actually generating tasks. */
export function enabledSettings(
  settings: MathGeneratorSettings,
): { key: SettingKey; value: string | boolean }[] {
  return SETTING_KEYS.map((key) => ({ key, value: settings[key] })).filter(
    ({ value }) => value !== "off" && value !== false,
  );
}
