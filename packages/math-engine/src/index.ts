/**
 * `@croco-calc/math-engine` — the mathematical heart of croco calc.
 *
 * Pure, dependency-free and fully unit-tested (ME-001, ME-002). The frontend
 * generates a test from `(mathSeed, mathSettings)`; the backend regenerates the
 * identical sequence from the same pair to revalidate the submitted result
 * (ME-171, ME-174), which is why this lives in `packages/` rather than under
 * `frontend/src` (C26).
 *
 * ME-184: any change to **generation, mixing or judging** semantics MUST bump
 * `MATH_ENGINE_VERSION` *and* the backend's `COMPATIBILITY_CHECK_HEADER` value in
 * the same commit — see `./version`.
 */

// -- types -------------------------------------------------------------------
export type {
  AdditionSetting,
  DecimalBaseKind,
  DecimalOperand,
  DivisionSetting,
  FractionAdditionSetting,
  FractionOperand,
  GeneratorKey,
  IntOperand,
  MathSettingKey,
  MathSettings,
  MultiplicationSetting,
  Operand,
  Operator,
  Task,
  TaskKind,
  TaskLogEntry,
  TimeSetting,
} from "./types";

// -- errors ------------------------------------------------------------------
export { MathGenError } from "./errors";
export type { MathGenErrorCode } from "./errors";

// -- exact arithmetic (ME-020 … ME-026) --------------------------------------
export {
  ONE,
  ZERO,
  absolute,
  add,
  compare,
  divide,
  equals,
  fromDecimal,
  fromInt,
  gcd,
  isInteger,
  isNegative,
  isZero,
  lcm,
  multiply,
  negate,
  rational,
  subtract,
  toNumber,
} from "./rational";
export type { Rational } from "./rational";

// -- seeded PRNG (ME-166 … ME-172) -------------------------------------------
export {
  createPrng,
  createTaskPrng,
  deriveTaskSeed,
  mulberry32Raw,
} from "./prng";
export type { Prng } from "./prng";

// -- settings, coupling and guards (ME-009 … ME-016, ME-082 … ME-089) --------
//
// ME-017/ME-018 (leaderboard eligibility) are **not** here: C4/SB-174 put the
// frozen `LEADERBOARD_SETTINGS_ID` and its predicates in `packages/schemas`, so
// that a change to the product defaults cannot move the historical baseline.
export {
  BATCH_EXTENSION_SIZE,
  BATCH_REFILL_THRESHOLD,
  DEFAULT_MATH_SETTINGS,
  GENERATOR_KEYS,
  INITIAL_BATCH_SIZE,
  KIND_ORDER,
  MATH_SETTING_VALUES,
  SETTING_KEYS,
  TIME_VALUES,
  applyCoupling,
  assertGeneratable,
  cycleSetting,
  enabledGeneratorCount,
  getDecimalBaseKinds,
  getEnabledKinds,
  isGeneratorEnabled,
  nextSettingValue,
  wouldBeAllOff,
} from "./settings";

// -- operands and rendering (ME-127 … ME-134, C33) ---------------------------
export {
  computeAnswer,
  decimalOperand,
  fractionOperand,
  intOperand,
  negateOperand,
  operandValue,
} from "./operand";
export {
  FRACTION_SEPARATOR,
  MINUS,
  OPERATOR_ADD,
  OPERATOR_DIV,
  OPERATOR_MUL,
  decimalString,
  renderAnswerDisplay,
  renderOperand,
  renderOperandMagnitude,
  renderPrompt,
} from "./render";

// -- generation (ME-003 … ME-008, ME-109 … ME-126, ME-158) -------------------
//
// All four entry points agree with `generateSequence` by construction — there is
// no `previousPrompt` parameter to omit and no second, subtly different task at
// a given index. See the note on `drawTask` in `./generate`.
export {
  DUPLICATE_PROMPT_ATTEMPT_CAP,
  createTaskBatcher,
  createTestSeed,
  generateSequence,
  generateTask,
  generateTasks,
} from "./generate";
export type { TaskBatcher } from "./generate";

