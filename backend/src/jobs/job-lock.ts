/**
 * MongoDB-backed advisory lock for cron jobs (INF-151 … INF-155).
 *
 * Removing the job queue (C23, INF-063) removed the only thing that guaranteed a
 * single consumer, and INF-036 lets Azure Container Apps scale to
 * `maxReplicas = 3`.
 * Without this, `update-leaderboards`, the daily rollover and the weekly rollover
 * would each fire two or three times concurrently — double-awarding XP and
 * corrupting rank snapshots. There is no leader election anywhere else in the
 * design, so this file is it.
 *
 * The contract:
 *  * acquisition is a single `insertOne` against a **unique** index on
 *    `{ jobName, periodKey }` — a duplicate-key error means another replica owns
 *    this occurrence, and the job returns immediately **without logging an
 *    error** (INF-151);
 *  * a lock still `"running"` whose `heartbeatAt` is older than ten minutes is
 *    stale and is reclaimed atomically (INF-152) — this is the crash-recovery
 *    path, without which one replica dying mid-job would block that occurrence
 *    forever;
 *  * a TTL index on `acquiredAt` drops lock documents after 24 h (INF-151).
 *
 * Idempotency is still required **in addition** (INF-153): the lock prevents
 * concurrency, idempotency prevents damage from the retry the lock cannot
 * prevent.
 */

import { randomUUID } from "crypto";
import { Collection, ObjectId } from "mongodb";
import { UTCDate } from "@date-fns/utc";
import * as db from "../init/db";
import Logger from "../utils/logger";
import { getStartOfWeekTimestamp } from "@croco-calc/util/date-and-time";

export const JOB_LOCK_COLLECTION = "jobLocks";

/** INF-152 — a `"running"` lock older than this is reclaimable. */
export const STALE_LOCK_MS = 10 * 60 * 1000;

/** INF-151 — lock documents cannot accumulate. */
export const LOCK_TTL_SECONDS = 24 * 60 * 60;

/** Refresh interval for jobs that can run longer than a minute (INF-152). */
export const HEARTBEAT_INTERVAL_MS = 30 * 1000;

/**
 * MongoDB's duplicate-key code. Hitting it on `insertOne` is the **success**
 * path of the contention case: another replica already owns this occurrence.
 *
 * Narrowed rather than read off an `any`, so acquisition needs no lint escape
 * hatch — and so a driver error with no `code` at all can never be mistaken for
 * contention and swallowed.
 */
const DUPLICATE_KEY_ERROR = 11000;

function isDuplicateKeyError(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    (e as { code?: unknown }).code === DUPLICATE_KEY_ERROR
  );
}

export type JobLockState = "running" | "done" | "failed";

export type DBJobLock = {
  _id: ObjectId;
  jobName: string;
  /** Deterministic identifier of the occurrence being processed. */
  periodKey: string;
  acquiredAt: Date;
  replicaId: string;
  state: JobLockState;
  heartbeatAt: Date;
};

/** Stable for the lifetime of this process; that is exactly one replica. */
export const REPLICA_ID = randomUUID();

export const getJobLockCollection = (): Collection<DBJobLock> =>
  db.collection<DBJobLock>(JOB_LOCK_COLLECTION);

export async function createIndicies(): Promise<void> {
  const collection = getJobLockCollection();
  await collection.createIndex(
    { jobName: 1, periodKey: 1 },
    { name: "job_lock_key", unique: true },
  );
  await collection.createIndex(
    { acquiredAt: 1 },
    { name: "job_lock_ttl", expireAfterSeconds: LOCK_TTL_SECONDS },
  );
}

/**
 * The whole mechanism rests on `insertOne` raising duplicate-key, which it only
 * does once the **unique** index exists. Without the index every replica's
 * insert succeeds and `acquireLock` returns `true` everywhere — the lock would
 * fail *open*, which is the one failure mode INF-151 exists to prevent.
 *
 * Boot-time index creation lives in `server.ts`, which this package does not
 * own, so acquisition ensures its own precondition instead. `createIndex` is
 * idempotent, and the memo collapses it to one round-trip per process; a
 * failure clears the memo so the next occurrence retries rather than inheriting
 * a poisoned promise.
 */
let indexesReady: Promise<void> | undefined;

export async function ensureIndexes(): Promise<void> {
  indexesReady ??= createIndicies().catch((e: unknown) => {
    indexesReady = undefined;
    throw e;
  });
  await indexesReady;
}

/**
 * @returns `true` when this replica owns the occurrence and must do the work.
 */
