import { describe, expect, it } from "vitest";
import { GOLDEN_VECTORS, verifyGoldenVectors } from "../src/golden-vectors";
import { generateSequence } from "../src/generate";
import { DEFAULT_MATH_SETTINGS } from "../src/settings";
import { MINUS } from "../src/render";

describe("golden vectors (ME-178)", () => {
  it("has one row per entry of doc 01's golden-vector table", () => {
    expect(GOLDEN_VECTORS).toHaveLength(10);
    expect(GOLDEN_VECTORS.map((v) => v.id)).toEqual([
      "decimal-div-1-by-4",
      "decimal-mul-six-fractional-digits",
      "decimal-add-4.5-plus-7",
      "fracadd-improper",
      "fracadd-integer-result",
      "fracmul-3-4-times-2-5",
      "div-tables-upper-bound",
      "div-threebytwo-single-digit-divisor",
      "add-negative-first-operand",
      "mul-negative-second-operand",
    ]);
  });

  it("every vector reproduces byte-identically through the engine", () => {
    expect(verifyGoldenVectors()).toEqual([]);
  });

  it("pins the exact prompts, answers and displays from the table", () => {
    const byId = new Map(GOLDEN_VECTORS.map((v) => [v.id, v]));
    expect(byId.get("decimal-div-1-by-4")).toMatchObject({
      prompt: "1 ÷ 4 =",
      answerDisplay: "0.25",
    });
    expect(byId.get("decimal-mul-six-fractional-digits")).toMatchObject({
      prompt: "0.087 × 0.094 =",
      answerDisplay: "0.008178",
    });
    expect(byId.get("decimal-add-4.5-plus-7")).toMatchObject({
      prompt: "4.5 + 7 =",
      answerDisplay: "11.5",
    });
    expect(byId.get("fracadd-improper")).toMatchObject({
      prompt: "3/4 + 5/6 =",
      answerDisplay: "19/12",
    });
    expect(byId.get("fracadd-integer-result")).toMatchObject({
      prompt: "1/6 + 5/6 =",
      answerDisplay: "1",
    });
    expect(byId.get("fracmul-3-4-times-2-5")).toMatchObject({
      prompt: "3/4 × 2/5 =",
      answerDisplay: "3/10",
    });
    expect(byId.get("div-tables-upper-bound")).toMatchObject({
      prompt: "144 ÷ 12 =",
      answerDisplay: "12",
    });
    expect(byId.get("div-threebytwo-single-digit-divisor")).toMatchObject({
      prompt: "738 ÷ 9 =",
      answerDisplay: "82",
    });
    // C33: display uses U+2212, so doc 01's ASCII rows are written with it.
    expect(byId.get("add-negative-first-operand")).toMatchObject({
      prompt: `${MINUS}12 + 5 =`,
      answerDisplay: `${MINUS}7`,
    });
    expect(byId.get("mul-negative-second-operand")).toMatchObject({
      prompt: `7 × (${MINUS}8) =`,
      answerDisplay: `${MINUS}56`,
    });
  });

  it("stores exact answers reduced, equal to the table's unreduced forms", () => {
    const sixDigits = GOLDEN_VECTORS.find(
      (v) => v.id === "decimal-mul-six-fractional-digits",
    );
    // doc 01 writes 8178/1000000; reduced that is 4089/500000
    expect(sixDigits?.answer).toEqual({ n: 4089, d: 500000 });
    expect(4089 * 1000000).toBe(8178 * 500000);
  });

  it("flags exactly the two vectors doc 01's own rules cannot generate", () => {
    const unreachable = GOLDEN_VECTORS.filter((v) => !v.generatorReachable).map(
      (v) => v.id,
    );
    expect(unreachable).toEqual([
      "decimal-mul-six-fractional-digits",
      "fracadd-integer-result",
    ]);
    for (const vector of GOLDEN_VECTORS) {
      expect(vector.note.length).toBeGreaterThan(10);
    }
  });

  it("reports failures rather than throwing when a vector is wrong", () => {
    const broken = GOLDEN_VECTORS.map((v) =>
      v.id === "div-tables-upper-bound" ? { ...v, answerDisplay: "13" } : v,
    );
    const failures = verifyGoldenVectors(broken);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("div-tables-upper-bound");
  });

  it("the generator-reachable vectors really are produced by the generator", () => {
    // A wide search over the default settings for the four purely-integer rows.
    const wanted = new Set([
      "144 ÷ 12 =",
      "738 ÷ 9 =",
      "3/4 + 5/6 =",
      "3/4 × 2/5 =",
    ]);
    for (let seed = 1; seed <= 40 && wanted.size > 0; seed++) {
      for (const task of generateSequence(
        seed * 7919,
        DEFAULT_MATH_SETTINGS,
        20000,
      )) {
        wanted.delete(task.prompt);
        if (wanted.size === 0) break;
      }
    }
    expect([...wanted]).toEqual([]);
  });
});
