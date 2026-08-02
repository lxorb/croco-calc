/**
 * The daily leaderboard, on MongoDB (INF-064, master C23).
 *
 * monkeytype ran this on in-memory sorted sets driven by five Lua scripts. That
 * store is removed entirely (INF-063: the managed cache tier it needed is
 * ~$16/mo, a third of the whole budget), so the board is a plain collection keyed
 * `{ periodTimestamp, modeKey, uid }` with a compound index
 * `{ periodTimestamp, modeKey, score: -1 }` and a TTL index for expiry, ranked
 * with `$setWindowFields` — the same technique the all-time board uses.
 *
 * Naming note: INF-064 spells the period key `timestamp`, but a leaderboard
 * entry already carries a `timestamp` (the moment the result was completed,
 * AC-131). The period key is therefore spelled `periodTimestamp`; nothing else
 * about INF-064's shape changes.
 *
 * There is **no language dimension** (AC-113, INV-153): `modeKey` is
 * `"<mode>:<mode2>"`.
 */

import { Collection, Document, ObjectId } from "mongodb";
import * as db from "../init/db";
import { matchesAPattern } from "./misc";
import {
  Configuration,
  ValidModeRule,
} from "@croco-calc/schemas/configuration";
import {
  DailyLeaderboardEntry,
  LeaderboardEntry,
} from "@croco-calc/schemas/leaderboards";
import CrocoError from "./error";
import { Mode, Mode2 } from "@croco-calc/schemas/shared";
import {
  getCurrentDayTimestamp,
  MILLISECONDS_IN_DAY,
} from "@croco-calc/util/date-and-time";
import { rowNumberStage } from "../dal/leaderboards";

export const DAILY_LEADERBOARD_COLLECTION = "dailyLeaderboards";

export type DBDailyLeaderboardEntry = DailyLeaderboardEntry & {
  _id: ObjectId;
  /** INF-064's period key — start-of-day UTC, epoch ms. */
  periodTimestamp: number;
  /** `"<mode>:<mode2>"`. */
  modeKey: string;
  /** Drives the TTL index. */
  expiresAt: Date;
};

export const getDailyLeaderboardCollection =
  (): Collection<DBDailyLeaderboardEntry> =>
    db.collection<DBDailyLeaderboardEntry>(DAILY_LEADERBOARD_COLLECTION);

/**
 * Ties break on accuracy and then on who got there first. monkeytype packed the
 * same ordering into a single `kogascore` integer because the sorted set it used
 * has only one dimension; MongoDB can sort on three keys directly, so the
 * encoding is dropped.
 */
const RANK_SORT = { score: -1, acc: -1, timestamp: 1 } as const;

export class DailyLeaderboard {
  private readonly modeRule: ValidModeRule;
  private readonly modeKey: string;
  private readonly customTime: number;

  constructor(modeRule: ValidModeRule, customTime = -1) {
    this.modeRule = modeRule;
    this.modeKey = `${modeRule.mode}:${modeRule.mode2}`;
    this.customTime = customTime;
  }

  public getModeKey(): string {
    return this.modeKey;
  }

  public getPeriodTimestamp(): number {
    return this.customTime === -1 ? getCurrentDayTimestamp() : this.customTime;
  }

  /**
   * Records a result and returns its 1-based rank, or `-1` when the board is
   * disabled.
   *
   * Idempotent by construction (INF-153): the document is keyed on
   * `{ periodTimestamp, modeKey, uid }` and only ever moves **upwards**, so
   * replaying the same submission is a no-op.
   */
  public async addResult(
    entry: DailyLeaderboardEntry,
    dailyLeaderboardsConfig: Configuration["dailyLeaderboards"],
  ): Promise<number> {
    if (!dailyLeaderboardsConfig.enabled) return -1;

    await ensureIndexes();

    const periodTimestamp = this.getPeriodTimestamp();
    const expiresAt = new Date(
      periodTimestamp +
        dailyLeaderboardsConfig.leaderboardExpirationTimeInDays *
          MILLISECONDS_IN_DAY,
    );

    const key = {
      periodTimestamp,
      modeKey: this.modeKey,
      uid: entry.uid,
    };

    const collection = getDailyLeaderboardCollection();

    // Improve an existing entry only when the new score is genuinely better.
    const improved = await collection.updateOne(
      { ...key, score: { $lt: entry.score } },
      { $set: { ...entry, expiresAt } },
    );

    if (improved.matchedCount === 0) {
      // Absent -> insert. Present with an equal or better score -> no-op.
      await collection.updateOne(
        key,
        { $setOnInsert: { ...entry, ...key, expiresAt } },
        { upsert: true },
      );
    }

    const rank = await this.getRank(entry.uid, dailyLeaderboardsConfig);
    return rank?.rank ?? -1;
  }

