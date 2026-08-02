import { describe, expect, it } from "vitest";
import {
  DUPLICATE_PROMPT_ATTEMPT_CAP,
  createTaskBatcher,
  createTestSeed,
  generateSequence,
  generateTask,
  generateTasks,
} from "../src/generate";
import {
  BATCH_EXTENSION_SIZE,
  BATCH_REFILL_THRESHOLD,
  DEFAULT_MATH_SETTINGS,
  INITIAL_BATCH_SIZE,
  KIND_ORDER,
} from "../src/settings";
import { MathGenError } from "../src/errors";
import { MINUS } from "../src/render";
import { operandValue } from "../src/operand";
import { isZero } from "../src/rational";
import type { MathSettings, Task } from "../src/types";

function settings(overrides: Partial<MathSettings> = {}): MathSettings {
  return { ...DEFAULT_MATH_SETTINGS, ...overrides };
}

const SEED = 0x5eed1234;

describe("Task shape (ME-003, ME-004)", () => {
  it("exposes index, kind, prompt, answer, answerDisplay and operands", () => {
    const task = generateTask(SEED, 0, DEFAULT_MATH_SETTINGS);
    expect(task).toMatchObject({
      index: 0,
      kind: expect.any(String),
      prompt: expect.any(String),
      answerDisplay: expect.any(String),
    });
    expect(task.operands).toHaveLength(2);
    expect(task.answer.d).toBeGreaterThan(0);
    expect(KIND_ORDER).toContain(task.kind);
  });

  it("ME-004: only the six declared kinds are ever produced", () => {
    const kinds = new Set(
      generateSequence(SEED, DEFAULT_MATH_SETTINGS, 5000).map((t) => t.kind),
    );
    for (const kind of kinds) expect(KIND_ORDER).toContain(kind);
    expect(kinds.size).toBe(6);
  });

  it("ME-129: every prompt ends with ' =' and has single spaces", () => {
    for (const task of generateSequence(SEED, DEFAULT_MATH_SETTINGS, 3000)) {
      expect(task.prompt.endsWith(" =")).toBe(true);
      expect(task.prompt).not.toMatch(/ {2}/);
    }
  });
});

describe("mixing (ME-121 … ME-126)", () => {
  it("ME-122: the kind is uniform over the enabled set", () => {
    const draws = 120000;
    const counts = new Map<string, number>();
    for (const task of generateSequence(SEED, DEFAULT_MATH_SETTINGS, draws)) {
      counts.set(task.kind, (counts.get(task.kind) ?? 0) + 1);
    }
    expect(counts.size).toBe(6);
    const expected = draws / 6;
    let chi = 0;
    for (const kind of KIND_ORDER) {
      const observed = counts.get(kind) ?? 0;
      chi += ((observed - expected) * (observed - expected)) / expected;
    }
    // 5 df; p = 0.001 critical value is 20.515
    expect(chi).toBeLessThan(20.515);
  });

  it("ME-121: only enabled kinds appear", () => {
    const s = settings({
      addition: "off",
      division: "off",
      decimals: false,
    });
    const kinds = new Set(generateSequence(SEED, s, 4000).map((t) => t.kind));
    expect([...kinds].sort()).toEqual(["fracAdd", "fracMul", "mul"]);
  });

  it("E10 / ME-092: with add/mul/div all off, `decimal` never appears", () => {
    const s = settings({
      addition: "off",
      multiplication: "off",
      division: "off",
      fractionMultiplication: false,
      fractionAddition: "99",
      decimals: true,
    });
    const kinds = new Set(generateSequence(SEED, s, 2000).map((t) => t.kind));
    expect([...kinds]).toEqual(["fracAdd"]);
  });

  it("E11 / ME-016: throws MathGenError when nothing is enabled", () => {
    const s = settings({
      addition: "off",
      multiplication: "off",
      division: "off",
      fractionAddition: "off",
      fractionMultiplication: false,
    });
    expect(() => generateTask(SEED, 0, s)).toThrow(MathGenError);
    expect(() => generateSequence(SEED, s, 10)).toThrow(MathGenError);
  });

  it("E30 / ME-125: no two consecutive tasks share a prompt", () => {
    for (const s of [
      DEFAULT_MATH_SETTINGS,
      // the tightest possible pool: 121 distinct tables divisions
      settings({
        addition: "off",
        multiplication: "off",
        division: "tables",
        fractionAddition: "off",
        fractionMultiplication: false,
        decimals: false,
        negatives: false,
      }),
    ]) {
      const tasks = generateSequence(SEED, s, 20000);
      const collisions: string[] = [];
      for (let i = 1; i < tasks.length; i++) {
        if ((tasks[i] as Task).prompt === (tasks[i - 1] as Task).prompt) {
          collisions.push(`${i}: ${(tasks[i] as Task).prompt}`);
        }
      }
      expect(collisions).toEqual([]);
    }
  });

  it("ME-125: the regeneration attempt count is capped and recorded", () => {
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
    const maxAttempts = Math.max(...tasks.map((t) => t.attempts));
    expect(maxAttempts).toBeGreaterThan(1); // collisions really do happen here
    expect(maxAttempts).toBeLessThanOrEqual(DUPLICATE_PROMPT_ATTEMPT_CAP);
    expect(DUPLICATE_PROMPT_ATTEMPT_CAP).toBe(10);
  });

  it("ME-126: consecutive tasks of the same kind are permitted", () => {
    const tasks = generateSequence(SEED, DEFAULT_MATH_SETTINGS, 5000);
    let repeats = 0;
    for (let i = 1; i < tasks.length; i++) {
      if ((tasks[i] as Task).kind === (tasks[i - 1] as Task).kind) repeats++;
    }
    expect(repeats).toBeGreaterThan(500);
  });
});

