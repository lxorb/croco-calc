import { useQuery } from "@tanstack/solid-query";
import {
  createEffect,
  createSignal,
  JSXElement,
  Match,
  Show,
  Switch,
} from "solid-js";

import { getSnapshot, updateLbMemory } from "../../../db";
import { createEffectOn } from "../../../hooks/effects";
import { PageName } from "../../../pages/page";
import { queryClient } from "../../../queries";
import {
  getLeaderboardQueryOptions,
  getRankQueryOptions,
} from "../../../queries/leaderboards";
import { getServerConfigurationQueryOptions } from "../../../queries/server-configuration";
import { getActivePage, isAuthenticated } from "../../../states/core";
import {
  getGoToUserPage,
  getPage,
  getSelection,
  pageSize,
  Selection,
  setGoToUserPage,
  setPage,
  setSelection,
  updateGetParameters,
} from "../../../states/leaderboard-selection";
import { cn } from "../../../utils/cn";
import { createErrorMessage } from "../../../utils/error";
import { scrollToTop } from "../../../utils/misc";
import AsyncContent from "../../common/AsyncContent";
import { LoadingCircle } from "../../common/LoadingCircle";
import { Page } from "../../common/Page";
import { Separator } from "../../common/Separator";
import { Navigation } from "./Navigation";
import { NextUpdate } from "./NextUpdate";
import { Sidebar } from "./Sidebar";
import { Table } from "./Table";
import { Title } from "./Title";
import { UserRank } from "./UserRank";

const pageName: PageName = "leaderboards";

