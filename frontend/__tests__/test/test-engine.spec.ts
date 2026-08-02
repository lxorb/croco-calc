import { describe, expect, it } from "vitest";

import {
  createTaskBatcher,
  DEFAULT_MATH_SETTINGS,
  intOperand,
  rational,
} from "@croco-calc/math-engine";
import type { MathSettings, Task, TaskBatcher } from "@croco-calc/math-engine";

import { createTestEngine } from "../../src/ts/test/test-engine";
import type { TestEngine } from "../../src/ts/test/test-engine";

/**
 * A deterministic stand-in for the real batcher: task `n` is `n+1 + 1 = n+2`.
 * Keeps the state-machine assertions independent of generator behaviour, which
 * `packages/math-engine` already covers with 343 of its own tests.
 */
function stubBatcher(): TaskBatcher {
  let index = 0;
  const make = (i: number): Task => ({
    index: i,
    kind: "add",
    operator: "+",
    operands: [intOperand(i + 1), intOperand(1)],
    prompt: `${i + 1} + 1 =`,
    answer: rational(i + 2, 1),
    answerDisplay: `${i + 2}`,
    taskSeed: i,
    attempts: 1,
  });
  const generated: Task[] = [];
  return {
    take(): Task {
      const task = make(index++);
      generated.push(task);
      return task;
    },
    peek: () => make(index),
    get generated(): number {
      return generated.length;
    },
    get unconsumed(): number {
      return 0;
    },
  };
}

const SETTINGS: MathSettings = { ...DEFAULT_MATH_SETTINGS, time: 1 };

function makeEngine(settings: MathSettings = SETTINGS): TestEngine {
  return createTestEngine({
    seed: 12345,
    settings,
    batcherFactory: stubBatcher,
  });
}

/** Types a whole answer, one keystroke at a time, then commits it. */
function answer(engine: TestEngine, text: string, at = 1000): void {
  for (const ch of text) engine.press(ch, at);
  engine.commit(at);
}

