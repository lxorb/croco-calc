import { expect } from "vitest";
import CrocoError from "../../src/utils/error";
import { MatcherResult } from "../vitest";

export function enableCrocoErrorExpects(): void {
  expect.extend({
    toMatchCrocoError(
      received: CrocoError,
      expected: CrocoError,
    ): MatcherResult {
      return {
        pass:
          received.status === expected.status &&
          received.message === expected.message,
        message: () => "CrocoError does not match:",
        actual: { status: received.status, message: received.message },
        expected: { status: expected.status, message: expected.message },
      };
    },
  });
}
