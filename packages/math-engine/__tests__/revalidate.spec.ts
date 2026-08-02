import { describe, expect, it } from "vitest";
import {
  TASK_LOG_MAX_ENTRIES,
  TASK_LOG_SAMPLE_SIZE,
  TASK_LOG_TOOLONG,
  revalidateResult,
  sampleIndices,
  serializeTaskLog,
} from "../src/revalidate";
import { MAX_PLAUSIBLE_TPM } from "../src/plausibility";
import { generateSequence } from "../src/generate";
import { DEFAULT_MATH_SETTINGS } from "../src/settings";
import {
  MATH_ENGINE_VERSION,
  PREVIOUS_MATH_ENGINE_VERSION,
  SUPPORTED_ENGINE_VERSIONS,
  checkEngineVersion,
} from "../src/version";
import type { TaskLogEntry } from "../src/types";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SEED = 0x0badf00d;

/** An honest log for the first `n` tasks of the canonical sequence. */
function honestLog(n: number, wrongEvery = 4): TaskLogEntry[] {
  return generateSequence(SEED, DEFAULT_MATH_SETTINGS, n).map((task, i) => {
    const cheat = i % wrongEvery === 0;
    return {
      i,
      kind: task.kind,
      prompt: task.prompt,
      expected: task.answerDisplay,
      given: cheat ? "999999" : task.answerDisplay.replace("−", "-"),
      correct: !cheat,
      tStart: i * 1000,
      tEnd: (i + 1) * 1000,
    };
  });
}

describe("engine version (ME-177, ME-184)", () => {
  it("MATH_ENGINE_VERSION matches package.json", () => {
    const path = fileURLToPath(new URL("../package.json", import.meta.url));
    const pkg = JSON.parse(readFileSync(path, "utf8")) as { version: string };
    expect(MATH_ENGINE_VERSION).toBe(pkg.version);
  });

  it("accepts current and, during a rollout, current - 1", () => {
    expect(checkEngineVersion(MATH_ENGINE_VERSION)).toBe("current");
    expect(checkEngineVersion("0.0.1")).toBe("unsupported");
    expect(SUPPORTED_ENGINE_VERSIONS).toContain(MATH_ENGINE_VERSION);
    expect(SUPPORTED_ENGINE_VERSIONS.length).toBe(
      PREVIOUS_MATH_ENGINE_VERSION === null ? 1 : 2,
    );
  });

  it("rejects an unreproducible version with its own code, not 'result invalid'", () => {
    const result = revalidateResult({
      mathSeed: SEED,
      mathSettings: DEFAULT_MATH_SETTINGS,
      taskLog: honestLog(10),
      engineVersion: "0.9.0",
    });
    expect(result.ok).toBe(false);
    expect(result.failures[0]?.code).toBe("engine-version-unsupported");
  });
});

