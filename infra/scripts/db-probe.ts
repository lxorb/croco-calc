/**
 * INF-058 — MongoDB aggregation compatibility probe.
 *
 * AMENDED 2026-08-02 by user decision ("just host mongodb via azure"). This
 * script no longer decides anything: the old M0-vs-Atlas-Flex fork is gone
 * along with the `mongodbatlas` provider. What it does now is *verify on the
 * live cluster* that Azure DocumentDB (Azure Cosmos DB for MongoDB **vCore**)
 * really executes the aggregation stages croco calc's DAL depends on, rather
 * than trusting a compatibility table.
 *
 * That distinction matters because the vCore engine is a re-implementation of
 * the MongoDB wire protocol, not the MongoDB server — Microsoft states 99.03%
 * compatibility, and the missing 0.97% is exactly the kind of thing that takes
 * leaderboards down in production. The documentation says all five clauses
 * below are supported (see docs/requirements/06-infra-and-ops.md §3 for the
 * citations); this proves it.
 *
 * The clauses, and where each one is load-bearing:
 *
 *   (a) `$setWindowFields` + `$documentNumber` / `$denseRank`
 *         backend/src/dal/leaderboards.ts (all-time board),
 *         backend/src/utils/daily-leaderboards.ts,
 *         backend/src/services/weekly-xp-leaderboard.ts.
 *         This is the single most load-bearing stage in the app: INF-064 moved
 *         the daily and weekly-XP boards off Redis onto it.
 *   (b) `$out`
 *         backend/src/dal/leaderboards.ts:251 — atomically replaces the board
 *         collection, which is what makes the rebuild idempotent (INF-153).
 *   (c) `$lookup` with `let` + a sub-pipeline
 *         backend/src/dal/connections.ts:314 via `includeMetaData`
 *         (backend/src/dal/user.ts:800). The RU-based Cosmos API rejects this
 *         form outright, which is one of the reasons vCore was chosen.
 *   (d) `$bucket`
 *         backend/src/dal/leaderboards.ts — the score histogram. Also
 *         unsupported on the RU API.
 *   (e) `$merge`
 *         NOT used by any production code path any more. The only remaining
 *         caller is backend/src/api/controllers/dev.ts:418, which sits behind
 *         `onlyAvailableOnDev()`. It is probed anyway so that a regression in
 *         support shows up here rather than in a dev tool, but a failure of
 *         this clause alone is a WARNING, not a failure — see EXIT CODES.
 *
 * EXIT CODES
 *   0 -> every required clause ran. The cluster is fit for purpose.
 *   1 -> a REQUIRED clause (a-d) was rejected by the server. Do not deploy;
 *        the leaderboards will break. Escalate — no fallback tier is
 *        pre-approved, and switching engines is a design change.
 *   2 -> DB_URI is not set. Configuration error, no verdict.
 *   3 -> the probe could not run at all (DNS, TLS, auth, timeout, a permission
 *        error on a setup step). Infrastructure fault, NOT a statement about
 *        the engine — fix it and re-run.
 *
 * Usage:
 *   DB_URI="mongodb+srv://…" DB_NAME=crococalc node infra/scripts/db-probe.ts
 *
 * The URI is the Key Vault secret `mongodb-uri`, which Terraform writes. Note
 * that a vCore URI must carry `retrywrites=false`; the Node driver's default
 * retryable writes are rejected by the server.
 */

// `infra/` is not a pnpm workspace package (pnpm-workspace.yaml lists only
// frontend, backend and packages/*), so Node's resolver — which walks up from
// THIS FILE, not from the working directory — never reaches the only copy of
// `mongodb` in the tree, which pnpm installs under backend/node_modules.
// A bare `import { MongoClient } from "mongodb"` therefore dies with
// ERR_MODULE_NOT_FOUND no matter where it is invoked from. Resolve it the way
// the backend package would instead.
import { createRequire } from "node:module";

const requireFromBackend = createRequire(
  new URL("../../backend/package.json", import.meta.url),
);
const { MongoClient } = requireFromBackend(
  "mongodb",
) as typeof import("mongodb");

type Clause = {
  name: string;
  /** Clauses no production code path depends on downgrade to a warning. */
  required: boolean;
  run: (db: import("mongodb").Db, prefix: string) => Promise<void>;
};

