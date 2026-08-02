/**
 * The weekly XP leaderboard, on MongoDB (INF-064, master C23).
 *
 * Same story as the daily board: monkeytype ran it on an in-memory sorted set
 * driven by Lua. That store is gone (INF-063), so it is a collection keyed
 * `{ periodTimestamp, uid }` ranked with `$setWindowFields`.
 *
 * The weekly board has **no mode axis at all** — AC-112 hides the time group for
 * it — so unlike the daily board there is no `modeKey`. AC-123 is why the
 * eligibility rules differ too: the default-settings gate (AC-121.3) and the
 * 4/8-minute gate (AC-121.2) deliberately do **not** apply here, because the
 * weekly totals have to agree with the XP shown on the user's own profile.
 */

import { Collection, Document, ObjectId } from "mongodb";
import * as db from "../init/db";
import { Configuration } from "@croco-calc/schemas/configuration";
import {
  XpLeaderboardEntry,
  XpLeaderboardEntryBase,
} from "@croco-calc/schemas/leaderboards";
import {
  getCurrentWeekTimestamp,
  MILLISECONDS_IN_DAY,
} from "@croco-calc/util/date-and-time";
import CrocoError from "../utils/error";
import { rowNumberStage } from "../dal/leaderboards";

export const WEEKLY_XP_LEADERBOARD_COLLECTION = "weeklyXpLeaderboards";

export type AddResultOpts = {
  entry: XpLeaderboardEntryBase;
  xpGained: number;
};

export type DBXpLeaderboardEntry = XpLeaderboardEntryBase & {
  _id: ObjectId;
  /** INF-064's period key — start-of-week (Monday) UTC, epoch ms. */
  periodTimestamp: number;
  totalXp: number;
  /** Drives the TTL index. */
  expiresAt: Date;
};

export const getWeeklyXpLeaderboardCollection =
  (): Collection<DBXpLeaderboardEntry> =>
    db.collection<DBXpLeaderboardEntry>(WEEKLY_XP_LEADERBOARD_COLLECTION);

const RANK_SORT = { totalXp: -1, lastActivityTimestamp: 1 } as const;

export class WeeklyXpLeaderboard {
  private readonly customTime: number;

  constructor(customTime = -1) {
    this.customTime = customTime;
  }

  public getPeriodTimestamp(): number {
    return this.customTime === -1 ? getCurrentWeekTimestamp() : this.customTime;
  }

  public async addResult(
    weeklyXpLeaderboardConfig: Configuration["leaderboards"]["weeklyXp"],
    opts: AddResultOpts,
  ): Promise<number> {
    if (!weeklyXpLeaderboardConfig.enabled) return -1;

    await ensureIndexes();

    const { entry, xpGained } = opts;
    const periodTimestamp = this.getPeriodTimestamp();
    const expiresAt = new Date(
      periodTimestamp +
        weeklyXpLeaderboardConfig.expirationTimeInDays * MILLISECONDS_IN_DAY,
    );

    await getWeeklyXpLeaderboardCollection().updateOne(
      { periodTimestamp, uid: entry.uid },
      {
        $inc: {
          totalXp: xpGained,
          timeSpentSeconds: entry.timeSpentSeconds,
        },
        $set: {
          name: entry.name,
          lastActivityTimestamp: entry.lastActivityTimestamp,
          expiresAt,
        },
        $setOnInsert: { periodTimestamp, uid: entry.uid },
      },
      { upsert: true },
    );

    const rank = await this.getRank(entry.uid, weeklyXpLeaderboardConfig);
    return rank?.rank ?? -1;
  }

  public async getResults(
    page: number,
    pageSize: number,
    weeklyXpLeaderboardConfig: Configuration["leaderboards"]["weeklyXp"],
    userIds?: string[],
  ): Promise<{
    entries: XpLeaderboardEntry[];
    count: number;
  } | null> {
    if (!weeklyXpLeaderboardConfig.enabled) return null;

    if (page < 0 || pageSize < 0) {
      throw new CrocoError(500, "Invalid page or pageSize");
    }

    if (userIds?.length === 0) {
      return { entries: [], count: 0 };
    }

    const isFriends = userIds !== undefined;
    const skip = page * pageSize;

    const ranked = await getWeeklyXpLeaderboardCollection()
      .aggregate<DBXpLeaderboardEntry & { rank: number; friendsRank?: number }>(
        [
          ...this.rankPipeline(),
          ...(isFriends
            ? [
                { $match: { uid: { $in: userIds } } },
                {
                  $setWindowFields: {
                    sortBy: { rank: 1 },
                    output: { friendsRank: { $documentNumber: {} } },
                  },
                },
              ]
            : []),
          { $skip: skip },
          { $limit: pageSize },
        ],
        { allowDiskUse: true },
      )
      .toArray();

    const countResult = await getWeeklyXpLeaderboardCollection()
      .aggregate<{ total: number }>([
        { $match: this.periodMatch() },
        ...(isFriends ? [{ $match: { uid: { $in: userIds } } }] : []),
        { $count: "total" },
      ])
      .toArray();

    return {
      entries: ranked.map(toEntry),
      count: countResult[0]?.total ?? 0,
    };
  }

