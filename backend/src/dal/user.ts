import { checkAndUpdatePb, LbPersonalBests } from "../utils/pb";
import * as db from "../init/db";
import CrocoError from "../utils/error";
import {
  Collection,
  ObjectId,
  Long,
  type UpdateFilter,
  type Filter,
} from "mongodb";
import {
  escapeRegExp,
  flattenObjectDeep,
  isPlainObject,
  WithObjectId,
} from "../utils/misc";
import { getDayOfYear } from "date-fns";
import { UTCDate } from "@date-fns/utc";
import {
  CrocoMail,
  CustomTheme,
  UserProfileDetails,
  ResultFilters,
  User,
  CountByYearAndDay,
  Friend,
} from "@croco-calc/schemas/users";
import {
  Mode,
  Mode2,
  PersonalBest,
  PersonalBests,
} from "@croco-calc/schemas/shared";
import { addImportantLog } from "./logs";
import { Result as ResultType } from "@croco-calc/schemas/results";
import { Configuration } from "@croco-calc/schemas/configuration";
import { aggregateWithAcceptedConnections } from "./connections";

export type DBUser = Omit<
  User,
  "resultFilterPresets" | "customThemes" | "allTimeLbs" | "testActivity"
> & {
  _id: ObjectId;
  resultFilterPresets?: WithObjectId<ResultFilters>[];
  lbPersonalBests?: LbPersonalBests;
  customThemes?: WithObjectId<CustomTheme>[];
  autoBanTimestamps?: number[];
  inbox?: CrocoMail[];
  ips?: string[];
  canReport?: boolean;
  nameHistory?: string[];
  lastNameChange?: number;
  testActivity?: CountByYearAndDay;
  suspicious?: boolean;
  note?: string;
};

const SECONDS_PER_HOUR = 3600;

type Result = Omit<ResultType<Mode>, "_id" | "name">;

export type DBFriend = Friend;

// Export for use in tests
export const getUsersCollection = (): Collection<DBUser> =>
  db.collection<DBUser>("users");

export async function addUser(
  name: string,
  email: string,
  uid: string,
): Promise<void> {
  const newUserDocument: Partial<DBUser> = {
    name,
    email,
    uid,
    addedAt: Date.now(),
    personalBests: {
      time: {},
    },
    testActivity: {},
  };

  const result = await getUsersCollection().updateOne(
    { uid },
    { $setOnInsert: newUserDocument },
    { upsert: true },
  );

  if (result.upsertedCount === 0) {
    throw new CrocoError(409, "User document already exists", "addUser");
  }
}

export async function deleteUser(uid: string): Promise<void> {
  await getUsersCollection().deleteOne({ uid });
}

export async function resetUser(uid: string): Promise<void> {
  await getUsersCollection().updateOne(
    { uid },
    {
      $set: {
        personalBests: {
          time: {},
        },
        lbPersonalBests: {
          time: {},
        },
        completedTests: 0,
        startedTests: 0,
        timeSpent: 0,
        lbMemory: {},
        profileDetails: {
          bio: "",
          socialProfiles: {},
        },
        customThemes: [],
        xp: 0,
        testActivity: {},
      },
      $unset: {
        lbOptOut: "",
        inbox: "",
      },
    },
  );
}

export async function updateName(
  uid: string,
  name: string,
  previousName: string,
): Promise<void> {
  if (name === previousName) {
    throw new CrocoError(400, "New name is the same as the old name");
  }

  if (
    name?.toLowerCase() !== previousName?.toLowerCase() &&
    !(await isNameAvailable(name, uid))
  ) {
    throw new CrocoError(409, "Username already taken", name);
  }

  await getUsersCollection().updateOne(
    { uid },
    {
      $set: { name, lastNameChange: Date.now() },
      $unset: { needsToChangeName: "" },
      $push: { nameHistory: previousName },
    },
  );
}

export async function flagForNameChange(uid: string): Promise<void> {
  await getUsersCollection().updateOne(
    { uid },
    { $set: { needsToChangeName: true } },
  );
}

export async function clearPb(uid: string): Promise<void> {
  await getUsersCollection().updateOne(
    { uid },
    {
      $set: {
        personalBests: {
          time: {},
        },
        lbPersonalBests: {
          time: {},
        },
      },
    },
  );
}

