import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { computeMetrics } from "@croco-calc/math-engine";
import { LEADERBOARD_SETTINGS_ID } from "@croco-calc/schemas/math";
import type { MathGeneratorSettings } from "@croco-calc/schemas/math";
import type { CompletedEvent, TaskLogEntry } from "@croco-calc/schemas/results";

import type { Mode2 } from "@croco-calc/schemas/shared";

import type { TestResultPayload } from "../../src/ts/test/test-logic";

/** The real markup, so the assertions below cannot drift from what ships. */
const resultHtml = readFileSync(
  resolve(process.cwd(), "src/html/pages/test-result.html"),
  "utf8",
);

/**
 * The results screen, asserted against the real `test-result.html` markup and
 * the real `computeMetrics` — the same function `backend/src/api/controllers/
 * result.ts` re-runs before it will store a row. That is the whole point of
 * these tests: if the client ever starts deriving a metric of its own, the
 * numbers here stop matching the ones the engine produced and the test fails.
 *
 * Covers CP-092 … CP-110, CP-119, CP-123, CP-126, CP-130 and CP-188/DoD-27.
 */

const SETTINGS: MathGeneratorSettings = {
  addition: "1000",
  multiplication: "100",
  division: "threeByTwo",
  fractionAddition: "99",
  fractionMultiplication: true,
  decimals: true,
  negatives: true,
};

/** The C2 canonical settings the daily leaderboard is keyed on (SB-170). */
const LEADERBOARD_SETTINGS = SETTINGS;

/**
 * `result.ts` pulls in config, the collections, the states, `math-engine` and
 * the generated icon bundle; transforming and executing that graph cold costs
 * ~3 s on an idle machine, and the whole 52-file suite competing for the CPU
 * pushes it past vitest's default 5 s per-test budget. That is a fixed setup
 * cost, not a slow assertion — every test after the first runs in well under
 * 150 ms — so it gets an explicit, generous budget here rather than a
 * `testTimeout` in `vitest.config.ts`, which is WP-12's file.
 */
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

/**
 * U+2212 MINUS SIGN — what ME-161 and master C33 require on screen. Written as
 * an escape rather than pasted so the assertion cannot silently pass on the
 * ASCII hyphen U+002D, which is visually near-identical in a monospace editor.
 */
const MINUS_SIGN = "\u2212";

let presenter: ((payload: TestResultPayload) => Promise<void>) | undefined;
const restart = vi.fn();

vi.mock("../../src/ts/test/test-logic", () => ({
  registerResultPresenter: (
    fn: (payload: TestResultPayload) => Promise<void>,
  ): void => {
    presenter = fn;
  },
  restart: (options?: { repeat?: boolean }): void => {
    restart(options);
  },
}));

// chart.js needs a real canvas context, which jsdom does not provide, and the
// chart is instantiated at module scope. The series the chart consumes are
// asserted through `chartData` on the payload instead.
const chartDatasets: Record<string, { data: number[]; hidden?: boolean }> = {
  score: { data: [] },
  tpm: { data: [] },
  wrong: { data: [] },
};
const chartScales: Record<string, { min?: number; max?: number }> = {
  score: {},
  tpm: {},
  wrong: {},
};

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

const localPb = vi.fn<() => { score: number } | undefined>(() => undefined);
const saveLocalResult = vi.fn();
const addResult = vi.fn();

vi.mock("../../src/ts/db", () => ({
  getLocalPB: (): { score: number } | undefined => localPb(),
  getSnapshot: (): { uid: string } => ({ uid: "test-uid" }),
  saveLocalResult: (data: unknown): void => {
    saveLocalResult(data);
  },
}));

vi.mock("../../src/ts/ape", () => ({
  default: {
    results: {
      add: async (body: unknown): Promise<unknown> => addResult(body),
    },
  },
}));

vi.mock("canvas-confetti", () => ({ default: vi.fn() }));

