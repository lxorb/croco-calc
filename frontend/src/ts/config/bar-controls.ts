import * as ConfigSchemas from "@croco-calc/schemas/configs";

import { BarKey, BAR_KEYS } from "./coupling";
import { configMetadata } from "./metadata";

/**
 * Presentation table for the eight settings-bar controls: pill grouping,
 * per-state labels and per-state tooltips (SB-022 … SB-048, SB-084 … SB-086).
 *
 * The **labels** are not duplicated here — they live in
 * `configMetadata[key].optionsMetadata[value].displayString`, so the bar and
 * the command palette read one mapping table, never two (SB-155).
 *
 * The **tooltips** are declared below as exhaustive `Record`s over each key's
 * value domain, which makes SB-201 a compile-time property: adding a schema
 * value without a tooltip is a type error, not a runtime blank.
 */

/** SB-084 — exactly three pill cards, in DOM order. */
export const BAR_PILLS = {
  /** Two on/off modifiers that decorate the generated task (SB-086). */
  left: ["decimals", "negatives"],
  /** The five "what am I practising" controls, in brief order 1→5 (SB-086). */
  centre: [
    "addition",
    "multiplication",
    "division",
    "fractionAddition",
    "fractionMultiplication",
  ],
  /** The single test-length parameter — monkeytype's mode2 slot. */
  right: ["time"],
} as const satisfies Record<string, readonly BarKey[]>;

/** SB-141 — tab order follows DOM order. */
export const BAR_ORDER: readonly BarKey[] = BAR_KEYS;

type TooltipTable = {
  [K in BarKey]: ConfigSchemas.Config[K] extends boolean
    ? Record<"true" | "false", string>
    : Record<Extract<ConfigSchemas.Config[K], string | number>, string>;
};

const TOOLTIPS: TooltipTable = {
  // SB-025
  addition: {
    off: "addition: off",
    "100": "addition: +100",
    "1000": "addition: +1000",
  },
  // SB-028
  multiplication: {
    off: "multiplication: off",
    "12": "multiplication: 12x12",
    "20": "multiplication: 20x20",
    "100": "multiplication: 100x100",
  },
  // SB-032
  division: {
    off: "division: off",
    tables: "division: 144/12",
    threeByTwo: "division: xxx/xx",
  },
  // SB-035
  fractionAddition: {
    off: "fraction addition: off",
    "12": "fraction addition: max denominator 12",
    "99": "fraction addition: max denominator 99",
  },
  // SB-038 — the ON text is completed with the current multiplication size.
  fractionMultiplication: {
    false: "fraction multiplication: off",
    true: "fraction multiplication: max",
  },
  // SB-041
  decimals: {
    false: "decimals: off",
    true: "decimals: on",
  },
  // SB-044 — the tooltip is load-bearing: a bare minus glyph would otherwise
  // read as "subtraction", which croco calc does not have.
  negatives: {
    false: "negative numbers: off",
    true: "negative numbers: on",
  },
  // SB-047
  time: {
    1: "time: 1 minute",
    2: "time: 2 minutes",
    4: "time: 4 minutes",
    8: "time: 8 minutes",
  },
};

function valueKey(value: ConfigSchemas.ConfigValue): string {
  return String(value);
}

/**
 * SB-022 — the label rendered inside the control, for the given state.
 * `off` states keep their ON label and are struck through instead (SB-072);
 * the one exception is division, whose OFF label is `/` (SB-031).
 */
export function getBarLabel<K extends BarKey>(
  key: K,
  value: ConfigSchemas.Config[K],
): string {
  const options = configMetadata[key].optionsMetadata as
    | Record<string, { displayString?: string }>
    | undefined;
  const label = options?.[valueKey(value)]?.displayString;
  if (label === undefined) {
    throw new Error(
      `No settings-bar label for ${key} = ${valueKey(value)} (SB-201).`,
    );
  }
  return label;
}

/**
 * SB-144/SB-145 — the tooltip text, which is also the control's `aria-label`.
 * It always names the control, never only the state, because `4.2`, `-` and
 * `/` are not self-describing.
 */
export function getBarTooltip<K extends BarKey>(
  key: K,
  value: ConfigSchemas.Config[K],
  config: Readonly<ConfigSchemas.Config>,
): string {
  const table = TOOLTIPS[key] as Record<string, string>;
  const text = table[valueKey(value)];
  if (text === undefined) {
    throw new Error(
      `No settings-bar tooltip for ${key} = ${valueKey(value)} (SB-201).`,
    );
  }
  // SB-038/SB-094: fraction multiplication mirrors the current multiplication
  // size — the label stays `*x/y` in every case, only the tooltip moves.
  if (key === "fractionMultiplication" && value === true) {
    const size =
      config.multiplication === "off" ? "100" : config.multiplication;
    return `${text} ${size}`;
  }
  return text;
}

/** Whether a control is in its OFF state — drives the strikethrough (SB-071/072). */
export function isBarValueOff<K extends BarKey>(
  key: K,
  value: ConfigSchemas.Config[K],
): boolean {
  // SB-048: the time control has no OFF state and must never render in it.
  if (key === "time") return false;
  return value === "off" || value === false;
}

export const __testing = { TOOLTIPS };
