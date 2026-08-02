/**
 * The published API surface. WP-05 (settings bar), WP-06 (test page), WP-07
 * (results) and WP-10 (backend anti-cheat) all consume this package through
 * `src/index.ts`, so a missing export is a cross-package break.
 *
 * §6 WP-02 names five interfaces that MUST be published before WP-05/WP-06
 * start: `generateTask`, the batching helper, `isAnswerCorrect`, `MathGenError`,
 * the mulberry32 PRNG (ME-167) and the golden-vector fixture (ME-178).
 */
import { describe, expect, it } from "vitest";
import * as api from "../src/index";

/**
 * A plain record view of the module namespace. Computed access on a namespace
 * object cannot be statically validated, so the export lists below index this
 * copy instead.
 */
const surface: Record<string, unknown> = { ...api };

describe("the five interfaces WP-05/WP-06 depend on", () => {
  it("publishes generateTask and the batching helpers", () => {
    expect(typeof api.generateTask).toBe("function");
    expect(typeof api.generateTasks).toBe("function");
    expect(typeof api.generateSequence).toBe("function");
    expect(typeof api.createTaskBatcher).toBe("function");
  });

  /**
   * ME-008 names the entry point `generateTask(seed, index, settings)`. A
   * consumer that types out exactly that signature must get exactly the task at
   * that index of the canonical sequence — no optional fourth argument whose
   * omission silently yields a different task the backend would then reject
   * (ME-174).
   */
  it("generateTask takes exactly (seed, index, settings)", () => {
    expect(api.generateTask.length).toBe(3);
    expect(api.generateTasks.length).toBe(4);
    expect(api.generateSequence.length).toBe(3);
  });

  it("publishes isAnswerCorrect", () => {
    expect(typeof api.isAnswerCorrect).toBe("function");
    expect(typeof api.commitAnswer).toBe("function");
  });

  it("publishes MathGenError", () => {
    expect(typeof api.MathGenError).toBe("function");
    const error = new api.MathGenError("no-enabled-generators", "boom");
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(api.MathGenError);
    expect(error.name).toBe("MathGenError");
    expect(error.code).toBe("no-enabled-generators");
  });

  it("publishes the mulberry32 PRNG", () => {
    expect(typeof api.createPrng).toBe("function");
    expect(typeof api.deriveTaskSeed).toBe("function");
    expect(typeof api.mulberry32Raw).toBe("function");
  });

  it("publishes the golden-vector fixture", () => {
    expect(Array.isArray(api.GOLDEN_VECTORS)).toBe(true);
    expect(api.GOLDEN_VECTORS.length).toBeGreaterThanOrEqual(10);
    expect(api.verifyGoldenVectors()).toEqual([]);
  });

  /**
   * ME-178 / DoD-18 — the fixture has to execute under the frontend *and* the
   * backend vitest projects. Those projects belong to WP-06/WP-10, so this
   * package ships the suite runner-agnostically and each side registers it.
   */
  it("publishes a runner-agnostic golden-vector suite for both projects", () => {
    expect(typeof api.runGoldenVectorSuite).toBe("function");

    const registered: string[] = [];
    const bodies: (() => void)[] = [];
    api.runGoldenVectorSuite({
      describe: (_name, body) => body(),
      it: (name, body) => {
        registered.push(name);
        bodies.push(body);
      },
    });

    expect(registered.length).toBe(api.GOLDEN_VECTORS.length + 2);
    for (const vector of api.GOLDEN_VECTORS) {
      expect(registered).toContain(`reproduces ${vector.id}`);
    }
    for (const body of bodies) expect(() => body()).not.toThrow();
  });
});

describe("the surfaces the other work packages need", () => {
  it("publishes the settings model and guards for WP-05", () => {
    for (const name of [
      "DEFAULT_MATH_SETTINGS",
      "MATH_SETTING_VALUES",
      "SETTING_KEYS",
      "GENERATOR_KEYS",
      "TIME_VALUES",
      "applyCoupling",
      "cycleSetting",
      "nextSettingValue",
      "wouldBeAllOff",
      "enabledGeneratorCount",
      "getEnabledKinds",
    ] as const) {
      expect(surface[name], name).toBeDefined();
    }
  });

  it("publishes the input filter and judging surface for WP-06", () => {
    for (const name of [
      "ANSWER_MAX_LENGTH",
      "appendAnswerChar",
      "normalizeAnswerChar",
      "normalizeAnswerInput",
      "normalizeForCommit",
      "isCommitNoop",
      "parseAnswer",
      "judgeAnswer",
    ] as const) {
      expect(surface[name], name).toBeDefined();
    }
  });

  it("publishes the metrics for WP-07", () => {
    expect(typeof api.computeMetrics).toBe("function");
    expect(typeof api.consistencyOf).toBe("function");
  });

  it("publishes the anti-cheat surface for WP-10", () => {
    for (const name of [
      "checkPlausibility",
      "revalidateResult",
      "serializeTaskLog",
      "sampleIndices",
      "checkEngineVersion",
      "MATH_ENGINE_VERSION",
      "MAX_PLAUSIBLE_TPM",
      "MIN_INTER_ANSWER_MS",
      "MAX_SUBTHRESHOLD_FRACTION",
      "MAX_MEDIAN_INTERVAL_FLOOR_MS",
      "MAX_DURATION_DRIFT_MS",
      "TASK_LOG_TOOLONG",
    ] as const) {
      expect(surface[name], name).toBeDefined();
    }
  });

  it("publishes the rendering constants so no consumer hard-codes a glyph", () => {
    expect(api.OPERATOR_ADD).toBe("+");
    expect(api.OPERATOR_MUL).toBe("×");
    expect(api.OPERATOR_DIV).toBe("÷");
    expect(api.MINUS).toBe("−");
  });

  it("exports no identifier named `net` (C40)", () => {
    expect(Object.keys(surface)).not.toContain("net");
    expect(
      Object.keys(surface).filter((key) => /^net$|[^a-z]net[^a-z]/i.test(key)),
    ).toEqual([]);
  });

  it("exports no typing-domain identifier (CP-178, ME-164)", () => {
    const banned =
      /wpm|charStats|keyConsistency|burst|funbox|quote|language|layout|keymap|difficulty|lazyMode/i;
    expect(Object.keys(surface).filter((key) => banned.test(key))).toEqual([]);
  });
});
