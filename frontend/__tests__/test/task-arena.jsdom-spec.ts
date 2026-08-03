import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The arena state machine (TR-230).
 *
 * Covers the four `data-state` values, the wrong-answer reveal-and-wait that is
 * the user's headline requirement, the cancellable dwell, the TR-118 arming
 * delay, the TR-123 reduced-motion timing rule and the TR-150 keyboard walk.
 *
 * Driven through `test-logic` rather than `test-ui`, because the orchestration
 * *is* the feature: asserting the renderer alone would prove nothing about
 * whether a wrong answer actually halts the run.
 */

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

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

const arena = (): HTMLElement =>
  document.querySelector("#taskArena") as HTMLElement;
const state = (): string | null => arena().getAttribute("data-state");
const feedback = (): string | null => arena().getAttribute("data-feedback");
const reveal = (): string =>
  document.querySelector("#taskReveal")?.textContent ?? "";
const answerEl = (): HTMLInputElement =>
  document.querySelector("#answerInput") as HTMLInputElement;

/**
 * TR-322's round-trip, applied to the reveal: walk the typeset DOM and rebuild
 * the engine's `answerDisplay`, emitting `<num>/<den>` for each stacked
 * fraction.
 *
 * `#taskReveal.textContent` is **not** the answer any more. §14 splits a
 * fraction into separate numerator and denominator nodes with a *drawn*
 * vinculum, so `19/12` reads back as `"1912"` — a string that is not a valid
 * answer to anything. Reading the answer out of `textContent` therefore submits
 * a wrong answer and silently stops exercising the correct path, and because
 * the seed is fresh on every run it does so only for the seeds whose task 0 is
 * a fraction. Hence this helper, and hence `reveal()` is kept only for the
 * emptiness and stability assertions it is still sound for.
 */
function revealAnswer(): string {
  const row = document.querySelector("#taskReveal .mathRow");
  // TR-274's fallback renders one plain text node and no row.
  if (row === null) return reveal();

  return [...row.children]
    .map((atom) => {
      const sign = atom.querySelector(".mathSign")?.textContent ?? "";
      const frac = atom.querySelector(".mathFrac");
      if (frac === null) {
        return `${sign}${atom.querySelector(".mathNum")?.textContent ?? ""}`;
      }
      const num = frac.querySelector(".mathFrac__num")?.textContent ?? "";
      const den = frac.querySelector(".mathFrac__den")?.textContent ?? "";
      return `${sign}${num}/${den}`;
    })
    .join(" ");
}

/**
 * A controllable clock. `test-logic` timestamps everything with
 * `performance.now()`, so the fake timers have to agree with it or the TR-118
 * arming window cannot be tested deterministically.
 */
let clock = 0;
function advance(ms: number): void {
  clock += ms;
  vi.advanceTimersByTime(ms);
}

type Logic = typeof import("../../src/ts/test/test-logic");
type Ui = typeof import("../../src/ts/test/test-ui");

async function load(): Promise<{ logic: Logic; ui: Ui }> {
  const logic = await import("../../src/ts/test/test-logic");
  const ui = await import("../../src/ts/test/test-ui");
  return { logic, ui };
}

