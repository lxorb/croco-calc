/**
 * Rebuilds the all-time speed boards (AC-119).
 *
 * Three things changed from monkeytype's version:
 *
 *  * the **language axis is gone** (AC-113, INV-153) — a board is `(mode, mode2)`
 *    and nothing else, so `"english"` no longer appears in the key;
 *  * the boards rebuilt are `time 4` and `time 8` (SB-176, `LEADERBOARD_TIMES`),
 *    not monkeytype's `60` and `15`;
 *  * the Discord announcement call is **removed** (AC-119, INF-067). It was the
 *    only consumer of the top-10 before/after diff, so that machinery goes with
 *    it rather than being carried as dead code.
 *
 * AC-118 renders a "next update in mm:ss" countdown against this schedule, so
 * the job actually running is what makes that countdown truthful.
 */

import { CronJob } from "cron";
import * as LeaderboardsDAL from "../dal/leaderboards";
import { getCachedConfiguration } from "../init/configuration";
import { LEADERBOARD_TIMES } from "@croco-calc/schemas/math";
import { intervalPeriodKey, withJobLock } from "./job-lock";

const CRON_SCHEDULE = "30 14/15 * * * *";

export const JOB_NAME = "update-leaderboards";

/** Matches `CRON_SCHEDULE`: one occurrence every fifteen minutes. */
export const INTERVAL_MS = 15 * 60 * 1000;

export async function updateLeaderboards(now = Date.now()): Promise<void> {
  const { maintenance } = await getCachedConfiguration();
  if (maintenance) {
    return;
  }

  // INF-151 — at `maxReplicas = 3` this fires in three processes at once, and a
  // concurrent rebuild of the same board corrupts the rank snapshot.
  await withJobLock(JOB_NAME, intervalPeriodKey(now, INTERVAL_MS), async () => {
    for (const time of LEADERBOARD_TIMES) {
      await LeaderboardsDAL.update("time", `${time}`);
    }
  });
}

export default new CronJob(CRON_SCHEDULE, () => {
  void updateLeaderboards();
});
