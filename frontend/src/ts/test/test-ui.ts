/**
 * The task stream (CP-030 … CP-052).
 *
 * monkeytype renders `#words` as a wrapping flex row of `.word`s with the caret
 * over the active letter and a line-jump scroll. croco calc keeps exactly that
 * metaphor with `word → task` — three visible lines of upcoming content that
 * flow past you (CP-030, CP-044). The Zetamac single-centred-task alternative
 * was considered and rejected in doc 03 §2.3.
 *
 * ## The pre-start hide (CP-046 … CP-052)
 *
 * The brief requires that the first task cannot be read before the test starts,
 * "so you don't get an advantage by pre-reading it". CP-047 widens that to the
 * whole stream, because blurring only task 0 leaves 1..n readable and the stated
 * advantage fully intact.
 *
 * Two mechanisms, deliberately layered:
 *
 * 1. **The prompts are not in the DOM at all.** While pre-start every `.task`
 *    renders as `.masked` with a blank fixed-width `.prompt` and
 *    `data-masked="true"`; no prompt string reaches the document. Deleting the
 *    CSS class in devtools, screenshotting, or reading `document.body.textContent`
 *    yields nothing, because there is nothing to yield. This is the real defence.
 * 2. **The `preStart` class**, carrying the same `opacity: 0.25; filter: blur(4px)`
 *    monkeytype uses for its own blur, kept separate from `blurred` so the two
 *    compose independently and each can be asserted in isolation (CP-046, CP-084).
 *
 * The reveal is one atomic step driven by the same event that starts the clock
 * (CP-049): the real prompts are written and `preStart` is dropped together, so
 * the 0.25 s transition (CP-051) plays over freshly rendered text. Nothing else
 * — not Tab, Escape, Enter, Space, a click, a modal or a refocus — can reach
 * `revealStream()` (CP-050, CP-085).
 */

import { getConfig } from "../config/store";
import { focusInputElement } from "../input/input-element";
import { getActiveTaskIndex, isPreStart, setPreStart } from "../states/test";
import { qs, qsr } from "../utils/dom";
import * as Caret from "./caret";
import type { TaskView } from "./test-engine";

/** CP-044 — monkeytype's default: three visible lines. */
export const VISIBLE_LINES = 3;
/** How many tasks past the active one are kept in the document (CP-045). */
const RENDER_AHEAD = 60;
/** How many committed tasks stay behind the active one, so hints remain visible. */
const RENDER_BEHIND = 24;
/** CP-051 — the reveal transition, matching `test.scss`. */
const REVEAL_SECONDS = 0.25;
/** Widths, in `ch`, a masked task occupies. Task-shaped, but empty. */
const MASK_WIDTHS = [9, 11, 13, 10, 12];

let renderedLineTop: number | undefined;
let lineJumping = false;

