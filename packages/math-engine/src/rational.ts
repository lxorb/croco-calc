/**
 * Exact rational arithmetic (ME-020, ME-021, ME-025).
 *
 * Every generated value, every expected answer and every correctness comparison
 * in croco calc goes through this module. Binary floating point MUST NOT be used
 * for any of them: `0.1 + 0.2 !== 0.3` in IEEE-754, and the frontend and backend
 * have to agree bit-for-bit for server-side revalidation (ME-174).
 *
 * A `Rational` is always stored fully reduced with a strictly positive
 * denominator, so structural equality of two `Rational`s implies value equality.
 * `BigInt` is deliberately not used (ME-022) — the caps of ME-133/ME-144 keep the
 * largest comparison intermediate at 10^14, well inside `Number.MAX_SAFE_INTEGER`.
 */

/** An exact rational number. Always reduced; `d` is always `>= 1`. */
export type Rational = {
  /** Signed numerator. Never `-0`. */
  readonly n: number;
  /** Denominator. Always a positive integer. */
  readonly d: number;
};

/** Greatest common divisor of the magnitudes of `a` and `b`. */
export function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

/** Least common multiple of the magnitudes of `a` and `b`. */
export function lcm(a: number, b: number): number {
  const x = Math.abs(a);
  const y = Math.abs(b);
  if (x === 0 || y === 0) return 0;
  return (x / gcd(x, y)) * y;
}

function assertSafeInteger(value: number, what: string): void {
  if (!Number.isInteger(value)) {
    throw new TypeError(`${what} must be an integer, received ${value}`);
  }
  if (!Number.isSafeInteger(value)) {
    // ME-022: the engine must never leave the safe integer range.
    throw new RangeError(`${what} left the safe integer range: ${value}`);
  }
}

/**
 * Builds a reduced rational with a positive denominator.
 * @throws {RangeError} when `d === 0` (ME-026 — never `Infinity`, never `NaN`).
 */
export function rational(n: number, d: number): Rational {
  assertSafeInteger(n, "numerator");
  assertSafeInteger(d, "denominator");
  if (d === 0) throw new RangeError("rational: denominator must not be zero");

  let num = n;
  let den = d;
  if (den < 0) {
    num = -num;
    den = -den;
  }
  const divisor = gcd(num, den);
  if (divisor > 1) {
    num = num / divisor;
    den = den / divisor;
  }
  // `+ 0` collapses `-0` to `0` so that ME-149 / ME-134 hold structurally.
  return { n: num + 0, d: den };
}

/** The integer `value` as a rational. */
export function fromInt(value: number): Rational {
  assertSafeInteger(value, "value");
  return { n: value + 0, d: 1 };
}

/**
 * The value `mantissa / 10^shift` as an exact rational (ME-095, ME-102).
 * This is how a decimal-shifted operand and a parsed `DEC` answer are built —
 * never by parsing a float.
 */
export function fromDecimal(mantissa: number, shift: number): Rational {
  assertSafeInteger(mantissa, "mantissa");
  if (!Number.isInteger(shift) || shift < 0) {
    throw new RangeError(`fromDecimal: shift must be a non-negative integer`);
  }
  return rational(mantissa, 10 ** shift);
}

export function add(a: Rational, b: Rational): Rational {
  return rational(a.n * b.d + b.n * a.d, a.d * b.d);
}

export function subtract(a: Rational, b: Rational): Rational {
  return rational(a.n * b.d - b.n * a.d, a.d * b.d);
}

export function multiply(a: Rational, b: Rational): Rational {
  return rational(a.n * b.n, a.d * b.d);
}

/**
 * @throws {RangeError} when `b` is zero. Generation can never reach this
 * (ME-026); judging never calls it.
 */
export function divide(a: Rational, b: Rational): Rational {
  if (b.n === 0) throw new RangeError("divide: division by zero");
  return rational(a.n * b.d, a.d * b.n);
}

export function negate(a: Rational): Rational {
  return { n: -a.n + 0, d: a.d };
}

export function absolute(a: Rational): Rational {
  return { n: Math.abs(a.n), d: a.d };
}

/**
 * Exact equality by cross-multiplication (ME-147). There is no epsilon
 * tolerance anywhere (ME-025).
 */
export function equals(a: Rational, b: Rational): boolean {
  return a.n * b.d === b.n * a.d;
}

/** `-1`, `0` or `1`. Both denominators are positive so the sign is preserved. */
export function compare(a: Rational, b: Rational): -1 | 0 | 1 {
  const left = a.n * b.d;
  const right = b.n * a.d;
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export function isInteger(a: Rational): boolean {
  return a.d === 1;
}

export function isZero(a: Rational): boolean {
  return a.n === 0;
}

export function isNegative(a: Rational): boolean {
  return a.n < 0;
}

/**
 * Lossy float view. For display maths and statistics only — MUST NOT be used
 * for judging (ME-025, ME-147).
 */
export function toNumber(a: Rational): number {
  return a.n / a.d;
}

export const ZERO: Rational = { n: 0, d: 1 };
export const ONE: Rational = { n: 1, d: 1 };
