import { ResultMinified } from "@croco-calc/schemas/results";
import {
  buildSettingsId,
  MathGeneratorSettings,
} from "@croco-calc/schemas/math";
import { Mode, Mode2 } from "@croco-calc/schemas/shared";
import { ResultFilters } from "@croco-calc/schemas/users";
import { queryCollectionOptions } from "@tanstack/query-db-collection";
import {
  avg,
  BTreeIndex,
  count,
  createCollection,
  createOptimisticAction,
  eq,
  gte,
  inArray,
  max,
  Query,
  queryOnce,
  sum,
  useLiveQuery,
} from "@tanstack/solid-db";
import { queryOptions } from "@tanstack/solid-query";
import { Accessor, createMemo } from "solid-js";
import Ape from "../ape";
import { SnapshotResult } from "../constants/default-snapshot";
import { createEffectOn } from "../hooks/effects";
import { queryClient } from "../queries";
import { baseKey } from "../queries/utils/keys";
import { isAuthenticated } from "../states/core";
import { getLastResult, setLastResult } from "../states/snapshot";
import { applyIdWorkaround } from "./utils/misc";
import { getConfig } from "../config/store";

/**
 * The filter selection, flattened into the value lists the query engine
 * compares against. One entry per AC-078 group plus the `date` cut-off.
 */
export type ResultsQueryState = {
  pb: boolean[];
  time: Mode2<"time">[];
  addition: MathGeneratorSettings["addition"][];
  multiplication: MathGeneratorSettings["multiplication"][];
  division: MathGeneratorSettings["division"][];
  fractionAddition: MathGeneratorSettings["fractionAddition"][];
  fractionMultiplication: boolean[];
  decimals: boolean[];
  negatives: boolean[];
  timestamp: number;
};

const queryKeys = {
  root: () => [...baseKey("results", { isUserSpecific: true })],
  fullResult: (_id: string) => [...queryKeys.root(), _id],
};

/** AC-093: the numbers behind the fifteen totals cells. */
export type ResultStats = {
  tasks: number;
  correct: number;
  wrong: number;
  restarted: number;
  completed: number;
  maxScore: number;
  avgScore: number;
  maxTpm: number;
  avgTpm: number;
  maxAcc: number;
  avgAcc: number;
  timeSpent: number;
  dayTimestamp?: number;
};

/**
 * get aggregated statistics for the current result selection
 * @param queryState
 * @param options
 * @returns
 */
// oxlint-disable-next-line typescript/explicit-function-return-type
export function useResultStatsLiveQuery(
  queryState: Accessor<ResultsQueryState | undefined>,
  options?: { lastTen?: true } | { groupByDay?: true },
) {
  return useLiveQuery((q) => {
    if (!isAuthenticated()) return undefined;
    const state = queryState();
    if (state === undefined) return undefined;

    const isLastTen =
      options !== undefined && "lastTen" in options && options.lastTen;
    const isGroupByDay =
      options !== undefined && "groupByDay" in options && options.groupByDay;

    let query = isLastTen
      ? //for lastTen we need a sub-query to apply the sort+limit first and then run the aggregations
        q.from({
          r: q
            .from({ r: buildResultsQuery(state) })
            .orderBy(({ r }) => r.timestamp, "desc")
            .limit(10),
        })
      : q.from({ r: buildResultsQuery(state) });

    if (isGroupByDay) {
      query = query.groupBy(({ r }) => r.dayTimestamp);
    }

    return query.select(({ r }) => ({
      dayTimestamp: isGroupByDay ? r.dayTimestamp : undefined,
      tasks: sum(r.tasks),
      correct: sum(r.correct),
      wrong: sum(r.wrong),
      completed: count(r._id),
      restarted: sum(r.restartCount),
      timeSpent: sum(r.timeSpent),
      maxScore: max(r.score),
      avgScore: avg(r.score),
      maxTpm: max(r.tpm),
      avgTpm: avg(r.tpm),
      maxAcc: max(r.acc),
      avgAcc: avg(r.acc),
    }));
  });
}

