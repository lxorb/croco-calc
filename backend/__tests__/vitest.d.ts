// oxlint-disable typescript/consistent-type-definitions
import type { Assertion, AsymmetricMatchersContaining } from "vitest";
import type { Test as SuperTest } from "supertest";
import CrocoError from "../src/utils/error";

type ExpectedRateLimit = {
  /** max calls */
  max: number;
  /** window in milliseconds. Needs to be within 2500ms */
  windowMs: number;
  /**
   * The rate-limit bucket key — the `uid` the request authenticates as.
   *
   * Every test in a spec file shares one bucket, so by the time this assertion
   * runs an earlier request has usually already opened the window. Passing the
   * key lets the matcher clear the bucket first, so the measured request opens
   * a fresh window and `x-ratelimit-reset` reports a full one.
   */
  key: string;
};
interface RestRequestMatcher<R = Supertest> {
  toBeRateLimited: (
    expected: ExpectedRateLimit,
  ) => Promise<RestRequestMatcher<R>>;
}
interface ThrowMatcher {
  toMatchCrocoError: (expected: {
    status: number;
    message: string;
  }) => MatcherResult;
}

declare module "vitest" {
  interface Assertion<T = any> extends RestRequestMatcher<T>, ThrowMatcher {}
  interface AsymmetricMatchersContaining
    extends RestRequestMatcher, ThrowMatcher {}
}

interface MatcherResult {
  pass: boolean;
  message: () => string;
  actual?: unknown;
  expected?: unknown;
}
