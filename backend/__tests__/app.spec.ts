import { describe, it, expect } from "vitest";
import { setup } from "./__testData__/controller-test";
import { JSON_BODY_LIMIT } from "../src/app";

const { mockApp } = setup();

/**
 * ME-159 / ME-176 regression — express's `json()` default limit is 100 kB, but a
 * legitimate `POST /results` body is larger than that. A long test used to be
 * rejected by body-parser (413 PayloadTooLargeError) before the controller or
 * the zod schema ever ran, so the user finished an eight-minute run and got an
 * opaque failure.
 */
describe("app body limit", () => {
  const KINDS = [
    "addition",
    "multiplication",
    "division",
    "fractionAddition",
  ] as const;

  /** A task log of `n` entries with `fieldLength`-character prompt/answers. */
  function buildTaskLog(
    n: number,
    fieldLength: number,
  ): Record<string, unknown>[] {
    return Array.from({ length: n }, (_, i) => ({
      i,
      kind: KINDS[i % KINDS.length],
      prompt: "9".repeat(fieldLength),
      expected: "7".repeat(fieldLength),
      given: "7".repeat(fieldLength),
      correct: true,
      tStart: 479123.45,
      tEnd: 479987.65,
    }));
  }

  function sizeKb(body: unknown): number {
    return Buffer.byteLength(JSON.stringify(body), "utf8") / 1024;
  }

  it("declares a limit above the schema's own worst case", () => {
    expect(JSON_BODY_LIMIT).toBe("512kb");
  });

  it("accepts a task log from a full-length test", async () => {
    // 1000 entries is TASK_LOG_MAX_ENTRIES, every string at its 64-char max:
    // the largest body the result schema can possibly accept.
    const body = { taskLog: buildTaskLog(1000, 64) };
    expect(sizeKb(body)).toBeGreaterThan(100);

    const response = await mockApp.post("/results").send(body);

    // The body must reach validation. Any outcome is fine except the transport
    // refusing to read it - notably NOT 413.
    expect(response.status).not.toBe(413);
  });

  it("still rejects a body past the configured limit", async () => {
    // The limit must remain a real limit, not simply be removed.
    const body = { taskLog: buildTaskLog(4000, 64) };
    expect(sizeKb(body)).toBeGreaterThan(512);

    const response = await mockApp.post("/results").send(body);

    expect(response.status).toBe(413);
  });
});
