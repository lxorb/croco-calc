/**
 * Mathematical typography for the task arena (doc 07 §14, TR-263 … TR-330).
 *
 * The single large task is **mathematical notation, not a line of source code**
 * (TR-264). A fraction is therefore a real fraction — numerator over
 * denominator, separated by a drawn rule — and never the inline `n/d` the
 * engine encodes it as.
 *
 * ## This is a rendering change only (TR-266 … TR-269)
 *
 * No executable line of `packages/math-engine` changes. `FRACTION_SEPARATOR`
 * stays `"/"`, `task.prompt` stays `"3/4 + 5/6 ="` and `task.answerDisplay`
 * stays `"19/12"`, because ME-174 regenerates and byte-compares those exact
 * strings server-side. The typeset form is a **pure function of the engine's
 * display string**, computed here at render time and never persisted, never
 * transmitted and never compared. No `MATH_ENGINE_VERSION` bump is required or
 * permitted (TR-267).
 *
 * ## Why the parse is driven by the display string (TR-279)
 *
 * Not by `task.operands`, deliberately:
 *   1. one primitive then serves both the prompt and the reveal — the reveal
 *      only ever *has* a string (`answerDisplay`), so a structured path would
 *      need a second, divergent implementation for it;
 *   2. it makes the output provably faithful to the string the server
 *      revalidates, which the fidelity round-trip test asserts mechanically
 *      (TR-322);
 *   3. it needs no new field on `TaskView`, the one type whose surface C29
 *      constrains (TR-155, TR-317).
 *
 * ## Why the stacking predicate is exact (TR-277, TR-278)
 *
 * A magnitude is stacked **iff** it matches `^\d+\/\d+$`. That is decidable
 * only because ME-128 reserves `/` for the fraction separator and mandates `÷`
 * for the division *operator*, and ME-132/ME-133 mandate `.` as the decimal
 * point. A `/` in a display string therefore always means "fraction bar" and
 * never means "divide". Doc 01's assumption A9 — taken for an unrelated reason,
 * to keep `3/4 ÷ …` unambiguous in text — is what makes the visual
 * division-versus-fraction distinction in TR-286 … TR-290 mechanically sound.
 *
 * ## Why no maths library (TR-270)
 *
 * The grammar is a two-operand expression over four glyph classes. KaTeX or
 * MathJax is three orders of magnitude more machinery than that needs, against
 * a real bundle budget. The whole layout is nine CSS declarations in
 * `test.scss`, and the alignment argument is recorded there.
 */

/** ME-127 — the three operator glyphs. There is no subtraction glyph (ME-033). */
const OPERATOR_GLYPHS = new Set(["+", "×", "÷"]);

/** C33 / ME-131 — the display minus. Never the ASCII hyphen (TR-281). */
const MINUS = "−";

/** TR-277 — the stacking predicate. Exact, and the only one. */
const FRACTION_MAGNITUDE = /^\d+\/\d+$/;

/** The two non-stacked magnitude shapes ME-132/ME-133 can produce. */
const PLAIN_MAGNITUDE = /^\d+(?:\.\d+)?$/;

/** TR-303 — how each operator is spoken. */
const SPOKEN_OPERATORS: Record<string, string> = {
  "+": "plus",
  "×": "times",
  "÷": "divided by",
};

type Magnitude =
  | { kind: "fraction"; numerator: string; denominator: string }
  | { kind: "plain"; text: string };

type Atom =
  | { kind: "operator"; glyph: string }
  | {
      kind: "operand";
      /** ME-131 — a negative *second* operand is parenthesised. */
      paren: boolean;
      negative: boolean;
      magnitude: Magnitude;
    };

/**
 * TR-030 — a display string never carries the trailing ` =`; `#taskRule`
 * carries the equals relation instead. Applied here too so the module is total
 * over raw engine prompts as well as display prompts: `spokenForm` is called
 * with `task.prompt` verbatim (TR-303's table drops the trailing `=`), while
 * `typesetInto` is called with the already-stripped display form.
 *
 * Deliberately duplicated from `test-ui.ts`'s `displayPrompt` rather than
 * imported: `test-ui` imports this module, so sharing it the other way would be
 * a cycle, and TR-271 fixes this module's public surface at exactly two
 * functions.
 */
