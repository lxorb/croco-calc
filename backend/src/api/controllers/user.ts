import * as UserDAL from "../../dal/user";
import CrocoError, { isFirebaseError } from "../../utils/error";
import { CrocoResponse } from "../../utils/croco-response";
import {
  buildAgentLog,
  omit,
  replaceObjectId,
  replaceObjectIds,
  sanitizeString,
} from "../../utils/misc";
import { deleteAll as deleteAllResults } from "../../dal/result";
import { deleteConfig } from "../../dal/config";
import { verify } from "../../utils/captcha";
import * as LeaderboardsDAL from "../../dal/leaderboards";
import { purgeUserFromDailyLeaderboards } from "../../utils/daily-leaderboards";
import { purgeUserFromXpLeaderboards } from "../../services/weekly-xp-leaderboard";
import { v4 as uuidv4 } from "uuid";
import { ObjectId } from "mongodb";
import * as ReportDAL from "../../dal/report";
import * as AuthUtil from "../../utils/auth";
import * as Dates from "date-fns";
import { UTCDateMini } from "@date-fns/utc";
import * as BlocklistDal from "../../dal/blocklist";
import {
  AllTimeLbs,
  ResultFilters,
  User,
  UserProfile,
  CountByYearAndDay,
  TestActivity,
  UserProfileDetails,
} from "@croco-calc/schemas/users";
import { addImportantLog, addLog, deleteUserLogs } from "../../dal/logs";
import {
  AddCustomThemeRequest,
  AddCustomThemeResponse,
  AddResultFilterPresetRequest,
  AddResultFilterPresetResponse,
  CheckNamePathParameters,
  CheckNameResponse,
  CreateUserRequest,
  DeleteCustomThemeRequest,
  EditCustomThemeRequst,
  ForgotPasswordEmailRequest,
  GetCurrentTestActivityResponse,
  GetCustomThemesResponse,
  GetFriendsResponse,
  GetPersonalBestsQuery,
  GetPersonalBestsResponse,
  GetProfilePathParams,
  GetProfileQuery,
  GetProfileResponse,
  GetStatsResponse,
  GetTestActivityResponse,
  GetUserInboxResponse,
  GetUserResponse,
  RemoveResultFilterPresetPathParams,
  ReportUserRequest,
  UpdateEmailRequest,
  UpdateLeaderboardMemoryRequest,
  UpdatePasswordRequest,
  UpdateUserInboxRequest,
  UpdateUserNameRequest,
  UpdateUserProfileRequest,
  UpdateUserProfileResponse,
} from "@croco-calc/contracts/users";
import { MILLISECONDS_IN_DAY } from "@croco-calc/util/date-and-time";
import { CrocoRequest } from "../types";
import { tryCatch } from "@croco-calc/util/trycatch";
import * as ConnectionsDal from "../../dal/connections";
import { PersonalBest } from "@croco-calc/schemas/shared";

async function verifyCaptcha(captcha: string): Promise<void> {
  const { data: verified, error } = await tryCatch(verify(captcha));
  if (error) {
    throw new CrocoError(
      422,
      "Request to the Captcha API failed, please try again later",
    );
  }
  if (!verified) {
    throw new CrocoError(422, "Captcha challenge failed");
  }
}

export async function createNewUser(
  req: CrocoRequest<undefined, CreateUserRequest>,
): Promise<CrocoResponse> {
  const { name, captcha } = req.body;
  const { email, uid } = req.ctx.decodedToken;

  try {
    await verifyCaptcha(captcha);

    if (email.endsWith("@tidal.lol") || email.endsWith("@selfbot.cc")) {
      throw new CrocoError(400, "Invalid domain");
    }

    const available = await UserDAL.isNameAvailable(name, uid);
    if (!available) {
      throw new CrocoError(409, "Username unavailable");
    }

    const blocklisted = await BlocklistDal.contains({ name, email });
    if (blocklisted) {
      throw new CrocoError(409, "Username or email blocked");
    }

    await UserDAL.addUser(name, email, uid);
    void addImportantLog("user_created", `${name} ${email}`, uid);

    return new CrocoResponse("User created", null);
  } catch (e) {
    //user was created in firebase from the frontend, remove it
    await firebaseDeleteUserIgnoreError(uid);
    throw e;
  }
}

