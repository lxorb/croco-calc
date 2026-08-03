import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_MATH_SETTINGS,
  generateSequence,
} from "@croco-calc/math-engine";
import type { MathSettings } from "@croco-calc/math-engine";

/**
 * The two properties the brief and master C29 make non-negotiable, asserted
 * against the real DOM the renderer produces rather than against the
 * renderer's intentions:
 *
 * 1. before the run starts, no task is readable — and after the redesign it is
 *    not merely blurred but **absent** (TR-038, TR-039);
 * 2. at any moment, the document does not contain the answer of any task whose
 *    `data-result` is unset (TR-160, TR-161 — C29's own testable statement).
 *
 * The `preStart` mask describe and the `<letter>` markup describe that used to
 * live here went with their features: there is no mask because nothing is
 * rendered, and there is no per-character rendering because there is no stream
 * to render into.
 */

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const SETTINGS: MathSettings = { ...DEFAULT_MATH_SETTINGS, time: 1 };

/** TR-012 — the arena's normative element set, as `test.html` ships it. */
function setupDom(): void {
  document.body.innerHTML = `
    <div class="page pageTest">
      <div id="testInitFailed" class="hidden"><div class="error"></div></div>
      <div id="tasksTest">
        <div id="taskArena" data-state="preStart" data-feedback="none">
          <div id="taskReadouts"></div>
          <div id="taskPrompt"></div>
          <div id="taskRule" aria-hidden="true"></div>
          <input id="answerInput" type="text" inputmode="decimal" />
          <div id="taskReveal"></div>
          <div id="taskContinueHint">press <kbd>enter</kbd> to continue</div>
        </div>
        <div id="taskAnnouncer" aria-live="polite" aria-atomic="true" role="status"></div>
        <button id="restartTestButton"></button>
      </div>
    </div>`;
}

/**
 * TR-322's round-trip: rebuild the engine's display string from the typeset
 * DOM, emitting `<num>/<den>` for each stacked fraction.
 *
 * Needed because after §14 neither the prompt nor the answer is a literal
 * substring of the document any more: `19/12` is a two-storey stack with a
 * *drawn* vinculum, so its `textContent` is `"1912"` and the string `19/12`
 * appears nowhere. Re-serialising proves both that the value is on screen and
 * that it is the right one — which is exactly what a C29 test needs, since
 * "the answer is absent" and "the answer is present" both become unprovable if
 * the check is a naive substring search.
 */
function reserialise(selector: string): string {
  const host = document.querySelector(selector);
  const row = host?.querySelector(".mathRow");
  // TR-274's fallback renders one plain text node and no row.
  if (row === null || row === undefined) return host?.textContent ?? "";

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

      // ME-131 — a negative *second* operand is parenthesised.
      return atom.querySelector(".mathParen") === null
        ? `${sign}${magnitude}`
        : `(${sign}${magnitude})`;
    })
    .join(" ");
}

async function loadUi(): Promise<typeof import("../../src/ts/test/test-ui")> {
  return import("../../src/ts/test/test-ui");
}

async function loadEngineFactory(): Promise<
  typeof import("../../src/ts/test/test-engine")
> {
  return import("../../src/ts/test/test-engine");
}

