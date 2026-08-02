import { describe, expect, it } from "vitest";
import {
  add,
  compare,
  divide,
  equals,
  fromDecimal,
  fromInt,
  gcd,
  isInteger,
  isZero,
  lcm,
  multiply,
  negate,
  rational,
  subtract,
  toNumber,
} from "../src/rational";

describe("gcd / lcm", () => {
  it("computes gcd on non-negative integers", () => {
    expect(gcd(12, 18)).toBe(6);
    expect(gcd(18, 12)).toBe(6);
    expect(gcd(7, 13)).toBe(1);
    expect(gcd(0, 5)).toBe(5);
    expect(gcd(5, 0)).toBe(5);
    expect(gcd(0, 0)).toBe(0);
  });

  it("uses magnitudes so signs never leak into the gcd", () => {
    expect(gcd(-12, 18)).toBe(6);
    expect(gcd(12, -18)).toBe(6);
    expect(gcd(-12, -18)).toBe(6);
  });

  it("computes lcm", () => {
    expect(lcm(4, 6)).toBe(12);
    expect(lcm(3, 5)).toBe(15);
    expect(lcm(12, 12)).toBe(12);
    expect(lcm(2, 99)).toBe(198);
  });
});

describe("rational construction (ME-020)", () => {
  it("always stores a reduced value with a positive denominator", () => {
    expect(rational(2, 4)).toEqual({ n: 1, d: 2 });
    expect(rational(50, 100)).toEqual({ n: 1, d: 2 });
    expect(rational(-2, 4)).toEqual({ n: -1, d: 2 });
    expect(rational(2, -4)).toEqual({ n: -1, d: 2 });
    expect(rational(-2, -4)).toEqual({ n: 1, d: 2 });
    expect(rational(6, 3)).toEqual({ n: 2, d: 1 });
  });

  it("normalises every representation of zero to 0/1 (ME-149)", () => {
    expect(rational(0, 5)).toEqual({ n: 0, d: 1 });
    expect(rational(-0, 5)).toEqual({ n: 0, d: 1 });
    expect(rational(0, -5)).toEqual({ n: 0, d: 1 });
    expect(Object.is(rational(0, -5).n, -0)).toBe(false);
  });

  it("throws on a zero denominator rather than producing Infinity/NaN (ME-146)", () => {
    expect(() => rational(3, 0)).toThrow();
  });

  it("throws on non-integer inputs", () => {
    expect(() => rational(1.5, 2)).toThrow();
    expect(() => rational(1, 2.5)).toThrow();
  });

  it("builds from an integer", () => {
    expect(fromInt(7)).toEqual({ n: 7, d: 1 });
    expect(fromInt(-7)).toEqual({ n: -7, d: 1 });
    expect(fromInt(0)).toEqual({ n: 0, d: 1 });
  });

  it("builds from a mantissa and a decimal shift (ME-095)", () => {
    expect(fromDecimal(100, 2)).toEqual({ n: 1, d: 1 });
    expect(fromDecimal(42, 1)).toEqual({ n: 21, d: 5 });
    expect(fromDecimal(25, 2)).toEqual({ n: 1, d: 4 });
    expect(fromDecimal(1, 0)).toEqual({ n: 1, d: 1 });
  });
});

describe("exact arithmetic (ME-020, ME-021, ME-025)", () => {
  it("adds 0.1 + 0.2 to exactly 0.3, which IEEE-754 cannot (ME-021)", () => {
    expect(0.1 + 0.2 === 0.3).toBe(false);
    const sum = add(fromDecimal(1, 1), fromDecimal(2, 1));
    expect(sum).toEqual({ n: 3, d: 10 });
    expect(equals(sum, fromDecimal(3, 1))).toBe(true);
  });

  it("adds, subtracts, multiplies and divides exactly", () => {
    expect(add(rational(3, 4), rational(5, 6))).toEqual({ n: 19, d: 12 });
    expect(add(rational(1, 6), rational(5, 6))).toEqual({ n: 1, d: 1 });
    expect(subtract(rational(1, 2), rational(1, 3))).toEqual({ n: 1, d: 6 });
    expect(multiply(rational(3, 4), rational(2, 5))).toEqual({ n: 3, d: 10 });
    expect(divide(rational(1, 2), rational(1, 4))).toEqual({ n: 2, d: 1 });
  });

  it("throws when dividing by zero rather than returning Infinity (ME-026)", () => {
    expect(() => divide(fromInt(1), fromInt(0))).toThrow();
  });

  it("negates without ever producing negative zero", () => {
    expect(negate(rational(3, 4))).toEqual({ n: -3, d: 4 });
    expect(negate(rational(-3, 4))).toEqual({ n: 3, d: 4 });
    const negZero = negate(fromInt(0));
    expect(negZero).toEqual({ n: 0, d: 1 });
    expect(Object.is(negZero.n, -0)).toBe(false);
  });

  it("compares by cross-multiplication (ME-147)", () => {
    expect(equals(rational(1, 2), rational(2, 4))).toBe(true);
    expect(equals(rational(1, 2), rational(50, 100))).toBe(true);
    expect(equals(rational(1, 3), rational(333, 1000))).toBe(false);
    expect(compare(rational(1, 3), rational(1, 2))).toBe(-1);
    expect(compare(rational(1, 2), rational(1, 3))).toBe(1);
    expect(compare(rational(1, 2), rational(2, 4))).toBe(0);
  });

  it("detects integers and zero", () => {
    expect(isInteger(rational(4, 2))).toBe(true);
    expect(isInteger(rational(1, 2))).toBe(false);
    expect(isZero(rational(0, 7))).toBe(true);
    expect(isZero(rational(1, 7))).toBe(false);
  });

  it("exposes a float view only for display/statistics, never for judging", () => {
    expect(toNumber(rational(1, 4))).toBe(0.25);
    expect(toNumber(rational(-1, 2))).toBe(-0.5);
  });
});
