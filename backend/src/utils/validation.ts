import { CompletedEvent } from "@croco-calc/schemas/results";

/**
 * croco calc has exactly one test mode: a fixed 1/2/4/8 minute timed test
 * (INV-174, master C31), and no bail-out concept at all (master C38, AC-187).
 * A run is therefore too short only if it did not last the configured duration.
 * The authoritative `testDuration === time * 60` check is ME-182 and lives in
 * the anti-cheat layer (WP-10); this is the cheap guard the result controller
 * uses before it gets there.
 */
const MIN_TEST_DURATION_SECONDS = 60;

export function isTestTooShort(result: CompletedEvent): boolean {
  return result.testDuration < MIN_TEST_DURATION_SECONDS;
}
