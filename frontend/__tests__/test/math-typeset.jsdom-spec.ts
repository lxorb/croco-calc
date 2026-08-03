import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_MATH_SETTINGS,
  generateSequence,
} from "@croco-calc/math-engine";
import type { MathSettings, Task, TaskKind } from "@croco-calc/math-engine";

import { spokenForm, typesetInto } from "../../src/ts/test/math-typeset";

// `test-ui` reaches `#answerInput` at module load (it is the one element the
// whole input pipeline is built on), so the arena has to exist before it is
// imported. TR-322 compares against the **real** `displayPrompt`, not a
// re-implementation of it, so the import is not optional.
document.body.innerHTML = `
  <div id="taskArena" data-state="preStart" data-feedback="none">
    <div id="taskPrompt"></div>
    <div id="taskRule" aria-hidden="true"></div>
    <input id="answerInput" type="text" inputmode="decimal" />
    <div id="taskReveal"></div>
  </div>
  <div id="taskAnnouncer" aria-live="polite" aria-atomic="true" role="status"></div>`;

const { displayPrompt } = await import("../../src/ts/test/test-ui");

/**
 * Mathematical typography (doc 07 §14, TR-322 … TR-328).
 *
 * The headline requirement is the user's own — *"bitte sorge dafuer, dass bspw.
 * brueche auch als solche angezeigt werden und nicht mit /"* — so these
 * assertions are written against the real DOM the primitive produces, not
 * against its intentions.
 */

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const SETTINGS: MathSettings = { ...DEFAULT_MATH_SETTINGS, time: 1 };

/**
 * One seeded corpus, generated once and shared. Every generator is on in
 * `DEFAULT_MATH_SETTINGS`, so all six kinds (ME-004) appear.
 */
const CORPUS: Task[] = generateSequence(20260803, SETTINGS, 3000);

const ALL_KINDS: readonly TaskKind[] = [
  "add",
  "decimal",
  "div",
  "fracAdd",
  "fracMul",
  "mul",
];

function render(display: string): HTMLElement {
  const host = document.createElement("div");
  typesetInto(host, display);
  return host;
}

function fracs(host: ParentNode): HTMLElement[] {
  return [...host.querySelectorAll<HTMLElement>(".mathFrac")];
}

function firstOfKind(kind: TaskKind): Task {
  const task = CORPUS.find((t) => t.kind === kind);
  if (task === undefined) throw new Error(`no ${kind} task in the corpus`);
  return task;
}

/**
 * TR-322 — the fidelity round-trip's serialiser, written exactly as the
 * requirement words it: walk the typeset DOM, join the atom text in order, and
 * emit `<num>/<den>` for each `.mathFrac`.
 *
 * This is what mechanically guarantees the renderer can never quietly show
 * different mathematics from what the engine generated and the server
 * revalidates.
 */
function reserialise(host: HTMLElement): string {
  const row = host.querySelector(".mathRow");
  // TR-274's fallback renders one plain text node and no row.
  if (row === null) return host.textContent ?? "";

  return [...row.children]
    .map((atom) => {
      if (atom.classList.contains("mathOp")) return atom.textContent ?? "";

      const sign = atom.querySelector(".mathSign")?.textContent ?? "";
      const frac = atom.querySelector(".mathFrac");
      const magnitude =
        frac === null
          ? (atom.querySelector(".mathNum")?.textContent ?? "")
          : `${frac.querySelector(".mathFrac__num")?.textContent ?? ""}/${
              frac.querySelector(".mathFrac__den")?.textContent ?? ""
            }`;

      const parenthesised = atom.querySelector(".mathParen") !== null;
      return parenthesised ? `(${sign}${magnitude})` : `${sign}${magnitude}`;
    })
    .join(" ");
}