export async function deleteUser(req: CrocoRequest): Promise<CrocoResponse> {
  const { uid } = req.ctx.decodedToken;

  const { data: userInfo, error } = await tryCatch(
    UserDAL.getPartialUser(uid, "delete user", ["banned", "name", "email"]),
  );

  if (error) {
    if (error instanceof CrocoError && error.status === 404) {
      //userinfo was already deleted. We ignore this and still try to remove the  other data
    } else {
      throw error;
    }
  }

  if (userInfo?.banned === true) {
    await BlocklistDal.add(userInfo);
  }

  //cleanup database
  const tasks = [
    UserDAL.deleteUser(uid),
    deleteUserLogs(uid),
    deleteConfig(uid),
    deleteAllResults(uid),
    purgeUserFromDailyLeaderboards(
      uid,
      req.ctx.configuration.dailyLeaderboards,
    ),
    purgeUserFromXpLeaderboards(
      uid,
      req.ctx.configuration.leaderboards.weeklyXp,
    ),
    ConnectionsDal.deleteByUid(uid),
  ];

  await Promise.all(tasks);

  try {
    //delete user from firebase
    await AuthUtil.deleteUser(uid);
  } catch (e) {
    if (isFirebaseError(e) && e.errorInfo.code === "auth/user-not-found") {
      //user was already deleted, ok to ignore
    } else {
      throw e;
    }
  }

  void addImportantLog(
    "user_deleted",
    `${userInfo?.email} ${userInfo?.name}`,
    uid,
  );

  return new CrocoResponse("User deleted", null);
}

export async function resetUser(req: CrocoRequest): Promise<CrocoResponse> {
  const { uid } = req.ctx.decodedToken;

  const userInfo = await UserDAL.getPartialUser(uid, "reset user", [
    "banned",
    "email",
    "name",
  ]);
  if (userInfo.banned) {
    throw new CrocoError(403, "Banned users cannot reset their account");
  }

  const promises = [
    UserDAL.resetUser(uid),
    deleteAllResults(uid),
    deleteConfig(uid),
    purgeUserFromDailyLeaderboards(
      uid,
      req.ctx.configuration.dailyLeaderboards,
    ),
    purgeUserFromXpLeaderboards(
      uid,
      req.ctx.configuration.leaderboards.weeklyXp,
    ),
  ];

  await Promise.all(promises);
  void addImportantLog("user_reset", `${userInfo.email} ${userInfo.name}`, uid);

  return new CrocoResponse("User reset", null);
}

export async function updateName(
  req: CrocoRequest<undefined, UpdateUserNameRequest>,
): Promise<CrocoResponse> {
  const { uid } = req.ctx.decodedToken;
  const { name } = req.body;

  const blocklisted = await BlocklistDal.contains({ name });
  if (blocklisted) {
    throw new CrocoError(409, "Username blocked");
  }

  const user = await UserDAL.getPartialUser(uid, "update name", [
    "name",
    "banned",
    "needsToChangeName",
    "lastNameChange",
  ]);

  if (user.banned) {
    throw new CrocoError(403, "Banned users cannot change their name");
  }

  if (
    !user?.needsToChangeName &&
    Date.now() - (user.lastNameChange ?? 0) < MILLISECONDS_IN_DAY * 30
  ) {
    throw new CrocoError(409, "You can change your name once every 30 days");
  }

  await UserDAL.updateName(uid, name, user.name);

  await ConnectionsDal.updateName(uid, name);
  void addImportantLog(
    "user_name_updated",
    `changed name from ${user.name} to ${name}`,
    uid,
  );

  return new CrocoResponse("User's name updated", null);
}

