import { describe, expect, it } from "vitest";
import { createPrng } from "../src/prng";
import {
  DECIMAL_RESAMPLE_CAP,
  digitCount,
  generateDecimal,
  shiftPairAt,
  shiftPairCount,
} from "../src/generators/decimal";
import { DEFAULT_MATH_SETTINGS } from "../src/settings";
import { isInteger, rational, toNumber } from "../src/rational";
import type { MathSettings } from "../src/types";

function settings(overrides: Partial<MathSettings> = {}): MathSettings {
  return { ...DEFAULT_MATH_SETTINGS, ...overrides };
}

describe("digit count (ME-095)", () => {
  it("counts trailing zeros: A = 100 has k = 3", () => {
    expect(digitCount(1)).toBe(1);
    expect(digitCount(9)).toBe(1);
    expect(digitCount(10)).toBe(2);
    expect(digitCount(99)).toBe(2);
    expect(digitCount(100)).toBe(3);
    expect(digitCount(999)).toBe(3);
    expect(digitCount(1000)).toBe(4);
  });
});

describe("shift pair selection (ME-097, ME-098, E8)", () => {
  it("excludes exactly the (0, 0) pair", () => {
    for (let kA = 1; kA <= 4; kA++) {
      for (let kB = 1; kB <= 4; kB++) {
        const count = shiftPairCount(kA, kB);
        expect(count).toBe((kA + 1) * (kB + 1) - 1);
        const seen = new Set<string>();
        for (let j = 0; j < count; j++) {
          const [sA, sB] = shiftPairAt(kA, kB, j);
          expect(sA).toBeGreaterThanOrEqual(0);
          expect(sB).toBeGreaterThanOrEqual(0);
          expect(sA).toBeLessThanOrEqual(kA); // ME-097
          expect(sB).toBeLessThanOrEqual(kB);
          expect(`${sA}:${sB}`).not.toBe("0:0"); // ME-098 / E8
          seen.add(`${sA}:${sB}`);
        }
        // bijection onto [0, kA] x [0, kB] \ {(0,0)}
        expect(seen.size).toBe(count);
      }
    }
  });

  it("throws rather than silently wrapping on an out-of-range index", () => {
    expect(() => shiftPairAt(2, 2, shiftPairCount(2, 2))).toThrow();
    expect(() => shiftPairAt(2, 2, -1)).toThrow();
  });
});

