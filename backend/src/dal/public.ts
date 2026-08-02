import { roundTo2 } from "@croco-calc/util/numbers";
import * as db from "../init/db";
import CrocoError from "../utils/error";
import { SiteStats, ScoreHistogram } from "@croco-calc/schemas/public";

export type PublicSiteStatsDB = SiteStats & { _id: "stats" };

/**
 * AC-090: the histogram is bucketed by score and keyed by the leaderboard mode
 * only — there is no language axis (INV-153).
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
  await db.collection<PublicSiteStatsDB>("public").updateOne(
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
  mode: string,
  mode2: string,
): Promise<ScoreHistogram> {
  const key = `${mode}_${mode2}` as keyof PublicScoreStatsDB;

  if (key === "_id") {
    throw new CrocoError(
      400,
      "Invalid score histogram key",
      "get score histogram",
    );
  }

  const stats = await db
    .collection<PublicScoreStatsDB>("public")
    .findOne({ _id: "scoreStatsHistogram" }, { projection: { [key]: 1 } });

  return stats?.[key] ?? {};
}

/** Get site-wide stats such as the total number of tests completed on site */
export async function getSiteStats(): Promise<PublicSiteStatsDB> {
  const stats = await db
    .collection<PublicSiteStatsDB>("public")
    .findOne({ _id: "stats" }, { projection: { _id: 0 } });
  if (!stats) {
    throw new CrocoError(404, "Public site stats not found", "get site stats");
  }
  return stats;
}