export async function clearPb(req: CrocoRequest): Promise<CrocoResponse> {
  const { uid } = req.ctx.decodedToken;

  await UserDAL.clearPb(uid);
  await purgeUserFromDailyLeaderboards(
    uid,
    req.ctx.configuration.dailyLeaderboards,
  );
  void addImportantLog("user_cleared_pbs", "", uid);

  return new CrocoResponse("User's PB cleared", null);
}

export async function optOutOfLeaderboards(
  req: CrocoRequest,
): Promise<CrocoResponse> {
  const { uid } = req.ctx.decodedToken;

  await UserDAL.optOutOfLeaderboards(uid);
  await purgeUserFromDailyLeaderboards(
    uid,
    req.ctx.configuration.dailyLeaderboards,
  );
  await purgeUserFromXpLeaderboards(
    uid,
    req.ctx.configuration.leaderboards.weeklyXp,
  );
  void addImportantLog("user_opted_out_of_leaderboards", "", uid);

  return new CrocoResponse("User opted out of leaderboards", null);
}

export async function checkName(
  req: CrocoRequest<undefined, undefined, CheckNamePathParameters>,
): Promise<CheckNameResponse> {
  const { name } = req.params;
  const { uid } = req.ctx.decodedToken;

  const available = await UserDAL.isNameAvailable(name, uid);

  return new CrocoResponse("Check username", {
    available,
  });
}

export async function updateEmail(
  req: CrocoRequest<undefined, UpdateEmailRequest>,
): Promise<CrocoResponse> {
  const { uid } = req.ctx.decodedToken;
  let { newEmail, previousEmail } = req.body;

  newEmail = newEmail.toLowerCase();
  previousEmail = previousEmail.toLowerCase();

  try {
    await AuthUtil.updateUserEmail(uid, newEmail);
    await UserDAL.updateEmail(uid, newEmail);
  } catch (e) {
    if (isFirebaseError(e)) {
      if (e.code === "auth/email-already-exists") {
        throw new CrocoError(
          409,
          "The email address is already in use by another account",
        );
      } else if (e.code === "auth/invalid-email") {
        throw new CrocoError(400, "Invalid email address");
      } else if (e.code === "auth/too-many-requests") {
        throw new CrocoError(429, "Too many requests. Please try again later");
      } else if (e.code === "auth/user-not-found") {
        throw new CrocoError(
          404,
          "User not found in the auth system",
          "update email",
          uid,
        );
      } else if (e.code === "auth/invalid-user-token") {
        throw new CrocoError(401, "Invalid user token", "update email", uid);
      }
    } else {
      throw e;
    }
  }

  void addImportantLog(
    "user_email_updated",
    `changed email from ${previousEmail} to ${newEmail}`,
    uid,
  );

  return new CrocoResponse("Email updated", null);
}

export async function updatePassword(
  req: CrocoRequest<undefined, UpdatePasswordRequest>,
): Promise<CrocoResponse> {
  const { uid } = req.ctx.decodedToken;
  const { newPassword } = req.body;

  await AuthUtil.updateUserPassword(uid, newPassword);

  return new CrocoResponse("Password updated", null);
}

type RelevantUserInfo = Omit<
  UserDAL.DBUser,
  | "lbPersonalBests"
  | "inbox"
  | "nameHistory"
  | "lastNameChange"
  | "_id"
  | "lastReultHashes" //TODO fix typo
  | "note"
  | "ips"
  | "testActivity"
  | "suspicious"
>;

function getRelevantUserInfo(user: UserDAL.DBUser): RelevantUserInfo {
  return omit(user, [
    "lbPersonalBests",
    "inbox",
    "nameHistory",
    "lastNameChange",
    "_id",
    "lastReultHashes", //TODO fix typo
    "note",
    "ips",
    "testActivity",
    "suspicious",
  ]);
}

