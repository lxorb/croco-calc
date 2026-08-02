import { describe, it, expect, beforeEach, vi } from "vitest";
import * as DB from "../../../src/init/db";
import * as JobLock from "../../../src/jobs/job-lock";
import {
  DailyLeaderboard,
  DAILY_LEADERBOARD_COLLECTION,
} from "../../../src/utils/daily-leaderboards";
import {
  WeeklyXpLeaderboard,
  WEEKLY_XP_LEADERBOARD_COLLECTION,
} from "../../../src/services/weekly-xp-leaderboard";
import { awardDailyLeaderboardResults } from "../../../src/jobs/daily-leaderboard-results";
import { awardWeeklyXpLeaderboardResults } from "../../../src/jobs/weekly-xp-leaderboard-results";
import { createUser } from "../../__testData__/users";
import type { Configuration } from "@croco-calc/schemas/configuration";
import {
  getStartOfDayTimestamp,
  getStartOfWeekTimestamp,
  MILLISECONDS_IN_DAY,
} from "@croco-calc/util/date-and-time";

/**
 * INF-153 and INF-154(b), against the **real** rollover jobs rather than a
 * synthetic unit of work.
 *
 * INF-153 is explicit that idempotency is required *in addition to* the lock,
 * not instead of it: the lock prevents concurrency, idempotency prevents damage
 * from the retry the lock cannot prevent (a crash after the writes but before
 * `releaseLock`, then a stale reclaim ten minutes later). Both rollovers award
 * XP by `$push`-ing a mail into the winner's inbox, which is exactly the "blind
 * `$inc` on user documents" shape INF-153 forbids — the deterministic mail id
 * plus `withoutAlreadyRewarded` is what makes the replay a no-op.
 *
 * These tests deliberately bypass the lock for the replay (`jobLocks` is cleared
 * between runs) so that the idempotency is proven **on its own**. A test that
 * left the lock in place would pass even if the jobs were not idempotent at all.
 */

const NOW = Date.UTC(2026, 7, 2, 0, 0, 5);
const YESTERDAY = getStartOfDayTimestamp(NOW) - MILLISECONDS_IN_DAY;
const LAST_WEEK = getStartOfWeekTimestamp(NOW - 7 * MILLISECONDS_IN_DAY);

const MODE_RULE = { mode: "time", mode2: "8" } as const;

const DAILY_CONFIG: Configuration["dailyLeaderboards"] = {
  enabled: true,
  maxResults: 100,
  leaderboardExpirationTimeInDays: 2,
  validModeRules: [MODE_RULE],
  scheduleRewardsModeRules: [MODE_RULE],
  topResultsToAnnounce: 1,
  xpRewardBrackets: [
    { minRank: 1, maxRank: 1, minReward: 500, maxReward: 500 },
    { minRank: 2, maxRank: 3, minReward: 100, maxReward: 250 },
  ],
};

const WEEKLY_CONFIG: Configuration["leaderboards"]["weeklyXp"] = {
  enabled: true,
  expirationTimeInDays: 15,
  xpRewardBrackets: [
    { minRank: 1, maxRank: 1, minReward: 1000, maxReward: 1000 },
    { minRank: 2, maxRank: 3, minReward: 250, maxReward: 500 },
  ],
};

vi.mock("../../../src/init/configuration", () => ({
  __esModule: true,
  getCachedConfiguration: async () => ({
    maintenance: false,
    dailyLeaderboards: DAILY_CONFIG,
    leaderboards: { minTimeSpent: 0, weeklyXp: WEEKLY_CONFIG },
    users: { inbox: { enabled: true, maxMail: 100 } },
  }),
  getLiveConfiguration: async () => ({}),
  patchConfiguration: vi.fn(),
}));

/** Inboxes only — the whole observable effect of both jobs. */
async function inboxSnapshot(): Promise<string> {
  const users = await DB.collection("users")
    .find({}, { projection: { uid: 1, inbox: 1 } })
    .sort({ uid: 1 })
    .toArray();
  return JSON.stringify(users);
}

async function clearLocks(): Promise<void> {
  await DB.collection(JobLock.JOB_LOCK_COLLECTION).deleteMany({});
  JobLock.__testing.resetIndexMemo();
}

beforeEach(async () => {
  await DB.collection("users").deleteMany({});
  await DB.collection(DAILY_LEADERBOARD_COLLECTION).deleteMany({});
  await DB.collection(WEEKLY_XP_LEADERBOARD_COLLECTION).deleteMany({});
  await clearLocks();
});