// oxlint-disable-next-line typescript/explicit-function-return-type
export async function getResultsQueryOnce(options: {
  queryState: Accessor<ResultsQueryState | undefined>;
  sorting: Accessor<{
    field: keyof SnapshotResult<Mode>;
    direction: "asc" | "desc";
  }>;
}) {
  const state = options.queryState();
  if (!state) return undefined;

  const sorting = options.sorting();

  return queryOnce((q) =>
    q
      .from({ r: buildResultsQuery(state) })
      .orderBy(({ r }) => r[sorting.field], sorting.direction),
  );
}

/**
 * get list of SnapshotResults for the current result selection
 * @param queryState
 * @returns
 */
// oxlint-disable-next-line typescript/explicit-function-return-type
export function useResultsLiveQuery(options: {
  queryState: Accessor<ResultsQueryState | undefined>;
  sorting: Accessor<{
    field: keyof SnapshotResult<Mode>;
    direction: "asc" | "desc";
  }>;
  limit: Accessor<number>;
}) {
  return useLiveQuery((q) => {
    if (!isAuthenticated()) return undefined;
    const state = options.queryState();
    const sorting = options.sorting();
    const limit = options.limit();
    if (state === undefined) return undefined;

    return q
      .from({ r: buildResultsQuery(state) })
      .orderBy(({ r }) => r[sorting.field], sorting.direction)
      .limit(limit);
  });
}

function normalizeResult(
  result: ResultMinified | SnapshotResult<Mode>,
): SnapshotResult<Mode> {
  const resultDate = new Date(result.timestamp);
  resultDate.setSeconds(0);
  resultDate.setMinutes(0);
  resultDate.setHours(0);
  resultDate.setMilliseconds(0);

  //results strip default values, add them back
  result.restartCount ??= 0;
  result.incompleteTestSeconds ??= 0;
  result.afkDuration ??= 0;
  result.isPb ??= false;

  return {
    ...result,
    timeSpent: calcTimeSpent(result),
    tasks: result.correct + result.wrong,
    dayTimestamp: resultDate.getTime(),
  } as SnapshotResult<Mode>;
}

const resultsCollection = createCollection(
  queryCollectionOptions({
    staleTime: Infinity,
    gcTime: Infinity, //remove when __nonReactive is removed
    queryKey: queryKeys.root(),
    enabled: isAuthenticated,
    queryFn: async () => {
      const response = await Ape.results.get({});

      if (response.status !== 200) {
        throw new Error(`Error fetching results:${response.body.message}`);
      }

      const results = response.body.data
        .map((result) => normalizeResult(result))
        .map(applyIdWorkaround);

      if (getLastResult() === undefined && results.length > 0) {
        const lastResult = results.reduce((acc, cur) =>
          acc === undefined || acc.timestamp < cur.timestamp ? cur : acc,
        );
        setLastResult(lastResult);
      }
      return results;
    },
    queryClient,
    getKey: (it) => it._id,
  }),
);

resultsCollection.createIndex((row) => row.timestamp, {
  indexType: BTreeIndex,
});

type ActionType = {
  insertLocalResult: {
    result: SnapshotResult<Mode>;
  };
};

const actions = {
  insertLocalResult: createOptimisticAction<ActionType["insertLocalResult"]>({
    onMutate: ({ result }) => {
      resultsCollection.utils.writeInsert(normalizeResult(result));
    },
    mutationFn: async () => {
      //we don't sync the changes back to the backend here, it is done already
      return;
    },
  }),
};

// --- Public API ---
export async function insertLocalResult(
  params: ActionType["insertLocalResult"],
): Promise<void> {
  if (!resultsCollection.isReady()) {
    //not loaded yet, don't need to insert
    return;
  }
  const transaction = actions.insertLocalResult(params);
  await transaction.isPersisted.promise;
}

