/**
 * Task assembly, mixing and the deterministic sequence (ME-003, ME-008,
 * ME-109 … ME-126, ME-158, ME-169 … ME-172).
 *
 * The normative pipeline order is exactly (ME-115):
 *   (1) generate base integer/fraction operands
 *   (2) apply the decimal shift (decimal kind only)
 *   (3) apply negation
 * This order is what fixes the PRNG draw sequence and therefore reproducibility.
 */

import { MathGenError } from "./errors";
import { drawDecimalShift, generateDecimal } from "./generators/decimal";
import { generateAddition } from "./generators/addition";
import { generateDivision } from "./generators/division";
import { generateFractionAddition } from "./generators/fraction-addition";
import { generateFractionMultiplication } from "./generators/fraction-multiplication";
import { generateMultiplication } from "./generators/multiplication";
import {
  computeAnswer,
  decimalOperand,
  fractionOperand,
  intOperand,
  negateOperand,
} from "./operand";
import { createPrng, deriveTaskSeed } from "./prng";
import type { Prng } from "./prng";
import {
  OPERATOR_ADD,
  OPERATOR_DIV,
  OPERATOR_MUL,
  renderAnswerDisplay,
  renderPrompt,
} from "./render";
import {
  BATCH_EXTENSION_SIZE,
  BATCH_REFILL_THRESHOLD,
  INITIAL_BATCH_SIZE,
  assertGeneratable,
  getEnabledKinds,
} from "./settings";
import type { MathSettings, Operand, Operator, Task, TaskKind } from "./types";

/** ME-125 — duplicate-prompt regeneration cap. */
export const DUPLICATE_PROMPT_ATTEMPT_CAP = 10;

type Assembled = {
  kind: TaskKind;
  baseKind?: "add" | "mul" | "div";
  operator: Operator;
  operands: [Operand, Operand];
};

function assembleByKind(
  rng: Prng,
  kind: TaskKind,
  settings: MathSettings,
): Assembled {
  switch (kind) {
    case "add": {
      const { a, b } = generateAddition(
        rng,
        settings.addition as Exclude<MathSettings["addition"], "off">,
      );
      return {
        kind,
        operator: OPERATOR_ADD,
        operands: [intOperand(a), intOperand(b)],
      };
    }
    case "mul": {
      const { a, b } = generateMultiplication(
        rng,
        settings.multiplication as Exclude<
          MathSettings["multiplication"],
          "off"
        >,
      );
      return {
        kind,
        operator: OPERATOR_MUL,
        operands: [intOperand(a), intOperand(b)],
      };
    }
    case "div": {
      const { a, b } = generateDivision(
        rng,
        settings.division as Exclude<MathSettings["division"], "off">,
      );
      return {
        kind,
        operator: OPERATOR_DIV,
        operands: [intOperand(a), intOperand(b)],
      };
    }
    case "fracAdd": {
      const { n1, d1, n2, d2 } = generateFractionAddition(
        rng,
        settings.fractionAddition as Exclude<
          MathSettings["fractionAddition"],
          "off"
        >,
      );
      return {
        kind,
        operator: OPERATOR_ADD,
        operands: [fractionOperand(n1, d1), fractionOperand(n2, d2)],
      };
    }
    case "fracMul": {
      if (settings.multiplication === "off") {
        // ME-074's bound N is undefined here; ME-084's coupling makes this
        // unreachable through the bar. Guessing a bound would corrupt
        // server-side revalidation, so fail loudly instead.
        throw new MathGenError(
          "fraction-multiplication-without-multiplication",
          "fractionMultiplication needs a non-off multiplication setting (ME-074, ME-084)",
        );
      }
      const { n1, d1, n2, d2 } = generateFractionMultiplication(
        rng,
        settings.multiplication,
      );
      return {
        kind,
        operator: OPERATOR_MUL,
        operands: [fractionOperand(n1, d1), fractionOperand(n2, d2)],
      };
    }
    default: {
      const draw = generateDecimal(rng, settings);
      const operator =
        draw.baseKind === "add"
          ? OPERATOR_ADD
          : draw.baseKind === "mul"
            ? OPERATOR_MUL
            : OPERATOR_DIV;
      return {
        kind: "decimal",
        baseKind: draw.baseKind,
        operator,
        operands: [
          decimalOperand(draw.a, draw.sA),
          decimalOperand(draw.b, draw.sB),
        ],
      };
    }
  }
}

