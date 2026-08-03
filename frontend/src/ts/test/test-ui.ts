/**
 * The task arena (doc 07, TR-009 … TR-058).
 *
 * One task at a time, large and centred. This replaces the wrapping task
 * stream, its three-line scroll geometry, the custom caret and the hidden
 * capture textarea that the CP-030 … CP-052 design inherited from monkeytype.
 *
 * The rationale, recorded because it is the whole point of the redesign:
 * monkeytype streams words because you type continuously *through* them — the
 * stream is the input surface. A math trainer has no stream to read ahead in.
 * You see one problem, you solve it, you get the next one.
 *
 * ## The DOM contract (TR-010 … TR-012)
 *
 * `#taskArena` carries `data-state` (`preStart` | `running` |
 * `awaitingContinue` | `finished`), `data-feedback` (`none` | `correct` |
 * `wrong`), `data-taskindex` and, while feedback is showing, `data-result`.
 * `data-state` is a **projection** of engine phase plus the two
 * presentation-only sub-states (TR-059) — it is never authoritative for
 * anything the result payload is derived from.
 *
 * ## The pre-start guarantee (TR-038, TR-039)
 *
 * The requirement that a user must not read the first task before starting is
 * now satisfied **structurally, not visually**: in `preStart` nothing is
 * rendered at all. There is no blur to defeat, no `masked` markup and no
 * fixed-width blank, because there is no prompt in the document. Deleting a CSS
 * class in devtools, screenshotting the page or reading
 * `document.body.textContent` yields nothing, because there is nothing to
 * yield.
 *
 * ## C29 (TR-151 … TR-157)
 *
 * The redesign makes master C29 **strictly easier** to satisfy, and the
 * argument is preserved here deliberately: exactly one task exists on screen at
 * a time, so only one task's answer is ever in play. The correct answer enters
 * the DOM at exactly one moment — {@link showReveal}, which is only ever called
 * *after* `engine.commit()` has already scored and logged that task — and is
 * **emptied** again (never merely hidden) on continue, on restart and on
 * finish.
 */

import { getConfig } from "../config/store";
import { configEvent } from "../events/config";
import { focusInputElement, setInputValue } from "../input/input-element";
import type { ArenaState } from "../states/test";
import { getArenaState, setArenaState } from "../states/test";
import { qs, qsr } from "../utils/dom";
import { spokenForm, typesetInto } from "./math-typeset";

/** TR-120 — the feedback timings, named so tests import rather than hard-code. */
export const CORRECT_DWELL_MS = 180;
export const FEEDBACK_PHASE_MS = 90;
export const REVEAL_FADE_MS = 120;
export const CONTINUE_ARM_MS = 210;

/** TR-010 — the four values `#taskArena[data-state]` may hold. */
export type TestDomState = ArenaState;

/** TR-011 — the animation hook. Never a source of truth. */
export type FeedbackKind = "none" | "correct" | "wrong";

function arena(): ReturnType<typeof qsr> {
  return qsr("#taskArena");
}

/**
 * TR-030 — the **display** form of a prompt drops a single trailing ` =`,
 * because `#taskRule` now carries the equals relation.
 *
 * Display-only, and that matters: `task.prompt` keeps its trailing ` =`, the
 * value written to the task log and to `#taskAnnouncer` is `task.prompt`
 * verbatim, and `packages/math-engine`'s `renderPrompt` is untouched. ME-174
 * regenerates and compares the logged prompt string server-side, so changing
 * what the engine produces would break revalidation and force an
 * ME-177/ME-184 engine-version bump for a purely cosmetic reason.
 */
export function displayPrompt(prompt: string): string {
  return prompt.replace(/\s*=\s*$/, "");
}

export function setTestState(state: TestDomState): void {
  setArenaState(state);
  arena().native.dataset["state"] = state;
}

export function getTestState(): TestDomState {
  return getArenaState();
}

export function setFeedback(kind: FeedbackKind): void {
  arena().native.dataset["feedback"] = kind;
}

/**
 * TR-015 — `data-result` lives on the arena (there is exactly one task), and is
 * **removed**, not blanked, once the feedback is over.
 */
export function setResult(result: "correct" | "wrong" | undefined): void {
  const el = arena().native;
  if (result === undefined) delete el.dataset["result"];
  else el.dataset["result"] = result;
}

