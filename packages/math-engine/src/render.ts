/**
 * Prompt and answer rendering (ME-127 … ME-134).
 *
 * C33 rules that **display** uses `−` (U+2212) for a negative sign, including in
 * `answerDisplay`. ME-131's rules for *where* the sign goes (bare when it is the
 * first operand, parenthesised when it is the second, never rewritten as a
 * subtraction operator) are binding; only the glyph changes from doc 01's ASCII.
 * Input normalisation (ME-138, ME-139) is unaffected, and comparison always uses
 * exact rationals (ME-147), never strings.
 */

import { gcd } from "./rational";
import type { Rational } from "./rational";
import type { Operand, Operator, TaskKind } from "./types";
import { operandValue } from "./operand";

/** ME-127 — the three operator glyphs. There is no subtraction glyph (ME-033). */
export const OPERATOR_ADD = "+";
export const OPERATOR_MUL = "×";
export const OPERATOR_DIV = "÷";

/** C33 / CP-033 — the display minus. NOT the ASCII hyphen. */
export const MINUS = "−";

/** ME-130 — fractions are rendered inline, never stacked. */
export const FRACTION_SEPARATOR = "/";

/**
 * Canonical decimal string for a terminating rational (ME-132, ME-133):
 * trailing zeros stripped, no trailing bare point, always a leading `0` before
 * the point, `.` as the separator, no thousands separator.
 *
 * Returns `null` when the value does not terminate — rounding is forbidden
 * (ME-025), so the caller must fall back to the `p/q` form.
 */
export function decimalString(value: Rational): string | null {
  let denominator = value.d;
  let twos = 0;
  let fives = 0;
  while (denominator % 2 === 0) {
    denominator /= 2;
    twos++;
  }
  while (denominator % 5 === 0) {
    denominator /= 5;
    fives++;
  }
  if (denominator !== 1) return null;

  const places = Math.max(twos, fives);
  const scale = 10 ** places;
  const scaled = Math.abs(value.n) * (scale / value.d);
  const negative = value.n < 0;

  let body: string;
  if (places === 0) {
    body = String(scaled);
  } else {
    const digits = String(scaled).padStart(places + 1, "0");
    const whole = digits.slice(0, digits.length - places);
    const fraction = digits.slice(digits.length - places).replace(/0+$/, "");
    body = fraction.length === 0 ? whole : `${whole}.${fraction}`;
  }

  // Negative zero renders as `0` (ME-134, E6).
  return negative && scaled !== 0 ? `${MINUS}${body}` : body;
}

/** The operand's magnitude as a display string, with no sign. */
export function renderOperandMagnitude(operand: Operand): string {
  if (operand.type === "int") return String(operand.magnitude);
  if (operand.type === "fraction") {
    return `${operand.numerator}${FRACTION_SEPARATOR}${operand.denominator}`;
  }
  const numerator = operand.mantissa;
  const denominator = 10 ** operand.shift;
  const divisor = gcd(numerator, denominator);
  const rendered = decimalString({
    n: numerator / divisor,
    d: denominator / divisor,
  });
  // Every decimal operand is `mantissa / 10^shift`, so this never fails.
  return rendered ?? String(operand.mantissa);
}

/**
 * ME-131 — a negative first operand is bare (`−12 + 5 =`); a negative second
 * operand is parenthesised (`12 + (−5) =`). A negative second operand MUST NOT
 * be rendered by rewriting the operator, because that would hide the
 * negative-number training the setting exists for.
 */
export function renderOperand(operand: Operand, position: 0 | 1): string {
  const magnitude = renderOperandMagnitude(operand);
  if (!operand.negative) return magnitude;
  return position === 0 ? `${MINUS}${magnitude}` : `(${MINUS}${magnitude})`;
}

/** ME-129 — `<operandA> <operator> <operandB> =` with single spaces. */
export function renderPrompt(
  operands: readonly [Operand, Operand],
  operator: Operator,
): string {
  return `${renderOperand(operands[0], 0)} ${operator} ${renderOperand(operands[1], 1)} =`;
}

/**
 * ME-134 / ME-072 — the canonical answer string:
 * a bare integer when the answer is integral (so a fraction answer that reduces
 * to `1` shows `1`, not `1/1`); the reduced `p/q` for fraction kinds; a canonical
 * decimal for non-integral `decimal`-kind answers; a leading U+2212 when
 * negative; and `0` for negative zero.
 */
export function renderAnswerDisplay(answer: Rational, kind: TaskKind): string {
  if (answer.d === 1) {
    const magnitude = Math.abs(answer.n);
    return answer.n < 0 ? `${MINUS}${magnitude}` : String(magnitude);
  }

  if (kind === "fracAdd" || kind === "fracMul") {
    const magnitude = `${Math.abs(answer.n)}${FRACTION_SEPARATOR}${answer.d}`;
    return answer.n < 0 ? `${MINUS}${magnitude}` : magnitude;
  }

  const decimal = decimalString(answer);
  if (decimal !== null) return decimal;

  // Unreachable for add/mul/div/decimal (ME-023), but a non-terminating value
  // must never be rounded (ME-025) — fall back to the exact fraction.
  const magnitude = `${Math.abs(answer.n)}${FRACTION_SEPARATOR}${answer.d}`;
  return answer.n < 0 ? `${MINUS}${magnitude}` : magnitude;
}

/** The exact value an operand contributes, re-exported for convenience. */
export { operandValue };
