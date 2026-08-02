import { describe, expect, it } from "vitest";
import { createPrng } from "../src/prng";
import {
  ADDITION_BANDS,
  additionPairAt,
  additionPairCount,
  enumerateAdditionPairs,
  generateAddition,
} from "../src/generators/addition";
import { generateMultiplication } from "../src/generators/multiplication";
import {
  divisionQuotientRange,
  generateDivision,
} from "../src/generators/division";
import {
  coprimeNumerators,
  fractionAdditionDenominatorPairs,
  generateFractionAddition,
} from "../src/generators/fraction-addition";
import { generateFractionMultiplication } from "../src/generators/fraction-multiplication";
import { gcd, isInteger, lcm, toNumber } from "../src/rational";

const SAMPLES = 20000;

function prng(seed = 1): ReturnType<typeof createPrng> {
  return createPrng(seed);
}

/**
 * Collects violations instead of calling `expect` inside a hot loop — a single
 * assertion at the end keeps the >=20 000-sample bound checks fast enough to run
 * on every commit.
 */
class Violations {
  private readonly hits: string[] = [];

  public check(ok: boolean, describeFailure: () => string): void {
    if (!ok && this.hits.length < 5) this.hits.push(describeFailure());
  }

  public get list(): string[] {
    return this.hits;
  }
}

// ---------------------------------------------------------------- addition --

describe("addition (ME-027 … ME-034)", () => {
  it("ME-031: '100' keeps 2 <= a,b <= 98 and 11 <= a+b <= 100", () => {
    const rng = prng(101);
    const v = new Violations();
    for (let i = 0; i < SAMPLES; i++) {
      const { a, b, answer } = generateAddition(rng, "100");
      v.check(
        Number.isInteger(a) &&
          Number.isInteger(b) &&
          a >= 2 &&
          b >= 2 &&
          a <= 98 &&
          b <= 98 &&
          a + b >= 11 &&
          a + b <= 100,
        () => `bounds violated by ${a} + ${b}`,
      );
      // ME-032
      v.check(
        answer.n === a + b && answer.d === 1,
        () => `answer ${answer.n}/${answer.d} !== ${a + b}`,
      );
    }
    expect(v.list).toEqual([]);
  });

  it("ME-031: '1000' keeps 10 <= a,b <= 990 and 101 <= a+b <= 1000", () => {
    const rng = prng(202);
    const v = new Violations();
    for (let i = 0; i < SAMPLES; i++) {
      const { a, b, answer } = generateAddition(rng, "1000");
      v.check(
        a >= 10 &&
          b >= 10 &&
          a <= 990 &&
          b <= 990 &&
          a + b >= 101 &&
          a + b <= 1000,
        () => `bounds violated by ${a} + ${b}`,
      );
      v.check(
        answer.n === a + b && answer.d === 1,
        () => `answer ${answer.n}/${answer.d} !== ${a + b}`,
      );
    }
    expect(v.list).toEqual([]);
  });

  it("ME-034: operand order is not re-randomised, so both a>b and a<b occur", () => {
    const rng = prng(303);
    let aBigger = 0;
    let bBigger = 0;
    for (let i = 0; i < 2000; i++) {
      const { a, b } = generateAddition(rng, "100");
      if (a > b) aBigger++;
      if (b > a) bBigger++;
    }
    expect(aBigger).toBeGreaterThan(500);
    expect(bBigger).toBeGreaterThan(500);
  });

  it("ME-030: the enumerated pair set has the closed-form size", () => {
    expect(additionPairCount("100")).toBe(4725);
    expect(additionPairCount("1000")).toBe(478350);
    expect(enumerateAdditionPairs("100")).toHaveLength(4725);
  });

  it("E36: the boundary sum 1000 is reachable, as are the floors 11 and 101", () => {
    const pairs100 = enumerateAdditionPairs("100");
    expect(pairs100.some(([a, b]) => a + b === 11)).toBe(true);
    expect(pairs100.some(([a, b]) => a + b === 100)).toBe(true);

    const count = additionPairCount("1000");
    expect(additionPairAt("1000", 0)).toEqual([10, 91]); // sum 101, the floor
    const [a, b] = additionPairAt("1000", count - 1);
    expect(a + b).toBe(1000); // the ceiling is the very last enumerated pair
    expect(a).toBeGreaterThanOrEqual(10);
    expect(b).toBeGreaterThanOrEqual(10);
  });

  it("ME-030: indexing is a bijection onto the pair set", () => {
    for (const state of ["100", "1000"] as const) {
      const band = ADDITION_BANDS[state];
      const count = additionPairCount(state);
      const seen = new Set<number>();
      const v = new Violations();
      for (let k = 0; k < count; k++) {
        const [a, b] = additionPairAt(state, k);
        v.check(
          a >= band.operandMin &&
            b >= band.operandMin &&
            a + b >= band.sumMin &&
            a + b <= band.sumMax,
          () => `pair ${k} = (${a}, ${b}) is outside ${state}`,
        );
        seen.add(a * 10000 + b);
      }
      expect(v.list).toEqual([]);
      expect(seen.size).toBe(count);
    }
  });

  it("ME-030: rejection sampling is uniform over S100 (chi-squared)", () => {
    const pairs = enumerateAdditionPairs("100");
    const index = new Map<number, number>();
    pairs.forEach(([a, b], i) => index.set(a * 10000 + b, i));

    const draws = pairs.length * 12;
    const counts = new Array<number>(pairs.length).fill(0);
    const rng = prng(2718281);
    let unknown = 0;
    for (let i = 0; i < draws; i++) {
      const { a, b } = generateAddition(rng, "100");
      const at = index.get(a * 10000 + b);
      if (at === undefined) unknown++;
      else counts[at] = (counts[at] ?? 0) + 1;
    }
    expect(unknown).toBe(0);

    const expected = draws / pairs.length;
    const chi = counts.reduce(
      (acc, c) => acc + ((c - expected) * (c - expected)) / expected,
      0,
    );
    const df = pairs.length - 1;
    // ~p = 3e-5 at this df
    expect(chi).toBeLessThan(df + 4 * Math.sqrt(2 * df));
  });

  it("ME-030: the sum distribution of S1000 matches the enumerated set (chi-squared)", () => {
    const total = additionPairCount("1000");
    const draws = 180000;
    const counts = new Map<number, number>();
    const rng = prng(31415926);
    for (let i = 0; i < draws; i++) {
      const { a, b } = generateAddition(rng, "1000");
      counts.set(a + b, (counts.get(a + b) ?? 0) + 1);
    }
    let chi = 0;
    let cells = 0;
    for (let s = 101; s <= 1000; s++) {
      const expectedCount = ((s - 19) / total) * draws;
      const observed = counts.get(s) ?? 0;
      chi +=
        ((observed - expectedCount) * (observed - expectedCount)) /
        expectedCount;
      cells++;
    }
    const df = cells - 1;
    expect(chi).toBeLessThan(df + 4 * Math.sqrt(2 * df));
  });
});

