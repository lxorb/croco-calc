import { expect } from "vitest";
import {
  REQUEST_MULTIPLIER,
  requestLimiters,
} from "../../src/middlewares/rate-limit";
import { MatcherResult, ExpectedRateLimit } from "../vitest";
import { Test as SuperTest } from "supertest";

export function enableRateLimitExpects(): void {
  expect.extend({
    toBeRateLimited: async (
      received: SuperTest,
      expected: ExpectedRateLimit,
    ): Promise<MatcherResult> => {
      // `x-ratelimit-reset` reports when the CURRENT window ends, not how long
      // a window lasts. The bucket key is the uid, which `setup()` allocates
      // once per spec file, so every earlier request in the file has already
      // opened the window and this read would land mid-window and under-report
      // the length. How far it under-reports depends on how long the preceding
      // tests took, which under parallel CI load is enough to break a fixed
      // tolerance. Clearing the bucket first makes the measured request open a
      // fresh window, so the reading is deterministic.
      for (const limiter of Object.values(requestLimiters)) {
        limiter.resetKey(expected.key);
      }

      const now = Date.now();
      const { headers } = await received.expect(200);

      const max =
        parseInt(headers["x-ratelimit-limit"] as string) / REQUEST_MULTIPLIER;
      const windowMs =
        parseInt(headers["x-ratelimit-reset"] as string) * 1000 - now;

      return {
        pass:
          max === expected.max && Math.abs(expected.windowMs - windowMs) < 2500,
        message: () =>
          "Rate limit max not matching or windowMs is off by more then 2500ms",
        actual: { max, windowMs },
        expected: expected,
      };
    },
  });
}
