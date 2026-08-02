/**
 * The results screen (WP-07). CP-090 … CP-131, ME-160 … ME-165, INV-088.
 *
 * ## Where the numbers come from
 *
 * **Nothing on this screen is computed here.** Every metric is read straight off
 * the `CompletedEvent` the test engine hands over, and that event is built by
 * `@croco-calc/math-engine`'s `computeMetrics(taskLog, testDuration)` — the same
 * function the backend re-runs in `backend/src/api/controllers/result.ts`
 * (`assertMetricsMatchTaskLog`) before it will store the row. One
 * implementation, two callers, so client display and server truth cannot drift
 * (C40, AC-001 … AC-006).
 *
 * The only values derived on this screen are the two the schema deliberately
 * does not persist, both pure functions of persisted fields:
 * `answered = correct + wrong` (CP-105) and `avg time = testDuration / answered`
 * (CP-106).
 *
 * ## Hand-off
 *
 * `test-logic.ts` never imports this module. It exposes
 * `registerResultPresenter`, which the bottom of this file calls at module load;
 * that keeps the test engine free of a compile-time dependency on the results
 * page and lets C29 stay enforceable — the payload carries a task **log**, never
 * a live task.
 */

import { Chart } from "chart.js";
import type { AnnotationOptions } from "chartjs-plugin-annotation";
import confetti from "canvas-confetti";
import objectHash from "object-hash";
import { render } from "solid-js/web";
import { z } from "zod";

import type { CompletedEvent, TaskLogEntry } from "@croco-calc/schemas/results";
import { LEADERBOARD_SETTINGS_ID } from "@croco-calc/schemas/math";
import type { MathGeneratorSettings } from "@croco-calc/schemas/math";
import type { Mode } from "@croco-calc/schemas/shared";
import * as Numbers from "@croco-calc/util/numbers";

import Ape from "../ape";
import { Icon } from "../components/common/Icon";
import { Config } from "../config/store";
import { configMetadata } from "../config/metadata";
import { setConfig } from "../config/setters";
import * as ChartController from "../controllers/chart-controller";
import { SnapshotResult } from "../constants/default-snapshot";
import { CONTACT_EMAIL } from "../constants/links";
import * as DB from "../db";
import { configEvent } from "../events/config";
import { restartTestEvent } from "../events/test";
import * as GlarsesMode from "../legacy-states/glarses-mode";
import * as ConnectionState from "../legacy-states/connection";
import * as SlowTimer from "../legacy-states/slow-timer";
import { blurInputElement } from "../input/input-element";
import Format from "../singletons/format";
import { isAuthenticated } from "../states/core";
import { setAccountButtonSpinner } from "../states/header";
import {
  showErrorNotification,
  showNoticeNotification,
  showSuccessNotification,
} from "../states/notifications";
import {
  getResultVisible,
  isTestInvalid,
  setLastSignedOutResult,
  setResultCalculating,
} from "../states/test";
import { getTheme } from "../states/theme";
import * as DateTime from "../utils/date-and-time";
import { qs, qsa } from "../utils/dom";
import { LocalStorageWithSchema } from "../utils/local-storage-with-schema";
import * as Misc from "../utils/misc";
import * as PbCrown from "./pb-crown";
import * as TestLogic from "./test-logic";
import type { TestResultPayload } from "./test-logic";
import * as TodayTracker from "./today-tracker";

type PresentedResult = Omit<CompletedEvent, "hash" | "uid">;

/** The run currently on screen. Replaced wholesale on every finish. */
let result: PresentedResult | undefined;
/** The committed tasks, or `[]` when ME-176 degraded the log to `"toolong"`. */
let taskLog: TaskLogEntry[] = [];
let resultAnnotation: AnnotationOptions<"line">[] = [];
let minChartVal = 0;
let maxChartVal = 0;

/**
 * CP-129 — the screenshot watermark reads croco calc's domain, taken from the
 * one address constant the shell already ships rather than a second literal
 * that could drift out of step with it (`constants/links.ts` is WP-08's).
 */