export async function optOutOfLeaderboards(uid: string): Promise<void> {
  await getUsersCollection().updateOne(
    { uid },
    {
      $set: {
        lbOptOut: true,
        lbPersonalBests: {
          time: {},
        },
      },
    },
  );
}

export async function updateEmail(
  uid: string,
  email: string,
): Promise<boolean> {
  await updateUser({ uid }, { $set: { email } }, { stack: "update email" });

  return true;
}

export async function getUser(uid: string, stack: string): Promise<DBUser> {
  const user = await getUsersCollection().findOne({ uid });
  if (!user) throw new CrocoError(404, "User not found", stack);
  return migrateUser(user);
}

/**
 * Get user document only containing requested fields
 * @param uid  user id
 * @param stack stack description used in the error
 * @param fields list of fields
 * @returns partial DBUser only containing requested fields
 * @throws CrocoError if user does not exist
 */
export async function getPartialUser<K extends keyof DBUser>(
  uid: string,
  stack: string,
  fields: K[],
): Promise<Pick<DBUser, K>> {
  const projection = new Map(fields.map((it) => [it, 1]));
  const partialUser = await getUsersCollection().findOne(
    { uid },
    { projection },
  );
  if (partialUser === null) throw new CrocoError(404, "User not found", stack);

  if (fields.includes("personalBests" as K)) {
    return migrateUser(partialUser);
  }
  return partialUser;
}

/**
 * Case-insensitive exact match on `name`.
 *
 * This was `findOne({ name }, { collation: { locale: "en", strength: 1 } })`.
 * INF-057 puts production on Azure Cosmos DB for MongoDB vCore, whose `find`
 * rejects `collation` outright ("collation is not supported in the find command
 * yet"), so every username lookup — `GET /users/checkName/:name`, `POST
 * /users/signup`, `/profile/{name}`, the name-change flow — returned a 500.
 *
 * Usernames are ASCII `[0-9a-zA-Z_.-]` (`slug()` in `packages/schemas/src/util.ts`),
 * so an anchored case-insensitive regex is exactly equivalent to strength-1
 * collation over the reachable character set. The name is still escaped: it
 * arrives unvalidated on the profile route.
 */
export async function findByName(name: string): Promise<DBUser | undefined> {
  const found = await getUsersCollection().findOne({
    name: { $regex: `^${escapeRegExp(name)}$`, $options: "i" },
  });

  return found ?? undefined;
}

export async function isNameAvailable(
  name: string,
  uid: string,
): Promise<boolean> {
  const user = await findByName(name);
  // if the user found by name is the same as the user we are checking for, then the name is available
  // this means that the user can update the casing of their name without it being taken
  return user === undefined || user.uid === uid;
}

export async function getUserByName(
  name: string,
  stack: string,
): Promise<DBUser> {
  const user = await findByName(name);
  if (!user) throw new CrocoError(404, "User not found", stack);
  return migrateUser(user);
}

export async function addResultFilterPreset(
  uid: string,
  resultFilter: ResultFilters,
  maxFiltersPerUser: number,
): Promise<ObjectId> {
  if (maxFiltersPerUser === 0) {
    throw new CrocoError(
      409,
      "Maximum number of custom filters reached",
      "add result filter preset",
    );
  }

  const _id = new ObjectId();
  const filter = { uid };
  filter[`resultFilterPresets.${maxFiltersPerUser - 1}`] = { $exists: false };

  await updateUser(
    filter,
    { $push: { resultFilterPresets: { ...resultFilter, _id } } },
    {
      statusCode: 409,
      message: "Maximum number of custom filters reached",
      stack: "add result filter preset",
    },
  );

  return _id;
}

export async function removeResultFilterPreset(
  uid: string,
  _id: string,
): Promise<void> {
  const presetId = new ObjectId(_id);

  await updateUser(
    { uid, "resultFilterPresets._id": presetId },
    { $pull: { resultFilterPresets: { _id: presetId } } },
    {
      statusCode: 404,
      message: "Custom filter not found",
      stack: "remove result filter preset",
    },
  );
}

