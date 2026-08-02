import { describe, expect, it } from "vitest";
import { createPrng, deriveTaskSeed, mulberry32Raw } from "../src/prng";

/**
 * Reference mulberry32, transcribed independently from the widely published
 * implementation so the test is not a copy of the code under test.
 * ME-167 pins the constants; this proves our stream matches them.
 */
function referenceMulberry32(a: number): () => number {
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("mulberry32 (ME-167)", () => {
  it("matches the reference implementation for many seeds", () => {
    for (const seed of [0, 1, 42, 1337, 0x7fffffff, 0xdeadbeef, 4294967295]) {
      const ours = createPrng(seed);
      const reference = referenceMulberry32(seed);
      for (let i = 0; i < 200; i++) {
        expect(ours.next()).toBe(reference());
      }
    }
  });

  it("emits values in [0, 1)", () => {
    const prng = createPrng(123456789);
    for (let i = 0; i < 100000; i++) {
      const value = prng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("is fully determined by its seed", () => {
    const a = createPrng(99);
    const b = createPrng(99);
    for (let i = 0; i < 500; i++) expect(a.next()).toBe(b.next());
  });

  it("produces different streams for different seeds", () => {
    const a = createPrng(1);
    const b = createPrng(2);
    const first = Array.from({ length: 20 }, () => a.next());
    const second = Array.from({ length: 20 }, () => b.next());
    expect(first).not.toEqual(second);
  });

  it("exposes the raw uint32 step used for seed derivation", () => {
    const raw = mulberry32Raw(0);
    expect(Number.isInteger(raw)).toBe(true);
    expect(raw).toBeGreaterThanOrEqual(0);
    expect(raw).toBeLessThanOrEqual(0xffffffff);
    // The raw step is the numerator of the first float the same seed produces.
    expect(raw / 4294967296).toBe(createPrng(0).next());
  });
});

describe("nextInt (ME-168)", () => {
  it("is inclusive on both ends", () => {
    const prng = createPrng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 20000; i++) seen.add(prng.nextInt(2, 5));
    expect([...seen].sort((x, y) => x - y)).toEqual([2, 3, 4, 5]);
  });

  it("handles a degenerate single-value range without consuming nothing", () => {
    const prng = createPrng(11);
    for (let i = 0; i < 50; i++) expect(prng.nextInt(4, 4)).toBe(4);
  });

  it("matches min + floor(out * (max - min + 1)) exactly", () => {
    const values = createPrng(2024);
    const ints = createPrng(2024);
    for (let i = 0; i < 1000; i++) {
      const expected = 3 + Math.floor(values.next() * (17 - 3 + 1));
      expect(ints.nextInt(3, 17)).toBe(expected);
    }
  });

  it("is close to uniform over a small range", () => {
    const prng = createPrng(555);
    const counts = new Array<number>(10).fill(0);
    const draws = 200000;
    for (let i = 0; i < draws; i++) {
      const v = prng.nextInt(0, 9);
      counts[v] = (counts[v] ?? 0) + 1;
    }
    const expected = draws / 10;
    const chi = counts.reduce(
      (acc, c) => acc + ((c - expected) * (c - expected)) / expected,
      0,
    );
    // chi-squared, 9 df, p = 0.001 critical value is 27.877
    expect(chi).toBeLessThan(27.877);
  });
});

describe("per-task seed derivation (ME-170)", () => {
  it("is a pure function of (testSeed, index)", () => {
    expect(deriveTaskSeed(12345, 0)).toBe(deriveTaskSeed(12345, 0));
    expect(deriveTaskSeed(12345, 1)).toBe(deriveTaskSeed(12345, 1));
  });

  it("returns a uint32", () => {
    for (let i = 0; i < 1000; i++) {
      const seed = deriveTaskSeed(0xabcdef, i);
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThanOrEqual(0xffffffff);
    }
  });

  it("matches the ME-170 formula exactly", () => {
    const testSeed = 0x1234abcd;
    for (const index of [0, 1, 2, 59, 1000]) {
      const expected = mulberry32Raw(
        (testSeed ^ Math.imul(index + 1, 0x9e3779b1)) | 0,
      );
      expect(deriveTaskSeed(testSeed, index)).toBe(expected);
    }
  });

  it("gives distinct seeds to distinct indices for a long run", () => {
    const seeds = new Set<number>();
    for (let i = 0; i < 5000; i++) seeds.add(deriveTaskSeed(777, i));
    expect(seeds.size).toBe(5000);
  });

  it("does not depend on how many tasks were generated before it", () => {
    // The whole point of ME-170: index 900 is reachable without walking 0..899.
    const direct = deriveTaskSeed(4242, 900);
    let walked = 0;
    for (let i = 0; i <= 900; i++) walked = deriveTaskSeed(4242, i);
    expect(walked).toBe(direct);
  });
});
