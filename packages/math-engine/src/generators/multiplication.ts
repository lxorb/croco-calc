/**
 * Setting 2 — multiplication (ME-035 … ME-041).
 *
 * Both factors are drawn independently and uniformly from `[2, N]`. `0` and `1`
 * are excluded (ME-038): they make the task trivial and, for `1`, would make the
 * "×" nature invisible. Squares are permitted (ME-040).
 */

import type { Prng } from "../prng";
import { fromInt } from "../rational";
import type { MultiplicationSetting } from "../types";
import type { IntegerDraw } from "./draw";

export type MultiplicationState = Exclude<MultiplicationSetting, "off">;

/** ME-036 / ME-041 — `N` is also the bound fraction multiplication follows (ME-074). */
export function multiplicationBound(state: MultiplicationState): number {
  return Number(state);
}

export const MULTIPLICATION_FACTOR_MIN = 2;

export function generateMultiplication(
  rng: Prng,
  state: MultiplicationState,
): IntegerDraw {
  const n = multiplicationBound(state);
  const a = rng.nextInt(MULTIPLICATION_FACTOR_MIN, n);
  const b = rng.nextInt(MULTIPLICATION_FACTOR_MIN, n);
  return { a, b, answer: fromInt(a * b) };
}
