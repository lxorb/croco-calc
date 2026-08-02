import { describe, expect, it } from "vitest";
import {
  MAX_DURATION_DRIFT_MS,
  MAX_MEDIAN_INTERVAL_FLOOR_MS,
  MAX_PLAUSIBLE_TPM,
  MAX_SUBTHRESHOLD_FRACTION,
  MIN_INTER_ANSWER_MS,
  checkPlausibility,
} from "../src/plausibility";
import { DEFAULT_MATH_SETTINGS } from "../src/settings";
import type { TaskLogEntry } from "../src/types";

const SERVER_NOW = 1_800_000_000_000;

/** A log of `n` tasks with a constant inter-answer interval. */
function evenLog(n: number, intervalMs: number): TaskLogEntry[] {
  return Array.from({ length: n }, (_, i) => ({
    i,
    kind: "add" as const,
    prompt: `${i} + 1 =`,
    expected: String(i + 1),
    given: String(i + 1),
    correct: true,
    tStart: i * intervalMs,
    tEnd: (i + 1) * intervalMs,
  }));
}

function check(
  overrides: Partial<Parameters<typeof checkPlausibility>[0]> = {},
): ReturnType<typeof checkPlausibility> {
  return checkPlausibility({
    taskLog: evenLog(480, 1000),
    testDuration: 480,
    timestamp: SERVER_NOW - 1000,
    serverNow: SERVER_NOW,
    settings: DEFAULT_MATH_SETTINGS,
    ...overrides,
  });
}

function codes(result: ReturnType<typeof checkPlausibility>): string[] {
  return result.violations.map((v) => v.code);
}

describe("thresholds are exported as named constants (ME-179 … ME-182)", () => {
  it("has the specified values", () => {
    expect(MAX_PLAUSIBLE_TPM).toBe(120);
    expect(MIN_INTER_ANSWER_MS).toBe(150);
    expect(MAX_SUBTHRESHOLD_FRACTION).toBe(0.05);
    expect(MAX_MEDIAN_INTERVAL_FLOOR_MS).toBe(300);
    expect(MAX_DURATION_DRIFT_MS).toBe(2000);
  });
});

describe("ME-183: a legitimate fast run passes every check", () => {
  it("tpm = 60, all deltas >= 400 ms, testDuration = 480, timestamp = now - 1000", () => {
    const result = check();
    expect(result.violations).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.tpm).toBe(60);
  });

  it("a slow, error-strewn run also passes", () => {
    const taskLog = evenLog(40, 3000).map((entry, i) => ({
      ...entry,
      correct: i % 3 === 0,
    }));
    expect(check({ taskLog }).ok).toBe(true);
  });

  it("ME-183: accuracy is never read — a 0 %-accurate run is still plausible", () => {
    const taskLog = evenLog(480, 1000).map((entry) => ({
      ...entry,
      correct: false,
    }));
    expect(check({ taskLog }).ok).toBe(true);
  });
});

describe("ME-179: tasks-per-minute ceiling", () => {
  it("passes a synthetic log at 60 tpm", () => {
    expect(check({ taskLog: evenLog(480, 1000) }).ok).toBe(true);
  });

  it("rejects one at 121 tpm and logs the offending value", () => {
    // 968 tasks over 480 s = 121 tpm; spaced evenly so only ME-179 fires
    const result = check({ taskLog: evenLog(968, 495) });
    expect(codes(result)).toContain("tpm-too-high");
    const violation = result.violations.find((v) => v.code === "tpm-too-high");
    expect(violation?.value).toBe(121);
    expect(violation?.message).toContain("121");
  });

  it("accepts exactly 120 tpm", () => {
    expect(check({ taskLog: evenLog(960, 500) }).ok).toBe(true);
  });
});

describe("ME-180: minimum inter-answer interval", () => {
  it("does NOT reject a single sub-threshold interval", () => {
    const taskLog = evenLog(100, 1000);
    // collapse one gap to 50 ms without touching the rest
    (taskLog[50] as TaskLogEntry).tEnd =
      (taskLog[49] as TaskLogEntry).tEnd + 50;
    expect(codes(check({ taskLog }))).not.toContain("inter-answer-too-fast");
  });

  it("does NOT reject two sub-threshold intervals out of 100 (2 % < 5 %)", () => {
    const taskLog = evenLog(100, 1000);
    (taskLog[50] as TaskLogEntry).tEnd =
      (taskLog[49] as TaskLogEntry).tEnd + 50;
    (taskLog[70] as TaskLogEntry).tEnd =
      (taskLog[69] as TaskLogEntry).tEnd + 50;
    expect(codes(check({ taskLog }))).not.toContain("inter-answer-too-fast");
  });

  it("rejects when more than 5 % are sub-threshold and at least 2 exist", () => {
    const taskLog = evenLog(100, 1000);
    for (let i = 40; i < 50; i++) {
      (taskLog[i] as TaskLogEntry).tEnd =
        (taskLog[i - 1] as TaskLogEntry).tEnd + 50;
    }
    const result = check({ taskLog });
    const violation = result.violations.find(
      (v) => v.code === "inter-answer-too-fast",
    );
    expect(violation).toBeDefined();
    expect(violation?.value).toBe(10);
    expect(violation?.message).toContain("150");
  });

  it("never rejects on a single sub-threshold interval even in a 2-task log", () => {
    const taskLog = evenLog(2, 1000);
    (taskLog[1] as TaskLogEntry).tEnd = (taskLog[0] as TaskLogEntry).tEnd + 10;
    expect(codes(check({ taskLog }))).not.toContain("inter-answer-too-fast");
  });

  it("counts the first interval from tEnd = 0", () => {
    const taskLog = evenLog(4, 1000);
    // first task committed 20 ms in, plus three more fast ones
    (taskLog[0] as TaskLogEntry).tEnd = 20;
    (taskLog[1] as TaskLogEntry).tEnd = 40;
    (taskLog[2] as TaskLogEntry).tEnd = 60;
    (taskLog[3] as TaskLogEntry).tEnd = 80;
    const violation = check({ taskLog }).violations.find(
      (v) => v.code === "inter-answer-too-fast",
    );
    expect(violation?.value).toBe(4);
  });
});

