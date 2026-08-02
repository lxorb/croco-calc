/**
 * The shared golden-vector fixture (ME-178).
 *
 * Both the frontend and the backend test suites execute `verifyGoldenVectors()`,
 * which guarantees cross-runtime agreement on prompt rendering, exact answers,
 * `answerDisplay` and judging. If this file and the engine ever disagree, the
 * server would reject genuine results (ME-174), so it is the canary for ME-184's
 * "bump the compatibility constant" rule.
 *
 * Two deliberate deviations from doc 01's §18 table, both forced by rulings that
 * postdate it:
 *
 *  1. **C33** — display uses `−` (U+2212), so the table's ASCII `-12 + 5 =` and
 *     `-56` are written here as `−12 + 5 =` and `−56`. ME-131's rules for *where*
 *     the sign goes are unchanged.
 *  2. Exact answers are stored **reduced** (ME-020/ME-064), so the table's
 *     `8178/1000000` appears as its reduced equal `4089/500000`. ME-147 judges by
 *     value, so every accepted form in the table still passes.
 *
 * Two rows are marked `generatorReachable: false` because doc 01 contradicts
 * itself about them (see the notes on each). They remain valuable as
 * judging/rendering vectors, which is what ME-178 actually needs them for.
 */

import {
  computeAnswer,
  decimalOperand,
  fractionOperand,
  intOperand,
  negateOperand,
} from "./operand";
import { judgeAnswer } from "./judge";
import { equals, rational } from "./rational";
import type { Rational } from "./rational";
import { MINUS, renderAnswerDisplay, renderPrompt } from "./render";
import type { DecimalBaseKind, Operand, Operator, TaskKind } from "./types";

export type GoldenVector = {
  id: string;
  kind: TaskKind;
  baseKind?: DecimalBaseKind;
  operator: Operator;
  operands: [Operand, Operand];
  /** Expected rendered prompt (ME-129 … ME-133, C33). */
  prompt: string;
  /** Expected exact answer, reduced (ME-020). */
  answer: Rational;
  /** Expected canonical answer string (ME-134). */
  answerDisplay: string;
  /** Inputs that MUST judge correct (ME-068 … ME-070, ME-148). */
  accepted: string[];
  /** Inputs that MUST judge incorrect (ME-025, ME-071). */
  rejected: string[];
  /**
   * False when doc 01's own generation rules cannot produce this task. Such a
   * vector still pins rendering and judging, which is what ME-178 needs.
   */
  generatorReachable: boolean;
  note: string;
};

