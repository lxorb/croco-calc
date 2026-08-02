import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { themes, ThemesList } from "../../src/ts/constants/themes";

const THEME_CSS_DIR = path.resolve(__dirname, "../../static/themes");

async function themeCssFiles(): Promise<string[]> {
  const entries = await readdir(THEME_CSS_DIR);
  return entries.filter((f) => f.endsWith(".css")).sort();
}

describe("theme palettes (INV-061, CP-165)", () => {
  it("keeps all 187 palettes", () => {
    expect(Object.keys(themes)).toHaveLength(187);
    expect(ThemesList).toHaveLength(187);
  });

  it("gives every palette all ten colours", () => {
    const required = [
      "bg",
      "main",
      "caret",
      "sub",
      "subAlt",
      "text",
      "error",
      "errorExtra",
      "colorfulError",
      "colorfulErrorExtra",
    ] as const;

    for (const [name, theme] of Object.entries(themes)) {
      for (const key of required) {
        expect(theme[key], `${name}.${key}`).toMatch(
          /^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/,
        );
      }
    }
  });
});

describe("theme stylesheets (C30, CP-164, INV-062, INV-119)", () => {
  it("still ships all 52 files", async () => {
    expect(await themeCssFiles()).toHaveLength(52);
  });

  it("has a file for every hasCss palette and no orphans", async () => {
    const declared = Object.entries(themes)
      .filter(([, theme]) => theme.hasCss === true)
      .map(([name]) => `${name}.css`)
      .sort();

    expect(await themeCssFiles()).toEqual(declared);
  });

  it("has no #words selector left anywhere (CP-020)", async () => {
    const offenders: string[] = [];
    for (const file of await themeCssFiles()) {
      const css = await readFile(path.join(THEME_CSS_DIR, file), "utf8");
      if (css.includes("#words")) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it("keeps the data-nav-item hooks the shell must preserve (CP-005, CP-166)", async () => {
    const navItems = new Set<string>();
    for (const file of await themeCssFiles()) {
      const css = await readFile(path.join(THEME_CSS_DIR, file), "utf8");
      for (const match of css.matchAll(/\[data-nav-item="([a-z]+)"\]/g)) {
        navItems.add(match[1] as string);
      }
    }

    // Every value the theme files colour through must survive in Nav.tsx.
    expect([...navItems].sort()).toEqual([
      "about",
      "account",
      "alerts",
      "leaderboards",
      "login",
      "settings",
      "test",
    ]);
  });

  it("references no UI that croco calc deleted", async () => {
    const dead =
      /\.word\b|\.highlight-|:not\(\.blind\)|\.pageSettings\b|\.customText\b|#keymap|\.funbox|#watchReplayButton|#watchVideoAdButton|#practiseWordsButton|#showWordHistoryButton/;

    const offenders: string[] = [];
    for (const file of await themeCssFiles()) {
      const css = await readFile(path.join(THEME_CSS_DIR, file), "utf8");
      // Strip comments: chaos_theory.css keeps a commented-out block on record.
      if (dead.test(css.replaceAll(/\/\*[\s\S]*?\*\//g, ""))) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});
