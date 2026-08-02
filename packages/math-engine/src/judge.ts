/**
 * Answer input and correctness judging (ME-137 … ME-153), plus the input-filter
 * harmonisation of C32 and the commit-time normalisation of CP-058a.
 *
 * Two deliberate divergences from monkeytype, both anti-cheat:
 *  - **No per-character validation or colouring** (ME-152). monkeytype colours
 *    each character as you type (`frontend/src/ts/input/helpers/validation.ts`);
 *    doing that here would leak the answer digit by digit.
 *  - **No auto-advance** when the typed value happens to equal the answer
 *    (ME-153). `quickEnd` is not ported.
 *
 * Judging is therefore a single event at commit time, decided by exact rational
 * equality — never string comparison, never with an epsilon (ME-025, ME-147).
 */

import { rational } from "./rational";
import type { Rational } from "./rational";
import type { Task } from "./types";

/** ME-151 / E24 — further keystrokes are ignored. */
export const ANSWER_MAX_LENGTH = 16;

/**
 * ME-143 / ME-144 — keeps cross-multiplication inside `Number.MAX_SAFE_INTEGER`:
 * two 7-digit components multiply to `<= 10^14 < 2^53`. The longest *legitimate*
 * answer has 5 digits per component (`9801/10000`), so there is ample headroom.
 */
export const MAX_COMPONENT_DIGITS = 7;

const DIGITS = "0123456789";
/** ME-139 — U+2212 minus sign, U+2013 en dash, U+2014 em dash. */
const UNICODE_MINUSES = "−–—";

/**
 * ME-137 … ME-139 — maps one keystroke to the character that should enter the
 * buffer, or `null` when it must be silently ignored (no insert, no error state).
 */
export function normalizeAnswerChar(ch: string): string | null {
  if (ch.length !== 1) return null;
  if (DIGITS.includes(ch)) return ch;
  if (ch === "-" || UNICODE_MINUSES.includes(ch)) return "-";
  // ME-138: the German numpad emits `,` as the decimal key.
  if (ch === "." || ch === ",") return ".";
  if (ch === "/") return "/";
  return null;
}

/** Applies `normalizeAnswerChar` across a whole string, dropping the rest. */
export function normalizeAnswerInput(raw: string): string {
  let out = "";
  for (const ch of raw) {
    const mapped = normalizeAnswerChar(ch);
    if (mapped !== null) out += mapped;
  }
  return out;
}

/**
 * The keystroke filter (CP-055 … CP-058 as harmonised by C32, plus ME-151):
 * at most one `.`, at most one `/`, at least one digit before either of them,
 * a `-` only in the leading position, and a hard 16-character cap.
 *
 * Returns the new buffer; an ignored keystroke returns the buffer unchanged.
 */
export function appendAnswerChar(buffer: string, ch: string): string {
  const mapped = normalizeAnswerChar(ch);
  if (mapped === null) return buffer;
  if (buffer.length >= ANSWER_MAX_LENGTH) return buffer;

  if (mapped === "-") {
    // only as the very first character
    return buffer.length === 0 ? "-" : buffer;
  }
  if (mapped === "." || mapped === "/") {
    if (buffer.includes(".") || buffer.includes("/")) return buffer;
    // C32: a leading `.` is silently ignored, exactly as a leading `/` already was
    if (!/[0-9]/.test(buffer)) return buffer;
    return buffer + mapped;
  }
  return buffer + mapped;
}

/**
 * CP-058a — normalises the buffer at commit, before judging: strip a single
 * trailing `.`/`,`, strip a single trailing `/`, and strip a lone `-` that is
 * not followed by a digit. Without this a user could type `5.` and be marked
 * wrong for a value they meant correctly.
 */
export function normalizeForCommit(buffer: string): string {
  let out = normalizeAnswerInput(buffer.trim());
  if (out.endsWith(".") || out.endsWith("/")) out = out.slice(0, -1);
  if (out === "-") out = "";
  return out;
}

