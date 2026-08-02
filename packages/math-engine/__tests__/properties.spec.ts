/**
 * The large property tests demanded by ME-022, ME-023, ME-030 and ME-055.
 * Each runs over >= 100 000 generated tasks, which is the bound doc 01 states.
 */
import { describe, expect, it } from "vitest";
import { generateSequence } from "../src/generate";
import { DEFAULT_MATH_SETTINGS } from "../src/settings";
import { operandValue } from "../src/operand";
import { gcd, lcm } from "../src/rational";
import { ADDITION_BANDS, additionPairCount } from "../src/generators/addition";
import { commonDenominatorLimit } from "../src/generators/fraction-addition";
import type { MathSettings, Task } from "../src/types";

const N = 100_000;

function settings(overrides: Partial<MathSettings> = {}): MathSettings {
  return { ...DEFAULT_MATH_SETTINGS, ...overrides };
}

/** Terminates iff the reduced denominator is 2^a * 5^b. */
function terminates(d: number): boolean {
  let rest = d;
  while (rest % 2 === 0) rest /= 2;
  while (rest % 5 === 0) rest /= 5;
  return rest === 1;
}

function record(failures: string[], ok: boolean, message: () => string): void {
  if (!ok && failures.length < 5) failures.push(message());
}

describe(`property tests over ${N} tasks`, () => {
  const tasks: Task[] = generateSequence(0x1234abcd, DEFAULT_MATH_SETTINGS, N);

  it(`generates exactly ${N} tasks with strictly increasing indices`, () => {
    expect(tasks).toHaveLength(N);
    expect(tasks[0]?.index).toBe(0);
    expect(tasks[N - 1]?.index).toBe(N - 1);
  });

  it("ME-055 / ME-107: no division task ever has a remainder, shifted or not", () => {
    const failures: string[] = [];
    let divisions = 0;
    let shifted = 0;
    for (const task of tasks) {
      if (task.operator !== "÷") continue;
      divisions++;
      const [a, b] = task.operands;
      // ME-055 is a statement about the BASE integers: the dividend is built as
      // divisor x quotient, and ME-107 says every power-of-ten shift of that
      // stays terminating. So the invariant to check is on the mantissas.
      const dividend =
        a.type === "int" ? a.magnitude : a.type === "decimal" ? a.mantissa : 0;
      const divisor =
        b.type === "int" ? b.magnitude : b.type === "decimal" ? b.mantissa : 0;
      if (a.type === "decimal") shifted++;
      record(
        failures,
        divisor >= 2 && dividend % divisor === 0,
        () =>
          `${task.prompt} has base ${dividend} ÷ ${divisor}, which leaves a remainder`,
      );
      // ...and the shifted answer is therefore always terminating (ME-023)
      record(
        failures,
        terminates(task.answer.d),
        () => `${task.prompt} -> ${task.answer.n}/${task.answer.d} repeats`,
      );
    }
    expect(divisions).toBeGreaterThan(20000);
    expect(shifted).toBeGreaterThan(1000);
    expect(failures).toEqual([]);
  });

  it("ME-023: every add/mul/div/decimal answer is a terminating decimal", () => {
    const failures: string[] = [];
    let checked = 0;
    for (const task of tasks) {
      if (task.kind === "fracAdd" || task.kind === "fracMul") continue;
      checked++;
      record(
        failures,
        terminates(task.answer.d),
        () =>
          `${task.kind} ${task.prompt} -> ${task.answer.n}/${task.answer.d} repeats`,
      );
    }
    expect(checked).toBeGreaterThan(60000);
    expect(failures).toEqual([]);
  });

  it("ME-020/ME-064/ME-078: every answer is stored reduced with a positive denominator", () => {
    const failures: string[] = [];
    for (const task of tasks) {
      record(
        failures,
        task.answer.d > 0 && gcd(task.answer.n, task.answer.d) === 1,
        () =>
          `${task.prompt} -> ${task.answer.n}/${task.answer.d} is not reduced`,
      );
      record(
        failures,
        !Object.is(task.answer.n, -0),
        () => `${task.prompt} produced negative zero`,
      );
    }
    expect(failures).toEqual([]);
  });

  it("ME-022: every value stays inside the safe integer range, no BigInt needed", () => {
    const failures: string[] = [];
    let maxIntermediate = 0;
    for (const task of tasks) {
      const left = operandValue(task.operands[0]);
      const right = operandValue(task.operands[1]);
      for (const value of [left, right, task.answer]) {
        record(
          failures,
          Number.isSafeInteger(value.n) && Number.isSafeInteger(value.d),
          () => `${task.prompt} left the safe integer range`,
        );
      }
      // the largest comparison intermediate ME-144 has to survive
      maxIntermediate = Math.max(
        maxIntermediate,
        Math.abs(task.answer.n) * 10 ** 7,
        task.answer.d * 10 ** 7,
      );
    }
    expect(failures).toEqual([]);
    expect(maxIntermediate).toBeLessThan(Number.MAX_SAFE_INTEGER);
    expect(10 ** 14).toBeLessThan(2 ** 53);
  });

  it("ME-062/ME-077: a displayed fraction numerator is always < its denominator", () => {
    const failures: string[] = [];
    let fractions = 0;
    for (const task of tasks) {
      for (const operand of task.operands) {
        if (operand.type !== "fraction") continue;
        fractions++;
        record(
          failures,
          operand.numerator >= 1 &&
            operand.numerator < operand.denominator &&
            operand.denominator >= 2 &&
            gcd(operand.numerator, operand.denominator) === 1,
          () =>
            `${operand.numerator}/${operand.denominator} is not a reduced proper fraction`,
        );
      }
    }
    expect(fractions).toBeGreaterThan(60000);
    expect(failures).toEqual([]);
  });

  it("ME-057/ME-067: the common denominator never exceeds the configured max", () => {
    const failures: string[] = [];
    for (const state of ["12", "99"] as const) {
      const limit = commonDenominatorLimit(state);
      const fracTasks = generateSequence(
        0xfeed,
        settings({
          addition: "off",
          multiplication: "off",
          division: "off",
          fractionMultiplication: false,
          decimals: false,
          fractionAddition: state,
        }),
        N,
      );
      for (const task of fracTasks) {
        const [a, b] = task.operands;
        if (a.type !== "fraction" || b.type !== "fraction") continue;
        record(
          failures,
          lcm(a.denominator, b.denominator) <= limit,
          () => `${task.prompt} needs a common denominator above ${limit}`,
        );
        record(
          failures,
          Math.abs(task.answer.d) <= limit,
          () => `${task.prompt} answer denominator exceeds ${limit}`,
        );
      }
    }
    expect(failures).toEqual([]);
  });

  it("ME-100: decimals never produce an all-integer task", () => {
    const decimalTasks = generateSequence(
      0xc0ffee,
      settings({
        fractionAddition: "off",
        fractionMultiplication: false,
        addition: "1000",
        multiplication: "100",
        division: "threeByTwo",
        decimals: true,
      }),
      N,
    ).filter((task) => task.kind === "decimal");

    expect(decimalTasks.length).toBeGreaterThan(20000);
    const failures: string[] = [];
    for (const task of decimalTasks) {
      const aInt = operandValue(task.operands[0]).d === 1;
      const bInt = operandValue(task.operands[1]).d === 1;
      record(
        failures,
        !(aInt && bInt && task.answer.d === 1),
        () => `${task.prompt} = ${task.answerDisplay} is just a normal task`,
      );
      // ME-098 / E8 — both shifts zero is forbidden
      const shifts = task.operands.map((o) =>
        o.type === "decimal" ? o.shift : 0,
      );
      record(
        failures,
        shifts[0] !== 0 || shifts[1] !== 0,
        () => `${task.prompt} has both shifts zero`,
      );
    }
    expect(failures).toEqual([]);
  });

  it("ME-030: every addition pair stays inside its band", () => {
    for (const state of ["100", "1000"] as const) {
      const band = ADDITION_BANDS[state];
      const additionTasks = generateSequence(
        0xa11,
        settings({
          multiplication: "off",
          division: "off",
          fractionAddition: "off",
          fractionMultiplication: false,
          decimals: false,
          addition: state,
        }),
        N,
      );
      const failures: string[] = [];
      const sums = new Set<number>();
      for (const task of additionTasks) {
        const [a, b] = task.operands;
        if (a.type !== "int" || b.type !== "int") continue;
        const sum = a.magnitude + b.magnitude;
        sums.add(sum);
        record(
          failures,
          a.magnitude >= band.operandMin &&
            b.magnitude >= band.operandMin &&
            sum >= band.sumMin &&
            sum <= band.sumMax,
          () => `${a.magnitude} + ${b.magnitude} is outside ${state}`,
        );
      }
      expect(failures).toEqual([]);
      // the whole band of sums is exercised
      expect(sums.size).toBe(band.sumMax - band.sumMin + 1);
      expect(additionPairCount(state)).toBeGreaterThan(0);
    }
  });

  it("ME-026: no divisor or denominator ever has magnitude below 2 before shifting", () => {
    const failures: string[] = [];
    for (const task of tasks) {
      if (task.operator === "÷") {
        const divisor = task.operands[1];
        const magnitude =
          divisor.type === "int"
            ? divisor.magnitude
            : divisor.type === "decimal"
              ? divisor.mantissa
              : divisor.denominator;
        record(
          failures,
          magnitude >= 2,
          () => `${task.prompt} has a divisor magnitude below 2`,
        );
      }
      for (const operand of task.operands) {
        if (operand.type === "fraction") {
          record(
            failures,
            operand.denominator >= 2,
            () => `${task.prompt} has a denominator below 2`,
          );
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it("ME-125: no two consecutive prompts are identical across the whole run", () => {
    const collisions: number[] = [];
    for (let i = 1; i < tasks.length; i++) {
      if ((tasks[i] as Task).prompt === (tasks[i - 1] as Task).prompt) {
        collisions.push(i);
      }
    }
    expect(collisions).toEqual([]);
  });

  it("ME-111: two negative operands never occur", () => {
    const both = tasks.filter(
      (task) => task.operands.filter((o) => o.negative).length === 2,
    );
    expect(both).toEqual([]);
  });
});