// ---------------------------------------------------------- multiplication --

describe("multiplication (ME-035 … ME-041)", () => {
  const bounds = { "12": [4, 144], "20": [4, 400], "100": [4, 10000] } as const;

  for (const state of ["12", "20", "100"] as const) {
    it(`ME-037 … ME-039: '${state}' draws both factors from [2, ${state}]`, () => {
      const n = Number(state);
      const rng = prng(404);
      const seen = new Set<number>();
      const v = new Violations();
      let squares = 0;
      for (let i = 0; i < SAMPLES; i++) {
        const { a, b, answer } = generateMultiplication(rng, state);
        v.check(
          a >= 2 && b >= 2 && a <= n && b <= n,
          () => `factor out of range: ${a} x ${b}`,
        );
        v.check(
          answer.n === a * b &&
            answer.d === 1 &&
            a * b >= bounds[state][0] &&
            a * b <= bounds[state][1],
          () => `answer out of range: ${a} x ${b} = ${answer.n}/${answer.d}`,
        );
        seen.add(a);
        seen.add(b);
        if (a === b) squares++;
      }
      expect(v.list).toEqual([]);
      // ME-038: 0 and 1 are excluded as factors.
      expect(seen.has(0)).toBe(false);
      expect(seen.has(1)).toBe(false);
      expect(seen.has(2)).toBe(true);
      expect(seen.has(n)).toBe(true);
      // ME-040: squares are permitted.
      expect(squares).toBeGreaterThan(0);
    });
  }

  it("E34: the boundary product 100 x 100 = 10000 is reachable", () => {
    const rng = prng(5);
    let found = false;
    for (let i = 0; i < 400000 && !found; i++) {
      const { a, b } = generateMultiplication(rng, "100");
      if (a === 100 && b === 100) found = true;
    }
    expect(found).toBe(true);
  });
});

// ---------------------------------------------------------------- division --