  public async getRank(
    uid: string,
    weeklyXpLeaderboardConfig: Configuration["leaderboards"]["weeklyXp"],
    userIds?: string[],
  ): Promise<XpLeaderboardEntry | null> {
    if (!weeklyXpLeaderboardConfig.enabled) return null;
    if (userIds?.length === 0) return null;

    const isFriends = userIds !== undefined;

    const results = await getWeeklyXpLeaderboardCollection()
      .aggregate<DBXpLeaderboardEntry & { rank: number; friendsRank?: number }>(
        [
          ...this.rankPipeline(),
          ...(isFriends
            ? [
                { $match: { uid: { $in: userIds } } },
                {
                  $setWindowFields: {
                    sortBy: { rank: 1 },
                    output: { friendsRank: { $documentNumber: {} } },
                  },
                },
              ]
            : []),
          { $match: { uid } },
          { $limit: 1 },
        ],
        { allowDiskUse: true },
      )
      .toArray();

    const entry = results[0];
    return entry === undefined ? null : toEntry(entry);
  }

  private periodMatch(): Document {
    return { periodTimestamp: this.getPeriodTimestamp() };
  }

  private rankPipeline(): Document[] {
    return [
      { $match: this.periodMatch() },
      // Not `$documentNumber`: MongoDB rejects every rank-type window operator
      // unless `sortBy` has exactly one element, and `RANK_SORT` has two.
      // See `rowNumberStage`.
      rowNumberStage(RANK_SORT),
      { $sort: { rank: 1 } },
    ];
  }
}

function toEntry(
  doc: DBXpLeaderboardEntry & { rank: number; friendsRank?: number },
): XpLeaderboardEntry {
  return {
    uid: doc.uid,
    name: doc.name,
    lastActivityTimestamp: doc.lastActivityTimestamp,
    timeSpentSeconds: doc.timeSpentSeconds,
    totalXp: doc.totalXp,
    rank: doc.rank,
    ...(doc.friendsRank !== undefined ? { friendsRank: doc.friendsRank } : {}),
  };
}

export function get(
  weeklyXpLeaderboardConfig: Configuration["leaderboards"]["weeklyXp"],
  customTimestamp?: number,
): WeeklyXpLeaderboard | null {
  if (!weeklyXpLeaderboardConfig.enabled) {
    return null;
  }
  return new WeeklyXpLeaderboard(customTimestamp);
}

export async function purgeUserFromXpLeaderboards(
  uid: string,
  weeklyXpLeaderboardConfig: Configuration["leaderboards"]["weeklyXp"],
): Promise<void> {
  if (!weeklyXpLeaderboardConfig.enabled) return;
  await getWeeklyXpLeaderboardCollection().deleteMany({ uid });
}

export async function createIndicies(): Promise<void> {
  const collection = getWeeklyXpLeaderboardCollection();
  await collection.createIndex(
    { periodTimestamp: 1, totalXp: -1 },
    { name: "weekly_xp_rank" },
  );
  await collection.createIndex(
    { periodTimestamp: 1, uid: 1 },
    { name: "weekly_xp_key", unique: true },
  );
  await collection.createIndex(
    { expiresAt: 1 },
    { name: "weekly_xp_ttl", expireAfterSeconds: 0 },
  );
}

/**
 * `weekly_xp_key`'s uniqueness is load-bearing: `addResult` `$inc`s a running
 * total, so two documents for one `(periodTimestamp, uid)` would split a user's
 * week in half and under-report them. Boot-time index creation lives in
 * `server.ts`, which this package does not own, so the write path ensures its
 * own preconditions, memoised to one round-trip per process.
 */
let indexesReady: Promise<void> | undefined;

export async function ensureIndexes(): Promise<void> {
  indexesReady ??= createIndicies().catch((e: unknown) => {
    indexesReady = undefined;
    throw e;
  });
  await indexesReady;
}

export const __testing = {
  RANK_SORT,
  resetIndexMemo: (): void => {
    indexesReady = undefined;
  },
};