export const SITE_DOMAIN = CONTACT_EMAIL.split("@")[1] ?? "crococalc.com";

// #region metric rendering

function answeredOf(res: PresentedResult): number {
  return res.correct + res.wrong;
}

function setBottom(selector: string, text: string, tooltip?: string): void {
  const element = qs(`#result .stats ${selector} .bottom`);
  element?.setText(text);
  if (tooltip !== undefined) element?.setAttribute("aria-label", tooltip);
}

/** CP-092 / CP-101 / CP-102 — score, then correct and wrong beneath it. */
function updateScore(res: PresentedResult): void {
  setBottom(
    ".score",
    Format.score(res.score),
    `${res.correct} correct − ${res.wrong} wrong`,
  );
  qs("#result .stats .correctwrong .correct .bottom")?.setText(
    `${res.correct}`,
  );
  qs("#result .stats .correctwrong .wrong .bottom")?.setText(`${res.wrong}`);
}

/**
 * CP-103 / master C6 — the stored value is `0` at zero answered tasks; the
 * *display* is `-`, because accuracy over zero attempts is undefined.
 */
function updateAcc(res: PresentedResult): void {
  const answered = answeredOf(res);
  if (answered === 0) {
    setBottom(".acc", "-", "no tasks answered");
    return;
  }
  setBottom(
    ".acc",
    Format.accuracy(res.acc),
    Format.accuracy(res.acc, { showDecimalPlaces: true }),
  );
}

/**
 * CP-104 / CP-105 / CP-106 — responses per minute (wrong ones included), the
 * answered count, and the mean seconds per task.
 */
function updateRates(res: PresentedResult): void {
  const answered = answeredOf(res);
  const minutes = res.testDuration / 60;

  // The stored `tpm` is already rounded to 2 dp by `computeMetrics`, so the
  // tooltip recomputes the quotient rather than re-displaying the same digits.
  // Same inputs, same formula, no rounding — it cannot disagree with the server.
  setBottom(
    ".tpm",
    Format.tpm(res.tpm, { showDecimalPlaces: true }),
    minutes > 0 ? `${answered / minutes}` : "0",
  );

  setBottom(".tasks", `${answered}`, `${res.correct} / ${res.wrong}`);

  if (answered === 0) {
    setBottom(".avgTime", "-", "no tasks answered");
  } else {
    const avg = res.testDuration / answered;
    setBottom(".avgTime", `${avg.toFixed(1)}s`, `${avg}s`);
  }
}

/**
 * CP-107 as ruled by master C5 — kogasa over the coefficient of variation of
 * the per-task response times. Fewer than two answered tasks has no meaningful
 * variance, so it renders `-`.
 */
function updateConsistency(res: PresentedResult): void {
  if (answeredOf(res) < 2) {
    setBottom(".consistency", "-", "needs at least two answered tasks");
    return;
  }
  setBottom(
    ".consistency",
    Format.percentage(res.consistency),
    Format.percentage(res.consistency, { showDecimalPlaces: true }),
  );
}

/**
 * CP-108 / master C37 — the duration, the idle sub-line and "time today".
 * The field is persisted as `afkDuration` and shown to the user as `idle`.
 */
function updateTime(res: PresentedResult): void {
  const idleSeconds = res.afkDuration;
  const idlePercent = Numbers.roundTo2(
    (idleSeconds / res.testDuration) * 100 || 0,
  );

  qs("#result .stats .time .bottom .afk")?.setText(
    idleSeconds > 0 ? `${Math.round(idleSeconds)}s idle` : "",
  );

  const showDecimals = Config.alwaysShowDecimalPlaces;
  const rounded = showDecimals
    ? Numbers.roundTo2(res.testDuration)
    : Math.round(res.testDuration);
  const text =
    res.testDuration > 61
      ? DateTime.secondsToString(rounded)
      : `${showDecimals ? rounded.toFixed(2) : rounded}s`;

  qs("#result .stats .time .bottom .text")?.setText(text);
  qs("#result .stats .time .bottom")?.setAttribute(
    "aria-label",
    `${Numbers.roundTo2(res.testDuration)}s (${idleSeconds}s idle ${idlePercent}%)`,
  );
}

