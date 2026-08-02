import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ObjectId } from "mongodb";
import * as DB from "../../../src/init/db";
import * as JobLock from "../../../src/jobs/job-lock";
import type { DBJobLock } from "../../../src/jobs/job-lock";

/**
 * INF-151 … INF-155, and DoD-50.
 *
 * Removing the job queue (C23, INF-063) removed the only thing that guaranteed a
 * single consumer, while INF-036 lets Azure Container Apps scale to
 * `maxReplicas = 3`. INF-155 is explicit that `minReplicas = 1` stops being
 * load-bearing for job correctness **only once these tests exist** — until then
 * the entire safety argument for `maxReplicas = 3` rests on an untested file.
 *
 * INF-154 requires two acceptance tests, both here:
 *   (a) three runners against one Mongo, same job, simultaneously — exactly one
 *       does the work, and the resulting state equals the single-runner state;
 *   (b) the same job run again over the same `periodKey` — byte-identical state.
 * DoD-50 adds the INF-152 stale-lock reclaim.
 *
 * **Three replicas, honestly.** `REPLICA_ID` is a module-level constant — one
 * process is one replica — and `releaseLock`/`heartbeat` filter on it. Sharing
 * one module instance across three "runners" would test a weaker thing than the
 * deployment does, so each runner below is a genuinely separate module instance
 * obtained through `vi.resetModules()`, with its own `REPLICA_ID`, all pointed
 * at the same Mongo. That is the same shape as three containers.
 */

const JOB = "test-job";

type JobLockModule = typeof JobLock;

async function spawnReplicas(count: number): Promise<JobLockModule[]> {
  const replicas: JobLockModule[] = [];
  for (let i = 0; i < count; i++) {
    vi.resetModules();
    replicas.push(await import("../../../src/jobs/job-lock.js"));
  }
  return replicas;
}

const locks = (): ReturnType<typeof DB.collection<DBJobLock>> =>
  DB.collection<DBJobLock>(JobLock.JOB_LOCK_COLLECTION);

/** Everything the lock owns, in a form two runs can be compared byte for byte. */
async function snapshot(collectionName: string): Promise<string> {
  const docs = await DB.collection(collectionName)
    .find({})
    .sort({ _id: 1 })
    .toArray();
  return JSON.stringify(docs);
}

beforeEach(async () => {
  await DB.collection(JobLock.JOB_LOCK_COLLECTION).deleteMany({});
  await DB.collection("jobWork").deleteMany({});
  JobLock.__testing.resetIndexMemo();
});

afterEach(async () => {
  vi.resetModules();
});

describe("INF-151 — the lock document and its indexes", () => {
  it("creates a unique index on { jobName, periodKey }", async () => {
    await JobLock.ensureIndexes();
    const indexes = await locks().indexes();
    const key = indexes.find((i) => i["name"] === "job_lock_key");
    expect(key).toBeDefined();
    expect(key?.["key"]).toEqual({ jobName: 1, periodKey: 1 });
    expect(key?.["unique"]).toBe(true);
  });

  it("creates a 24 h TTL index on acquiredAt so locks cannot accumulate", async () => {
    await JobLock.ensureIndexes();
    const indexes = await locks().indexes();
    const ttl = indexes.find((i) => i["name"] === "job_lock_ttl");
    expect(ttl).toBeDefined();
    expect(ttl?.["key"]).toEqual({ acquiredAt: 1 });
    expect(ttl?.["expireAfterSeconds"]).toBe(24 * 60 * 60);
    expect(JobLock.LOCK_TTL_SECONDS).toBe(86400);
  });

  it("writes the required fields", async () => {
    expect(await JobLock.acquireLock(JOB, "p1")).toBe(true);
    const doc = await locks().findOne({ jobName: JOB, periodKey: "p1" });
    expect(doc).toMatchObject({
      jobName: JOB,
      periodKey: "p1",
      state: "running",
      replicaId: JobLock.REPLICA_ID,
    });
    expect(doc?.acquiredAt).toBeInstanceOf(Date);
    expect(doc?.heartbeatAt).toBeInstanceOf(Date);
  });

  it("grants the occurrence to exactly one caller", async () => {
    expect(await JobLock.acquireLock(JOB, "p1")).toBe(true);
    expect(await JobLock.acquireLock(JOB, "p1")).toBe(false);
    expect(await locks().countDocuments({ jobName: JOB })).toBe(1);
  });

  it("does not confuse two occurrences of the same job", async () => {
    expect(await JobLock.acquireLock(JOB, "p1")).toBe(true);
    expect(await JobLock.acquireLock(JOB, "p2")).toBe(true);
  });

  it("does not confuse two jobs sharing a periodKey", async () => {
    expect(await JobLock.acquireLock("job-a", "p1")).toBe(true);
    expect(await JobLock.acquireLock("job-b", "p1")).toBe(true);
  });

  /**
   * The mechanism rests entirely on `insertOne` raising duplicate-key, which it
   * only does once the unique index exists. Without it every insert succeeds and
   * the lock fails **open** — the one failure mode INF-151 exists to prevent.
   */
  it("fails closed: acquisition creates its own index precondition", async () => {
    await locks().dropIndexes();
    JobLock.__testing.resetIndexMemo();
    expect(await JobLock.acquireLock(JOB, "p1")).toBe(true);
    expect(await JobLock.acquireLock(JOB, "p1")).toBe(false);
  });
});

