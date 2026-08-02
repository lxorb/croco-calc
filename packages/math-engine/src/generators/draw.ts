/**
 * The shapes the five base generators return, before the decimal shift (ME-095)
 * and before negation (ME-110). Everything here is a positive magnitude.
 */

import type { Rational } from "../rational";

/** `add`, `mul` and `div` all reduce to a pair of positive integers. */
export type IntegerDraw = {
  /** First operand: the summand, the left factor, or the **dividend**. */
  a: number;
  /** Second operand: the summand, the right factor, or the **divisor**. */
  b: number;
  /** Exact answer before negation. */
  answer: Rational;
};

/** `fracAdd` and `fracMul` return two proper, reduced fractions. */
export type FractionDraw = {
  n1: number;
  d1: number;
  n2: number;
  d2: number;
  /** Exact answer before negation, fully reduced (ME-064, ME-078). */
  answer: Rational;
};