export function LeaderboardPage(): JSXElement {
  const isOpen = () => getActivePage() === pageName;

  const [scrollToUser, setScrollToUser] = createSignal(false);

  //invalidate cache for daily and weekly lb on close
  createEffectOn(isOpen, (open) => {
    if (!open) {
      void queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey.length >= 3 &&
          query.queryKey[1] === "leaderboard" &&
          ["weekly", "daily"].includes(query.queryKey[2] as string),
      });
    }
  });

  //prefetch next page
  createEffect(() => {
    if (isOpen()) {
      void queryClient.prefetchQuery(
        getLeaderboardQueryOptions({
          ...getSelection(),
          page: getPage() + 1,
        }),
      );
    }
  });

  //update url after the data is loaded
  createEffect(() => {
    if (isOpen() && entriesQuery.isSuccess) {
      updateGetParameters(getSelection(), getPage());
    }
  });

  //update lb memory after the rank is loaded
  createEffect(() => {
    if (isOpen() && rankQuery.isSuccess) {
      syncLbMemory();
    }
  });

  //handle goToUserPage url param once rank is loaded
  createEffect(() => {
    if (isOpen() && getGoToUserPage() && rankQuery.isSuccess) {
      setGoToUserPage(false);
      const page = userPage();
      if (page !== undefined) {
        setPage(page);
        setScrollToUser(true);
      }
    }
  });

  const entriesQuery = useQuery(() => ({
    ...getLeaderboardQueryOptions({
      ...getSelection(),
      page: getPage() ?? 0,
    }),
    enabled: isOpen(),
  }));

  const rankQuery = useQuery(() => ({
    ...getRankQueryOptions(getSelection()),
    enabled: isAuthenticated() && isOpen(),
  }));

  const serverConfigurationQuery = useQuery(() => ({
    ...getServerConfigurationQueryOptions(),
    enabled: isOpen(),
  }));

  const onSelectionChange = (newSelection: Selection) => {
    setSelection(newSelection);
    setPage(0);
  };

  /**
   * the page that contains the user
   */
  const userPage = () => {
    const userRank = getSelection().friendsOnly
      ? rankQuery.data?.friendsRank
      : rankQuery.data?.rank;
    if (userRank === undefined) return undefined;
    const page = Math.ceil(userRank / pageSize) - 1;
    return page;
  };

  /** AC-128: the remembered rank is keyed by `mode2` alone — no language key. */
  const syncLbMemory = () => {
    if (
      rankQuery.data !== undefined &&
      rankQuery.data !== null &&
      getSelection().type === "allTime"
    ) {
      const diff = getLbMemoryDifference(getSelection(), rankQuery.data.rank);

      if (diff !== 0) {
        void updateLbMemory(
          "time",
          getSelection().mode2,
          rankQuery.data.rank,
          true,
        );
      }
    }
  };

  const getLbMemoryDifference = (
    selection: Selection,
    currentRank: number | undefined,
  ): number | undefined => {
    if (
      selection.type !== "allTime" ||
      selection.mode !== "time" ||
      selection.friendsOnly ||
      currentRank === undefined
    ) {
      return undefined;
    }
    const oldRank = getSnapshot()?.lbMemory?.time?.[selection.mode2] ?? 0;

    return oldRank - currentRank;
  };

  return (
    <Page id="leaderboards">
      <div class="content-grid flex flex-col gap-8 lg:flex-row">
        <div class="w-full shrink-0 lg:w-60 2xl:w-75">
          <AsyncContent queries={{ serverConfigurationQuery }}>
            {({ serverConfigurationQueryData }) => (
              <Sidebar
                selection={getSelection}
                onSelect={onSelectionChange}
                connectionsEnabled={
                  serverConfigurationQueryData().connections.enabled
                }
              />
            )}
          </AsyncContent>
        </div>

        <div class="flex w-full flex-1 flex-col gap-8">
          <Title
            selection={getSelection()}
            onPreviousSelect={() =>
              setSelection((old) => ({ ...old, previous: !old.previous }))
            }
          />

          <Show
            when={isAuthenticated() && !entriesQuery.isLoading}
            fallback={<Separator />}
          >
            <AsyncContent
              queries={{
                entriesQuery,
                rankQuery,
                serverConfigurationQuery,
              }}
              alwaysShowContent
              errorClass="rounded bg-sub-alt p-4"
            >
              {({
                entriesQueryData,
                rankQueryData,
                serverConfigurationQueryData,
              }) => {
                /** AC-130: croco calc exposes `minScore`, not a speed floor. */
                const minScore = () => {
                  const d = entriesQueryData();
                  return d && "minScore" in d
                    ? (d.minScore as number)
                    : undefined;
                };

                return (
                  <UserRank
                    type={getSelection().type === "weekly" ? "xp" : "speed"}
                    data={rankQueryData()}
                    friendsOnly={getSelection().friendsOnly}
                    total={entriesQueryData()?.count}
                    minScore={minScore()}
                    memoryDifference={getLbMemoryDifference(
                      getSelection(),
                      rankQueryData()?.rank,
                    )}
                    isLbOptOut={getSnapshot()?.lbOptOut ?? false}
                    isBanned={getSnapshot()?.banned ?? false}
                    minTimeSpent={
                      serverConfigurationQueryData()?.leaderboards
                        .minTimeSpent ?? 0
                    }
                    userTimeSpent={getSnapshot()?.testStats.timeSpent ?? 0}
                  />
                );
              }}
            </AsyncContent>
          </Show>

          {/*
            The three states are spelled out here rather than delegated to
            `AsyncContent`. When `GET /leaderboards/xp/weekly` answered 503
            (weekly XP was switched off in the server configuration) this block
            rendered *nothing at all* — no spinner, no message, no empty state —
            because `AsyncContent`'s deferred branch only renders children once a
            value has resolved, and a query that never resolves never gets there.
            The user saw a leaderboard page that loaded forever.

            `Switch` is exhaustive: error wins, then data, and the fallback is
            the loader. "No entries" is *not* an error — `Table` renders the
            AC-136 empty row for it — so a board with no users yet shows the
            empty state rather than a spinner or a failure.
          */}
          <Switch
            fallback={
              <div class="flex justify-center pt-4 text-4xl">
                <LoadingCircle />
              </div>
            }
          >
            <Match when={entriesQuery.isError}>
              <div class="flex flex-row items-center justify-center rounded bg-sub-alt p-4 text-text">
                {createErrorMessage(
                  entriesQuery.error,
                  "Could not load the leaderboard",
                )}
              </div>
            </Match>

            <Match when={entriesQuery.data !== undefined}>
              <div>
                <div
                  class={cn(
                    "mb-2 grid grid-cols-1 items-center justify-between gap-2 text-sm sm:grid-cols-2 sm:text-base",
                  )}
                >
                  <NextUpdate type={getSelection().type} />
                  <Navigation
                    isLoading={
                      entriesQuery.isLoading ||
                      entriesQuery.isFetching ||
                      entriesQuery.isRefetching
                    }
                    lastPage={Math.ceil(
                      (entriesQuery.data?.count ?? 0) / pageSize,
                    )}
                    userPage={userPage()}
                    currentPage={getPage()}
                    onPageChange={setPage}
                    onScrollToUser={setScrollToUser}
                    class="w-full sm:w-max"
                  />
                </div>

                <div>
                  <Table
                    type={getSelection().type === "weekly" ? "xp" : "speed"}
                    entries={entriesQuery.data?.entries ?? []}
                    friendsOnly={getSelection().friendsOnly}
                    scrollToUser={scrollToUser}
                    onScrolledToUser={() => setScrollToUser(false)}
                  />
                </div>

                <div class="mt-4 grid grid-cols-1 items-center justify-between text-sm sm:text-base">
                  <Navigation
                    lastPage={Math.ceil(
                      (entriesQuery.data?.count ?? 0) / pageSize,
                    )}
                    currentPage={getPage()}
                    onPageChange={(page) => {
                      setPage(page);
                      scrollToTop();
                    }}
                    onScrollToUser={setScrollToUser}
                    class="w-full sm:w-max"
                  />
                </div>
              </div>
            </Match>
          </Switch>
        </div>
      </div>
    </Page>
  );
}
