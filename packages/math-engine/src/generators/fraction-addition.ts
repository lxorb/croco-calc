/**
 * Setting 4 — fraction addition (ME-056 … ME-067).
 *
 * The exercise this setting trains is *finding the common denominator and adding
 * the numerators*, so `D` bounds `lcm(d1, d2)` — the denominator the two
 * fractions must be brought onto — not the individual denominators.
 *
 * ASSUMPTION A4 (ME-060): `d1 !== d2` is required; equal denominators make the
 * "bring onto a common denominator" concept vacuous.
 */

import type { Prng } from "../prng";
import { add, gcd, lcm, rational } from "../rational";
import type { FractionAdditionSetting } from "../types";
import type { FractionDraw } from "./draw";

export type FractionAdditionState = Exclude<FractionAdditionSetting, "off">;

/** ME-056 — the configured maximum common denominator. */
export function commonDenominatorLimit(state: FractionAdditionState): number {
  return Number(state);
}

/** ME-059 — a denominator of 1 would force the numerator to 0. */
export const FRACTION_DENOMINATOR_MIN = 2;

const numeratorCache = new Map<number, readonly number[]>();

/**
 * ME-061 / ME-062 / ME-063 — the coprime residues in `[1, d - 1]`, so every
 * displayed fraction is proper and already in lowest terms.
 *
 * E22: for `d = 2` the only candidate is `1`; the distribution is degenerate but
 * valid.
 */
export function coprimeNumerators(d: number): readonly number[] {
  const cached = numeratorCache.get(d);
  if (cached !== undefined) return cached;

  const list: number[] = [];
  for (let n = 1; n < d; n++) {
    if (gcd(n, d) === 1) list.push(n);
  }
  const frozen = Object.freeze(list);
  numeratorCache.set(d, frozen);
  return frozen;
}

const pairCache = new Map<
  FractionAdditionState,
  ReadonlyArray<readonly [number, number]>
>();

/**
 * ME-058 — `P(D) = { (d1, d2) : 2 <= d1, d2 <= D, d1 != d2, lcm(d1, d2) <= D }`,
 * precomputed once per `D` at first use.
 */
export function fractionAdditionDenominatorPairs(
  state: FractionAdditionState,
): ReadonlyArray<readonly [number, number]> {
  const cached = pairCache.get(state);
  if (cached !== undefined) return cached;

  const limit = commonDenominatorLimit(state);
  const pairs: Array<readonly [number, number]> = [];
  for (let d1 = FRACTION_DENOMINATOR_MIN; d1 <= limit; d1++) {
    for (let d2 = FRACTION_DENOMINATOR_MIN; d2 <= limit; d2++) {
      if (d1 === d2) continue;
      if (lcm(d1, d2) > limit) continue;
      pairs.push(Object.freeze([d1, d2] as const));
    }
  }
  const frozen = Object.freeze(pairs);
  pairCache.set(state, frozen);
  return frozen;
}

export function generateFractionAddition(
  rng: Prng,
  state: FractionAdditionState,
): FractionDraw {
  const pairs = fractionAdditionDenominatorPairs(state);
  const pair = pairs[rng.nextInt(0, pairs.length - 1)] as readonly [
    number,
    number,
  ];
  const [d1, d2] = pair;

  const c1 = coprimeNumerators(d1);
  const c2 = coprimeNumerators(d2);
  const n1 = c1[rng.nextInt(0, c1.length - 1)] as number;
  const n2 = c2[rng.nextInt(0, c2.length - 1)] as number;

  // ME-064: exact, fully reduced, positive denominator. ME-065/ME-066: improper
  // and integer results are permitted and are never redrawn.
  const answer = add(rational(n1, d1), rational(n2, d2));
  return { n1, d1, n2, d2, answer };
}