export function updateTodayTracker(): void {
  qs("#result .stats .time .bottom .timeToday")?.setText(
    TodayTracker.getString(),
  );
}

/** The seven task-shaping settings, in the fixed CP-099 order. */
const SETTING_ORDER = [
  "addition",
  "multiplication",
  "division",
  "fractionAddition",
  "fractionMultiplication",
  "decimals",
  "negatives",
] as const satisfies readonly (keyof MathGeneratorSettings)[];

/**
 * CP-099 — the settings-bar short label of a stored value, e.g. `+1000`,
 * `100x100`, `xxx/xx`. Read out of the shared config metadata so the results
 * page and the bar can never disagree about what a value is called.
 */
function shortLabel(
  key: (typeof SETTING_ORDER)[number],
  value: string | boolean,
): string {
  const options = configMetadata[key].optionsMetadata as
    | Record<string, { displayString?: string } | undefined>
    | undefined;
  return options?.[String(value)]?.displayString ?? String(value);
}

/** CP-099 — line 1 `time <minutes>`, line 2 the enabled generators. */
function updateTestType(res: PresentedResult): void {
  const enabled = SETTING_ORDER.filter(
    (key) => res.settings[key] !== "off" && res.settings[key] !== false,
  ).map((key) => shortLabel(key, res.settings[key]));

  const lines = [`time ${res.mode2}`];
  if (enabled.length > 0) lines.push(enabled.join(" "));

  qs("#result .stats .testType .bottom")?.setHtml(
    lines.map((line) => Misc.escapeHTML(line)).join("<br>"),
  );
}

/**
 * The `other` group. CP-096 does not place the run-quality markers anywhere, and
 * upstream's `.group.info` is the only slot for them: CP-109's invalid marker,
 * the repeated-run marker, and C37's "you walked away" flag.
 */
function updateOther(payload: TestResultPayload): void {
  const notes: string[] = [];
  if (payload.afkDetected) notes.push("idle detected");
  if (isTestInvalid()) notes.push("invalid");
  if (payload.tooShort) notes.push("too short");
  if (payload.isRepeated) notes.push("repeated");

  const group = qs("#result .stats .info");
  if (notes.length === 0) {
    group?.hide();
    return;
  }
  group?.show();
  qs("#result .stats .info .bottom")?.setHtml(
    notes.map((note) => Misc.escapeHTML(note)).join("<br>"),
  );
}

/** CP-188 / DoD-27 — the eight machine-readable hooks. */
function updateTestHooks(res: PresentedResult): void {
  const element = qs("#result");
  element?.setAttribute("data-score", `${res.score}`);
  element?.setAttribute("data-correct", `${res.correct}`);
  element?.setAttribute("data-wrong", `${res.wrong}`);
  element?.setAttribute("data-acc", `${res.acc}`);
  element?.setAttribute("data-tpm", `${res.tpm}`);
  element?.setAttribute("data-answered", `${answeredOf(res)}`);
  element?.setAttribute("data-consistency", `${res.consistency}`);
  element?.setAttribute("data-afk", `${res.afkDuration}`);
}

// #endregion

// #region PB crown (CP-095)

export function showCrown(type: PbCrown.CrownType): void {
  PbCrown.show();
  PbCrown.update(type);
}

export function updateCrownText(text: string, wide = false): void {
  qs("#result .stats .score .crown")?.setAttribute("aria-label", text);
  qs("#result .stats .score .crown")?.setAttribute(
    "data-balloon-length",
    wide ? "medium" : "",
  );
}

export function hideCrown(): void {
  PbCrown.hide();
  updateCrownText("");
}

/**
 * CP-110 — a personal best is the highest `score` for the exact combination of
 * (duration, enabled generators), which is precisely `(mode2, settingsId)`.
 * There is no eligibility carve-out left to check: the funbox, stop-on-error
 * and bail-out conditions upstream tested for are all cut (C22, C38, INV-093).
 */
