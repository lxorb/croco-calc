/**
 * The cron runner, started from `server.ts`.
 *
 * The last two entries are INF-066: the work the old `later-queue` used to do
 * on a delay now runs on a schedule, because there is no queue left to delay it
 * on (C23). Every job in this directory acquires the INF-151 advisory lock
 * before doing anything — at `maxReplicas = 3` (INF-036) this file is loaded in
 * three processes and each of them fires the same schedule.
 */

import updateLeaderboardsJob from "./update-leaderboards";
import deleteOldLogsJob from "./delete-old-logs";
import dailyLeaderboardResultsJob from "./daily-leaderboard-results";
import weeklyXpLeaderboardResultsJob from "./weekly-xp-leaderboard-results";

export default [
  updateLeaderboardsJob,
  deleteOldLogsJob,
  dailyLeaderboardResultsJob,
  weeklyXpLeaderboardResultsJob,
];