describe("division 'tables' (ME-042 … ME-046)", () => {
  it("ME-044: 4 <= n <= 144, 2 <= d <= 12, 2 <= q <= 12, never a remainder", () => {
    const rng = prng(606);
    const divisors = new Set<number>();
    const quotients = new Set<number>();
    const v = new Violations();
    for (let i = 0; i < SAMPLES; i++) {
      const { a: n, b: d, answer } = generateDivision(rng, "tables");
      v.check(
        d >= 2 && d <= 12 && n >= 4 && n <= 144 && n % d === 0,
        () => `tables bounds violated by ${n} / ${d}`,
      );
      v.check(
        answer.d === 1 && answer.n === n / d && answer.n >= 2 && answer.n <= 12,
        () => `quotient out of range for ${n} / ${d}`,
      );
      divisors.add(d);
      quotients.add(answer.n);
    }
    expect(v.list).toEqual([]);
    // ME-046: 0 and 1 excluded as divisor and quotient.
    const expectedRange = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    expect([...divisors].sort((x, y) => x - y)).toEqual(expectedRange);
    expect([...quotients].sort((x, y) => x - y)).toEqual(expectedRange);
  });

  it("E35: 144 ÷ 12 = 12 and 4 ÷ 2 = 2 are both reachable", () => {
    const rng = prng(7);
    let max = false;
    let min = false;
    for (let i = 0; i < 40000 && !(max && min); i++) {
      const { a, b } = generateDivision(rng, "tables");
      if (a === 144 && b === 12) max = true;
      if (a === 4 && b === 2) min = true;
    }
    expect(max).toBe(true);
    expect(min).toBe(true);
  });

  it("ME-045 / A12: the range is fixed at 1…12 and cannot follow multiplication", () => {
    // The signature takes only (rng, divisionState) — there is no channel
    // through which the multiplication bound could reach this generator.
    expect(generateDivision.length).toBe(2);
  });
});

describe("division 'threeByTwo' (ME-047 … ME-055, C28)", () => {
  it("ME-050: [qMin, qMax] is non-empty for every d in [2, 99]", () => {
    const v = new Violations();
    for (let d = 2; d <= 99; d++) {
      const [qMin, qMax] = divisionQuotientRange(d);
      v.check(
        qMin <= qMax && qMin >= 2 && d * qMin >= 100 && d * qMax <= 999,
        () => `d = ${d} gives [${qMin}, ${qMax}]`,
      );
    }
    expect(v.list).toEqual([]);
    expect(divisionQuotientRange(2)).toEqual([50, 499]);
    expect(divisionQuotientRange(99)).toEqual([2, 10]);
  });

  it("ME-051/ME-052: 100 <= n <= 999 (exactly 3 digits), 2 <= d <= 99, 2 <= q <= 499", () => {
    const rng = prng(808);
    const divisors = new Set<number>();
    const v = new Violations();
    for (let i = 0; i < SAMPLES; i++) {
      const { a: n, b: d, answer } = generateDivision(rng, "threeByTwo");
      v.check(
        n >= 100 && n <= 999 && String(n).length === 3,
        () => `dividend ${n} is not exactly 3 digits`,
      );
      v.check(
        d >= 2 && d <= 99 && n % d === 0,
        () => `divisor ${d} invalid for ${n}`,
      );
      v.check(
        answer.d === 1 && answer.n >= 2 && answer.n <= 499,
        () => `quotient out of range for ${n} / ${d}`,
      );
      divisors.add(d);
    }
    expect(v.list).toEqual([]);
    // ME-053 / A3: single-digit divisors are permitted.
    expect([...divisors].some((d) => d < 10)).toBe(true);
    expect([...divisors].some((d) => d >= 10)).toBe(true);
  });

  it("ME-054: the two-stage distribution is uniform over d, not over (d, q) pairs", () => {
    const rng = prng(909);
    const counts = new Map<number, number>();
    const draws = 196000;
    for (let i = 0; i < draws; i++) {
      const { b: d } = generateDivision(rng, "threeByTwo");
      counts.set(d, (counts.get(d) ?? 0) + 1);
    }
    const expectedCount = draws / 98;
    let chi = 0;
    for (let d = 2; d <= 99; d++) {
      const observed = counts.get(d) ?? 0;
      chi +=
        ((observed - expectedCount) * (observed - expectedCount)) /
        expectedCount;
    }
    // 97 df; p = 0.001 critical value is ~148.2
    expect(chi).toBeLessThan(148.2);

    // Uniform-over-pairs would put >20% of all mass on d = 2 alone; the
    // two-stage draw puts ~1/98 there.
    expect((counts.get(2) ?? 0) / draws).toBeLessThan(0.02);
  });

  it("E33: the boundary dividends 100 and 999 are both reachable", () => {
    const rng = prng(10);
    let lo = false;
    let hi = false;
    for (let i = 0; i < 600000 && !(lo && hi); i++) {
      const { a: n } = generateDivision(rng, "threeByTwo");
      if (n === 100) lo = true;
      if (n === 999) hi = true;
    }
    expect(lo).toBe(true);
    expect(hi).toBe(true);
  });
});