export function setTaskIndex(index: number): void {
  arena().native.dataset["taskindex"] = `${index}`;
}

/**
 * TR-145 — the announcer is written on exactly four occasions and no others.
 *
 * Raw: the three occasions that carry mathematics go through
 * {@link announcePrompt}, {@link announceCorrect} and {@link announceWrong},
 * which apply TR-303's spoken form. This one is the clear (TR-146) and the
 * escape hatch.
 */
export function announce(text: string): void {
  const announcer = qs("#taskAnnouncer");
  if (announcer === null) return;
  announcer.native.textContent = text;
}

/**
 * TR-145 row one / TR-303 — a fresh prompt, spoken.
 *
 * The raw engine string is deliberately NOT announced: reading `"3/4 + 5/6 ="`
 * out is the audio version of exactly the defect the user reported. TR-304 —
 * the task log and the event log still carry `task.prompt` verbatim, and the
 * two MUST NOT be allowed to converge by a well-meaning refactor.
 */
export function announcePrompt(prompt: string): void {
  announce(spokenForm(prompt));
}

/** TR-145 row two — the confirmation rides along with the next prompt. */
export function announceCorrect(prompt: string): void {
  announce(`correct. ${spokenForm(prompt)}`);
}

/** TR-145 row three / TR-305 — the reveal, spoken. */
export function announceWrong(answerDisplay: string): void {
  announce(
    `incorrect. correct answer ${spokenForm(answerDisplay)}. press enter to continue.`,
  );
}

/**
 * TR-044 — render one task's prompt. The only place a prompt reaches the DOM.
 *
 * TR-263 / TR-279 — typeset, not `textContent`: a fraction operand is stacked
 * over a drawn vinculum rather than written `n/d`. The parse is driven by the
 * engine's display string, so what is on screen is provably the expression the
 * server revalidates (TR-322).
 */
export function renderPrompt(prompt: string, index: number): void {
  const el = qs("#taskPrompt");
  if (el !== null) typesetInto(el.native, displayPrompt(prompt));
  setTaskIndex(index);
}

/**
 * TR-038 — remove the prompt from the document entirely.
 *
 * `replaceChildren()` rather than `setText("")`: the typeset form is a tree of
 * elements carrying `aria-label`s, and blanking only the text would leave those
 * attributes behind (TR-316).
 */
export function clearPrompt(): void {
  qs("#taskPrompt")?.native.replaceChildren();
}

/**
 * TR-089 — `#answerInput.value` is a **mirror** of the engine's buffer, never
 * the other way round, and TR-091 collapses the selection to the end after
 * every write so the browser's native caret is always in the right place.
 */
export function syncAnswer(buffer: string): void {
  setInputValue(buffer);
}

/**
 * TR-052 — the correct answer, shown only once the task is already committed,
 * scored and logged.
 *
 * C29's single controlled disclosure point. Callers must pass the
 * `answerDisplay` of the **just committed** task and nothing else; the engine's
 * `viewAt` refuses to hand out an uncommitted answer, which is what makes that
 * impossible to get wrong by accident (TR-155).
 */
export function showReveal(answerDisplay: string): void {
  // TR-312 — the reveal is the requirement's primary target: a fractional
  // correct answer appears as a real fraction, not as `19/12`.
  const el = qs("#taskReveal");
  if (el !== null) typesetInto(el.native, answerDisplay);
}

/**
 * TR-157 — **emptied**, not merely hidden. A `display: none` element still
 * holding the answer in its text content is a C29 violation.
 *
 * TR-316 — and it MUST be `replaceChildren()`, not `setText("")`: the typeset
 * answer carries a second textual representation in `aria-label="19 over 12"`,
 * which blanking the text would leave sitting in an attribute where a
 * `textContent`-based check would never see it.
 */
export function clearReveal(): void {
  qs("#taskReveal")?.native.replaceChildren();
}

/**
 * TR-056 — the wrong answer cannot be edited once the correct one is on screen.
 * The input keeps focus: a `readonly` input still receives `keydown`, which is
 * how Enter continues.
 */
export function setAnswerReadonly(readonly: boolean): void {
  const input = qs("#answerInput")?.native as HTMLInputElement | undefined;
  if (input === undefined) return;
  input.readOnly = readonly;
}