export async function updateLbMemory(
  uid: string,
  mode: Mode,
  mode2: Mode2<Mode>,
  rank: number,
): Promise<void> {
  const partialUpdate = {};
  partialUpdate[`lbMemory.${mode}.${mode2}`] = rank;

  await updateUser(
    { uid },
    { $set: partialUpdate },
    { stack: "update lb memory" },
  );
}

export async function checkIfPb(
  uid: string,
  user: Pick<DBUser, "personalBests" | "lbPersonalBests">,
  result: Result,
): Promise<boolean> {
  user.personalBests ??= {
    time: {},
  };
  user.lbPersonalBests ??= {
    time: {},
  };

  const pb = checkAndUpdatePb(user.personalBests, user.lbPersonalBests, result);

  if (!pb.isPb) return false;

  const setFields: Record<string, unknown> = {
    personalBests: pb.personalBests,
  };
  if (pb.lbPersonalBests) {
    setFields["lbPersonalBests"] = pb.lbPersonalBests;
  }

  await getUsersCollection().updateOne({ uid }, { $set: setFields });
  return true;
}

export async function resetPb(uid: string): Promise<void> {
  await updateUser(
    { uid },
    {
      $set: {
        personalBests: {
          time: {},
        },
      },
    },
    { stack: "reset pb" },
  );
}

export async function updateLastHashes(
  uid: string,
  lastHashes: string[],
): Promise<void> {
  await getUsersCollection().updateOne(
    { uid },
    {
      $set: {
        lastReultHashes: lastHashes, //TODO fix typo
      },
    },
  );
}

export async function updateTypingStats(
  uid: string,
  restartCount: number,
  timeSpent: number,
): Promise<void> {
  await getUsersCollection().updateOne(
    { uid },
    {
      $inc: {
        startedTests: restartCount + 1,
        completedTests: 1,
        timeSpent,
      },
    },
  );
}

export async function incrementXp(uid: string, xp: number): Promise<void> {
  if (isNaN(xp)) xp = 0;
  await getUsersCollection().updateOne({ uid }, { $inc: { xp: new Long(xp) } });
}

export async function incrementTestActivity(
  user: DBUser,
  timestamp: number,
): Promise<void> {
  if (user.testActivity === undefined) {
    //migration script did not run yet
    return;
  }

  const date = new UTCDate(timestamp);
  const dayOfYear = getDayOfYear(date);
  const year = date.getFullYear();

  if (user.testActivity[year] === undefined) {
    await getUsersCollection().updateOne(
      { uid: user.uid },
      { $set: { [`testActivity.${date.getFullYear()}`]: [] } },
    );
  }

  await getUsersCollection().updateOne(
    { uid: user.uid },
    { $inc: { [`testActivity.${date.getFullYear()}.${dayOfYear - 1}`]: 1 } },
  );
}

export async function addTheme(
  uid: string,
  { name, colors }: Omit<CustomTheme, "_id">,
): Promise<{ _id: ObjectId; name: string }> {
  const _id = new ObjectId();

  await updateUser(
    { uid, "customThemes.19": { $exists: false } },
    {
      $push: {
        customThemes: {
          _id,
          name: name,
          colors: colors,
        },
      },
    },
    {
      statusCode: 409,
      message: "Maximum number of custom themes reached",
      stack: "add theme",
    },
  );

  return {
    _id,
    name,
  };
}

export async function removeTheme(uid: string, id: string): Promise<void> {
  const themeId = new ObjectId(id);
  await updateUser(
    { uid, "customThemes._id": themeId },
    { $pull: { customThemes: { _id: themeId } } },
    {
      statusCode: 404,
      message: "Custom theme not found",
      stack: "remove theme",
    },
  );
}

export async function editTheme(
  uid: string,
  id: string,
  { name, colors }: Omit<CustomTheme, "_id">,
): Promise<void> {
  const themeId = new ObjectId(id);

  await updateUser(
    { uid, "customThemes._id": themeId },
    {
      $set: {
        "customThemes.$.name": name,
        "customThemes.$.colors": colors,
      },
    },
    { statusCode: 404, message: "Custom theme not found", stack: "edit theme" },
  );
}

export type DBCustomTheme = WithObjectId<CustomTheme>;

