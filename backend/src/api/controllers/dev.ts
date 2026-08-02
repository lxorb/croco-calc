import { CrocoResponse } from "../../utils/croco-response";
import * as UserDal from "../../dal/user";
import FirebaseAdmin from "../../init/firebase-admin";
import Logger from "../../utils/logger";
import * as DateUtils from "date-fns";
import { UTCDate } from "@date-fns/utc";
import * as ResultDal from "../../dal/result";
import { ObjectId } from "mongodb";
import * as LeaderboardDal from "../../dal/leaderboards";
import CrocoError from "../../utils/error";

import { PersonalBest, PersonalBests } from "@croco-calc/schemas/shared";
import {
  AddDebugInboxItemRequest,
  GenerateDataRequest,
  GenerateDataResponse,
} from "@croco-calc/contracts/dev";
import { buildCrocoMail } from "../../utils/croco-mail";
import { roundTo2 } from "@croco-calc/util/numbers";
import { CrocoRequest } from "../types";
import { DBResult } from "../../utils/result";
import { LbPersonalBests } from "../../utils/pb";
import {
  buildSettingsId,
  MathGeneratorSettings,
} from "@croco-calc/schemas/math";

const CREATE_RESULT_DEFAULT_OPTIONS = {
  firstTestTimestamp: DateUtils.startOfDay(new UTCDate(Date.now())).valueOf(),
  lastTestTimestamp: DateUtils.endOfDay(new UTCDate(Date.now())).valueOf(),
  minTestsPerDay: 0,
  maxTestsPerDay: 50,
};

export async function createTestData(
  req: CrocoRequest<undefined, GenerateDataRequest>,
): Promise<GenerateDataResponse> {
  const { username, createUser } = req.body;
  const user = await getOrCreateUser(username, "password", createUser);

  const { uid, email } = user;

  await createTestResults(user, req.body);
  await updateUser(uid);
  await updateLeaderboard();

  return new CrocoResponse("test data created", { uid, email });
}

export async function addDebugInboxItem(
  req: CrocoRequest<undefined, AddDebugInboxItemRequest>,
): Promise<CrocoResponse> {
  const { uid } = req.ctx.decodedToken;
  const { rewardType } = req.body;
  const inboxConfig = req.ctx.configuration.users.inbox;

  const rewards =
    rewardType === "xp" ? [{ type: "xp" as const, item: 1000 }] : [];

  const body =
    rewardType === "xp"
      ? "Here is your 1000 XP reward for debugging."
      : "A debug inbox item with no reward.";

  const mail = buildCrocoMail({
    subject: "Debug Inbox Item",
    body,
    rewards,
  });

  await UserDal.addToInbox(uid, [mail], inboxConfig);
  return new CrocoResponse("Debug inbox item added", null);
}

async function getOrCreateUser(
  username: string,
  password: string,
  createUser = false,
): Promise<UserDal.DBUser> {
  const existingUser = await UserDal.findByName(username);

  if (existingUser !== undefined && existingUser !== null) {
    return existingUser;
  } else if (!createUser) {
    throw new CrocoError(404, `User ${username} does not exist.`);
  }

  const email = `${username}@example.com`;
  Logger.success(`create user ${username}`);
  const { uid } = await FirebaseAdmin().auth().createUser({
    displayName: username,
    password: password,
    email,
    emailVerified: true,
  });

  await UserDal.addUser(username, email, uid);
  return UserDal.getUser(uid, "getOrCreateUser");
}

async function createTestResults(
  user: UserDal.DBUser,
  configOptions: GenerateDataRequest,
): Promise<void> {
  const config = {
    ...CREATE_RESULT_DEFAULT_OPTIONS,
    ...configOptions,
  };
  const start = toDate(config.firstTestTimestamp);
  const end = toDate(config.lastTestTimestamp);

  const days = DateUtils.eachDayOfInterval({
    start,
    end,
  }).map((day) => ({
    timestamp: DateUtils.startOfDay(day),
    amount: Math.round(random(config.minTestsPerDay, config.maxTestsPerDay)),
  }));

  for (const day of days) {
    Logger.success(
      `User ${user.name} insert ${day.amount} results on ${new Date(
        day.timestamp,
      )}`,
    );
    const results = createArray(day.amount, () =>
      createResult(user, day.timestamp),
    );
    if (results.length > 0) {
      await ResultDal.getResultCollection().insertMany(results);
    }
  }
}

function toDate(value: number): Date {
  return new UTCDate(value);
}

function random(min: number, max: number): number {
  return roundTo2(Math.random() * (max - min) + min);
}

/**
 * The default settings snapshot (SB-110). Generated results use it so the fake
 * data lands on the leaderboards, which is the point of the dev generator.
 */
const DEV_SETTINGS: MathGeneratorSettings = {
  addition: "1000",
  multiplication: "100",
  division: "threeByTwo",
  fractionAddition: "99",
  fractionMultiplication: true,
  decimals: true,
  negatives: true,
};

const DEV_SETTINGS_ID = buildSettingsId(DEV_SETTINGS);

