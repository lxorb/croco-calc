/**
 * Operand construction and evaluation (ME-005, ME-113, ME-114, ME-118).
 *
 * Magnitudes are always positive; `negative` carries the sign, which is applied
 * last in the pipeline (ME-115). A fraction is **one** operand, so negating it
 * negates the whole fraction and never touches the denominator (ME-113, E38).
 */

import { fromInt, rational } from "./rational";
import type { Rational } from "./rational";
import type {
  DecimalOperand,
  FractionOperand,
  IntOperand,
  Operand,
  Operator,
} from "./types";

export function intOperand(magnitude: number): IntOperand {
  return { type: "int", magnitude, negative: false };
}

export function decimalOperand(
  mantissa: number,
  shift: number,
): DecimalOperand {
  return {
    type: "decimal",
    mantissa,
    digits: String(Math.abs(mantissa)).length,
    shift,
    negative: false,
  };
}

export function fractionOperand(
  numerator: number,
  denominator: number,
): FractionOperand {
  return { type: "fraction", numerator, denominator, negative: false };
}

/** Flips the sign flag. Never produces a signed denominator (ME-113). */
export function negateOperand<T extends Operand>(operand: T): T {
  return { ...operand, negative: !operand.negative };
}

/** The operand's exact signed value. */
export function operandValue(operand: Operand): Rational {
  let value: Rational;
  switch (operand.type) {
    case "int":
      value = fromInt(operand.magnitude);
      break;
    case "decimal":
      // ME-114: the sign applies to the already-shifted decimal value.
      value = rational(operand.mantissa, 10 ** operand.shift);
      break;
    case "fraction":
      value = rational(operand.numerator, operand.denominator);
      break;
  }
  return operand.negative ? { n: -value.n + 0, d: value.d } : value;
}

/** True when the operand's magnitude has no fractional part once rendered. */
export function rendersAsInteger(operand: Operand): boolean {
  return operandValue(operand).d === 1;
}

/**
 * ME-118 — the exact answer, recomputed from the (possibly negated) operands.
 * Doing it this way rather than patching a pre-negation answer is what makes
 * ME-105's closed form and the negation rules agree by construction.
 */
export function computeAnswer(
  operator: Operator,
  a: Operand,
  b: Operand,
): Rational {
  const left = operandValue(a);
  const right = operandValue(b);
  if (operator === "+") {
    return rational(left.n * right.d + right.n * left.d, left.d * right.d);
  }
  if (operator === "×") {
    return rational(left.n * right.n, left.d * right.d);
  }
  // ME-026: every generated divisor has magnitude >= 2 and negation never
  // produces zero (ME-116), so this branch cannot divide by zero.
  if (right.n === 0) {
    throw new RangeError("computeAnswer: divisor is zero");
  }
  return rational(left.n * right.d, left.d * right.n);
}
