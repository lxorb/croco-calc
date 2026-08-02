/**
 * The results chart (WP-07). CP-111 … CP-121, master C7 and C27.
 *
 * chart.js is kept, and so is the `ChartWithUpdateColors` wrapper whose
 * `updateColors(theme)` is what makes the chart re-paint when a theme is picked
 * (CP-111). What changed is the vocabulary:
 *
 * - the canvas is `#resultChart`, not upstream's speed-named one (CP-112, C27);
 * - the primary left axis is **score** — cumulative `correct − wrong` after each
 *   second — because that is the metric the run is judged by and the PB
 *   annotation has to sit on it (CP-114, §9.6);
 * - the secondary left axis is **tpm**, dashed and hidden by default (CP-115);
 * - the right axis is **wrong**, a `crossRot` scatter (CP-116);
 * - upstream's `burst` dataset and axis are gone (CP-117).
 *
 * Series data comes straight off `result.chartData` (CP-113 … CP-116), which
 * the test engine samples once per elapsed second and caps at
 * `CHART_DATA_MAX_POINTS` (481 — master C7). Nothing here reads the event log:
 * INV-089 rewrote it for the task vocabulary and the per-second series no longer
 * has to be reconstructed post hoc.
 */

import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Filler,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  ScatterController,
  TimeScale,
  TimeSeriesScale,
  Tooltip,
  type ChartItem,
  type AnimationSpec,
  type CartesianScaleOptions,
  type ChartConfiguration,
  type ChartDataset,
  type ChartType,
  type DefaultDataPoint,
  type PluginChartOptions,
} from "chart.js";

import chartAnnotation, {
  type AnnotationOptions,
  type LabelOptions,
} from "chartjs-plugin-annotation";
import chartTrendline from "chartjs-plugin-trendline";

Chart.register(
  BarController,
  BarElement,
  CategoryScale,
  Filler,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  ScatterController,
  TimeScale,
  TimeSeriesScale,
  Tooltip,
  chartTrendline,
  chartAnnotation,
);

(
  Chart.defaults.animation as AnimationSpec<"line" | "bar" | "scatter">
).duration = 0;
Chart.defaults.elements.line.tension = 0.5;
Chart.defaults.elements.line.fill = "origin";

import "chartjs-adapter-date-fns";
import { configEvent } from "../events/config";

import { getTheme } from "../states/theme";
import { Theme } from "../constants/themes";
import { createDebouncedEffectOn } from "../hooks/effects";
import { qsa } from "../utils/dom";
import { typedKeys } from "@croco-calc/util/objects";

/** The three series the results chart plots (CP-114 … CP-116). */
export type ResultChartSeries = "score" | "tpm" | "wrong";

export class ChartWithUpdateColors<
  TType extends ChartType = ChartType,
  TData = DefaultDataPoint<TType>,
  TLabel = unknown,
  DatasetIds = never,
> extends Chart<TType, TData, TLabel> {
  // oxlint-disable-next-line no-useless-constructor
  constructor(
    item: ChartItem,
    config: ChartConfiguration<TType, TData, TLabel>,
  ) {
    super(item, config);
  }

  async updateColors(theme: Theme): Promise<void> {
    //@ts-expect-error it's too difficult to figure out these types, but this works
    await updateColors(this, theme);
  }

  getDataset(id: DatasetIds): ChartDataset<TType, TData> {
    //@ts-expect-error it's too difficult to figure out these types, but this works
    return this.data.datasets?.find((x) => x.yAxisID === id);
  }

  getScaleIds(): DatasetIds[] {
    //@ts-expect-error it's too difficult to figure out these types, but this works
    return typedKeys(this.options?.scales ?? {}) as DatasetIds[];
  }

  getScale(
    id: DatasetIds extends never ? never : "x" | DatasetIds,
  ): DatasetIds extends never ? never : CartesianScaleOptions {
    //@ts-expect-error it's too difficult to figure out these types, but this works
    // oxlint-disable-next-line no-unsafe-return, no-unsafe-member-access
    return this.options.scales[id];
  }
}

/**
 * CP-121 — upstream's `afterLabel` highlighted the input typed in the hovered
 * second; here it highlights the **tasks committed in that second** in the
 * CP-126 history list. The list carries `data-second` on every entry, so the
 * lookup needs neither the result object nor an import of `test/result.ts`
 * (which imports this module).
 */
function highlightTasksForSecond(second: number): void {
  for (const entry of qsa("#resultTaskHistory .tasks .task")) {
    const at = Number(entry.getAttribute("data-second"));
    entry.toggleClass("highlighted", Number.isFinite(at) && at === second);
  }
}

export const result = new ChartWithUpdateColors<
  "line" | "scatter",
  number[],
  string,
  ResultChartSeries
