import { describe, expect, it } from "vitest";
import {
  ANTICHEAT_STATUS,
  validateResult,
  type ValidateResultInput,
} from "../../src/anticheat";
import {
  DEFAULT_MATH_SETTINGS,
  MATH_ENGINE_VERSION,
  MAX_PLAUSIBLE_TPM,
  MIN_INTER_ANSWER_MS,
  MAX_MEDIAN_INTERVAL_FLOOR_MS,
  TASK_LOG_TOOLONG,
  generateSequence,
  type MathSettings,
  type TaskLogEntry,
} from "@croco-calc/math-engine";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * DoD-04a, behaviourally.
 *
 * monkeytype shipped a stub here whose validators unconditionally returned
 * `true`. DoD-04a deliberately asserts the replacement by behaviour rather than
 * by path: `backend/src/anticheat/` must export a real implementation of
 * ME-179 … ME-183 **whose `validateResult` can return `false`**. A stub passes
 * every "accepts an honest run" test ever written, so the load-bearing
 * assertions in this file are the rejections.
 *
 * `packages/math-engine/__tests__/revalidate.spec.ts` and `plausibility.spec.ts`
 * cover the library. This file covers the three things that exist only in the
 * backend wrapper and nowhere else:
 *
 *  1. **ME-184 ordering** — the engine-version gate runs *before* regeneration,
 *     and carries its own status 468 so a user on a stale bundle is told to
 *     reload instead of being accused of forgery.
 *  2. The 467 mapping and the ten-entry failure cap on the log payload.
 *  3. ME-176's `"toolong"` degraded branch, which recomputes tpm from
 *     `input.answered` because the entries themselves are gone.
 */

const SEED = 0x0badf00d;
const SETTINGS: MathSettings = DEFAULT_MATH_SETTINGS;
/** ME-182(a) — `testDuration` MUST equal `settings.time * 60` exactly. */
const DURATION = SETTINGS.time * 60;
const SERVER_NOW = 1_800_000_000_000;

/**
 * An honest log: every prompt, expected answer and verdict reproduces from
 * `(SEED, SETTINGS)`, and the pacing is a comfortable `stepMs` per task.
 */
function honestLog(n: number, stepMs = 1000): TaskLogEntry[] {
  return generateSequence(SEED, SETTINGS, n).map((task, i) => ({
    i,
    kind: task.kind,
    prompt: task.prompt,
    expected: task.answerDisplay,
    given: task.answerDisplay.replace("−", "-"),
    correct: true,
    tStart: i * stepMs,
    tEnd: i * stepMs + stepMs - 1,
  }));
}

function input(over: Partial<ValidateResultInput> = {}): ValidateResultInput {
  const taskLog = over.taskLog ?? honestLog(60);
  return {
    mathSeed: SEED,
    mathSettings: SETTINGS,
    engineVersion: MATH_ENGINE_VERSION,
    taskLog,
    testDuration: DURATION,
    timestamp: SERVER_NOW - 1000,
    answered: taskLog === TASK_LOG_TOOLONG ? 0 : taskLog.length,
    serverNow: SERVER_NOW,
    ...over,
  };
}

describe("DoD-04a — the stub is gone", () => {
  it("accepts an honest run", () => {
    expect(validateResult(input())).toEqual({ valid: true });
  });

  it("validateResult can return false", () => {
    const forged = honestLog(60);
    // A single tampered prompt is enough: ME-174 regenerates the whole test.
    forged[7] = { ...(forged[7] as TaskLogEntry), prompt: "1 + 1" };
    const verdict = validateResult(input({ taskLog: forged }));
    expect(verdict.valid).toBe(false);
  });

  it("does not read acc — the input type has no such field", () => {
    // ME-183, and the standing lesson of BL-5. Compile-time proof plus a
    // source-level one, because a future edit could add the field back.
    const keys = Object.keys(input());
    expect(keys).not.toContain("acc");
    expect(keys).not.toContain("accuracy");

    // vitest's cwd is `backend/`, so this is the module under test.
    const source = readFileSync(
      resolve(process.cwd(), "src/anticheat/index.ts"),
      "utf8",
    );
    // The only permitted occurrence is the doc comment explaining the ban.
    const codeLines = source
      .split("\n")
      .filter((l) => !/^\s*(\*|\/\*|\/\/)/.test(l));
    expect(codeLines.join("\n")).not.toMatch(/\bacc\b/);
  });
});