export const GOLDEN_VECTORS: readonly GoldenVector[] = [
  {
    id: "decimal-div-1-by-4",
    kind: "decimal",
    baseKind: "div",
    operator: "÷",
    operands: [decimalOperand(100, 2), decimalOperand(4, 0)],
    prompt: "1 ÷ 4 =",
    answer: rational(1, 4),
    answerDisplay: "0.25",
    accepted: ["0.25", "0,25", "1/4", "2/8", "25/100"],
    rejected: ["0.2", "0.3", "1/3", "4"],
    generatorReachable: true,
    note: "the brief's own example; base 100 ÷ 4 = 25, sA = 2, sB = 0 (ME-106)",
  },
  {
    id: "decimal-mul-six-fractional-digits",
    kind: "decimal",
    baseKind: "mul",
    operator: "×",
    operands: [decimalOperand(87, 3), decimalOperand(94, 3)],
    prompt: "0.087 × 0.094 =",
    answer: rational(8178, 1000000),
    answerDisplay: "0.008178",
    accepted: ["0.008178", "0,008178", "8178/1000000", "4089/500000"],
    rejected: ["0.00818", "0.008", "0.0082"],
    generatorReachable: false,
    note: "ME-104/ME-108's worst case. NOT generator-reachable: 0.087 is mantissa 87 shifted by 3, but 87 has k = 2 digits and ME-097 caps s at k. The reachable maximum at multiplication='100' is 4 fractional digits (0.11 × 0.11 = 0.0121).",
  },
  {
    id: "decimal-add-4.5-plus-7",
    kind: "decimal",
    baseKind: "add",
    operator: "+",
    operands: [decimalOperand(45, 1), decimalOperand(7, 0)],
    prompt: "4.5 + 7 =",
    answer: rational(23, 2),
    answerDisplay: "11.5",
    accepted: ["11.5", "11,5", "23/2", "46/4"],
    rejected: ["11", "11.05", "115"],
    generatorReachable: true,
    note: "sA = 1, sB = 0 (ME-103)",
  },
  {
    id: "fracadd-improper",
    kind: "fracAdd",
    operator: "+",
    operands: [fractionOperand(3, 4), fractionOperand(5, 6)],
    prompt: "3/4 + 5/6 =",
    answer: rational(19, 12),
    answerDisplay: "19/12",
    accepted: ["19/12", "38/24", "57/36"],
    rejected: ["1 7/12", "1.58", "12/19"],
    generatorReachable: true,
    note: "E17/E20 — improper result; the unreduced 38/24 is accepted (ME-068)",
  },
  {
    id: "fracadd-integer-result",
    kind: "fracAdd",
    operator: "+",
    operands: [fractionOperand(1, 6), fractionOperand(5, 6)],
    prompt: "1/6 + 5/6 =",
    answer: rational(1, 1),
    answerDisplay: "1",
    accepted: ["1", "1/1", "6/6", "12/12", "1.0"],
    rejected: ["0.9", "6", "1/6"],
    generatorReachable: false,
    note: "E18/ME-066/ME-069. NOT generator-reachable: d1 === d2, which ME-060/E16 forbids. With distinct reduced denominators an integer answer is structurally impossible, so this row survives only as a judging vector.",
  },
  {
    id: "fracmul-3-4-times-2-5",
    kind: "fracMul",
    operator: "×",
    operands: [fractionOperand(3, 4), fractionOperand(2, 5)],
    prompt: "3/4 × 2/5 =",
    answer: rational(3, 10),
    answerDisplay: "3/10",
    accepted: ["3/10", "6/20", "0.3", "0,3"],
    rejected: ["0.33", "10/3", "3/100"],
    generatorReachable: true,
    note: "ME-078; the unreduced 6/20 is accepted (ME-081 -> ME-068)",
  },
  {
    id: "div-tables-upper-bound",
    kind: "div",
    operator: "÷",
    operands: [intOperand(144), intOperand(12)],
    prompt: "144 ÷ 12 =",
    answer: rational(12, 1),
    answerDisplay: "12",
    accepted: ["12", "12/1", "24/2", "12.0"],
    rejected: ["11", "1.2", "144"],
    generatorReachable: true,
    note: "E35 — the upper bound of the 144/12 state (ME-044)",
  },
  {
    id: "div-threebytwo-single-digit-divisor",
    kind: "div",
    operator: "÷",
    operands: [intOperand(738), intOperand(9)],
    prompt: "738 ÷ 9 =",
    answer: rational(82, 1),
    answerDisplay: "82",
    accepted: ["82", "82/1", "164/2"],
    rejected: ["81", "8.2", "738"],
    generatorReachable: true,
    note: "ME-053 / A3 — a single-digit divisor is legal in threeByTwo",
  },
  {
    id: "add-negative-first-operand",
    kind: "add",
    operator: "+",
    operands: [negateOperand(intOperand(12)), intOperand(5)],
    prompt: `${MINUS}12 + 5 =`,
    answer: rational(-7, 1),
    answerDisplay: `${MINUS}7`,
    accepted: ["-7", "−7", "-7/1", "-14/2", "-7.0"],
    rejected: ["7", "17", "-17"],
    generatorReachable: true,
    note: "ME-131 — a negative first operand carries a bare leading minus",
  },
  {
    id: "mul-negative-second-operand",
    kind: "mul",
    operator: "×",
    operands: [intOperand(7), negateOperand(intOperand(8))],
    prompt: `7 × (${MINUS}8) =`,
    answer: rational(-56, 1),
    answerDisplay: `${MINUS}56`,
    accepted: ["-56", "−56", "-56/1", "-112/2"],
    rejected: ["56", "-1", "-15"],
    generatorReachable: true,
    note: "ME-131 — a negative second operand is parenthesised, never rewritten as `7 - 8`",
  },
];

/**
 * Recomputes every vector through the engine's own rendering, answer and judging
 * paths. Returns the list of failures; an empty array means the runtime agrees
 * with the fixture.
 *
 * Both the frontend and the backend suites call this (ME-178).
 */
export function verifyGoldenVectors(
  vectors: readonly GoldenVector[] = GOLDEN_VECTORS,
): string[] {
  const failures: string[] = [];

  for (const vector of vectors) {
    const prompt = renderPrompt(vector.operands, vector.operator);
    if (prompt !== vector.prompt) {
      failures.push(
        `${vector.id}: prompt ${JSON.stringify(prompt)} !== ${JSON.stringify(vector.prompt)}`,
      );
    }

    const answer = computeAnswer(
      vector.operator,
      vector.operands[0],
      vector.operands[1],
    );
    if (!equals(answer, vector.answer)) {
      failures.push(
        `${vector.id}: answer ${answer.n}/${answer.d} !== ${vector.answer.n}/${vector.answer.d}`,
      );
    }

    const display = renderAnswerDisplay(answer, vector.kind);
    if (display !== vector.answerDisplay) {
      failures.push(
        `${vector.id}: answerDisplay ${JSON.stringify(display)} !== ${JSON.stringify(vector.answerDisplay)}`,
      );
    }

    for (const input of vector.accepted) {
      if (!judgeAnswer(answer, input)) {
        failures.push(
          `${vector.id}: ${JSON.stringify(input)} should be accepted`,
        );
      }
    }
    for (const input of vector.rejected) {
      if (judgeAnswer(answer, input)) {
        failures.push(
          `${vector.id}: ${JSON.stringify(input)} should be rejected`,
        );
      }
    }
  }

  return failures;
}
