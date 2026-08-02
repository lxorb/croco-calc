/**
 * Awards yesterday's daily-leaderboard placements (INF-066).
 *
 * This is the old queue runner's `daily-leaderboard-results` task
 * (`backend/src/queues/later-queue.ts`, `backend/src/workers/later-worker.ts`)
 * moved into the cron runner, because the queue that used to schedule it is
 * gone (C23, INF-063/INF-065). Two consequences of the move:
 *
 *  * monkeytype scheduled one delayed task per board **at the moment a result
 *    landed** on it. A cron job cannot be scheduled from a write, so it iterates
 *    `scheduleRewardsModeRules` directly — the same set of boards, decided at
 *    run time instead of at write time;
 *  * the Discord `topResultsToAnnounce` announcement is dropped (INF-067).
 *    `topResultsToAnnounce` stays in the configuration schema, which WP-11 owns;
 *    nothing here reads it.
 *
 * There is no language axis (AC-113, INV-153), so a board is `(mode, mode2)`.
 */

import { CronJob } from "cron";
import { CrocoMail } from "@croco-calc/schemas/users";
import {
  getStartOfDayTimestamp,
  MILLISECONDS_IN_DAY,
} from "@croco-calc/util/date-and-time";
import { getCachedConfiguration } from "../init/configuration";
import { DailyLeaderboard } from "../utils/daily-leaderboards";
import { addToInboxBulk } from "../dal/user";
import { buildCrocoMail } from "../utils/croco-mail";
import { getOrdinalNumberString } from "../utils/misc";
import Logger from "../utils/logger";
import { dayPeriodKey, withJobLock } from "./job-lock";
import {
  calculateXpReward,
  isRewardable,
  maxRewardedRank,
  rewardMailId,
  withDeterministicId,
  withoutAlreadyRewarded,
} from "./xp-rewards";

/** Just after UTC midnight (INF-066), leaving the day boundary unambiguous. */
const CRON_SCHEDULE = "0 5 0 * * *";

export const JOB_NAME = "daily-leaderboard-results";

export async function awardDailyLeaderboardResults(
  now = Date.now(),
): Promise<void> {
  const {
    dailyLeaderboards: dailyLeaderboardsConfig,
    users: { inbox: inboxConfig },
  } = await getCachedConfiguration(false);

  const { enabled, xpRewardBrackets, scheduleRewardsModeRules } =
    dailyLeaderboardsConfig;

  if (!enabled || !inboxConfig.enabled || xpRewardBrackets.length === 0) {
    return;
  }

  // The job runs just after midnight and settles the day that just ended.
  const yesterdayTimestamp = getStartOfDayTimestamp(now) - MILLISECONDS_IN_DAY;
  const periodKey = dayPeriodKey(yesterdayTimestamp);

  await withJobLock(JOB_NAME, periodKey, async () => {
    const maxRankToGet = maxRewardedRank(xpRewardBrackets);
    if (maxRankToGet === 0) return;

    for (const modeRule of scheduleRewardsModeRules) {
      const board = new DailyLeaderboard(modeRule, yesterdayTimestamp);
      const results = await board.getResults(
        0,
        maxRankToGet,
        dailyLeaderboardsConfig,
      );

      if (results === null || results.entries.length === 0) continue;

      const mailEntries: { uid: string; mail: CrocoMail[] }[] = [];

      for (const entry of results.entries) {
        const rank = entry.rank;
        if (rank === undefined) continue;

        const xpReward = calculateXpReward(xpRewardBrackets, rank);
        if (!isRewardable(xpReward)) continue;

        const mail = withDeterministicId(
          buildCrocoMail({
            subject: "Daily leaderboard placement",
            body:
              `Congratulations ${entry.name} on placing ` +
              `${getOrdinalNumberString(rank)} with a score of ${entry.score} ` +
              `in the ${modeRule.mode} ${modeRule.mode2} daily leaderboard!`,
            rewards: [{ type: "xp", item: Math.round(xpReward) }],
            timestamp: now,
          }),
          rewardMailId(`dailyLb_${board.getModeKey()}`, periodKey, entry.uid),
        );

        mailEntries.push({ uid: entry.uid, mail: [mail] });
      }

      const unrewarded = await withoutAlreadyRewarded(mailEntries);
      if (unrewarded.length === 0) continue;

      await addToInboxBulk(unrewarded, inboxConfig);
      Logger.info(
        `Awarded ${unrewarded.length} daily leaderboard placements on ` +
          `${board.getModeKey()} for ${periodKey}`,
      );
    }
  });
}

export default new CronJob(CRON_SCHEDULE, () => {
  void awardDailyLeaderboardResults();
});