export async function getUser(req: CrocoRequest): Promise<GetUserResponse> {
  const { uid } = req.ctx.decodedToken;

  const { data: userInfo, error } = await tryCatch(
    UserDAL.getUser(uid, "get user"),
  );

  if (error) {
    if (error instanceof CrocoError && error.status === 404) {
      //if the user is in the auth system but not in the db, its possible that the user was created by bypassing captcha
      //since there is no data in the database anyway, we can just delete the user from the auth system
      //and ask them to sign up again
      try {
        await AuthUtil.deleteUser(uid);
        throw new CrocoError(
          404,
          "User not found in the database, but found in the auth system. We have deleted the ghost user from the auth system. Please sign up again.",
          "get user",
          uid,
        );
      } catch (e: unknown) {
        if (
          typeof e === "object" &&
          e !== null &&
          "code" in e &&
          e.code === "auth/user-not-found"
        ) {
          throw new CrocoError(
            404,
            "User not found in the database or the auth system. Please sign up again.",
            "get user",
            uid,
          );
        } else {
          throw e;
        }
      }
    } else {
      throw error;
    }
  }

  userInfo.personalBests ??= {
    time: {},
  };

  const agentLog = buildAgentLog(req);
  void addLog("user_data_requested", agentLog, uid);
  void UserDAL.logIpAddress(uid, agentLog.ip, userInfo);

  let inboxUnreadSize = 0;
  if (req.ctx.configuration.users.inbox.enabled) {
    inboxUnreadSize = userInfo.inbox?.filter((mail) => !mail.read).length ?? 0;
  }

  if (!userInfo.name) {
    userInfo.needsToChangeName = true;
    await UserDAL.flagForNameChange(uid);
  }

  const allTimeLbs = await getAllTimeLbs(uid);
  const testActivity = generateCurrentTestActivity(userInfo.testActivity);
  const relevantUserInfo = getRelevantUserInfo(userInfo);

  const resultFilterPresets: ResultFilters[] = (
    relevantUserInfo.resultFilterPresets ?? []
  ).map((it) => replaceObjectId(it));
  delete relevantUserInfo.resultFilterPresets;

  const customThemes = (relevantUserInfo.customThemes ?? []).map((it) =>
    replaceObjectId(it),
  );
  delete relevantUserInfo.customThemes;

  const userData: User = {
    ...relevantUserInfo,
    resultFilterPresets,
    customThemes,
    allTimeLbs,
    testActivity,
  };

  return new CrocoResponse("User data retrieved", {
    ...userData,
    inboxUnreadSize: inboxUnreadSize,
  });
}

export async function addResultFilterPreset(
  req: CrocoRequest<undefined, AddResultFilterPresetRequest>,
): Promise<AddResultFilterPresetResponse> {
  const { uid } = req.ctx.decodedToken;
  const filter = req.body;
  const { maxPresetsPerUser } = req.ctx.configuration.results.filterPresets;

  const createdId = await UserDAL.addResultFilterPreset(
    uid,
    filter,
    maxPresetsPerUser,
  );
  return new CrocoResponse(
    "Result filter preset created",
    createdId.toHexString(),
  );
}

export async function removeResultFilterPreset(
  req: CrocoRequest<undefined, undefined, RemoveResultFilterPresetPathParams>,
): Promise<CrocoResponse> {
  const { uid } = req.ctx.decodedToken;
  const { presetId } = req.params;

  await UserDAL.removeResultFilterPreset(uid, presetId);
  return new CrocoResponse("Result filter preset deleted", null);
}

export async function updateLbMemory(
  req: CrocoRequest<undefined, UpdateLeaderboardMemoryRequest>,
): Promise<CrocoResponse> {
  const { uid } = req.ctx.decodedToken;
  const { mode, rank } = req.body;
  const mode2 = req.body.mode2;

  await UserDAL.updateLbMemory(uid, mode, mode2, rank);
  return new CrocoResponse("Leaderboard memory updated", null);
}

export async function getCustomThemes(
  req: CrocoRequest,
): Promise<GetCustomThemesResponse> {
  const { uid } = req.ctx.decodedToken;
  const customThemes = await UserDAL.getThemes(uid);
  return new CrocoResponse(
    "Custom themes retrieved",
    replaceObjectIds(customThemes),
  );
}

