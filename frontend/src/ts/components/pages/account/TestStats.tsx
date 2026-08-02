import { Accessor, JSXElement, Show } from "solid-js";

import {
  ResultsQueryState,
  ResultStats,
  useResultStatsLiveQuery,
} from "../../../collections/results";
import { getFormatting } from "../../../states/core";
import { secondsToString } from "../../../utils/date-and-time";
import AsyncContent from "../../common/AsyncContent";
import { Icon } from "../../common/Icon";

/**
 * AC-092 … AC-097 — the totals block.
 *
 * The headline reads `tasks answered` over the exact task count (monkeytype's
 * `estimated words typed` was a wpm-derived estimate) and the grid is the
 * fifteen cells of AC-093: the score / tpm / acc triples replace monkeytype's
 * wpm / raw / consistency ones, and a `total correct` / `total wrong` /
 * `total tasks` row is added.
 */
export function TestStats(props: {
  queryState: Accessor<ResultsQueryState | undefined>;
}): JSXElement {
  const format = getFormatting;
  const formatScore = (val: number): string => format().decimals(val);
  const formatTpm = (val: number): string =>
    format().decimals(val, { showDecimalPlaces: true });
  const formatPercentage = (val: number): string => format().percentage(val);

  const statsQuery = useResultStatsLiveQuery(() => props.queryState());
  const last10StatsQuery = useResultStatsLiveQuery(() => props.queryState(), {
    lastTen: true,
  });

  const stats = () => statsQuery()[0];
  const last10 = () => last10StatsQuery()[0];

  return (
    <AsyncContent collections={{ statsQuery, last10StatsQuery }}>
      {() => (
        <Show
          when={
            stats() !== undefined &&
            last10() !== undefined &&
            ([stats() as ResultStats, last10() as ResultStats] as const)
          }
        >
          {(data) => {
            const [stats, last10] = data();

            return (
              <>
                <div class="flex items-center justify-center text-sub">
                  tasks answered{" "}
                  <span class="p-5 text-5xl text-text lg:text-5xl">
                    {stats.tasks}
                  </span>
                </div>
                <div class="grid grid-cols-3 gap-4">
                  <Stat
                    header="tests started"
                    value={stats.restarted + stats.completed}
                  />
                  <div>
                    <div class="text-sub">
                      tests completed{" "}
                      <span
                        data-balloon-length="xlarge"
                        data-balloon-pos="up"
                        aria-label="Due to the increasing number of results in the database, you can now only see your last 1000 results in detail. Total time spent, started and completed tests stats will still be up to date at the top of the page, above the filters."
                        role="alertdialog"
                      >
                        <Icon icon="ph:question-bold" />
                      </span>
                    </div>
                    <div class="text-2xl leading-[1.1] md:text-3xl lg:text-5xl">
                      {stats.completed}(
                      {stats.completed + stats.restarted > 0
                        ? Math.floor(
                            (stats.completed /
                              (stats.completed + stats.restarted)) *
                              100,
                          )
                        : 0}
                      %)
                    </div>
                    <div class="text-xs">
                      {stats.completed > 0
                        ? (stats.restarted / stats.completed).toFixed(1)
                        : "0.0"}{" "}
                      restarts per completed test
                    </div>
                  </div>

                  <Stat
                    header="time spent"
                    value={stats.timeSpent}
                    formatter={(val) =>
                      secondsToString(Math.round(val), true, true)
                    }
                  />

                  <Stat
                    header="highest score"
                    value={stats.maxScore}
                    formatter={formatScore}
                  />
                  <Stat
                    header="average score"
                    value={stats.avgScore}
                    formatter={formatScore}
                  />
                  <Stat
                    header="average score (last 10 tests)"
                    value={last10.avgScore}
                    formatter={formatScore}
                  />

                  <Stat
                    header="highest tpm"
                    value={stats.maxTpm}
                    formatter={formatTpm}
                  />
                  <Stat
                    header="average tpm"
                    value={stats.avgTpm}
                    formatter={formatTpm}
                  />
                  <Stat
                    header="average tpm (last 10 tests)"
                    value={last10.avgTpm}
                    formatter={formatTpm}
                  />

                  <Stat
                    header="highest acc"
                    value={stats.maxAcc}
                    formatter={formatPercentage}
                  />
                  <Stat
                    header="average acc"
                    value={stats.avgAcc}
                    formatter={formatPercentage}
                  />
                  <Stat
                    header="average acc (last 10 tests)"
                    value={last10.avgAcc}
                    formatter={formatPercentage}
                  />

                  <Stat header="total correct" value={stats.correct} />
                  <Stat header="total wrong" value={stats.wrong} />
                  <Stat header="total tasks" value={stats.tasks} />
                </div>
              </>
            );
          }}
        </Show>
      )}
    </AsyncContent>
  );
}

function Stat(options: {
  header: string;
  value: number | undefined;
  formatter?: (value: number) => string;
}): JSXElement {
  return (
    <div>
      <div class="text-sub">{options.header}</div>

      <div class="text-2xl leading-[1.1] md:text-3xl lg:text-5xl">
        <Show when={options.value !== undefined}>
          {options.formatter !== undefined
            ? options.formatter(options.value ?? -1)
            : options.value}
        </Show>
      </div>
    </div>
  );
}
