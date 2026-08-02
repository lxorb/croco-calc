import { CrocoResponse } from "../../utils/croco-response";
import * as LeaderboardsDAL from "../../dal/leaderboards";
import * as ConnectionsDal from "../../dal/connections";
import CrocoError from "../../utils/error";
import * as DailyLeaderboards from "../../utils/daily-leaderboards";
import * as WeeklyXpLeaderboard from "../../services/weekly-xp-leaderboard";
import {
  DailyLeaderboardQuery,
  GetDailyLeaderboardQuery,
  GetDailyLeaderboardRankQuery,
  GetDailyLeaderboardResponse,
  GetLeaderboardDailyRankResponse,
  GetLeaderboardQuery,
  GetLeaderboardRankQuery,
  GetLeaderboardRankResponse,
  GetLeaderboardResponse,
  GetWeeklyXpLeaderboardQuery,
  GetWeeklyXpLeaderboardRankQuery,
  GetWeeklyXpLeaderboardRankResponse,
  GetWeeklyXpLeaderboardResponse,
} from "@croco-calc/contracts/leaderboards";
import { Configuration } from "@croco-calc/schemas/configuration";
import { isValidLeaderboard } from "@croco-calc/schemas/leaderboards";
import {
  getCurrentDayTimestamp,
  getCurrentWeekTimestamp,
  MILLISECONDS_IN_DAY,
} from "@croco-calc/util/date-and-time";
import { CrocoRequest } from "../types";
import { omit } from "../../utils/misc";

export async function getLeaderboard(
  req: CrocoRequest<GetLeaderboardQuery>,
): Promise<GetLeaderboardResponse> {
  const { mode, mode2, page, pageSize, friendsOnly } = req.query;
  const { uid } = req.ctx.decodedToken;
  const connectionsConfig = req.ctx.configuration.connections;

  // AC-114: `time 4` and `time 8` and nothing else. The matrix lives in
  // `packages/schemas` so the sidebar, the URL parser and the server agree.
  if (!isValidLeaderboard("allTime", mode, mode2)) {
    throw new CrocoError(404, "There is no leaderboard for this mode");
  }

  const friendsOnlyUid = getFriendsOnlyUid(uid, friendsOnly, connectionsConfig);

  const leaderboard = await LeaderboardsDAL.get(
    mode,
    mode2,
    page,
    pageSize,
    friendsOnlyUid,
  );

  if (leaderboard === false) {
    throw new CrocoError(
      503,
      "Leaderboard is currently updating. Please try again in a few seconds.",
    );
  }

  const count = await LeaderboardsDAL.getCount(mode, mode2, friendsOnlyUid);
  const normalizedLeaderboard = leaderboard.map((it) => omit(it, ["_id"]));

  return new CrocoResponse("Leaderboard retrieved", {
    count,
    entries: normalizedLeaderboard,
    pageSize,
  });
}

export async function getRankFromLeaderboard(
  req: CrocoRequest<GetLeaderboardRankQuery>,
): Promise<GetLeaderboardRankResponse> {
  const { mode, mode2, friendsOnly } = req.query;
  const { uid } = req.ctx.decodedToken;
  const connectionsConfig = req.ctx.configuration.connections;

  const data = await LeaderboardsDAL.getRank(
    mode,
    mode2,
    uid,
    getFriendsOnlyUid(uid, friendsOnly, connectionsConfig) !== undefined,
  );
  if (data === false) {
    throw new CrocoError(
      503,
      "Leaderboard is currently updating. Please try again in a few seconds.",
    );
  }

  if (data === null) {
    return new CrocoResponse("Rank retrieved", null);
  }

  return new CrocoResponse("Rank retrieved", omit(data, ["_id"]));
}

function getDailyLeaderboardWithError(
  { mode, mode2, daysBefore }: DailyLeaderboardQuery,
  config: Configuration["dailyLeaderboards"],
): DailyLeaderboards.DailyLeaderboard {
  const customTimestamp =
    daysBefore === undefined
      ? -1
      : getCurrentDayTimestamp() - daysBefore * MILLISECONDS_IN_DAY;

  const dailyLeaderboard = DailyLeaderboards.getDailyLeaderboard(
    mode,
    mode2,
    config,
    customTimestamp,
  );
  if (!dailyLeaderboard) {
    throw new CrocoError(404, "There is no daily leaderboard for this mode");
  }

  return dailyLeaderboard;
}

