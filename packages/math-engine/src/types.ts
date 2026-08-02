/**
 * The public value objects of `@croco-calc/math-engine`.
 *
 * `MathSettings` is the croco calc analogue of monkeytype's flat `Config`
 * (`packages/schemas/src/configs.ts`). The literal domain below is the **C2**
 * canonical vocabulary — ME-009's `division: "free"` is superseded by
 * `"threeByTwo"`, and the three modifier controls are booleans, not `"on"`/`"off"`
 * enums (**C3**). `packages/schemas` publishes the matching zod schema (ME-012);
 * this file is the structural contract both sides must satisfy.
 */

export type AdditionSetting = "off" | "100" | "1000";
export type MultiplicationSetting = "off" | "12" | "20" | "100";
export type DivisionSetting = "off" | "tables" | "threeByTwo";
export type FractionAdditionSetting = "off" | "12" | "99";
/** Minutes, never seconds (ME-013, SB-012). */
export type TimeSetting = 1 | 2 | 4 | 8;

/** The frozen 8-key settings snapshot a test is generated from (ME-006). */
export type MathSettings = {
  addition: AdditionSetting;
  multiplication: MultiplicationSetting;
  division: DivisionSetting;
  fractionAddition: FractionAdditionSetting;
  fractionMultiplication: boolean;
  decimals: boolean;
  negatives: boolean;
  time: TimeSetting;
};

export type MathSettingKey = keyof MathSettings;

/** The five task-producing controls (ME-014, SB-100). */
export type GeneratorKey =
  | "addition"
  | "multiplication"
  | "division"
  | "fractionAddition"
  | "fractionMultiplication";

/** Exactly six kinds — there MUST be no others (ME-004). */
export type TaskKind =
  | "add"
  | "mul"
  | "div"
  | "fracAdd"
  | "fracMul"
  | "decimal";

/** The three kinds a `decimal` task may be based on (ME-091). */
export type DecimalBaseKind = "add" | "mul" | "div";

/** ME-127: `+` U+002B, `×` U+00D7, `÷` U+00F7. */
export type Operator = "+" | "×" | "÷";

/**
 * One signed number (ME-005). A fraction counts as **one** operand, which is
 * load-bearing for the negatives transform (ME-113).
 *
 * The magnitude fields are always positive; `negative` carries the sign, which
 * is applied last in the pipeline (ME-115).
 */
export type IntOperand = {
  type: "int";
  /** Magnitude. Always `> 0`. */
  magnitude: number;
  negative: boolean;
};

export type DecimalOperand = {
  type: "decimal";
  /** The unshifted integer `A` of ME-095. Always `> 0`. */
  mantissa: number;
  /** Digit count of `mantissa` (ME-095). */
  digits: number;
  /** The shift `s` of ME-095/ME-097; the value is `mantissa / 10^shift`. */
  shift: number;
  negative: boolean;
};

export type FractionOperand = {
  type: "fraction";
  /** Always `1 <= numerator < denominator` and coprime with it (ME-061 … ME-063). */
  numerator: number;
  /** Always `>= 2` (ME-059). */
  denominator: number;
  negative: boolean;
};

export type Operand = IntOperand | DecimalOperand | FractionOperand;

/**
 * The croco calc analogue of monkeytype's `Word`
 * (`frontend/src/ts/test/test-words.ts`).
 */
export type Task = {
  /** Position in the test's task sequence (ME-003). */
  index: number;
  kind: TaskKind;
  /** Present only for `kind === "decimal"` (ME-091). */
  baseKind?: DecimalBaseKind;
  operator: Operator;
  /** Structured operands, for replay and debugging (ME-003). */
  operands: [Operand, Operand];
  /** Display string, e.g. `3/4 + 5/6 =` (ME-129). */
  prompt: string;
  /** The exact answer as a reduced rational (ME-020). */
  answer: import("./rational").Rational;
  /** Canonical answer string (ME-134). Never rendered before commit (ME-135/C29). */
  answerDisplay: string;
  /** The per-task seed this task was drawn from (ME-170). */
  taskSeed: number;
  /** Number of draws made, i.e. `1 + duplicate-prompt regenerations` (ME-125). */
  attempts: number;
};

/** One committed answer (ME-159). */
export type TaskLogEntry = {
  i: number;
  kind: TaskKind;
  prompt: string;
  /** Canonical expected answer string (`answerDisplay`). */
  expected: string;
  /** Raw normalised input the user committed. */
  given: string;
  correct: boolean;
  /** Milliseconds from test start. */
  tStart: number;
  /** Milliseconds from test start. */
  tEnd: number;
};