// -- individual generators, for targeted tests and tooling -------------------
export {
  ADDITION_BANDS,
  ADDITION_REJECTION_CAP,
  additionPairAt,
  additionPairCount,
  enumerateAdditionPairs,
  generateAddition,
} from "./generators/addition";
export {
  MULTIPLICATION_FACTOR_MIN,
  generateMultiplication,
  multiplicationBound,
} from "./generators/multiplication";
export {
  TABLES_MAX,
  TABLES_MIN,
  THREE_BY_TWO_DIVIDEND_MAX,
  THREE_BY_TWO_DIVIDEND_MIN,
  THREE_BY_TWO_DIVISOR_MAX,
  THREE_BY_TWO_DIVISOR_MIN,
  divisionQuotientRange,
  generateDivision,
} from "./generators/division";
export {
  FRACTION_DENOMINATOR_MIN,
  commonDenominatorLimit,
  coprimeNumerators,
  fractionAdditionDenominatorPairs,
  generateFractionAddition,
} from "./generators/fraction-addition";
export { generateFractionMultiplication } from "./generators/fraction-multiplication";
export {
  DECIMAL_RESAMPLE_CAP,
  digitCount,
  drawDecimalShift,
  generateDecimal,
  shiftPairAt,
  shiftPairCount,
} from "./generators/decimal";
export type { DecimalDraw } from "./generators/decimal";
export type { FractionDraw, IntegerDraw } from "./generators/draw";

// -- judging (ME-137 … ME-153, C32, CP-058a) ---------------------------------
export {
  ANSWER_MAX_LENGTH,
  MAX_COMPONENT_DIGITS,
  appendAnswerChar,
  commitAnswer,
  isAnswerCorrect,
  isCommitNoop,
  judgeAnswer,
  normalizeAnswerChar,
  normalizeAnswerInput,
  normalizeForCommit,
  parseAnswer,
} from "./judge";
export type { CommitOutcome, CommitResult } from "./judge";

// -- metrics (ME-160 … ME-165, C40) ------------------------------------------
export { computeMetrics, consistencyOf, kogasa, roundTo2 } from "./metrics";
export type { MathMetrics } from "./metrics";

// -- anti-cheat (ME-173 … ME-184) --------------------------------------------
export {
  MAX_CLOCK_SKEW_MS,
  MAX_DURATION_DRIFT_MS,
  MAX_MEDIAN_INTERVAL_FLOOR_MS,
  MAX_PLAUSIBLE_TPM,
  MAX_SUBMISSION_LAG_MS,
  MAX_SUBTHRESHOLD_FRACTION,
  MEDIAN_CHECK_MIN_TASKS,
  MIN_INTER_ANSWER_MS,
  checkPlausibility,
  interAnswerIntervals,
} from "./plausibility";
export type {
  PlausibilityInput,
  PlausibilityResult,
  PlausibilityViolation,
  PlausibilityViolationCode,
} from "./plausibility";
export {
  TASK_LOG_MAX_ENTRIES,
  TASK_LOG_SAMPLE_SIZE,
  TASK_LOG_TOOLONG,
  revalidateResult,
  sampleIndices,
  serializeTaskLog,
} from "./revalidate";
export type {
  RevalidationFailure,
  RevalidationFailureCode,
  RevalidationInput,
  RevalidationResult,
  SerializedTaskLog,
} from "./revalidate";
export {
  MATH_ENGINE_VERSION,
  PREVIOUS_MATH_ENGINE_VERSION,
  SUPPORTED_ENGINE_VERSIONS,
  checkEngineVersion,
} from "./version";
export type { EngineVersionStatus } from "./version";

// -- golden vectors (ME-178) -------------------------------------------------
//
// `runGoldenVectorSuite` is the drop-in the frontend and backend vitest projects
// register so the fixture executes in both runtimes (DoD-18). See the file
// header of `./golden-vector-suite` for the three lines each side needs.
export { GOLDEN_VECTORS, verifyGoldenVectors } from "./golden-vectors";
export type { GoldenVector } from "./golden-vectors";
export { runGoldenVectorSuite } from "./golden-vector-suite";
export type { TestRunner } from "./golden-vector-suite";