describe("negatives (ME-109 … ME-118, E5, E37)", () => {
  function negativeCount(task: Task): number {
    return task.operands.filter((o) => o.negative).length;
  }

  it("ME-109: with negatives off, every operand is positive", () => {
    const s = settings({ negatives: false });
    for (const task of generateSequence(SEED, s, 20000)) {
      expect(negativeCount(task)).toBe(0);
    }
  });

  it("E5 / ME-111: two negative operands are structurally impossible", () => {
    const tasks = generateSequence(SEED, DEFAULT_MATH_SETTINGS, 60000);
    const both = tasks.filter((t) => negativeCount(t) === 2);
    expect(both).toEqual([]);
  });

  it("ME-110/ME-111: exactly one operand is negative with probability 0.5", () => {
    const tasks = generateSequence(SEED, DEFAULT_MATH_SETTINGS, 60000);
    const withNegative = tasks.filter((t) => negativeCount(t) === 1).length;
    const share = withNegative / tasks.length;
    expect(share).toBeGreaterThan(0.49);
    expect(share).toBeLessThan(0.51);
  });

  it("ME-110: the negated index is uniform over {0, 1}", () => {
    const tasks = generateSequence(SEED, DEFAULT_MATH_SETTINGS, 60000).filter(
      (t) => t.operands.some((o) => o.negative),
    );
    const first = tasks.filter((t) => t.operands[0].negative).length;
    const share = first / tasks.length;
    expect(share).toBeGreaterThan(0.48);
    expect(share).toBeLessThan(0.52);
  });

  it("ME-112: negation applies to every kind, fractions and decimals included", () => {
    const seen = new Map<string, number>();
    for (const task of generateSequence(SEED, DEFAULT_MATH_SETTINGS, 60000)) {
      if (task.operands.some((o) => o.negative)) {
        seen.set(task.kind, (seen.get(task.kind) ?? 0) + 1);
      }
    }
    for (const kind of KIND_ORDER) {
      expect(seen.get(kind) ?? 0).toBeGreaterThan(0);
    }
  });

  it("E38 / ME-113: a negated fraction keeps a positive denominator", () => {
    for (const task of generateSequence(SEED, DEFAULT_MATH_SETTINGS, 20000)) {
      for (const operand of task.operands) {
        if (operand.type !== "fraction") continue;
        expect(operand.denominator).toBeGreaterThan(0);
        expect(operand.numerator).toBeGreaterThan(0);
        if (operand.negative) expect(operandValue(operand).n).toBeLessThan(0);
      }
    }
  });

  it("E37 / ME-117: negating the divisor is permitted and never divides by zero", () => {
    let negatedDivisors = 0;
    for (const task of generateSequence(SEED, DEFAULT_MATH_SETTINGS, 60000)) {
      if (task.operator !== "÷") continue;
      const divisor = operandValue(task.operands[1]);
      expect(isZero(divisor)).toBe(false);
      expect(Math.abs(divisor.n / divisor.d)).toBeGreaterThanOrEqual(0.1);
      if (task.operands[1].negative) negatedDivisors++;
    }
    expect(negatedDivisors).toBeGreaterThan(0);
  });

  it("ME-116: magnitudes still obey the setting bounds after negation", () => {
    const s = settings({
      addition: "100",
      multiplication: "off",
      division: "off",
      fractionAddition: "off",
      fractionMultiplication: false,
      decimals: false,
      negatives: true,
    });
    let negativeAnswers = 0;
    for (const task of generateSequence(SEED, s, 20000)) {
      const [a, b] = task.operands;
      if (a.type !== "int" || b.type !== "int") {
        throw new Error("expected ints");
      }
      expect(a.magnitude).toBeGreaterThanOrEqual(2);
      expect(b.magnitude).toBeGreaterThanOrEqual(2);
      expect(a.magnitude + b.magnitude).toBeLessThanOrEqual(100);
      if (task.answer.n < 0) negativeAnswers++;
    }
    // the answer MAY fall outside the nominal band — that is not a violation
    expect(negativeAnswers).toBeGreaterThan(0);
  });

  it("ME-118: the answer is recomputed after negation and matches the prompt", () => {
    for (const task of generateSequence(SEED, DEFAULT_MATH_SETTINGS, 20000)) {
      const [a, b] = task.operands;
      const left = operandValue(a);
      const right = operandValue(b);
      let expected: { n: number; d: number };
      if (task.operator === "+") {
        expected = {
          n: left.n * right.d + right.n * left.d,
          d: left.d * right.d,
        };
      } else if (task.operator === "×") {
        expected = { n: left.n * right.n, d: left.d * right.d };
      } else {
        expected = { n: left.n * right.d, d: left.d * right.n };
      }
      expect(task.answer.n * expected.d).toBe(expected.n * task.answer.d);
    }
  });

  it("ME-131 / C33: a negative second operand is parenthesised in the prompt", () => {
    let sawFirst = false;
    let sawSecond = false;
    for (const task of generateSequence(SEED, DEFAULT_MATH_SETTINGS, 20000)) {
      if (task.operands[0].negative) {
        sawFirst = true;
        expect(task.prompt.startsWith(MINUS)).toBe(true);
      }
      if (task.operands[1].negative) {
        sawSecond = true;
        expect(task.prompt).toContain(`(${MINUS}`);
      }
    }
    expect(sawFirst).toBe(true);
    expect(sawSecond).toBe(true);
  });
});

