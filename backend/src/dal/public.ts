import { roundTo2 } from "@croco-calc/util/numbers";
import * as db from "../init/db";
import { TrainingStats, ScoreHistogram } from "@croco-calc/schemas/public";
import { LEADERBOARD_TIMES } from "@croco-calc/schemas/math";

/** SB-176 / CP-137 — the only two durations that have a leaderboard. */
export type LeaderboardTime = (typeof LEADERBOARD_TIMES)[number];

/**
 * CP-135 renames the wire field `timeSpent` → `timeTraining`. The **stored**
 * document keeps `timeSpent`: it is a counter that is only ever `$inc`ed, so
 * renaming the Mongo key would need a migration to buy nothing. `getTrainingStats`
 * maps it on the way out, which is why this type is spelled out here instead of
 * being derived from `TrainingStats`.
 */
export type PublicTrainingStatsDB = {
  _id: "stats";
  /** seconds; serialised as `timeTraining` (CP-135). */
  timeSpent: number;
  testsCompleted: number;
  testsStarted: number;
};

/**
 * AC-090: the histogram is bucketed by score and keyed by the leaderboard
 * duration only — there is no language axis (INV-153) and no `mode` axis, since
 * `mode` is always `time` (CP-137).
 */
export type PublicScoreStatsDB = {
  _id: "scoreStatsHistogram";
  time_4: ScoreHistogram;
  time_8: ScoreHistogram;
};

export async function updateStats(
  restartCount: number,
  time: number,
): Promise<boolean> {
  await db.collection<PublicTrainingStatsDB>("public").updateOne(
    { _id: "stats" },
    {
      $inc: {
        testsCompleted: 1,
        testsStarted: restartCount + 1,
        timeSpent: roundTo2(time),
      },
    },
    { upsert: true },
  );
  return true;
}

/** Get the histogram of score buckets for all users.
 * @returns an object mapping score => count, eg { '80': 4388, '90': 2149}
 */
export async function getScoreHistogram(
  time: LeaderboardTime,
): Promise<ScoreHistogram> {
  const key = `time_${time}` as const satisfies keyof PublicScoreStatsDB;

  const stats = await db
    .collection<PublicScoreStatsDB>("public")
    .findOne({ _id: "scoreStatsHistogram" }, { projection: { [key]: 1 } });

  return stats?.[key] ?? {};
}

/**
 * CP-135 — site-wide training stats behind `GET /public/trainingStats`.
 * Returns the wire shape, not the stored one.
 *
 * "No test has ever been completed" is a legitimate state, not an error: the
 * counter document is only created by the first `updateStats` upsert. monkeytype
 * threw a 404 here, which made the CP-134 hero fail on a fresh database. Zeros
 * are the honest answer and match the sibling `getScoreHistogram`, which already
 * degrades to an empty histogram.
 */
export async function getTrainingStats(): Promise<TrainingStats> {
  const stats = await db
    .collection<PublicTrainingStatsDB>("public")
    .findOne({ _id: "stats" }, { projection: { _id: 0 } });

  return {
    timeTraining: stats?.timeSpent ?? 0,
    testsCompleted: stats?.testsCompleted ?? 0,
    testsStarted: stats?.testsStarted ?? 0,
  };
}