>(document.querySelector("#resultChart") as HTMLCanvasElement, {
  type: "line",
  data: {
    labels: [],
    datasets: [
      {
        // CP-114 — cumulative score, solid, the axis the PB line sits on.
        //@ts-expect-error the type is defined incorrectly, have to ignore the error
        clip: false,
        label: "score",
        data: [],
        borderColor: "rgba(125, 125, 125, 1)",
        borderWidth: 3,
        yAxisID: "score",
        order: 2,
        pointRadius: 1,
      },
      {
        // CP-115 — running-average tasks per minute, dashed, off by default.
        //@ts-expect-error the type is defined incorrectly, have to ignore the error
        clip: false,
        label: "tpm",
        data: [],
        borderColor: "rgba(125, 125, 125, 1)",
        borderWidth: 2,
        yAxisID: "tpm",
        borderDash: [8, 8],
        order: 3,
        pointRadius: 0,
      },
      {
        // CP-116 — wrong answers committed in each second.
        //@ts-expect-error the type is defined incorrectly, have to ignore the error
        clip: false,
        label: "wrong",
        data: [],
        borderColor: "rgba(255, 125, 125, 1)",
        pointBackgroundColor: "rgba(255, 125, 125, 1)",
        borderWidth: 2,
        order: 1,
        yAxisID: "wrong",
        type: "scatter",
        pointStyle: "crossRot",
        pointRadius: function (context): number {
          const index = context.dataIndex;
          const value = context.dataset.data[index] as number;
          return (value ?? 0) <= 0 ? 0 : 3;
        },
        pointHoverRadius: function (context): number {
          const index = context.dataIndex;
          const value = context.dataset.data[index] as number;
          return (value ?? 0) <= 0 ? 0 : 5;
        },
      },
    ],
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      // CP-113 — one point per elapsed second, exactly as upstream.
      x: {
        axis: "x",
        ticks: {
          autoSkip: true,
          autoSkipPadding: 20,
        },
        display: true,
        title: {
          display: false,
          text: "Seconds",
        },
      },
      score: {
        axis: "y",
        display: true,
        title: {
          display: true,
          text: "Score",
        },
        // CP-101 — score may be negative, so the axis floor is decided by
        // `startGraphsAtZero` in `test/result.ts` (CP-120), never pinned here.
        ticks: {
          autoSkip: true,
          autoSkipPadding: 20,
        },
        grid: {
          display: true,
        },
      },
      tpm: {
        axis: "y",
        display: false,
        title: {
          display: true,
          text: "Tasks per Minute",
        },
        beginAtZero: true,
        min: 0,
        ticks: {
          autoSkip: true,
          autoSkipPadding: 20,
        },
        grid: {
          display: false,
        },
      },
      wrong: {
        axis: "y",
        display: true,
        position: "right",
        title: {
          display: true,
          text: "Wrong",
        },
        beginAtZero: true,
        ticks: {
          precision: 0,
          autoSkip: true,
          autoSkipPadding: 20,
        },
        grid: {
          display: false,
        },
      },
    },
    plugins: {
      annotation: {
        annotations: [],
      },
      tooltip: {
        animation: { duration: 250 },
        mode: "index",
        intersect: false,
        callbacks: {
          afterLabel: function (ti): string {
            const second = Math.round(parseFloat(ti.label));
            if (Number.isFinite(second)) highlightTasksForSecond(second);
            return "";
          },
        },
      },
    },
  },
});

/**
 * Re-paints the results chart for the active theme (CP-111). Every other chart
 * in the app is a Solid component (`components/common/ChartJs.tsx`) and colours
 * itself, so this only has the one shape to handle.
 */
async function updateColors<
  TType extends ChartType = "bar" | "line" | "scatter",
  TData = number[],
  TLabel = string,
>(
  chart: ChartWithUpdateColors<TType, TData, TLabel>,
  colors: Theme,
): Promise<void> {
  const gridcolor = colors.subAlt;

  for (const scaleKey of typedKeys(chart.scales)) {
    //@ts-expect-error cant figure out this type but it works fine
    const scale = chart.getScale(scaleKey) as CartesianScaleOptions;
    scale.grid.color = gridcolor;
    scale.grid.tickColor = gridcolor;
    scale.grid.borderColor = gridcolor;
    scale.ticks.color = colors.sub;
    scale.title.color = colors.sub;
  }

  const c = chart as unknown as typeof result;

  const score = c.getDataset("score");
  score.backgroundColor = "transparent";
  score.borderColor = colors.main;
  score.pointBackgroundColor = colors.main;
  score.pointBorderColor = colors.main;

  const tpm = c.getDataset("tpm");
  tpm.backgroundColor = "transparent";
  tpm.borderColor = `${colors.main}99`;
  tpm.pointBackgroundColor = `${colors.main}99`;
  tpm.pointBorderColor = `${colors.main}99`;

  const wrong = c.getDataset("wrong");
  wrong.backgroundColor = colors.error;
  wrong.borderColor = colors.error;
  wrong.pointBackgroundColor = colors.error;
  wrong.pointBorderColor = colors.error;

  // CP-118 — the PB annotation keeps upstream's line + label styling.
  (
    (chart.options as PluginChartOptions<TType>).plugins.annotation
      .annotations as AnnotationOptions<"line">[]
  ).forEach((annotation) => {
    annotation.borderColor = colors.sub;
    (annotation.label as LabelOptions).backgroundColor = colors.sub;
    (annotation.label as LabelOptions).color = colors.bg;
  });

  chart.update("resize");
}

function setDefaultFontFamily(font: string): void {
  Chart.defaults.font.family = font.replace(/_/g, " ");
}

createDebouncedEffectOn(125, getTheme, (theme) => {
  void result.updateColors(theme);
});

configEvent.subscribe(({ key, newValue }) => {
  if (key === "fontFamily") setDefaultFontFamily(newValue);
});