describe("TR-277 / TR-278 — the stacking predicate", () => {
  it("stacks a fraction magnitude and nothing else", () => {
    expect(fracs(render("3/4"))).toHaveLength(1);
    expect(fracs(render("19/12"))).toHaveLength(1);
    expect(fracs(render("3/4 + 5/6"))).toHaveLength(2);
  });

  it("leaves an integer and a canonical decimal as one inline run", () => {
    expect(fracs(render("847"))).toHaveLength(0);
    expect(fracs(render("0.25"))).toHaveLength(0);
    expect(fracs(render("847 + 1293"))).toHaveLength(0);
    expect(render("0.25").textContent).toBe("0.25");
  });

  it("TR-291 — builds the normative fraction DOM", () => {
    const frac = fracs(render("3/4"))[0];
    expect(frac?.getAttribute("role")).toBe("math");
    expect(frac?.getAttribute("aria-label")).toBe("3 over 4");
    expect(frac?.querySelector(".mathFrac__num")?.textContent).toBe("3");
    expect(frac?.querySelector(".mathFrac__den")?.textContent).toBe("4");
    // TR-283 — the vinculum is a drawn element, so it carries no glyph at all.
    expect(frac?.querySelector(".mathFrac__bar")?.textContent).toBe("");
    // TR-302 — the reader announces the label once, not "3", "4" as two loose
    // numbers with an unexplained gap.
    for (const child of [...(frac?.children ?? [])]) {
      expect(child.getAttribute("aria-hidden")).toBe("true");
    }
  });

  it("TR-299 — a negative sign sits outside the stack, not on the numerator", () => {
    const host = render("−5/6");
    expect(host.querySelector(".mathSign")?.textContent).toBe("−");
    expect(host.querySelector(".mathFrac__num")?.textContent).toBe("5");
    // "negative five sixths", not "a numerator of −5".
    expect(host.querySelector(".mathFrac")?.getAttribute("aria-label")).toBe(
      "5 over 6",
    );
  });

  it("TR-300 — a paren scales for a stacked operand and not for an inline one", () => {
    const stacked = render("1/2 + (−5/6)");
    const tall = [...stacked.querySelectorAll(".mathParen")];
    expect(tall).toHaveLength(2);
    for (const paren of tall) {
      expect(paren.classList.contains("mathParen--tall")).toBe(true);
    }

    const inline = render("12 + (−5)");
    const short = [...inline.querySelectorAll(".mathParen")];
    expect(short).toHaveLength(2);
    for (const paren of short) {
      expect(paren.classList.contains("mathParen--tall")).toBe(false);
    }
  });

  it("TR-285 — the engine's spaces never survive as text nodes", () => {
    const row = render("3/4 + 5/6").querySelector(".mathRow");
    expect(row).not.toBeNull();
    for (const node of [...(row?.childNodes ?? [])]) {
      expect(node.nodeType).toBe(Node.ELEMENT_NODE);
    }
    // The `0.3em` flex gap replaces them, so the concatenated text has none —
    // a stray whitespace node would defeat the row's alignment.
    expect(row?.textContent).toBe("34+56");
  });

  it("TR-272 — is built from elements, never from concatenated markup", () => {
    const host = render("<img src=x onerror=1> + 1");
    expect(host.querySelector("img")).toBeNull();
    expect(host.textContent).toBe("<img src=x onerror=1> + 1");
  });
});

describe("TR-290 / TR-323 — division and fractions must look different", () => {
  it("renders a division task on one line with ÷ and no stack", () => {
    const host = render(displayPrompt(firstOfKind("div").prompt));
    expect(host.textContent).toContain("÷");
    expect(fracs(host)).toHaveLength(0);
  });

  it("renders a fraction task as two stacks, with no ÷ and no /", () => {
    for (const kind of ["fracAdd", "fracMul"] as const) {
      const host = render(displayPrompt(firstOfKind(kind).prompt));
      expect(fracs(host)).toHaveLength(2);
      expect(host.textContent).not.toContain("÷");
      expect(host.textContent).not.toContain("/");
    }
  });

  it("TR-287 — no division operand can ever match the stacking predicate", () => {
    // Structural, not conventional: `assembleByKind` builds `kind: "div"` from
    // `intOperand(a), intOperand(b)`, so neither operand can be `n/d`.
    const divisions = CORPUS.filter((t) => t.kind === "div");
    expect(divisions.length).toBeGreaterThan(50);
    for (const task of divisions) {
      expect(fracs(render(displayPrompt(task.prompt)))).toHaveLength(0);
    }
  });
});

describe("TR-281 / TR-324 — glyphs", () => {
  it("never emits an ASCII substitute in the prompt or the reveal", () => {
    for (const task of CORPUS) {
      const prompt = render(displayPrompt(task.prompt)).textContent ?? "";
      const reveal = render(task.answerDisplay).textContent ?? "";
      for (const text of [prompt, reveal]) {
        expect(text).not.toContain("*");
        // U+002D. Every displayed minus is U+2212 (C33, ME-161, TR-281).
        expect(text).not.toContain("-");
      }
    }
  });

  it("shows no `/` for any fraction-valued task or answer", () => {
    const fractional = CORPUS.filter(
      (t) => t.kind === "fracAdd" || t.kind === "fracMul",
    );
    expect(fractional.length).toBeGreaterThan(50);
    for (const task of fractional) {
      expect(render(displayPrompt(task.prompt)).textContent).not.toContain("/");
      expect(render(task.answerDisplay).textContent).not.toContain("/");
    }
  });
});