/**
 * AC-078: nine multi-select groups plus the date cut-off. A group whose value
 * list is empty selects nothing, which is what `clear filters` (AC-077) does.
 */
// oxlint-disable-next-line typescript/explicit-function-return-type
export function buildResultsQuery(state: ResultsQueryState) {
  return new Query()
    .from({ r: resultsCollection })
    .where(({ r }) => gte(r.timestamp, state.timestamp))
    .where(({ r }) => inArray(r.isPb, state.pb))
    .where(({ r }) => inArray(r.mode2, state.time))
    .where(({ r }) => inArray(r.settings.addition, state.addition))
    .where(({ r }) => inArray(r.settings.multiplication, state.multiplication))
    .where(({ r }) => inArray(r.settings.division, state.division))
    .where(({ r }) =>
      inArray(r.settings.fractionAddition, state.fractionAddition),
    )
    .where(({ r }) =>
      inArray(r.settings.fractionMultiplication, state.fractionMultiplication),
    )
    .where(({ r }) => inArray(r.settings.decimals, state.decimals))
    .where(({ r }) => inArray(r.settings.negatives, state.negatives));
}

export function createResultsQueryState(
  filters: ResultFilters,
): ResultsQueryState {
  return {
    pb: boolFilter(filters.pb),
    time: valueFilter(filters.time),
    addition: valueFilter(filters.addition),
    multiplication: valueFilter(filters.multiplication),
    division: valueFilter(filters.division),
    fractionAddition: valueFilter(filters.fractionAddition),
    fractionMultiplication: boolFilter(filters.fractionMultiplication),
    decimals: boolFilter(filters.decimals),
    negatives: boolFilter(filters.negatives),
    timestamp: timestampFilter(filters.date),
  };
}

function valueFilter<T extends string, U = T>(
  val: Partial<Record<T, boolean>>,
  mapping?: Record<T, U>,
): U[] {
  return Object.entries(val)
    .filter(([_, v]) => v === true)
    .map(([k]) => k as T)
    .map((it) => (mapping ? mapping[it] : (it as unknown as U)));
}

/**
 * AC-081: a boolean group is keyed by `String(storedValue)`, so the two keys are
 * literally `"true"` and `"false"` and the mapping back is a string compare.
 */
function boolFilter(val: Record<"true" | "false", boolean>): boolean[] {
  return Object.entries(val)
    .filter(([_, v]) => v)
    .map(([k]) => k === "true");
}

function timestampFilter(val: ResultFilters["date"]): number {
  const seconds =
    valueFilter(val, {
      all: 0,
      last_day: 24 * 60 * 60,
      last_week: 7 * 24 * 60 * 60,
      last_month: 30 * 24 * 60 * 60,
      last_3months: 90 * 24 * 60 * 60,
    })[0] ?? 0;

  if (seconds === 0) return 0;
  return Math.floor(Date.now() - seconds * 1000);
}

/**
 * AC-013: "time spent" is the test itself plus whatever was burned on restarts,
 * minus idle time. Every croco calc test is a fixed-duration timer, so there is
 * no length-derived estimate to fall back on.
 */
function calcTimeSpent(result: ResultMinified | SnapshotResult<Mode>): number {
  let tt = result.testDuration;
  if (result.incompleteTestSeconds !== undefined) {
    tt += result.incompleteTestSeconds;
  } else if (result.restartCount !== undefined && result.restartCount > 0) {
    tt += (tt / 4) * result.restartCount;
  }
  return tt - (result.afkDuration ?? 0);
}

// oxlint-disable-next-line typescript/explicit-function-return-type
export const getSingleResultQueryOptions = (_id: string) =>
  queryOptions({
    queryKey: queryKeys.fullResult(_id),
    queryFn: async () => {
      const response = await Ape.results.getById({ params: { resultId: _id } });

      if (response.status !== 200) {
        throw new Error(`Failed to load result: ${response.body.message}`);
      }
      return response.body.data;
    },
    staleTime: Infinity,
  });