vi.mock("../../src/ts/states/core", () => ({
  isAuthenticated: () => false,
  getActivePage: () => "test",
  setIsScreenshotting: vi.fn(),
}));

function setupDom(): void {
  // `#tasksInput` is the capture textarea `input-element.ts` resolves at module
  // scope; the results screen blurs it on every render (INV-088's un-blur path).
  document.body.innerHTML = `<div class="page pageTest">
    <div id="tasksWrapper"><textarea id="tasksInput"></textarea></div>
    ${resultHtml}
    <div class="loading"></div>
  </div>`;
}

function taskEntry(
  index: number,
  correct: boolean,
  seconds: number,
): TaskLogEntry {
  return {
    i: index,
    kind: "add",
    prompt: `${index + 1} + 1`,
    expected: `${index + 2}`,
    given: correct ? `${index + 2}` : "0",
    correct,
    tStart: (seconds - 1) * 1000,
    tEnd: seconds * 1000,
  };
}

/**
 * Builds the payload exactly the way `test-logic.ts` does: every metric comes
 * out of `computeMetrics`, never out of this file.
 */
function buildPayload(
  taskLog: TaskLogEntry[],
  options: {
    testDuration?: number;
    settings?: MathGeneratorSettings;
    settingsId?: string;
    mode2?: Mode2<"time">;
    afkDuration?: number;
    isRepeated?: boolean;
    dontSave?: boolean;
  } = {},
): TestResultPayload {
  const testDuration = options.testDuration ?? 240;
  const metrics = computeMetrics(taskLog, testDuration);
  const settings = options.settings ?? SETTINGS;

  const completedEvent: Omit<CompletedEvent, "hash" | "uid"> = {
    score: metrics.score,
    correct: metrics.correct,
    wrong: metrics.wrong,
    acc: metrics.acc,
    tpm: metrics.tpm,
    spm: metrics.spm,
    consistency: metrics.consistency,
    mode: "time",
    mode2: options.mode2 ?? (`${testDuration / 60}` as Mode2<"time">),
    timestamp: Date.now(),
    testDuration,
    chartData: { score: [1, 2, 3], tpm: [12.5, 20, 24.5], wrong: [0, 1, 0] },
    settings,
    settingsId: options.settingsId ?? "custom",
    restartCount: 0,
    incompleteTestSeconds: 0,
    afkDuration: options.afkDuration ?? 0,
    mathSeed: 1234,
    mathSettings: { ...settings, time: (testDuration / 60) as 1 | 2 | 4 | 8 },
    engineVersion: "1",
    taskLog,
    incompleteTests: [],
  };

  const unanswered = metrics.correct + metrics.wrong === 0;
  return {
    completedEvent,
    isRepeated: options.isRepeated ?? false,
    afkDetected: false,
    tooShort: unanswered,
    dontSave: options.dontSave ?? unanswered,
  };
}

async function present(payload: TestResultPayload): Promise<void> {
  await import("../../src/ts/test/result");
  if (presenter === undefined) {
    throw new Error("presenter was never registered");
  }
  await presenter(payload);
}

function text(selector: string): string {
  return document.querySelector(selector)?.textContent?.trim() ?? "";
}

function hook(name: string): string | null {
  return document.querySelector("#result")?.getAttribute(name) ?? null;
}

/**
 * `present()` ends on `await Misc.promiseAnimate("#result", { duration:
 * applyReducedMotion(125) })`, and jsdom's `matchMedia` answers `matches:
 * false` to every query — so without this every render in this file really did
 * sleep 125 ms, which is ~3 s of the runtime and most of the reason the file
 * used to exceed vitest's default 5 s per-test timeout once a loaded full-suite
 * run took the CPU away from it. Reporting the preference sends
 * `Misc.applyReducedMotion` down the exact zero-duration branch a user with
 * `prefers-reduced-motion` set already gets in production: the code path under
 * test is real, only the sleeping is gone.
 */
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

