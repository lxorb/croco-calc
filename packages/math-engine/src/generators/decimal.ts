/**
 * Setting 6 — decimals (ME-090 … ME-108).
 *
 * ASSUMPTION A7: decimals is a **modifier that produces its own task kind** —
 * a sixth selectable kind in the mix, not a per-task chance applied to every
 * add/mul/div task.
 *
 * ASSUMPTION A13 / C39: the base kind is drawn uniformly over the **enabled**
 * subset of `{add, mul, div}`. The brief's "effectively we base ourselves on the
 * division tasks" is its *explanation of why decimal shifting is safe*
 * (a remainder-free division stays terminating under any power-of-ten shift —
 * `1 / 4 = 0.25` because `100 / 4 = 25`), NOT a restriction on the base kind.
 * Implementers MUST NOT restrict decimal tasks to division.
 */

import { MathGenError } from "../errors";
import type { Prng } from "../prng";
import { divide, multiply, rational, add as addRational } from "../rational";
import type { Rational } from "../rational";
import { getDecimalBaseKinds } from "../settings";
import type { DecimalBaseKind, MathSettings } from "../types";
import { generateAddition } from "./addition";
import { generateDivision } from "./division";
import { generateMultiplication } from "./multiplication";

/** ME-101 — resampling cap before the provably-safe `sA = kA` fallback. */
export const DECIMAL_RESAMPLE_CAP = 20;

export type DecimalDraw = {
  baseKind: DecimalBaseKind;
  /** Base integer `A` (ME-095). For a division this is the dividend. */
  a: number;
  /** Base integer `B`. For a division this is the divisor. */
  b: number;
  /** Digit count of `a`. */
  kA: number;
  /** Digit count of `b`. */
  kB: number;
  /** Shift applied to `a`; the rendered operand is `a / 10^sA`. */
  sA: number;
  /** Shift applied to `b`. */
  sB: number;
  /** Exact answer before negation (ME-102). */
  answer: Rational;
};

/**
 * ME-095 — the number of digits in `|A|`, trailing zeros included:
 * `A = 100` has `k = 3`.
 */
export function digitCount(value: number): number {
  const magnitude = Math.abs(value);
  if (magnitude < 1) return 1;
  return Math.floor(Math.log10(magnitude)) + 1 || String(magnitude).length;
}

/** Size of `[0, kA] x [0, kB] \ {(0, 0)}` (ME-098). */
export function shiftPairCount(kA: number, kB: number): number {
  return (kA + 1) * (kB + 1) - 1;
}

/**
 * The `j`-th element of `[0, kA] x [0, kB] \ {(0, 0)}` in row-major order.
 * `(0, 0)` sits at row-major position 0, so shifting the index by one both
 * removes it and keeps the enumeration a bijection.
 */
export function shiftPairAt(
  kA: number,
  kB: number,
  j: number,
): [number, number] {
  const count = shiftPairCount(kA, kB);
  if (!Number.isInteger(j) || j < 0 || j >= count) {
    throw new RangeError(`shiftPairAt: index ${j} out of range [0, ${count})`);
  }
  const raw = j + 1;
  const width = kB + 1;
  return [Math.floor(raw / width), raw % width];
}

/** ME-102 — computed from the exact rationals, never from parsed floats. */
function shiftedAnswer(
  baseKind: DecimalBaseKind,
  a: number,
  b: number,
  sA: number,
  sB: number,
): Rational {
  const left = rational(a, 10 ** sA);
  const right = rational(b, 10 ** sB);
  // ME-103
  if (baseKind === "add") return addRational(left, right);
  // ME-104
  if (baseKind === "mul") return multiply(left, right);
  // ME-105 — equal to q * 10^(sB - sA); the base division is remainder-free
  // (ME-055), so this is always a power-of-ten scaling of an integer.
  return divide(left, right);
}

/** True when `A / 10^s` is a whole number, i.e. the operand renders without a point. */
function rendersAsInteger(value: number, shift: number): boolean {
  return value % 10 ** shift === 0;
}

/**
 * Draws the shift pair for a base task (ME-098 … ME-101).
 *
 * ME-100 (assumption A8) strengthens the brief's `(sA, sB) != (0, 0)`: it must
 * additionally not be the case that operand A, operand B **and** the answer are
 * all integers, because e.g. `1 × 4 = 4` satisfies the literal rule while being
 * "just a normal task". `1 ÷ 4 = 0.25` stays legal — the answer carries the point.
 *
 * The resample loop keeps drawing from the same sub-stream (ME-172) and is capped
 * at 20; the fallback `sA = kA` is provably non-degenerate (ME-101).
 */
export function drawDecimalShift(
  rng: Prng,
  baseKind: DecimalBaseKind,
  a: number,
  b: number,
): DecimalDraw {
  const kA = digitCount(a);
  const kB = digitCount(b);
  const count = shiftPairCount(kA, kB);

  let sA = 0;
  let sB = 0;
  for (let attempt = 0; attempt < DECIMAL_RESAMPLE_CAP; attempt++) {
    [sA, sB] = shiftPairAt(kA, kB, rng.nextInt(0, count - 1));
    const answer = shiftedAnswer(baseKind, a, b, sA, sB);
    const degenerate =
      rendersAsInteger(a, sA) && rendersAsInteger(b, sB) && answer.d === 1;
    if (!degenerate) return { baseKind, a, b, kA, kB, sA, sB, answer };
  }

  // ME-101: for a kA-digit A, 10^(kA-1) <= A < 10^kA, so A / 10^kA is in
  // [0.1, 1) and can never be an integer. This terminates the algorithm and
  // proves ME-100 is always satisfiable.
  sA = kA;
  return {
    baseKind,
    a,
    b,
    kA,
    kB,
    sA,
    sB,
    answer: shiftedAnswer(baseKind, a, b, sA, sB),
  };
}

/**
 * A full decimal task draw.
 *
 * PRNG draw order is normative for reproducibility (ME-115, ME-170):
 * (1) base kind, (2) the base generator's own draws, (3) the shift pair.
 */
export function generateDecimal(
  rng: Prng,
  settings: MathSettings,
): DecimalDraw {
  const baseKinds = getDecimalBaseKinds(settings);
  if (baseKinds.length === 0) {
    // ME-092 / E10: the decimal kind is inert here and must never be offered to
    // the mixer, so reaching this point is a caller bug, not a user state.
    throw new MathGenError(
      "no-enabled-generators",
      "decimal tasks need at least one of addition, multiplication or division (ME-092)",
    );
  }

  const baseKind = baseKinds[
    rng.nextInt(0, baseKinds.length - 1)
  ] as DecimalBaseKind;

  // ME-094: the base task comes from the *unmodified* generator for that kind,
  // using that kind's currently configured state.
  let base;
  switch (baseKind) {
    case "add":
      base = generateAddition(
        rng,
        settings.addition as Exclude<MathSettings["addition"], "off">,
      );
      break;
    case "mul":
      base = generateMultiplication(
        rng,
        settings.multiplication as Exclude<
          MathSettings["multiplication"],
          "off"
        >,
      );
      break;
    case "div":
      base = generateDivision(
        rng,
        settings.division as Exclude<MathSettings["division"], "off">,
      );
      break;
  }

  return drawDecimalShift(rng, baseKind, base.a, base.b);
}
