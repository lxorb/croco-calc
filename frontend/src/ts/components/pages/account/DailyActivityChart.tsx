import { roundTo2 } from "@croco-calc/util/numbers";
import { TooltipItem } from "chart.js";
import { format as dateFormat } from "date-fns/format";
import { Accessor, JSXElement } from "solid-js";

import {
  ResultsQueryState,
  useResultStatsLiveQuery,
} from "../../../collections/results";
import { getTheme } from "../../../states/theme";
import { secondsToString } from "../../../utils/date-and-time";
import { Formatting } from "../../../utils/format";
import AsyncContent from "../../common/AsyncContent";
import { ChartJs } from "../../common/ChartJs";

/**
 * AC-091 — the time-spent chart. The upstream time-at-the-keyboard bar dataset
 * becomes "Time spent" (AC-014) and its speed line becomes the average `score`
 * line; the speed-unit prop is gone with the unit system, so the chart takes
 * only the `Formatting` helper. The `Average Consistency` tooltip row is gone —
 * master C5 keeps `consistency` off every account surface.
 */
export function DailyActivityChart(props: {
  queryState: Accessor<ResultsQueryState | undefined>;
  beginAtZero: boolean;
  format: Formatting;
}): JSXElement {
  const dataQuery = useResultStatsLiveQuery(() => props.queryState(), {
    groupByDay: true,
  });

  const formatScore = (score: number): string =>
    props.format.decimals(score, { showDecimalPlaces: true });

  return (
    <AsyncContent collections={{ dataQuery }}>
      {({ dataQueryData }) => (
        <div style={{ height: "200px" }}>
          <ChartJs
            name="DailyActivity"
            type="bar"
            data={{
              labels: dataQueryData().map((it) => it.dayTimestamp),
              datasets: [
                {
                  yAxisID: "count",
                  data: dataQueryData().map((it) => it.timeSpent / 60),
                  backgroundColor: getTheme().main,
                  trendlineLinear: {
                    lineStyle: "dotted",
                    width: 2,
                    //@ts-expect-error colorMin and colorMax missing from the type definition
                    colorMin: getTheme().sub,
                    colorMax: getTheme().sub,
                  },
                  order: 3,
                },
                {
                  yAxisID: "avgScore",
                  data: dataQueryData().map((it) => it.avgScore),
                  borderColor: getTheme().sub,
                  pointBackgroundColor: getTheme().sub,
                  type: "line",
                  order: 2,
                  tension: 0,
                  fill: false,
                },
              ],
            }}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              hover: {
                mode: "nearest",
                intersect: false,
              },
              scales: {
                x: {
                  axis: "x",
                  ticks: {
                    autoSkip: true,
                    autoSkipPadding: 20,
                  },
                  type: "time",
                  time: {
                    unit: "day",
                    displayFormats: {
                      day: "d MMM",
                    },
                  },
                  bounds: "ticks",
                  display: true,
                  title: {
                    display: false,
                    text: "Date",
                  },
                  offset: true,
                },
                count: {
                  axis: "y",
                  beginAtZero: true,
                  min: 0,
                  ticks: {
                    autoSkip: true,
                    autoSkipPadding: 20,
                    stepSize: 1,
                  },
                  display: true,
                  title: {
                    display: true,
                    text: "Time spent (minutes)",
                  },
                  grid: { display: false },
                },
                avgScore: {
                  axis: "y",
                  beginAtZero: props.beginAtZero,
                  ticks: {
                    autoSkip: true,
                    autoSkipPadding: 20,
                    stepSize: 10,
                  },
                  display: true,
                  position: "right",
                  title: {
                    display: true,
                    text: "Average score",
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
                  intersect: false,
                  mode: "index",
                  filter: (tooltipItem): boolean => {
                    return tooltipItem.datasetIndex === 0;
                  },

                  callbacks: {
                    title: function (tooltipItem): string {
                      const firstItem = tooltipItem[0] as TooltipItem<
                        "bar" | "line"
                      >;

                      const item = dataQueryData()[firstItem.dataIndex];
                      if (item === undefined) return "unknown";

                      return dateFormat(
                        new Date(item.dayTimestamp as number),
                        "dd MMM yyyy",
                      );
                    },
                    beforeLabel: function (tooltipItem): string {
                      const item = dataQueryData()[tooltipItem.dataIndex];
                      if (item === undefined) return "unknown";

                      return `
Time Spent: ${secondsToString(Math.round(item.timeSpent), true, true)}
Tests Completed: ${item.completed}
Restarts per test: ${roundTo2(item.restarted / item.completed)}
Highest score: ${formatScore(item.maxScore)}
Average score: ${formatScore(item.avgScore)}
Average Accuracy: ${props.format.accuracy(item.avgAcc, { showDecimalPlaces: true })}
                      `;
                    },
                    label: function (): string {
                      return "";
                    },
                  },
                },
              },
            }}
          />
        </div>
      )}
    </AsyncContent>
  );
}