/**
 * The `(mode2, settingsId)` pair a personal best is keyed on (master C31).
 */
export type CurrentSettingsFilter = {
  mode2: Mode2<"time">;
  settingsId: string;
};

// oxlint-disable-next-line typescript/explicit-function-return-type
export function useUserAverage10LiveQuery(options: {
  isEnabled: Accessor<boolean>;
}) {
  const settingsFilter = createMemo<CurrentSettingsFilter>(() => ({
    mode2: `${getConfig.time}`,
    settingsId: buildSettingsIdFromConfig(),
  }));

  return useLiveQuery((q) => {
    //disable query
    if (!isAuthenticated()) return undefined;
    if (!options.isEnabled()) return undefined;

    return q
      .from({
        //we use sub-query to filter first and then aggregate
        last10: buildSettingsResultsQuery(settingsFilter())
          .orderBy(({ r }) => r.timestamp, "desc")
          .limit(10),
      })
      .select(({ last10 }) => ({
        score: avg(last10.score),
        acc: avg(last10.acc),
      }))
      .findOne();
  });
}

export async function getUserAverage10Once(
  options: CurrentSettingsFilter,
): Promise<{ score: number; acc: number }> {
  //exit early if there is no user. Don't init the result collection
  if (!isAuthenticated()) return { score: 0, acc: 0 };

  const result = await queryOnce((q) =>
    q
      .from({
        //we use sub-query to filter first and then aggregate
        last10: buildSettingsResultsQuery(options)
          .orderBy(({ r }) => r.timestamp, "desc")
          .limit(10),
      })
      .select(({ last10 }) => ({
        score: avg(last10.score),
        acc: avg(last10.acc),
      }))
      .findOne(),
  );

  return result ?? { score: 0, acc: 0 };
}

export async function getUserDailyBestOnce(
  options: CurrentSettingsFilter,
): Promise<{ score: number; acc: number }> {
  //exit early if there is no user. Don't init the result collection
  if (!isAuthenticated()) return { score: 0, acc: 0 };

  const result = await queryOnce(() =>
    buildSettingsResultsQuery(options)
      .where(({ r }) => gte(r.timestamp, Date.now() - 24 * 60 * 60 * 1000))
      .orderBy(({ r }) => r.score, "desc")
      .limit(1)
      .findOne(),
  );

  return result ?? { score: 0, acc: 0 };
}

// oxlint-disable-next-line typescript/explicit-function-return-type
function buildSettingsResultsQuery(filter: CurrentSettingsFilter) {
  return new Query()
    .from({ r: resultsCollection })
    .where(({ r }) => eq(r.mode2, filter.mode2))
    .where(({ r }) => eq(r.settingsId, filter.settingsId));
}

/** SB-170: one shared join, never a per-call-site re-derivation (AC-121). */
function buildSettingsIdFromConfig(): string {
  return buildSettingsId({
    addition: getConfig.addition,
    multiplication: getConfig.multiplication,
    division: getConfig.division,
    fractionAddition: getConfig.fractionAddition,
    fractionMultiplication: getConfig.fractionMultiplication,
    decimals: getConfig.decimals,
    negatives: getConfig.negatives,
  });
}

export function isResultsReady(): boolean {
  return resultsCollection.isReady();
}

export async function waitForResultsReady(): Promise<void> {
  await resultsCollection.stateWhenReady();
}

createEffectOn(isAuthenticated, (hasUser) => {
  if (hasUser) {
    void resultsCollection.utils.refetch();
  }
});

function getResults(): SnapshotResult<Mode>[] {
  return [...resultsCollection.values()];
}
/**
 * Used for non reactive access. Do not use in Solid components.
 */
export const __nonReactive = {
  getResults,
};
