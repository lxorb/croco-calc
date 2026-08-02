import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TaskView } from "../../src/ts/test/test-engine";

/**
 * CP-044 — the three-line window and the line jump.
 *
 * jsdom performs no layout, so the geometry is driven by a deliberately simple
 * fake one: every `.task` is 40 px tall with 5 px margins (a 50 px line box)
 * and {@link TASKS_PER_LINE} tasks fit on a line. Views are synthesised rather
 * than taken from the engine, because what is under test here is the renderer's
 * arithmetic, not task generation.
 *
 * The properties pinned down are exactly the ones that broke in review:
 *
 * - the fixed height and the clip live on `#tasksWrapper`, never on `#tasks`
 *   (clipping the element you scroll scrolls nothing);
 * - the line box counts `.task`'s vertical margins, so three lines really are
 *   three lines and not 2.04;
 * - the offset is recomputed from the active task's line index, so it is
 *   correct after an arbitrary re-render and cannot drift;
 * - the caret is handed the *delta* of the jump, not the cumulative offset.
 */

const TASK_HEIGHT = 40;
const TASK_MARGIN = 5;
const LINE_HEIGHT = TASK_HEIGHT + TASK_MARGIN * 2;
const TASKS_PER_LINE = 5;

function setupDom(): void {
  document.body.innerHTML = `
    <div class="page pageTest">
      <div id="testInitFailed" class="hidden"><div class="error"></div></div>
      <div id="tasksTest">
        <div id="tasksWrapper">
          <textarea id="tasksInput"></textarea>
          <div id="caret" class="default"></div>
          <div id="tasks" class="preStart" data-state="preStart"></div>
        </div>
      </div>
    </div>`;
}

/** `from`..`to` inclusive, shaped exactly as `test-logic` builds the window. */
function views(from: number, to: number, active: number): TaskView[] {
  const out: TaskView[] = [];
  for (let i = from; i <= to; i++) {
    if (i < active) {
      out.push({
        index: i,
        prompt: `${i} + 1 =`,
        state: "committed",
        result: "correct",
        expected: `${i + 1}`,
        given: `${i + 1}`,
      });
    } else {
      out.push({
        index: i,
        prompt: `${i} + 1 =`,
        state: i === active ? "active" : "upcoming",
        expected: undefined,
        given: "",
      });
    }
  }
  return out;
}

/** The index of the first task currently in the document. */
function firstRenderedIndex(el: HTMLElement): number {
  const first = el.parentElement?.querySelector<HTMLElement>(".task");
  return Number(first?.dataset["taskindex"] ?? 0);
}

