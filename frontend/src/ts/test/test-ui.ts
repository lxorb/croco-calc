/**
 * The task stream (CP-030 … CP-052).
 *
 * The upstream project renders its prompt stream as a wrapping flex row with the
 * caret over the active glyph and a line-jump scroll. croco calc keeps exactly
 * that metaphor with `prompt → task` — three visible lines of upcoming content
 * that flow past you (CP-030, CP-044). The Zetamac single-centred-task
 * alternative was considered and rejected in doc 03 §2.3.
 *
 * ## Geometry and the line jump (CP-044)
 *
 * Two elements, two jobs, and they must not be the same element:
 *
 * - `#tasksWrapper` is the **viewport**: a fixed height of exactly
 *   {@link VISIBLE_LINES} line boxes, clipped vertically by `test.scss`.
 * - `#tasks` is the **content**: `height: fit-content`, unclipped, scrolled by
 *   animating its `margin-top`. Clipping the same element you scroll would move
 *   the window along with its contents and scroll nothing.
 *
 * The offset is **derived, never accumulated**: on every move of the active task
 * the target margin is recomputed from that task's line index inside the
 * currently rendered document. So a full re-render (which happens every 20
 * commits to keep the runway stocked) lands on a correct offset instead of
 * inheriting a stale one, and a dropped or interrupted animation self-corrects
 * on the next commit instead of desynchronising the stream forever.
 *
 * The active task sits on the first line until it reaches the second, and stays
 * pinned there for the rest of the run — one committed line above it, one
 * upcoming line below. That is the upstream steady state, reproduced without
 * upstream's "animate one line, then delete the top line and reset the margin"
 * bookkeeping.
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
 *    upstream uses for its own blur, kept separate from `blurred` so the two
 *    compose independently and each can be asserted in isolation (CP-046, CP-084).
 *
 * The reveal is one atomic step driven by the same event that starts the clock
 * (CP-049): the real prompts are written and `preStart` is dropped together, so
 * the 0.25 s transition (CP-051) plays over freshly rendered text. Nothing else
 * — not Tab, Escape, Enter, Space, a click, a modal or a refocus — can reach
 * `revealStream()` (CP-050, CP-085).
 */

import type { JSAnimation } from "animejs";

import { getConfig } from "../config/store";
import { configEvent } from "../events/config";
import { focusInputElement } from "../input/input-element";
import {
  getActiveTaskIndex,
  isPreStart,
  setOutOfFocusMaxHeight,
  setPreStart,
} from "../states/test";
import { qs, qsa, qsr } from "../utils/dom";
import * as Caret from "./caret";
import type { TaskView } from "./test-engine";

/** CP-044 — the upstream default: three visible lines. */
export const VISIBLE_LINES = 3;
/**
 * Which of those lines the active task settles on, zero-based. It starts on
 * line 0 and stops climbing once it reaches line 1, so there is always one
 * finished line above and one upcoming line below.
 */
const ACTIVE_LINE = 1;
/** How many tasks past the active one are kept in the document (CP-045). */
const RENDER_AHEAD = 60;
/** How many committed tasks stay behind the active one, so hints remain visible. */
const RENDER_BEHIND = 24;
/** CP-044 — duration of one line jump, in ms. */
const LINE_JUMP_MS = 125;
/** Widths, in `ch`, a masked task occupies. Task-shaped, but empty. */
const MASK_WIDTHS = [9, 11, 13, 10, 12];

/** One line box of the stream in px, margins included. 0 until measurable. */
let lineHeight = 0;
/** The `margin-top` currently applied to `#tasks`, in px. Always ≤ 0. */
let streamOffset = 0;
let lineJumpAnimation: JSAnimation | undefined;

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

  const attr = resultAttr(view);
  const result = attr === undefined ? "" : ` data-result="${attr}"`;

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

/** CP-186 — `#tasks` always carries `data-state`, with exactly these values. */
export type TestDomState = "preStart" | "running" | "finished";

export function setTestState(state: TestDomState): void {
  tasksElement().native.dataset["state"] = state;
}

/** CP-187 — `data-result` is `correct` | `wrong`, never `incorrect`. */
function resultAttr(view: TaskView): "correct" | "wrong" | undefined {
  if (view.result === undefined) return undefined;
  return view.result === "correct" ? "correct" : "wrong";
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
  setTestState("preStart");
  tasks.setHtml(
    Array.from({ length: RENDER_AHEAD }, (_, i) => maskedTaskHtml(i)).join(""),
  );
  resetStreamOffset();
  applyGeometry();
}

/**
 * CP-049 / CP-051 — the reveal. Only the input pipeline's "first accepted
 * symbol" path reaches this, and it does so in the same turn as the clock start.
 */
export function revealStream(views: readonly TaskView[]): void {
  setPreStart(false);
  renderStream(views);
  tasksElement().removeClass("preStart");
  setTestState("running");
}

/** Writes the whole visible window. */
export function renderStream(views: readonly TaskView[]): void {
  const tasks = tasksElement();
  tasks.setHtml(views.map(taskHtml).join(""));
  resetStreamOffset();
  applyGeometry();
  // The window normally starts RENDER_BEHIND tasks *before* the active one, so
  // the correct offset after a re-render is several lines — snap to it rather
  // than animating a jump the user never triggered.
  updateActiveElement(getActiveTaskIndex(), true);
}

