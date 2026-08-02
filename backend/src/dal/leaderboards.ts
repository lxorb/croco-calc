import * as db from "../init/db";
import Logger from "../utils/logger";
import { performance } from "perf_hooks";
import { isDevEnvironment } from "../utils/misc";
import {
  getCachedConfiguration,
  getLiveConfiguration,
} from "../init/configuration";

import { addLog } from "./logs";
import { Collection, Document, ObjectId } from "mongodb";
import { LeaderboardEntry } from "@croco-calc/schemas/leaderboards";
import { LEADERBOARD_TIMES } from "@croco-calc/schemas/math";
import { DBUser, getUsersCollection } from "./user";
import CrocoError from "../utils/error";
import { aggregateWithAcceptedConnections } from "./connections";
import { PublicScoreStatsDB } from "./public";

export type DBLeaderboardEntry = LeaderboardEntry & {
  _id: ObjectId;
};

/**
 * There is **no language dimension** anywhere in croco calc (AC-113, INV-153):
 * a board is identified by `(mode, mode2)` alone, and `mode2` is restricted to
 * `"4"` and `"8"` (SB-176).
 */
export type LeaderboardKey = {
  mode: string;
  mode2: string;
};

function getCollectionName(mode: string, mode2: string): string {
  return `leaderboards.${mode}.${mode2}`;
}

export const getCollection = (
  mode: string,
  mode2: string,
): Collection<DBLeaderboardEntry> =>
  db.collection<DBLeaderboardEntry>(getCollectionName(mode, mode2));

/** The `lbPersonalBests` path this board is rebuilt from. */
function personalBestKey(mode: string, mode2: string): string {
  return `lbPersonalBests.${mode}.${mode2}`;
}

export async function get(
  mode: string,
  mode2: string,
  page: number,
  pageSize: number,
  uid?: string,
): Promise<DBLeaderboardEntry[] | false> {
  if (page < 0 || pageSize < 0) {
    throw new CrocoError(500, "Invalid page or pageSize");
  }

  const skip = page * pageSize;
  const limit = pageSize;

  let leaderboard: DBLeaderboardEntry[] | false = [];

  const pipeline: Document[] = [
    { $sort: { rank: 1 } },
    { $skip: skip },
    { $limit: limit },
  ];

  try {
    if (uid !== undefined) {
      leaderboard = await aggregateWithAcceptedConnections(
        {
          uid,
          collectionName: getCollectionName(mode, mode2),
        },
        [
          {
            $setWindowFields: {
              sortBy: { rank: 1 },
              output: { friendsRank: { $documentNumber: {} } },
            },
          },
          ...pipeline,
        ],
      );
    } else {
      leaderboard = await getCollection(mode, mode2)
        .aggregate<DBLeaderboardEntry>(pipeline)
        .toArray();
    }
    return leaderboard;
  } catch (e) {
    // oxlint-disable-next-line no-unsafe-member-access
    if (e.error === 175) {
      //QueryPlanKilled, collection was removed during the query
      return false;
    }
    throw e;
  }
}

const cachedCounts = new Map<string, number>();

export async function getCount(
  mode: string,
  mode2: string,
  uid?: string,
): Promise<number> {
  const key = `${mode}_${mode2}`;
  if (uid === undefined && cachedCounts.has(key)) {
    return cachedCounts.get(key) as number;
  } else {
    if (uid === undefined) {
      const count = await getCollection(mode, mode2).estimatedDocumentCount();
      cachedCounts.set(key, count);
      return count;
    } else {
      const result = await aggregateWithAcceptedConnections<{
        total: number;
      }>(
        {
          collectionName: getCollectionName(mode, mode2),
          uid,
        },
        [{ $count: "total" }],
      );
      return result[0]?.total ?? 0;
    }
  }
}

export async function getRank(
  mode: string,
  mode2: string,
  uid: string,
  friendsOnly: boolean = false,
): Promise<DBLeaderboardEntry | null | false> {
  try {
    if (!friendsOnly) {
      return await getCollection(mode, mode2).findOne({ uid });
    } else {
      const results =
        await aggregateWithAcceptedConnections<DBLeaderboardEntry>(
          {
            collectionName: getCollectionName(mode, mode2),
            uid,
          },
          [
            {
              $setWindowFields: {
                sortBy: { rank: 1 },
                output: { friendsRank: { $documentNumber: {} } },
              },
            },
            { $match: { uid } },
          ],
        );
      return results[0] ?? null;
    }
  } catch (e) {
    // oxlint-disable-next-line no-unsafe-member-access
    if (e.error === 175) {
      //QueryPlanKilled, collection was removed during the query
      return false;
    }
    throw e;
  }
}