export async function addCustomTheme(
  req: CrocoRequest<undefined, AddCustomThemeRequest>,
): Promise<AddCustomThemeResponse> {
  const { uid } = req.ctx.decodedToken;
  const { name, colors } = req.body;

  const addedTheme = await UserDAL.addTheme(uid, { name, colors });
  return new CrocoResponse("Custom theme added", replaceObjectId(addedTheme));
}

export async function removeCustomTheme(
  req: CrocoRequest<undefined, DeleteCustomThemeRequest>,
): Promise<CrocoResponse> {
  const { uid } = req.ctx.decodedToken;
  const { themeId } = req.body;
  await UserDAL.removeTheme(uid, themeId);
  return new CrocoResponse("Custom theme removed", null);
}

export async function editCustomTheme(
  req: CrocoRequest<undefined, EditCustomThemeRequst>,
): Promise<CrocoResponse> {
  const { uid } = req.ctx.decodedToken;
  const { themeId, theme } = req.body;

  await UserDAL.editTheme(uid, themeId, theme);
  return new CrocoResponse("Custom theme updated", null);
}

export async function getPersonalBests(
  req: CrocoRequest<GetPersonalBestsQuery>,
): Promise<GetPersonalBestsResponse> {
  const { uid } = req.ctx.decodedToken;
  const { mode, mode2 } = req.query;

  const data = (await UserDAL.getPersonalBests(uid, mode, mode2)) ?? null;
  return new CrocoResponse("Personal bests retrieved", data);
}

export async function getStats(req: CrocoRequest): Promise<GetStatsResponse> {
  const { uid } = req.ctx.decodedToken;

  const data = (await UserDAL.getStats(uid)) ?? null;
  return new CrocoResponse("Personal stats retrieved", data);
}

export async function getProfile(
  req: CrocoRequest<GetProfileQuery, undefined, GetProfilePathParams>,
): Promise<GetProfileResponse> {
  const { uidOrName } = req.params;

  const user = req.query.isUid
    ? await UserDAL.getUser(uidOrName, "get user profile")
    : await UserDAL.getUserByName(uidOrName, "get user profile");

  const {
    name,
    banned,
    profileDetails,
    personalBests,
    completedTests,
    startedTests,
    timeSpent,
    addedAt,
    xp,
    lbOptOut,
  } = user;

  const extractValid = (
    src: Record<string, PersonalBest[]>,
    validKeys: string[],
  ): Record<string, PersonalBest[]> => {
    return validKeys.reduce((obj, key) => {
      if (src?.[key] !== undefined) {
        obj[key] = src[key];
      }
      return obj;
    }, {});
  };

  const validTimePbs = extractValid(personalBests.time, ["1", "2", "4", "8"]);

  const testStats = {
    completedTests,
    startedTests,
    timeSpent,
  };

  const relevantPersonalBests = {
    time: validTimePbs,
  };

  const baseProfile = {
    name,
    banned,
    addedAt,
    testStats,
    personalBests: relevantPersonalBests,
    xp,
    lbOptOut,
  };

  if (banned) {
    return new CrocoResponse("Profile retrived: banned user", baseProfile);
  }

  const allTimeLbs = await getAllTimeLbs(user.uid);

  const profileData = {
    ...baseProfile,
    details: profileDetails,
    allTimeLbs,
    uid: user.uid,
  } as UserProfile;

  if (user.profileDetails?.showActivityOnPublicProfile) {
    profileData.testActivity = generateCurrentTestActivity(user.testActivity);
  } else {
    delete profileData.testActivity;
  }
  return new CrocoResponse("Profile retrieved", profileData);
}