describe("decimal task generation (ME-090 … ME-108)", () => {
  const decimalOnly = settings({
    fractionAddition: "off",
    fractionMultiplication: false,
    multiplication: "100",
  });

  it("ME-091 / A11 / C39: the base kind is uniform over the ENABLED subset only", () => {
    const rng = createPrng(4242);
    const counts = new Map<string, number>();
    const draws = 60000;
    for (let i = 0; i < draws; i++) {
      const { baseKind } = generateDecimal(rng, decimalOnly);
      counts.set(baseKind, (counts.get(baseKind) ?? 0) + 1);
    }
    expect([...counts.keys()].sort()).toEqual(["add", "div", "mul"]);
    for (const kind of ["add", "div", "mul"]) {
      const share = (counts.get(kind) ?? 0) / draws;
      expect(share).toBeGreaterThan(0.31);
      expect(share).toBeLessThan(0.35);
    }
  });

  it("C39: decimal tasks are NOT restricted to division", () => {
    const rng = createPrng(99);
    const kinds = new Set<string>();
    for (let i = 0; i < 500; i++) {
      kinds.add(generateDecimal(rng, decimalOnly).baseKind);
    }
    expect(kinds.has("add")).toBe(true);
    expect(kinds.has("mul")).toBe(true);
  });

  it("ME-091: uses only the enabled base kinds when some of 1-3 are off", () => {
    const onlyDivision = settings({
      addition: "off",
      multiplication: "off",
      fractionMultiplication: false,
      fractionAddition: "off",
      division: "tables",
    });
    const rng = createPrng(11);
    for (let i = 0; i < 2000; i++) {
      expect(generateDecimal(rng, onlyDivision).baseKind).toBe("div");
    }
  });

  it("ME-094: a decimal division uses the configured division state", () => {
    const tables = settings({
      addition: "off",
      multiplication: "off",
      fractionAddition: "off",
      fractionMultiplication: false,
      division: "tables",
    });
    const rng = createPrng(12);
    for (let i = 0; i < 5000; i++) {
      const { a, b } = generateDecimal(rng, tables);
      expect(a).toBeLessThanOrEqual(144);
      expect(b).toBeLessThanOrEqual(12);
    }
  });

  it("ME-092: throws rather than producing a decimal task with no base kind", () => {
    const inert = settings({
      addition: "off",
      multiplication: "off",
      division: "off",
      fractionAddition: "99",
      fractionMultiplication: false,
      decimals: true,
    });
    expect(() => generateDecimal(createPrng(1), inert)).toThrow();
  });

  it("ME-100 / E9: A, B and the answer are never all integers at once", () => {
    const rng = createPrng(777);
    const failures: string[] = [];
    for (let i = 0; i < 60000; i++) {
      const draw = generateDecimal(rng, decimalOnly);
      const aInt = draw.a % 10 ** draw.sA === 0;
      const bInt = draw.b % 10 ** draw.sB === 0;
      if (aInt && bInt && isInteger(draw.answer) && failures.length < 5) {
        failures.push(
          `${draw.baseKind}: ${draw.a}/1e${draw.sA} ? ${draw.b}/1e${draw.sB}`,
        );
      }
    }
    expect(failures).toEqual([]);
  });

  it("E7 / ME-099: an operand may still render without a decimal point", () => {
    // The (0,0) prohibition is on the shift values, not the rendered strings.
    const rng = createPrng(31337);
    let renderedIntegerOperand = 0;
    for (let i = 0; i < 60000; i++) {
      const draw = generateDecimal(rng, decimalOnly);
      const aInt = draw.a % 10 ** draw.sA === 0;
      const bInt = draw.b % 10 ** draw.sB === 0;
      if (aInt || bInt) renderedIntegerOperand++;
    }
    expect(renderedIntegerOperand).toBeGreaterThan(0);
  });

  it("ME-101: the fallback sA = kA is provably non-degenerate", () => {
    // For a kA-digit A, 10^(kA-1) <= A < 10^kA, so A / 10^kA is in [0.1, 1).
    for (const a of [1, 4, 9, 10, 42, 99, 100, 144, 990, 999]) {
      const k = digitCount(a);
      const value = rational(a, 10 ** k);
      expect(toNumber(value)).toBeGreaterThanOrEqual(0.1);
      expect(toNumber(value)).toBeLessThan(1);
      expect(isInteger(value)).toBe(false);
    }
    expect(DECIMAL_RESAMPLE_CAP).toBe(20);
  });

  it("ME-023: every decimal answer terminates (denominator is 2^a * 5^b)", () => {
    const rng = createPrng(5150);
    const failures: string[] = [];
    for (let i = 0; i < 60000; i++) {
      const { answer } = generateDecimal(rng, decimalOnly);
      let d = answer.d;
      while (d % 2 === 0) d /= 2;
      while (d % 5 === 0) d /= 5;
      if (d !== 1 && failures.length < 5) {
        failures.push(`non-terminating answer ${answer.n}/${answer.d}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it("ME-103: addition answers have at most max(sA, sB) <= 3 fractional digits", () => {
    const additionOnly = settings({
      multiplication: "off",
      division: "off",
      fractionAddition: "off",
      fractionMultiplication: false,
      addition: "1000",
    });
    const rng = createPrng(103);
    const failures: string[] = [];
    for (let i = 0; i < 40000; i++) {
      const { sA, sB, answer } = generateDecimal(rng, additionOnly);
      const digits = fractionalDigits(answer.d);
      if ((digits > Math.max(sA, sB) || digits > 3) && failures.length < 5) {
        failures.push(`${digits} digits for sA=${sA} sB=${sB}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it("ME-104: multiplication answers have at most sA + sB <= 6 fractional digits", () => {
    const mulOnly = settings({
      addition: "off",
      division: "off",
      fractionAddition: "off",
      fractionMultiplication: false,
      multiplication: "100",
    });
    const rng = createPrng(104);
    const failures: string[] = [];
    let maxDigits = 0;
    for (let i = 0; i < 60000; i++) {
      const { sA, sB, answer } = generateDecimal(rng, mulOnly);
      const digits = fractionalDigits(answer.d);
      if ((digits > sA + sB || digits > 6) && failures.length < 5) {
        failures.push(`${digits} digits for sA=${sA} sB=${sB}`);
      }
      maxDigits = Math.max(maxDigits, digits);
    }
    expect(failures).toEqual([]);
    expect(maxDigits).toBeGreaterThan(0);
  });

  /**
   * ME-108 / B6 vs ME-097 — a second inconsistency in doc 01.
   *
   * ME-108 warns that ME-104 "permits answers with up to 6 fractional digits at
   * multiplication === '100', e.g. 0.087 × 0.094 = 0.008178", and the
   * golden-vector table repeats that task. But `0.087` is mantissa 87 shifted by
   * 3, and `87` has only `k = 2` digits — ME-097 caps `s` at `k`, so `0.087` is
   * not a legal shift of any 2-digit operand. The reachable maximum is 4
   * fractional digits (`0.11 × 0.11 = 0.0121`).
   *
   * ME-104's stated *bound* (`<= sA + sB <= 6`) is correct and is enforced above;
   * it is simply not attained. Resolution applied: ME-097 wins (it is the
   * structural rule the whole shift model rests on), so the worst case B6 raises
   * with the product owner is milder than doc 01 believed. The 6-digit golden
   * vector is retained as a **judging/rendering** vector, which is the only thing
   * it can still prove.
   */
  it("ME-108 vs ME-097: 6 fractional digits are unreachable; the true maximum is 4", () => {
    const mulOnly = settings({
      addition: "off",
      division: "off",
      fractionAddition: "off",
      fractionMultiplication: false,
      multiplication: "100",
    });

    // exhaustive over the whole support, not a sample
    let exhaustiveMax = 0;
    for (let a = 2; a <= 100; a++) {
      for (let b = 2; b <= 100; b++) {
        const kA = digitCount(a);
        const kB = digitCount(b);
        for (let sA = 0; sA <= kA; sA++) {
          for (let sB = 0; sB <= kB; sB++) {
            if (sA === 0 && sB === 0) continue;
            const value = rational(a * b, 10 ** (sA + sB));
            exhaustiveMax = Math.max(exhaustiveMax, fractionalDigits(value.d));
          }
        }
      }
    }
    expect(exhaustiveMax).toBe(4);

    // 0.11 x 0.11 = 0.0121 attains it and is a legal shift (k = 2, s = 2)
    expect(digitCount(11)).toBe(2);
    expect(rational(11 * 11, 10 ** 4)).toEqual({ n: 121, d: 10000 });

    // sampling agrees with the exhaustive bound
    const rng = createPrng(1084);
    let sampledMax = 0;
    for (let i = 0; i < 40000; i++) {
      const { answer } = generateDecimal(rng, mulOnly);
      sampledMax = Math.max(sampledMax, fractionalDigits(answer.d));
    }
    expect(sampledMax).toBe(4);
  });

  it("ME-105: division answers equal q * 10^(sB - sA) with max(0, sA-sB) <= 3 digits", () => {
    const divOnly = settings({
      addition: "off",
      multiplication: "off",
      fractionAddition: "off",
      fractionMultiplication: false,
      division: "threeByTwo",
    });
    const rng = createPrng(105);
    const failures: string[] = [];
    for (let i = 0; i < 60000; i++) {
      const { a, b, sA, sB, answer } = generateDecimal(rng, divOnly);
      const q = a / b;
      // exact re-derivation of the ME-105 closed form
      const up = Math.max(0, sB - sA);
      const down = Math.max(0, sA - sB);
      const expected = rational(q * 10 ** up, 10 ** down);
      if (
        (answer.n !== expected.n || answer.d !== expected.d) &&
        failures.length < 5
      ) {
        failures.push(
          `${a}/${b} sA=${sA} sB=${sB}: got ${answer.n}/${answer.d}, want ${expected.n}/${expected.d}`,
        );
      }
      const digits = fractionalDigits(answer.d);
      if (
        (digits !== Math.min(down, digits) || digits > 3) &&
        failures.length < 5
      ) {
        failures.push(`${digits} fractional digits for sA=${sA} sB=${sB}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it("ME-107: the base division stays remainder-free under every shift", () => {
    const divOnly = settings({
      addition: "off",
      multiplication: "off",
      fractionAddition: "off",
      fractionMultiplication: false,
      division: "tables",
    });
    const rng = createPrng(107);
    const failures: string[] = [];
    for (let i = 0; i < 40000; i++) {
      const { a, b } = generateDecimal(rng, divOnly);
      if (a % b !== 0 && failures.length < 5) {
        failures.push(`${a} % ${b} !== 0`);
      }
    }
    expect(failures).toEqual([]);
  });

  it("ME-106: the brief's own example is reproducible from the primitives", () => {
    // base 100 ÷ 4 = 25, kA = 3, kB = 1, sA = 2, sB = 0 -> 1 ÷ 4 = 0.25
    expect(digitCount(100)).toBe(3);
    expect(digitCount(4)).toBe(1);
    const answer = rational(25 * 10 ** 0, 10 ** 2);
    expect(answer).toEqual({ n: 1, d: 4 });
    expect(toNumber(answer)).toBe(0.25);
  });
});

/** Number of fractional digits implied by a terminating denominator. */
function fractionalDigits(d: number): number {
  let twos = 0;
  let fives = 0;
  let rest = d;
  while (rest % 2 === 0) {
    rest /= 2;
    twos++;
  }
  while (rest % 5 === 0) {
    rest /= 5;
    fives++;
  }
  if (rest !== 1) return Number.POSITIVE_INFINITY;
  return Math.max(twos, fives);
}
