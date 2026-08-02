import { Mode, Mode2, PersonalBest } from "@croco-calc/schemas/shared";
import { createColumnHelper } from "@tanstack/solid-table";
import { format as formatDate } from "date-fns/format";
import { createMemo, createSignal, JSXElement } from "solid-js";

import { getConfig } from "../../config/store";
import * as DB from "../../db";
import { pbTablesMode } from "../../states/pb-tables-modal";
import { cn } from "../../utils/cn";
import { Formatting } from "../../utils/format";
import { AnimatedModal } from "../common/AnimatedModal";
import { enabledSettings, settingLabel } from "../pages/account/utils";
import { DataTable, DataTableColumnDef } from "../ui/table/DataTable";

type PBWithMode2 = PersonalBest & {
  mode2: Mode2<Mode>;
};

type PBRow = PBWithMode2 & {
  isGroupStart: boolean;
};

/**
 * AC-063 — every stored personal best, keyed by `(mode2, settingsId)`
 * (master C4, C31). Rows are grouped by duration and ordered by `score` inside
 * each group; the upstream `raw` / `consistency` / `difficulty` / `language` /
 * `punctuation` / `numbers` / `lazyMode` columns are gone with the fields
 * (AC-007, AC-064) and are replaced by `tpm` and the settings column, which is
 * the axis the two PB cards split on.
 */
function buildRows(mode: Mode): PBRow[] {
  const allmode2 = DB.getSnapshot()?.personalBests?.[mode] as
    | Record<Mode2<Mode>, PBWithMode2[]>
    | undefined;
  if (allmode2 === undefined) return [];

  const list: PBWithMode2[] = [];
  (Object.keys(allmode2) as Mode2<Mode>[]).forEach((key) => {
    const pbs = [...(allmode2[key] ?? [])].sort((a, b) => b.score - a.score);
    pbs.forEach((pb) => {
      list.push({ ...pb, mode2: key });
    });
  });

  const rows: PBRow[] = [];
  let currentMode2: Mode2<Mode> | undefined;

  list.forEach((pb) => {
    const isGroupStart = currentMode2 !== pb.mode2;
    currentMode2 = pb.mode2;
    rows.push({ ...pb, isGroupStart });
  });

  return rows;
}

/**
 * AC-102's rule, reused: the label comes from mapping the stored value through
 * the shared table, never from string-matching a display literal.
 */
function describeSettings(pb: PersonalBest): string {
  const enabled = enabledSettings(pb.settings);
  if (enabled.length === 0) return "-";
  return enabled
    .map(({ key, value }) => `${key} ${settingLabel(key, value)}`)
    .join(", ");
}

function getColumns(options: {
  format: Formatting;
  mode: Mode;
}): DataTableColumnDef<PBRow>[] {
  const defineColumn = createColumnHelper<PBRow>().accessor;
  const { format: f, mode: m } = options;

  const columns = [
    defineColumn("mode2", {
      header: m,
      cell: (info) => info.getValue(),
      meta: {
        align: "right",
        cellMeta: (info) => ({
          class: cn(
            "text-xl font-light text-text/40",
            info.row.isGroupStart && "font-normal text-text",
          ),
        }),
      },
    }),
    defineColumn("score", {
      header: () => (
        <>
          score
          <br />
          <span class="text-sub">accuracy</span>
        </>
      ),
      cell: (info) => (
        <>
          {/* AC-063 — `score` stays a whole number regardless of
              `alwaysShowDecimalPlaces`. */}
          {f.score(info.getValue())}
          <br />
          <span class="text-sub">{f.accuracy(info.row.original.acc)}</span>
        </>
      ),
      meta: { align: "right" },
    }),
    defineColumn("tpm", {
      header: () => (
        <>
          tpm
          <br />
          <span class="text-sub">correct/wrong</span>
        </>
      ),
      cell: (info) => (
        <>
          {f.decimals(info.getValue(), { showDecimalPlaces: true })}
          <br />
          <span class="text-sub">
            {info.row.original.correct}/{info.row.original.wrong}
          </span>
        </>
      ),
      meta: { align: "right" },
    }),
    defineColumn("settingsId", {
      header: "settings",
      cell: (info) => (
        <span aria-label={info.getValue()} data-balloon-pos="up">
          {describeSettings(info.row.original)}
        </span>
      ),
      meta: { align: "right" },
    }),
    defineColumn("timestamp", {
      header: "date",
      cell: (info) =>
        info.getValue() ? (
          <>
            {formatDate(info.getValue(), "dd MMM yyyy")}
            <br />
            <div class="text-sub">{formatDate(info.getValue(), "HH:mm")}</div>
          </>
        ) : (
          <>
            -<br />
            <span class="text-sub">-</span>
          </>
        ),
      meta: { align: "right" },
    }),
  ];

  return columns.map((it) => ({ ...it, enableSorting: false }));
}

export function PbTablesModal(): JSXElement {
  const [rows, setRows] = createSignal<PBRow[]>([]);
  const columns = createMemo(() =>
    getColumns({ format: new Formatting(getConfig), mode: pbTablesMode() }),
  );

  return (
    <AnimatedModal
      id="PbTables"
      modalClass="max-w-full gap-0 p-8"
      beforeShow={() => {
        setRows(buildRows(pbTablesMode()));
      }}
    >
      <DataTable
        id="pbTables"
        columns={columns()}
        data={rows()}
        class="[&>thead]:sticky [&>thead]:-top-8 [&>thead]:z-3 [&>thead]:bg-bg [&>thead]:text-xs"
      />
    </AnimatedModal>
  );
}