export async function updateProfile(
  req: CrocoRequest<undefined, UpdateUserProfileRequest>,
): Promise<UpdateUserProfileResponse> {
  const { uid } = req.ctx.decodedToken;
  const { bio, socialProfiles, showActivityOnPublicProfile } = req.body;

  const user = await UserDAL.getPartialUser(uid, "update user profile", [
    "banned",
  ]);

  if (user.banned) {
    throw new CrocoError(403, "Banned users cannot update their profile");
  }

  const profileDetailsUpdates: Partial<UserProfileDetails> = {
    bio: sanitizeString(bio),
    socialProfiles: Object.fromEntries(
      Object.entries(socialProfiles ?? {}).map(([key, value]) => [
        key,
        sanitizeString(value),
      ]),
    ),
    showActivityOnPublicProfile,
  };

  await UserDAL.updateProfile(uid, profileDetailsUpdates);

  return new CrocoResponse("Profile updated", profileDetailsUpdates);
}

export async function getInbox(
  req: CrocoRequest,
): Promise<GetUserInboxResponse> {
  const { uid } = req.ctx.decodedToken;

  const inbox = await UserDAL.getInbox(uid);

  return new CrocoResponse("Inbox retrieved", {
    inbox,
    maxMail: req.ctx.configuration.users.inbox.maxMail,
  });
}

export async function updateInbox(
  req: CrocoRequest<undefined, UpdateUserInboxRequest>,
): Promise<CrocoResponse> {
  const { uid } = req.ctx.decodedToken;
  const { mailIdsToMarkRead, mailIdsToDelete } = req.body;

  await UserDAL.updateInbox(
    uid,
    mailIdsToMarkRead ?? [],
    mailIdsToDelete ?? [],
  );

  return new CrocoResponse("Inbox updated", null);
}

export async function reportUser(
  req: CrocoRequest<undefined, ReportUserRequest>,
): Promise<CrocoResponse> {
  const { uid } = req.ctx.decodedToken;
  const {
    reporting: { maxReports, contentReportLimit },
  } = req.ctx.configuration.users;

  const { uid: uidToReport, reason, comment, captcha } = req.body;

  await verifyCaptcha(captcha);

  const newReport: ReportDAL.DBReport = {
    _id: new ObjectId(),
    id: uuidv4(),
    type: "user",
    timestamp: new Date().getTime(),
    uid,
    contentId: `${uidToReport}`,
    reason,
    comment: comment ?? "",
  };

  await ReportDAL.createReport(newReport, maxReports, contentReportLimit);

  return new CrocoResponse("User reported", null);
}

export async function revokeAllTokens(
  req: CrocoRequest,
): Promise<CrocoResponse> {
  const { uid } = req.ctx.decodedToken;
  await AuthUtil.revokeTokensByUid(uid);
  void addImportantLog("user_tokens_revoked", "", uid);
  return new CrocoResponse("All tokens revoked", null);
}

/**
 * C24 / INF-053 / INF-053a — croco calc has **no backend mail transport**. The
 * email client, queue, worker and templates were deleted, `nodemailer` is not a
 * dependency, and no `EMAIL_*` variables are provisioned. Verification and
 * password-reset mail is sent by **Firebase Auth from its own domain**, which
 * only the *client* SDK can trigger (`sendEmailVerification`,
 * `sendPasswordResetEmail`) — `firebase-admin` can generate an action link but
 * cannot deliver it, and returning that link over HTTP would hand anyone a
 * password reset for any address.
 *
 * These two endpoints therefore survive only in the contract. They are answered
 * with 503 ("Endpoint disabled", the sole 5xx the error middleware deliberately
 * does not log as a system fault) rather than a 200 no-op, because a silent 200
 * would make the UI report "verification email sent" when nothing was sent.
 *
 * The endpoints themselves must be deleted from `packages/contracts` (WP-03) and
 * their two callers moved to the Firebase client SDK (WP-08/WP-09) — the pattern
 * already used in `frontend/src/ts/components/modals/GoogleSignUpModal.tsx`.
 * Until then the router must stay type-complete or `createExpressEndpoints`
 * throws at boot and the whole API fails to start.
 */
