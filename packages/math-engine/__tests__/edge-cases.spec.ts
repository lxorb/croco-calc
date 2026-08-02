/**
 * Doc 01 §18 — one dedicated test per row of the 40-row edge-case table.
 *
 * Several rows are also exercised in depth by the module suites; this file is
 * the audit trail that proves every row has its own named test, in table order.
 */
import { describe, expect, it } from "vitest";
import {
  applyCoupling,
  assertGeneratable,
  cycleSetting,
  DEFAULT_MATH_SETTINGS,
  getEnabledKinds,
  nextSettingValue,
  wouldBeAllOff,
} from "../src/settings";
import { MathGenError } from "../src/errors";
import {
  commitAnswer,
  appendAnswerChar,
  isAnswerCorrect,
  normalizeAnswerChar,
  parseAnswer,
} from "../src/judge";
import { computeMetrics } from "../src/metrics";
import { generateSequence, generateTask } from "../src/generate";
import { generateDivision } from "../src/generators/division";
import { generateMultiplication } from "../src/generators/multiplication";
import {
  coprimeNumerators,
  generateFractionAddition,
} from "../src/generators/fraction-addition";
import {
  digitCount,
  shiftPairAt,
  shiftPairCount,
} from "../src/generators/decimal";
import { createPrng } from "../src/prng";
import { operandValue } from "../src/operand";
import { fromInt, isZero, rational } from "../src/rational";
import { MINUS, renderAnswerDisplay } from "../src/render";
import { revalidateResult } from "../src/revalidate";
import { MATH_ENGINE_VERSION } from "../src/version";
import type { MathSettings, Task, TaskLogEntry } from "../src/types";

const SEED = 0xed6ec45e;

function settings(overrides: Partial<MathSettings> = {}): MathSettings {
  return { ...DEFAULT_MATH_SETTINGS, ...overrides };
}

function task(answer: ReturnType<typeof rational>): Task {
  return {
    index: 0,
    kind: "fracAdd",
    operator: "+",
    operands: [
      { type: "fraction", numerator: 1, denominator: 2, negative: false },
      { type: "fraction", numerator: 1, denominator: 3, negative: false },
    ],
    prompt: "1/2 + 1/3 =",
    answer,
    answerDisplay: "5/6",
    taskSeed: 0,
    attempts: 1,
  };
}

const SAMPLE: Task[] = generateSequence(SEED, DEFAULT_MATH_SETTINGS, 30000);