// ------------------------------------------------------- fraction addition --

describe("fraction addition (ME-056 … ME-067)", () => {
  it("coprimeNumerators lists 1 <= n < d with gcd(n, d) = 1 (ME-061, ME-062)", () => {
    expect(coprimeNumerators(2)).toEqual([1]); // E22: degenerate but valid
    expect(coprimeNumerators(6)).toEqual([1, 5]);
    expect(coprimeNumerators(12)).toEqual([1, 5, 7, 11]);
    const v = new Violations();
    for (let d = 2; d <= 99; d++) {
      const list = coprimeNumerators(d);
      v.check(list.length > 0, () => `d = ${d} has no coprime numerator`);
      for (const n of list) {
        v.check(
          n >= 1 && n < d && gcd(n, d) === 1,
          () => `${n}/${d} is not a reduced proper fraction`,
        );
      }
    }
    expect(v.list).toEqual([]);
  });

  it("ME-058 … ME-060: denominator pairs are distinct, >= 2 and lcm <= D", () => {
    for (const [state, limit] of [
      ["12", 12],
      ["99", 99],
    ] as const) {
      const pairs = fractionAdditionDenominatorPairs(state);
      expect(pairs.length).toBeGreaterThan(0);
      const v = new Violations();
      for (const [d1, d2] of pairs) {
        v.check(
          d1 >= 2 &&
            d2 >= 2 &&
            d1 <= limit &&
            d2 <= limit &&
            d1 !== d2 && // E16 / ME-060
            lcm(d1, d2) <= limit,
          () => `pair (${d1}, ${d2}) is invalid for D = ${limit}`,
        );
      }
      expect(v.list).toEqual([]);
      // the set is symmetric, so both operand orderings can be drawn
      const set = new Set(pairs.map(([d1, d2]) => `${d1}:${d2}`));
      for (const [d1, d2] of pairs) expect(set.has(`${d2}:${d1}`)).toBe(true);
    }
  });

  it("caches the precomputed pair set per D (ME-058)", () => {
    expect(fractionAdditionDenominatorPairs("12")).toBe(
      fractionAdditionDenominatorPairs("12"),
    );
  });

  for (const [state, limit] of [
    ["12", 12],
    ["99", 99],
  ] as const) {
    it(`ME-062 … ME-067: '${state}' emits reduced proper fractions, answer denom <= ${limit}, answer < 2`, () => {
      const rng = prng(1111);
      const v = new Violations();
      for (let i = 0; i < SAMPLES; i++) {
        const { n1, d1, n2, d2, answer } = generateFractionAddition(rng, state);
        v.check(
          d1 !== d2 && lcm(d1, d2) <= limit,
          () => `denominators ${d1}, ${d2} invalid for D = ${limit}`,
        );
        v.check(
          d1 >= 2 && n1 >= 1 && n1 < d1 && gcd(n1, d1) === 1,
          () => `${n1}/${d1} is not a reduced proper fraction`,
        );
        v.check(
          d2 >= 2 && n2 >= 1 && n2 < d2 && gcd(n2, d2) === 1,
          () => `${n2}/${d2} is not a reduced proper fraction`,
        );
        // ME-064 / ME-067
        v.check(
          answer.d > 0 &&
            gcd(answer.n, answer.d) === 1 &&
            answer.d <= limit &&
            answer.n > 0 &&
            toNumber(answer) < 2,
          () => `answer ${answer.n}/${answer.d} violates ME-064/ME-067`,
        );
      }
      expect(v.list).toEqual([]);
    });
  }

  it("E17 / ME-065: improper results occur and are never redrawn", () => {
    const rng = prng(1212);
    let improper = 0;
    for (let i = 0; i < 60000; i++) {
      const { answer } = generateFractionAddition(rng, "12");
      if (toNumber(answer) > 1) improper++;
    }
    expect(improper).toBeGreaterThan(0);
  });

  /**
   * ME-066 / E18 vs ME-060 / E16 — a genuine contradiction in doc 01.
   *
   * ME-066 offers `1/6 + 5/6 = 1` as an example of a permitted integer result,
   * and the golden-vector table repeats it. But that task has `d1 === d2`, which
   * ME-060/E16 forbids outright ("never generated").
   *
   * With `d1 !== d2` and both fractions reduced (ME-063) an integer answer is
   * *structurally unreachable*: the sum lies strictly in `(0, 2)` so the only
   * integer available is 1, and `n1/d1 = 1 - n2/d2 = (d2-n2)/d2` is already in
   * lowest terms, which forces `d1 === d2`.
   *
   * Resolution applied: ME-060 wins for **generation** (it is the explicit MUST,
   * with assumption A4 behind it); ME-066's "integer results MUST be permitted"
   * is honoured as "never filtered out or redrawn" — the generator applies no
   * such filter. ME-069's *judging* rule (a bare `1` is accepted for an expected
   * `1/1`) is unaffected, and the `1/6 + 5/6` golden vector survives as a
   * judging/rendering vector rather than a generation vector.
   */
  it("ME-066 vs ME-060: an integer answer is unreachable, proven exhaustively", () => {
    for (const state of ["12", "99"] as const) {
      let integral = 0;
      let total = 0;
      for (const [d1, d2] of fractionAdditionDenominatorPairs(state)) {
        for (const n1 of coprimeNumerators(d1)) {
          for (const n2 of coprimeNumerators(d2)) {
            total++;
            if ((n1 * d2 + n2 * d1) % (d1 * d2) === 0) integral++;
          }
        }
      }
      expect(total).toBeGreaterThan(0);
      expect(integral).toBe(0);
    }
  });

  it("ME-066: the generator applies no post-hoc filter to the answer", () => {
    // The answer is a pure function of the four draws, so nothing can be
    // rejected after the fact.
    const rng = prng(1212);
    const v = new Violations();
    for (let i = 0; i < 5000; i++) {
      const { n1, d1, n2, d2, answer } = generateFractionAddition(rng, "99");
      v.check(
        answer.n * (d1 * d2) === (n1 * d2 + n2 * d1) * answer.d,
        () => `answer is not ${n1}/${d1} + ${n2}/${d2}`,
      );
    }
    expect(v.list).toEqual([]);
    expect(isInteger({ n: 1, d: 1 })).toBe(true);
  });
});

