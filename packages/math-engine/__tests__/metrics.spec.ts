import { describe, expect, it } from "vitest";
import { computeMetrics, kogasa, roundTo2 } from "../src/metrics";
import type { TaskLogEntry } from "../src/types";

function entry(
  i: number,
  correct: boolean,
  tStart: number,
  tEnd: number,
): TaskLogEntry {
  return {
    i,
    kind: "add",
    prompt: `${i} + 1 =`,
    expected: String(i + 1),
    given: correct ? String(i + 1) : "0",
    correct,
    tStart,
    tEnd,
  };
}

/** `n` entries, `correctCount` of them correct, each taking `spacing` ms. */
function log(n: number, correctCount: number, spacing = 1000): TaskLogEntry[] {
  return Array.from({ length: n }, (_, i) =>
    entry(i, i < correctCount, i * spacing, (i + 1) * spacing),
  );
}

describe("helpers transcribed from packages/util/src/numbers.ts", () => {
  it("roundTo2 matches the monkeytype implementation", () => {
    expect(roundTo2(1.005)).toBe(1.01);
    expect(roundTo2(66.66666)).toBe(66.67);
    expect(roundTo2(100)).toBe(100);
    expect(roundTo2(0)).toBe(0);
  });

  it("kogasa matches the monkeytype implementation", () => {
    const reference = (cov: number): number =>
      100 * (1 - Math.tanh(cov + cov ** 3 / 3 + cov ** 5 / 5));
    for (const cov of [0, 0.1, 0.25, 0.5, 1, 2]) {
      expect(kogasa(cov)).toBe(reference(cov));
    }
    expect(kogasa(0)).toBe(100);
  });
});

describe("result metrics (ME-160 … ME-165, C40, AC-001 … AC-006)", () => {
  it("ME-160: correct and wrong are the task-log counts", () => {
    const metrics = computeMetrics(log(10, 7), 480);
    expect(metrics.correct).toBe(7);
    expect(metrics.wrong).toBe(3);
  });

  it("C40 / ME-161: the headline metric is named `score` and is correct - wrong", () => {
    expect(computeMetrics(log(10, 7), 480).score).toBe(4);
    expect(computeMetrics(log(10, 3), 480).score).toBe(-4);
    expect(Object.keys(computeMetrics(log(1, 1), 60))).not.toContain("net");
  });

  it("ME-162 / AC-004: acc is correct/(correct+wrong)*100 to two decimals", () => {
    expect(computeMetrics(log(10, 7), 480).acc).toBe(70);
    expect(computeMetrics(log(3, 1), 480).acc).toBe(33.33);
    expect(computeMetrics(log(3, 2), 480).acc).toBe(66.67);
  });

  it("ME-163 / AC-005: tpm counts responses, wrong ones included", () => {
    // 480 responses over 480 s = 60 tpm
    expect(computeMetrics(log(480, 100), 480).tpm).toBe(60);
    expect(computeMetrics(log(60, 60), 60).tpm).toBe(60);
    expect(computeMetrics(log(30, 0), 60).tpm).toBe(30);
  });

  it("AC-006: spm is score per minute", () => {
    expect(computeMetrics(log(60, 60), 60).spm).toBe(60);
    expect(computeMetrics(log(60, 30), 60).spm).toBe(0);
    expect(computeMetrics(log(60, 0), 60).spm).toBe(-60);
  });

  it("E32 / C6: zero committed tasks gives 0s and never divides by zero", () => {
    const metrics = computeMetrics([], 480);
    expect(metrics).toMatchObject({
      correct: 0,
      wrong: 0,
      score: 0,
      acc: 0,
      tpm: 0,
      spm: 0,
    });
    expect(Number.isFinite(metrics.consistency)).toBe(true);
  });

  it("a zero test duration does not produce Infinity or NaN", () => {
    const metrics = computeMetrics(log(5, 5), 0);
    expect(metrics.tpm).toBe(0);
    expect(metrics.spm).toBe(0);
  });

  it("ME-165 / C5: consistency is kogasa over per-task response times", () => {
    // perfectly even timing -> CV = 0 -> kogasa(0) = 100
    const even = log(10, 10, 1000);
    expect(computeMetrics(even, 480).consistency).toBe(100);

    // uneven timing lowers it
    const uneven: TaskLogEntry[] = [
      entry(0, true, 0, 100),
      entry(1, true, 100, 3100),
      entry(2, true, 3100, 3300),
      entry(3, true, 3300, 8300),
    ];
    const value = computeMetrics(uneven, 480).consistency;
    expect(value).toBeLessThan(100);
    expect(value).toBeGreaterThanOrEqual(0);
  });

  it("CP-107 / C5: fewer than 2 answered tasks yields 0 (displayed as '-')", () => {
    expect(computeMetrics([], 480).consistency).toBe(0);
    expect(computeMetrics(log(1, 1), 480).consistency).toBe(0);
  });

  it("ME-164: no wpm, rawWpm, charStats, keyConsistency or burst fields exist", () => {
    const metrics = computeMetrics(log(10, 7), 480);
    expect(Object.keys(metrics).sort()).toEqual([
      "acc",
      "consistency",
      "correct",
      "score",
      "spm",
      "tpm",
      "wrong",
    ]);
  });
});
