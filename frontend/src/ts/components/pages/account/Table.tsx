import { Mode } from "@croco-calc/schemas/shared";
import { createColumnHelper } from "@tanstack/solid-table";
import { format as dateFormat } from "date-fns/format";
import {
  Accessor,
  createMemo,
  createSignal,
  For,
  JSXElement,
  Show,
} from "solid-js";

import { SnapshotResult } from "../../../constants/default-snapshot";
import { getFormatting } from "../../../states/core";
import { showModal } from "../../../states/modals";
import { cn } from "../../../utils/cn";
import { Formatting } from "../../../utils/format";
import { Button } from "../../common/Button";
import { Icon } from "../../common/Icon";
import { DataTable, DataTableColumnDef } from "../../ui/table/DataTable";
import { MiniResultChart } from "./MiniResultChart";
import { enabledSettings, SETTING_ICONS, settingBalloon } from "./utils";

type Sorting = {
  field: keyof SnapshotResult<Mode>;
  direction: "asc" | "desc";
};

/**
 * AC-101 — the results table has exactly eight columns:
 * `isPb`, `score`, `tpm`, `acc`, `tasks`, `mode2`, `info`, `timestamp`.
 * The upstream raw-speed, consistency, keystroke-stat, mode and tag columns are
 * gone (AC-007, AC-016, master C5, C15) and the headline speed metric becomes
 * `score` (master C40).
 */
export function Table<M extends Mode>(props: {
  data: SnapshotResult<M>[];
  onSortingChange: (sorting: Sorting) => void;
  selectedRowId: Accessor<string | null>;
}): JSXElement {
  const [selectedResult, setSelectedResult] = createSignal<string | undefined>(
    undefined,
  );

  const columns = createMemo(() =>
    getColumns<M>({
      format: getFormatting(),
      onMiniResultChartSelected: (id) => {
        setSelectedResult(id);
        if (id !== undefined) showModal("MiniResultChartModal");
      },
    }),
  );

  return (
    <>
      <Show when={selectedResult() !== undefined}>
        <MiniResultChart resultId={selectedResult() as string} />
      </Show>
      <DataTable
        id="resultList"
        onSortingChange={(val) => {
          if (val.length === 0) {
            props.onSortingChange({ field: "timestamp", direction: "desc" });
          } else {
            props.onSortingChange({
              field: val[0]?.id as keyof SnapshotResult<Mode>,
              direction: val[0]?.desc ? "desc" : "asc",
            });
          }
        }}
        class={cn("table-auto", "text-xs md:text-sm lg:text-base")}
        data={props.data}
        columns={columns()}
        fallback=<span>No data found. Check your filters.</span>
        rowSelection={{
          getRowId: (row) => row._id,
          activeRow: props.selectedRowId,
          class: cn(
            "text-main [&>td>div]:text-main [&>td>div>a]:text-main",
            "**:data-[ui-element='button']:[--themable-button-text:var(--text-main)]",
          ),
        }}
      />
    </>
  );
}

function getColumns<M extends Mode>({
  format,
  onMiniResultChartSelected,
}: {
  format: Formatting;
  onMiniResultChartSelected(val: string): void;
}): DataTableColumnDef<SnapshotResult<M>>[] {
  const defineColumn = createColumnHelper<SnapshotResult<M>>().accessor;
  const columns = [
    defineColumn("isPb", {
      header: "",
      cell: (info) =>
        info.getValue() ? (
          <Icon icon="ph:crown-bold" />
        ) : (
          <Icon icon="ph:crown-bold" class="opacity-0" />
        ),
      enableSorting: false,
      meta: {
        cellMeta: {
          class: cn("w-0", "xl:pr-6 xl:pl-8", "pl-4"),
        },
      },
    }),
    /**
     * AC-101 row 2 — the headline metric, a signed integer (master C40).
     * `format.score` rather than `format.decimals` because a whole number must
     * stay whole even when `alwaysShowDecimalPlaces` is on, and because the
     * same value has to read identically here and on the leaderboard.
     */
    defineColumn("score", {
      header: "score",
      cell: (info) => format.score(info.getValue()),
    }),
    defineColumn("tpm", {
      header: "tpm",
      cell: (info) =>
        format.decimals(info.getValue(), { showDecimalPlaces: true }),
      meta: {
        breakpoint: "xs",
      },
    }),
    defineColumn("acc", {
      header: "accuracy",
      cell: (info) =>
        format.percentage(info.getValue(), { showDecimalPlaces: true }),
      meta: {
        breakpoint: "xs",
      },
    }),
    /** AC-101 row 5 — `{correct}/{wrong}`, replacing the keystroke-stat cell. */
    defineColumn("tasks", {
      header: "correct/wrong",
      enableSorting: false,
      cell: (info) => `${info.row.original.correct}/${info.row.original.wrong}`,
      meta: {
        breakpoint: "lg",
      },
    }),
    /**
     * AC-101 row 6 — croco calc has exactly one mode, so the column prints the
     * test length instead of the upstream `{mode} {mode2}` pair (AC-008).
     */
    defineColumn("mode2", {
      header: "time",
      enableSorting: false,
      cell: (info) => `${info.getValue()} min`,
      meta: {
        breakpoint: "md",
      },
    }),
    /** AC-101 row 7 — the column id is `info`; `_id` is only the accessor. */
    defineColumn("_id", {
      id: "info",
      header: "info",
      enableSorting: false,
      cell: (info) => {
        const hasChart = info.row.original.chartData !== "toolong";

        return (
          <div class="flex gap-0.5">
            {/*
              AC-102: one fixed-width icon per **enabled** setting, with the
              balloon built by mapping the stored value through the shared
              label table — never by string-matching a display literal.
            */}
            <For each={enabledSettings(info.row.original.settings)}>
              {({ key, value }) => (
                <span
                  aria-label={settingBalloon(key, value)}
                  data-balloon-pos="up"
                >
                  <Icon icon={SETTING_ICONS[key]} fixedWidth={true} />
                </span>
              )}
            </For>
            <span
              data-balloon-pos="up"
              aria-label={
                hasChart
                  ? "View graph"
                  : "Graph history is not available for long tests"
              }
            >
              <Button
                disabled={!hasChart}
                class="p-0 text-inherit"
                variant="text"
                icon={{ icon: "ph:chart-line-bold", fixedWidth: true }}
                onClick={() => {
                  onMiniResultChartSelected(info.getValue());
                }}
              />
            </span>
          </div>
        );
      },
      meta: {
        breakpoint: "sm",
      },
    }),
    defineColumn("timestamp", {
      header: "date",
      cell: (info) => (
        <>
          <div class="text-em-sm">
            {dateFormat(info.getValue(), "dd MMM yyyy")}
          </div>
          <div class="text-em-sm text-sub">
            {dateFormat(info.getValue(), "HH:mm")}
          </div>
        </>
      ),
    }),
  ];
  return columns;
}