function tasksElement(): ReturnType<typeof qsr> {
  return qsr("#tasks");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function lettersHtml(buffer: string): string {
  return [...buffer].map((ch) => `<letter>${escapeHtml(ch)}</letter>`).join("");
}

/**
 * The markup for one task (CP-031, CP-032): exactly two children, a `.prompt`
 * and an `.answer`, plus the CP-041 hint once it is committed and wrong.
 */
function taskHtml(view: TaskView): string {
  const classes = ["task"];
  if (view.state === "active") classes.push("active");
  if (view.state === "committed") {
    classes.push("typed", view.result === "correct" ? "correct" : "incorrect");
  }

  // C29: `expected` is populated by the engine only for a committed task, so
  // this hint can never reveal an answer that is still in play.
  const hint =
    view.state === "committed" && view.result === "incorrect"
      ? `<div class="hints"><hint>${escapeHtml(view.expected ?? "")}</hint></div>`
      : "";

  const result =
    view.result === undefined ? "" : ` data-result="${view.result}"`;

  return (
    `<div class="${classes.join(" ")}" data-taskindex="${view.index}"${result}>` +
    `<span class="prompt">${escapeHtml(view.prompt)} </span>` +
    `<span class="answer">${lettersHtml(view.given)}</span>${hint}</div>`
  );
}

/** A task-shaped blank. Carries no prompt text at all — see the file header. */
function maskedTaskHtml(index: number): string {
  const width = MASK_WIDTHS[index % MASK_WIDTHS.length] ?? 10;
  return (
    `<div class="task masked" data-taskindex="${index}" data-masked="true">` +
    `<span class="prompt" style="display:inline-block;width:${width}ch"></span>` +
    `<span class="answer"></span></div>`
  );
}

/** The exit-criterion hook: `#tasks` always carries `data-state`. */
export function setTestState(state: "idle" | "active" | "finished"): void {
  tasksElement().native.dataset["state"] = state;
}

/** The slice of task indices that should currently be in the document. */
export function getRenderWindow(activeIndex: number): {
  from: number;
  to: number;
} {
  return {
    from: Math.max(0, activeIndex - RENDER_BEHIND),
    to: activeIndex + RENDER_AHEAD,
  };
}

/**
 * CP-046 / CP-052 — (re-)hide the stream. Called on page load and on every
 * restart path; a test is never resumed half-revealed.
 */
export function applyPreStart(): void {
  const tasks = tasksElement();
  setPreStart(true);
  tasks.addClass("preStart");
  tasks.setStyle({ transition: `${REVEAL_SECONDS}s`, marginTop: "0px" });
  setTestState("idle");
  renderedLineTop = undefined;
  tasks.setHtml(
    Array.from({ length: RENDER_AHEAD }, (_, i) => maskedTaskHtml(i)).join(""),
  );
  applyGeometry();
}

/**
 * CP-049 / CP-051 — the reveal. Only the input pipeline's "first accepted
 * character" path reaches this, and it does so in the same turn as the clock start.
 */
export function revealStream(views: readonly TaskView[]): void {
  setPreStart(false);
  renderStream(views);
  tasksElement().removeClass("preStart");
  setTestState("active");
}

/** Writes the whole visible window. */
export function renderStream(views: readonly TaskView[]): void {
  const tasks = tasksElement();
  tasks.setHtml(views.map(taskHtml).join(""));
  renderedLineTop = undefined;
  applyGeometry();
  updateActiveElement(getActiveTaskIndex());
}

/**
 * CP-032 — re-render only the active task's `<letter>` run. Deliberately no
 * per-character feedback of any kind (CP-036 / ME-152): the letters carry no
 * correct/incorrect class while the answer is being typed.
 */
export function updateActiveAnswer(buffer: string): void {
  const answer = qs(
    `#tasks .task[data-taskindex="${getActiveTaskIndex()}"] .answer`,
  );
  if (answer === null) return;
  answer.setHtml(lettersHtml(buffer));
  Caret.updatePosition();
}

/** CP-040 — mark the just-committed task and move `.active` on by one. */
export function commitTask(view: TaskView, nextActive: number): void {
  const el = qs(`#tasks .task[data-taskindex="${view.index}"]`);
  if (el !== null) {
    el.removeClass("active");
    el.addClass(["typed", view.result === "correct" ? "correct" : "incorrect"]);
    el.native.dataset["result"] = view.result ?? "";
    if (view.result === "incorrect") {
      const hints = document.createElement("div");
      hints.className = "hints";
      const hint = document.createElement("hint");
      // CP-041 — safe, and only safe, because this task is already committed.
      hint.textContent = view.expected ?? "";
      hints.appendChild(hint);
      el.native.appendChild(hints);
    }
  }
  updateActiveElement(nextActive);
}

/**
 * CP-044 — move the `.active` marker and, when the active task has dropped onto
 * a new line, scroll the stream up by exactly one line.
 */
export function updateActiveElement(activeIndex: number): void {
  const next = qs(`#tasks .task[data-taskindex="${activeIndex}"]`);
  if (next === null) return;
  next.addClass("active");

  const top = next.native.offsetTop;
  if (renderedLineTop === undefined) {
    renderedLineTop = top;
    Caret.updatePosition(true);
    return;
  }
  if (top > renderedLineTop) {
    lineJump(top - renderedLineTop);
    renderedLineTop = top;
  }
  Caret.updatePosition();
}

function lineJump(delta: number): void {
  if (lineJumping) return;
  lineJumping = true;
  const duration = 125;
  tasksElement().animate({
    marginTop: -delta,
    duration,
    onComplete: () => {
      lineJumping = false;
    },
  });
  Caret.caret.handleLineJump({ newMarginTop: -delta, duration });
}

/** Clamps the stream to `VISIBLE_LINES` lines — what makes it a stream. */
function applyGeometry(): void {
  const tasks = tasksElement();
  const first = tasks.native.querySelector<HTMLElement>(".task");
  if (first === null) return;
  const lineHeight = first.offsetHeight;
  if (lineHeight > 0) {
    tasks.setStyle({
      height: `${lineHeight * VISIBLE_LINES}px`,
      overflow: "hidden",
    });
  }
  qs("#tasksWrapper")?.setStyle({
    maxWidth:
      getConfig.maxLineWidth === 0 ? "" : `${getConfig.maxLineWidth}rem`,
  });
}

/** CP-083 — the out-of-focus blur, independent of `preStart` (CP-084). */
export function setBlurred(blurred: boolean): void {
  const tasks = tasksElement();
  tasks.setStyle({ transition: `${REVEAL_SECONDS}s` });
  if (blurred) tasks.addClass("blurred");
  else tasks.removeClass("blurred");
}

/** CP-085 — restatement for the focus path: refocusing never reveals. */
export function isHidden(): boolean {
  return isPreStart();
}

/**
 * Puts the keyboard back on the capture textarea. Named `focusWords` upstream;
 * `event-handlers/global.ts` (WP-08) is the one remaining caller of the old name.
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
