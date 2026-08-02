import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_MATH_SETTINGS,
  createTaskBatcher,
  renderAnswerDisplay,
} from "@croco-calc/math-engine";
import type { MathSettings } from "@croco-calc/math-engine";

import { createTestEngine } from "../../src/ts/test/test-engine";
import type { TaskView } from "../../src/ts/test/test-engine";

/**
 * The two properties the brief and master C29 make non-negotiable, asserted
 * against the real DOM the renderer produces rather than against the renderer's
 * intentions:
 *
 * 1. before the test starts, no task is readable — not blurred, *absent*;
 * 2. at any moment, `document.body.textContent` does not contain the answer of
 *    any task whose `data-result` is unset (C29's own testable statement).
 */

const SETTINGS: MathSettings = { ...DEFAULT_MATH_SETTINGS, time: 1 };

function setupDom(): void {
  document.body.innerHTML = `
    <div class="page pageTest">
      <div id="testInitFailed" class="hidden"><div class="error"></div></div>
      <div id="tasksTest">
        <div id="tasksWrapper">
          <textarea id="tasksInput"></textarea>
          <div id="caret" class="default"></div>
          <div id="tasks" class="preStart" data-state="idle"></div>
        </div>
      </div>
    </div>`;
}

// The renderer pulls in the config store and the caret, both of which expect a
// live document, so the module is imported after the DOM exists.
async function loadUi(): Promise<typeof import("../../src/ts/test/test-ui")> {
  return import("../../src/ts/test/test-ui");
}