const CLAUSES: Clause[] = [
  {
    name: "(a) $setWindowFields ranking",
    required: true,
    run: async (db, prefix) => {
      const ranked = await db
        .collection(`${prefix}_results`)
        .aggregate([
          { $sort: { score: -1 } },
          {
            $setWindowFields: {
              sortBy: { score: -1 },
              output: {
                rank: { $documentNumber: {} },
                denseRank: { $denseRank: {} },
              },
            },
          },
          { $sort: { rank: 1 } },
        ])
        .toArray();

      if (ranked.length !== 3) {
        throw new Error(`expected 3 ranked documents, got ${ranked.length}`);
      }
      const ranks = ranked.map((doc): unknown => doc["rank"]);
      if (JSON.stringify(ranks) !== JSON.stringify([1, 2, 3])) {
        throw new Error(`unexpected ranks: ${JSON.stringify(ranks)}`);
      }
      const dense = ranked.map((doc): unknown => doc["denseRank"]);
      if (JSON.stringify(dense) !== JSON.stringify([1, 2, 3])) {
        throw new Error(`unexpected dense ranks: ${JSON.stringify(dense)}`);
      }
    },
  },
  {
    name: "(b) $out replacing a collection",
    required: true,
    run: async (db, prefix) => {
      const target = `${prefix}_board`;

      // Run it twice: $out's whole value to INF-153 is that the second run
      // replaces rather than appends, which is what makes the leaderboard
      // rebuild idempotent. A $out that appended would still "work" here.
      for (let attempt = 0; attempt < 2; attempt++) {
        await db
          .collection(`${prefix}_results`)
          .aggregate([
            { $project: { _id: 1, uid: 1, score: 1 } },
            { $out: target },
          ])
          .toArray();
      }

      const count = await db.collection(target).countDocuments({});
      if (count !== 3) {
        throw new Error(
          `expected 3 documents after two $out runs, got ${count} — $out is appending, not replacing`,
        );
      }
    },
  },
  {
    name: "(c) $lookup with let + sub-pipeline",
    required: true,
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
  {
    name: "(d) $bucket score histogram",
    required: true,
    run: async (db, prefix) => {
      const buckets = await db
        .collection(`${prefix}_results`)
        .aggregate([
          {
            $bucket: {
              groupBy: "$score",
              boundaries: [0, 150, 300, 450],
              default: "other",
              output: { count: { $sum: 1 } },
            },
          },
        ])
        .toArray();

      if (buckets.length === 0) {
        throw new Error("expected at least one bucket, got none");
      }
    },
  },
  {
    name: "(e) $merge into a second collection (dev-only path)",
    required: false,
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
];

async function main(): Promise<void> {
  const uri = process.env["DB_URI"];
  const dbName = process.env["DB_NAME"] ?? "crococalc";
  if (uri === undefined || uri === "") {
    console.error(
      "DB_URI is not set. Read it from Key Vault secret mongodb-uri:\n" +
        "  az keyvault secret show --vault-name kv-crococalc-prod --name mongodb-uri --query value -o tsv",
    );
    process.exit(2);
  }

  // vCore rejects the driver's default retryable writes. Terraform emits a URI
  // that already disables them; a hand-assembled one may not.
  if (!/retrywrites=false/i.test(uri)) {
    console.warn(
      "WARNING: DB_URI does not contain retrywrites=false. Azure DocumentDB " +
        "(vCore) rejects retryable writes, so writes may fail.",
    );
  }

  const prefix = `__probe_${Date.now()}`;
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 20_000 });
  const failedRequired: string[] = [];
  const failedOptional: string[] = [];

  try {
    await client.connect();
    const db = client.db(dbName);

    // Best effort only. serverStatus is documented as unsupported on vCore, and
    // a banner line must never be the thing that decides a deployment.
    try {
      const build = await db.command({ buildInfo: 1 });
      console.log(`connected to ${dbName}, server version ${build["version"]}`);
    } catch {
      console.log(`connected to ${dbName} (buildInfo not permitted)`);
    }

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
        const message = error instanceof Error ? error.message : String(error);
        if (clause.required) {
          failedRequired.push(clause.name);
          console.error(`FAIL ${clause.name}: ${message}`);
        } else {
          failedOptional.push(clause.name);
          console.warn(`WARN ${clause.name}: ${message}`);
        }
      }
    }

    for (const suffix of ["results", "users", "board", "snapshots"]) {
      await db
        .collection(`${prefix}_${suffix}`)
        .drop()
        .catch(() => undefined);
    }
  } finally {
    await client.close();
  }

  if (failedOptional.length > 0) {
    console.warn(
      `\n${failedOptional.length} optional clause(s) failed: ${failedOptional.join(", ")}\n` +
        "No production code path depends on these, so this is not a deployment " +
        "blocker — but backend/src/api/controllers/dev.ts will not work.",
    );
  }

  if (failedRequired.length === 0) {
    console.log(
      "\nEvery required clause ran. Azure DocumentDB is fit for croco calc's DAL.",
    );
    process.exit(0);
  }

  console.error(
    `\n${failedRequired.length} REQUIRED clause(s) failed: ${failedRequired.join(", ")}\n` +
      "Do NOT deploy: the leaderboards depend on these. No fallback tier is " +
      "pre-approved and no other engine is pre-approved — moving off Azure " +
      "DocumentDB is a design change needing human sign-off.",
  );
  process.exit(1);
}

// Anything that escapes main() is an infrastructure fault, not a verdict on the
// engine. Exit 1 is reserved for "the server rejected a clause"; see the header.
try {
  await main();
} catch (error) {
  console.error(
    `\nThe probe could not run: ${error instanceof Error ? error.message : String(error)}\n` +
      "This is NOT an incompatibility verdict. Check connectivity, credentials " +
      "and the database user's permissions, then run it again.",
  );
  process.exit(3);
}