describe("ME-181: median interval floor", () => {
  it("rejects a uniformly fast forged log that ME-180's 5 % band lets through", () => {
    // every interval is 250 ms: none is below 150 ms, so ME-180 stays silent
    const taskLog = evenLog(40, 250);
    const result = check({ taskLog, testDuration: 480 });
    expect(codes(result)).not.toContain("inter-answer-too-fast");
    const violation = result.violations.find(
      (v) => v.code === "median-interval-too-low",
    );
    expect(violation).toBeDefined();
    expect(violation?.value).toBe(250);
  });

  it("does not run below 10 committed tasks", () => {
    const taskLog = evenLog(9, 100);
    expect(codes(check({ taskLog }))).not.toContain("median-interval-too-low");
  });

  it("runs at exactly 10 committed tasks", () => {
    const taskLog = evenLog(10, 200);
    expect(codes(check({ taskLog }))).toContain("median-interval-too-low");
  });

  it("accepts a median of exactly 300 ms", () => {
    const taskLog = evenLog(40, 300);
    expect(codes(check({ taskLog }))).not.toContain("median-interval-too-low");
  });
});

describe("ME-182: duration and timestamp agreement", () => {
  it("(a) rejects any testDuration that is not time * 60", () => {
    const result = check({ testDuration: 479 });
    const violation = result.violations.find(
      (v) => v.code === "duration-mismatch",
    );
    expect(violation).toBeDefined();
    expect(violation?.value).toBe(479);
  });

  it("(a) accepts each of the four legal durations", () => {
    for (const time of [1, 2, 4, 8] as const) {
      const seconds = time * 60;
      const result = check({
        settings: { ...DEFAULT_MATH_SETTINGS, time },
        testDuration: seconds,
        taskLog: evenLog(time * 60, 1000),
      });
      expect(codes(result)).not.toContain("duration-mismatch");
    }
  });

  it("(b) rejects a last tEnd beyond testDuration + 2000 ms", () => {
    const taskLog = evenLog(480, 1000);
    (taskLog[479] as TaskLogEntry).tEnd = 480 * 1000 + 2001;
    const violation = check({ taskLog }).violations.find(
      (v) => v.code === "log-overruns-duration",
    );
    expect(violation).toBeDefined();
    expect(violation?.value).toBe(482001);
  });

  it("(b) tolerates drift up to exactly 2000 ms", () => {
    const taskLog = evenLog(480, 1000);
    (taskLog[479] as TaskLogEntry).tEnd = 480 * 1000 + 2000;
    expect(codes(check({ taskLog }))).not.toContain("log-overruns-duration");
  });

  it("(b) rejects a negative first tStart", () => {
    const taskLog = evenLog(480, 1000);
    (taskLog[0] as TaskLogEntry).tStart = -1;
    expect(codes(check({ taskLog }))).toContain("negative-start");
  });

  it("(c) rejects a timestamp more than 60 s in the future", () => {
    const violation = check({ timestamp: SERVER_NOW + 60001 }).violations.find(
      (v) => v.code === "timestamp-out-of-window",
    );
    expect(violation).toBeDefined();
    expect(violation?.value).toBe(SERVER_NOW + 60001);
  });

  it("(c) accepts a timestamp up to 60 s in the future", () => {
    expect(codes(check({ timestamp: SERVER_NOW + 60000 }))).not.toContain(
      "timestamp-out-of-window",
    );
  });

  it("(c) rejects a timestamp older than duration + 5 minutes", () => {
    const floor = SERVER_NOW - 480 * 1000 - 300_000;
    expect(codes(check({ timestamp: floor - 1 }))).toContain(
      "timestamp-out-of-window",
    );
    expect(codes(check({ timestamp: floor }))).not.toContain(
      "timestamp-out-of-window",
    );
  });
});

describe("violation reporting (ME-179 … ME-182 logging requirement)", () => {
  it("every violation carries a code, a message and the offending value", () => {
    const result = check({
      taskLog: evenLog(968, 200),
      testDuration: 479,
      timestamp: SERVER_NOW + 999999,
    });
    expect(result.ok).toBe(false);
    expect(result.violations.length).toBeGreaterThan(1);
    for (const violation of result.violations) {
      expect(typeof violation.code).toBe("string");
      expect(violation.message.length).toBeGreaterThan(0);
      expect(Number.isFinite(violation.value)).toBe(true);
      expect(violation.message).toContain(String(violation.value));
    }
  });

  it("an empty task log is inert rather than a crash", () => {
    const result = check({ taskLog: [] });
    expect(() => checkPlausibility).not.toThrow();
    expect(result.tpm).toBe(0);
    expect(codes(result)).not.toContain("median-interval-too-low");
    expect(codes(result)).not.toContain("inter-answer-too-fast");
  });
});