const NO_BACKEND_MAIL_MESSAGE =
  "This endpoint is disabled: croco calc sends account email through Firebase Auth, not the backend. Please use the in-app Firebase flow.";

export async function verificationEmail(
  _req: CrocoRequest,
): Promise<CrocoResponse> {
  throw new CrocoError(503, NO_BACKEND_MAIL_MESSAGE);
}

export async function forgotPasswordEmail(
  _req: CrocoRequest<undefined, ForgotPasswordEmailRequest>,
): Promise<CrocoResponse> {
  throw new CrocoError(503, NO_BACKEND_MAIL_MESSAGE);
}

/**
 * AC-119: the all-time boards croco calc keeps are `time 4` and `time 8` only,
 * and there is no language axis (INV-153). WP-10 owns `dal/leaderboards.ts` and
 * the ranking itself; this only shapes the response.
 */
async function getAllTimeLbs(uid: string): Promise<AllTimeLbs> {
  const entries = await Promise.all(
    (["4", "8"] as const).map(async (mode2) => {
      const rank = await LeaderboardsDAL.getRank("time", mode2, uid);
      const count = await LeaderboardsDAL.getCount("time", mode2);

      if (rank === false || rank === null) {
        return [mode2, undefined] as const;
      }

      return [mode2, { rank: rank.rank, count }] as const;
    }),
  );

  return {
    time: Object.fromEntries(entries),
  };
}

export function generateCurrentTestActivity(
  testActivity: CountByYearAndDay | undefined,
): TestActivity | undefined {
  const thisYear = Dates.startOfYear(new UTCDateMini());
  const lastYear = Dates.startOfYear(Dates.subYears(thisYear, 1));

  let thisYearData = testActivity?.[thisYear.getFullYear().toString()];
  let lastYearData = testActivity?.[lastYear.getFullYear().toString()];

  if (lastYearData === undefined && thisYearData === undefined) {
    return undefined;
  }

  lastYearData = lastYearData ?? [];
  thisYearData = thisYearData ?? [];

  //make sure lastYearData covers the full year
  if (lastYearData.length < Dates.getDaysInYear(lastYear)) {
    lastYearData.push(
      ...(new Array(Dates.getDaysInYear(lastYear) - lastYearData.length).fill(
        undefined,
      ) as (number | null)[]),
    );
  }
  //use enough days of the last year to have 372 days in total to always fill the first week of the graph
  lastYearData = lastYearData.slice(-372 + thisYearData.length);

  const lastDay = Dates.startOfDay(
    Dates.addDays(thisYear, thisYearData.length - 1),
  );

  return {
    testsByDays: [...lastYearData, ...thisYearData],
    lastDay: lastDay.valueOf(),
  };
}

export async function getTestActivity(
  req: CrocoRequest,
): Promise<GetTestActivityResponse> {
  const { uid } = req.ctx.decodedToken;
  const user = await UserDAL.getPartialUser(uid, "testActivity", [
    "testActivity",
  ]);

  return new CrocoResponse(
    "Test activity data retrieved",
    user.testActivity ?? null,
  );
}

async function firebaseDeleteUserIgnoreError(uid: string): Promise<void> {
  try {
    await AuthUtil.deleteUser(uid);
  } catch (e) {
    //ignore
  }
}

export async function getCurrentTestActivity(
  req: CrocoRequest,
): Promise<GetCurrentTestActivityResponse> {
  const { uid } = req.ctx.decodedToken;

  const user = await UserDAL.getPartialUser(uid, "current test activity", [
    "testActivity",
  ]);
  const data = generateCurrentTestActivity(user.testActivity);
  return new CrocoResponse(
    "Current test activity data retrieved",
    data ?? null,
  );
}

export async function getFriends(
  req: CrocoRequest,
): Promise<GetFriendsResponse> {
  const { uid } = req.ctx.decodedToken;
  const data = await UserDAL.getFriends(uid);

  return new CrocoResponse("Friends retrieved", data);
}
