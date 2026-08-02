import { AccountChart } from "@croco-calc/schemas/configs";
import { Mode } from "@croco-calc/schemas/shared";
import { format as dateFormat } from "date-fns/format";
import { createMemo, JSXElement, Show } from "solid-js";

import { setConfig } from "../../../config/setters";
import { getConfig } from "../../../config/store";
import { SnapshotResult } from "../../../constants/default-snapshot";
import { getFormatting } from "../../../states/core";
import { getTheme } from "../../../states/theme";
import { blendTwoHexColors } from "../../../utils/colors";
import { Formatting } from "../../../utils/format";
import { findLineByLeastSquares } from "../../../utils/numbers";
import { Button } from "../../common/Button";
import { ChartJs } from "../../common/ChartJs";
import { enabledSettings, settingBalloon } from "./utils";

export type HistoryChartClickEvent = {
  index: number;
  _id: string;
};

/**
 * AC-085: five toggles, persisted in `config.accountChart`. Index 4 is the
 * croco-calc-only `Per minute` switch (AC-086) — `score` scales with test
 * length, so a chart mixing 1- and 8-minute runs is unreadable without it.
 */
const TOGGLE = {
  score: 0,
  accuracy: 1,
  avg10: 2,
  avg100: 3,
  perMinute: 4,
} as const;