describe("determinism (ME-008, ME-169 … ME-172)", () => {
  it("ME-008: generateTask is pure in (seed, index, settings)", () => {
    for (const index of [0, 1, 7, 59, 1000]) {
      const a = generateTask(SEED, index, DEFAULT_MATH_SETTINGS);
      const b = generateTask(SEED, index, DEFAULT_MATH_SETTINGS);
      expect(a).toEqual(b);
    }
  });

  it("ME-170: a task's PRNG sub-stream does not depend on how many came before", () => {
    const direct = generateTask(SEED, 500, DEFAULT_MATH_SETTINGS);
    const viaBatch = generateTasks(SEED, DEFAULT_MATH_SETTINGS, 500, 1)[0];
    expect(viaBatch?.taskSeed).toBe(direct.taskSeed);
    expect(viaBatch).toEqual(direct);
  });

  /**
   * ME-008 + ME-125. The dedup rule chains task `i` to task `i-1`, so an entry
   * point that skips the chain returns a *different* task at the same index —
   * and the backend's ME-174 revalidation would reject the resulting log. Every
   * published entry point must therefore agree with `generateSequence`.
   *
   * The three settings below are the ones where divergence is most likely: a
   * small task pool means frequent duplicate prompts and therefore frequent
   * regeneration. `multiplication: "12"` has only 121 distinct prompt shapes.
   */
  it("ME-008/ME-125: every entry point agrees with the canonical sequence", () => {
    const cases: MathSettings[] = [
      DEFAULT_MATH_SETTINGS,
      settings({ addition: "100" }),
      settings({
        addition: "off",
        multiplication: "12",
        division: "off",
        fractionAddition: "off",
        fractionMultiplication: false,
        decimals: false,
        negatives: false,
      }),
      settings({
        addition: "off",
        multiplication: "off",
        division: "off",
        fractionAddition: "12",
        fractionMultiplication: false,
        decimals: false,
        negatives: false,
      }),
    ];

    for (const s of cases) {
      const sequence = generateSequence(SEED, s, 620);
      for (let index = 0; index < 600; index += 13) {
        expect(generateTask(SEED, index, s), `index ${index}`).toEqual(
          sequence[index],
        );
      }
      for (const from of [0, 1, 59, 200, 599]) {
        expect(generateTasks(SEED, s, from, 5), `from ${from}`).toEqual(
          sequence.slice(from, from + 5),
        );
      }
      const batcher = createTaskBatcher(SEED, s);
      for (let i = 0; i < 300; i++) expect(batcher.take()).toEqual(sequence[i]);
    }
  });

  it("rejects a task index that is not a non-negative integer", () => {
    for (const bad of [-1, 1.5, Number.NaN]) {
      expect(() => generateTask(SEED, bad, DEFAULT_MATH_SETTINGS)).toThrow(
        MathGenError,
      );
      expect(() => generateTasks(SEED, DEFAULT_MATH_SETTINGS, bad, 5)).toThrow(
        MathGenError,
      );
    }
  });

  it("ME-171: the whole sequence is recomputable from (seed, settings)", () => {
    const first = generateSequence(SEED, DEFAULT_MATH_SETTINGS, 300);
    const second = generateSequence(SEED, DEFAULT_MATH_SETTINGS, 300);
    expect(second).toEqual(first);
  });

  it("different seeds produce different sequences", () => {
    const a = generateSequence(1, DEFAULT_MATH_SETTINGS, 50).map(
      (t) => t.prompt,
    );
    const b = generateSequence(2, DEFAULT_MATH_SETTINGS, 50).map(
      (t) => t.prompt,
    );
    expect(a).not.toEqual(b);
  });

  it("ME-006: a different settings snapshot produces a different sequence", () => {
    const a = generateSequence(SEED, DEFAULT_MATH_SETTINGS, 50).map(
      (t) => t.prompt,
    );
    const b = generateSequence(SEED, settings({ addition: "100" }), 50).map(
      (t) => t.prompt,
    );
    expect(a).not.toEqual(b);
  });

  it("ME-119: `time` never affects generation", () => {
    const a = generateSequence(SEED, settings({ time: 1 }), 200);
    const b = generateSequence(SEED, settings({ time: 8 }), 200);
    expect(a).toEqual(b);
  });

  it("generateTask reproduces the sequence exactly (ME-174/ME-176 support)", () => {
    const sequence = generateSequence(SEED, DEFAULT_MATH_SETTINGS, 400);
    for (const index of [0, 1, 2, 13, 99, 250, 399]) {
      expect(generateTask(SEED, index, DEFAULT_MATH_SETTINGS)).toEqual(
        sequence[index],
      );
    }
  });

  it("ME-169: createTestSeed returns a uint32 from a crypto source", () => {
    const values: number[] = [];
    for (let i = 0; i < 200; i++) {
      const seed = createTestSeed();
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThanOrEqual(0xffffffff);
      values.push(seed);
    }
    expect(new Set(values).size).toBeGreaterThan(190);
  });

  it("ME-169: an injected crypto source is honoured, so tests stay deterministic", () => {
    const fixed = {
      getRandomValues<T extends ArrayBufferView>(array: T): T {
        new Uint32Array(array.buffer)[0] = 0xabcdef01;
        return array;
      },
    };
    expect(createTestSeed(fixed)).toBe(0xabcdef01);
  });
});