describe("results screen", () => {
  beforeEach(() => {
    // jsdom implements neither of these; the results screen scrolls itself into
    // view and fades in on every render.
    Element.prototype.scrollIntoView ??= vi.fn();
    useReducedMotion();
    vi.resetModules();
    presenter = undefined;
    localPb.mockReturnValue(undefined);
    addResult.mockReset();
    setupDom();
  });

  it("registers itself with the test engine at module load", async () => {
    await import("../../src/ts/test/result");
    expect(presenter).toBeTypeOf("function");
  });

  describe("metrics", () => {
    it("renders exactly what computeMetrics produced (CP-101 … CP-107)", async () => {
      // 7 correct, 3 wrong over 240 s.
      const taskLog = [
        ...Array.from({ length: 7 }, (_, i) => taskEntry(i, true, i + 1)),
        ...Array.from({ length: 3 }, (_, i) => taskEntry(7 + i, false, 8 + i)),
      ];
      const metrics = computeMetrics(taskLog, 240);
      expect(metrics).toMatchObject({
        correct: 7,
        wrong: 3,
        score: 4,
        acc: 70,
        tpm: 2.5,
      });

      await present(buildPayload(taskLog));

      expect(text("#result .stats .score .bottom")).toBe("4");
      expect(text("#result .stats .correctwrong .correct .bottom")).toBe("7");
      expect(text("#result .stats .correctwrong .wrong .bottom")).toBe("3");
      expect(text("#result .stats .acc .bottom")).toBe("70%");
      expect(text("#result .stats .tpm .bottom")).toBe("2.50");
      expect(text("#result .stats .tasks .bottom")).toBe("10");
      // CP-106 — 240 s / 10 answered.
      expect(text("#result .stats .avgTime .bottom")).toBe("24.0s");
    });

    it("renders a negative score with a U+2212 sign (CP-101, ME-161, C33)", async () => {
      const taskLog = [
        taskEntry(0, true, 1),
        taskEntry(1, false, 2),
        taskEntry(2, false, 3),
      ];
      expect(computeMetrics(taskLog, 240).score).toBe(-1);

      await present(buildPayload(taskLog));
      expect(text("#result .stats .score .bottom")).toBe(`${MINUS_SIGN}1`);
      // ...while the machine-readable hook keeps the parseable ASCII form.
      expect(hook("data-score")).toBe("-1");
    });

    it("renders a positive score without a sign (CP-101)", async () => {
      const taskLog = [taskEntry(0, true, 1), taskEntry(1, true, 2)];
      expect(computeMetrics(taskLog, 240).score).toBe(2);

      await present(buildPayload(taskLog));
      expect(text("#result .stats .score .bottom")).toBe("2");
    });

    it("shows `-` for acc and avg time when nothing was answered (CP-103, CP-106)", async () => {
      await present(buildPayload([]));
      expect(text("#result .stats .acc .bottom")).toBe("-");
      expect(text("#result .stats .avgTime .bottom")).toBe("-");
      expect(text("#result .stats .tasks .bottom")).toBe("0");
    });

    it("shows `-` for consistency below two answered tasks (CP-107, C5)", async () => {
      await present(buildPayload([taskEntry(0, true, 1)]));
      expect(text("#result .stats .consistency .bottom")).toBe("-");
    });

    it("shows the kogasa consistency once there are two tasks (CP-107, C5)", async () => {
      const taskLog = [taskEntry(0, true, 1), taskEntry(1, true, 2)];
      const expected = computeMetrics(taskLog, 240).consistency;
      expect(expected).toBeGreaterThan(0);

      await present(buildPayload(taskLog));
      expect(text("#result .stats .consistency .bottom")).toBe(
        `${Math.round(expected)}%`,
      );
    });

    it("breaks the answered count down as correct / wrong (CP-105)", async () => {
      const taskLog = [
        taskEntry(0, true, 1),
        taskEntry(1, true, 2),
        taskEntry(2, false, 3),
      ];
      await present(buildPayload(taskLog));
      expect(
        document
          .querySelector("#result .stats .tasks .bottom")
          ?.getAttribute("aria-label"),
      ).toBe("2 / 1");
    });

    it("labels idle time `idle`, never `afk` (CP-108, C37)", async () => {
      await present(buildPayload([taskEntry(0, true, 1)], { afkDuration: 12 }));
      expect(text("#result .stats .time .bottom .afk")).toBe("12s idle");
    });
  });

  describe("test hooks (CP-188 / DoD-27)", () => {
    it("exposes all eight attributes on #result", async () => {
      const taskLog = [
        taskEntry(0, true, 1),
        taskEntry(1, true, 2),
        taskEntry(2, false, 3),
      ];
      const metrics = computeMetrics(taskLog, 240);
      await present(buildPayload(taskLog, { afkDuration: 5 }));

      expect(hook("data-score")).toBe(`${metrics.score}`);
      expect(hook("data-correct")).toBe(`${metrics.correct}`);
      expect(hook("data-wrong")).toBe(`${metrics.wrong}`);
      expect(hook("data-acc")).toBe(`${metrics.acc}`);
      expect(hook("data-tpm")).toBe(`${metrics.tpm}`);
      expect(hook("data-answered")).toBe("3");
      expect(hook("data-consistency")).toBe(`${metrics.consistency}`);
      expect(hook("data-afk")).toBe("5");
    });
  });

  describe("test type (CP-099)", () => {
    it("renders the duration and the enabled generators' short labels", async () => {
      await present(
        buildPayload([taskEntry(0, true, 1)], {
          testDuration: 480,
          mode2: "8",
        }),
      );
      const html =
        document.querySelector("#result .stats .testType .bottom")?.innerHTML ??
        "";
      expect(html).toContain("time 8");
      expect(html).toContain("+1000 100x100 xxx/xx +1/xx *x/y 4.2 -");
    });

    it("omits disabled generators", async () => {
      await present(
        buildPayload([taskEntry(0, true, 1)], {
          settings: {
            addition: "100",
            multiplication: "off",
            division: "off",
            fractionAddition: "off",
            fractionMultiplication: false,
            decimals: false,
            negatives: false,
          },
        }),
      );
      const html =
        document.querySelector("#result .stats .testType .bottom")?.innerHTML ??
        "";
      expect(html).toContain("+100");
      expect(html).not.toContain("100x100");
      expect(html).not.toContain("xxx/xx");
    });
  });

  describe("task history (CP-126)", () => {
    it("lists every committed task as `prompt = answer`", async () => {
      const taskLog = [taskEntry(0, true, 1), taskEntry(1, false, 2)];
      await present(buildPayload(taskLog));

      const entries = [
        ...document.querySelectorAll("#resultTaskHistory .tasks .task"),
      ];
      expect(entries).toHaveLength(2);
      expect(entries[0]?.textContent).toBe("1 + 1 = 2");
      expect(entries[0]?.className).toContain("correct");
      // A wrong entry is annotated with the correct answer.
      expect(entries[1]?.textContent).toBe("2 + 1 = 0(3)");
      expect(entries[1]?.className).toContain("wrong");
    });

    it("carries the commit second so the chart tooltip can highlight it (CP-121)", async () => {
      await present(buildPayload([taskEntry(0, true, 3)]));
      expect(
        document
          .querySelector("#resultTaskHistory .tasks .task")
          ?.getAttribute("data-second"),
      ).toBe("3");
    });

    it("starts hidden and toggles", async () => {
      await present(buildPayload([taskEntry(0, true, 1)]));
      const block = document.querySelector("#resultTaskHistory");
      expect(block?.classList.contains("hidden")).toBe(true);

      const { toggleTaskHistory } = await import("../../src/ts/test/result");
      toggleTaskHistory();
      expect(block?.classList.contains("hidden")).toBe(false);
      toggleTaskHistory();
      expect(block?.classList.contains("hidden")).toBe(true);
    });
  });

  describe("chart series (CP-113 … CP-116)", () => {
    it("feeds score, tpm and wrong straight off chartData", async () => {
      await present(buildPayload([taskEntry(0, true, 1)]));
      expect(chartDatasets["score"]?.data).toEqual([1, 2, 3]);
      expect(chartDatasets["tpm"]?.data).toEqual([12.5, 20, 24.5]);
      expect(chartDatasets["wrong"]?.data).toEqual([0, 1, 0]);
    });
  });

  describe("markup contract", () => {
    it("has exactly the four CP-119 legend buttons (master C15)", () => {
      const ids = [
        ...document.querySelectorAll("#result .chartLegend button"),
      ].map((b) => b.getAttribute("data-id"));
      expect(ids).toEqual(["scale", "pb", "tpm", "wrong"]);
    });

    it("has exactly the four CP-123 action buttons (master C19)", () => {
      const ids = [
        ...document.querySelectorAll("#result .bottom .buttons button"),
      ].map((b) => b.id);
      expect(ids).toEqual([
        "nextTestButton",
        "repeatTestButton",
        "toggleTaskHistoryButton",
        "saveScreenshotButton",
      ]);
    });

    it("carries the renamed chart canvas and history block (master C27)", () => {
      // The old ids are asserted gone by enumeration rather than by name, so
      // this file does not reintroduce the vocabulary DoD-13 bans.
      expect([...document.querySelectorAll("canvas")].map((c) => c.id)).toEqual(
        ["resultChart"],
      );
      expect(document.querySelector("#resultTaskHistory")).not.toBeNull();
      // The replay subsystem and the burst heatmap are gone (CP-124, CP-126).
      expect(document.querySelector("#resultReplay")).toBeNull();
      expect(document.querySelector("#toggleBurstHeatmap")).toBeNull();
    });

    it("keeps the login tip and the retry-saving button (CP-127, CP-128)", () => {
      expect(document.querySelector("#result .loginTip")).not.toBeNull();
      expect(document.querySelector("#retrySavingResultButton")).not.toBeNull();
    });
  });

  describe("daily leaderboard (CP-130)", () => {
    it("stays hidden for a run that could never enter a board", async () => {
      await present(
        buildPayload([taskEntry(0, true, 1)], {
          settingsId: "custom",
          mode2: "4",
        }),
      );
      expect(
        document
          .querySelector("#result .stats .dailyLeaderboard")
          ?.classList.contains("hidden"),
      ).toBe(true);
    });

    it("stays hidden for default settings at a non-board duration", async () => {
      addResult.mockResolvedValue({
        status: 200,
        body: {
          data: {
            insertedId: "1",
            isPb: false,
            xp: 10,
            xpBreakdown: {},
            dailyXpBonus: false,
            dailyLeaderboardRank: 3,
          },
        },
      });

      await present(
        buildPayload([taskEntry(0, true, 1)], {
          testDuration: 120,
          mode2: "2",
          settings: LEADERBOARD_SETTINGS,
          settingsId: LEADERBOARD_SETTINGS_ID,
          dontSave: false,
        }),
      );

      expect(
        document
          .querySelector("#result .stats .dailyLeaderboard")
          ?.classList.contains("hidden"),
      ).toBe(true);
    });
  });

  describe("other (CP-109, C37)", () => {
    it("marks a repeated run", async () => {
      await present(
        buildPayload([taskEntry(0, true, 1)], { isRepeated: true }),
      );
      expect(
        document
          .querySelector("#result .stats .info")
          ?.classList.contains("hidden"),
      ).toBe(false);
      expect(text("#result .stats .info .bottom")).toContain("repeated");
    });

    it("marks a run that answered nothing as too short", async () => {
      await present(buildPayload([]));
      expect(text("#result .stats .info .bottom")).toContain("too short");
    });

    it("never calls the save endpoint for an unsaveable run (CP-109)", async () => {
      await present(buildPayload([]));
      expect(addResult).not.toHaveBeenCalled();
    });
  });
});