describe("INF-152 — stale-lock reclaim (crash recovery)", () => {
  it("reclaims a running lock whose heartbeat is older than ten minutes", async () => {
    const stale = new Date(Date.now() - JobLock.STALE_LOCK_MS - 1000);
    await locks().insertOne({
      _id: new ObjectId(),
      jobName: JOB,
      periodKey: "p1",
      acquiredAt: stale,
      replicaId: "a-replica-that-died",
      state: "running",
      heartbeatAt: stale,
    });
    await JobLock.ensureIndexes();

    expect(await JobLock.acquireLock(JOB, "p1")).toBe(true);

    const doc = await locks().findOne({ jobName: JOB, periodKey: "p1" });
    expect(doc?.replicaId).toBe(JobLock.REPLICA_ID);
    expect(doc?.heartbeatAt.getTime()).toBeGreaterThan(stale.getTime());
    // Still exactly one document — reclaim re-stamps, it does not duplicate.
    expect(await locks().countDocuments({ jobName: JOB })).toBe(1);
  });

  it("does not reclaim a lock whose heartbeat is fresh", async () => {
    const recent = new Date(Date.now() - JobLock.STALE_LOCK_MS + 60_000);
    await locks().insertOne({
      _id: new ObjectId(),
      jobName: JOB,
      periodKey: "p1",
      acquiredAt: recent,
      replicaId: "a-live-replica",
      state: "running",
      heartbeatAt: recent,
    });
    await JobLock.ensureIndexes();

    expect(await JobLock.acquireLock(JOB, "p1")).toBe(false);
    const doc = await locks().findOne({ jobName: JOB, periodKey: "p1" });
    expect(doc?.replicaId).toBe("a-live-replica");
  });

  it("never reclaims a finished occurrence, however old", async () => {
    // This is the idempotency boundary: `done` means the work happened.
    const ancient = new Date(Date.now() - 10 * JobLock.STALE_LOCK_MS);
    for (const state of ["done", "failed"] as const) {
      await locks().deleteMany({});
      await locks().insertOne({
        _id: new ObjectId(),
        jobName: JOB,
        periodKey: "p1",
        acquiredAt: ancient,
        replicaId: "someone-else",
        state,
        heartbeatAt: ancient,
      });
      expect(await JobLock.acquireLock(JOB, "p1"), state).toBe(false);
    }
  });

  it("heartbeat refreshes the timestamp so a long job is not reclaimed", async () => {
    await JobLock.acquireLock(JOB, "p1", new Date(Date.now() - 60_000));
    const before = await locks().findOne({ jobName: JOB, periodKey: "p1" });
    await JobLock.heartbeat(JOB, "p1");
    const after = await locks().findOne({ jobName: JOB, periodKey: "p1" });
    expect(after?.heartbeatAt.getTime()).toBeGreaterThan(
      before?.heartbeatAt.getTime() ?? 0,
    );
  });

  it("heartbeats only its own lock", async () => {
    const stale = new Date(Date.now() - 60_000);
    await locks().insertOne({
      _id: new ObjectId(),
      jobName: JOB,
      periodKey: "p1",
      acquiredAt: stale,
      replicaId: "someone-else",
      state: "running",
      heartbeatAt: stale,
    });
    await JobLock.heartbeat(JOB, "p1");
    const doc = await locks().findOne({ jobName: JOB, periodKey: "p1" });
    expect(doc?.heartbeatAt.getTime()).toBe(stale.getTime());
  });

  it("STALE_LOCK_MS is the ten minutes INF-152 names", () => {
    expect(JobLock.STALE_LOCK_MS).toBe(10 * 60 * 1000);
    expect(JobLock.HEARTBEAT_INTERVAL_MS).toBeLessThan(JobLock.STALE_LOCK_MS);
  });
});

