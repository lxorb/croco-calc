/**
 * Setting 3 — division (ME-042 … ME-055), with C2's `"threeByTwo"` literal and
 * C28's ruling that the `xxx/xx` dividend is **exactly** three digits.
 *
 * Both states build the dividend from `divisor × quotient`, which makes
 * remainder-freeness true by construction (ME-049, ME-055). Implementers MUST
 * NOT instead draw a dividend and test for divisibility.
 */

import type { Prng } from "../prng";
import { fromInt } from "../rational";
import type { DivisionSetting } from "../types";
import type { IntegerDraw } from "./draw";

export type DivisionState = Exclude<DivisionSetting, "off">;

/**
 * ME-045 / A12 — deliberately fixed at 1…12 and NOT following the
 * `multiplication` setting: the control's label is the literal string `144/12`,
 * and a control labelled `144/12` that silently generated `400 ÷ 20` would break
 * the "always identifiable" contract. This is the opposite of fraction
 * multiplication (ME-074), whose label `*x/y` carries no numbers precisely
 * because its bounds do follow setting 2.
 */
export const TABLES_MIN = 2;
export const TABLES_MAX = 12;

/** ME-047 — `xxx/xx`. */
export const THREE_BY_TWO_DIVIDEND_MIN = 100;
export const THREE_BY_TWO_DIVIDEND_MAX = 999;
export const THREE_BY_TWO_DIVISOR_MIN = 2;
export const THREE_BY_TWO_DIVISOR_MAX = 99;

/**
 * ME-048 steps 2-3. Non-empty for every `d in [2, 99]` (ME-050): the worst cases
 * are `d = 2 -> [50, 499]` and `d = 99 -> [2, 10]`.
 */
export function divisionQuotientRange(d: number): [number, number] {
  const qMin = Math.max(2, Math.ceil(THREE_BY_TWO_DIVIDEND_MIN / d));
  const qMax = Math.floor(THREE_BY_TWO_DIVIDEND_MAX / d);
  return [qMin, qMax];
}

export function generateDivision(rng: Prng, state: DivisionState): IntegerDraw {
  if (state === "tables") {
    // ME-043: divisor then quotient; 0 and 1 excluded from both (ME-046).
    const d = rng.nextInt(TABLES_MIN, TABLES_MAX);
    const q = rng.nextInt(TABLES_MIN, TABLES_MAX);
    return { a: d * q, b: d, answer: fromInt(q) };
  }

  // ME-048: the exact two-stage procedure is normative, and it is deliberately
  // NOT uniform over the (d, q) pair set — that would make tiny divisors
  // dominate (ME-054).
  const d = rng.nextInt(THREE_BY_TWO_DIVISOR_MIN, THREE_BY_TWO_DIVISOR_MAX);
  const [qMin, qMax] = divisionQuotientRange(d);
  const q = rng.nextInt(qMin, qMax);
  return { a: d * q, b: d, answer: fromInt(q) };
}
