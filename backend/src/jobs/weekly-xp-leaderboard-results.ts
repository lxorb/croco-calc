/**
 * Awards last week's XP-leaderboard placements (INF-066).
 *
 * BullMQ's `weekly-xp-leaderboard-results` task moved into the cron runner, for
 * the same reason as its daily sibling: the queue that scheduled it is gone
 * (C23, INF-063/INF-065). The weekly board has **no mode axis at all** (AC-112),
 * so unlike the daily rollover there is exactly one board to settle.
 */

import { CronJob } from "cron";
import { CrocoMail } from "@croco-calc/schemas/users";
import { getStartOfWeekTimestamp } from "@croco-calc/util/date-and-time";
import { getCachedConfiguration } from "../init/configuration";
import { WeeklyXpLeaderboard } from "../services/weekly-xp-leaderboard";
import { addToInboxBulk } from "../dal/user";
import { buildCrocoMail } from "../utils/croco-mail";
import { formatSeconds, getOrdinalNumberString } from "../utils/misc";
import Logger from "../utils/logger";
import { weekPeriodKey, withJobLock } from "./job-lock";
import {
  calculateXpReward,
  isRewardable,
  maxRewardedRank,
  rewardMailId,
  withDeterministicId,
  withoutAlreadyRewarded,
} from "./xp-rewards";

const MILLISECONDS_IN_WEEK = 7 * 86400000;

/** Monday, just after the week rollover (INF-066). */
const CRON_SCHEDULE = "0 10 0 * * 1";

export const JOB_NAME = "weekly-xp-leaderboard-results";

export async function awardWeeklyXpLeaderboardResults(
  now = Date.now(),
): Promise<void> {
  const {
    leaderboards: { weeklyXp: weeklyXpConfig },
    users: { inbox: inboxConfig },
  } = await getCachedConfiguration(false);

  const { enabled, xpRewardBrackets } = weeklyXpConfig;

  if (!enabled || !inboxConfig.enabled || xpRewardBrackets.length === 0) {
    return;
  }

  const lastWeekTimestamp = getStartOfWeekTimestamp(now - MILLISECONDS_IN_WEEK);
  const periodKey = weekPeriodKey(lastWeekTimestamp);

  await withJobLock(JOB_NAME, periodKey, async () => {
    const maxRankToGet = maxRewardedRank(xpRewardBrackets);
    if (maxRankToGet === 0) return;

    const board = new WeeklyXpLeaderboard(lastWeekTimestamp);
    const results = await board.getResults(0, maxRankToGet, weeklyXpConfig);

    if (results === null || results.entries.length === 0) return;

    const mailEntries: { uid: string; mail: CrocoMail[] }[] = [];

    for (const entry of results.entries) {
      const rank = entry.rank;
      if (rank === undefined) continue;

      const xpReward = calculateXpReward(xpRewardBrackets, rank);
      if (!isRewardable(xpReward)) continue;

      const mail = withDeterministicId(
        buildCrocoMail({
          subject: "Weekly XP leaderboard placement",
          body:
            `Congratulations ${entry.name} on placing ` +
            `${getOrdinalNumberString(rank)} with ${Math.round(entry.totalXp)} xp! ` +
            `Last week you practised for a total of ` +
            `${formatSeconds(entry.timeSpentSeconds)}. Keep it up :)`,
          rewards: [{ type: "xp", item: Math.round(xpReward) }],
          timestamp: now,
        }),
        rewardMailId("weeklyXp", periodKey, entry.uid),
      );

      mailEntries.push({ uid: entry.uid, mail: [mail] });
    }

    const unrewarded = await withoutAlreadyRewarded(mailEntries);
    if (unrewarded.length === 0) return;

    await addToInboxBulk(unrewarded, inboxConfig);
    Logger.info(
      `Awarded ${unrewarded.length} weekly xp placements for ${periodKey}`,
    );
  });
}

export default new CronJob(CRON_SCHEDULE, () => {
  void awardWeeklyXpLeaderboardResults();
});
