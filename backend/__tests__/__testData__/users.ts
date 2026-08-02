import * as DB from "../../src/init/db";
import * as UserDAL from "../../src/dal/user";
import { ObjectId } from "mongodb";
import { PersonalBest } from "@croco-calc/schemas/shared";
import {
  buildSettingsId,
  MathGeneratorSettings,
} from "@croco-calc/schemas/math";

export async function createUser(
  user?: Partial<UserDAL.DBUser>,
): Promise<UserDAL.DBUser> {
  const uid = new ObjectId().toHexString();
  await UserDAL.addUser(`user${uid}`, `${uid}@example.com`, uid);
  await DB.collection("users").updateOne({ uid }, { $set: { ...user } });
  return await UserDAL.getUser(uid, "test");
}

export async function createUserWithoutMigration(
  user?: Partial<UserDAL.DBUser>,
): Promise<UserDAL.DBUser> {
  const uid = new ObjectId().toHexString();
  await UserDAL.addUser(`user${uid}`, `${uid}@example.com`, uid);
  await DB.collection("users").updateOne({ uid }, { $set: { ...user } });
  await DB.collection("users").updateOne(
    { uid },
    { $unset: { testActivity: "" } },
  );

  return await UserDAL.getUser(uid, "test");
}

/**
 * The settings snapshot every generated personal best is achieved under. It is
 * the leaderboard baseline signature (SB-173), so PBs built here are eligible
 * for the leaderboard without any further set-up.
 */
export const TEST_SETTINGS: MathGeneratorSettings = {
  addition: "1000",
  multiplication: "100",
  division: "threeByTwo",
  fractionAddition: "99",
  fractionMultiplication: true,
  decimals: true,
  negatives: true,
};

/**
 * Build a personal best. `score` is the headline metric (master C40); `acc` and
 * `timestamp` are the leaderboard tiebreakers. Consistency is deliberately
 * absent from personal bests (master C5, AC-064).
 */
export function pb(
  score: number,
  acc: number = 90,
  timestamp: number = 1,
): PersonalBest {
  const correct = score;
  const wrong = 0;

  return {
    score,
    correct,
    wrong,
    acc,
    tpm: score,
    spm: score,
    settings: TEST_SETTINGS,
    settingsId: buildSettingsId(TEST_SETTINGS),
    timestamp,
  };
}