export async function getThemes(uid: string): Promise<DBCustomTheme[]> {
  const user = await getPartialUser(uid, "get themes", ["customThemes"]);
  return user.customThemes ?? [];
}

export async function getPersonalBests(
  uid: string,
  mode: string,
  mode2?: string,
): Promise<PersonalBest> {
  const user = await getPartialUser(uid, "get personal bests", [
    "personalBests",
  ]);

  if (mode2 !== undefined) {
    // oxlint-disable-next-line no-unsafe-member-access
    return user.personalBests?.[mode]?.[mode2] as PersonalBest;
  }

  return user.personalBests?.[mode] as PersonalBest;
}

export async function getStats(
  uid: string,
): Promise<Pick<DBUser, "startedTests" | "completedTests" | "timeSpent">> {
  const user = await getPartialUser(uid, "get stats", [
    "startedTests",
    "completedTests",
    "timeSpent",
  ]);

  return user;
}

export async function recordAutoBanEvent(
  uid: string,
  maxCount: number,
  maxHours: number,
): Promise<boolean> {
  const user = await getPartialUser(uid, "record auto ban event", [
    "banned",
    "autoBanTimestamps",
  ]);

  let ret = false;

  if (user.banned) return ret;

  const autoBanTimestamps = user.autoBanTimestamps ?? [];

  const now = Date.now();

  //only keep events within the last maxHours
  const recentAutoBanTimestamps = autoBanTimestamps.filter(
    (timestamp) => timestamp >= now - maxHours * SECONDS_PER_HOUR * 1000,
  );

  //push new event
  recentAutoBanTimestamps.push(now);

  //update user, ban if needed
  const updateObj: Partial<DBUser> = {
    autoBanTimestamps: recentAutoBanTimestamps,
  };
  let banningUser = false;
  if (recentAutoBanTimestamps.length > maxCount) {
    updateObj.banned = true;
    banningUser = true;
    ret = true;
  }

  await getUsersCollection().updateOne({ uid }, { $set: updateObj });
  void addImportantLog(
    "user_auto_banned",
    { autoBanTimestamps, banningUser },
    uid,
  );

  return ret;
}

export async function updateProfile(
  uid: string,
  profileDetailUpdates: Partial<UserProfileDetails>,
): Promise<void> {
  const profileUpdates = flattenObjectDeep(
    Object.fromEntries(
      Object.entries(profileDetailUpdates).filter(
        ([_, value]) =>
          value !== undefined &&
          !(isPlainObject(value) && Object.keys(value).length === 0),
      ),
    ),
    "profileDetails",
  );

  const updates = {
    $set: {
      ...profileUpdates,
    },
  };

  await getUsersCollection().updateOne(
    {
      uid,
    },
    updates,
  );
}

export async function getInbox(
  uid: string,
): Promise<NonNullable<DBUser["inbox"]>> {
  const user = await getPartialUser(uid, "get inbox", ["inbox"]);
  return user.inbox ?? [];
}

type AddToInboxBulkEntry = {
  uid: string;
  mail: CrocoMail[];
};

export async function addToInboxBulk(
  entries: AddToInboxBulkEntry[],
  inboxConfig: Configuration["users"]["inbox"],
): Promise<void> {
  const { enabled, maxMail } = inboxConfig;

  if (!enabled) {
    return;
  }

  const bulk = getUsersCollection().initializeUnorderedBulkOp();

  entries.forEach((entry) => {
    bulk.find({ uid: entry.uid }).updateOne({
      $push: {
        inbox: {
          $each: entry.mail,
          $position: 0, // Prepends to the inbox
          $slice: maxMail, // Keeps inbox size to maxInboxSize, maxMail the oldest
        },
      },
    });
  });

  await bulk.execute();
}

export async function addToInbox(
  uid: string,
  mail: CrocoMail[],
  inboxConfig: Configuration["users"]["inbox"],
): Promise<void> {
  const { enabled, maxMail } = inboxConfig;

  if (!enabled) {
    return;
  }

  await getUsersCollection().updateOne(
    {
      uid,
    },
    {
      $push: {
        inbox: {
          $each: mail,
          $position: 0, // Prepends to the inbox
          $slice: maxMail, // Keeps inbox size to maxMail, discarding the oldest
        },
      },
    },
  );
}