describe("full revalidation (ME-174)", () => {
  it("accepts an honest log", () => {
    const result = revalidateResult({
      mathSeed: SEED,
      mathSettings: DEFAULT_MATH_SETTINGS,
      taskLog: honestLog(200),
      engineVersion: MATH_ENGINE_VERSION,
    });
    expect(result.failures).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.checked).toBe(200);
    expect(result.sampled).toBe(false);
  });

  it("E40: rejects a log that does not match (seed, settings)", () => {
    const log = honestLog(50);
    const result = revalidateResult({
      mathSeed: SEED + 1,
      mathSettings: DEFAULT_MATH_SETTINGS,
      taskLog: log,
      engineVersion: MATH_ENGINE_VERSION,
    });
    expect(result.ok).toBe(false);
    expect(result.failures.length).toBeGreaterThan(0);
  });

  it("rejects a tampered prompt", () => {
    const log = honestLog(20);
    (log[7] as TaskLogEntry).prompt = "2 + 2 =";
    const result = revalidateResult({
      mathSeed: SEED,
      mathSettings: DEFAULT_MATH_SETTINGS,
      taskLog: log,
      engineVersion: MATH_ENGINE_VERSION,
    });
    expect(result.failures.map((f) => f.code)).toContain("prompt-mismatch");
    expect(
      result.failures.find((f) => f.code === "prompt-mismatch")?.index,
    ).toBe(7);
  });

  it("rejects a tampered expected answer", () => {
    const log = honestLog(20);
    (log[3] as TaskLogEntry).expected = "1234";
    const result = revalidateResult({
      mathSeed: SEED,
      mathSettings: DEFAULT_MATH_SETTINGS,
      taskLog: log,
      engineVersion: MATH_ENGINE_VERSION,
    });
    expect(result.failures.map((f) => f.code)).toContain("answer-mismatch");
  });

  it("rejects a flipped correct flag", () => {
    const log = honestLog(20);
    const entry = log.find((e) => !e.correct) as TaskLogEntry;
    entry.correct = true;
    const result = revalidateResult({
      mathSeed: SEED,
      mathSettings: DEFAULT_MATH_SETTINGS,
      taskLog: log,
      engineVersion: MATH_ENGINE_VERSION,
    });
    expect(result.failures.map((f) => f.code)).toContain("judgement-mismatch");
  });

  it("rejects reordered entries", () => {
    const log = honestLog(20);
    (log[5] as TaskLogEntry).i = 6;
    const result = revalidateResult({
      mathSeed: SEED,
      mathSettings: DEFAULT_MATH_SETTINGS,
      taskLog: log,
      engineVersion: MATH_ENGINE_VERSION,
    });
    expect(result.failures.map((f) => f.code)).toContain("index-mismatch");
  });

  it("rejects a settings snapshot that cannot generate anything", () => {
    const result = revalidateResult({
      mathSeed: SEED,
      mathSettings: {
        ...DEFAULT_MATH_SETTINGS,
        addition: "off",
        multiplication: "off",
        division: "off",
        fractionAddition: "off",
        fractionMultiplication: false,
      },
      taskLog: honestLog(5),
      engineVersion: MATH_ENGINE_VERSION,
    });
    expect(result.ok).toBe(false);
    expect(result.failures[0]?.code).toBe("regeneration-failed");
  });

  it("accepts an empty log", () => {
    const result = revalidateResult({
      mathSeed: SEED,
      mathSettings: DEFAULT_MATH_SETTINGS,
      taskLog: [],
      engineVersion: MATH_ENGINE_VERSION,
    });
    expect(result.ok).toBe(true);
    expect(result.checked).toBe(0);
  });
});

describe("'toolong' degradation (ME-176)", () => {
  it("replaces a log of more than 1000 entries with the literal string", () => {
    expect(TASK_LOG_MAX_ENTRIES).toBe(1000);
    expect(serializeTaskLog(honestLog(10))).toHaveLength(10);
    const template = honestLog(1)[0] as TaskLogEntry;
    const long = Array.from({ length: 1001 }, (_, index) => ({
      ...template,
      i: index,
    }));
    expect(serializeTaskLog(long)).toBe(TASK_LOG_TOOLONG);
  });

  it("is unreachable for any plausible result: 120 tpm x 8 min = 960 < 1000", () => {
    expect(MAX_PLAUSIBLE_TPM * 8).toBe(960);
    expect(MAX_PLAUSIBLE_TPM * 8).toBeLessThan(TASK_LOG_MAX_ENTRIES);
  });

  it("samples 50 deterministic, evenly spaced indices", () => {
    expect(TASK_LOG_SAMPLE_SIZE).toBe(50);
    const indices = sampleIndices(1200);
    expect(indices).toHaveLength(50);
    expect(indices[0]).toBe(0);
    expect(indices[49]).toBe(1176);
    expect(sampleIndices(1200)).toEqual(indices); // deterministic
    expect(new Set(indices).size).toBe(50);
    expect(sampleIndices(10)).toHaveLength(10);
    expect(sampleIndices(0)).toEqual([]);
  });

  it("falls back to regenerating the sampled indices", () => {
    const result = revalidateResult({
      mathSeed: SEED,
      mathSettings: DEFAULT_MATH_SETTINGS,
      taskLog: TASK_LOG_TOOLONG,
      engineVersion: MATH_ENGINE_VERSION,
      committedCount: 1200,
    });
    expect(result.sampled).toBe(true);
    expect(result.checked).toBe(50);
    expect(result.ok).toBe(true);
  });

  it("still rejects a seed/settings pair that cannot regenerate", () => {
    const result = revalidateResult({
      mathSeed: SEED,
      mathSettings: {
        ...DEFAULT_MATH_SETTINGS,
        addition: "off",
        multiplication: "off",
        division: "off",
        fractionAddition: "off",
        fractionMultiplication: false,
      },
      taskLog: TASK_LOG_TOOLONG,
      engineVersion: MATH_ENGINE_VERSION,
      committedCount: 1200,
    });
    expect(result.ok).toBe(false);
    expect(result.failures[0]?.code).toBe("regeneration-failed");
  });
});