function updateCrown(res: PresentedResult, dontSave: boolean): void {
  if (dontSave) {
    hideCrown();
    return;
  }

  const localPb = DB.getLocalPB(res.mode2, res.settingsId);
  const diff = res.score - (localPb?.score ?? 0);

  if (localPb === undefined || diff > 0) {
    // Half crown until the server confirms it.
    showCrown("pending");
    updateCrownText(`+${Format.score(diff)}`);
  } else {
    hideCrown();
  }
}

export function showErrorCrownIfNeeded(): void {
  if (PbCrown.getCurrentType() !== "pending") return;
  PbCrown.show();
  PbCrown.update("error");
  updateCrownText(
    "Local PB data is out of sync with the server - please refresh (pb mismatch)",
    true,
  );
}

/** CP-131 — the confetti burst on a new personal best. */
export function showConfetti(): void {
  if (SlowTimer.get()) return;
  const style = getComputedStyle(document.body);
  const colors = [
    style.getPropertyValue("--main-color"),
    style.getPropertyValue("--text-color"),
    style.getPropertyValue("--sub-color"),
  ];
  const duration = Date.now() + 125;

  (function f(): void {
    void confetti({
      particleCount: 5,
      angle: 60,
      spread: 75,
      origin: { x: 0 },
      colors,
    });
    void confetti({
      particleCount: 5,
      angle: 120,
      spread: 75,
      origin: { x: 1 },
      colors,
    });

    if (Date.now() < duration) requestAnimationFrame(f);
  })();
}

// #endregion

// #region chart (CP-113 … CP-121)

/**
 * CP-113 … CP-116 — the three per-second series come straight off
 * `result.chartData`, which the engine sampled once per elapsed second and
 * capped at `CHART_DATA_MAX_POINTS` (481, master C7). Sample `i` is the state
 * at the end of second `i + 1`.
 */
function updateChartData(res: PresentedResult): void {
  if (res.chartData === "toolong") {
    ChartController.result.getDataset("score").data = [];
    ChartController.result.getDataset("tpm").data = [];
    ChartController.result.getDataset("wrong").data = [];
    ChartController.result.data.labels = [];
    return;
  }

  ChartController.result.data.labels = res.chartData.score.map(
    (_, index) => `${index + 1}`,
  );
  ChartController.result.getDataset("score").data = [...res.chartData.score];
  ChartController.result.getDataset("tpm").data = res.chartData.tpm.map((tpm) =>
    Numbers.roundTo2(tpm),
  );
  ChartController.result.getDataset("wrong").data = [...res.chartData.wrong];
  ChartController.result.getScale("wrong").max = Math.max(
    1,
    ...res.chartData.wrong,
  );
}

/**
 * CP-118 — the personal-best line, drawn on the `score` scale so the second the
 * run crossed its PB is readable off the chart. Master C15 cuts tags, so
 * `PB: <score>` is the only label left.
 */
function updateChartPBLine(res: PresentedResult): void {
  const localPb = DB.getLocalPB(res.mode2, res.settingsId);
  if (localPb === undefined) return;

  const themecolors = getTheme();
  resultAnnotation.push({
    display: true,
    type: "line",
    id: "lpb",
    scaleID: "score",
    value: localPb.score,
    borderColor: `${themecolors.sub}55`,
    borderWidth: 1,
    label: {
      backgroundColor: themecolors.sub,
      font: {
        family: Config.fontFamily.replace(/_/g, " "),
        size: 11,
        style: "normal",
        weight: Chart.defaults.font.weight as string,
        lineHeight: Chart.defaults.font.lineHeight as number,
      },
      color: themecolors.bg,
      padding: 3,
      borderRadius: 3,
      position: "center",
      content: ` PB: ${Format.score(localPb.score)} `,
      display: true,
    },
  });
}

/** CP-119 as amended by master C15 — `scale`, `pb`, `tpm`, `wrong`. */
const CHART_SERIES_IDS = ["tpm", "wrong", "pb"] as const;
type ChartSeriesId = (typeof CHART_SERIES_IDS)[number];