export async function updateInbox(
  uid: string,
  mailToRead: string[],
  mailToDelete: string[],
): Promise<void> {
  const deleteSet = [...new Set(mailToDelete)];

  //we don't need to read mails that are going to be deleted because
  //Rewards will be claimed on unread mails on deletion
  const readSet = [...new Set(mailToRead)].filter(
    (it) => !deleteSet.includes(it),
  );

  // The mail whose rewards this call claims: unread, and named by either list.
  // `readSet` and `deleteSet` are disjoint by construction above, so this is
  // exactly upstream's `[...toBeRead, ...toBeDeleted].filter(it => !it.read)`
  // — and it cannot double-count an id that appears in both.
  const claimable = {
    $filter: {
      input: { $ifNull: ["$inbox", []] },
      as: "mail",
      cond: {
        $and: [
          { $ne: ["$$mail.read", true] },
          {
            $or: [
              { $in: ["$$mail.id", { $literal: readSet }] },
              { $in: ["$$mail.id", { $literal: deleteSet }] },
            ],
          },
        ],
      },
    },
  };

  // This was one `$function` stage carrying the whole claim/read/delete routine
  // as server-side JS. `$function` is not implemented on Azure DocumentDB
  // (Cosmos DB for MongoDB vCore): its MQL compatibility matrix gives `$function`
  // (like `$accumulator` and `$where`) no support marker in any server version,
  // where `$merge`, `$out` and `$setWindowFields` are "Yes" throughout. The same
  // work is expressed below with ordinary aggregation operators, all of which
  // predate MongoDB 4.0, so it also runs on the 5.0.13 image the integration
  // containers pin.
  //
  // It deliberately stays a *single* update pipeline. Reading the inbox into
  // Node, computing there and writing it back would open a lost-update window in
  // which two concurrent claims each award the same XP.
  const update = await getUsersCollection().updateOne({ uid }, [
    {
      // Both expressions are evaluated against the stage's *input* document, so
      // `inbox` below still sees the pre-update array.
      $set: {
        xp: {
          $add: [
            { $ifNull: ["$xp", 0] },
            {
              // Sum every `xp` reward across the claimable mail. The inner
              // `$reduce` rebinds `$$this`/`$$value`; its `input` is evaluated in
              // the outer scope, so `$$this.rewards` there is the mail.
              $reduce: {
                input: claimable,
                initialValue: 0,
                in: {
                  $add: [
                    "$$value",
                    {
                      $reduce: {
                        input: {
                          $filter: {
                            input: { $ifNull: ["$$this.rewards", []] },
                            as: "reward",
                            cond: { $eq: ["$$reward.type", "xp"] },
                          },
                        },
                        initialValue: 0,
                        in: { $add: ["$$value", "$$this.item"] },
                      },
                    },
                  ],
                },
              },
            },
          ],
        },
        // Delete, mark-as-read, then re-sort newest first — the same three steps
        // and the same order the JS body did.
        inbox: {
          // Insertion sort by `timestamp` descending. `$sortArray` would say
          // this in one line but it is MongoDB 5.2+, above the 5.0.13 the
          // integration containers pin, and an update pipeline may not use the
          // `$sort` *stage*. Splicing each element into an already-sorted
          // accumulator is O(n²), which is irrelevant at `inbox.maxMail`
          // entries, and it is stable: equal timestamps keep their input order.
          $reduce: {
            input: {
              $map: {
                input: {
                  $filter: {
                    input: { $ifNull: ["$inbox", []] },
                    as: "mail",
                    cond: {
                      $not: [{ $in: ["$$mail.id", { $literal: deleteSet }] }],
                    },
                  },
                },
                as: "mail",
                in: {
                  $cond: [
                    {
                      $and: [
                        { $ne: ["$$mail.read", true] },
                        { $in: ["$$mail.id", { $literal: readSet }] },
                      ],
                    },
                    // Claimed: mark read and drop the rewards so a second call
                    // cannot award them again. Mail that is *already* read keeps
                    // its rewards untouched, as upstream did.
                    {
                      $mergeObjects: ["$$mail", { read: true, rewards: [] }],
                    },
                    "$$mail",
                  ],
                },
              },
            },
            initialValue: [],
            in: {
              // Bound to named variables so neither `$filter` below can shadow
              // the reduce's `$$this`/`$$value`.
              $let: {
                vars: { mail: "$$this", sorted: "$$value" },
                in: {
                  $concatArrays: [
                    {
                      $filter: {
                        input: "$$sorted",
                        as: "seen",
                        cond: {
                          $gte: ["$$seen.timestamp", "$$mail.timestamp"],
                        },
                      },
                    },
                    ["$$mail"],
                    {
                      $filter: {
                        input: "$$sorted",
                        as: "seen",
                        cond: {
                          $lt: ["$$seen.timestamp", "$$mail.timestamp"],
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
        },
      },
    },
  ]);

  if (update.matchedCount !== 1) {
    throw new CrocoError(404, "User not found", "update inbox");
  }
}

export async function setBanned(uid: string, banned: boolean): Promise<void> {
  if (banned) {
    await getUsersCollection().updateOne({ uid }, { $set: { banned: true } });
  } else {
    await getUsersCollection().updateOne({ uid }, { $unset: { banned: "" } });
  }
}

export async function logIpAddress(
  uid: string,
  ip: string,
  userInfoOverride?: Pick<DBUser, "ips">,
): Promise<void> {
  const user =
    userInfoOverride ?? (await getPartialUser(uid, "logIpAddress", ["ips"]));
  const currentIps = user.ips ?? [];
  const ipIndex = currentIps.indexOf(ip);
  if (ipIndex !== -1) {
    currentIps.splice(ipIndex, 1);
  }
  currentIps.unshift(ip);
  if (currentIps.length > 10) {
    currentIps.pop();
  }
  await getUsersCollection().updateOne({ uid }, { $set: { ips: currentIps } });
}

/**
 * Update user document. Requires the user to exist
 * @param filter user filter
 * @param update update document
 * @param error stack description used in the error or statusCode and message of the error
 * @throws CrocoError if user does not exist
 */
async function updateUser(
  filter: Filter<DBUser>,
  update: UpdateFilter<DBUser>,
  error: { stack: string; statusCode?: number; message?: string },
): Promise<void> {
  const result = await getUsersCollection().updateOne(filter, update);

  if (result.matchedCount !== 1) {
    throw new CrocoError(
      error.statusCode ?? 404,
      error.message ?? "User not found",
      error.stack,
    );
  }
}

export async function getFriends(uid: string): Promise<DBFriend[]> {
  return await aggregateWithAcceptedConnections(
    {
      uid,
      collectionName: "users",
      includeMetaData: true,
    },
    [
      {
        $project: {
          _id: false,
          uid: true,
          connectionId: "$connectionMeta._id",
          lastModified: "$connectionMeta.lastModified",
          name: true,
          startedTests: true,
          completedTests: true,
          timeSpent: true,
          xp: true,
          personalBests: true,
          banned: 1,
          lbOptOut: 1,
        },
      },
      {
        $addFields: {
          top4: {
            $reduce: {
              //find the highest score from the time 4 PBs
              input: "$personalBests.time.4",
              initialValue: {},
              in: {
                $cond: [
                  { $gte: ["$$this.score", "$$value.score"] },
                  "$$this",
                  "$$value",
                ],
              },
            },
          },
          top8: {
            $reduce: {
              //find the highest score from the time 8 PBs
              input: "$personalBests.time.8",
              initialValue: {},
              in: {
                $cond: [
                  { $gte: ["$$this.score", "$$value.score"] },
                  "$$this",
                  "$$value",
                ],
              },
            },
          },
        },
      },
      {
        $addFields: {
          //remove nulls
          top4: { $ifNull: ["$top4", "$$REMOVE"] },
          top8: { $ifNull: ["$top8", "$$REMOVE"] },
          lastModified: "$lastModified",
        },
      },
      {
        $project: {
          personalBests: false,
        },
      },
    ],
  );
}

function migrateUser<T extends { personalBests: PersonalBests }>(user: T): T {
  user.personalBests ??= {
    time: {},
  };

  return user;
}