describe("TR-322 — the fidelity round-trip", () => {
  it("re-serialises every prompt back to the engine's display string", () => {
    const seen = new Set<TaskKind>();
    for (const task of CORPUS) {
      seen.add(task.kind);
      const display = displayPrompt(task.prompt);
      expect(reserialise(render(display))).toBe(display);
    }
    // The sample must actually cover all six kinds, or the round-trip proves
    // nothing about the ones it missed (ME-004).
    expect([...seen].sort()).toEqual([...ALL_KINDS]);
  });

  it("re-serialises every answer back to `answerDisplay`", () => {
    for (const task of CORPUS) {
      expect(reserialise(render(task.answerDisplay))).toBe(task.answerDisplay);
    }
  });
});

describe("TR-274 / TR-328 — totality", () => {
  const malformed = [
    "not maths",
    "3 ++ 4",
    "3/4/5",
    "1  +  2",
    "3 ^ 4",
    "½ + ⅓",
    "(3/4",
    "-5 + 2",
  ];

  it("renders an unparseable string as plain text without throwing", () => {
    for (const input of malformed) {
      const host = render(input);
      // A bug here must degrade to "the old inline look", never to a blank
      // prompt that makes the run unplayable.
      expect(host.textContent).toBe(input);
      expect(host.textContent).not.toBe("");
      expect(fracs(host)).toHaveLength(0);
    }
  });

  it("speaks an unparseable string as itself", () => {
    expect(spokenForm("not maths")).toBe("not maths");
  });

  it("renders an empty string as an empty element", () => {
    expect(render("").childNodes).toHaveLength(0);
  });

  it("TR-273 / TR-316 — clears the target completely before writing", () => {
    const host = render("19/12");
    expect(host.querySelector(".mathFrac")).not.toBeNull();

    typesetInto(host, "847");
    // Not merely the text: a stale `aria-label="19 over 12"` sitting in an
    // attribute is a C29 violation a `textContent` check would never see.
    expect(host.querySelector(".mathFrac")).toBeNull();
    expect(host.innerHTML).not.toContain("19 over 12");
    expect(host.textContent).toBe("847");
  });
});

describe("TR-303 / TR-326 — the spoken form", () => {
  it("maps each atom exactly as the table specifies", () => {
    expect(spokenForm("3/4 + 5/6 =")).toBe("3 over 4 plus 5 over 6");
    expect(spokenForm("12 + (−5) =")).toBe("12 plus negative 5");
    expect(spokenForm("−12 + 5 =")).toBe("minus 12 plus 5");
    expect(spokenForm("144 ÷ 12 =")).toBe("144 divided by 12");
    expect(spokenForm("7 × 8 =")).toBe("7 times 8");
    expect(spokenForm("0.25 + 0.5 =")).toBe("0.25 plus 0.5");
    expect(spokenForm("1/2 + (−5/6) =")).toBe(
      "1 over 2 plus negative 5 over 6",
    );
  });

  it("drops the trailing `=` and speaks a bare answer", () => {
    expect(spokenForm("19/12")).toBe("19 over 12");
    expect(spokenForm("−1200")).toBe("minus 1200");
    expect(spokenForm("2140")).toBe("2140");
  });

  it("TR-280 — never disagrees with the visual form about the expression", () => {
    for (const task of CORPUS) {
      const stacks = fracs(render(displayPrompt(task.prompt))).length;
      // "over" appears exactly once per stacked operand, in both forms.
      const spoken = spokenForm(task.prompt).split("over").length - 1;
      expect(spoken).toBe(stacks);
    }
  });
});

describe("TR-296 / TR-325 — layout stability across task kinds", () => {
  it("reserves the stacked height on the prompt and on the reveal", async () => {
    // jsdom has no layout engine, so `getBoundingClientRect()` is all zeros and
    // asserting the rect directly would assert nothing at all. The reserved
    // height *is* the mechanism, so the mechanism is what is asserted.
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const scss = readFileSync(
      path.resolve(__dirname, "../../src/styles/test.scss"),
      "utf8",
    );

    /** The whole top-level rule for `#<id>`, brace-matched. */
    const block = (id: string): string => {
      const start = scss.indexOf(`#${id} {`);
      expect(start).toBeGreaterThan(-1);
      let depth = 0;
      for (let i = start; i < scss.length; i++) {
        if (scss[i] === "{") depth++;
        else if (scss[i] === "}" && --depth === 0) return scss.slice(start, i);
      }
      throw new Error(`unterminated #${id} block`);
    };

    // A stacked fraction is ≈1.28em tall against ≈1.1em for an integer row, so
    // both containers reserve at least the taller form and centre what they get.
    expect(block("taskPrompt")).toContain("min-height: 1.35em");
    expect(block("taskReveal")).toContain("min-height: 1.35em");
  });

  it("puts exactly one row element in the prompt whatever the kind", () => {
    for (const kind of ALL_KINDS) {
      const host = render(displayPrompt(firstOfKind(kind).prompt));
      expect(host.childNodes).toHaveLength(1);
      expect((host.firstChild as HTMLElement).className).toBe("mathRow");
    }
  });
});