const resultChartDataVisibility = new LocalStorageWithSchema({
  key: "resultChartDataVisibility",
  schema: z
    .object({
      tpm: z.boolean(),
      wrong: z.boolean(),
      pb: z.boolean(),
    })
    .strict(),
  fallback: {
    tpm: true,
    wrong: true,
    pb: true,
  },
});

function isChartSeriesId(id: string | null): id is ChartSeriesId {
  return CHART_SERIES_IDS.includes(id as ChartSeriesId);
}

function updateResultChartDataVisibility(): void {
  const visible = resultChartDataVisibility.get();
  ChartController.result.getDataset("tpm").hidden = !visible.tpm;
  ChartController.result.getDataset("wrong").hidden = !visible.wrong;

  for (const annotation of resultAnnotation) {
    if (annotation.id === "lpb") annotation.display = visible.pb;
  }

  const hasPbAnnotation = resultAnnotation.some((a) => a.id === "lpb");

  for (const button of qsa("#result .chart .chartLegend button")) {
    const id = button.getAttribute("data-id");
    if (id === "scale") {
      button.toggleClass("active", Config.startGraphsAtZero);
      continue;
    }
    if (!isChartSeriesId(id)) continue;
    button.toggleClass("active", visible[id]);
    if (id === "pb") button.toggleClass("hidden", !hasPbAnnotation);
  }
}

/**
 * CP-120 — `startGraphsAtZero` decides the floor of both left axes. Score is
 * signed (CP-101), so "start at zero" means "clamp the floor at zero", which for
 * a run that went negative still has to leave the trough visible.
 */
function updateMinMaxChartValues(): void {
  const values: number[] = [];
  const score = ChartController.result.getDataset("score");
  const tpm = ChartController.result.getDataset("tpm");

  if (!(score.hidden ?? false)) values.push(...score.data);
  if (!(tpm.hidden ?? false)) values.push(...tpm.data);

  for (const annotation of resultAnnotation) {
    if ((annotation.display ?? false) === false) continue;
    if (typeof annotation.value === "number") values.push(annotation.value);
  }

  if (values.length === 0) {
    minChartVal = 0;
    maxChartVal = 10;
    return;
  }

  maxChartVal = Math.ceil(Math.max(...values) / 10) * 10;
  const lowest = Math.floor(Math.min(...values) / 10) * 10;
  minChartVal = Config.startGraphsAtZero ? Math.min(0, lowest) : lowest;
  if (maxChartVal <= minChartVal) maxChartVal = minChartVal + 10;
}

function applyMinMaxChartValues(): void {
  ChartController.result.getScale("score").min = minChartVal;
  ChartController.result.getScale("score").max = maxChartVal;
  // tpm is non-negative, so it only ever needs the ceiling shared with score.
  ChartController.result.getScale("tpm").min = Math.max(0, minChartVal);
  ChartController.result.getScale("tpm").max = maxChartVal;
}

function applyAnnotations(): void {
  ChartController.result.options.plugins ??= {};
  ChartController.result.options.plugins.annotation = {
    annotations: resultAnnotation,
  };
}

function refreshChart(res: PresentedResult): void {
  resultAnnotation = [];
  updateChartData(res);
  updateChartPBLine(res);
  updateResultChartDataVisibility();
  updateMinMaxChartValues();
  applyMinMaxChartValues();
  applyAnnotations();
}

/**
 * Dev tooling (INV-118i) — fills the chart with a synthetic 240-second run so
 * the axes, the legend toggles and the PB annotation can be eyeballed without
 * sitting through a test. Deterministic on purpose; it never touches the
 * displayed metrics, only the three chart series.
 */
let fakeChartData = false;