// ------------------------------------------------- fraction multiplication --

describe("fraction multiplication (ME-073 … ME-081)", () => {
  for (const [state, n] of [
    ["12", 12],
    ["20", 20],
    ["100", 100],
  ] as const) {
    it(`ME-074 … ME-079: bounds follow multiplication='${state}' (N = ${n})`, () => {
      const rng = prng(1313);
      const v = new Violations();
      let equalDenominators = 0;
      for (let i = 0; i < SAMPLES; i++) {
        const { n1, d1, n2, d2, answer } = generateFractionMultiplication(
          rng,
          state,
        );
        v.check(
          d1 >= 2 && d2 >= 2 && d1 <= n && d2 <= n,
          () => `denominators ${d1}, ${d2} out of [2, ${n}]`,
        );
        v.check(
          n1 >= 1 && n1 < d1 && gcd(n1, d1) === 1,
          () => `${n1}/${d1} is not a reduced proper fraction`,
        );
        v.check(
          n2 >= 1 && n2 < d2 && gcd(n2, d2) === 1,
          () => `${n2}/${d2} is not a reduced proper fraction`,
        );
        // ME-078
        v.check(
          answer.n * (d1 * d2) === n1 * n2 * answer.d &&
            gcd(answer.n, answer.d) === 1,
          () => `answer is not the reduced ${n1}·${n2}/${d1}·${d2}`,
        );
        // ME-079
        v.check(
          d1 * d2 <= n * n &&
            n1 * n2 <= (n - 1) * (n - 1) &&
            answer.n > 0 &&
            toNumber(answer) < 1 &&
            !isInteger(answer),
          () =>
            `answer ${answer.n}/${answer.d} is not a proper fraction in (0,1)`,
        );
        if (d1 === d2) equalDenominators++;
      }
      expect(v.list).toEqual([]);
      // ME-075: unlike fraction addition, d1 === d2 is permitted.
      expect(equalDenominators).toBeGreaterThan(0);
    });
  }

  it("ME-079: the worst-case unreduced bounds at N = 100 are 10000 and 9801", () => {
    expect(100 * 100).toBe(10000);
    expect(99 * 99).toBe(9801);
  });
});