/**
 * TR-023 / TR-025 — the two config keys that change the arena's geometry.
 *
 * `maxLineWidth` is retained under its existing key name (TR-246, TR-258): it
 * has a real analogue here — it visibly controls the width of `#taskRule` —
 * and renaming it would strand every stored and synced config for no
 * user-visible gain.
 */
export function applyArenaStyles(): void {
  const el = arena();
  // TR-023 / TR-319 / TR-320 — written as a custom property, not as
  // `style.fontSize`. An inline `font-size` outranks a media query, which would
  // silently defeat the `sm`-and-below scaling and let the widest realistic
  // prompt (`13/14 + (−15/16)`, two stacked fractions and a scaled paren)
  // overflow 320 px. The stylesheet multiplies this by a per-breakpoint scale,
  // so the whole row scales as one and the fraction never becomes a second type
  // size.
  el.native.style.setProperty("--arena-font-size", `${getConfig.fontSize}rem`);
  el.setStyle({
    maxWidth:
      getConfig.maxLineWidth === 0 ? "" : `${getConfig.maxLineWidth}rem`,
  });

  // TR-247 — both keep a direct math analogue: which of the prompt and the
  // answer is emphasised, and whether the palette is the colourful variant.
  if (getConfig.flipTestColors) el.addClass("flipped");
  else el.removeClass("flipped");
  if (getConfig.colorfulMode) el.addClass("colorfulMode");
  else el.removeClass("colorfulMode");
}

const STYLE_KEYS = new Set<string>([
  "fontSize",
  "fontFamily",
  "maxLineWidth",
  "flipTestColors",
  "colorfulMode",
]);

configEvent.subscribe(({ key }) => {
  if (key === "fullConfigChangeFinished" || STYLE_KEYS.has(key ?? "")) {
    applyArenaStyles();
  }
});

/**
 * TR-119 — entering any state cancels whatever the previous state left running.
 * A restart during the dwell or the reveal fade lands cleanly in `preStart`
 * with no residual `data-feedback`, no residual inline style and no leftover
 * animation class.
 */
export function resetArena(): void {
  const el = arena();
  el.removeClass(["advance-out", "advance-in"]);
  setFeedback("none");
  setResult(undefined);
  setAnswerReadonly(false);
  clearPrompt();
  clearReveal();
  syncAnswer("");
  setTaskIndex(0);
  setTestState("preStart");
  // TR-146 — mandatory: without it a screen reader re-reads the previous run's
  // last prompt as if it were live.
  announce("");
  applyArenaStyles();
}

/**
 * TR-109 — the leave half of the advance animation. Driven by a class rather
 * than an inline style so the whole thing lives in `test.scss` and the global
 * `prefers-reduced-motion` rule can suppress it without JS involvement
 * (TR-121, TR-125).
 */
export function playAdvanceOut(): void {
  arena().removeClass("advance-in");
  arena().addClass("advance-out");
}

/** TR-109 / TR-115 — the enter half, played once the new prompt is in place. */
export function playAdvanceIn(): void {
  const el = arena();
  el.removeClass("advance-out");
  el.addClass("advance-in");
  // Force a reflow so removing the class on the next frame actually transitions
  // from the offset start state rather than being coalesced into a no-op.
  void el.native.offsetHeight;
  el.removeClass("advance-in");
}

/** CP-083 / TR-148 — the out-of-focus blur, over the whole arena. */
export function setBlurred(blurred: boolean): void {
  const el = arena();
  if (blurred) el.addClass("blurred");
  else el.removeClass("blurred");
}

/**
 * TR-129 / TR-202 — put the keyboard back on `#answerInput`.
 *
 * `event-handlers/global.ts` (WP-08) is the caller that restores focus after a
 * background click strands it on `<body>`.
 */
export function focusTasks(): void {
  focusInputElement();
  setBlurred(false);
}

/** CP-022 — the generation-failed panel. */
export function showTestInitFailed(error: unknown): void {
  qs("#testInitFailed .error")?.setText(
    error instanceof Error ? error.message : String(error),
  );
  qs("#testInitFailed")?.removeClass("hidden");
  qs("#tasksTest")?.addClass("hidden");
}

export function hideTestInitFailed(): void {
  qs("#testInitFailed")?.addClass("hidden");
  qs("#tasksTest")?.removeClass("hidden");
}