export function HistoryChart(props: {
  results: SnapshotResult<Mode>[];
  beginAtZero: boolean;
  format: Formatting;
  onClick?: (event: HistoryChartClickEvent) => void;
}): JSXElement {
  const formatAccuracy = (accuracy: number): string =>
    props.format.accuracy(accuracy, { showDecimalPlaces: true });
  const formatNumber = (value: number): string =>
    props.format.decimals(value, { showDecimalPlaces: true });
  /** AC-003 — a stored `score` is a whole number, unlike `tpm`. */
  const formatScore = (value: number): string => props.format.score(value);

  const isPerMinute = (): boolean =>
    getConfig.accountChart[TOGGLE.perMinute] === "on";

  //AC-086: the score series switches between the absolute and per-minute value.
  const score = createMemo(() =>
    props.results.map((it) => (isPerMinute() ? it.spm : it.score)),
  );
  const acc = createMemo(() => props.results.map((it) => it.acc));

  const toggleAccountChart = (pos: number): (() => void) => {
    return () => {
      const newValue = [...getConfig.accountChart] as AccountChart;
      newValue[pos] = newValue[pos] === "on" ? "off" : "on";
      setConfig("accountChart", newValue);
    };
  };

  const colorIndex = (...val: boolean[]): number =>
    val.filter((it) => it).length;

  const datasetOptions = createMemo(() => {
    const scoreColors = [
      getTheme().main,
      blendTwoHexColors(getTheme().bg, getTheme().main, 0.4),
      blendTwoHexColors(getTheme().bg, getTheme().main, 0.2),
    ];
    const accColors = [
      getTheme().sub,
      blendTwoHexColors(getTheme().bg, getTheme().sub, 0.4),
      blendTwoHexColors(getTheme().bg, getTheme().sub, 0.2),
    ];

    const isScore = getConfig.accountChart[TOGGLE.score] === "on";
    const isAcc = getConfig.accountChart[TOGGLE.accuracy] === "on";
    const isAvg10 = getConfig.accountChart[TOGGLE.avg10] === "on";
    const isAvg100 = getConfig.accountChart[TOGGLE.avg100] === "on";

    return {
      score: {
        yAxisID: "score",
        fill: false,
        borderWidth: 0,
        hidden: !isScore,
        pointBackgroundColor: scoreColors[colorIndex(isAvg10, isAvg100)],
        order: 3,
      },
      scoreAvg10: {
        yAxisID: "score",
        fill: false,
        pointRadius: 0,
        pointHoverRadius: 0,
        hidden: !isScore || !isAvg10,
        borderColor: scoreColors[colorIndex(isAvg10, isAvg100) - 1],
        order: 2,
      },
      scoreAvg100: {
        yAxisID: "score",
        fill: false,
        pointRadius: 0,
        pointHoverRadius: 0,
        hidden: !isScore || !isAvg100,
        borderColor: scoreColors[0],
        order: 1,
      },
      acc: {
        yAxisID: "acc",
        fill: false,
        pointStyle: "triangle",
        borderWidth: 0,
        pointRadius: 3.5,
        hidden: !isAcc,
        pointBackgroundColor: accColors[colorIndex(isAvg10, isAvg100)],
        order: 3,
      },
      accAvg10: {
        yAxisID: "acc",
        fill: false,
        pointRadius: 0,
        pointHoverRadius: 0,
        hidden: !isAcc || !isAvg10,
        borderColor: accColors[colorIndex(isAvg10, isAvg100) - 1],
        order: 2,
      },
      accAvg100: {
        yAxisID: "acc",
        fill: false,
        pointRadius: 0,
        pointHoverRadius: 0,
        hidden: !isAcc || !isAvg100,
        borderColor: accColors[0],
        order: 1,
      },
      pb: {
        yAxisID: "score",
        fill: false,
        stepped: true,
        pointRadius: 0,
        pointHoverRadius: 0,
        order: 4,
        hidden: !isScore,
        borderColor: blendTwoHexColors(getTheme().bg, getTheme().text, 0.2),
      },
    };
  });

  return (
    <>
      <div style={{ height: "400px" }}>
        <ChartJs
          name="History"
          type="line"
          data={{
            labels: props.results.map((_, i) => i),
            datasets: [
              {
                data: score(),
                ...datasetOptions().score,
              },
              {
                data: pb(score()),
                ...datasetOptions().pb,
              },
              {
                data: acc(),
                ...datasetOptions().acc,
              },
              {
                data: movingAverage(score(), 10),
                ...datasetOptions().scoreAvg10,
              },
              {
                data: movingAverage(acc(), 10),
                ...datasetOptions().accAvg10,
              },
              {
                data: movingAverage(score(), 100),
                ...datasetOptions().scoreAvg100,
              },
              {
                data: movingAverage(acc(), 100),
                ...datasetOptions().accAvg100,
              },
            ],
          }}
          options={{
            maintainAspectRatio: false,
            hover: {
              mode: "nearest",
              intersect: false,
            },
            //AC-088: raise the clicked result so the table can scroll to it.
            onClick: (_, elements) => {
              const nearest = elements.find((it) => it.datasetIndex === 0);
              if (nearest === undefined) return;
              props.onClick?.({
                index: nearest.index,
                _id: props.results[nearest.index]?._id as string,
              });
            },
            scales: {
              x: {
                axis: "x",
                type: "linear",
                reverse: true,
                min: -1,
                max: score().length,
                display: false,
                grid: {
                  display: false,
                },
              },
              score: {
                axis: "y",
                type: "linear",
                beginAtZero: props.beginAtZero,
                display: true,
                title: {
                  display: true,
                  //AC-086
                  text: isPerMinute() ? "Score / min" : "Score",
                },
                position: "left",
              },
              acc: {
                axis: "y",
                beginAtZero: props.beginAtZero,
                min:
                  getConfig.accountChart[TOGGLE.score] === "on" ||
                  acc().length === 0
                    ? 0
                    : Math.floor(Math.min(...acc()) / 5) * 5,
                max: 100,
                reverse: true,
                ticks: {
                  stepSize: 10,
                },
                display: true,
                title: {
                  display: true,
                  text: "Accuracy",
                },
                grid: {
                  display: false,
                },
                position: "right",
              },
            },

            plugins: {
              annotation: {
                annotations: [],
              },
              tooltip: {
                animation: { duration: 250 },
                // Disable the on-canvas tooltip
                enabled: true,

                intersect: false,
                external: function (ctx): void {
                  if (ctx === undefined) return;
                  ctx.tooltip.options.displayColors = false;
                },
                filter: function (tooltipItem): boolean {
                  return (
                    tooltipItem.datasetIndex !== 1 &&
                    tooltipItem.datasetIndex !== 3 &&
                    tooltipItem.datasetIndex !== 4 &&
                    tooltipItem.datasetIndex !== 5 &&
                    tooltipItem.datasetIndex !== 6
                  );
                },
                callbacks: {
                  title: function (): string {
                    return "";
                  },

                  //AC-087
                  beforeLabel: function (tooltipItem): string {
                    const result = props.results[tooltipItem.dataIndex];
                    if (result === undefined) return "unknown";

                    if (tooltipItem.datasetIndex !== 0) {
                      return `error rate: ${formatAccuracy(100 - result.acc)}\nacc: ${formatAccuracy(result.acc)}`;
                    }

                    const settings = enabledSettings(result.settings)
                      .map(({ key, value }) => settingBalloon(key, value))
                      .join("\n");

                    //AC-087: the duration is present whether or not `Per minute` is on.
                    return [
                      `score: ${formatScore(result.score)}`,
                      `tpm: ${formatNumber(result.tpm)}`,
                      `acc: ${formatAccuracy(result.acc)}`,
                      `correct/wrong: ${result.correct}/${result.wrong}`,
                      "",
                      `time: ${result.mode2} min`,
                      settings,
                      `${result.isPb ? "\nnew personal best\n" : ""}`,
                      `date: ${dateFormat(
                        new Date(result.timestamp),
                        "dd MMM yyyy HH:mm",
                      )}`,
                    ].join("\n");
                  },

                  label: function (): string {
                    return "";
                  },
                  afterLabel: function (): string {
                    return "";
                  },
                },
              },
            },
          }}
        />
      </div>
      {/* AC-085 / AC-089 */}
      <div class="grid grid-cols-1 items-center lg:grid-cols-[1fr_30rem]">
        <Trend results={props.results} />
        <div class="grid grid-cols-5 gap-2 text-em-xs max-[475px]:grid-cols-2">
          <Button
            icon={{ icon: "ph:gauge-bold", fixedWidth: true }}
            text="Score"
            onClick={toggleAccountChart(TOGGLE.score)}
            active={getConfig.accountChart[TOGGLE.score] === "on"}
          />
          <Button
            icon={{ icon: "ph:target-bold", fixedWidth: true }}
            text="Accuracy"
            onClick={toggleAccountChart(TOGGLE.accuracy)}
            active={getConfig.accountChart[TOGGLE.accuracy] === "on"}
          />
          <Button
            icon={{ icon: "ph:chart-line-bold", fixedWidth: true }}
            text="Avg of 10"
            onClick={toggleAccountChart(TOGGLE.avg10)}
            active={getConfig.accountChart[TOGGLE.avg10] === "on"}
          />
          <Button
            icon={{ icon: "ph:chart-line-bold", fixedWidth: true }}
            text="Avg of 100"
            onClick={toggleAccountChart(TOGGLE.avg100)}
            active={getConfig.accountChart[TOGGLE.avg100] === "on"}
          />
          <Button
            icon={{ icon: "ph:clock-bold", fixedWidth: true }}
            text="Per minute"
            onClick={toggleAccountChart(TOGGLE.perMinute)}
            active={getConfig.accountChart[TOGGLE.perMinute] === "on"}
          />
        </div>
      </div>
    </>
  );
}

