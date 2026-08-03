import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Stylesheet invariants for the task arena (TR-296 / TR-325, TR-300, TR-057).
 *
 * ## Why this file exists
 *
 * Two of the arena's requirements are *layout* requirements, and jsdom has no
 * layout engine: `getBoundingClientRect()` is all zeros, so measuring is not an
 * option. The first attempt at TR-325 dealt with that by asserting that the
 * string `min-height: 1.35em` appears in `test.scss` — which is true, was true
 * while `.mathParen--tall { font-size: 2em; line-height: 1 }` grew the prompt
 * to 2em, and therefore proved nothing. `#taskRule` and `#answerInput` moved
 * 20.85px down the page on every parenthesised fraction with that test green.
 *
 * The observation that makes a real test possible: **every height in the arena
 * is a number this stylesheet states outright.** Everything `typesetInto`
 * emits is a flex item of `.mathRow`, so the row's height is the maximum of its
 * items' heights, and each of those is `font-size × line-height` (or, for
 * `.mathFrac`, two storeys plus a bar plus its margins) — all of them declared,
 * all of them in `em`. So this spec reads the declarations out of the
 * stylesheet and does the arithmetic the browser would do.
 *
 * That is not a measurement, and it is not claimed to be one. It is an
 * assertion about the *inputs* to the measurement, and unlike a substring check
 * it fails when the inputs stop satisfying the requirement: the pre-remediation
 * `2em; line-height: 1` produces a 2em row against a 1.35em reservation and
 * trips the first expectation below.
 *
 * ## The two measured constants
 *
 * `PAREN_INK_HALF_PER_EM` and `STACK_INK_HALF_EM` are the one thing that cannot
 * be derived from the stylesheet, because they are properties of the *font*.
 * Both were read with canvas `TextMetrics` against the two shipped webfonts in
 * a real browser (see `frontend/static/webfonts/`), per 100px:
 *
 * | | Roboto Mono (default) | Lexend Deca |
 * |---|---|---|
 * | `(` ink ascent / descent | 81 / 24 | — |
 * | `8` ink ascent | 73 | — |
 * | ⇒ paren ink half-height | `0.525em` | `0.450em` |
 * | ⇒ stack ink half-height | `0.5475em` | `0.5450em` |
 *
 * The worst case for *overflow* is the largest ink (Roboto Mono, 0.525) and the
 * worst case for *enclosure* is the smallest (Lexend Deca, 0.450), so both
 * bounds below are checked against the font that stresses them.
 */

const SCSS = readFileSync(
  path.resolve(__dirname, "../../src/styles/test.scss"),
  "utf8",
);

/** Measured: `(` ink half-height, as a fraction of its own font-size. */
const PAREN_INK_HALF_ROBOTO_MONO = 0.525;
const PAREN_INK_HALF_LEXEND_DECA = 0.45;
/** Measured: the fraction stack's ink half-height, in prompt `em`. */
const STACK_INK_HALF_EM = 0.5475;

type Decls = Map<string, string>;

/**
 * A deliberately small SCSS reader: enough to resolve `&`-nested selectors and
 * comma lists in *this* file, and no more. It is not a CSS parser and must not
 * grow into one — if `test.scss` ever needs more than this, the right move is a
 * real browser-based layout test, not a bigger parser.
 */
function parseScss(source: string): Map<string, Decls> {
  const clean = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/[^\n]*/g, "$1");

  const rules = new Map<string, Decls>();
  const stack: string[][] = [];
  let buffer = "";

  const resolve = (selector: string): string[] => {
    const parents = stack.at(-1) ?? [""];
    return selector.split(",").flatMap((rawPart) => {
      const part = rawPart.trim();
      return parents.map((parent) => {
        if (parent === "") return part;
        if (part.startsWith("&")) return parent + part.slice(1);
        return `${parent} ${part}`;
      });
    });
  };

  for (const char of clean) {
    if (char === "{") {
      stack.push(resolve(buffer));
      buffer = "";
    } else if (char === "}") {
      stack.pop();
      buffer = "";
    } else if (char === ";") {
      const colon = buffer.indexOf(":");
      if (colon > 0) {
        const property = buffer.slice(0, colon).trim();
        const value = buffer.slice(colon + 1).trim();
        for (const selector of stack.at(-1) ?? []) {
          const existing = rules.get(selector) ?? new Map<string, string>();
          existing.set(property, value);
          rules.set(selector, existing);
        }
      }
      buffer = "";
    } else {
      buffer += char;
    }
  }
  return rules;
}

const RULES = parseScss(SCSS);

function decls(selector: string): Decls {
  const found = RULES.get(selector);
  if (found === undefined) throw new Error(`no rule for \`${selector}\``);
  return found;
}

function declaration(selector: string, property: string): string {
  const value = decls(selector).get(property);
  if (value === undefined) {
    throw new Error(`\`${selector}\` declares no \`${property}\``);
  }
  return value;
}

/** `1.35em` → 1.35. Only `em` is accepted: a `px` here would break the scale. */
function em(selector: string, property: string): number {
  const value = declaration(selector, property).split(/\s+/)[0] ?? "";
  const match = /^(-?[\d.]+)em$/.exec(value);
  if (match === null) {
    throw new Error(`\`${selector} { ${property}: ${value} }\` is not in em`);
  }
  return Number(match[1]);
}

/** A unitless `line-height`, which is the only kind this stylesheet uses. */
function unitless(selector: string, property: string): number {
  const value = declaration(selector, property);
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    throw new Error(
      `\`${selector} { ${property}: ${value} }\` is not unitless`,
    );
  }
  return parsed;
}