/**
 * CP-032 — re-render only the active task's `<letter>` run. Deliberately no
 * per-keystroke feedback of any kind (CP-036 / ME-152): the letters carry no
 * correct/incorrect class while the answer is being entered.
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
    el.native.dataset["result"] = resultAttr(view) ?? "";
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
 * a new line, scroll the stream so that task is back on {@link ACTIVE_LINE}.
 *
 * `instant` skips the animation; it is used after a re-render, where the offset
 * can legitimately change by many lines at once.
 */
export function updateActiveElement(
  activeIndex: number,
  instant = false,
): void {
  const tasks = tasksElement().native;
  const next = tasks.querySelector<HTMLElement>(
    `.task[data-taskindex="${activeIndex}"]`,
  );
  if (next === null) return;
  for (const stale of tasks.querySelectorAll(".task.active")) {
    if (stale !== next) stale.classList.remove("active");
  }
  next.classList.add("active");

  scrollActiveIntoView(next, instant);
  Caret.updatePosition(instant);
}

/** The zero-based line the given task occupies inside `#tasks`. */
function lineIndexOf(task: HTMLElement): number {
  if (lineHeight <= 0) return 0;
  const first = tasksElement().native.querySelector<HTMLElement>(".task");
  if (first === null) return 0;
  // A difference of two `offsetTop`s is immune to the stream's own margin, so
  // this is safe to read while a line jump is mid-animation.
  return Math.max(
    0,
    Math.round((task.offsetTop - first.offsetTop) / lineHeight),
  );
}

/**
 * CP-044 — the line jump. Recomputed from scratch each time, so it cannot drift.
 */
function scrollActiveIntoView(active: HTMLElement, instant: boolean): void {
  if (lineHeight <= 0) return;
  const target = -Math.max(0, lineIndexOf(active) - ACTIVE_LINE) * lineHeight;
  if (target === streamOffset) return;

  const delta = target - streamOffset;
  const duration = instant ? 0 : LINE_JUMP_MS;
  streamOffset = target;

  lineJumpAnimation?.cancel();
  if (duration === 0) {
    tasksElement().setStyle({ marginTop: `${target}px` });
  } else {
    lineJumpAnimation = tasksElement().animate({
      marginTop: target,
      duration,
    });
  }
  // The caret is positioned against `#tasksWrapper`, so it needs the *delta* of
  // this jump, not the absolute offset of the stream.
  Caret.caret.handleLineJump({ newMarginTop: delta, duration });
}

/** Puts the stream back at line 0 with no animation in flight. */
function resetStreamOffset(): void {
  lineJumpAnimation?.cancel();
  lineJumpAnimation = undefined;
  streamOffset = 0;
  tasksElement().setStyle({ marginTop: "0px" });
  Caret.caret.clearMargins();
}

/**
 * Measures one line box — `offsetHeight` alone is the content box and misses
 * `.task`'s vertical margins, which are what actually separate two lines.
 */
function measureLineHeight(task: HTMLElement): number {
  const style = window.getComputedStyle(task);
  const margins =
    (parseFloat(style.marginTop) || 0) + (parseFloat(style.marginBottom) || 0);
  return task.offsetHeight + margins;
}

/**
 * Clamps the **viewport** to `VISIBLE_LINES` lines — what makes it a stream.
 * `#tasks` itself stays `height: fit-content` so it can be scrolled inside it.
 */
function applyGeometry(): void {
  const wrapper = qs("#tasksWrapper");
  wrapper?.setStyle({
    maxWidth:
      getConfig.maxLineWidth === 0 ? "" : `${getConfig.maxLineWidth}rem`,
  });

  const first = tasksElement().native.querySelector<HTMLElement>(".task");
  // jsdom and a hidden page both report 0 — leave the last good measurement.
  if (first === null || first.offsetHeight === 0) return;

  lineHeight = measureLineHeight(first);
  if (lineHeight <= 0) return;

  const height = lineHeight * VISIBLE_LINES;
  wrapper?.setStyle({ height: `${height}px` });
  // CP-083 — the out-of-focus warning is clamped to the same box.
  setOutOfFocusMaxHeight(height);
}

/**
 * Applies the four config keys that change how the stream is laid out or
 * coloured, then re-measures. `#tasks` inherits its size from `#tasksTest`,
 * exactly as upstream sizes its stream from the test container.
 */
export function applyStreamStyles(): void {
  const tasks = tasksElement();
  qsa("#caret, #tasksTest, #tasksInput").setStyle({
    fontSize: `${getConfig.fontSize}rem`,
  });
  if (getConfig.flipTestColors) tasks.addClass("flipped");
  else tasks.removeClass("flipped");
  if (getConfig.colorfulMode) tasks.addClass("colorfulMode");
  else tasks.removeClass("colorfulMode");

  applyGeometry();
  const active =
    tasksElement().native.querySelector<HTMLElement>(".task.active");
  if (active !== null) scrollActiveIntoView(active, true);
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
    applyStreamStyles();
  }
});

// A resize changes how many tasks fit on a line, so both the measured line box
// and the active task's line index can move.
window.addEventListener("resize", () => {
  applyStreamStyles();
});

/** CP-083 — the out-of-focus blur, independent of `preStart` (CP-084). */
export function setBlurred(blurred: boolean): void {
  const tasks = tasksElement();
  if (blurred) tasks.addClass("blurred");
  else tasks.removeClass("blurred");
}

/** CP-085 — restatement for the focus path: refocusing never reveals. */
export function isHidden(): boolean {
  return isPreStart();
}

/**
 * Puts the keyboard back on the capture textarea. `event-handlers/global.ts`
 * (WP-08) is the one remaining caller of the pre-rename name.
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
