import { describe, it, expect, afterAll, vi } from "vitest";
import * as Misc from "../../src/utils/misc";
import { ObjectId } from "mongodb";

describe("Misc Utils", () => {
  afterAll(() => {
    vi.useRealTimers();
  });

  describe("matchesAPattern", () => {
    const testCases = [
      {
        pattern: "eng.*",
        cases: ["english", "aenglish", "en", "eng"],
        expected: [true, false, false, true],
      },

      {
        pattern: "\\d+",
        cases: ["b", "2", "331", "1a"],
        expected: [false, true, true, false],
      },
      {
        pattern: "(hi|hello)",
        cases: ["hello", "hi", "hillo", "hi hello"],
        expected: [true, true, false, false],
      },
      {
        pattern: ".+",
        cases: ["a2", "b2", "c1", ""],
        expected: [true, true, true, false],
      },
    ];

    it.each(testCases)(
      "matchesAPattern with $pattern",
      ({ pattern, cases, expected }) => {
        cases.forEach((caseValue, index) => {
          expect(Misc.matchesAPattern(caseValue, pattern)).toBe(
            expected[index],
          );
        });
      },
    );
  });

  describe("identity", () => {
    const testCases = [
      {
        input: "",
        expected: "string",
      },
      {
        input: {},
        expected: "object",
      },
      {
        input: 0,
        expected: "number",
      },
      {
        input: null,
        expected: "null",
      },
      {
        input: undefined,
        expected: "undefined",
      },
    ];
    it.each(testCases)(
      "identity with $input = $expected",
      ({ input, expected }) => {
        expect(Misc.identity(input)).toBe(expected);
      },
    );
  });

  describe("flattenObjectDeep", () => {
    const testCases = [
      {
        obj: {
          a: {
            b: {
              c: 1,
            },
          },
          d: 2,
          e: [],
        },
        expected: {
          "a.b.c": 1,
          d: 2,
          e: [],
        },
      },
      {
        obj: {
          a: {
            b: {
              c: 1,
            },
          },
          d: {
            e: {
              f: 2,
              g: 3,
            },
          },
        },
        expected: {
          "a.b.c": 1,
          "d.e.f": 2,
          "d.e.g": 3,
        },
      },
      {
        obj: {
          a: {
            b: {
              c: 1,
              d: {
                e: 2,
                f: 3,
                g: {},
              },
            },
          },
        },
        expected: {
          "a.b.c": 1,
          "a.b.d.e": 2,
          "a.b.d.f": 3,
          "a.b.d.g": {},
        },
      },
      {
        obj: {},
        expected: {},
      },
    ];

    it.each(testCases)(
      "flattenObjectDeep with $obj = $expected",
      ({ obj, expected }) => {
        expect(Misc.flattenObjectDeep(obj)).toEqual(expected);
      },
    );
  });

  it("getOrdinalNumberString", () => {
    const testCases = [
      {
        input: 0,
        output: "0th",
      },
      {
        input: 1,
        output: "1st",
      },
      {
        input: 2,
        output: "2nd",
      },
      {
        input: 3,
        output: "3rd",
      },
      {
        input: 4,
        output: "4th",
      },
      {
        input: 10,
        output: "10th",
      },
      {
        input: 11,
        output: "11th",
      },
      {
        input: 12,
        output: "12th",
      },
      {
        input: 13,
        output: "13th",
      },
      {
        input: 100,
        output: "100th",
      },
      {
        input: 101,
        output: "101st",
      },
      {
        input: 102,
        output: "102nd",
      },
      {
        input: 103,
        output: "103rd",
      },
      {
        input: 104,
        output: "104th",
      },
      {
        input: 93589423,
        output: "93589423rd",
      },
    ];

    testCases.forEach(({ input, output }) => {
      expect(Misc.getOrdinalNumberString(input)).toEqual(output);
    });
  });
  it("formatSeconds", () => {
    const testCases = [
      {
        seconds: 5,
        expected: "5 seconds",
      },
      {
        seconds: 65,
        expected: "1.08 minutes",
      },
      {
        seconds: Misc.HOUR_IN_SECONDS,
        expected: "1 hour",
      },
      {
        seconds: Misc.DAY_IN_SECONDS,
        expected: "1 day",
      },
      {
        seconds: Misc.WEEK_IN_SECONDS,
        expected: "1 week",
      },
      {
        seconds: Misc.YEAR_IN_SECONDS,
        expected: "1 year",
      },
      {
        seconds: 2 * Misc.YEAR_IN_SECONDS,
        expected: "2 years",
      },
      {
        seconds: 4 * Misc.YEAR_IN_SECONDS,
        expected: "4 years",
      },
      {
        seconds: 3 * Misc.WEEK_IN_SECONDS,
        expected: "3 weeks",
      },
      {
        seconds: Misc.MONTH_IN_SECONDS * 4,
        expected: "4 months",
      },
      {
        seconds: Misc.MONTH_IN_SECONDS * 11,
        expected: "11 months",
      },
    ];

    testCases.forEach(({ seconds, expected }) => {
      expect(Misc.formatSeconds(seconds)).toBe(expected);
    });
  });

  describe("replaceObjectId", () => {
    it("replaces objecId with string", () => {
      const fromDatabase = {
        _id: new ObjectId(),
        test: "test",
        number: 1,
      };
      expect(Misc.replaceObjectId(fromDatabase)).toStrictEqual({
        _id: fromDatabase._id.toHexString(),
        test: "test",
        number: 1,
      });
    });
    it("ignores null values", () => {
      expect(Misc.replaceObjectId(null)).toBeNull();
    });
  });

  describe("replaceObjectIds", () => {
    it("replaces objecIds with string", () => {
      const fromDatabase = {
        _id: new ObjectId(),
        test: "test",
        number: 1,
      };
      const fromDatabase2 = {
        _id: new ObjectId(),
        test: "bob",
        number: 2,
      };
      expect(
        Misc.replaceObjectIds([fromDatabase, fromDatabase2]),
      ).toStrictEqual([
        {
          _id: fromDatabase._id.toHexString(),
          test: "test",
          number: 1,
        },
        {
          _id: fromDatabase2._id.toHexString(),
          test: "bob",
          number: 2,
        },
      ]);
    });
    it("handles undefined", () => {
      expect(Misc.replaceObjectIds(undefined as any)).toBeUndefined();
    });
  });

  describe("omit()", () => {
    it("should omit a single key", () => {
      const input = { a: 1, b: 2, c: 3 };
      const result = Misc.omit(input, ["b"]);
      expect(result).toEqual({ a: 1, c: 3 });
    });

    it("should omit multiple keys", () => {
      const input = { a: 1, b: 2, c: 3, d: 4 };
      const result = Misc.omit(input, ["a", "d"]);
      expect(result).toEqual({ b: 2, c: 3 });
    });

    it("should return the same object if no keys are omitted", () => {
      const input = { x: 1, y: 2 };
      const result = Misc.omit(input, []);
      expect(result).toEqual({ x: 1, y: 2 });
    });

    it("should not mutate the original object", () => {
      const input = { foo: "bar", baz: "qux" };
      const copy = { ...input };
      Misc.omit(input, ["baz"]);
      expect(input).toEqual(copy);
    });

    it("should ignore keys that do not exist", () => {
      const input = { a: 1, b: 2 };
      const result = Misc.omit(input, "c" as any); // allow a non-existing key
      expect(result).toEqual({ a: 1, b: 2 });
    });

    it("should work with different value types", () => {
      const input = {
        str: "hello",
        num: 123,
        bool: true,
        obj: { x: 1 },
        arr: [1, 2, 3],
      };
      const result = Misc.omit(input, ["bool", "arr"]);
      expect(result).toEqual({
        str: "hello",
        num: 123,
        obj: { x: 1 },
      });
    });
  });

  describe("isPlainObject", () => {
    it("should return true for plain objects", () => {
      expect(Misc.isPlainObject({})).toBe(true);
      expect(Misc.isPlainObject({ a: 1, b: 2 })).toBe(true);
      expect(Misc.isPlainObject(Object.create(Object.prototype))).toBe(true);
    });

    it("should return false for arrays", () => {
      expect(Misc.isPlainObject([])).toBe(false);
      expect(Misc.isPlainObject([1, 2, 3])).toBe(false);
    });

    it("should return false for null", () => {
      expect(Misc.isPlainObject(null)).toBe(false);
    });

    it("should return false for primitives", () => {
      expect(Misc.isPlainObject(123)).toBe(false);
      expect(Misc.isPlainObject("string")).toBe(false);
      expect(Misc.isPlainObject(true)).toBe(false);
      expect(Misc.isPlainObject(undefined)).toBe(false);
      expect(Misc.isPlainObject(Symbol("sym"))).toBe(false);
    });

    it("should return false for objects with different prototypes", () => {
      // oxlint-disable-next-line no-extraneous-class
      class MyClass {}
      expect(Misc.isPlainObject(new MyClass())).toBe(false);
      expect(Misc.isPlainObject(Object.create(null))).toBe(false);
      expect(Misc.isPlainObject(new Date())).toBe(false);
      expect(Misc.isPlainObject(new Map())).toBe(false);
      expect(Misc.isPlainObject(new Set())).toBe(false);
    });

    it("should return false for functions", () => {
      // oxlint-disable-next-line no-empty-function
      expect(Misc.isPlainObject(function () {})).toBe(false);
      // oxlint-disable-next-line no-empty-function
      expect(Misc.isPlainObject(() => {})).toBe(false);
    });
  });
});
