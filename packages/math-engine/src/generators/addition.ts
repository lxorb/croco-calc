/**
 * Setting 1 — normal addition (ME-027 … ME-034).
 *
 * ASSUMPTION A1: `+100` / `+1000` are the German didactic *Zahlenraum bis 100 /
 * bis 1000* — the whole task, result included, stays inside the range.
 * ASSUMPTION A2: the floors (`a+b >= 11`, and `a,b >= 10` with `a+b >= 101`)
 * exist so the two states occupy disjoint difficulty bands.
 */

import type { Prng } from "../prng";
import { fromInt } from "../rational";
import type { AdditionSetting } from "../types";
import type { IntegerDraw } from "./draw";

export type AdditionState = Exclude<AdditionSetting, "off">;

export type AdditionBand = {
  /** Smallest legal operand. */
  operandMin: number;
  /** Smallest legal sum. */
  sumMin: number;
  /** Largest legal sum; also bounds each operand at `sumMax - operandMin`. */
  sumMax: number;
};

/** ME-028 / ME-029 — the two disjoint bands. */
export const ADDITION_BANDS = {
  "100": { operandMin: 2, sumMin: 11, sumMax: 100 },
  "1000": { operandMin: 10, sumMin: 101, sumMax: 1000 },
} as const satisfies Record<AdditionState, AdditionBand>;

/** ME-030 — hard cap on rejection-sampling attempts. */
export const ADDITION_REJECTION_CAP = 200;

function operandMax(band: AdditionBand): number {
  return band.sumMax - band.operandMin;
}

/** Number of `(a, b)` pairs whose sum is exactly `s`. */
function pairsWithSum(band: AdditionBand, s: number): number {
  const lo = Math.max(band.operandMin, s - operandMax(band));
  const hi = Math.min(operandMax(band), s - band.operandMin);
  return hi < lo ? 0 : hi - lo + 1;
}

type PairIndex = { total: number; prefix: number[] };

const pairIndexCache = new Map<AdditionState, PairIndex>();

/**
 * Cumulative pair counts by sum, so the enumerated pair set of ME-030 can be
 * indexed in O(log n) without materialising 478 350 pairs.
 */
function pairIndex(state: AdditionState): PairIndex {
  const cached = pairIndexCache.get(state);
  if (cached !== undefined) return cached;

  const band = ADDITION_BANDS[state];
  const prefix: number[] = [];
  let total = 0;
  for (let s = band.sumMin; s <= band.sumMax; s++) {
    total += pairsWithSum(band, s);
    prefix.push(total);
  }
  const built = { total, prefix };
  pairIndexCache.set(state, built);
  return built;
}

/** `|S100|` / `|S1000|` — the size of the enumerated pair set (ME-030). */
export function additionPairCount(state: AdditionState): number {
  return pairIndex(state).total;
}

/**
 * The `k`-th pair of the enumerated set, ordered by sum ascending then by `a`
 * ascending. This is ME-030's "uniform indexing into the enumerated pair set".
 */
export function additionPairAt(
  state: AdditionState,
  k: number,
): [number, number] {
  const { total, prefix } = pairIndex(state);
  if (!Number.isInteger(k) || k < 0 || k >= total) {
    throw new RangeError(
      `additionPairAt: index ${k} out of range [0, ${total})`,
    );
  }
  const band = ADDITION_BANDS[state];

  // binary search for the first sum whose prefix count exceeds k
  let lo = 0;
  let hi = prefix.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((prefix[mid] as number) <= k) lo = mid + 1;
    else hi = mid;
  }
  const s = band.sumMin + lo;
  const before = lo === 0 ? 0 : (prefix[lo - 1] as number);
  const aMin = Math.max(band.operandMin, s - operandMax(band));
  const a = aMin + (k - before);
  return [a, s - a];
}

/** Materialises the whole pair set. Only sane for `"100"` (4 725 pairs). */
export function enumerateAdditionPairs(
  state: AdditionState,
): Array<[number, number]> {
  const count = additionPairCount(state);
  return Array.from({ length: count }, (_, k) => additionPairAt(state, k));
}

/**
 * ME-028 … ME-032. The pair is drawn **uniformly from the constraint set**.
 *
 * Rejection sampling is the normative primary path (ME-030); after
 * `ADDITION_REJECTION_CAP` failures it falls back to uniform indexing into the
 * enumerated set, which ME-030 declares distributionally equivalent. Acceptance
 * is ~50 % for both states, so the fallback is unreachable in practice
 * (`0.5^200`) but keeps the algorithm total and deterministic (ME-172: the
 * fallback draws from the same sub-stream and never reseeds).
 */
export function generateAddition(rng: Prng, state: AdditionState): IntegerDraw {
  const band = ADDITION_BANDS[state];
  const max = operandMax(band);

  for (let attempt = 0; attempt < ADDITION_REJECTION_CAP; attempt++) {
    const a = rng.nextInt(band.operandMin, max);
    const b = rng.nextInt(band.operandMin, max);
    const sum = a + b;
    if (sum >= band.sumMin && sum <= band.sumMax) {
      // ME-034: emitted in draw order, never re-randomised.
      return { a, b, answer: fromInt(sum) };
    }
  }

  const [a, b] = additionPairAt(
    state,
    rng.nextInt(0, additionPairCount(state) - 1),
  );
  return { a, b, answer: fromInt(a + b) };
}