function stripTrailingEquals(display: string): string {
  return display.replace(/\s*=\s*$/, "");
}

/**
 * TR-276 — an operand is an optional `(`, an optional U+2212, a magnitude and
 * an optional `)`. That is exactly what ME-131 emits: bare sign in first
 * position, parenthesised in second.
 *
 * Returns `null` for anything else, which propagates to TR-274's plain-text
 * fallback rather than throwing.
 */
function parseOperand(token: string): Atom | null {
  let rest = token;
  let paren = false;
  if (rest.startsWith("(") && rest.endsWith(")") && rest.length > 2) {
    paren = true;
    rest = rest.slice(1, -1);
  }

  let negative = false;
  if (rest.startsWith(MINUS)) {
    negative = true;
    rest = rest.slice(MINUS.length);
  }

  if (FRACTION_MAGNITUDE.test(rest)) {
    const slash = rest.indexOf("/");
    return {
      kind: "operand",
      paren,
      negative,
      magnitude: {
        kind: "fraction",
        numerator: rest.slice(0, slash),
        denominator: rest.slice(slash + 1),
      },
    };
  }

  if (PLAIN_MAGNITUDE.test(rest)) {
    return {
      kind: "operand",
      paren,
      negative,
      magnitude: { kind: "plain", text: rest },
    };
  }

  return null;
}

/**
 * TR-275 / TR-280 — the one parse both `typesetInto` and `spokenForm` run, so
 * the visual and the spoken form can never disagree about what the expression
 * is.
 *
 * `null` means "not parseable"; an empty array means "nothing to render".
 */
function parse(display: string): Atom[] | null {
  const stripped = stripTrailingEquals(display);
  if (stripped === "") return [];

  const atoms: Atom[] = [];
  // TR-285 — the engine's single spaces are consumed here and MUST NOT survive
  // into the DOM as whitespace text nodes: the `0.3em` flex gap replaces them,
  // and a stray text node would break the row's alignment.
  for (const token of stripped.split(" ")) {
    if (OPERATOR_GLYPHS.has(token)) {
      atoms.push({ kind: "operator", glyph: token });
      continue;
    }
    const operand = parseOperand(token);
    if (operand === null) return null;
    atoms.push(operand);
  }
  return atoms;
}