/** ME-141 / E25 — a commit with no digit at all is a no-op. */
export function isCommitNoop(buffer: string): boolean {
  return !/[0-9]/.test(normalizeForCommit(buffer));
}

const INT_PATTERN = /^-?[0-9]+$/;
const DEC_PATTERN = /^-?([0-9]+)\.([0-9]+)$/;
const FRAC_PATTERN = /^-?([0-9]+)\/([0-9]+)$/;

function withinDigitCap(...components: string[]): boolean {
  return components.every(
    (component) =>
      component.length >= 1 && component.length <= MAX_COMPONENT_DIGITS,
  );
}

/**
 * ME-143 … ME-146, ME-150 — parses a committed answer to an exact rational, or
 * returns `null` when the input is not one of `INT`, `DEC`, `FRAC`.
 *
 * `null` means **incorrect**, never "throw" and never "silently discard": a
 * malformed commit still scores as a wrong answer (ME-154).
 */
export function parseAnswer(input: string): Rational | null {
  const text = input.trim();
  if (text.length === 0) return null;

  const negative = text.startsWith("-");
  const body = negative ? text.slice(1) : text;
  if (body.length === 0) return null;

  if (INT_PATTERN.test(text)) {
    if (!withinDigitCap(body)) return null;
    const value = Number(body);
    return rational(negative ? -value : value, 1);
  }

  const dec = DEC_PATTERN.exec(text);
  if (dec !== null) {
    const whole = dec[1] as string;
    const fraction = dec[2] as string;
    if (!withinDigitCap(whole, fraction)) return null;
    // ME-145: `a.b` with |b| = f digits -> (ab as integer) / 10^f
    const scaled = Number(whole + fraction);
    if (!Number.isSafeInteger(scaled)) return null;
    return rational(negative ? -scaled : scaled, 10 ** fraction.length);
  }

  const frac = FRAC_PATTERN.exec(text);
  if (frac !== null) {
    const numerator = frac[1] as string;
    const denominator = frac[2] as string;
    if (!withinDigitCap(numerator, denominator)) return null;
    const q = Number(denominator);
    // E2 / ME-146: `3/0` is incorrect — no throw, no Infinity, no NaN.
    if (q === 0) return null;
    const p = Number(numerator);
    return rational(negative ? -p : p, q);
  }

  return null;
}

/**
 * ME-147 — exact rational equality by cross-multiplication:
 * with `pE/qE` reduced (`qE > 0`) and `pU/qU` normalised (`qU > 0`),
 * correct iff `pU * qE === pE * qU`.
 */
export function judgeAnswer(expected: Rational, rawInput: string): boolean {
  const parsed = parseAnswer(normalizeAnswerInput(rawInput.trim()));
  if (parsed === null) return false;
  return parsed.n * expected.d === expected.n * parsed.d;
}

/**
 * The published judging entry point (WP-02 interface list).
 * Input normalisation (ME-138, ME-139) is applied first, so `4,2` and `−5`
 * judge identically to `4.2` and `-5`.
 */
export function isAnswerCorrect(task: Task, rawInput: string): boolean {
  return judgeAnswer(task.answer, rawInput);
}

export type CommitOutcome = "noop" | "correct" | "incorrect";

export type CommitResult = {
  outcome: CommitOutcome;
  /** The normalised buffer, i.e. what ME-159 logs as `given`. */
  given: string;
};

/**
 * The full commit flow: CP-058a normalisation, then ME-141's empty-commit
 * no-op, then ME-147 judging.
 *
 * `"noop"` MUST NOT advance the task and MUST NOT count as correct or wrong
 * (ME-141, E25); `"incorrect"` advances and scores as wrong (ME-154).
 */
export function commitAnswer(task: Task, buffer: string): CommitResult {
  const given = normalizeForCommit(buffer);
  if (!/[0-9]/.test(given)) return { outcome: "noop", given };
  return {
    outcome: judgeAnswer(task.answer, given) ? "correct" : "incorrect",
    given,
  };
}