export async function getDailyLeaderboard(
  req: CrocoRequest<GetDailyLeaderboardQuery>,
): Promise<GetDailyLeaderboardResponse> {
  const { page, pageSize, friendsOnly } = req.query;
  const { uid } = req.ctx.decodedToken;
  const connectionsConfig = req.ctx.configuration.connections;

  const friendUids = await getFriendsUids(
    uid,
    friendsOnly === true,
    connectionsConfig,
  );

  const dailyLeaderboard = getDailyLeaderboardWithError(
    req.query,
    req.ctx.configuration.dailyLeaderboards,
  );

  const results = await dailyLeaderboard.getResults(
    page,
    pageSize,
    req.ctx.configuration.dailyLeaderboards,
    friendUids,
  );

  return new CrocoResponse("Daily leaderboard retrieved", {
    entries: results?.entries ?? [],
    count: results?.count ?? 0,
    // AC-130: croco calc exposes `minScore` where monkeytype exposed `minWpm`.
    minScore: results?.minScore ?? 0,
    pageSize,
  });
}

export async function getDailyLeaderboardRank(
  req: CrocoRequest<GetDailyLeaderboardRankQuery>,
): Promise<GetLeaderboardDailyRankResponse> {
  const { friendsOnly } = req.query;
  const { uid } = req.ctx.decodedToken;
  const connectionsConfig = req.ctx.configuration.connections;

  const friendUids = await getFriendsUids(
    uid,
    friendsOnly === true,
    connectionsConfig,
  );

  const dailyLeaderboard = getDailyLeaderboardWithError(
    req.query,
    req.ctx.configuration.dailyLeaderboards,
  );

  const rank = await dailyLeaderboard.getRank(
    uid,
    req.ctx.configuration.dailyLeaderboards,
    friendUids,
  );

  return new CrocoResponse("Daily leaderboard rank retrieved", rank);
}

function getWeeklyXpLeaderboardWithError(
  config: Configuration["leaderboards"]["weeklyXp"],
  weeksBefore?: number,
): WeeklyXpLeaderboard.WeeklyXpLeaderboard {
  const customTimestamp =
    weeksBefore === undefined
      ? -1
      : getCurrentWeekTimestamp() - weeksBefore * MILLISECONDS_IN_DAY * 7;

  const weeklyXpLeaderboard = WeeklyXpLeaderboard.get(config, customTimestamp);
  if (!weeklyXpLeaderboard) {
    throw new CrocoError(404, "XP leaderboard for this week not found.");
  }

  return weeklyXpLeaderboard;
}

export async function getWeeklyXpLeaderboard(
  req: CrocoRequest<GetWeeklyXpLeaderboardQuery>,
): Promise<GetWeeklyXpLeaderboardResponse> {
  const { page, pageSize, weeksBefore, friendsOnly } = req.query;

  const { uid } = req.ctx.decodedToken;
  const connectionsConfig = req.ctx.configuration.connections;

  const friendUids = await getFriendsUids(
    uid,
    friendsOnly === true,
    connectionsConfig,
  );

  const weeklyXpLeaderboard = getWeeklyXpLeaderboardWithError(
    req.ctx.configuration.leaderboards.weeklyXp,
    weeksBefore,
  );
  const results = await weeklyXpLeaderboard.getResults(
    page,
    pageSize,
    req.ctx.configuration.leaderboards.weeklyXp,
    friendUids,
  );

  return new CrocoResponse("Weekly xp leaderboard retrieved", {
    entries: results?.entries ?? [],
    count: results?.count ?? 0,
    pageSize,
  });
}

export async function getWeeklyXpLeaderboardRank(
  req: CrocoRequest<GetWeeklyXpLeaderboardRankQuery>,
): Promise<GetWeeklyXpLeaderboardRankResponse> {
  const { friendsOnly } = req.query;
  const { uid } = req.ctx.decodedToken;
  const connectionsConfig = req.ctx.configuration.connections;

  const friendUids = await getFriendsUids(
    uid,
    friendsOnly === true,
    connectionsConfig,
  );

  const weeklyXpLeaderboard = getWeeklyXpLeaderboardWithError(
    req.ctx.configuration.leaderboards.weeklyXp,
    req.query.weeksBefore,
  );
  const rankEntry = await weeklyXpLeaderboard.getRank(
    uid,
    req.ctx.configuration.leaderboards.weeklyXp,
    friendUids,
  );

  return new CrocoResponse("Weekly xp leaderboard rank retrieved", rankEntry);
}

async function getFriendsUids(
  uid: string,
  friendsOnly: boolean,
  friendsConfig: Configuration["connections"],
): Promise<string[] | undefined> {
  if (uid !== "" && friendsOnly) {
    if (!friendsConfig.enabled) {
      throw new CrocoError(503, "This feature is currently unavailable.");
    }
    return await ConnectionsDal.getFriendsUids(uid);
  }
  return undefined;
}

function getFriendsOnlyUid(
  uid: string,
  friendsOnly: boolean | undefined,
  friendsConfig: Configuration["connections"],
): string | undefined {
  if (uid !== "" && friendsOnly === true) {
    if (!friendsConfig.enabled) {
      throw new CrocoError(503, "This feature is currently unavailable.");
    }
    return uid;
  }
  return undefined;
}
