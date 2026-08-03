import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TestResultPayload } from "../../src/ts/test/test-logic";

/**
 * ME-006 — the settings snapshot is frozen when the test starts, and everything
 * the run produces MUST be described by that snapshot rather than by whatever
 * the live config happens to say when the run ends.
 *
 * The regression this guards against is not cosmetic. `buildCompletedEvent`
 * used to re-read the live `Config`, so a settings change during an active run
 * shipped a `mathSettings` that does not regenerate the submitted `taskLog`.
 * The server regenerates the sequence from `mathSeed` + `mathSettings`
 * (`backend/src/api/controllers/result.ts`), gets different prompts, answers
 * `prompt-mismatch` with status 467 *and* records an anti-cheat strike. An
 * honest user would lose an eight-minute run and gain a ban strike for it.
 */

/** Same cold-graph budget as the other jsdom specs in this directory. */
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

vi.mock("../../src/ts/db", () => ({
  getLocalPB: (): undefined => undefined,
  getSnapshot: (): { uid: string } => ({ uid: "test-uid" }),
  saveLocalResult: vi.fn(),
}));

vi.mock("../../src/ts/ape", () => ({
  default: { results: { add: vi.fn() } },
}));

vi.mock("../../src/ts/states/core", () => ({
  isAuthenticated: () => false,
  getActivePage: () => "test",
  setIsScreenshotting: vi.fn(),
}));

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
    <div class="loading"></div>
  </div>`;
}

describe("ME-006 - the submitted result describes the frozen snapshot", () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView ??= vi.fn();
    vi.resetModules();
    setupDom();
  });

  it("ignores a settings change made while the test is running", async () => {
    const TestLogic = await import("../../src/ts/test/test-logic");
    const { Config } = await import("../../src/ts/config/store");
    const { generateSequence } = await import("@croco-calc/math-engine");

    let payload: TestResultPayload | undefined;
    TestLogic.registerResultPresenter((handed) => {
      payload = handed;
    });

    // The snapshot the sequence is generated from.
    Config.division = "threeByTwo";
    Config.decimals = false;

    TestLogic.restart({ initial: true });
    TestLogic.pressCharacter("1");
    TestLogic.commitAnswer();

    // The user opens the command palette mid-run and changes the generators.
    // (`applyConfig` restarts the test now, but a raw store write — which is
    // what any future code path that forgets to restart looks like — must
    // still not be able to corrupt the payload.)
    Config.division = "tables";
    Config.decimals = true;

    await TestLogic.finish();

    expect(payload).toBeDefined();
    const completed = payload?.completedEvent;
    const settings = completed?.mathSettings;
    expect(settings?.division).toBe("threeByTwo");
    expect(settings?.decimals).toBe(false);

    // The three settings views the server cross-checks MUST agree with each
    // other (`assertSettingsConsistent`).
    expect(completed?.settings.division).toBe("threeByTwo");
    expect(completed?.settings.decimals).toBe(false);
    expect(completed?.testDuration).toBe((settings?.time ?? 0) * 60);

    // And the payload must actually regenerate: this is the exact check the
    // backend runs before it decides to hand out an anti-cheat strike.
    const log = completed?.taskLog;
    expect(Array.isArray(log)).toBe(true);
    const entries = log as { prompt: string }[];
    const regenerated = generateSequence(
      completed?.mathSeed ?? 0,
      settings as NonNullable<typeof settings>,
      entries.length,
    );
    expect(entries.map((entry) => entry.prompt)).toEqual(
      regenerated.map((task) => task.prompt),
    );
  });
});