export function toggleUserFakeChartData(): void {
  fakeChartData = !fakeChartData;
  showSuccessNotification(fakeChartData ? "on" : "off");
  if (!getResultVisible() || result === undefined) return;

  if (!fakeChartData) {
    refreshChart(result);
    ChartController.result.update();
    return;
  }

  const seconds = 240;
  const score: number[] = [];
  const tpm: number[] = [];
  const wrong: number[] = [];
  let running = 0;
  for (let second = 1; second <= seconds; second++) {
    const wrongThisSecond = second % 37 === 0 ? 1 : 0;
    if (second % 5 === 0) running += wrongThisSecond === 1 ? -1 : 1;
    score.push(running);
    tpm.push(Numbers.roundTo2((second / 5) * (60 / second)));
    wrong.push(wrongThisSecond);
  }

  resultAnnotation = [];
  ChartController.result.data.labels = score.map((_, i) => `${i + 1}`);
  ChartController.result.getDataset("score").data = score;
  ChartController.result.getDataset("tpm").data = tpm;
  ChartController.result.getDataset("wrong").data = wrong;
  ChartController.result.getScale("wrong").max = 1;
  updateResultChartDataVisibility();
  updateMinMaxChartValues();
  applyMinMaxChartValues();
  applyAnnotations();
  ChartController.result.update();
}

// #endregion

// #region task history (CP-126)

function renderTaskHistory(): void {
  const container = qs("#resultTaskHistory .tasks");
  if (container === null) return;

  if (taskLog.length === 0) {
    container.setHtml(
      "<div class='task'>The task log for this run was too long to keep.</div>",
    );
    return;
  }

  const html = taskLog
    .map((entry) => {
      const second = Math.max(1, Math.ceil(entry.tEnd / 1000));
      const prompt = Misc.escapeHTML(entry.prompt);
      const given = Misc.escapeHTML(entry.given === "" ? "-" : entry.given);
      const expected = entry.correct
        ? ""
        : `<span class="expected">(${Misc.escapeHTML(entry.expected)})</span>`;
      return `<div class="task ${
        entry.correct ? "correct" : "wrong"
      }" data-taskindex="${entry.i}" data-second="${second}">${prompt} = ${given}${expected}</div>`;
    })
    .join("");

  container.setHtml(html);
}

/** CP-123 item 4 — the action-row toggle and the palette command share this. */
export function toggleTaskHistory(force?: boolean): void {
  const block = qs("#resultTaskHistory");
  if (block === null) return;
  const show = force ?? block.hasClass("hidden");
  block.toggleClass("hidden", !show);
}

function taskListText(missedOnly: boolean): string {
  return taskLog
    .filter((entry) => !missedOnly || !entry.correct)
    .map((entry) =>
      entry.correct
        ? `${entry.prompt} = ${entry.given}`
        : `${entry.prompt} = ${entry.given} (${entry.expected})`,
    )
    .join("\n");
}

async function copyTaskList(missedOnly: boolean): Promise<void> {
  const text = taskListText(missedOnly);
  if (text === "") {
    showNoticeNotification("Nothing to copy");
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    showSuccessNotification("Copied to clipboard", { durationMs: 2000 });
  } catch (error) {
    showErrorNotification("Could not copy to clipboard", { error });
  }
}

// #endregion

// #region saving (INV-088)

type RetrySaving = {
  completedEvent: CompletedEvent | null;
  canRetry: boolean;
};

const retrySaving: RetrySaving = {
  completedEvent: null,
  canRetry: false,
};

/** Statuses the server will never accept on a second attempt. */
const UNRETRYABLE_STATUSES = [460, 461, 463, 464, 465, 466];

/**
 * CP-130 — the daily-leaderboard block may only appear for a run that could
 * actually enter a daily board. Both halves of the predicate are evaluated from
 * the persisted result and the shared constant, never re-derived from the live
 * config (SB-175, master C31, AC-121).
 */
function isDailyLeaderboardEligible(res: PresentedResult): boolean {
  return (
    res.settingsId === LEADERBOARD_SETTINGS_ID &&
    (res.mode2 === "4" || res.mode2 === "8")
  );
}

function showDailyLeaderboardRank(
  res: PresentedResult,
  rank: number | undefined,
): void {
  const group = qs("#result .stats .dailyLeaderboard");
  if (rank === undefined || !isDailyLeaderboardEligible(res)) {
    group?.hide();
    return;
  }
  group?.show();
  qs("#result #dailyLeaderboardRank")?.setText(
    Format.rank(rank, { fallback: "" }),
  );
}

