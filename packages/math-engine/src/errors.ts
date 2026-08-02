/**
 * Typed generation failure (ME-016).
 *
 * The croco calc analogue of monkeytype's `WordGenError`
 * (`frontend/src/ts/test/words-generator.ts`). The engine throws rather than
 * silently returning an empty task list, so an impossible settings combination
 * surfaces immediately instead of producing a broken test.
 */
export type MathGenErrorCode =
  /** Zero task-producing controls enabled (ME-016, E11). */
  | "no-enabled-generators"
  /**
   * `fractionMultiplication` is on while `multiplication` is off. ME-035/ME-084
   * make this unreachable through the settings bar; if it arrives anyway the
   * bound `N` of ME-074 is undefined and silently guessing it would corrupt
   * server-side revalidation (ME-174).
   */
  | "fraction-multiplication-without-multiplication"
  /** A rejection-sampling or resampling loop could not be satisfied. */
  | "sampling-exhausted"
  /**
   * A task index was not a non-negative integer. Indices address positions in
   * the canonical sequence (ME-171), so a fractional or negative one has no
   * meaning and must not be coerced.
   */
  | "invalid-task-index";

export class MathGenError extends Error {
  public readonly code: MathGenErrorCode;

  public constructor(code: MathGenErrorCode, message: string) {
    super(message);
    this.name = "MathGenError";
    this.code = code;
    // Restores the prototype chain when the package is down-compiled to ES5-era
    // targets, matching how monkeytype's own custom errors behave.
    Object.setPrototypeOf(this, MathGenError.prototype);
  }
}