  public async getResults(
    page: number,
    pageSize: number,
    dailyLeaderboardsConfig: Configuration["dailyLeaderboards"],
    userIds?: string[],
  ): Promise<{
    entries: LeaderboardEntry[];
    count: number;
    minScore: number;
  } | null> {
    if (!dailyLeaderboardsConfig.enabled) return null;

    if (page < 0 || pageSize < 0) {
      throw new CrocoError(500, "Invalid page or pageSize");
    }

    if (userIds?.length === 0) {
      return { entries: [], count: 0, minScore: 0 };
    }

    const { maxResults } = dailyLeaderboardsConfig;
    const isFriends = userIds !== undefined;
    const skip = page * pageSize;

    const ranked = await getDailyLeaderboardCollection()
      .aggregate<DBDailyLeaderboardEntry & { rank: number }>(
        [
          ...this.rankPipeline(maxResults),
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

    const count = await this.count(maxResults, userIds);
    const minScore = await this.getMinScore(maxResults);

    return { entries: ranked.map(toEntry), count, minScore };
  }

  public async getRank(
    uid: string,
    dailyLeaderboardsConfig: Configuration["dailyLeaderboards"],
    userIds?: string[],
  ): Promise<LeaderboardEntry | null> {
    if (!dailyLeaderboardsConfig.enabled) return null;
    if (userIds?.length === 0) return null;

    const { maxResults } = dailyLeaderboardsConfig;
    const isFriends = userIds !== undefined;

    const results = await getDailyLeaderboardCollection()
      .aggregate<DBDailyLeaderboardEntry & { rank: number }>(
        [
          ...this.rankPipeline(maxResults),
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

  /**
   * AC-130: the cutoff a new entry has to beat, i.e. the score of the last row
   * of a **full** board. A board that has not filled up has no cutoff.
   */
  private async getMinScore(maxResults: number): Promise<number> {
    const last = await getDailyLeaderboardCollection()
      .aggregate<DBDailyLeaderboardEntry>(
        [
          { $match: this.periodMatch() },
          { $sort: RANK_SORT },
          { $skip: Math.max(maxResults - 1, 0) },
          { $limit: 1 },
        ],
        { allowDiskUse: true },
      )
      .toArray();

    return last[0]?.score ?? 0;
  }

  private async count(maxResults: number, userIds?: string[]): Promise<number> {
    const result = await getDailyLeaderboardCollection()
      .aggregate<{ total: number }>(
        [
          { $match: this.periodMatch() },
          { $sort: RANK_SORT },
          { $limit: maxResults },
          ...(userIds !== undefined
            ? [{ $match: { uid: { $in: userIds } } }]
            : []),
          { $count: "total" },
        ],
        { allowDiskUse: true },
      )
      .toArray();
    return result[0]?.total ?? 0;
  }

  private periodMatch(): Document {
    return {
      periodTimestamp: this.getPeriodTimestamp(),
      modeKey: this.modeKey,
    };
  }

  /** Rank over the whole board, then cap it at `maxResults` (INF-064). */
  private rankPipeline(maxResults: number): Document[] {
    return [
      { $match: this.periodMatch() },
      // Not `$documentNumber`: MongoDB rejects every rank-type window operator
      // unless `sortBy` has exactly one element, and `RANK_SORT` has three.
      // See `rowNumberStage`.
      rowNumberStage(RANK_SORT),
      // `$setWindowFields` computes in sort order but does not promise to emit
      // in it, and `$limit` below is order-sensitive.
      { $sort: { rank: 1 } },
      { $limit: maxResults },
    ];
  }

  public getModeRule(): ValidModeRule {
    return this.modeRule;
  }
}

function toEntry(
  doc: DBDailyLeaderboardEntry & { rank: number; friendsRank?: number },
): LeaderboardEntry {
  return {
    score: doc.score,
    correct: doc.correct,
    wrong: doc.wrong,
    acc: doc.acc,
    tpm: doc.tpm,
    timestamp: doc.timestamp,
    uid: doc.uid,
    name: doc.name,
    rank: doc.rank,
    ...(doc.friendsRank !== undefined ? { friendsRank: doc.friendsRank } : {}),
  };
}

export async function purgeUserFromDailyLeaderboards(
  uid: string,
  configuration: Configuration["dailyLeaderboards"],
): Promise<void> {
  if (!configuration.enabled) return;
  await getDailyLeaderboardCollection().deleteMany({ uid });
}

function isValidModeRule(
  modeRule: ValidModeRule,
  modeRules: ValidModeRule[],
): boolean {
  const { mode, mode2 } = modeRule;

  return modeRules.some((rule) => {
    return (
      matchesAPattern(mode, rule.mode) && matchesAPattern(mode2, rule.mode2)
    );
  });
}

export function getDailyLeaderboard(
  mode: Mode,
  mode2: Mode2<Mode>,
  dailyLeaderboardsConfig: Configuration["dailyLeaderboards"],
  customTimestamp = -1,
): DailyLeaderboard | null {
  const { validModeRules, enabled } = dailyLeaderboardsConfig;

  const modeRule: ValidModeRule = { mode, mode2 };
  const isValidMode = isValidModeRule(modeRule, validModeRules);

  if (!enabled || !isValidMode) {
    return null;
  }

  return new DailyLeaderboard(modeRule, customTimestamp);
}

/**
 * INF-064's indexes. The TTL index drops a period's rows
 * `leaderboardExpirationTimeInDays` after that period started, so the collection
 * cannot grow without bound.
 */
export async function createIndicies(): Promise<void> {
  const collection = getDailyLeaderboardCollection();
  await collection.createIndex(
    { periodTimestamp: 1, modeKey: 1, score: -1 },
    { name: "daily_lb_rank" },
  );
  await collection.createIndex(
    { periodTimestamp: 1, modeKey: 1, uid: 1 },
    { name: "daily_lb_key", unique: true },
  );
  await collection.createIndex(
    { expiresAt: 1 },
    { name: "daily_lb_ttl", expireAfterSeconds: 0 },
  );
}

/**
 * `daily_lb_key`'s uniqueness is what makes `addResult` idempotent under
 * concurrency (INF-153) and the TTL index is what stops the collection growing
 * without bound. Neither can be assumed: boot-time index creation lives in
 * `server.ts`, which this package does not own. The write path therefore ensures
 * its own preconditions, memoised to one round-trip per process.
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