async function saveResult(
  completedEvent: CompletedEvent,
  isRetrying: boolean,
): Promise<void> {
  const payload = structuredClone(completedEvent);
  //@ts-expect-error the hash is recomputed over everything except itself
  delete payload.hash;
  payload.hash = objectHash(payload);

  setAccountButtonSpinner(true);
  const response = await Ape.results.add({ body: { result: payload } });
  setAccountButtonSpinner(false);

  if (response.status !== 200) {
    if (!UNRETRYABLE_STATUSES.includes(response.status)) {
      retrySaving.canRetry = true;
      qs("#retrySavingResultButton")?.show();
      if (!isRetrying) retrySaving.completedEvent = payload;
    }
    showErrorNotification("Failed to save result", { response });
    return;
  }

  const data = response.body.data;

  const snapshotResult = structuredClone(
    payload,
  ) as unknown as SnapshotResult<Mode>;
  snapshotResult._id = data.insertedId;
  if (data.isPb) snapshotResult.isPb = true;

  if (data.isPb) {
    // A first-ever result on a settings combination is a PB by definition and
    // does not deserve a celebration; beating an existing one does.
    if (DB.getLocalPB(payload.mode2, payload.settingsId) !== undefined) {
      showConfetti();
    }
    showCrown("normal");
  } else {
    showErrorCrownIfNeeded();
  }

  if (result !== undefined) {
    showDailyLeaderboardRank(result, data.dailyLeaderboardRank);
  }

  DB.saveLocalResult({
    xp: data.xp,
    xpBreakdown: getResultVisible() ? data.xpBreakdown : undefined,
    result: snapshotResult,
    isPb: data.isPb,
  });

  qs("#retrySavingResultButton")?.hide();
  if (isRetrying) showSuccessNotification("Result saved", { important: true });
}

export async function retrySavingResult(): Promise<void> {
  const { completedEvent } = retrySaving;

  if (completedEvent === null) {
    showNoticeNotification(
      "Could not retry saving the result as the result no longer exists.",
      { durationMs: 5000, important: true },
    );
    return;
  }
  if (!retrySaving.canRetry) return;

  retrySaving.canRetry = false;
  qs("#retrySavingResultButton")?.hide();
  showNoticeNotification("Retrying to save...");

  await saveResult(completedEvent, true);
}

/**
 * CP-109 / CP-127 — an unauthenticated run is parked so the sign-in flow can
 * offer to save it; an invalid one is never saved at all.
 */
async function handleSaving(payload: TestResultPayload): Promise<void> {
  const uid = DB.getSnapshot()?.uid;

  if (payload.dontSave) {
    if (payload.tooShort) {
      showNoticeNotification(
        "Test invalid - you did not answer a single task.",
        { important: true, durationMs: 5000 },
      );
    } else if (!Config.resultSaving) {
      showNoticeNotification("Result not saved: disabled by user", {
        durationMs: 3000,
      });
    }
    return;
  }

  if (result === undefined) return;

  if (!isAuthenticated() || uid === undefined) {
    // Kept for the LastSignedOutResult flow, which re-hashes it under the real
    // uid once the user signs in.
    setLastSignedOutResult({ ...result, uid: "", hash: "" });
    return;
  }

  const completedEvent: CompletedEvent = { ...result, uid, hash: "" };
  retrySaving.completedEvent = null;
  retrySaving.canRetry = false;
  await saveResult(completedEvent, false);
}

// #endregion

// #region icons

/**
 * Fills every `[data-icon]` placeholder in `test-result.html` with the shared
 * `Icon` component (C10, CP-001). The markup keeps the ids so the build-time
 * icon audit can see them; this only mounts them.
 */
function mountIcons(): void {
  for (const slot of qsa("#result [data-icon]")) {
    const icon = slot.getAttribute("data-icon");
    if (icon === null || slot.native.childElementCount > 0) continue;
    render(
      () => Icon({ icon, fixedWidth: slot.hasAttribute("data-icon-fw") }),
      slot.native,
    );
  }
}

// #endregion