describe("INF-153 — the daily rollover is idempotent", () => {
  async function seedDailyBoard(): Promise<string[]> {
    const board = new DailyLeaderboard(MODE_RULE, YESTERDAY);
    const uids: string[] = [];
    for (const [i, score] of [300, 200, 100].entries()) {
      const user = await createUser();
      uids.push(user.uid);
      await board.addResult(
        {
          uid: user.uid,
          name: user.name,
          score,
          correct: score + 10,
          wrong: 10,
          acc: 90,
          tpm: 40,
          timestamp: YESTERDAY + i * 1000,
        },
        DAILY_CONFIG,
      );
    }
    return uids;
  }

  it("awards each placement exactly once", async () => {
    const uids = await seedDailyBoard();

    await awardDailyLeaderboardResults(NOW);

    const users = await DB.collection("users")
      .find({ uid: { $in: uids } })
      .toArray();
    expect(users).toHaveLength(3);
    for (const user of users) {
      expect(user["inbox"]).toHaveLength(1);
    }
  });

  it("re-running the same periodKey leaves the collection byte-identical", async () => {
    await seedDailyBoard();

    await awardDailyLeaderboardResults(NOW);
    const afterFirst = await inboxSnapshot();

    // Drop the lock so the *idempotency* is what is being tested, not the lock.
    await clearLocks();
    await awardDailyLeaderboardResults(NOW);

    expect(await inboxSnapshot()).toBe(afterFirst);
  });

  it("stays a no-op over many replays", async () => {
    await seedDailyBoard();
    await awardDailyLeaderboardResults(NOW);
    const afterFirst = await inboxSnapshot();

    for (let i = 0; i < 4; i++) {
      await clearLocks();
      await awardDailyLeaderboardResults(NOW);
    }

    expect(await inboxSnapshot()).toBe(afterFirst);
  });

  it("INF-154(a) — three concurrent runs award one set of placements", async () => {
    await seedDailyBoard();

    await Promise.all([
      awardDailyLeaderboardResults(NOW),
      awardDailyLeaderboardResults(NOW),
      awardDailyLeaderboardResults(NOW),
    ]);

    const users = await DB.collection("users").find({}).toArray();
    for (const user of users) {
      expect(user["inbox"] ?? []).toHaveLength(1);
    }
    expect(
      await DB.collection(JobLock.JOB_LOCK_COLLECTION).countDocuments({
        jobName: "daily-leaderboard-results",
      }),
    ).toBe(1);
  });

  it("locks on the day it is settling, not the day it runs", async () => {
    await seedDailyBoard();
    await awardDailyLeaderboardResults(NOW);

    const lock = await DB.collection(JobLock.JOB_LOCK_COLLECTION).findOne({
      jobName: "daily-leaderboard-results",
    });
    expect(lock?.["periodKey"]).toBe(JobLock.dayPeriodKey(YESTERDAY));
    expect(lock?.["periodKey"]).toBe("2026-08-01");
    expect(lock?.["state"]).toBe("done");
  });
});

describe("INF-153 — the weekly XP rollover is idempotent", () => {
  async function seedWeeklyBoard(): Promise<string[]> {
    const board = new WeeklyXpLeaderboard(LAST_WEEK);
    const uids: string[] = [];
    for (const xp of [5000, 3000, 1000]) {
      const user = await createUser();
      uids.push(user.uid);
      await board.addResult(WEEKLY_CONFIG, {
        entry: {
          uid: user.uid,
          name: user.name,
          lastActivityTimestamp: LAST_WEEK + 1000,
          timeSpentSeconds: 600,
        },
        xpGained: xp,
      });
    }
    return uids;
  }

  it("awards each placement exactly once", async () => {
    const uids = await seedWeeklyBoard();

    await awardWeeklyXpLeaderboardResults(NOW);

    const users = await DB.collection("users")
      .find({ uid: { $in: uids } })
      .toArray();
    expect(users).toHaveLength(3);
    for (const user of users) {
      expect(user["inbox"]).toHaveLength(1);
    }
  });

  it("re-running the same periodKey leaves the collection byte-identical", async () => {
    await seedWeeklyBoard();

    await awardWeeklyXpLeaderboardResults(NOW);
    const afterFirst = await inboxSnapshot();

    await clearLocks();
    await awardWeeklyXpLeaderboardResults(NOW);

    expect(await inboxSnapshot()).toBe(afterFirst);
  });

  it("INF-154(a) — three concurrent runs award one set of placements", async () => {
    await seedWeeklyBoard();

    await Promise.all([
      awardWeeklyXpLeaderboardResults(NOW),
      awardWeeklyXpLeaderboardResults(NOW),
      awardWeeklyXpLeaderboardResults(NOW),
    ]);

    const users = await DB.collection("users").find({}).toArray();
    for (const user of users) {
      expect(user["inbox"] ?? []).toHaveLength(1);
    }
  });

  it("locks on the week it is settling", async () => {
    await seedWeeklyBoard();
    await awardWeeklyXpLeaderboardResults(NOW);

    const lock = await DB.collection(JobLock.JOB_LOCK_COLLECTION).findOne({
      jobName: "weekly-xp-leaderboard-results",
    });
    expect(lock?.["periodKey"]).toBe(JobLock.weekPeriodKey(LAST_WEEK));
    expect(lock?.["state"]).toBe("done");
  });
});
