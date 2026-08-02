/**
 * Drops log documents older than 30 days.
 *
 * Unchanged from monkeytype apart from INF-151: the advisory lock is mandatory
 * for **every** job, not only the ones that award something. Three replicas each
 * issuing the same `deleteMany` is wasteful rather than dangerous, but the rule
 * has no exceptions and an unlocked job is exactly the sort of thing that
 * silently regrows.
 */

import { CronJob } from "cron";
import * as db from "../init/db";
import { getCachedConfiguration } from "../init/configuration";
import { addLog } from "../dal/logs";
import { intervalPeriodKey, withJobLock } from "./job-lock";

const CRON_SCHEDULE = "0 0 0 * * *";
const LOG_MAX_AGE_DAYS = 30;
const LOG_MAX_AGE_MILLISECONDS = LOG_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

export const JOB_NAME = "delete-old-logs";

/** Matches `CRON_SCHEDULE`: one occurrence per UTC day. */
export const INTERVAL_MS = 24 * 60 * 60 * 1000;

export async function deleteOldLogs(now = Date.now()): Promise<void> {
  const { maintenance } = await getCachedConfiguration();
  if (maintenance) {
    return;
  }

  await withJobLock(JOB_NAME, intervalPeriodKey(now, INTERVAL_MS), async () => {
    const data = await db.collection("logs").deleteMany({
      timestamp: { $lt: now - LOG_MAX_AGE_MILLISECONDS },
      $or: [{ important: false }, { important: { $exists: false } }],
    });

    void addLog(
      "system_logs_deleted",
      `${data.deletedCount} logs deleted older than ${LOG_MAX_AGE_DAYS} day(s)`,
      undefined,
    );
  });
}

export default new CronJob(CRON_SCHEDULE, () => {
  void deleteOldLogs();
});