/**
 * ME-110 / ME-111 — choose one operand index uniformly from `{0, 1}`, then with
 * probability exactly `0.5` negate it. Both draws come from the seeded PRNG, in
 * that order.
 *
 * Consequence: `P(exactly one negative) = 0.5` and `P(two negatives) = 0`.
 * Both operands negative is **structurally impossible** (E5).
 */
function applyNegatives(
  rng: Prng,
  operands: [Operand, Operand],
): [Operand, Operand] {
  const index = rng.nextInt(0, 1);
  if (rng.next() >= 0.5) return operands;
  const negated: [Operand, Operand] = [operands[0], operands[1]];
  negated[index] = negateOperand(negated[index] as Operand);
  return negated;
}

function drawOnce(
  rng: Prng,
  index: number,
  settings: MathSettings,
  enabled: readonly TaskKind[],
  taskSeed: number,
  attempts: number,
): Task {
  // ME-122/ME-123: one uniform draw over the canonically ordered enabled set.
  const kind = enabled[rng.nextInt(0, enabled.length - 1)] as TaskKind;
  const assembled = assembleByKind(rng, kind, settings);

  const operands = settings.negatives
    ? applyNegatives(rng, assembled.operands)
    : assembled.operands;

  const answer = computeAnswer(assembled.operator, operands[0], operands[1]);

  const task: Task = {
    index,
    kind: assembled.kind,
    operator: assembled.operator,
    operands,
    prompt: renderPrompt(operands, assembled.operator),
    answer,
    answerDisplay: renderAnswerDisplay(answer, assembled.kind),
    taskSeed,
    attempts,
  };
  if (assembled.baseKind !== undefined) task.baseKind = assembled.baseKind;
  return task;
}

/**
 * Resolves (and validates) the enabled-kind set once per call chain, so walking
 * a sequence does not re-derive it per task.
 */
function resolveEnabled(settings: MathSettings): TaskKind[] {
  assertGeneratable(settings);
  const enabled = getEnabledKinds(settings);
  if (enabled.length === 0) {
    throw new MathGenError(
      "no-enabled-generators",
      "at least one task type must be enabled (ME-016)",
    );
  }
  return enabled;
}

/**
 * One link of the canonical chain. **Deliberately not exported.**
 *
 * `previousPrompt` implements ME-125's "no two consecutive tasks with an
 * identical prompt string", which makes task `i` depend on task `i-1`. Exposing
 * it as an optional public parameter would let a caller follow ME-008's
 * documented `generateTask(seed, index, settings)` shape and silently get a task
 * that is *not* the one at that index of the canonical sequence — the backend's
 * ME-174 revalidation would then reject a legitimate run. So the only public
 * entry points are the ones that walk the chain themselves.
 *
 * Regeneration keeps drawing from the task's own sub-stream and never reseeds
 * (ME-172), so the retry count is itself deterministic and is recorded on the
 * Task as `attempts`.
 */
function drawTask(
  seed: number,
  index: number,
  settings: MathSettings,
  enabled: readonly TaskKind[],
  previousPrompt: string | undefined,
): Task {
  const taskSeed = deriveTaskSeed(seed, index);
  const rng = createPrng(taskSeed);

  let task = drawOnce(rng, index, settings, enabled, taskSeed, 1);
  for (
    let attempt = 2;
    attempt <= DUPLICATE_PROMPT_ATTEMPT_CAP && task.prompt === previousPrompt;
    attempt++
  ) {
    task = drawOnce(rng, index, settings, enabled, taskSeed, attempt);
  }
  // After the cap the duplicate is accepted rather than looping (ME-125).
  return task;
}

/**
 * The canonical sequence `0 … count-1`. This is what the backend regenerates to
 * revalidate a submitted result (ME-174), and it is the definition every other
 * entry point here agrees with by construction.
 */
export function generateSequence(
  seed: number,
  settings: MathSettings,
  count: number,
): Task[] {
  const enabled = resolveEnabled(settings);
  const tasks: Task[] = [];
  let previous: string | undefined;
  for (let i = 0; i < count; i++) {
    const task = drawTask(seed, i, settings, enabled, previous);
    tasks.push(task);
    previous = task.prompt;
  }
  return tasks;
}