function span(className: string, text?: string): HTMLSpanElement {
  const el = document.createElement("span");
  el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

/**
 * TR-291 — the normative DOM shape of a stacked fraction.
 *
 * TR-302 — `role="math"` plus an `aria-label` of "<numerator> over
 * <denominator>", with all three children `aria-hidden`, so a screen reader
 * announces "3 over 4" once instead of "3", "4" as two loose numbers with an
 * unexplained gap. TR-308 keeps `role="math"` off `#taskPrompt` as a whole, so
 * operators and integers stay ordinary text for assistive technology that does
 * not implement MathML semantics.
 */
function fractionNode(numerator: string, denominator: string): HTMLSpanElement {
  const frac = span("mathFrac");
  frac.setAttribute("role", "math");
  frac.setAttribute("aria-label", `${numerator} over ${denominator}`);

  const num = span("mathFrac__num", numerator);
  num.setAttribute("aria-hidden", "true");
  // TR-283 / TR-295 — the vinculum is a **drawn element**, never a glyph, and
  // it paints in `currentColor` so it inherits the feedback colour with no
  // extra rule and no chance of a stale colour after a state change.
  const bar = span("mathFrac__bar");
  bar.setAttribute("aria-hidden", "true");
  const den = span("mathFrac__den", denominator);
  den.setAttribute("aria-hidden", "true");

  frac.append(num, bar, den);
  return frac;
}

function operandNode(
  atom: Extract<Atom, { kind: "operand" }>,
): HTMLSpanElement {
  const stacked = atom.magnitude.kind === "fraction";
  const wrapper = span("mathOperand");

  // TR-300 — a parenthesis around a stacked operand must enclose the **full
  // height** of the stack. A half-height paren beside a two-storey stack is a
  // defect, so the paren is scaled when, and only when, what it wraps is
  // stacked.
  const parenClass = stacked ? "mathParen mathParen--tall" : "mathParen";
  if (atom.paren) wrapper.append(span(parenClass, "("));

  // TR-299 — the sign sits **outside** the stack, vertically centred on the
  // vinculum. Glued to the numerator it would read as a numerator of −5, which
  // is a different (if numerically equal) statement and looks wrong.
  if (atom.negative) wrapper.append(span("mathSign", MINUS));

  if (atom.magnitude.kind === "fraction") {
    wrapper.append(
      fractionNode(atom.magnitude.numerator, atom.magnitude.denominator),
    );
  } else {
    // TR-277 / TR-301 — integers and canonical decimals are one inline run.
    wrapper.append(span("mathNum", atom.magnitude.text));
  }

  if (atom.paren) wrapper.append(span(parenClass, ")"));
  return wrapper;
}

/**
 * Typesets one engine display string into `target`, replacing its contents.
 *
 * TR-272 — built with `document.createElement` and `textContent` only, never
 * `innerHTML` or string-concatenated markup. The inputs are engine-produced and
 * contain only digits and four operator glyphs, so there is no injection vector
 * today; constructing nodes directly means there is none after a future engine
 * change either.
 *
 * TR-273 — the target is cleared with `replaceChildren()` first. That is a C29
 * obligation, not a tidiness one: the reveal now carries the answer in an
 * `aria-label` as well as in text, so emptying only text would leave
 * `aria-label="19 over 12"` behind in an attribute (TR-316).
 *
 * TR-274 — **total**. Anything it cannot parse is rendered as a single plain
 * text node. It never throws and never leaves a non-empty input rendering as an
 * empty element: a bug here must degrade to "the old inline look", never to a
 * blank prompt that makes the run unplayable.
 */
export function typesetInto(target: Element, display: string): void {
  target.replaceChildren();

  const atoms = parse(display);
  if (atoms === null) {
    target.append(document.createTextNode(display));
    return;
  }
  if (atoms.length === 0) return;

  // TR-285 / TR-292 — one flex row, centred on a single axis, with the operator
  // spacing as `gap` rather than as literal spaces.
  const row = span("mathRow");
  for (const atom of atoms) {
    row.append(
      atom.kind === "operator" ? span("mathOp", atom.glyph) : operandNode(atom),
    );
  }
  target.append(row);
}

/**
 * The spoken form of an engine display string (TR-302, TR-303).
 *
 * `#taskAnnouncer` gets this, never the raw engine string: announcing
 * `"3/4 + 5/6 ="` verbatim is the audio version of exactly the defect the user
 * reported. `3/4 + 5/6 =` becomes `"3 over 4 plus 5 over 6"`, and
 * `12 + (−5) =` becomes `"12 plus negative 5"`.
 *
 * TR-304 — this touches **only** the announcer. The task log and the event log
 * keep `task.prompt` verbatim (TR-268), and a test asserts the two have not
 * converged.
 *
 * The bare-versus-parenthesised distinction is keyed on the parentheses rather
 * than on position, which is the same thing: ME-131 emits parentheses exactly
 * when the negative operand is in second position.
 */
export function spokenForm(display: string): string {
  const atoms = parse(display);
  // TR-274's totality applies here too — an unparseable string is spoken as
  // itself rather than swallowed.
  if (atoms === null) return stripTrailingEquals(display);

  return atoms
    .map((atom) => {
      if (atom.kind === "operator") {
        return SPOKEN_OPERATORS[atom.glyph] ?? atom.glyph;
      }
      const magnitude =
        atom.magnitude.kind === "fraction"
          ? `${atom.magnitude.numerator} over ${atom.magnitude.denominator}`
          : atom.magnitude.text;
      if (!atom.negative) return magnitude;
      return atom.paren ? `negative ${magnitude}` : `minus ${magnitude}`;
    })
    .join(" ");
}
