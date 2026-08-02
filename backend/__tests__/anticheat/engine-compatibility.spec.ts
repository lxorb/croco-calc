import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CURRENT_ENGINE_COMPATIBILITY,
  ENGINE_COMPATIBILITY_LEDGER,
  checkEngineCompatibility,
  checkEngineCompatibilityLedger,
} from "../../src/anticheat/engine-compatibility";
import { COMPATIBILITY_CHECK } from "@croco-calc/contracts";
import {
  MATH_ENGINE_VERSION,
  PREVIOUS_MATH_ENGINE_VERSION,
  SUPPORTED_ENGINE_VERSIONS,
} from "@croco-calc/math-engine";

/**
 * ME-184's mandatory CI check:
 *
 *   "A CI check MUST fail when `packages/math-engine/package.json`'s version
 *    changes without the compatibility constant changing."
 *
 * `.github/workflows/ci.yml` runs `pnpm test-be`, so this spec **is** that
 * check. `ci.yml` belongs to WP-12; a dedicated named step would read better in
 * the job list but would not make the gate any harder to get past, and this
 * needs no cross-package edit to start working.
 *
 * The gate is only real because it fails. Every rule below has a rejecting case
 * driven through `checkEngineCompatibilityLedger`, not just an assertion that
 * today's numbers happen to line up.
 */

function packageVersion(): string {
  // vitest's cwd is `backend/`.
  const raw = readFileSync(
    resolve(process.cwd(), "../packages/math-engine/package.json"),
    "utf8",
  );
  return (JSON.parse(raw) as { version: string }).version;
}

describe("ME-184 — the engine/compatibility coupling holds today", () => {
  it("has no violations", () => {
    expect(checkEngineCompatibility()).toEqual([]);
    expect(checkEngineCompatibilityLedger(packageVersion())).toEqual([]);
  });

  it("MATH_ENGINE_VERSION equals packages/math-engine/package.json", () => {
    // Without this the gate could be walked past by bumping only the package.
    expect(MATH_ENGINE_VERSION).toBe(packageVersion());
  });

  it("the ledger's last row is the version this build ships", () => {
    expect(CURRENT_ENGINE_COMPATIBILITY.engineVersion).toBe(
      MATH_ENGINE_VERSION,
    );
  });

  it("that row carries the COMPATIBILITY_CHECK the middleware serves", () => {
    expect(CURRENT_ENGINE_COMPATIBILITY.compatibilityCheck).toBe(
      COMPATIBILITY_CHECK,
    );
  });

  it("no compatibility number is reused across engine versions", () => {
    const numbers = ENGINE_COMPATIBILITY_LEDGER.map(
      (r) => r.compatibilityCheck,
    );
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it("no engine version appears twice", () => {
    const versions = ENGINE_COMPATIBILITY_LEDGER.map((r) => r.engineVersion);
    expect(new Set(versions).size).toBe(versions.length);
  });

  it("the ledger is never empty", () => {
    expect(ENGINE_COMPATIBILITY_LEDGER.length).toBeGreaterThan(0);
  });
});

describe("ME-184 — the gate actually fails", () => {
  it("rejects an engine bump that did not append a ledger row", () => {
    // Exactly the regression ME-184 names: `package.json` moved, nothing else.
    const violations = checkEngineCompatibilityLedger("1.1.0");
    expect(violations.map((v) => v.code)).toContain(
      "engine-version-not-in-ledger",
    );
  });

  it("names both the offending version and the remedy", () => {
    const [violation] = checkEngineCompatibilityLedger("2.0.0");
    expect(violation?.message).toContain("2.0.0");
    expect(violation?.message).toContain("COMPATIBILITY_CHECK");
    expect(violation?.message).toContain("ME-184");
  });

  it("passes for the version the ledger does record", () => {
    expect(
      checkEngineCompatibilityLedger(
        CURRENT_ENGINE_COMPATIBILITY.engineVersion,
      ),
    ).toEqual([]);
  });
});

describe("ME-177 — the rollout window is exactly two versions", () => {
  it("accepts current, and current - 1 when one exists", () => {
    expect(SUPPORTED_ENGINE_VERSIONS).toContain(MATH_ENGINE_VERSION);
    expect(SUPPORTED_ENGINE_VERSIONS.length).toBe(
      PREVIOUS_MATH_ENGINE_VERSION === null ? 1 : 2,
    );
    expect(SUPPORTED_ENGINE_VERSIONS.length).toBeLessThanOrEqual(2);
  });

  it("never lists a version the ledger has not shipped", () => {
    const shipped = new Set(
      ENGINE_COMPATIBILITY_LEDGER.map((r) => r.engineVersion),
    );
    for (const version of SUPPORTED_ENGINE_VERSIONS) {
      expect(shipped.has(version), version).toBe(true);
    }
  });
});