/**
 * ME-008 — the single generation entry point, of exactly the shape the spec
 * names. Pure: the same `(seed, index, settings)` always produces the identical
 * Task, and that Task is always `generateSequence(seed, settings, n)[index]`.
 *
 * ME-125's dedup makes task `i` depend on task `i-1`, so this walks the chain
 * from 0. That is O(index) — cheap at croco calc's scale (an 8-minute run is a
 * few hundred tasks) and, crucially, exact. Use `createTaskBatcher` for the live
 * test loop and `generateSequence` when you need many indices.
 */
export function generateTask(
  seed: number,
  index: number,
  settings: MathSettings,
): Task {
  if (!Number.isInteger(index) || index < 0) {
    throw new MathGenError(
      "invalid-task-index",
      `task index must be a non-negative integer, got ${String(index)}`,
    );
  }
  const enabled = resolveEnabled(settings);
  let task: Task | undefined;
  let previous: string | undefined;
  for (let i = 0; i <= index; i++) {
    task = drawTask(seed, i, settings, enabled, previous);
    previous = task.prompt;
  }
  return task as Task;
}

/**
 * ME-158 / ME-174 — tasks `from … from+count-1` of the canonical sequence.
 *
 * Like `generateTask` this walks from 0, so the window it returns is always the
 * matching slice of `generateSequence`. There is no `previousPrompt` escape
 * hatch for the same reason.
 */
export function generateTasks(
  seed: number,
  settings: MathSettings,
  from: number,
  count: number,
): Task[] {
  if (!Number.isInteger(from) || from < 0) {
    throw new MathGenError(
      "invalid-task-index",
      `task index must be a non-negative integer, got ${String(from)}`,
    );
  }
  if (count <= 0) {
    resolveEnabled(settings);
    return [];
  }
  return generateSequence(seed, settings, from + count).slice(from);
}

/**
 * ME-169 — the uint32 test seed, drawn from `crypto.getRandomValues`.
 *
 * This is the **only** impure function in the package and it is deliberately
 * outside the generation path: everything downstream is a pure function of the
 * value it returns. Inject `source` in tests to keep them deterministic.
 */
export type RandomSource = {
  getRandomValues(array: Uint32Array): Uint32Array;
};

export function createTestSeed(source?: RandomSource): number {
  const random = (source ?? globalThis.crypto) as RandomSource | undefined;
  if (random === undefined || typeof random.getRandomValues !== "function") {
    throw new MathGenError(
      "sampling-exhausted",
      "createTestSeed requires crypto.getRandomValues (ME-169)",
    );
  }
  const buffer = new Uint32Array(1);
  random.getRandomValues(buffer);
  return (buffer[0] as number) >>> 0;
}

/** The rolling batch of ME-158 (60 initial, +30 whenever fewer than 15 remain). */
export type TaskBatcher = {
  /** Consumes and returns the next task. */
  take(): Task;
  /** Returns the next task without consuming it. */
  peek(): Task;
  /** Total tasks generated so far. */
  readonly generated: number;
  /** Tasks generated but not yet consumed. */
  readonly unconsumed: number;
};

export function createTaskBatcher(
  seed: number,
  settings: MathSettings,
): TaskBatcher {
  // The batcher is the one place that may extend the chain incrementally: it
  // owns the tail prompt, so it stays on the canonical sequence by construction
  // and does not pay `generateTask`'s O(index) walk on every refill.
  const enabled = resolveEnabled(settings);
  const tasks: Task[] = [];
  let consumed = 0;

  function extend(count: number): void {
    let previous = tasks[tasks.length - 1]?.prompt;
    for (let i = 0; i < count; i++) {
      const task = drawTask(seed, tasks.length, settings, enabled, previous);
      tasks.push(task);
      previous = task.prompt;
    }
  }

  extend(INITIAL_BATCH_SIZE);

  function refill(): void {
    while (tasks.length - consumed < BATCH_REFILL_THRESHOLD) {
      extend(BATCH_EXTENSION_SIZE);
    }
  }

  return {
    take(): Task {
      const task = tasks[consumed] as Task;
      consumed++;
      refill();
      return task;
    },
    peek(): Task {
      return tasks[consumed] as Task;
    },
    get generated(): number {
      return tasks.length;
    },
    get unconsumed(): number {
      return tasks.length - consumed;
    },
  };
}

/** Re-exported so callers can build a PRNG for ad-hoc replay. */
export { createPrng, drawDecimalShift };