describe("task arena rendering", () => {
  beforeEach(() => {
    vi.resetModules();
    setupDom();
  });

  describe("the pre-start guarantee (TR-038, TR-039)", () => {
    it("puts no prompt text in the document at all", async () => {
      const ui = await loadUi();
      ui.resetArena();

      const arena = document.querySelector("#taskArena");
      expect(arena?.getAttribute("data-state")).toBe("preStart");
      expect(document.querySelector("#taskPrompt")?.textContent).toBe("");
      // The whole point of TR-039: there is no mask to strip and no blur to
      // remove, because there is no prompt. A digit anywhere in the arena
      // would mean something leaked.
      expect(arena?.textContent ?? "").not.toMatch(/\d/);
    });

    it("carries no data attribute holding a prompt", async () => {
      const ui = await loadUi();
      const { createTestEngine } = await loadEngineFactory();
      const engine = createTestEngine({ seed: 777, settings: SETTINGS });
      ui.resetArena();

      const prompt = engine.viewAt(0)?.prompt ?? "";
      expect(prompt.length).toBeGreaterThan(0);
      expect(document.querySelector("#taskArena")?.outerHTML).not.toContain(
        prompt,
      );
    });

    it("renders the prompt only once the run has started", async () => {
      const ui = await loadUi();
      const { createTestEngine } = await loadEngineFactory();
      const engine = createTestEngine({ seed: 777, settings: SETTINGS });
      ui.resetArena();
      expect(document.querySelector("#taskPrompt")?.textContent).toBe("");

      const view = engine.viewAt(0);
      ui.setTestState("running");
      ui.renderPrompt(view?.prompt ?? "", 0);

      expect(document.querySelector("#taskPrompt")?.textContent ?? "").not.toBe(
        "",
      );
    });
  });

  describe("TR-030 — the display prompt drops the trailing `=`", () => {
    it("strips a single trailing ` =` for display", async () => {
      const ui = await loadUi();
      expect(ui.displayPrompt("847 + 1293 =")).toBe("847 + 1293");
      expect(ui.displayPrompt("7/12 × 5 =")).toBe("7/12 × 5");
    });

    it("leaves an expression that has no trailing `=` alone", async () => {
      const ui = await loadUi();
      expect(ui.displayPrompt("847 + 1293")).toBe("847 + 1293");
    });

    it("does not mutate the engine's own prompt string", async () => {
      // ME-174 regenerates and compares the logged prompt server-side, so the
      // engine's string must keep its trailing ` =`. Stripping is display-only.
      const { createTestEngine } = await loadEngineFactory();
      const engine = createTestEngine({ seed: 4242, settings: SETTINGS });
      expect(engine.viewAt(0)?.prompt).toMatch(/=\s*$/);
    });
  });

  describe("answers never reach the DOM (master C29, TR-151 … TR-161)", () => {
    it("TR-153 — the reveal is empty until a task is committed", async () => {
      const ui = await loadUi();
      const { createTestEngine } = await loadEngineFactory();
      const engine = createTestEngine({ seed: 99, settings: SETTINGS });

      ui.resetArena();
      ui.setTestState("running");
      ui.renderPrompt(engine.viewAt(0)?.prompt ?? "", 0);

      expect(document.querySelector("#taskReveal")?.textContent).toBe("");
      // The engine refuses to hand out an in-play answer at all, which is what
      // makes this impossible to get wrong by accident (TR-155).
      expect(engine.viewAt(0)?.expected).toBeUndefined();
    });

    it("TR-157 — the reveal is emptied, not merely hidden, on continue", async () => {
      const ui = await loadUi();
      ui.showReveal("−1200");
      expect(document.querySelector("#taskReveal")?.textContent).toBe("−1200");

      ui.clearReveal();
      // A `display: none` element still holding the answer in its text content
      // would be a C29 violation, so this asserts the content, not visibility.
      expect(document.querySelector("#taskReveal")?.textContent).toBe("");
      expect(document.body.innerHTML).not.toContain("−1200");
    });

    it("TR-157 — a restart empties it too", async () => {
      const ui = await loadUi();
      ui.showReveal("4242");
      ui.resetArena();
      expect(document.querySelector("#taskReveal")?.textContent).toBe("");
      expect(document.body.textContent ?? "").not.toContain("4242");
    });

    it("TR-161 / TR-316 — no un-submitted answer is reachable across 20 tasks", async () => {
      const ui = await loadUi();
      const { createTestEngine } = await loadEngineFactory();
      const seed = 20250803;
      const engine = createTestEngine({ seed, settings: SETTINGS });

      /**
       * Ground truth the engine deliberately refuses to hand out.
       * `createTaskBatcher` and `generateSequence` both walk the same
       * `drawTask(seed, index, settings, enabled, previous)` chain, so this is
       * byte-for-byte the sequence the engine is about to serve.
       */
      const truth = generateSequence(seed, SETTINGS, 40);

      /**
       * C29 for a one-task-at-a-time arena, stated **structurally** rather than
       * by value (TR-152, TR-153).
       *
       * The obvious reading of TR-161 — "no un-submitted task's `answerDisplay`
       * occurs in `document.body.innerHTML`" — is unsound in both directions,
       * and was measured to be, not assumed:
       *
       *  - *false positives*: answers repeat. In this very seed task 5 answers
       *    `3/10` and so does a later task, so the legitimate reveal of task 5
       *    trips a "task 23 leaked" assertion.
       *  - *false negatives*: short answers hide inside legitimate operands.
       *    `12` is a substring of the rendered operand `1293`, so a real leak of
       *    the answer `12` would be indistinguishable from that prompt.
       *
       * What is sound is that the arena's content is **fully accounted for**:
       * the prompt re-serialises to exactly the engine's display string (which
       * by construction contains no answer, TR-317), the reveal is byte-empty
       * unless a result is showing, and `#answerInput` holds only what the user
       * typed. There is nowhere else in the arena for an answer to be.
       */
      const assertAccountedFor = (index: number, revealing: boolean): void => {
        expect(reserialise("#taskPrompt")).toBe(
          ui.displayPrompt(truth[index]?.prompt ?? ""),
        );

        if (!revealing) {
          // TR-316.1 — `innerHTML`, not `textContent`: the typeset answer keeps
          // a second textual representation in `aria-label="19 over 12"`, and
          // blanking only the text would leave it sitting in an attribute where
          // a `textContent`-based check would never see it.
          expect(document.querySelector("#taskReveal")?.innerHTML).toBe("");
        }

        // TR-306 / TR-308 — every mathematical value on screen lives in one of
        // the two sanctioned containers. A `role="math"` anywhere else would be
        // an unaccounted-for value, which is the shape a leak would take.
        for (const el of document.querySelectorAll('[role="math"]')) {
          expect(
            el.closest("#taskPrompt") !== null ||
              el.closest("#taskReveal") !== null,
          ).toBe(true);
        }
      };

      ui.resetArena();
      ui.setTestState("running");
      engine.begin(0);

      for (let n = 0; n < 20; n++) {
        const active = engine.snapshot().activeIndex;
        expect(engine.viewAt(active)?.prompt).toBe(truth[active]?.prompt);
        engine.markTaskShown(n * 1000);
        ui.renderPrompt(engine.viewAt(active)?.prompt ?? "", active);

        // Every task from the active one forward is still sealed: the engine
        // reports `expected: undefined` for all of them, so no renderer can put
        // an in-play answer in the DOM even by accident (TR-155).
        for (let i = active; i < active + 20; i++) {
          expect(engine.viewAt(i)?.expected).toBeUndefined();
        }
        assertAccountedFor(active, false);

        // Answer deliberately wrongly, so the reveal path is exercised.
        engine.press("9", n * 1000 + 100);
        ui.syncAnswer(engine.buffer());
        expect(engine.viewAt(active)?.expected).toBeUndefined();
        assertAccountedFor(active, false);

        const outcome = engine.commit(n * 1000 + 200);
        const committed = engine.viewAt(active);
        expect(committed?.state).toBe("committed");

        if (outcome === "incorrect") {
          const answer = committed?.expected ?? "";
          expect(answer).toBe(truth[active]?.answerDisplay);
          ui.showReveal(answer);

          // Disclosed only now, and only for this one already-scored task. The
          // reveal is typeset (TR-312), so the answer is proven present by
          // re-serialising the DOM back to the engine's string rather than by
          // looking for that string literally — a stacked `19/12` has no `/`
          // on screen at all.
          expect(reserialise("#taskReveal")).toBe(answer);
          // The prompt is unchanged by the disclosure, and nothing else on the
          // page has become a mathematical value.
          assertAccountedFor(active, true);

          ui.clearReveal();
          expect(document.querySelector("#taskReveal")?.textContent).toBe("");
        }
        ui.syncAnswer("");
        assertAccountedFor(active, false);
      }
    });

    it("TR-316 — clearing the reveal takes the spoken form with it", async () => {
      const ui = await loadUi();
      const { spokenForm } = await import("../../src/ts/test/math-typeset");

      // A fraction is the case that matters: it is the one whose answer gains a
      // second textual representation that `textContent` cannot see.
      ui.showReveal("19/12");
      expect(spokenForm("19/12")).toBe("19 over 12");
      expect(document.body.innerHTML).toContain("19 over 12");
      // TR-263 — and the `/` is not on screen at all; the bar is drawn.
      expect(document.querySelector("#taskReveal")?.textContent).not.toContain(
        "/",
      );

      ui.clearReveal();
      // TR-316.1 — `replaceChildren()`, not `setText("")`. Blanking only the
      // text would leave `aria-label="19 over 12"` behind in an attribute, a
      // C29 violation no `textContent` assertion would ever catch.
      expect(document.body.innerHTML).not.toContain("19 over 12");
      expect(document.querySelector("#taskReveal")?.innerHTML).toBe("");
    });
  });

  describe("the live region (CP-183, TR-013, TR-145 … TR-147)", () => {
    it("is the only live region on the page", async () => {
      await loadUi();
      const live = document.querySelectorAll("[aria-live]");
      expect(live).toHaveLength(1);
      expect(live[0]?.id).toBe("taskAnnouncer");
    });

    it("is exposed to assistive tech rather than hidden", async () => {
      await loadUi();
      const announcer = document.querySelector("#taskAnnouncer");
      // `display: none`, `visibility: hidden` and `hidden` would all silence
      // it, which is why it is clipped to a 1px box in `test.scss` instead.
      expect(announcer?.hasAttribute("hidden")).toBe(false);
      expect(announcer?.getAttribute("role")).toBe("status");
      expect(announcer?.getAttribute("aria-atomic")).toBe("true");
    });

    it("TR-146 — a restart clears it", async () => {
      const ui = await loadUi();
      ui.announce("847 + 1293 =");
      expect(document.querySelector("#taskAnnouncer")?.textContent).toBe(
        "847 + 1293 =",
      );

      // Without this a screen reader re-reads the previous run's last prompt
      // as if it were live.
      ui.resetArena();
      expect(document.querySelector("#taskAnnouncer")?.textContent).toBe("");
    });
  });
});