/**
 * Rebuild one all-time board (AC-119).
 *
 * Two deliberate divergences from monkeytype, both forced by MongoDB Atlas M0:
 *
 *  * the rank was assigned by a `$function` stage holding a mutable `row_number`
 *    in server-side JavaScript. Server-side JS is **disabled** on M0 and on
 *    Atlas Flex, so it is replaced with `$setWindowFields` + `$documentNumber`,
 *    which is the technique INF-064 mandates and which the friends-only paths
 *    above already use.
 *  * the score histogram was written with `$merge`. It is now read back and
 *    written with an ordinary upsert, so the whole pipeline needs nothing beyond
 *    `$out` — see the note on `updateScoreHistogram` below.
 *
 * The rebuild is idempotent: `$out` atomically replaces the target collection,
 * so running the job twice over the same period leaves identical state
 * (INF-153).
 */
export async function update(
  mode: string,
  mode2: string,
): Promise<{
  message: string;
  rank?: number;
}> {
  const key = personalBestKey(mode, mode2);
  const lbCollectionName = getCollectionName(mode, mode2);
  const minTimeSpent = (await getCachedConfiguration(true)).leaderboards
    .minTimeSpent;

  const sortOrder = {
    [`${key}.score`]: -1,
    [`${key}.acc`]: -1,
    [`${key}.timestamp`]: -1,
  } as const;

  const lb = db.collection<DBUser>("users").aggregate<LeaderboardEntry>(
    [
      {
        $match: {
          // `score` may legitimately be negative or zero, so unlike monkeytype's
          // `wpm > 0` the only real condition is that a default-settings PB
          // exists for this board at all.
          [`${key}.timestamp`]: {
            $gt: 0,
          },
          banned: {
            $ne: true,
          },
          lbOptOut: {
            $ne: true,
          },
          needsToChangeName: {
            $ne: true,
          },
          timeSpent: {
            $gt: isDevEnvironment() ? 0 : minTimeSpent,
          },
        },
      },
      { $sort: sortOrder },
      {
        $setWindowFields: {
          sortBy: sortOrder,
          output: { rank: { $documentNumber: {} } },
        },
      },
      {
        $replaceWith: {
          score: `$${key}.score`,
          correct: `$${key}.correct`,
          wrong: `$${key}.wrong`,
          acc: `$${key}.acc`,
          tpm: `$${key}.tpm`,
          timestamp: `$${key}.timestamp`,
          uid: "$uid",
          name: "$name",
          rank: "$rank",
        },
      },
      { $out: lbCollectionName },
    ],
    { allowDiskUse: true },
  );

  const start1 = performance.now();
  await lb.toArray();
  const end1 = performance.now();

  const start2 = performance.now();
  await db.collection(lbCollectionName).createIndex({ uid: -1 });
  await db.collection(lbCollectionName).createIndex({ rank: 1 });
  const end2 = performance.now();

  cachedCounts.delete(`${mode}_${mode2}`);

  const start3 = performance.now();
  await updateScoreHistogram(mode, mode2);
  const end3 = performance.now();

  const timeToRunAggregate = (end1 - start1) / 1000;
  const timeToRunIndex = (end2 - start2) / 1000;
  const timeToSaveHistogram = (end3 - start3) / 1000;

  void addLog(
    `system_lb_update_${mode}_${mode2}`,
    `Aggregate ${timeToRunAggregate}s, index ${timeToRunIndex}s, histogram ${timeToSaveHistogram}s`,
  );

  return {
    message: "Successfully updated leaderboard",
  };
}

/** AC-090: buckets of 10 score points. */
export const SCORE_HISTOGRAM_BUCKET_SIZE = 10;

