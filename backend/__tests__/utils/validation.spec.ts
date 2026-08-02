import { describe, it, expect } from "vitest";
import * as Validation from "../../src/utils/validation";

describe("Validation", () => {
  it("isTestTooShort", () => {
    const testCases = [
      // shorter than the shortest configurable test (1 minute)
      { result: { testDuration: 10 }, expected: true },
      { result: { testDuration: 59 }, expected: true },
      // the four legal test lengths
      { result: { testDuration: 60 }, expected: false },
      { result: { testDuration: 120 }, expected: false },
      { result: { testDuration: 240 }, expected: false },
      { result: { testDuration: 480 }, expected: false },
    ];

    testCases.forEach((testCase) => {
      expect(Validation.isTestTooShort(testCase.result as never)).toBe(
        testCase.expected,
      );
    });
  });
});
