import { ResultFilters, ResultFiltersKeys } from "@croco-calc/schemas/users";
import { useLiveQuery } from "@tanstack/solid-db";
import { Accessor, createMemo, For, JSXElement } from "solid-js";

import {
  buildResultsQuery,
  ResultsQueryState,
} from "../../../collections/results";
import { getConfig } from "../../../config/store";
import { getFormatting, isAuthenticated } from "../../../states/core";
import {
  capitalizeFirstLetter,
  replaceUnderscoresWithSpaces,
} from "../../../utils/strings";
import AsyncContent from "../../common/AsyncContent";
import { Icon } from "../../common/Icon";
import { DailyActivityChart } from "./DailyActivityChart";
import { HistogramChart } from "./HistogramChart";
import { HistoryChart, HistoryChartClickEvent } from "./HistoryChart";
import {
  SETTING_HEADINGS,
  SETTING_ICONS,
  SETTING_KEYS,
  settingLabel,
} from "./utils";

/** AC-083: icon filter row, history chart, histogram, time-spent chart. */
export function Charts(props: {
  filters: ResultFilters;
  queryState: Accessor<ResultsQueryState | undefined>;
  onHistoryChartClick?: (event: HistoryChartClickEvent) => void;
}): JSXElement {
  const beginAtZero = createMemo(() => getConfig.startGraphsAtZero);
  const format = getFormatting;

  const resultsQuery = useLiveQuery((q) => {
    if (!isAuthenticated()) return undefined;
    const state = props.queryState();
    if (state === undefined) return undefined;
    return q
      .from({ r: buildResultsQuery(state) })
      .orderBy(({ r }) => r.timestamp, "desc");
  });

  return (
    <AsyncContent collections={{ resultsQuery }}>
      {({ resultsQueryData }) => (
        <div class="flex flex-col gap-8">
          <div>
            <FilterSummary filters={props.filters} />
            <HistoryChart
              results={resultsQueryData()}
              beginAtZero={beginAtZero()}
              format={format()}
              onClick={(index) => props.onHistoryChartClick?.(index)}
            />
          </div>

          <HistogramChart results={resultsQueryData()} />

          <DailyActivityChart
            queryState={props.queryState}
            beginAtZero={beginAtZero()}
            format={format()}
          />
        </div>
      )}
    </AsyncContent>
  );
}

/**
 * AC-082 — the icon filter row. One icon+value pair per filter group; a fully
 * selected group prints the literal `all`, anything else prints the selected
 * values comma-joined. The groups are date, time and the seven settings.
 */
function FilterSummary(props: { filters: ResultFilters }): JSXElement {
  const Item = <
    T extends ResultFiltersKeys,
    K extends keyof ResultFilters[T],
  >(options: {
    group: T;
    label?: string;
    icon: string;
    format?: (val: K) => string;
  }): JSXElement => {
    const values = createMemo(() =>
      isAllSet(props.filters[options.group])
        ? "all"
        : Object.entries(props.filters[options.group])
            .filter(([_, v]) => v)
            .map(([it]) => options.format?.(it as K) ?? it)
            .join(", "),
    );

    return (
      <span
        aria-label={options.label ?? capitalizeFirstLetter(options.group)}
        data-balloon-pos="up"
      >
        <Icon icon={options.icon} fixedWidth />
        {values()}
      </span>
    );
  };

  return (
    <div class="mt-4 mb-4 flex flex-wrap justify-center gap-4 text-sub [&>span>svg]:mr-1">
      <Item
        group="date"
        icon="ph:calendar-blank-bold"
        format={replaceUnderscoresWithSpaces}
      />
      <Item group="time" icon="ph:clock-bold" />
      <For each={SETTING_KEYS}>
        {(key) => (
          <Item
            group={key}
            label={capitalizeFirstLetter(SETTING_HEADINGS[key])}
            icon={SETTING_ICONS[key]}
            format={(val) => settingLabel(key, val)}
          />
        )}
      </For>
    </div>
  );
}

function isAllSet(
  filter: Record<string | number | symbol, boolean | undefined>,
): boolean {
  return Object.values(filter).every((value) => value);
}