/**
 * The height of a `.mathFrac`, in the surrounding `em` — TR-294's arithmetic,
 * recomputed from the live declarations rather than copied from the prose.
 */
function stackHeight(): number {
  const storey =
    em(".mathFrac__num", "font-size") *
    unitless(".mathFrac__num", "line-height");
  return (
    2 * storey +
    em(".mathFrac__bar", "height") +
    2 * em(".mathFrac__bar", "margin")
  );
}

describe("TR-296 / TR-325 — layout stability across task kinds", () => {
  it("reserves at least the tallest form the typesetter can emit", () => {
    const reserved = em("#taskPrompt", "min-height");

    // Every flex item `typesetInto` can put in `.mathRow`, with the height it
    // contributes to the row, in prompt `em`.
    const contributions: Record<string, number> = {
      // `.mathNum`, `.mathOp`, `.mathSign` — plain inline runs, inheriting the
      // prompt's own line-height.
      "inline run": unitless("#taskPrompt", "line-height"),
      // A stacked fraction: two storeys, a bar and the bar's two margins.
      ".mathFrac": stackHeight(),
      // A parenthesis beside a stack. This is the one that regressed:
      // `2em × 1` = 2em against a 1.35em reservation.
      ".mathParen--tall":
        em(".mathParen--tall", "font-size") *
        unitless(".mathParen--tall", "line-height"),
    };

    for (const [item, height] of Object.entries(contributions)) {
      expect(
        height,
        `${item} contributes ${height}em to a row reserved at ${reserved}em`,
      ).toBeLessThanOrEqual(reserved);
    }
  });

  it("reserves the same way on the reveal, which is typeset too (TR-312)", () => {
    const reserved = em("#taskReveal", "min-height");
    expect(unitless("#taskReveal", "line-height")).toBeLessThanOrEqual(
      reserved,
    );
    expect(stackHeight()).toBeLessThanOrEqual(reserved);
  });

  it("keeps the tall parenthesis's ink inside the reservation as well", () => {
    // The box arithmetic above is necessary but not sufficient: a glyph's ink
    // is not clipped to its line box, and at `2em` the parenthesis painted
    // straight through `#taskRule` even though its box stopped above it.
    const reservedHalf = em("#taskPrompt", "min-height") / 2;
    const parenSize = em(".mathParen--tall", "font-size");

    expect(parenSize * PAREN_INK_HALF_ROBOTO_MONO).toBeLessThanOrEqual(
      reservedHalf,
    );
  });

  it("TR-300 — but still large enough to enclose the stack it wraps", () => {
    // The other side of the same window. Checked against the font with the
    // *smallest* parenthesis, so passing here means both shipped fonts enclose.
    const parenSize = em(".mathParen--tall", "font-size");
    expect(parenSize * PAREN_INK_HALF_LEXEND_DECA).toBeGreaterThan(
      STACK_INK_HALF_EM,
    );
  });

  it("centres the tall parenthesis's ink on the maths axis", () => {
    // A parenthesis is the one glyph in the arena whose ink is not centred in
    // its em box — it sits 0.105em (Roboto Mono) / 0.115em (Lexend Deca) low —
    // and `align-items: center` centres the *box*. Without the correction the
    // scaled glyph hangs below the vinculum it is supposed to be centred on.
    const shift = declaration(".mathParen--tall", "transform");
    const match = /^translateY\((-?[\d.]+)em\)$/.exec(shift);
    expect(match, `\`${shift}\` is not a translateY in em`).not.toBeNull();
    const applied = Math.abs(Number(match?.[1]));
    expect(applied).toBeGreaterThanOrEqual(0.105);
    expect(applied).toBeLessThanOrEqual(0.115);
  });
});

describe("TR-057 — the arena is hidden once the results own the page", () => {
  it("hides `#taskArena` itself, not its children one by one", () => {
    expect(declaration('#taskArena[data-state="finished"]', "display")).toBe(
      "none",
    );
  });

  it("does not rely on a descendant rule that a Tailwind utility outranks", () => {
    // `index.scss` puts this stylesheet in `@layer custom-styles` and
    // `tailwind.css` declares `utilities` afterwards, so *any* utility class
    // beats *any* selector in here regardless of specificity — cascade layers
    // are resolved before specificity is even considered. `#taskReadouts`
    // carries Tailwind's `flex`, which is exactly how a bare `0` timer survived
    // `#taskArena[data-state="finished"] #taskReadouts { display: none }` and
    // painted above the score. Hiding the ancestor removes the subtree from
    // rendering, which no utility on a descendant can undo.
    for (const child of ["#taskReadouts", "#taskPrompt", "#answerInput"]) {
      expect(
        RULES.has(`#taskArena[data-state="finished"] ${child}`),
        `\`${child}\` is hidden by a descendant rule a utility class can beat`,
      ).toBe(false);
    }
  });

  it("keeps `preStart` hiding only the three elements TR-038 names", () => {
    // The pre-start guarantee is a different mechanism and must not be folded
    // into the finished one: in `preStart` the arena is on screen and holds the
    // start gate, so only the rule, the reveal and the hint are removed.
    expect(RULES.has('#taskArena[data-state="preStart"]')).toBe(false);
    for (const child of ["#taskRule", "#taskReveal", "#taskContinueHint"]) {
      expect(
        declaration(`#taskArena[data-state="preStart"] ${child}`, "display"),
      ).toBe("none");
    }
  });
});