function installFakeLayout(): void {
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get(this: HTMLElement): number {
      return this.classList.contains("task") ? TASK_HEIGHT : 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "offsetTop", {
    configurable: true,
    get(this: HTMLElement): number {
      if (!this.classList.contains("task")) return 0;
      const index = Number(this.dataset["taskindex"] ?? 0);
      const line = Math.floor(
        (index - firstRenderedIndex(this)) / TASKS_PER_LINE,
      );
      return line * LINE_HEIGHT;
    },
  });

  const original = window.getComputedStyle.bind(window);
  vi.stubGlobal("getComputedStyle", (el: Element, pseudo?: string | null) => {
    const style = original(el, pseudo ?? undefined);
    return new Proxy(style, {
      get(target, property): unknown {
        if (property === "marginTop" || property === "marginBottom") {
          return `${TASK_MARGIN}px`;
        }
        const value = Reflect.get(target, property) as unknown;
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  });
}

function removeFakeLayout(): void {
  for (const property of ["offsetHeight", "offsetTop"]) {
    Reflect.deleteProperty(HTMLElement.prototype, property);
  }
  vi.unstubAllGlobals();
}

async function loadUi(): Promise<typeof import("../../src/ts/test/test-ui")> {
  return import("../../src/ts/test/test-ui");
}

async function loadCaret(): Promise<typeof import("../../src/ts/test/caret")> {
  return import("../../src/ts/test/caret");
}

async function loadStates(): Promise<
  typeof import("../../src/ts/states/test")
> {
  return import("../../src/ts/states/test");
}

function marginTop(): number {
  const tasks = document.querySelector("#tasks") as HTMLElement;
  return parseFloat(tasks.style.marginTop) || 0;
}

describe("the task stream window (CP-044)", () => {
  beforeEach(() => {
    vi.resetModules();
    setupDom();
    installFakeLayout();
  });

  afterEach(() => {
    removeFakeLayout();
  });

  it("clamps the wrapper, not the stream, to three line boxes", async () => {
    const ui = await loadUi();
    ui.renderStream(views(0, 40, 0));

    const wrapper = document.querySelector("#tasksWrapper") as HTMLElement;
    const tasks = document.querySelector("#tasks") as HTMLElement;

    // 3 × (content height + both margins). `offsetHeight` alone would give 120,
    // i.e. 2.4 lines, which is the "3 visible lines" defect from review.
    expect(wrapper.style.height).toBe(`${LINE_HEIGHT * ui.VISIBLE_LINES}px`);
    // The scrolled element must stay unclipped and unsized, or the window
    // would move together with its own contents and scroll nothing.
    expect(tasks.style.height).toBe("");
    expect(tasks.style.overflow).toBe("");
  });

  it("clamps the out-of-focus warning to the same box (CP-083)", async () => {
    const ui = await loadUi();
    const states = await loadStates();

    expect(states.outOfFocusMaxHeight()).toBeUndefined();
    ui.renderStream(views(0, 40, 0));
    expect(states.outOfFocusMaxHeight()).toBe(LINE_HEIGHT * ui.VISIBLE_LINES);
  });

  it("holds the active task on the second line as the stream advances", async () => {
    const ui = await loadUi();
    ui.renderStream(views(0, 60, 0));

    // lines 0 and 1: nothing has scrolled off the top yet.
    ui.updateActiveElement(0, true);
    expect(marginTop()).toBe(0);
    ui.updateActiveElement(TASKS_PER_LINE, true);
    expect(marginTop()).toBe(0);

    // From line 2 on, every new line moves the stream up by exactly one line —
    // cumulatively. Re-issuing the same delta would stall after the first jump.
    for (let line = 2; line <= 8; line++) {
      ui.updateActiveElement(line * TASKS_PER_LINE, true);
      expect(marginTop()).toBe(-(line - 1) * LINE_HEIGHT);
    }
  });

  it("keeps the active task inside the clip after a mid-test re-render", async () => {
    const ui = await loadUi();
    const states = await loadStates();

    // What `test-logic` does every 20 commits: re-render a window that starts
    // RENDER_BEHIND tasks *before* the active one. An accumulated offset is
    // reset to zero here, which is what used to push the active task several
    // lines below a three-line clip, permanently.
    const active = 100;
    states.setActiveTaskIndex(active);
    const bounds = ui.getRenderWindow(active);
    ui.renderStream(views(bounds.from, bounds.to, active));

    const activeLine = Math.floor((active - bounds.from) / TASKS_PER_LINE);
    expect(activeLine).toBeGreaterThan(1);
    expect(marginTop()).toBe(-(activeLine - 1) * LINE_HEIGHT);

    const el = document.querySelector<HTMLElement>("#tasks .task.active");
    expect(el?.dataset["taskindex"]).toBe(String(active));
    const top = (el?.offsetTop ?? 0) + marginTop();
    expect(top).toBeGreaterThanOrEqual(0);
    expect(top).toBeLessThan(LINE_HEIGHT * ui.VISIBLE_LINES);
  });

  it("hands the caret the delta of the jump, not the total offset", async () => {
    const ui = await loadUi();
    const Caret = await loadCaret();
    ui.renderStream(views(0, 60, 0));

    const spy = vi.spyOn(Caret.caret, "handleLineJump");
    ui.updateActiveElement(2 * TASKS_PER_LINE, true);
    ui.updateActiveElement(3 * TASKS_PER_LINE, true);
    ui.updateActiveElement(4 * TASKS_PER_LINE, true);

    expect(spy.mock.calls.map((call) => call[0]?.newMarginTop)).toEqual([
      -LINE_HEIGHT,
      -LINE_HEIGHT,
      -LINE_HEIGHT,
    ]);
    spy.mockRestore();
  });

  it("puts the stream back to line zero on restart (CP-052)", async () => {
    const ui = await loadUi();
    ui.renderStream(views(0, 60, 0));
    ui.updateActiveElement(6 * TASKS_PER_LINE, true);
    expect(marginTop()).toBeLessThan(0);

    ui.applyPreStart();
    expect(marginTop()).toBe(0);
  });

  it("moves the active marker rather than accumulating it", async () => {
    const ui = await loadUi();
    ui.renderStream(views(0, 60, 0));

    ui.updateActiveElement(3, true);
    ui.updateActiveElement(4, true);
    const active = document.querySelectorAll("#tasks .task.active");
    expect(active).toHaveLength(1);
    expect((active[0] as HTMLElement).dataset["taskindex"]).toBe("4");
  });
});