describe("rolling batch (ME-120, ME-158)", () => {
  it("uses the specified 60 / 30 / 15 sizing", () => {
    expect(INITIAL_BATCH_SIZE).toBe(60);
    expect(BATCH_EXTENSION_SIZE).toBe(30);
    expect(BATCH_REFILL_THRESHOLD).toBe(15);
  });

  it("pre-generates 60 tasks and extends by 30 below 15 unconsumed", () => {
    const batcher = createTaskBatcher(SEED, DEFAULT_MATH_SETTINGS);
    expect(batcher.generated).toBe(INITIAL_BATCH_SIZE);

    for (let i = 0; i < 45; i++) batcher.take();
    expect(batcher.generated).toBe(INITIAL_BATCH_SIZE);

    // consuming the 46th leaves 14 unconsumed, which is below the threshold
    batcher.take();
    expect(batcher.generated).toBe(INITIAL_BATCH_SIZE + BATCH_EXTENSION_SIZE);
  });

  it("ME-120: generation is unbounded — the test ends on the timer", () => {
    const batcher = createTaskBatcher(SEED, DEFAULT_MATH_SETTINGS);
    let last: Task | undefined;
    for (let i = 0; i < 2000; i++) last = batcher.take();
    expect(last?.index).toBe(1999);
    expect(batcher.generated).toBeGreaterThan(2000);
  });

  it("the batcher emits exactly the canonical sequence", () => {
    const batcher = createTaskBatcher(SEED, DEFAULT_MATH_SETTINGS);
    const sequence = generateSequence(SEED, DEFAULT_MATH_SETTINGS, 200);
    for (let i = 0; i < 200; i++) expect(batcher.take()).toEqual(sequence[i]);
  });

  it("peek does not consume", () => {
    const batcher = createTaskBatcher(SEED, DEFAULT_MATH_SETTINGS);
    const peeked = batcher.peek();
    expect(batcher.take()).toEqual(peeked);
  });
});
