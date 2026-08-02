/**
 * ME-178 — the shared, runner-agnostic golden-vector suite.
 *
 * WP-02's exit criterion and DoD-18 require every golden vector to reproduce
 * byte-identically **under both the frontend and the backend vitest projects**.
 * Those two projects are owned by WP-06 and WP-10, so this package cannot add a
 * spec file to either of them. What it can do is ship the suite itself, with the
 * runner injected, so each side needs exactly three lines and cannot drift into
 * a locally-rewritten variant of the checks.
 *
 * `frontend/__tests__/math/golden-vectors.spec.ts` and
 * `backend/__tests__/math/golden-vectors.spec.ts` (verbatim, both files):
 *
 * ```ts
 * import { describe, it } from "vitest";
 * import { runGoldenVectorSuite } from "@croco-calc/math-engine";
 *
 * runGoldenVectorSuite({ describe, it });
 * ```
 *
 * plus `"@croco-calc/math-engine": "workspace:*"` in that package's
 * `devDependencies`. Nothing else is required: the suite imports no test
 * framework, so ME-002's "no dependencies" still holds.
 */

import { GOLDEN_VECTORS, verifyGoldenVectors } from "./golden-vectors";
import type { GoldenVector } from "./golden-vectors";

/**
 * The minimal slice of a test runner the suite needs. Structurally satisfied by
 * vitest's `describe`/`it` (and by jest's, and by node:test's), without this
 * package importing any of them.
 */
export type TestRunner = {
  describe: (name: string, body: () => void) => void;
  it: (name: string, body: () => void) => void;
};

/**
 * Registers one test per golden vector, plus a whole-fixture check.
 *
 * Throws (rather than using an `expect`) so the suite stays independent of any
 * assertion library; every runner reports a thrown error as a failed test.
 */
export function runGoldenVectorSuite(
  runner: TestRunner,
  vectors: readonly GoldenVector[] = GOLDEN_VECTORS,
): void {
  runner.describe("ME-178: golden vectors reproduce in this runtime", () => {
    runner.it("has the full fixture available", () => {
      if (vectors.length < 10) {
        throw new Error(
          `expected at least 10 golden vectors, got ${vectors.length}`,
        );
      }
    });

    for (const vector of vectors) {
      runner.it(`reproduces ${vector.id}`, () => {
        const failures = verifyGoldenVectors([vector]);
        if (failures.length > 0) throw new Error(failures.join("\n"));
      });
    }

    runner.it("reproduces the whole fixture", () => {
      const failures = verifyGoldenVectors(vectors);
      if (failures.length > 0) throw new Error(failures.join("\n"));
    });
  });
}