describe("task stream rendering", () => {
  beforeEach(() => {
    vi.resetModules();
    setupDom();
  });

  describe("the pre-start hide (CP-046 … CP-052)", () => {
    it("puts no prompt text in the document at all", async () => {
      const ui = await loadUi();
      const engine = createTestEngine({ seed: 777, settings: SETTINGS });
      ui.applyPreStart();

      const tasks = document.querySelector("#tasks");
      expect(tasks?.textContent?.trim()).toBe("");
      expect(tasks?.querySelectorAll(".task.masked").length).toBeGreaterThan(0);
      expect(
        tasks?.querySelector('.task:not([data-masked="true"])'),
      ).toBeNull();

      // and specifically: the first task's prompt is nowhere on the page.
      const firstPrompt = engine.viewAt(0)?.prompt ?? "";
      expect(firstPrompt.length).toBeGreaterThan(0);
      expect(document.body.textContent).not.toContain(firstPrompt);
    });

    it("carries the `preStart` class and `data-state=idle` (CP-046)", async () => {
      const ui = await loadUi();
      ui.applyPreStart();
      const tasks = document.querySelector("#tasks");
      expect(tasks?.classList.contains("preStart")).toBe(true);
      expect(tasks?.getAttribute("data-state")).toBe("idle");
    });

    it("keeps `preStart` and `blurred` independent (CP-046, CP-084)", async () => {
      const ui = await loadUi();
      ui.applyPreStart();
      const tasks = document.querySelector("#tasks") as HTMLElement;

      ui.setBlurred(true);
      expect(tasks.classList.contains("preStart")).toBe(true);
      expect(tasks.classList.contains("blurred")).toBe(true);

      // CP-085 — dropping the out-of-focus blur must not reveal the stream.
      ui.setBlurred(false);
      expect(tasks.classList.contains("blurred")).toBe(false);
      expect(tasks.classList.contains("preStart")).toBe(true);
      expect(tasks.textContent?.trim()).toBe("");
    });

    it("reveals the prompts only through `revealStream` (CP-049)", async () => {
      const ui = await loadUi();
      const engine = createTestEngine({ seed: 777, settings: SETTINGS });
      ui.applyPreStart();

      const views: TaskView[] = [];
      for (let i = 0; i < 10; i++) {
        const view = engine.viewAt(i);
        if (view !== undefined) views.push(view);
      }
      ui.revealStream(views);

      const tasks = document.querySelector("#tasks");
      expect(tasks?.classList.contains("preStart")).toBe(false);
      expect(tasks?.getAttribute("data-state")).toBe("active");
      expect(document.body.textContent).toContain(views[0]?.prompt ?? "");
      expect(tasks?.querySelector(".task.masked")).toBeNull();
    });

    it("re-hides on restart, discarding the revealed prompts (CP-052)", async () => {
      const ui = await loadUi();
      const engine = createTestEngine({ seed: 777, settings: SETTINGS });
      const first = engine.viewAt(0) as TaskView;

      ui.revealStream([first]);
      expect(document.body.textContent).toContain(first.prompt);

      ui.applyPreStart();
      expect(document.body.textContent).not.toContain(first.prompt);
      expect(document.querySelector("#tasks")?.classList).toContain("preStart");
    });
  });

  describe("answers never reach the DOM (master C29, ME-135)", () => {
    /**
     * The structural attributes the renderer defines itself. They enumerate
     * positions and states, never content, and are excluded so the check does
     * not fire on `data-taskindex="39"` when some task's answer happens to be
     * `39`. Any attribute outside this set carrying an answer IS a leak, which
     * is what keeps the assertion honest against a future `data-answer`.
     */
    const STRUCTURAL_ATTRS = new Set([
      "class",
      "id",
      "style",
      "data-taskindex",
      "data-state",
      "data-masked",
      "data-result",
      "data-seconds-remaining",
    ]);

    /**
     * What a user can actually read. `.prompt` is excluded because it is the
     * question and is on screen on purpose — without that exclusion a short
     * answer trips the check by pure coincidence, e.g. the answer `−6` is a
     * substring of the perfectly innocent prompt `0.7 × (−6.2) =`. Committed
     * tasks are excluded because C29 explicitly permits their answer
     * (CP-041's hint, CP-126's history).
     */
    function readableText(): string {
      const clone = document.body.cloneNode(true) as HTMLElement;
      for (const prompt of clone.querySelectorAll(".prompt")) prompt.remove();
      for (const done of clone.querySelectorAll(".task[data-result]")) {
        done.remove();
      }
      return clone.textContent ?? "";
    }

    /** Every non-structural attribute value still in the document. */
    function attributeValues(): string[] {
      const values: string[] = [];
      for (const el of document.querySelectorAll("*")) {
        if (el.closest(".task[data-result]") !== null) continue;
        for (const attr of el.attributes) {
          if (STRUCTURAL_ATTRS.has(attr.name)) continue;
          values.push(attr.value);
        }
      }
      return values;
    }

    /** C29's own acceptance test, run over a full simulated stream. */
    function assertNoUncommittedAnswerInDom(expectedAnswers: string[]): void {
      const text = readableText();
      const attrs = attributeValues();
      for (const task of document.querySelectorAll<HTMLElement>(
        "#tasks .task",
      )) {
        if (task.dataset["result"] !== undefined) continue; // committed: allowed
        const answer = expectedAnswers[Number(task.dataset["taskindex"])];
        if (answer === undefined) continue;
        expect(text).not.toContain(answer);
        for (const value of attrs) expect(value).not.toContain(answer);
      }
    }

    it("withholds every uncommitted answer while the stream is live", async () => {
      const ui = await loadUi();
      const engine = createTestEngine({
        seed: 20260802,
        settings: SETTINGS,
        batcherFactory: createTaskBatcher,
      });

      // Rebuild the answers independently — the engine will not hand them out,
      // which is the point, so the test regenerates them from the same seed.
      const batcher = createTaskBatcher(20260802, SETTINGS);
      const answers: string[] = [];
      for (let i = 0; i < 40; i++) {
        const task = batcher.take();
        answers.push(renderAnswerDisplay(task.answer, task.kind));
      }

      const views = (): TaskView[] => {
        const out: TaskView[] = [];
        for (let i = 0; i < 40; i++) {
          const view = engine.viewAt(i);
          if (view !== undefined) out.push(view);
        }
        return out;
      };

      ui.revealStream(views());
      assertNoUncommittedAnswerInDom(answers);

      // Answer the first eight tasks deliberately wrongly, so every one of them
      // renders a CP-041 hint, and re-check after each commit.
      for (let i = 0; i < 8; i++) {
        engine.press("9", 1000 + i);
        engine.press("9", 1000 + i);
        engine.press("9", 1000 + i);
        engine.commit(1000 + i);
        ui.renderStream(views());
        assertNoUncommittedAnswerInDom(answers);
      }

      // The committed ones DO show their answer — that is CP-041, and it is
      // exactly the scope C29 permits.
      const hints = document.querySelectorAll(
        "#tasks .task.incorrect .hints hint",
      );
      expect(hints).toHaveLength(8);
      expect(hints[0]?.textContent).toBe(answers[0]);
    });

    it("puts no answer in a masked task's markup", async () => {
      const ui = await loadUi();
      ui.applyPreStart();
      const html = document.querySelector("#tasks")?.innerHTML ?? "";
      // no digits at all can appear, since neither prompt nor answer is rendered
      expect(html).not.toMatch(/>[^<]*\d/);
    });
  });

  describe("task markup (CP-031, CP-032, CP-036, CP-043)", () => {
    it("renders exactly a .prompt and an .answer per task", async () => {
      const ui = await loadUi();
      const engine = createTestEngine({ seed: 31337, settings: SETTINGS });
      ui.revealStream([engine.viewAt(0) as TaskView]);

      const task = document.querySelector("#tasks .task") as HTMLElement;
      expect(task.dataset["taskindex"]).toBe("0");
      expect(task.querySelectorAll(".prompt")).toHaveLength(1);
      expect(task.querySelectorAll(".answer")).toHaveLength(1);
    });

    it("gives typed characters no correctness class (CP-036, ME-152)", async () => {
      const ui = await loadUi();
      const engine = createTestEngine({ seed: 31337, settings: SETTINGS });
      ui.revealStream([engine.viewAt(0) as TaskView]);

      ui.updateActiveAnswer("123");
      const letters = document.querySelectorAll("#tasks .answer letter");
      expect(letters).toHaveLength(3);
      for (const letter of letters) {
        expect(letter.className).toBe("");
      }
    });
  });
});