export async function acquireLock(
  jobName: string,
  periodKey: string,
  now = new Date(),
): Promise<boolean> {
  // Deliberately not caught: a job that cannot prove it is alone MUST NOT run.
  await ensureIndexes();

  const collection = getJobLockCollection();

  try {
    await collection.insertOne({
      _id: new ObjectId(),
      jobName,
      periodKey,
      acquiredAt: now,
      replicaId: REPLICA_ID,
      state: "running",
      heartbeatAt: now,
    });
    return true;
  } catch (e) {
    if (!isDuplicateKeyError(e)) throw e;
  }

  // INF-152 — someone holds it. Reclaim only if their heartbeat has gone stale.
  const staleBefore = new Date(now.getTime() - STALE_LOCK_MS);
  const reclaimed = await collection.findOneAndUpdate(
    {
      jobName,
      periodKey,
      state: "running",
      heartbeatAt: { $lt: staleBefore },
    },
    {
      $set: {
        replicaId: REPLICA_ID,
        acquiredAt: now,
        heartbeatAt: now,
      },
    },
    { returnDocument: "after" },
  );

  if (reclaimed !== null) {
    Logger.warning(
      `Reclaimed stale job lock ${jobName}/${periodKey} from a dead replica`,
    );
    return true;
  }

  // Another replica owns this occurrence, or it is already done. Not an error.
  return false;
}

export async function heartbeat(
  jobName: string,
  periodKey: string,
  now = new Date(),
): Promise<void> {
  await getJobLockCollection().updateOne(
    { jobName, periodKey, replicaId: REPLICA_ID },
    { $set: { heartbeatAt: now } },
  );
}

export async function releaseLock(
  jobName: string,
  periodKey: string,
  state: Exclude<JobLockState, "running">,
  now = new Date(),
): Promise<void> {
  await getJobLockCollection().updateOne(
    { jobName, periodKey, replicaId: REPLICA_ID },
    { $set: { state, heartbeatAt: now } },
  );
}

/**
 * Run `work` exactly once per `(jobName, periodKey)` across all replicas.
 *
 * @returns `true` if this replica did the work, `false` if another replica owns
 * the occurrence (a no-op, not a failure).
 */
export async function withJobLock(
  jobName: string,
  periodKey: string,
  work: () => Promise<void>,
): Promise<boolean> {
  if (!(await acquireLock(jobName, periodKey))) {
    return false;
  }

  const beat = setInterval(() => {
    void heartbeat(jobName, periodKey).catch(() => {
      /* a missed heartbeat is recoverable; a throw from a timer is not */
    });
  }, HEARTBEAT_INTERVAL_MS);
  // Never keep the process alive just to tick a heartbeat.
  beat.unref?.();

  try {
    await work();
    await releaseLock(jobName, periodKey, "done");
    return true;
  } catch (e) {
    await releaseLock(jobName, periodKey, "failed");
    throw e;
  } finally {
    clearInterval(beat);
  }
}

// -- period keys -------------------------------------------------------------
//
// INF-151: "the deterministic identifier of the occurrence being processed".

/** `2026-08-02` — the UTC day a rollover is processing. */
export function dayPeriodKey(timestamp: number): string {
  const date = new UTCDate(timestamp);
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * `2026-W31` — the ISO week a rollover is processing. Derived from the same
 * Monday-based start-of-week helper the weekly board itself uses, so the key and
 * the data can never disagree about which week they mean.
 */
export function weekPeriodKey(timestamp: number): string {
  const weekStart = getStartOfWeekTimestamp(timestamp);
  const date = new UTCDate(weekStart);
  const yearStart = Date.UTC(date.getFullYear(), 0, 1);
  const week = Math.floor((weekStart - yearStart) / (7 * 86400000)) + 1;
  return `${date.getFullYear()}-W${`${week}`.padStart(2, "0")}`;
}

/**
 * The occurrence identifier for a plain recurring job: the run time snapped to
 * the **nearest** multiple of the job's own interval.
 *
 * INF-151 words this as "the floor of the run time to the job's interval", and
 * floor is wrong at exactly the moment it matters. `delete-old-logs` fires on
 * `0 0 0 * * *` with `INTERVAL_MS = 24 h`, so its fire time *is* a grid
 * boundary: a replica whose clock is one millisecond behind floors into
 * yesterday's bucket, derives a different `periodKey`, and both replicas acquire
 * — the lock fails open on the one schedule most likely to hit it.
 * `update-leaderboards` fires 30 s before each 15-minute boundary, so floor
 * gives it 30 s of skew tolerance and no more.
 *
 * Rounding keeps everything INF-151 actually asks for — deterministic, derived
 * from the run time, one key per occurrence — and widens the tolerance to half
 * an interval either side (±7.5 min and ±12 h respectively). It cannot merge two
 * occurrences, because consecutive occurrences are a whole interval apart.
 */
export function intervalPeriodKey(
  timestamp: number,
  intervalMs: number,
): string {
  return `${Math.round(timestamp / intervalMs) * intervalMs}`;
}

export const __testing = {
  REPLICA_ID,
  resetIndexMemo: (): void => {
    indexesReady = undefined;
  },
};
