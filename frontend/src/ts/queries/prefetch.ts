import { queryClient } from ".";
import {
  getContributorsQueryOptions,
  getScoreHistogramQueryOptions,
  getSupportersQueryOptions,
  getTrainingStatsQueryOptions,
} from "./public";
import { getLeaderboardQueryOptions } from "./leaderboards";

export function prefetchAboutPage(): void {
  void queryClient.prefetchQuery(getContributorsQueryOptions());
  void queryClient.prefetchQuery(getSupportersQueryOptions());
  void queryClient.prefetchQuery(getTrainingStatsQueryOptions());
  void queryClient.prefetchQuery(getScoreHistogramQueryOptions());
}

export function prefetchLeaderboardPage(): void {
  void queryClient.prefetchQuery(
    getLeaderboardQueryOptions({
      type: "allTime",
      mode: "time",
      mode2: "4",
      friendsOnly: false,
      page: 0,
      previous: false,
    }),
  );
}