/** Renders a finished run. Registered with the test engine at module load. */
async function present(payload: TestResultPayload): Promise<void> {
  result = structuredClone(payload.completedEvent);
  taskLog = result.taskLog === "toolong" ? [] : [...result.taskLog];

  hideCrown();
  toggleTaskHistory(false);
  qs("#retrySavingResultButton")?.hide();
  qs("#result .stats .dailyLeaderboard")?.hide();
  qs(".ssWatermark")?.setText(SITE_DOMAIN);
  blurInputElement();

  if (!ConnectionState.get()) ConnectionState.showOfflineBanner();

  updateScore(result);
  updateAcc(result);
  updateRates(result);
  updateConsistency(result);

  TodayTracker.addSeconds(
    result.testDuration + result.incompleteTestSeconds - result.afkDuration,
  );
  updateTime(result);
  updateTodayTracker();

  updateTestType(result);
  updateOther(payload);
  updateTestHooks(result);
  updateCrown(result, payload.dontSave);

  refreshChart(result);
  renderTaskHistory();
  ChartController.result.resize();

  if (isAuthenticated()) {
    qs("#result .loginTip")?.hide();
  } else {
    qs("#result .loginTip")?.show();
  }

  if (GlarsesMode.get()) {
    qsa("#result .stats")?.hide();
    qs("#result .chart")?.hide();
    qs("#result .loginTip")?.hide();
    console.log(
      `Test completed: score ${result.score} (${result.correct}/${result.wrong}) acc ${result.acc}% tpm ${result.tpm}`,
    );
  } else {
    qsa("#result .stats")?.show();
    qs("#result .chart")?.show();
  }

  qs(".pageTest .loading")?.hide();
  qs("#result")?.show();

  const resultEl = qs("#result");
  resultEl?.focus({ preventScroll: true });

  await Misc.promiseAnimate("#result", {
    opacity: [0, 1],
    duration: Misc.applyReducedMotion(125),
  });

  Misc.scrollToCenterOrTop(resultEl?.native ?? null);
  setResultCalculating(false);
  ChartController.result.resize();

  await handleSaving(payload);
}

// #region wiring

mountIcons();

TestLogic.registerResultPresenter(present);

/** Every restart path puts the results screen away again (CP-052, CP-088). */
restartTestEvent.subscribe(() => {
  qs("#result")?.hide();
  hideCrown();
});

qs("#result")?.onChild("click", "#nextTestButton", () => {
  restartTestEvent.dispatch();
});

// CP-123 item 2 / CP-089 — the identical seeded task sequence.
qs("#result")?.onChild("click", "#repeatTestButton", () => {
  qs("#result")?.hide();
  hideCrown();
  TestLogic.restart({ repeat: true });
});

qs("#result")?.onChild("click", "#toggleTaskHistoryButton", () => {
  toggleTaskHistory();
});

qs("#result")?.onChild("click", "#copyTaskListButton", () => {
  void copyTaskList(false);
});

qs("#result")?.onChild("click", "#copyMissedTaskListButton", () => {
  void copyTaskList(true);
});

qs("#result")?.onChild("click", "#retrySavingResultButton", () => {
  void retrySavingResult();
});

qsa("#result .chart .chartLegend button")?.on("click", (event) => {
  const target = event.currentTarget as HTMLElement;
  const id = target.getAttribute("data-id");

  // CP-120 — `scale` toggles the config, which re-enters through configEvent.
  if (id === "scale") {
    setConfig("startGraphsAtZero", !Config.startGraphsAtZero);
    return;
  }
  if (!isChartSeriesId(id)) return;

  const visible = resultChartDataVisibility.get();
  visible[id] = !visible[id];
  resultChartDataVisibility.set(visible);

  updateResultChartDataVisibility();
  updateMinMaxChartValues();
  applyMinMaxChartValues();
  applyAnnotations();
  ChartController.result.update();
});

configEvent.subscribe(({ key }) => {
  if (key !== "startGraphsAtZero") return;
  if (!getResultVisible() || result === undefined) return;
  refreshChart(result);
  ChartController.result.update();
});

// #endregion