function createResult(
  user: UserDal.DBUser,
  timestamp: Date, //evil, we modify this value
): DBResult {
  const minutes = randomValue([1, 2, 4, 8]);
  const mode2 = `${minutes}` as "1" | "2" | "4" | "8";
  const testDuration = minutes * 60;

  const correct = Math.round(random(minutes * 10, minutes * 30));
  const wrong = Math.round(random(0, minutes * 8));
  const answered = correct + wrong;
  const acc = answered === 0 ? 0 : roundTo2((correct / answered) * 100);

  timestamp = DateUtils.addSeconds(timestamp, testDuration);
  return {
    _id: new ObjectId(),
    uid: user.uid,
    score: correct - wrong,
    correct,
    wrong,
    acc,
    tpm: roundTo2(answered / minutes),
    spm: roundTo2((correct - wrong) / minutes),
    consistency: random(50, 100),
    mode: "time",
    mode2,
    timestamp: timestamp.valueOf(),
    testDuration,
    settings: DEV_SETTINGS,
    settingsId: DEV_SETTINGS_ID,
    chartData: {
      score: createArray(testDuration, () => Math.round(random(0, correct))),
      tpm: createArray(testDuration, () => random(5, 40)),
      wrong: createArray(testDuration, () => (Math.random() < 0.1 ? 1 : 0)),
    },
    isPb: Math.random() < 0.1,
    name: user.name,
  };
}

async function updateUser(uid: string): Promise<void> {
  //update timeSpent and completedTests
  const stats = await ResultDal.getResultCollection()
    .aggregate([
      {
        $match: {
          uid,
        },
      },
      {
        $group: {
          _id: {
            mode: "$mode",
            mode2: "$mode2",
          },
          timeSpent: {
            $sum: "$testDuration",
          },
          completedTests: {
            $count: {},
          },
        },
      },
    ])
    .toArray();

  const timeSpent = stats.reduce((a, c) => (a + c["timeSpent"]) as number, 0);
  const completedTests = stats.reduce(
    (a, c) => (a + c["completedTests"]) as number,
    0,
  );

  //update PBs
  const lbPersonalBests: LbPersonalBests = {
    time: {
      4: {},
      8: {},
    },
  };

  const personalBests: PersonalBests = {
    time: {},
  };
  const modes = stats.map(
    (it) =>
      it["_id"] as {
        mode: "time";
        mode2: "1" | "2" | "4" | "8";
      },
  );

  for (const mode of modes) {
    const best = (await ResultDal.getResultCollection().findOne(
      {
        uid,
        mode: mode.mode,
        mode2: mode.mode2,
      },
      { sort: { score: -1, timestamp: 1 } },
    )) as DBResult;

    personalBests[mode.mode] ??= {};
    if (personalBests[mode.mode][mode.mode2] === undefined) {
      personalBests[mode.mode][mode.mode2] = [];
    }

    const entry: PersonalBest = {
      score: best.score,
      correct: best.correct,
      wrong: best.wrong,
      acc: best.acc,
      tpm: best.tpm,
      spm: best.spm,
      settings: best.settings,
      settingsId: best.settingsId,
      timestamp: best.timestamp,
    };

    (personalBests[mode.mode][mode.mode2] as PersonalBest[]).push(entry);

    if (mode.mode2 === "4" || mode.mode2 === "8") {
      lbPersonalBests[mode.mode][mode.mode2] = entry;
    }

    //update testActivity
    await updateTestActivity(uid);
  }

  //update the user
  await UserDal.getUsersCollection().updateOne(
    { uid },
    {
      $set: {
        timeSpent: timeSpent,
        completedTests: completedTests,
        startedTests: Math.round(completedTests * 1.25),
        personalBests: personalBests,
        lbPersonalBests: lbPersonalBests,
      },
    },
  );
}

async function updateLeaderboard(): Promise<void> {
  await LeaderboardDal.update("time", "4");
  await LeaderboardDal.update("time", "8");
}

function randomValue<T>(values: T[]): T {
  const rnd = Math.round(Math.random() * (values.length - 1));
  return values[rnd] as T;
}

function createArray<T>(size: number, builder: () => T): T[] {
  return new Array(size).fill(0).map(() => builder());
}

async function updateTestActivity(uid: string): Promise<void> {
  await ResultDal.getResultCollection()
    .aggregate(
      [
        {
          $match: {
            uid,
          },
        },
        {
          $project: {
            _id: 0,
            timestamp: -1,
            uid: 1,
          },
        },
        {
          $addFields: {
            date: {
              $toDate: "$timestamp",
            },
          },
        },
        {
          $replaceWith: {
            uid: "$uid",
            year: {
              $year: "$date",
            },
            day: {
              $dayOfYear: "$date",
            },
          },
        },
        {
          $group: {
            _id: {
              uid: "$uid",
              year: "$year",
              day: "$day",
            },
            count: {
              $sum: 1,
            },
          },
        },
        {
          $group: {
            _id: {
              uid: "$_id.uid",
              year: "$_id.year",
            },
            days: {
              $addToSet: {
                day: "$_id.day",
                tests: "$count",
              },
            },
          },
        },
        {
          $replaceWith: {
            uid: "$_id.uid",
            days: {
              $function: {
                lang: "js",
                args: ["$days", "$_id.year"],
                body: `function (days, year) {
                                var max = Math.max(
                                    ...days.map((it) => it.day)
                                )-1;
                                var arr = new Array(max).fill(null);
                                for (day of days) {
                                    arr[day.day-1] = day.tests;
                                }
                                let result = {};
                                result[year] = arr;
                                return result;
                            }`,
              },
            },
          },
        },
        {
          $group: {
            _id: "$uid",
            testActivity: {
              $mergeObjects: "$days",
            },
          },
        },
        {
          $addFields: {
            uid: "$_id",
          },
        },
        {
          $project: {
            _id: 0,
          },
        },
        {
          $merge: {
            into: "users",
            on: "uid",
            whenMatched: "merge",
            whenNotMatched: "discard",
          },
        },
      ],
      { allowDiskUse: true },
    )
    .toArray();
}
