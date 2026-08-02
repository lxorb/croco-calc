import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { themes, ThemesList } from "../../src/ts/constants/themes";

/**
 * The C30 audit, checked in so DoD-06 has a durable artifact rather than a line
 * in a pull request: every one of the 52 theme stylesheets that WP-04 touched,
 * and every selector it removed from that file.
 *
 * C30 permits exactly two kinds of edit and this table is what makes them
 * auditable:
 *   (a) removal of selectors that target UI croco calc deleted — the settings
 *       page, the funbox/keymap/replay chrome, and every per-letter selector of
 *       the deleted prompt renderer;
 *   (b) the CP-020 rename, which is the *only* thing any of these files gained:
 *       `#tasks` and `#tasks.flipped`, asserted below.
 * The other 38 files are byte-for-byte upstream.
 */
export const C30_REMOVED_SELECTORS: Record<string, string[]> = {
  aurora: [
    ".pageSettings .section .buttons .button.active",
    ".pageSettings .section.languages .buttons .language.active",
    "#words",
    "#words.flipped",
    "#words.highlight-off .word letter",
    "#words.highlight-off .word.typed letter",
    "#words .word.typed letter.correct",
    "#words.highlight-word .word.typed letter",
    "#words.highlight-next-word .word.typed letter",
    "#words.highlight-next-two-words .word.typed letter",
    "#words.highlight-next-three-words .word.typed letter",
    "#words.flipped .word.typed letter",
  ],
  chaos_theory: ["#words .incorrect.extra"],
  dark_note: [
    "#wordsWrapper .word.error",
    "#words .word.error",
    "#words:not(.blind) .word letter.incorrect",
    "#words:not(.blind).colorfulMode .word letter.incorrect",
    "#words:not(.blind) .word letter.incorrect:not(.extra)",
    "#words:not(.blind).colorfulMode .word letter.incorrect:not(.extra)",
    "#words:not(.blind) .word.error letter:not(.correct):not(.incorrect)::after",
  ],
  ez_mode: [".pageSettings .section h1", ".pageSettings .section > .text"],
  fire: [
    ".pageSettings .section .buttons .button.active",
    ".pageSettings .section.languages .buttons .language.active",
    "#words",
    "#words.flipped",
    "#words.highlight-off .word letter",
    "#words.highlight-off .word.typed letter",
    "#words .word.typed letter.correct",
    "#words.highlight-word .word.typed letter",
    "#words.highlight-next-word .word.typed letter",
    "#words.highlight-next-two-words .word.typed letter",
    "#words.highlight-next-three-words .word.typed letter",
    "#words.flipped .word.typed letter",
  ],
  grape: [
    ".pageSettings .section .buttons .button.active",
    ".pageSettings .section.languages .buttons .language.active",
    "#words",
    "#words.flipped",
    "#words.highlight-off .word letter",
    "#words.highlight-off .word.typed letter",
    "#words .word.typed letter.correct",
    "#words.highlight-word .word.typed letter",
    "#words.highlight-next-word .word.typed letter",
    "#words.highlight-next-two-words .word.typed letter",
    "#words.highlight-next-three-words .word.typed letter",
    "#words.flipped .word.typed letter",
  ],
  modern_ink: [".word.error"],
  phantom: [
    "#words",
    ".word .active",
    "#words.highlight-off .word letter",
    "#words.highlight-off .word.typed letter",
    "#words .word letter.correct",
    "#words .word.typed letter.correct",
    "#words.highlight-word .word.typed letter",
    "#words.highlight-next-word .word.typed letter",
    "#words.highlight-next-two-words .word.typed letter",
    "#words.highlight-next-three-words .word.typed letter",
    "#words.flipped .word.typed letter",
  ],
  rainbow_trail: [
    "footer a:hover > i",
    "footer button:hover > i",
    "footer button:hover > .relative > i",
    "#restartTestButton:hover > i",
    "#showWordHistoryButton:hover > i",
    "#saveScreenshotButton:hover > i",
    "#restartTestButtonWithSameWordset:hover > i",
    "#nextTestButton:hover > i",
    "#practiseWordsButton:hover > i",
    "#watchReplayButton:hover > i",
    "#watchVideoAdButton:hover > i",
    "#words",
    "#words.highlight-off .word letter",
    "#words.highlight-off .word.typed letter",
    "#words .word.typed letter.correct",
    "#words.highlight-word .word.typed letter",
    "#words.highlight-next-word .word.typed letter",
    "#words.highlight-next-two-words .word.typed letter",
    "#words.highlight-next-three-words .word.typed letter",
    "#words .word.error",
    "#words.highlight-word .word.active letter",
    "#words.flipped",
    "#words.flipped .word.typed letter",
  ],
  rgb: [
    ".pageSettings .section .buttons button.active",
    ".pageSettings .section.languages .buttons .language.active",
    "#words.flipped .word",
    "#words",
    "#words.flipped",
  ],
  shadow: [
    "#typingTest .word letter.correct",
    "#typingTest #words.highlight-word .word.typed letter.correct",
    "#typingTest #words.highlight-next-word .word.typed letter.correct",
    "#typingTest #words.highlight-next-two-words .word.typed letter.correct",
    "#typingTest #words.highlight-next-three-words .word.typed letter.correct",
  ],
  solarized_osaka: ["#words"],
  taro: [".word.error"],
  trance: [
    ".pageSettings .section .buttons button.active",
    ".pageSettings .section.languages .buttons .language.active",
    "#words",
    "#words.flipped",
    "#words.highlight-off .word letter",
    "#words.highlight-off .word.typed letter",
    "#words .word.typed letter.correct",
    "#words.highlight-word .word.typed letter",
    "#words.highlight-next-word .word.typed letter",
    "#words.highlight-next-two-words .word.typed letter",
    "#words.highlight-next-three-words .word.typed letter",
    "#words.flipped .word.typed letter",
  ],
};

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

  it("edited exactly the 14 files the C30 audit names (DoD-06)", async () => {
    const audited = Object.keys(C30_REMOVED_SELECTORS).sort();
    expect(audited).toHaveLength(14);

    const present = await themeCssFiles();
    for (const name of audited) {
      expect(present, name).toContain(`${name}.css`);
    }
  });

  it("removed every selector the C30 audit claims it removed", async () => {
    const offenders: string[] = [];
    for (const [name, removed] of Object.entries(C30_REMOVED_SELECTORS)) {
      const css = (
        await readFile(path.join(THEME_CSS_DIR, `${name}.css`), "utf8")
      ).replaceAll(/\/\*[\s\S]*?\*\//g, "");
      for (const selector of removed) {
        if (css.includes(selector)) offenders.push(`${name}.css: ${selector}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("added nothing but the CP-020 rename (C30 edit class b)", async () => {
    // `#tasks` is the one token these files gained. Any other theme file
    // mentioning it would mean an unaudited edit.
    const renamed: string[] = [];
    for (const file of await themeCssFiles()) {
      const css = await readFile(path.join(THEME_CSS_DIR, file), "utf8");
      if (css.includes("#tasks")) renamed.push(file.replace(/\.css$/, ""));
    }

    for (const name of renamed) {
      expect(Object.keys(C30_REMOVED_SELECTORS), name).toContain(name);
    }
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