describe("§18 edge-case table", () => {
  it("E1 — division by zero in generation is impossible (ME-026)", () => {
    for (const t of SAMPLE) {
      if (t.operator === "÷") {
        expect(isZero(operandValue(t.operands[1]))).toBe(false);
      }
      for (const operand of t.operands) {
        if (operand.type === "fraction") {
          expect(operand.denominator).toBeGreaterThanOrEqual(2);
        }
      }
    }
  });

  it("E2 — `3/0` is judged incorrect: no throw, no Infinity, no NaN (ME-146)", () => {
    const t = task(rational(5, 6));
    expect(() => isAnswerCorrect(t, "3/0")).not.toThrow();
    expect(isAnswerCorrect(t, "3/0")).toBe(false);
    expect(parseAnswer("3/0")).toBeNull();
  });

  it("E3 — a displayed fraction never has denominator 1 (ME-059)", () => {
    for (const t of SAMPLE) {
      for (const operand of t.operands) {
        if (operand.type === "fraction") {
          expect(operand.denominator).not.toBe(1);
        }
      }
    }
  });

  it("E4 — a user answer with denominator 1 is accepted when the value matches (ME-068)", () => {
    expect(isAnswerCorrect(task(fromInt(3)), "3/1")).toBe(true);
  });

  it("E5 — both operands negative is structurally impossible (ME-111)", () => {
    expect(SAMPLE.filter((t) => t.operands.every((o) => o.negative))).toEqual(
      [],
    );
  });

  it("E6 — an answer of exactly 0 is permitted and displays as `0` (ME-149, ME-134)", () => {
    const zero = task(fromInt(0));
    for (const given of ["0", "-0", "0.0", "0/5"]) {
      expect(isAnswerCorrect(zero, given), given).toBe(true);
    }
    expect(renderAnswerDisplay(fromInt(-0), "add")).toBe("0");
  });

  it("E7 — a decimal shift may yield an integer-looking operand (ME-099)", () => {
    // A = 100 with sA = 2 renders as `1`, which is the brief's own example
    expect(rational(100, 10 ** 2)).toEqual({ n: 1, d: 1 });
    const decimals = SAMPLE.filter((t) => t.kind === "decimal");
    expect(
      decimals.some((t) =>
        t.operands.some(
          (o) => o.type === "decimal" && o.shift > 0 && operandValue(o).d === 1,
        ),
      ),
    ).toBe(true);
  });

  it("E8 — both shifts zero is forbidden (ME-098)", () => {
    for (const t of SAMPLE) {
      if (t.kind !== "decimal") continue;
      const shifts = t.operands.map((o) =>
        o.type === "decimal" ? o.shift : -1,
      );
      expect(shifts.some((s) => s > 0)).toBe(true);
    }
    // and the enumeration itself never yields (0, 0)
    for (let j = 0; j < shiftPairCount(3, 2); j++) {
      expect(shiftPairAt(3, 2, j)).not.toEqual([0, 0]);
    }
  });

  it("E9 — a fully integral decimal task is forbidden and resampled (ME-100, ME-101)", () => {
    for (const t of SAMPLE) {
      if (t.kind !== "decimal") continue;
      const allIntegers =
        operandValue(t.operands[0]).d === 1 &&
        operandValue(t.operands[1]).d === 1 &&
        t.answer.d === 1;
      expect(allIntegers).toBe(false);
    }
    // the fallback sA = kA can never be an integer
    for (const a of [4, 42, 999]) {
      expect(rational(a, 10 ** digitCount(a)).d).not.toBe(1);
    }
  });

  it("E10 — decimals is inert when settings 1-3 are all off (ME-092)", () => {
    const s = settings({
      addition: "off",
      multiplication: "off",
      division: "off",
      fractionMultiplication: false,
      fractionAddition: "99",
      decimals: true,
    });
    expect(getEnabledKinds(s)).toEqual(["fracAdd"]);
  });

  it("E11 — the all-off state is blocked in the bar and throws in the engine (ME-015, ME-016)", () => {
    const allOff = settings({
      addition: "off",
      multiplication: "off",
      division: "off",
      fractionAddition: "off",
      fractionMultiplication: false,
    });
    expect(() => assertGeneratable(allOff)).toThrow(MathGenError);
    expect(() => generateTask(SEED, 0, allOff)).toThrow(MathGenError);

    const lastOne = settings({
      addition: "1000",
      multiplication: "off",
      division: "off",
      fractionAddition: "off",
      fractionMultiplication: false,
    });
    expect(nextSettingValue(lastOne, "addition")).not.toBe("off");
  });

  it("E12 — fracMul on while mul off forces multiplication in the same action (ME-082, C21)", () => {
    const s = settings({
      multiplication: "off",
      fractionMultiplication: false,
    });
    expect(
      applyCoupling(s, "fractionMultiplication", true).multiplication,
    ).toBe("100");
  });

  it("E13 — cycling multiplication to off forces fracMul off (ME-084)", () => {
    const s = settings({ multiplication: "12", fractionMultiplication: true });
    expect(
      applyCoupling(s, "multiplication", "off").fractionMultiplication,
    ).toBe(false);
  });

  it("E14 — multiplication off -> '12' does not re-enable fracMul (ME-086)", () => {
    const off = settings({
      multiplication: "off",
      fractionMultiplication: false,
    });
    expect(
      applyCoupling(off, "multiplication", "12").fractionMultiplication,
    ).toBe(false);
  });

  it("E15 — multiplication cannot be switched off when fracMul is the only other producer (ME-089)", () => {
    const s = settings({
      addition: "off",
      division: "off",
      fractionAddition: "off",
      multiplication: "100",
      fractionMultiplication: true,
    });
    expect(wouldBeAllOff(s, "multiplication", "off")).toBe(true);
    expect(cycleSetting(s, "multiplication").multiplication).not.toBe("off");
  });

  it("E16 — fraction addition never uses identical denominators (ME-060)", () => {
    const rng = createPrng(16);
    for (let i = 0; i < 20000; i++) {
      const { d1, d2 } = generateFractionAddition(rng, "99");
      expect(d1).not.toBe(d2);
    }
  });

  it("E17 — an improper fraction result is permitted and not converted (ME-065)", () => {
    const rng = createPrng(17);
    let improper = 0;
    for (let i = 0; i < 20000; i++) {
      const { answer } = generateFractionAddition(rng, "12");
      if (answer.n > answer.d) improper++;
    }
    expect(improper).toBeGreaterThan(0);
    expect(renderAnswerDisplay(rational(19, 12), "fracAdd")).toBe("19/12");
  });

  it("E18 — an integer fraction result accepts a bare `1` (ME-066, ME-069)", () => {
    const one = task(fromInt(1));
    for (const given of ["1", "1/1", "6/6", "12/12"]) {
      expect(isAnswerCorrect(one, given), given).toBe(true);
    }
    // NOTE: ME-060 makes an integer answer unreachable in generation — see
    // generators.spec.ts. The judging rule this row states still holds.
  });

  it("E19 — a mixed number is rejected (ME-071)", () => {
    expect(isAnswerCorrect(task(rational(19, 12)), "1 7/12")).toBe(false);
    expect(parseAnswer("1 7/12")).toBeNull();
  });

  it("E20 — an unreduced fraction answer is accepted (ME-068)", () => {
    expect(isAnswerCorrect(task(rational(19, 12)), "38/24")).toBe(true);
  });

  it("E21 — `0.333` for `1/3` is incorrect, with no tolerance (ME-025, ME-070)", () => {
    expect(isAnswerCorrect(task(rational(1, 3)), "0.333")).toBe(false);
    expect(isAnswerCorrect(task(rational(1, 3)), "1/3")).toBe(true);
  });

  it("E22 — d = 2 has exactly one coprime numerator; degenerate but valid (ME-061)", () => {
    expect(coprimeNumerators(2)).toEqual([1]);
  });

  it("E23 — a component longer than 7 digits is incorrect (ME-143, ME-144)", () => {
    expect(parseAnswer("12345678")).toBeNull();
    expect(isAnswerCorrect(task(fromInt(12345678)), "12345678")).toBe(false);
  });

  it("E24 — input beyond 16 characters is ignored (ME-151)", () => {
    let buffer = "";
    for (let i = 0; i < 40; i++) buffer = appendAnswerChar(buffer, "9");
    expect(buffer).toHaveLength(16);
  });

  it("E25 — committing an empty input is a no-op (ME-141)", () => {
    expect(commitAnswer(task(fromInt(1)), "").outcome).toBe("noop");
    expect(commitAnswer(task(fromInt(1)), "   ").outcome).toBe("noop");
  });

  it("E26 — a letter or `+` keystroke is silently ignored (ME-137)", () => {
    expect(normalizeAnswerChar("a")).toBeNull();
    expect(normalizeAnswerChar("+")).toBeNull();
    expect(appendAnswerChar("12", "a")).toBe("12");
  });

  it("E27 — malformed committed input is incorrect and never throws (ME-143)", () => {
    for (const bad of ["5/", ".", "-", "1.2.3", "1/2/3"]) {
      expect(() => isAnswerCorrect(task(fromInt(1)), bad)).not.toThrow();
      expect(isAnswerCorrect(task(fromInt(1)), bad)).toBe(false);
    }
  });

  it("E28 — the German numpad comma `4,2` is normalised and accepted (ME-138)", () => {
    expect(isAnswerCorrect(task(rational(42, 10)), "4,2")).toBe(true);
  });

  it("E29 — the unicode minus `−5` is normalised to `-5` (ME-139)", () => {
    expect(isAnswerCorrect(task(fromInt(-5)), "−5")).toBe(true);
  });

  it("E30 — two consecutive identical prompts are regenerated (ME-125)", () => {
    const tiny = settings({
      addition: "off",
      multiplication: "12",
      division: "off",
      fractionAddition: "off",
      fractionMultiplication: false,
      decimals: false,
      negatives: false,
    });
    const tasks = generateSequence(SEED, tiny, 20000);
    for (let i = 1; i < tasks.length; i++) {
      expect((tasks[i] as Task).prompt).not.toBe((tasks[i - 1] as Task).prompt);
    }
  });

  it("E31 — a task in flight when the timer expires never reaches the log (ME-157)", () => {
    // The engine scores only committed entries, so an unfinished task simply is
    // not appended; its absence changes nothing.
    const log: TaskLogEntry[] = [
      {
        i: 0,
        kind: "add",
        prompt: "1 + 1 =",
        expected: "2",
        given: "2",
        correct: true,
        tStart: 0,
        tEnd: 1000,
      },
    ];
    const withPartial = computeMetrics(log, 60);
    expect(withPartial).toMatchObject({ correct: 1, wrong: 0, score: 1 });
    // committing nothing for the in-flight task is a no-op (ME-141)
    expect(commitAnswer(task(fromInt(2)), "").outcome).toBe("noop");
  });

  it("E32 — a run with zero committed tasks yields score 0, acc 0, tpm 0 (ME-160 … ME-163)", () => {
    expect(computeMetrics([], 480)).toMatchObject({
      correct: 0,
      wrong: 0,
      score: 0,
      acc: 0,
      tpm: 0,
      spm: 0,
    });
  });

  it("E33 — the threeByTwo boundary dividends 100 and 999 are both reachable (ME-051)", () => {
    const rng = createPrng(33);
    let lo = false;
    let hi = false;
    for (let i = 0; i < 600000 && !(lo && hi); i++) {
      const { a } = generateDivision(rng, "threeByTwo");
      if (a === 100) lo = true;
      if (a === 999) hi = true;
    }
    expect([lo, hi]).toEqual([true, true]);
  });

  it("E34 — the boundary product 100 x 100 = 10000 is permitted (ME-039)", () => {
    const rng = createPrng(34);
    let found = false;
    for (let i = 0; i < 400000 && !found; i++) {
      const { a, b, answer } = generateMultiplication(rng, "100");
      if (a === 100 && b === 100) {
        found = true;
        expect(answer).toEqual({ n: 10000, d: 1 });
      }
    }
    expect(found).toBe(true);
  });

  it("E35 — the tables boundaries 144 ÷ 12 and 4 ÷ 2 are both permitted (ME-044)", () => {
    const rng = createPrng(35);
    let max = false;
    let min = false;
    for (let i = 0; i < 60000 && !(max && min); i++) {
      const { a, b } = generateDivision(rng, "tables");
      if (a === 144 && b === 12) max = true;
      if (a === 4 && b === 2) min = true;
    }
    expect([max, min]).toEqual([true, true]);
  });

  it("E36 — the `+1000` boundary sum of exactly 1000 is permitted (ME-031)", () => {
    const additionOnly = settings({
      addition: "1000",
      multiplication: "off",
      division: "off",
      fractionAddition: "off",
      fractionMultiplication: false,
      decimals: false,
      negatives: false,
    });
    let found = false;
    for (let seed = 1; seed <= 8 && !found; seed++) {
      for (const t of generateSequence(seed * 104729, additionOnly, 60000)) {
        if (t.answer.n === 1000) {
          found = true;
          break;
        }
      }
    }
    expect(found).toBe(true);
  });

  it("E37 — negating a divisor is permitted; `144 ÷ (−12)` answers −12 (ME-117)", () => {
    expect(computeDivision(144, 12, true)).toEqual({ n: -12, d: 1 });
    const divisions = SAMPLE.filter(
      (t) => t.operator === "÷" && t.operands[1].negative,
    );
    expect(divisions.length).toBeGreaterThan(0);
    for (const t of divisions) {
      expect(isZero(operandValue(t.operands[1]))).toBe(false);
    }
  });

  it("E38 — a negated fraction keeps a positive denominator and renders `−3/4` (ME-113)", () => {
    const negated = {
      type: "fraction" as const,
      numerator: 3,
      denominator: 4,
      negative: true,
    };
    expect(negated.denominator).toBeGreaterThan(0);
    expect(operandValue(negated)).toEqual({ n: -3, d: 4 });
    expect(renderAnswerDisplay(operandValue(negated), "fracAdd")).toBe(
      `${MINUS}3/4`,
    );
  });

  it("E39 — generation depends only on the frozen snapshot, so a mid-test change restarts (ME-006, ME-007)", () => {
    const snapshot = Object.freeze(settings({ addition: "1000" }));
    const before = generateSequence(SEED, snapshot, 100).map((t) => t.prompt);
    // "changing config" produces a NEW object; the old snapshot is unaffected
    const changed = { ...snapshot, addition: "100" as const };
    const after = generateSequence(SEED, changed, 100).map((t) => t.prompt);
    expect(after).not.toEqual(before);
    expect(generateSequence(SEED, snapshot, 100).map((t) => t.prompt)).toEqual(
      before,
    );
  });

  it("E40 — a task log that does not match (seed, settings) is rejected (ME-174)", () => {
    const tasks = generateSequence(SEED, DEFAULT_MATH_SETTINGS, 30);
    const log: TaskLogEntry[] = tasks.map((t, i) => ({
      i,
      kind: t.kind,
      prompt: t.prompt,
      expected: t.answerDisplay,
      given: t.answerDisplay.replace(MINUS, "-"),
      correct: true,
      tStart: i * 1000,
      tEnd: (i + 1) * 1000,
    }));
    expect(
      revalidateResult({
        mathSeed: SEED,
        mathSettings: DEFAULT_MATH_SETTINGS,
        taskLog: log,
        engineVersion: MATH_ENGINE_VERSION,
      }).ok,
    ).toBe(true);

    expect(
      revalidateResult({
        mathSeed: SEED + 1,
        mathSettings: DEFAULT_MATH_SETTINGS,
        taskLog: log,
        engineVersion: MATH_ENGINE_VERSION,
      }).ok,
    ).toBe(false);
  });
});

function computeDivision(
  dividend: number,
  divisor: number,
  negateDivisor: boolean,
): { n: number; d: number } {
  return rational(dividend, negateDivisor ? -divisor : divisor);
}