/** AC-089: least-squares trend, hidden when it cannot be computed. */
function Trend(props: { results: SnapshotResult<Mode>[] }): JSXElement {
  const format = getFormatting;

  const trend = createMemo(() => {
    const line = findLineByLeastSquares(
      props.results.map((it) => it.score).reverse(),
    );
    if (line === null) return undefined;

    const totalSecondsFiltered = props.results
      .map((it) => it.timeSpent)
      .reduce((acc, it) => acc + it, 0);

    if (totalSecondsFiltered === 0) return undefined;

    const scoreChange = line[1][1] - line[0][1];
    const scoreChangePerHour = scoreChange * (3600 / totalSecondsFiltered);
    if (!Number.isFinite(scoreChangePerHour)) return undefined;
    const plus = scoreChangePerHour > 0 ? "+" : "";

    return `Score change per hour spent: ${plus}${format().decimals(scoreChangePerHour, { showDecimalPlaces: true })}`;
  });

  return (
    <Show when={trend() !== undefined}>
      <div class="w-full p-4 text-center text-sub">{trend()}</div>
    </Show>
  );
}

function movingAverage(data: number[], windowSize: number): number[] {
  return data.map((_, i, array) => {
    const subset = array.slice(i, i + windowSize);

    if (subset.length === 0) return 0;

    const sum = subset.reduce((acc, value) => acc + value, 0);

    return sum / subset.length;
  });
}

function pb(data: number[]): number[] {
  const result = new Array<number>(data.length);
  let currentMax: number = -Infinity;

  for (let i = data.length - 1; i >= 0; i--) {
    const value = Number(data[i]);

    if (Number.isFinite(value)) {
      currentMax = Math.max(currentMax, value);
    }

    result[i] = currentMax;
  }

  return result;
}