describe("the task arena state machine", () => {
  beforeEach(async () => {
    vi.resetModules();
    setupDom();
    clock = 0;
    vi.useFakeTimers();
    vi.spyOn(performance, "now").mockImplementation(() => clock);
    const { logic } = await load();
    logic.restart({ initial: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("TR-010 — the four data-state values", () => {
    it("starts in preStart with nothing rendered", async () => {
      expect(state()).toBe("preStart");
      expect(feedback()).toBe("none");
      expect(document.querySelector("#taskPrompt")?.textContent).toBe("");
    });

    it("TR-066 — an accepted character starts the run and renders task 0", async () => {
      const { logic } = await load();
      logic.pressCharacter("4");

      expect(state()).toBe("running");
      // TR-041 — the character that started the run is not consumed by it.
      expect(logic.getBuffer()).toBe("4");
      expect(answerEl().value).toBe("4");
      expect(document.querySelector("#taskPrompt")?.textContent).not.toBe("");
      expect(arena().getAttribute("data-taskindex")).toBe("0");
    });

    it("TR-050 — a wrong answer moves to awaitingContinue", async () => {
      const { logic } = await load();
      logic.pressCharacter("9");
      logic.pressCharacter("9");
      logic.pressCharacter("9");
      logic.pressCharacter("9");
      logic.pressCharacter("9");
      logic.pressCharacter("9");
      logic.submitOrContinue();

      expect(state()).toBe("awaitingContinue");
      expect(feedback()).toBe("wrong");
      expect(arena().getAttribute("data-result")).toBe("wrong");
    });
  });

  describe("TR-050 … TR-056 — a wrong answer halts the run", () => {
    /** 999999 is wrong for every task the default settings can generate. */
    function answerWrongly(logic: Logic): void {
      for (const ch of "999999") logic.pressCharacter(ch);
      logic.submitOrContinue();
    }

    it("TR-052 — shows the correct answer", async () => {
      const { logic } = await load();
      answerWrongly(logic);
      expect(reveal()).not.toBe("");
    });

    it("TR-055 — waits indefinitely, with no auto-advance", async () => {
      const { logic } = await load();
      answerWrongly(logic);
      const shown = document.querySelector("#taskPrompt")?.textContent;

      // Ten seconds is far longer than any dwell or timeout in the design.
      advance(10_000);

      expect(state()).toBe("awaitingContinue");
      expect(document.querySelector("#taskPrompt")?.textContent).toBe(shown);
      expect(reveal()).not.toBe("");
    });

    it("TR-118 — an Enter inside the arming window is ignored", async () => {
      const { logic } = await load();
      answerWrongly(logic);
      const answer = reveal();

      // A user double-tapping Enter would otherwise blow straight past the
      // correct answer and never see it, which defeats the whole feature.
      advance(100);
      logic.submitOrContinue();
      expect(state()).toBe("awaitingContinue");
      expect(reveal()).toBe(answer);
    });

    it("TR-136 — Enter after the arming delay continues", async () => {
      const { logic, ui } = await load();
      answerWrongly(logic);

      advance(ui.CONTINUE_ARM_MS + 1);
      logic.submitOrContinue();

      expect(state()).toBe("running");
      expect(feedback()).toBe("none");
      expect(arena().hasAttribute("data-result")).toBe(false);
      // TR-157 — emptied before the next prompt renders.
      expect(reveal()).toBe("");
      expect(arena().getAttribute("data-taskindex")).toBe("1");
    });

    it("TR-136 — a digit typed during the pause is discarded, not buffered", async () => {
      const { logic, ui } = await load();
      answerWrongly(logic);

      logic.pressCharacter("7");
      expect(state()).toBe("awaitingContinue");
      expect(logic.getBuffer()).toBe("");

      advance(ui.CONTINUE_ARM_MS + 1);
      logic.submitOrContinue();
      // The pause exists to make the user read the answer; banking their
      // keystrokes for the next task would defeat it.
      expect(logic.getBuffer()).toBe("");
      expect(answerEl().value).toBe("");
    });

    it("TR-056 — the input is readonly while the answer is on screen", async () => {
      const { logic, ui } = await load();
      answerWrongly(logic);
      expect(answerEl().readOnly).toBe(true);

      advance(ui.CONTINUE_ARM_MS + 1);
      logic.submitOrContinue();
      expect(answerEl().readOnly).toBe(false);
    });

    it("TR-062 — the timer is NOT paused during the wait", async () => {
      const { logic } = await load();
      answerWrongly(logic);

      const before = arena().getAttribute("data-seconds-remaining");
      advance(3000);
      const after = arena().getAttribute("data-seconds-remaining");

      // The cost of an error is time. That is the point of the design, so this
      // assertion is deliberately about the countdown continuing to fall.
      expect(Number(after)).toBeLessThan(Number(before));
    });
  });

  describe("TR-107 … TR-111 — the correct-answer dwell", () => {
    /**
     * Runs the same seeded sequence twice: once to learn task 0's answer from
     * the reveal, once to submit it. The engine never hands out an uncommitted
     * answer, so this is the only way to drive the correct path honestly.
     */
    async function submitCorrectAnswer(): Promise<{ logic: Logic; ui: Ui }> {
      const first = await load();
      for (const ch of "999999") first.logic.pressCharacter(ch);
      first.logic.submitOrContinue();
      // Read back through the typeset DOM, not through `textContent` — a
      // fractional answer is stacked and has no `/` on screen at all.
      const answer = revealAnswer();
      expect(answer).not.toBe("");

      // Rebuild everything from scratch with the same seed via `repeat`.
      first.logic.restart({ repeat: true });
      expect(state()).toBe("preStart");

      // TR-097 / TR-098 — the displayed minus is U+2212, but the buffer and the
      // keystrokes are ASCII, so the sign has to be converted back on the way
      // in. `replace` without `/g` is deliberate: ME-137 accepts a minus only in
      // first position, so there is never a second one to convert.
      for (const ch of answer.replace("−", "-")) {
        first.logic.pressCharacter(ch);
      }
      first.logic.submitOrContinue();
      // Guard the guard: if the round-trip above ever silently degrades again,
      // fail here with the reason rather than in each caller's assertion.
      expect(state()).toBe("running");
      return first;
    }

    it("TR-047 — a correct answer sets feedback without leaving `running`", async () => {
      const { ui } = await submitCorrectAnswer();
      expect(state()).toBe("running");
      expect(feedback()).toBe("correct");
      expect(arena().getAttribute("data-result")).toBe("correct");
      // TR-049 — a correct answer is never revealed: the user produced it.
      expect(reveal()).toBe("");
      expect(ui.CORRECT_DWELL_MS).toBe(180);
    });

    it("TR-107 — advances automatically after the dwell", async () => {
      const { ui } = await submitCorrectAnswer();
      expect(arena().getAttribute("data-taskindex")).toBe("0");

      advance(ui.CORRECT_DWELL_MS + 1);

      expect(arena().getAttribute("data-taskindex")).toBe("1");
      expect(feedback()).toBe("none");
      expect(arena().hasAttribute("data-result")).toBe(false);
    });

    it("TR-110 — the dwell is cancellable and drops no keystroke", async () => {
      const { logic } = await submitCorrectAnswer();
      expect(arena().getAttribute("data-taskindex")).toBe("0");

      // A fast user must never wait for an animation, and the character that
      // cancelled the dwell must land in the new task's buffer.
      logic.pressCharacter("7");

      expect(arena().getAttribute("data-taskindex")).toBe("1");
      expect(logic.getBuffer()).toBe("7");
      expect(answerEl().value).toBe("7");
    });

    it("TR-111 — Enter during the dwell is ignored", async () => {
      const { logic } = await submitCorrectAnswer();
      logic.submitOrContinue();
      expect(arena().getAttribute("data-taskindex")).toBe("0");
    });
  });

  describe("TR-123 / TR-126 — reduced motion keeps the timing", () => {
    it("still takes the full dwell to advance under `reduce`", async () => {
      vi.stubGlobal(
        "matchMedia",
        vi.fn().mockReturnValue({
          matches: true,
          media: "(prefers-reduced-motion: reduce)",
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }),
      );

      const { logic, ui } = await load();
      for (const ch of "999999") logic.pressCharacter(ch);
      logic.submitOrContinue();

      // Reduced motion means less movement, not less feedback: collapsing the
      // dwell would remove the affirmative signal entirely for exactly the
      // users who most need it to be unambiguous. The two constants are
      // therefore never routed through `applyReducedMotion()`, which returns 0.
      expect(ui.CORRECT_DWELL_MS).toBe(180);
      expect(ui.CONTINUE_ARM_MS).toBe(210);

      advance(100);
      expect(state()).toBe("awaitingContinue");
      logic.submitOrContinue();
      expect(state()).toBe("awaitingContinue");
    });
  });

  describe("TR-024 — entering awaitingContinue adds and removes no element", () => {
    it("keeps the same element set in `running` and `awaitingContinue`", async () => {
      const { logic } = await load();
      logic.pressCharacter("4");
      const running = [...arena().children].map((el) => el.id);

      for (const ch of "99999") logic.pressCharacter(ch);
      logic.submitOrContinue();
      const waiting = [...arena().children].map((el) => el.id);

      // The reveal and the hint are always present and always occupy their
      // reserved space (`test.scss` toggles visibility, never `display`), which
      // is the structural guarantee that the prompt cannot shift beneath them.
      expect(waiting).toEqual(running);
      expect(state()).toBe("awaitingContinue");
    });
  });

  describe("TR-063 / TR-119 — restart lands cleanly from every state", () => {
    it("clears the reveal, the feedback and the pending dwell", async () => {
      const { logic } = await load();
      for (const ch of "999999") logic.pressCharacter(ch);
      logic.submitOrContinue();
      expect(state()).toBe("awaitingContinue");

      logic.restart();

      expect(state()).toBe("preStart");
      expect(feedback()).toBe("none");
      expect(arena().hasAttribute("data-result")).toBe(false);
      expect(reveal()).toBe("");
      expect(answerEl().value).toBe("");
      expect(answerEl().readOnly).toBe(false);
      expect(document.querySelector("#taskPrompt")?.textContent).toBe("");
      expect(document.querySelector("#taskAnnouncer")?.textContent).toBe("");
    });

    it("a restart mid-dwell leaves no pending advance behind", async () => {
      const { logic, ui } = await load();
      logic.pressCharacter("4");
      logic.restart();

      advance(ui.CORRECT_DWELL_MS * 4);
      // A leaked timeout would have rendered a prompt into a `preStart` arena.
      expect(state()).toBe("preStart");
      expect(document.querySelector("#taskPrompt")?.textContent).toBe("");
    });
  });

  describe("TR-061 — a no-op commit changes nothing", () => {
    it("ignores Enter on an empty buffer", async () => {
      const { logic } = await load();
      logic.pressCharacter("4");
      for (let i = 0; i < 4; i++) logic.deleteCharacter(true);
      expect(logic.getBuffer()).toBe("");

      logic.submitOrContinue();

      expect(state()).toBe("running");
      expect(feedback()).toBe("none");
      expect(arena().getAttribute("data-taskindex")).toBe("0");
    });
  });

  describe("TR-150 — the keyboard walk", () => {
    it("start, answer, submit, reveal, arm, continue", async () => {
      const { logic, ui } = await load();

      // press `4` — the run starts and the character is buffered
      logic.pressCharacter("4");
      expect(state()).toBe("running");
      expect(logic.getBuffer()).toBe("4");

      // Enter — either an advance or a reveal
      for (const ch of "99999") logic.pressCharacter(ch);
      logic.submitOrContinue();
      expect(["running", "awaitingContinue"]).toContain(state());

      if (state() === "awaitingContinue") {
        // Enter within 100 ms — nothing happens
        advance(100);
        logic.submitOrContinue();
        expect(state()).toBe("awaitingContinue");

        // Enter after 210 ms — the advance
        advance(ui.CONTINUE_ARM_MS);
        logic.submitOrContinue();
        expect(state()).toBe("running");
      }

      // restart returns to preStart
      logic.restart();
      expect(state()).toBe("preStart");
    });
  });
});

describe("TR-135 — the ME-153 distinction", () => {
  beforeEach(async () => {
    vi.resetModules();
    setupDom();
    clock = 0;
    vi.useFakeTimers();
    vi.spyOn(performance, "now").mockImplementation(() => clock);
    const { logic } = await load();
    logic.restart({ initial: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("never advances without an explicit submit, however long the buffer", async () => {
    const { logic } = await load();
    logic.pressCharacter("4");
    const index = arena().getAttribute("data-taskindex");

    // ME-153 forbids advancing when the entered value *happens* to equal the
    // answer. Typing sixteen characters — past any plausible answer length —
    // must still leave the task exactly where it was, with no correctness
    // signal of any kind (CP-036 / ME-152 / TR-046).
    for (const ch of "9999999999999999") logic.pressCharacter(ch);
    advance(5000);

    expect(arena().getAttribute("data-taskindex")).toBe(index);
    expect(feedback()).toBe("none");
    expect(arena().hasAttribute("data-result")).toBe(false);
    expect(reveal()).toBe("");
  });
});