describe("withJobLock", () => {
  it("runs the work and marks the occurrence done", async () => {
    const work = vi.fn(async () => {
      await DB.collection("jobWork").insertOne({ _id: new ObjectId() });
    });
    expect(await JobLock.withJobLock(JOB, "p1", work)).toBe(true);
    expect(work).toHaveBeenCalledTimes(1);
    const doc = await locks().findOne({ jobName: JOB, periodKey: "p1" });
    expect(doc?.state).toBe("done");
  });

  it("marks the occurrence failed and rethrows when the work throws", async () => {
    await expect(
      JobLock.withJobLock(JOB, "p1", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    const doc = await locks().findOne({ jobName: JOB, periodKey: "p1" });
    expect(doc?.state).toBe("failed");
  });

  it("returns false without running the work when another replica owns it", async () => {
    await JobLock.acquireLock(JOB, "p1");
    const work = vi.fn(async () => undefined);
    expect(await JobLock.withJobLock(JOB, "p1", work)).toBe(false);
    expect(work).not.toHaveBeenCalled();
  });
});

describe("INF-154(a) — three concurrent runners over one Mongo", () => {
  it("exactly one replica does the work", async () => {
    const replicas = await spawnReplicas(3);
    // Genuinely three replicas, not three calls from one.
    expect(new Set(replicas.map((r) => r.REPLICA_ID)).size).toBe(3);

    const calls: string[] = [];
    const work = async (id: string): Promise<void> => {
      calls.push(id);
      await DB.collection("jobWork").insertOne({
        _id: new ObjectId(),
        by: id,
      } as never);
    };

    const outcomes = await Promise.all(
      replicas.map(async (replica, i) =>
        replica.withJobLock(JOB, "2026-08-02", async () =>
          work(`replica-${i}`),
        ),
      ),
    );

    expect(outcomes.filter(Boolean)).toHaveLength(1);
    expect(calls).toHaveLength(1);
    expect(await DB.collection("jobWork").countDocuments({})).toBe(1);
    expect(await locks().countDocuments({ jobName: JOB })).toBe(1);
  });

  it("the resulting state equals the single-runner state", async () => {
    const insertOne = async (): Promise<void> => {
      await DB.collection("jobWork").insertOne({
        _id: new ObjectId("aaaaaaaaaaaaaaaaaaaaaaaa"),
        n: 1,
      } as never);
    };

    const single = await spawnReplicas(1);
    await (single[0] as JobLockModule).withJobLock(
      JOB,
      "2026-08-02",
      insertOne,
    );
    const singleRunnerState = await snapshot("jobWork");

    await DB.collection("jobWork").deleteMany({});
    await locks().deleteMany({});

    const replicas = await spawnReplicas(3);
    await Promise.all(
      replicas.map(async (replica) =>
        replica.withJobLock(JOB, "2026-08-02", insertOne),
      ),
    );

    expect(await snapshot("jobWork")).toBe(singleRunnerState);
  });

  it("scales: ten runners still produce exactly one unit of work", async () => {
    const replicas = await spawnReplicas(10);
    let ran = 0;
    const outcomes = await Promise.all(
      replicas.map(async (replica) =>
        replica.withJobLock(JOB, "2026-08-02", async () => {
          ran += 1;
        }),
      ),
    );
    expect(outcomes.filter(Boolean)).toHaveLength(1);
    expect(ran).toBe(1);
  });
});

describe("INF-154(b) / INF-153 — re-running the same periodKey", () => {
  it("is a no-op and leaves the collections byte-identical", async () => {
    const work = vi.fn(async () => {
      await DB.collection("jobWork").insertOne({
        _id: new ObjectId("bbbbbbbbbbbbbbbbbbbbbbbb"),
      });
    });

    expect(await JobLock.withJobLock(JOB, "2026-08-02", work)).toBe(true);
    const afterFirst = await snapshot("jobWork");
    const locksAfterFirst = await snapshot(JobLock.JOB_LOCK_COLLECTION);

    expect(await JobLock.withJobLock(JOB, "2026-08-02", work)).toBe(false);

    expect(work).toHaveBeenCalledTimes(1);
    expect(await snapshot("jobWork")).toBe(afterFirst);
    expect(await snapshot(JobLock.JOB_LOCK_COLLECTION)).toBe(locksAfterFirst);
  });

  it("holds across replicas too — a fresh replica does not redo the work", async () => {
    const [first, second] = await spawnReplicas(2);
    const work = vi.fn(async () => undefined);

    expect(
      await (first as JobLockModule).withJobLock(JOB, "2026-08-02", work),
    ).toBe(true);
    const after = await snapshot(JobLock.JOB_LOCK_COLLECTION);

    expect(
      await (second as JobLockModule).withJobLock(JOB, "2026-08-02", work),
    ).toBe(false);

    expect(work).toHaveBeenCalledTimes(1);
    expect(await snapshot(JobLock.JOB_LOCK_COLLECTION)).toBe(after);
  });

  it("a different periodKey is a different occurrence and does run", async () => {
    const work = vi.fn(async () => undefined);
    expect(await JobLock.withJobLock(JOB, "2026-08-02", work)).toBe(true);
    expect(await JobLock.withJobLock(JOB, "2026-08-03", work)).toBe(true);
    expect(work).toHaveBeenCalledTimes(2);
  });
});

describe("INF-151 — period keys are deterministic identifiers", () => {
  it("dayPeriodKey is the UTC day being processed", () => {
    expect(JobLock.dayPeriodKey(Date.UTC(2026, 7, 2, 0, 0, 5))).toBe(
      "2026-08-02",
    );
    expect(JobLock.dayPeriodKey(Date.UTC(2026, 7, 2, 23, 59, 59))).toBe(
      "2026-08-02",
    );
    expect(JobLock.dayPeriodKey(Date.UTC(2026, 0, 1))).toBe("2026-01-01");
  });

  it("weekPeriodKey is stable across a whole week", () => {
    const monday = Date.UTC(2026, 6, 27);
    const keys = new Set(
      [0, 1, 2, 3, 4, 5, 6].map((d) =>
        JobLock.weekPeriodKey(monday + d * 86_400_000),
      ),
    );
    expect(keys.size).toBe(1);
    expect([...keys][0]).toMatch(/^\d{4}-W\d{2}$/);
    // The next Monday is a different occurrence.
    expect(JobLock.weekPeriodKey(monday + 7 * 86_400_000)).not.toBe(
      [...keys][0],
    );
  });

  it("intervalPeriodKey snaps to the nearest interval boundary", () => {
    const interval = 60_000;
    expect(JobLock.intervalPeriodKey(120_000, interval)).toBe("120000");
    expect(JobLock.intervalPeriodKey(140_000, interval)).toBe("120000");
    expect(JobLock.intervalPeriodKey(160_000, interval)).toBe("180000");
    expect(JobLock.intervalPeriodKey(180_000, interval)).toBe("180000");
  });

  it("consecutive occurrences never collapse onto one key", () => {
    const interval = 15 * 60 * 1000;
    // `update-leaderboards` fires at :14:30, :29:30, :44:30, :59:30.
    const fires = [14.5, 29.5, 44.5, 59.5].map((m) => m * 60_000);
    const keys = fires.map((t) => JobLock.intervalPeriodKey(t, interval));
    expect(new Set(keys).size).toBe(fires.length);
  });

  /**
   * The reason `intervalPeriodKey` rounds rather than flooring. `delete-old-logs`
   * fires on `0 0 0 * * *` with a 24 h interval, so its fire time *is* a grid
   * boundary — under a floor, a replica one millisecond behind lands in
   * yesterday's bucket and the lock fails open.
   */
  it("two replicas straddling a boundary derive the same key", () => {
    const midnight = Date.UTC(2026, 7, 2);
    const day = 24 * 60 * 60 * 1000;
    for (const skew of [-5000, -400, -1, 0, 1, 400, 5000]) {
      expect(
        JobLock.intervalPeriodKey(midnight + skew, day),
        `skew ${skew}`,
      ).toBe(`${midnight}`);
    }
  });

  it("a quarter-hourly job tolerates minutes of clock skew", () => {
    const interval = 15 * 60 * 1000;
    const fire = 29.5 * 60_000;
    const keys = new Set(
      [-60_000, -1000, 0, 1000, 60_000].map((skew) =>
        JobLock.intervalPeriodKey(fire + skew, interval),
      ),
    );
    expect(keys.size).toBe(1);
  });

  it("dayPeriodKey is skew-tolerant away from the day boundary", () => {
    const t = Date.UTC(2026, 7, 2, 0, 5, 0);
    expect(JobLock.dayPeriodKey(t + 400)).toBe(JobLock.dayPeriodKey(t - 400));
  });
});
