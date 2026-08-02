/**
 * INF-058 — MongoDB compatibility probe.
 *
 * The whole M0-vs-Flex decision hangs on three aggregation features croco calc
 * inherits from monkeytype's DAL:
 *
 *   (a) `$setWindowFields` — ranking, used by the all-time leaderboard and by
 *       the MongoDB re-implementation of the daily/weekly leaderboards
 *       (INF-064).
 *   (b) `$merge`          — writing a rank snapshot into another collection.
 *                           This is the clause most likely to fail: `$merge`
 *                           is a documented restriction area on Atlas free and
 *                           shared tiers, which makes the Flex fallback the
 *                           expected path rather than a remote contingency.
 *   (c) `$lookup` with a sub-pipeline — used by the connections DAL.
 *
 * Outcome is a decision, not a discussion (INF-058):
 *   exit 0 -> Atlas M0 stays.
 *   exit 1 -> set `mongodb_tier = "FLEX"` in prod/terraform.tfvars, update the
 *             cost table in docs/RUNBOOK.md (INF-058a), then apply. No third
 *             option is pre-approved; if Flex also fails, that is a hard stop
 *             requiring human sign-off.
 *
 * Usage:
 *   DB_URI="mongodb+srv://…" DB_NAME=crococalc node infra/scripts/db-probe.ts
 *
 * BLOCKER BL-4: this cannot be run until an Atlas organisation, an API key pair
 * and a cluster exist. `terraform apply` MUST NOT run before it has.
 */

import { MongoClient } from "mongodb";

type Clause = {
  name: string;
  run: (db: import("mongodb").Db, prefix: string) => Promise<void>;
};

const CLAUSES: Clause[] = [
  {
    name: "(a) $setWindowFields rank pipeline",
    run: async (db, prefix) => {
      const results = db.collection(`${prefix}_results`);
      const ranked = await results
        .aggregate([
          { $match: {} },
          {
            $setWindowFields: {
              sortBy: { score: -1 },
              output: { rank: { $denseRank: {} } },
            },
          },
          { $sort: { rank: 1 } },
        ])
        .toArray();
      if (ranked.length !== 3) {
        throw new Error(`expected 3 ranked documents, got ${ranked.length}`);
      }
      const ranks = ranked.map((doc) => doc["rank"]);
      if (JSON.stringify(ranks) !== JSON.stringify([1, 2, 3])) {
        throw new Error(`unexpected ranks: ${JSON.stringify(ranks)}`);
      }
    },
  },
  {
    name: "(b) $merge into a second collection",
    run: async (db, prefix) => {
      await db
        .collection(`${prefix}_results`)
        .aggregate([
          { $project: { _id: 1, uid: 1, score: 1 } },
          {
            $merge: {
              into: `${prefix}_snapshots`,
              on: "_id",
              whenMatched: "replace",
              whenNotMatched: "insert",
            },
          },
        ])
        .toArray();
      const merged = await db
        .collection(`${prefix}_snapshots`)
        .countDocuments({});
      if (merged !== 3) {
        throw new Error(`expected 3 merged documents, got ${merged}`);
      }
    },
  },
  {
    name: "(c) $lookup with a sub-pipeline",
    run: async (db, prefix) => {
      const joined = await db
        .collection(`${prefix}_results`)
        .aggregate([
          {
            $lookup: {
              from: `${prefix}_users`,
              let: { resultUid: "$uid" },
              pipeline: [
                { $match: { $expr: { $eq: ["$uid", "$$resultUid"] } } },
                { $project: { _id: 0, name: 1 } },
              ],
              as: "user",
            },
          },
          { $match: { "user.0": { $exists: true } } },
        ])
        .toArray();
      if (joined.length !== 3) {
        throw new Error(`expected 3 joined documents, got ${joined.length}`);
      }
    },
  },
];

async function main(): Promise<void> {
  const uri = process.env["DB_URI"];
  const dbName = process.env["DB_NAME"] ?? "crococalc";
  if (uri === undefined || uri === "") {
    console.error("DB_URI is not set. Read it from Key Vault secret mongodb-uri.");
    process.exit(2);
  }

  const prefix = `__probe_${Date.now()}`;
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 20_000 });
  const failed: string[] = [];

  try {
    await client.connect();
    const db = client.db(dbName);
    const build = await db.admin().serverStatus();
    console.log(`connected to ${dbName}, server version ${build["version"]}`);

    await db.collection(`${prefix}_results`).insertMany([
      { uid: "u1", score: 300 },
      { uid: "u2", score: 200 },
      { uid: "u3", score: 100 },
    ]);
    await db.collection(`${prefix}_users`).insertMany([
      { uid: "u1", name: "one" },
      { uid: "u2", name: "two" },
      { uid: "u3", name: "three" },
    ]);

    for (const clause of CLAUSES) {
      try {
        await clause.run(db, prefix);
        console.log(`PASS ${clause.name}`);
      } catch (error) {
        failed.push(clause.name);
        console.error(
          `FAIL ${clause.name}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    for (const suffix of ["results", "users", "snapshots"]) {
      await db.collection(`${prefix}_${suffix}`).drop().catch(() => undefined);
    }
  } finally {
    await client.close();
  }

  if (failed.length === 0) {
    console.log("\nAll three clauses passed -> Atlas M0 is the database (INF-057).");
    process.exit(0);
  }

  console.error(
    `\n${failed.length} clause(s) failed: ${failed.join(", ")}\n` +
      'Decision (INF-058): set mongodb_tier = "FLEX" in ' +
      "infra/terraform/prod/terraform.tfvars, update the cost table in " +
      "docs/RUNBOOK.md (INF-058a), then apply.",
  );
  process.exit(1);
}

await main();
