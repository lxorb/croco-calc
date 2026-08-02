import { ChartData } from "@croco-calc/schemas/results";
import { useQuery } from "@tanstack/solid-query";
import { createMemo, JSXElement } from "solid-js";

import { getSingleResultQueryOptions } from "../../../collections/results";
import { getConfig } from "../../../config/store";
import { isModalOpen } from "../../../states/modals";
import { getTheme } from "../../../states/theme";
import { AnimatedModal } from "../../common/AnimatedModal";
import AsyncContent from "../../common/AsyncContent";
import { ChartJs } from "../../common/ChartJs";

/**
 * AC-102: the per-result graph behind the table's chart-line button.
 *
 * `ChartDataSchema` is now `{ score, tpm, wrong }` (CP-114 … CP-116), so the
 * upstream speed / burst / error series become the cumulative score line, the
 * running-average tpm line and the per-second wrong-answer scatter. The
 * speed-unit conversion is gone with the unit system (AC-007).
 */
export function MiniResultChart(props: { resultId: string }): JSXElement {
  const query = useQuery(() => ({
    ...getSingleResultQueryOptions(props.resultId),
    enabled: isModalOpen("MiniResultChartModal"),
  }));

  const beginAtZero = createMemo(() => getConfig.startGraphsAtZero);

  return (
    <AnimatedModal id="MiniResultChartModal" modalClass="max-w-300">
      <AsyncContent queries={{ query }}>
        {({ queryData }) => {
          const data = queryData().chartData as ChartData;

          return (
            <div class="h-60 w-full">
              <ChartJs
                name="MiniResult"
                type="line"
                data={{
                  labels: data.score.map((_, index) => (index + 1).toString()),
                  datasets: [
                    {
                      label: "score",
                      data: data.score,
                      borderWidth: 3,
                      yAxisID: "score",
                      order: 2,
                      pointRadius: 1,
                      fill: false,
                      borderColor: getTheme().main,
                      backgroundColor: getTheme().main,
                    },
                    {
                      label: "tpm",
                      data: data.tpm,
                      borderWidth: 3,
                      yAxisID: "score",
                      order: 3,
                      pointRadius: 1,
                      fill: false,
                      borderColor: getTheme().sub,
                      backgroundColor: getTheme().sub,
                    },
                    {
                      label: "wrong",
                      data: data.wrong,
                      pointBorderColor: getTheme().error,
                      backgroundColor: getTheme().error,
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
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  scales: {
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
                        text: "score / tpm",
                      },
                      beginAtZero: beginAtZero(),
                      ticks: {
                        autoSkip: true,
                        autoSkipPadding: 20,
                      },
                      grid: {
                        display: true,
                      },
                    },

                    wrong: {
                      display: true,
                      position: "right",
                      title: {
                        display: true,
                        text: "Wrong",
                      },
                      beginAtZero: beginAtZero(),
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
                    },
                  },
                }}
              />
            </div>
          );
        }}
      </AsyncContent>
    </AnimatedModal>
  );
}