/**
 * The site-wide score histogram behind `GET /public/scoreHistogram`.
 *
 * monkeytype folded this into the leaderboard pipeline with `$merge` into the
 * `public` collection. `$merge` is one of the stages whose availability on the
 * shared Atlas tiers is not guaranteed, and it buys nothing here — the result is
 * a single small document — so the buckets are read back and upserted normally.
 * Nothing in this file now depends on `$merge`, `$function`, `$accumulator`,
 * `$where` or mapReduce.
 *
 * **The bucket range is deliberately unbounded above.** monkeytype used a fixed
 * `$bucket` with 32 boundaries of 10 (0 … 310) plus a `default: "other"` bin,
 * because 310 comfortably covers every realistic **wpm**. `score` is
 * `correct - wrong` over a run of up to eight minutes: ME-179's own ceiling
 * (`MAX_PLAUSIBLE_TPM = 120`) admits 960 answers, and a plausible 45 tpm × 8 min
 * already lands near 340. Carrying the 310 boundary over would have silently
 * deleted every strong player from the chart — the BL-5 failure mode (a
 * typing-shaped constant applied to a different metric) repeated. So the bucket
 * index is computed arithmetically instead of enumerated, and no upper bound
 * exists to fall off.
 *
 * Scores below zero are folded into the `0` bucket rather than dropped:
 * `ScoreHistogramSchema` keys are `/^\d+$/` (`packages/schemas/src/util.ts`), so
 * a negative key could not be represented, and losing those users would be the
 * same bug at the other end of the axis.
 */
async function updateScoreHistogram(
  mode: string,
  mode2: string,
): Promise<void> {
  const buckets = await getCollection(mode, mode2)
    .aggregate<{ _id: number; count: number }>(
      [
        {
          $group: {
            _id: {
              $multiply: [
                {
                  $floor: {
                    $divide: [
                      { $max: ["$score", 0] },
                      SCORE_HISTOGRAM_BUCKET_SIZE,
                    ],
                  },
                },
                SCORE_HISTOGRAM_BUCKET_SIZE,
              ],
            },
            count: { $sum: 1 },
          },
        },
      ],
      { allowDiskUse: true },
    )
    .toArray();

  const histogram: Record<string, number> = {};
  for (const bucket of buckets) {
    // A `$group` over the same key can only emit one document per bucket, so
    // this never merges counts — but it is written as an add so a future change
    // to the key expression cannot silently drop a bin.
    const key = bucket._id.toString();
    histogram[key] = (histogram[key] ?? 0) + bucket.count;
  }

  const statsKey = `${mode}_${mode2}` as keyof PublicScoreStatsDB;
  await db
    .collection<PublicScoreStatsDB>("public")
    .updateOne(
      { _id: "scoreStatsHistogram" },
      { $set: { [statsKey]: histogram } },
      { upsert: true },
    );
}

async function createIndex(
  key: string,
  minTimeSpent: number,
  dropIfMismatch = true,
): Promise<void> {
  const index = {
    [`${key}.score`]: -1,
    [`${key}.acc`]: -1,
    [`${key}.timestamp`]: -1,
    [`${key}.tpm`]: -1,
    banned: 1,
    lbOptOut: 1,
    needsToChangeName: 1,
    timeSpent: 1,
    uid: 1,
    name: 1,
  };
  const partial = {
    partialFilterExpression: {
      [`${key}.timestamp`]: {
        $gt: 0,
      },
      timeSpent: {
        $gt: minTimeSpent,
      },
    },
  };
  try {
    await getUsersCollection().createIndex(index, partial);
  } catch (e) {
    if (!dropIfMismatch) throw e;
    if (
      (e as Error).message.startsWith(
        "An existing index has the same name as the requested index",
      )
    ) {
      Logger.warning(`Index ${key} not matching, dropping and recreating...`);

      const existingIndex = (await getUsersCollection().listIndexes().toArray())
        // oxlint-disable-next-line no-unsafe-member-access
        .map((it) => it.name as string)
        .find((it) => it.startsWith(key));

      if (existingIndex !== undefined && existingIndex !== null) {
        await getUsersCollection().dropIndex(existingIndex);
        return createIndex(key, minTimeSpent, false);
      } else {
        throw e;
      }
    }
  }
}

export async function createIndicies(): Promise<void> {
  const minTimeSpent = (await getLiveConfiguration()).leaderboards.minTimeSpent;
  for (const time of LEADERBOARD_TIMES) {
    await createIndex(personalBestKey("time", `${time}`), minTimeSpent);
  }

  if (isDevEnvironment()) {
    Logger.info("Updating leaderboards in dev mode...");
    for (const time of LEADERBOARD_TIMES) {
      await update("time", `${time}`);
    }
  }
}
