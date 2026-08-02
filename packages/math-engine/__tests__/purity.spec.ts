/**
 * ME-002 / ME-166 — the package is pure and dependency-free.
 *
 * The `.oxlintrc.json` in this package carries a `no-restricted-syntax` rule for
 * `Math.random`; this suite is the belt-and-braces version that survives a
 * linter swap and also covers the other purity clauses of ME-002.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("../src", import.meta.url));
const PACKAGE_JSON = fileURLToPath(new URL("../package.json", import.meta.url));

function sourceFiles(dir = SRC): string[] {
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) found.push(...sourceFiles(path));
    else if (name.endsWith(".ts")) found.push(path);
  }
  return found;
}

const files = sourceFiles();

/** Strips comments so a rule's own explanatory prose does not trip it. */
function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("ME-166: Math.random appears nowhere in the package", () => {
  it("finds source files to check", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it("has no Math.random reference in any source file", () => {
    const offenders = files.filter((path) =>
      /Math\s*\.\s*random/.test(code(path)),
    );
    expect(offenders).toEqual([]);
  });

  it("has the lint rule configured as a second line of defence", () => {
    const config = readFileSync(
      fileURLToPath(new URL("../.oxlintrc.json", import.meta.url)),
      "utf8",
    );
    expect(config).toContain("no-restricted-properties");
    expect(config).toContain('"object": "Math"');
    expect(config).toContain('"property": "random"');
  });
});

describe("ME-002: the engine is pure", () => {
  it("has no DOM access", () => {
    const offenders = files.filter((path) =>
      /\b(document|window|localStorage|navigator)\s*\./.test(code(path)),
    );
    expect(offenders).toEqual([]);
  });

  it("has no network access", () => {
    const offenders = files.filter((path) =>
      /\b(fetch|XMLHttpRequest|WebSocket)\s*\(/.test(code(path)),
    );
    expect(offenders).toEqual([]);
  });

  it("has no Date.now or new Date", () => {
    const offenders = files.filter((path) =>
      /Date\s*\.\s*now|new\s+Date\b/.test(code(path)),
    );
    expect(offenders).toEqual([]);
  });

  it("touches crypto only in createTestSeed, which is outside generation (ME-169)", () => {
    const offenders = files.filter(
      (path) => /\bcrypto\b/.test(code(path)) && !path.endsWith("generate.ts"),
    );
    expect(offenders).toEqual([]);
  });

  it("has no runtime dependencies at all", () => {
    const pkg = JSON.parse(readFileSync(PACKAGE_JSON, "utf8")) as {
      dependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };
    expect(pkg.dependencies ?? {}).toEqual({});
    expect(pkg.peerDependencies ?? {}).toEqual({});
  });

  it("imports nothing from outside the package", () => {
    const offenders: string[] = [];
    for (const path of files) {
      const source = code(path);
      const pattern = /from\s+"([^"]+)"/g;
      let match = pattern.exec(source);
      while (match !== null) {
        const specifier = match[1] as string;
        if (!specifier.startsWith(".")) offenders.push(`${path}: ${specifier}`);
        match = pattern.exec(source);
      }
    }
    expect(offenders).toEqual([]);
  });
});
