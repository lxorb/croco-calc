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

type ThemeStylesheet = {
  /** File name, e.g. `serika_dark.css`. */
  file: string;
  /** Theme name, e.g. `serika_dark`. */
  name: string;
  css: string;
  /** `css` with comments stripped — chaos_theory.css keeps a dead block on record. */
  code: string;
};

/**
 * Every theme stylesheet, read once for the whole file.
 *
 * Each case below used to do its own `readdir` + 52 serial `readFile`s. That is
 * fine on its own but not when ~40 other spec files are competing for the disk:
 * the sweeps are identical, so six of them just multiplied the I/O until cases
 * started tripping the 5 s budget at random. One memoised parallel read keeps
 * every assertion exactly as strict and costs a single sweep per run.
 */
let stylesheets: Promise<ThemeStylesheet[]> | undefined;

async function themeStylesheets(): Promise<ThemeStylesheet[]> {
  stylesheets ??= (async () => {
    const entries = await readdir(THEME_CSS_DIR);
    const files = entries.filter((f) => f.endsWith(".css")).sort();
    return Promise.all(
      files.map(async (file) => {
        const css = await readFile(path.join(THEME_CSS_DIR, file), "utf8");
        return {
          file,
          name: file.replace(/\.css$/, ""),
          css,
          code: css.replaceAll(/\/\*[\s\S]*?\*\//g, ""),
        };
      }),
    );
  })();
  return stylesheets;
}

async function themeCssFiles(): Promise<string[]> {
  return (await themeStylesheets()).map((sheet) => sheet.file);
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
    for (const { file, css } of await themeStylesheets()) {
      if (css.includes("#words")) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it("keeps the data-nav-item hooks the shell must preserve (CP-005, CP-166)", async () => {
    const navItems = new Set<string>();
    for (const { css } of await themeStylesheets()) {
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
    const byName = new Map(
      (await themeStylesheets()).map((sheet) => [sheet.name, sheet]),
    );

    const offenders: string[] = [];
    for (const [name, removed] of Object.entries(C30_REMOVED_SELECTORS)) {
      const sheet = byName.get(name);
      expect(sheet, `${name}.css`).toBeDefined();
      for (const selector of removed) {
        if ((sheet as ThemeStylesheet).code.includes(selector)) {
          offenders.push(`${name}.css: ${selector}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("added nothing but the TR-186 rename (C30 edit class b)", async () => {
    // `#taskArena` is the one selector token these files gained (TR-186). Any
    // other theme file mentioning it would mean an unaudited edit.
    const renamed: string[] = [];
    for (const { name, css } of await themeStylesheets()) {
      if (css.includes("#taskArena")) renamed.push(name);
    }

    for (const name of renamed) {
      expect(Object.keys(C30_REMOVED_SELECTORS), name).toContain(name);
    }
  });

  it("TR-019 — carries no typing vocabulary in its custom properties", async () => {
    // The rename is the point of TR-019: a live CSS custom property called
    // `--correct-letter-color` in a math trainer is exactly the typing
    // vocabulary the redesign was asked to purge. `--extra-letter-animation`
    // had no math analogue at all and was deleted outright.
    const offenders: string[] = [];
    for (const { file, code } of await themeStylesheets()) {
      if (/--\w+-letter-(color|animation)/.test(code)) offenders.push(file);
      if (code.includes("#tasks")) offenders.push(`${file} (#tasks)`);
    }
    expect(offenders).toEqual([]);
  });

  it("TR-020 — keeps --caret-color, which now themes the native caret", async () => {
    // The custom caret element is gone, but the property is not: it colours the
    // browser's own text caret inside `#answerInput`. Deleting it would have
    // silently reverted five themes to the default caret colour.
    const withCaret: string[] = [];
    for (const { name, code } of await themeStylesheets()) {
      if (code.includes("--caret-color")) withCaret.push(name);
    }
    expect(withCaret.sort()).toEqual([
      "9009",
      "bingsu",
      "phantom",
      "solarized_osaka",
      "taro",
    ]);
  });

  it("references no UI that croco calc deleted", async () => {
    // `#caret` was added to this list late, and the gap is instructive: when
    // this guard was written master C11 had *restored* the custom caret, so
    // excluding it was correct. C45 struck C11 again and deleted the element
    // (TR-254; `test.scss` records that "the custom `#caret` element is gone"),
    // but nothing pulled the theme sweep along behind it — so nine dead
    // `#caret` blocks sat in seven theme files, one of them still loading an
    // 808-byte image, with the suite green. Note the distinction from the test
    // above: the `--caret-color` *custom property* is deliberately KEPT
    // (TR-020) because it now themes the browser's own text caret inside
    // `#answerInput`; it is the `#caret` *element* that no longer exists.
    const dead =
      /#caret\b|\.word\b|\.highlight-|:not\(\.blind\)|\.pageSettings\b|\.customText\b|#keymap|\.funbox|#watchReplayButton|#watchVideoAdButton|#practiseWordsButton|#showWordHistoryButton/;

    const offenders: string[] = [];
    // `code` has comments stripped: chaos_theory.css keeps a dead block on record.
    for (const { file, code } of await themeStylesheets()) {
      if (dead.test(code)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});
