/**
 * Setting 5 — fraction multiplication (ME-073 … ME-081).
 *
 * Bounds follow the `multiplication` setting's `N` (ME-074): computing `n1·n2`
 * and `d1·d2` **is** a multiplication of the size configured by setting 2, which
 * is what makes the coupling coherent (ME-080).
 *
 * Unlike fraction addition, `d1 === d2` is permitted (ME-075) — no common
 * denominator is needed for multiplication.
 */

import type { Prng } from "../prng";
import { multiply, rational } from "../rational";
import {
  coprimeNumerators,
  FRACTION_DENOMINATOR_MIN,
} from "./fraction-addition";
import { multiplicationBound } from "./multiplication";
import type { MultiplicationState } from "./multiplication";
import type { FractionDraw } from "./draw";

export function generateFractionMultiplication(
  rng: Prng,
  multiplicationState: MultiplicationState,
): FractionDraw {
  const n = multiplicationBound(multiplicationState);

  const d1 = rng.nextInt(FRACTION_DENOMINATOR_MIN, n);
  const d2 = rng.nextInt(FRACTION_DENOMINATOR_MIN, n);

  // ME-076 / ME-077 (A5): the numerator < denominator invariant is global.
  const c1 = coprimeNumerators(d1);
  const c2 = coprimeNumerators(d2);
  const n1 = c1[rng.nextInt(0, c1.length - 1)] as number;
  const n2 = c2[rng.nextInt(0, c2.length - 1)] as number;

  // ME-078: (n1 × n2) / (d1 × d2), exact and fully reduced. ME-079: the result
  // is always a proper fraction in (0, 1) — never an integer, never zero.
  const answer = multiply(rational(n1, d1), rational(n2, d2));
  return { n1, d1, n2, d2, answer };
}
