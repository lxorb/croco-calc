import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The finished-run hand-off, end to end (CP-090, CP-086 … CP-089).
 *
 * `test-logic.ts` deliberately does not import the results screen — it exposes
 * `registerResultPresenter`, and `test/result.ts` calls it at module load. That
 * inversion is only sound while *something on the boot path imports
 * `test/result.ts`*, and for a while nothing did: the presenter stayed the
 * no-op default, so finishing a test produced nothing on screen and nothing in
 * the console. `result-screen.jsdom-spec.ts` could not catch it, because it
 * mocks `test-logic` and imports `test/result` by hand — it proves the module
 * registers itself *if loaded*, not that anything loads it.
 *
 * So this file uses the **real** `test-logic` and drives a real run to
 * completion. Only the things jsdom cannot do (canvas, network) are mocked.
 * The last test is the negative control: it asserts that without the boot-path
 * import the screen really does stay blank, which is what makes the two tests
 * above it meaningful rather than vacuous.
 */

/**
 * Same fixed cold-graph cost as the other two jsdom specs in this directory:
 * this one executes `test-logic`, `test/result`, config, states, collections,
 * `math-engine` and the generated icon bundle, and `vi.resetModules()` re-runs
 * it per test. Explicit budget here rather than a `testTimeout` in
 * `vitest.config.ts`, which is WP-12's file.
 */
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const resultHtml = readFileSync(
  resolve(process.cwd(), "src/html/pages/test-result.html"),
  "utf8",
);

const chartDatasets: Record<string, { data: number[]; hidden?: boolean }> = {
  score: { data: [] },
  tpm: { data: [] },
  wrong: { data: [] },
};
const chartScales: Record<string, Record<string, unknown>> = {
  score: {},
  tpm: {},
  wrong: {},
};

// chart.js wants a real canvas context, which jsdom does not provide.
vi.mock("../../src/ts/controllers/chart-controller", () => ({
  result: {
    data: { labels: [] as string[] },
    options: { plugins: {} as Record<string, unknown> },
    getDataset: (id: string) => chartDatasets[id],
    getScale: (id: string) => chartScales[id],
    resize: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("../../src/ts/db", () => ({
  getLocalPB: (): undefined => undefined,
  getSnapshot: (): { uid: string } => ({ uid: "test-uid" }),
  saveLocalResult: vi.fn(),
}));

vi.mock("../../src/ts/ape", () => ({
  default: { results: { add: vi.fn() } },
}));

vi.mock("canvas-confetti", () => ({ default: vi.fn() }));

vi.mock("../../src/ts/states/core", () => ({
  isAuthenticated: () => false,
  getActivePage: () => "test",
  setIsScreenshotting: vi.fn(),
}));

/** The real arena markup the engine renders into, plus the results screen. */
function setupDom(): void {
  document.body.innerHTML = `<div class="page pageTest">
    <div id="testInitFailed" class="hidden"><div class="error"></div></div>
    <div id="tasksTest">
      <div id="taskArena" data-state="preStart" data-feedback="none">
        <div id="taskReadouts"></div>
        <div id="taskPrompt"></div>
        <div id="taskRule"></div>
        <input id="answerInput" type="text" inputmode="decimal" />
        <div id="taskReveal"></div>
        <div id="taskContinueHint"></div>
      </div>
      <div id="taskAnnouncer" aria-live="polite" aria-atomic="true" role="status"></div>
    </div>
    ${resultHtml}
    <div class="loading"></div>
  </div>`;
}

/** See the note in `result-screen.jsdom-spec.ts`: skips the real 125 ms fade. */
function useReducedMotion(): void {
  vi.stubGlobal(
    "matchMedia",
    (query: string): Partial<MediaQueryList> => ({
      media: query,
      matches: query.includes("prefers-reduced-motion"),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
}

/** Drives one real run: reveal, answer a task, then expire the clock. */
async function runATest(
  TestLogic: typeof import("../../src/ts/test/test-logic"),
): Promise<void> {
  TestLogic.restart({ initial: true });
  // The first accepted symbol is what reveals the stream and starts the clock.
  TestLogic.pressCharacter("1");
  TestLogic.commitAnswer();
  // What the timer callback does when the configured duration runs out.
  await TestLogic.finish();
}

function resultEl(): HTMLElement | null {
  return document.querySelector<HTMLElement>("#result");
}

describe("finished-run hand-off to the results screen", () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView ??= vi.fn();
    useReducedMotion();
    vi.resetModules();
    setupDom();
  });

  it('keeps a static `import "./test/result"` on the boot path', () => {
    const index = readFileSync(
      resolve(process.cwd(), "src/ts/index.ts"),
      "utf8",
    );
    // Must be a static side-effect import: a `lazy()`/`await import()` would
    // register the presenter too late, or (as in the DevOptionsModal case) not
    // at all in a production bundle.
    expect(index).toMatch(/^import "\.\/test\/result";$/m);
  });

  it("renders the results screen when a test completes", async () => {
    // Exactly what `index.ts` does, in the same order.
    const TestLogic = await import("../../src/ts/test/test-logic");
    await import("../../src/ts/test/result");

    expect(resultEl()?.classList.contains("hidden")).toBe(true);

    await runATest(TestLogic);

    // The screen is on, and it is populated — not merely un-hidden.
    expect(resultEl()?.classList.contains("hidden")).toBe(false);
    expect(
      document.querySelector("#result .stats .score .bottom")?.textContent,
    ).toBeTruthy();
    // CP-188 / DoD-27: the test hooks are written on every real render, so
    // their presence proves the presenter ran rather than something else
    // having removed the class. One answered task, so `data-answered` is "1"
    // — the run really was driven through the engine.
    expect(resultEl()?.getAttribute("data-score")).not.toBeNull();
    expect(resultEl()?.getAttribute("data-answered")).toBe("1");
  });

  it("leaves the screen blank when nothing imports `test/result`", async () => {
    // The negative control — the exact production defect. `test-logic` is
    // loaded on its own, so `presentResult` is still the no-op default.
    const TestLogic = await import("../../src/ts/test/test-logic");
    // Swallowed so the expected error does not pollute the run's output.
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await runATest(TestLogic);

    expect(resultEl()?.classList.contains("hidden")).toBe(true);
    expect(resultEl()?.getAttribute("data-score")).toBeNull();
    // …and it is loud about it, rather than swallowing the run in silence.
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("No result presenter registered"),
    );
    error.mockRestore();
  });
});