describe("createTestEngine", () => {
  describe("start / idle (CP-049, CP-050, CP-075)", () => {
    it("starts idle with the clock at the full duration", () => {
      const engine = makeEngine();
      const snapshot = engine.snapshot();
      expect(snapshot.phase).toBe("idle");
      expect(snapshot.elapsedSeconds).toBe(0);
      expect(snapshot.remainingSeconds).toBe(60);
      expect(engine.startedAt()).toBeUndefined();
    });

    it("starts on the first accepted character and reports it (CP-049)", () => {
      const engine = makeEngine();
      expect(engine.press("3", 5_000)).toBe("started");
      expect(engine.snapshot().phase).toBe("active");
      expect(engine.startedAt()).toBe(5_000);
    });

    it("does not start on a character the filter rejects (CP-050, CP-055)", () => {
      const engine = makeEngine();
      for (const ch of ["a", "Z", "!", " ", "Tab", "Escape", "+", "="]) {
        expect(engine.press(ch, 1_000)).toBe("ignored");
      }
      expect(engine.snapshot().phase).toBe("idle");
      expect(engine.startedAt()).toBeUndefined();
    });

    it("does not start on a commit — Enter and Space are inert while idle (CP-050)", () => {
      const engine = makeEngine();
      expect(engine.commit(1_000)).toBe("noop");
      expect(engine.snapshot().phase).toBe("idle");
    });

    it("does not start on backspace (CP-050)", () => {
      const engine = makeEngine();
      expect(engine.backspace(false)).toBe(false);
      expect(engine.snapshot().phase).toBe("idle");
    });

    it("only the first accepted character reports `started`", () => {
      const engine = makeEngine();
      expect(engine.press("1", 0)).toBe("started");
      expect(engine.press("2", 0)).toBe("accepted");
    });
  });

  describe("input filter (CP-055 … CP-058, C32, ME-151)", () => {
    it("silently ignores a leading `.` (master C32)", () => {
      const engine = makeEngine();
      expect(engine.press(".", 0)).toBe("ignored");
      expect(engine.buffer()).toBe("");
      expect(engine.snapshot().phase).toBe("idle");
      engine.press("5", 0);
      engine.press(".", 0);
      expect(engine.buffer()).toBe("5.");
    });

    it("silently ignores a leading `/` (CP-058)", () => {
      const engine = makeEngine();
      expect(engine.press("/", 0)).toBe("ignored");
      engine.press("1", 0);
      engine.press("/", 0);
      expect(engine.buffer()).toBe("1/");
    });

    it("accepts `-` only as the first character (CP-057)", () => {
      const engine = makeEngine();
      engine.press("-", 0);
      engine.press("4", 0);
      engine.press("-", 0);
      expect(engine.buffer()).toBe("-4");
    });

    it("normalises `,` to `.` (CP-056, ME-138) and U+2212 to `-` (C33, ME-139)", () => {
      const engine = makeEngine();
      engine.press("−", 0);
      engine.press("4", 0);
      engine.press(",", 0);
      engine.press("2", 0);
      expect(engine.buffer()).toBe("-4.2");
    });

    it("allows at most one `.` and one `/` (CP-058)", () => {
      const engine = makeEngine();
      // the second `.` and the `/` are both dropped; the digits still land
      for (const ch of "1.2.3/4") engine.press(ch, 0);
      expect(engine.buffer()).toBe("1.234");
    });

    it("caps the buffer at 16 characters (ME-151, CP-055)", () => {
      const engine = makeEngine();
      for (const ch of "12345678901234567890") engine.press(ch, 0);
      expect(engine.buffer()).toHaveLength(16);
      expect(engine.press("7", 0)).toBe("ignored");
    });
  });

  describe("answer judging and advancement (CP-037 … CP-040, ME-141)", () => {
    it("advances on a correct commit and scores it", () => {
      const engine = makeEngine();
      answer(engine, "2");
      const snapshot = engine.snapshot();
      expect(snapshot.activeIndex).toBe(1);
      expect(snapshot.correct).toBe(1);
      expect(snapshot.wrong).toBe(0);
      expect(engine.buffer()).toBe("");
    });

    it("advances on a wrong commit and scores it (ME-154)", () => {
      const engine = makeEngine();
      answer(engine, "99");
      const snapshot = engine.snapshot();
      expect(snapshot.activeIndex).toBe(1);
      expect(snapshot.correct).toBe(0);
      expect(snapshot.wrong).toBe(1);
    });

    it("treats an empty commit as a no-op (CP-038, ME-141)", () => {
      const engine = makeEngine();
      engine.press("1", 0);
      engine.commit(0);
      expect(engine.snapshot().activeIndex).toBe(1);

      expect(engine.commit(0)).toBe("noop");
      const snapshot = engine.snapshot();
      expect(snapshot.activeIndex).toBe(1);
      expect(snapshot.answered).toBe(1);
    });

    it("treats a digit-less commit as a no-op (CP-058a)", () => {
      const engine = makeEngine();
      engine.press("1", 0);
      engine.commit(0);
      engine.press("-", 0);
      expect(engine.buffer()).toBe("-");
      expect(engine.commit(0)).toBe("noop");
      expect(engine.snapshot().activeIndex).toBe(1);
    });

    it("normalises a trailing `.` before judging (CP-058a)", () => {
      const engine = makeEngine();
      engine.press("2", 0);
      engine.press(".", 0);
      expect(engine.buffer()).toBe("2.");
      expect(engine.commit(0)).toBe("correct");
    });

    it("accepts an equivalent fraction — judging is exact rationals (ME-147)", () => {
      const engine = makeEngine();
      // task 0 is `1 + 1 =`, answer 2; `4/2` is the same rational.
      expect(engine.commit(0)).toBe("noop");
      answer(engine, "4/2");
      expect(engine.snapshot().correct).toBe(1);
    });
  });

  describe("backspace (CP-042, CP-059)", () => {
    it("deletes one character", () => {
      const engine = makeEngine();
      engine.press("1", 0);
      engine.press("2", 0);
      expect(engine.backspace(false)).toBe(true);
      expect(engine.buffer()).toBe("1");
    });

    it("clears the whole answer with the word-delete modifier", () => {
      const engine = makeEngine();
      for (const ch of "1234") engine.press(ch, 0);
      expect(engine.backspace(true)).toBe(true);
      expect(engine.buffer()).toBe("");
    });

    it("never crosses a task boundary (CP-042)", () => {
      const engine = makeEngine();
      answer(engine, "2");
      expect(engine.snapshot().activeIndex).toBe(1);
      expect(engine.backspace(false)).toBe(false);
      expect(engine.backspace(true)).toBe(false);
      expect(engine.snapshot().activeIndex).toBe(1);
    });
  });

  describe("answers stay out of reach (master C29, ME-135)", () => {
    it("withholds the answer of every uncommitted task", () => {
      const engine = makeEngine();
      for (let i = 0; i < 20; i++) {
        const view = engine.viewAt(i);
        expect(view?.state).not.toBe("committed");
        expect(view?.expected).toBeUndefined();
      }
    });

    it("reveals the answer only once that task is committed (CP-041)", () => {
      const engine = makeEngine();
      expect(engine.viewAt(0)?.expected).toBeUndefined();
      answer(engine, "99");
      const view = engine.viewAt(0);
      expect(view?.state).toBe("committed");
      expect(view?.result).toBe("incorrect");
      expect(view?.expected).toBe("2");
      // the *next* task is still sealed
      expect(engine.viewAt(1)?.expected).toBeUndefined();
    });

    it("exposes no accessor that returns a raw task", () => {
      const engine = makeEngine();
      const leaked = Object.entries(engine).filter(([, value]) => {
        if (typeof value !== "function") return false;
        let result: unknown;
        try {
          result = (value as () => unknown)();
        } catch {
          return false;
        }
        return (
          typeof result === "object" &&
          result !== null &&
          "answerDisplay" in result
        );
      });
      expect(leaked).toEqual([]);
    });
  });

  describe("the timer (CP-073 … CP-075, CP-088)", () => {
    it("counts down from the configured duration", () => {
      const engine = makeEngine({ ...SETTINGS, time: 8 });
      expect(engine.durationSeconds).toBe(480);
      engine.press("1", 0);
      engine.tick(3_000);
      const snapshot = engine.snapshot();
      expect(snapshot.elapsedSeconds).toBe(3);
      expect(snapshot.remainingSeconds).toBe(477);
    });

    it("does not advance while idle (CP-075)", () => {
      const engine = makeEngine();
      expect(engine.tick(30_000)).toBe(false);
      expect(engine.snapshot().elapsedSeconds).toBe(0);
    });

    it("finishes exactly when the duration expires", () => {
      const engine = makeEngine();
      engine.press("1", 0);
      expect(engine.tick(59_000)).toBe(false);
      expect(engine.snapshot().phase).toBe("active");
      expect(engine.tick(60_000)).toBe(true);
      expect(engine.snapshot().phase).toBe("finished");
      expect(engine.snapshot().remainingSeconds).toBe(0);
    });

    it("never counts past the duration even after a long stall", () => {
      const engine = makeEngine();
      engine.press("1", 0);
      engine.tick(999_000);
      expect(engine.snapshot().elapsedSeconds).toBe(60);
    });

    it("ignores input once finished", () => {
      const engine = makeEngine();
      engine.press("1", 0);
      engine.tick(60_000);
      expect(engine.press("5", 61_000)).toBe("ignored");
      expect(engine.commit(61_000)).toBe("noop");
    });

    it("counts a silent second as idle time (master C37)", () => {
      const engine = makeEngine();
      engine.press("1", 0);
      engine.tick(1_000); // the press covered second 1
      engine.tick(2_000);
      engine.tick(3_000);
      expect(engine.afkSeconds()).toBe(2);
      engine.press("2", 3_500);
      engine.tick(4_000);
      expect(engine.afkSeconds()).toBe(2);
    });

    it("separates a tail of silence from scattered idle seconds (C19, C37)", () => {
      const engine = makeEngine();
      engine.press("3", 0);

      // Input every other second: `afkSeconds` climbs because it *sums* idle
      // seconds, but the run is never abandoned, so the trailing counter is
      // reset again and again. This is the case a `afkDuration >= 60` rule
      // would misread as "walked away" in a long test.
      for (let second = 1; second <= 10; second++) {
        if (second % 2 === 0) answer(engine, "3", second * 1000 - 500);
        engine.tick(second * 1000);
        expect(engine.trailingIdleSeconds()).toBeLessThanOrEqual(1);
      }
      expect(engine.afkSeconds()).toBe(4);

      // Now actually walk away.
      for (let second = 11; second <= 18; second++) engine.tick(second * 1000);
      expect(engine.trailingIdleSeconds()).toBe(8);
      expect(engine.afkSeconds()).toBe(12);

      // Coming back resets it immediately.
      answer(engine, "3", 18_500);
      engine.tick(19_000);
      expect(engine.trailingIdleSeconds()).toBe(0);
    });
  });

  describe("the task log and chart samples (ME-159, CP-113 … CP-116)", () => {
    it("logs one entry per committed task, in order", () => {
      const engine = makeEngine();
      engine.press("2", 0);
      engine.commit(1_500);
      engine.press("9", 1_600);
      engine.commit(4_000);

      const log = engine.taskLog();
      expect(log).toHaveLength(2);
      expect(log[0]).toMatchObject({
        i: 0,
        prompt: "1 + 1 =",
        expected: "2",
        given: "2",
        correct: true,
        tStart: 0,
        tEnd: 1_500,
      });
      expect(log[1]).toMatchObject({
        i: 1,
        expected: "3",
        given: "9",
        correct: false,
        tStart: 1_500,
        tEnd: 4_000,
      });
    });

    it("logs nothing for a no-op commit", () => {
      const engine = makeEngine();
      engine.press("1", 0);
      engine.commit(0);
      engine.commit(500);
      expect(engine.taskLog()).toHaveLength(1);
    });

    it("samples score, tpm and wrong once per elapsed second", () => {
      const engine = makeEngine();
      engine.press("2", 0);
      engine.commit(500);
      engine.tick(1_000);
      engine.press("9", 1_100);
      engine.commit(1_200);
      engine.tick(2_000);

      const chart = engine.chartSamples();
      expect(chart.score).toEqual([1, 0]);
      expect(chart.wrong).toEqual([0, 1]);
      expect(chart.tpm[0]).toBeCloseTo(60);
      expect(chart.tpm[1]).toBeCloseTo(60);
    });
  });

  describe("task materialisation (CP-045)", () => {
    it("keeps a deep runway ahead of the active task", () => {
      const engine = makeEngine();
      expect(engine.materialised()).toBeGreaterThanOrEqual(60);
      for (let i = 0; i < 30; i++) answer(engine, "0");
      expect(engine.materialised()).toBeGreaterThanOrEqual(
        engine.snapshot().activeIndex + 60,
      );
    });
  });

  describe("against the real generator", () => {
    it("produces a playable stream from the default settings", () => {
      const engine = createTestEngine({
        seed: 987654,
        settings: DEFAULT_MATH_SETTINGS,
        batcherFactory: createTaskBatcher,
      });
      const first = engine.viewAt(0);
      expect(first?.prompt).toMatch(/=\s*$/);
      expect(first?.expected).toBeUndefined();
      expect(engine.durationSeconds).toBe(480);
    });

    it("is reproducible from the seed — the same seed gives the same prompts (CP-089)", () => {
      const prompts = (): string[] => {
        const engine = createTestEngine({
          seed: 4242,
          settings: DEFAULT_MATH_SETTINGS,
          batcherFactory: createTaskBatcher,
        });
        return Array.from(
          { length: 25 },
          (_, i) => engine.viewAt(i)?.prompt ?? "",
        );
      };
      expect(prompts()).toEqual(prompts());
    });
  });
});