describe("ME-184 — the engine-version gate", () => {
  it("rejects an unsupported version with status 468, not 467", () => {
    const verdict = validateResult(input({ engineVersion: "0.0.1" }));
    expect(verdict.valid).toBe(false);
    if (verdict.valid) return;
    expect(verdict.failure.code).toBe("engine-version-unsupported");
    expect(verdict.failure.status).toBe(
      ANTICHEAT_STATUS.ENGINE_VERSION_UNSUPPORTED,
    );
    expect(verdict.failure.status).toBe(468);
    expect(verdict.failure.status).not.toBe(ANTICHEAT_STATUS.TASK_LOG_INVALID);
  });

  it("tells the user to reload rather than calling the result invalid", () => {
    const verdict = validateResult(input({ engineVersion: "0.0.1" }));
    if (verdict.valid) throw new Error("expected a rejection");
    expect(verdict.failure.message).toMatch(/refresh/i);
    expect(verdict.failure.message).not.toMatch(/doesn't make sense/i);
    expect(verdict.failure.details).toEqual({ engineVersion: "0.0.1" });
  });

  /**
   * The ordering assertion. A log that is *both* forged and generated by an
   * unsupported engine must report the version, because the honest reading of
   * that state is "this user's bundle is stale", and accusing them of forgery
   * would also spend an auto-ban strike (`result.ts` only counts
   * `task-log-invalid`).
   */
  it("runs before regeneration, so a stale client is never accused of forgery", () => {
    const forged = honestLog(60);
    forged[3] = { ...(forged[3] as TaskLogEntry), expected: "0" };
    const verdict = validateResult(
      input({ taskLog: forged, engineVersion: "0.0.1" }),
    );
    if (verdict.valid) throw new Error("expected a rejection");
    expect(verdict.failure.code).toBe("engine-version-unsupported");
  });

  it("runs before plausibility too", () => {
    const verdict = validateResult(
      input({ taskLog: honestLog(60, 10), engineVersion: "0.0.1" }),
    );
    if (verdict.valid) throw new Error("expected a rejection");
    expect(verdict.failure.code).toBe("engine-version-unsupported");
  });
});

describe("ME-174 — regeneration failures map to 467", () => {
  it.each([
    ["prompt", { prompt: "2 + 2" }],
    ["expected answer", { expected: "424242" }],
    ["verdict", { correct: false }],
    ["index", { i: 900 }],
  ])("rejects a tampered %s", (_label, patch) => {
    const forged = honestLog(60);
    forged[11] = { ...(forged[11] as TaskLogEntry), ...patch };
    const verdict = validateResult(input({ taskLog: forged }));
    if (verdict.valid) throw new Error("expected a rejection");
    expect(verdict.failure.code).toBe("task-log-invalid");
    expect(verdict.failure.status).toBe(ANTICHEAT_STATUS.TASK_LOG_INVALID);
    expect(verdict.failure.status).toBe(467);
  });

  it("rejects a log generated from a different seed", () => {
    const verdict = validateResult(input({ mathSeed: SEED + 1 }));
    expect(verdict.valid).toBe(false);
  });

  it("rejects a log generated under different settings", () => {
    const verdict = validateResult(
      input({ mathSettings: { ...SETTINGS, decimals: false } }),
    );
    expect(verdict.valid).toBe(false);
  });

  it("caps the logged failure list at ten entries but reports the true count", () => {
    // Forge every entry: the log document has to stay readable while still
    // recording how bad it actually was.
    const forged = honestLog(60).map((e) => ({ ...e, prompt: "1 + 1" }));
    const verdict = validateResult(input({ taskLog: forged }));
    if (verdict.valid) throw new Error("expected a rejection");
    const details = verdict.failure.details as {
      failures: unknown[];
      failureCount: number;
      checked: number;
      sampled: boolean;
    };
    expect(details.failures.length).toBeLessThanOrEqual(10);
    expect(details.failureCount).toBeGreaterThan(10);
    expect(details.failureCount).toBeGreaterThan(details.failures.length);
    expect(details.checked).toBe(60);
    expect(details.sampled).toBe(false);
  });
});

describe("ME-179 … ME-182 — plausibility failures map to 467", () => {
  it("ME-183 — a legitimate fast run is accepted", () => {
    // tpm = 60, every interval 1000 ms, testDuration = 480, timestamp fresh.
    const verdict = validateResult(input({ taskLog: honestLog(480, 1000) }));
    expect(verdict).toEqual({ valid: true });
  });

  it("ME-179 — rejects a log above the tpm ceiling", () => {
    // 121 tpm over 8 minutes = 968 answers, paced fast enough to clear ME-180.
    const verdict = validateResult(input({ taskLog: honestLog(968, 400) }));
    if (verdict.valid) throw new Error("expected a rejection");
    expect(verdict.failure.code).toBe("implausible");
    expect(verdict.failure.status).toBe(ANTICHEAT_STATUS.TASK_LOG_INVALID);
    const { violations } = verdict.failure.details as {
      violations: { code: string; value: number }[];
    };
    expect(violations.map((v) => v.code)).toContain("tpm-too-high");
    expect(violations[0]?.value).toBeGreaterThan(MAX_PLAUSIBLE_TPM);
  });

  it("ME-180/ME-181 — rejects a uniformly machine-fast log", () => {
    const verdict = validateResult(input({ taskLog: honestLog(60, 100) }));
    if (verdict.valid) throw new Error("expected a rejection");
    expect(verdict.failure.code).toBe("implausible");
    const { violations } = verdict.failure.details as {
      violations: { code: string; value: number }[];
    };
    const codes = violations.map((v) => v.code);
    expect(codes).toContain("inter-answer-too-fast");
    expect(codes).toContain("median-interval-too-low");
    expect(MIN_INTER_ANSWER_MS).toBe(150);
    expect(MAX_MEDIAN_INTERVAL_FLOOR_MS).toBe(300);
  });

  it("ME-182(a) — rejects a testDuration that is not time * 60", () => {
    const verdict = validateResult(input({ testDuration: DURATION + 1 }));
    if (verdict.valid) throw new Error("expected a rejection");
    expect(verdict.failure.code).toBe("implausible");
  });

  it("ME-182(c) — rejects a timestamp two minutes in the future", () => {
    const verdict = validateResult(
      input({ timestamp: SERVER_NOW + 2 * 60 * 1000 }),
    );
    if (verdict.valid) throw new Error("expected a rejection");
    expect(verdict.failure.code).toBe("implausible");
  });

  it("reports every threshold that fired, with the offending value", () => {
    const verdict = validateResult(
      input({ taskLog: honestLog(60, 100), testDuration: DURATION + 5 }),
    );
    if (verdict.valid) throw new Error("expected a rejection");
    const { violations } = verdict.failure.details as {
      violations: { code: string; message: string; value: number }[];
    };
    expect(violations.length).toBeGreaterThan(1);
    for (const v of violations) {
      expect(typeof v.value).toBe("number");
      expect(v.message).toContain(`${v.value}`);
    }
  });
});

describe("ME-176 — the 'toolong' degraded path", () => {
  it("accepts an oversized log whose committed count is plausible", () => {
    // The entries are gone, so only the tpm ceiling can be checked — and it is
    // checked against `answered`, not against the (absent) log.
    const verdict = validateResult(
      input({ taskLog: TASK_LOG_TOOLONG, answered: 900 }),
    );
    expect(verdict).toEqual({ valid: true });
  });

  it("still enforces the tpm ceiling from `answered` alone", () => {
    const verdict = validateResult(
      input({ taskLog: TASK_LOG_TOOLONG, answered: 2000 }),
    );
    if (verdict.valid) throw new Error("expected a rejection");
    expect(verdict.failure.code).toBe("implausible");
    const { violations } = verdict.failure.details as {
      violations: { code: string; value: number }[];
    };
    expect(violations).toEqual([
      {
        code: "tpm-too-high",
        // 2000 answers / 8 minutes = 250 tpm.
        value: 250,
        message: expect.stringContaining("250") as unknown as string,
      },
    ]);
  });

  it("does not divide by zero on a zero-length test", () => {
    const verdict = validateResult(
      input({ taskLog: TASK_LOG_TOOLONG, answered: 10, testDuration: 0 }),
    );
    // testDuration 0 is itself implausible (ME-182a), so this must reject —
    // what it must never do is produce Infinity or NaN.
    if (verdict.valid) throw new Error("expected a rejection");
    const { violations } = verdict.failure.details as {
      violations: { value: number }[];
    };
    for (const v of violations) expect(Number.isFinite(v.value)).toBe(true);
  });
});
