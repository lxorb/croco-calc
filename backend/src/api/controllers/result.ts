import * as ResultDAL from "../../dal/result";
import * as PublicDAL from "../../dal/public";
import {
  isDevEnvironment,
  omit,
  replaceObjectId,
  replaceObjectIds,
} from "../../utils/misc";
import objectHash from "object-hash";
import Logger from "../../utils/logger";
import "dotenv/config";
import { CrocoResponse } from "../../utils/croco-response";
import CrocoError from "../../utils/error";
import { isTestTooShort } from "../../utils/validation";
import { validateResult } from "../../anticheat/index";
import CrocoStatusCodes from "../../constants/croco-status-codes";
import { getDailyLeaderboard } from "../../utils/daily-leaderboards";
import * as UserDAL from "../../dal/user";
import * as WeeklyXpLeaderboard from "../../services/weekly-xp-leaderboard";
import { buildDbResult } from "../../utils/result";
import { Configuration } from "@croco-calc/schemas/configuration";
import { addImportantLog, addLog } from "../../dal/logs";
import {
  AddResultRequest,
  AddResultResponse,
  GetLastResultResponse,
  GetResultByIdPath,
  GetResultByIdResponse,
  GetResultsQuery,
  GetResultsResponse,
} from "@croco-calc/contracts/results";
import {
  CompletedEvent,
  PostResultResponse,
  XpBreakdown,
} from "@croco-calc/schemas/results";
import {
  buildSettingsId,
  isLeaderboardEligible,
  MathGeneratorSettings,
} from "@croco-calc/schemas/math";
import { computeMetrics, TASK_LOG_TOOLONG } from "@croco-calc/math-engine";
import { isSafeNumber } from "@croco-calc/util/numbers";
import {
  getCurrentDayTimestamp,
  getStartOfDayTimestamp,
} from "@croco-calc/util/date-and-time";
import { CrocoRequest } from "../types";
import { tryCatch } from "@croco-calc/util/trycatch";
import { getCachedConfiguration } from "../../init/configuration";

export async function getResults(
  req: CrocoRequest<GetResultsQuery>,
): Promise<GetResultsResponse> {
  const { uid } = req.ctx.decodedToken;
  const { onOrAfterTimestamp = NaN, offset = 0 } = req.query;

  const maxLimit = req.ctx.configuration.results.limits.regularUser;

  let limit =
    req.query.limit ??
    Math.min(req.ctx.configuration.results.maxBatchSize, maxLimit);

  if (limit + offset > maxLimit) {
    if (offset < maxLimit) {
      //batch is partly in the allowed range. Set the limit to the max allowed and return partial results.
      limit = maxLimit - offset;
    } else {
      throw new CrocoError(422, `Max results limit of ${maxLimit} exceeded.`);
    }
  }

  const results = await ResultDAL.getResults(uid, {
    onOrAfterTimestamp,
    limit,
    offset,
  });
  void addLog(
    "user_results_requested",
    {
      limit,
      offset,
      onOrAfterTimestamp,
    },
    uid,
  );

  return new CrocoResponse("Results retrieved", replaceObjectIds(results));
}

export async function getResultById(
  req: CrocoRequest<undefined, undefined, GetResultByIdPath>,
): Promise<GetResultByIdResponse> {
  const { uid } = req.ctx.decodedToken;
  const { resultId } = req.params;

  const result = await ResultDAL.getResult(uid, resultId);
  return new CrocoResponse("Result retrieved", replaceObjectId(result));
}

export async function getLastResult(
  req: CrocoRequest,
): Promise<GetLastResultResponse> {
  const { uid } = req.ctx.decodedToken;
  const result = await ResultDAL.getLastResult(uid);
  return new CrocoResponse("Result retrieved", replaceObjectId(result));
}

export async function deleteAll(req: CrocoRequest): Promise<CrocoResponse> {
  const { uid } = req.ctx.decodedToken;

  await ResultDAL.deleteAll(uid);
  void addLog("user_results_deleted", "", uid);
  return new CrocoResponse("All results deleted", null);
}

export async function addResult(
  req: CrocoRequest<undefined, AddResultRequest>,
): Promise<AddResultResponse> {
  const { uid } = req.ctx.decodedToken;

  const user = await UserDAL.getUser(uid, "add result");

  if (user.needsToChangeName) {
    throw new CrocoError(
      403,
      "Please change your name before submitting a result",
    );
  }

  const completedEvent = req.body.result;
  completedEvent.uid = uid;

  if (isTestTooShort(completedEvent)) {
    const status = CrocoStatusCodes.TEST_TOO_SHORT;
    throw new CrocoError(status.code, status.message);
  }

  // -----------------------------------------------------------------------
  // BL-5. monkeytype rejected every result with `acc < 75` here, and its schema
  // floored `acc` at 50. A math trainer legitimately produces 40-70 % accuracy,
  // so both constraints are **gone** and neither may come back: accuracy is a
  // difficulty signal, never a cheat signal (ME-183). The schema floor was
  // removed by WP-03 (`packages/schemas/src/results.ts` -> `acc: PercentageSchema`,
  // no `.min()`); this is the controller half of the same fix.
  // -----------------------------------------------------------------------

  const resulthash = completedEvent.hash;
  if (req.ctx.configuration.results.objectHashCheckEnabled) {
    // ME-175 — kept on top of the regeneration check, not replaced by it.
    const objectToHash = omit(completedEvent, ["hash"]);
    const serverhash = objectHash(objectToHash);
    if (serverhash !== resulthash) {
      void addLog(
        "incorrect_result_hash",
        {
          serverhash,
          resulthash,
          result: completedEvent,
        },
        uid,
      );
      const status = CrocoStatusCodes.RESULT_HASH_INVALID;
      throw new CrocoError(status.code, "Incorrect result hash");
    }
  } else {
    Logger.warning("Object hash check is disabled, skipping hash check");
  }

  // The three settings views on the payload have to agree with each other before
  // anything downstream keys off them: `settingsId` is what personal bests and
  // leaderboard eligibility are keyed on (C4, C31), so it is **derived** here and
  // compared, never taken on trust (ME-019).
  assertSettingsConsistent(completedEvent);
  assertIdleWithinTest(completedEvent);

  if (user.suspicious === true) {
    await addImportantLog("suspicious_user_result", completedEvent, uid);
  }

  // -- anti-cheat ---------------------------------------------------------
  const serverNow = Date.now();
  const verdict = validateResult({
    mathSeed: completedEvent.mathSeed,
    mathSettings: completedEvent.mathSettings,
    engineVersion: completedEvent.engineVersion,
    taskLog: completedEvent.taskLog,
    testDuration: completedEvent.testDuration,
    timestamp: completedEvent.timestamp,
    answered: completedEvent.correct + completedEvent.wrong,
    serverNow,
  });

  if (!verdict.valid) {
    const { failure } = verdict;
    void addLog(
      `anticheat_${failure.code.replace(/-/g, "_")}`,
      {
        ...failure.details,
        mathSeed: completedEvent.mathSeed,
        mathSettings: completedEvent.mathSettings,
        engineVersion: completedEvent.engineVersion,
      },
      uid,
    );

    if (failure.code === "task-log-invalid") {
      // A log that does not reproduce from its own seed cannot happen by
      // accident, so it counts towards the auto-ban budget. Plausibility
      // violations deliberately do **not** — they are heuristics, and BL-5 is
      // the standing reminder of what over-eager heuristics cost.
      await recordAutoBan(uid, req.ctx.configuration.users.autoBan);
    }

    throw new CrocoError(failure.status, failure.message);
  } else if (isDevEnvironment()) {
    Logger.success("Result data validated");
  }

  // The task log has now been proven to reproduce from `(mathSeed, mathSettings)`,
  // so it — and only it — is the source of truth for the metrics. Recomputing
  // them closes the gap where a genuine log is submitted next to a fabricated
  // `score` (AC-025).
  assertMetricsMatchTaskLog(completedEvent);

  const { data: lastResultTimestamp } = await tryCatch(
    ResultDAL.getLastResultTimestamp(uid),
  );

  //the client timestamp is unreliable (system clock), so the stored one is ours.
  //ME-182(c) has already bounded the submitted value.
  completedEvent.timestamp = Math.floor(serverNow / 1000) * 1000;

  //check if now is earlier than last result plus duration (-1 second as a buffer)
  const testDurationMilis = completedEvent.testDuration * 1000;
  const incompleteTestsMilis = completedEvent.incompleteTestSeconds * 1000;
  const earliestPossible =
    (lastResultTimestamp ?? 0) + testDurationMilis + incompleteTestsMilis;
  const nowNoMilis = Math.floor(serverNow / 1000) * 1000;
  if (
    isSafeNumber(lastResultTimestamp) &&
    nowNoMilis < earliestPossible - 1000
  ) {
    void addLog(
      "invalid_result_spacing",
      {
        lastTimestamp: lastResultTimestamp,
        earliestPossible,
        now: nowNoMilis,
        testDuration: testDurationMilis,
        difference: nowNoMilis - earliestPossible,
      },
      uid,
    );
    const status = CrocoStatusCodes.RESULT_SPACING_INVALID;
    throw new CrocoError(status.code, "Invalid result spacing");
  }

  // ME-175 — the duplicate/replay check.
  if (req.ctx.configuration.users.lastHashesCheck.enabled) {
    let lastHashes = user.lastReultHashes ?? [];
    if (lastHashes.includes(resulthash)) {
      void addLog(
        "duplicate_result",
        {
          lastHashes,
          resulthash,
          result: completedEvent,
        },
        uid,
      );
      const status = CrocoStatusCodes.DUPLICATE_RESULT;
      throw new CrocoError(status.code, "Duplicate result");
    } else {
      lastHashes.unshift(resulthash);
      const maxHashes = req.ctx.configuration.users.lastHashesCheck.maxHashes;
      if (lastHashes.length > maxHashes) {
        lastHashes = lastHashes.slice(0, maxHashes);
      }
      await UserDAL.updateLastHashes(uid, lastHashes);
    }
  }

  // AC-065 / C38 — every completed run is a PB candidate. There is no bail-out
  // concept in croco calc, so there is no condition to gate this on (AC-187).
  const isPb = await UserDAL.checkIfPb(uid, user, completedEvent);

  const afk = completedEvent.afkDuration;
  const totalDurationSolvedSeconds =
    completedEvent.testDuration + completedEvent.incompleteTestSeconds - afk;
  void UserDAL.updateSolveStats(
    uid,
    completedEvent.restartCount,
    totalDurationSolvedSeconds,
  );
  void PublicDAL.updateStats(
    completedEvent.restartCount,
    totalDurationSolvedSeconds,
  );

  const dailyLeaderboardsConfig = req.ctx.configuration.dailyLeaderboards;
  const dailyLeaderboard = getDailyLeaderboard(
    completedEvent.mode,
    completedEvent.mode2,
    dailyLeaderboardsConfig,
  );

  let dailyLeaderboardRank = -1;

  const minTimeSpent = (await getCachedConfiguration(true)).leaderboards
    .minTimeSpent;

  // AC-120 — user eligibility.
  const userEligibleForLeaderboard =
    user.banned !== true &&
    user.lbOptOut !== true &&
    (isDevEnvironment() || (user.timeSpent ?? 0) > minTimeSpent);

  // AC-121 — result eligibility for the *speed* boards: user eligible, `mode2`
  // is 4 or 8, and `settingsId` equals the frozen `LEADERBOARD_SETTINGS_ID`
  // (C4). Clause 4 is struck by C38 — croco calc has no early-exit concept at
  // all (AC-187), so there is no flag left to test — and clause 5 (the
  // validation pipeline) has already thrown if it failed.
  const validResultCriteria =
    userEligibleForLeaderboard &&
    isLeaderboardEligible(completedEvent.settingsId, completedEvent.mode2);

  if (dailyLeaderboard && validResultCriteria) {
    dailyLeaderboardRank = await dailyLeaderboard.addResult(
      {
        uid,
        name: user.name,
        score: completedEvent.score,
        correct: completedEvent.correct,
        wrong: completedEvent.wrong,
        acc: completedEvent.acc,
        tpm: completedEvent.tpm,
        timestamp: completedEvent.timestamp,
      },
      dailyLeaderboardsConfig,
    );
    if (dailyLeaderboardRank >= 1 && dailyLeaderboardRank <= 10) {
      const now = Date.now();
      const reset = getCurrentDayTimestamp();
      const limit = 6 * 60 * 60 * 1000;
      if (now - reset >= limit) {
        await addLog("daily_leaderboard_top_10_result", completedEvent, uid);
      }
    }
  }

  const xpGained = await calculateXp(
    completedEvent,
    req.ctx.configuration.users.xp,
    lastResultTimestamp,
    user.xp ?? 0,
  );

  // AC-034 — both invariants are 500s with the offending payload attached.
  if (isNaN(xpGained.xp)) {
    throw new CrocoError(
      500,
      "Calculated XP is NaN",
      JSON.stringify({ xpGained, result: completedEvent }),
      uid,
    );
  }

  if (xpGained.xp < 0) {
    throw new CrocoError(
      500,
      "Calculated XP is negative",
      JSON.stringify({ xpGained, result: completedEvent }),
      uid,
    );
  }

  // AC-123 — the weekly XP board deliberately does **not** apply the
  // default-settings gate or the 4/8-minute gate; it only needs an eligible user
  // and XP > 0, so the weekly totals agree with the profile's XP.
  const weeklyXpLeaderboardConfig = req.ctx.configuration.leaderboards.weeklyXp;
  let weeklyXpLeaderboardRank = -1;

  const weeklyXpLeaderboard = WeeklyXpLeaderboard.get(
    weeklyXpLeaderboardConfig,
  );
  if (userEligibleForLeaderboard && xpGained.xp > 0 && weeklyXpLeaderboard) {
    weeklyXpLeaderboardRank = await weeklyXpLeaderboard.addResult(
      weeklyXpLeaderboardConfig,
      {
        entry: {
          uid,
          name: user.name,
          lastActivityTimestamp: Date.now(),
          timeSpentSeconds: totalDurationSolvedSeconds,
        },
        xpGained: xpGained.xp,
      },
    );
  }

  const dbresult = buildDbResult(completedEvent, user.name, isPb);
  const addedResult = await ResultDAL.addResult(uid, dbresult);

  await UserDAL.incrementXp(uid, xpGained.xp);
  await UserDAL.incrementTestActivity(user, completedEvent.timestamp);

  if (isPb) {
    void addLog(
      "user_new_pb",
      `${completedEvent.mode} ${completedEvent.mode2} score ${completedEvent.score} ${completedEvent.acc}% ${completedEvent.tpm} tpm (${addedResult.insertedId})`,
      uid,
    );
  }

  const data: PostResultResponse = {
    isPb,
    insertedId: addedResult.insertedId.toHexString(),
    xp: xpGained.xp,
    dailyXpBonus: xpGained.dailyBonus ?? false,
    xpBreakdown: xpGained.breakdown ?? {},
  };

  if (dailyLeaderboardRank !== -1) {
    data.dailyLeaderboardRank = dailyLeaderboardRank;
  }

  if (weeklyXpLeaderboardRank !== -1) {
    data.weeklyXpLeaderboardRank = weeklyXpLeaderboardRank;
  }

  return new CrocoResponse("Result saved", data);
}

/**
 * ME-019 / C4 — `settingsId` is derived from the settings snapshot, and the
 * snapshot itself has to be the same one the tasks were generated from, or the
 * regeneration check would be verifying a different test than the one the
 * leaderboard is keyed on.
 */
function assertSettingsConsistent(completedEvent: CompletedEvent): void {
  const { mathSettings, settings, settingsId, mode2, testDuration } =
    completedEvent;

  const derivedFromSnapshot = buildSettingsId(settings);
  if (derivedFromSnapshot !== settingsId) {
    throw new CrocoError(
      CrocoStatusCodes.RESULT_DATA_INVALID.code,
      "Result settings id does not match its settings",
    );
  }

  const generatorSettings: MathGeneratorSettings = {
    addition: mathSettings.addition,
    multiplication: mathSettings.multiplication,
    division: mathSettings.division,
    fractionAddition: mathSettings.fractionAddition,
    fractionMultiplication: mathSettings.fractionMultiplication,
    decimals: mathSettings.decimals,
    negatives: mathSettings.negatives,
  };
  if (buildSettingsId(generatorSettings) !== settingsId) {
    throw new CrocoError(
      CrocoStatusCodes.RESULT_DATA_INVALID.code,
      "Result settings do not match the generator settings",
    );
  }

  if (mode2 !== `${mathSettings.time}`) {
    throw new CrocoError(
      CrocoStatusCodes.RESULT_DATA_INVALID.code,
      "Result mode2 does not match the test length",
    );
  }

  // ME-182(a) is also enforced by the plausibility layer; failing here first
  // gives a message that names the actual problem.
  if (testDuration !== mathSettings.time * 60) {
    throw new CrocoError(
      CrocoStatusCodes.RESULT_DATA_INVALID.code,
      "Result duration does not match the test length",
    );
  }
}

/**
 * C37 — `afkDuration` is idle time *inside* the test, so it cannot exceed the
 * test. The schema only bounds it below (`z.number().nonnegative()`), and
 * nothing downstream re-checks it:
 *
 *  * `calculateXp` computes `base = (testDuration - afkDuration) * 2`, so an
 *    over-long idle makes the base negative, then the total negative, and
 *    AC-034 turns that into a **500**. A client would be able to make the
 *    server report an internal error at will;
 *  * `totalDurationSolvedSeconds` feeds `updateSolveStats` and
 *    `PublicDAL.updateStats`, so a negative value would run the user's and the
 *    site's lifetime training time *backwards* — silently, and permanently.
 *
 * A malformed number is the client's error, so it is a 4xx, not a 500.
 */
function assertIdleWithinTest(completedEvent: CompletedEvent): void {
  const { afkDuration, testDuration, incompleteTestSeconds } = completedEvent;

  if (afkDuration > testDuration + incompleteTestSeconds) {
    throw new CrocoError(
      CrocoStatusCodes.RESULT_DATA_INVALID.code,
      "Result idle time exceeds the test duration",
    );
  }
}

/** Rounded metrics are compared with a tolerance; counts must match exactly. */
const METRIC_TOLERANCE = 0.011;

function assertMetricsMatchTaskLog(completedEvent: CompletedEvent): void {
  // ME-176's degraded path has no entries left to recompute from. It is
  // unreachable for a plausible result anyway (120 tpm over 480 s caps a
  // legitimate log at 960 entries, below the 1000-entry threshold).
  if (completedEvent.taskLog === TASK_LOG_TOOLONG) return;

  const expected = computeMetrics(
    completedEvent.taskLog,
    completedEvent.testDuration,
  );

  const exact: (keyof typeof expected)[] = ["correct", "wrong", "score"];
  for (const field of exact) {
    if (completedEvent[field] !== expected[field]) {
      throw new CrocoError(
        CrocoStatusCodes.RESULT_DATA_INVALID.code,
        `Reported ${field} does not match the task log`,
      );
    }
  }

  // `consistency` is re-verified here even though it feeds no PB, leaderboard,
  // CSV or XP path (C5) — it is persisted on the result and rendered in the
  // CP-096 `morestats` row, so an unchecked value would be a client-authored
  // number the server vouches for. `consistencyOf` is deterministic over the
  // same `taskLog` and both sides `roundTo2` the kogasa output, so the existing
  // tolerance covers it.
  const rounded: (keyof typeof expected)[] = [
    "acc",
    "tpm",
    "spm",
    "consistency",
  ];
  for (const field of rounded) {
    if (Math.abs(completedEvent[field] - expected[field]) > METRIC_TOLERANCE) {
      throw new CrocoError(
        CrocoStatusCodes.RESULT_DATA_INVALID.code,
        `Reported ${field} does not match the task log`,
      );
    }
  }
}

async function recordAutoBan(
  uid: string,
  autoBanConfig: Configuration["users"]["autoBan"],
): Promise<void> {
  if (!autoBanConfig.enabled) return;
  await UserDAL.recordAutoBanEvent(
    uid,
    autoBanConfig.maxCount,
    autoBanConfig.maxHours,
  );
}

type XpResult = {
  xp: number;
  dailyBonus?: boolean;
  breakdown?: XpBreakdown;
};

/**
 * AC-027 — the mode modifier table, keyed on the **C2 canonical stored
 * literals**. Keying it on the display labels (`100x100`, `xxx/xx`, `1/xx`, …)
 * would make every lookup miss and pin `modeModifier` at a constant 1; AC-039's
 * 1694-XP acceptance test is the guard against exactly that.
 */
const MODE_BONUSES = {
  addition: { off: 0, "100": 0, "1000": 0.05 },
  multiplication: { off: 0, "12": 0.05, "20": 0.1, "100": 0.2 },
  division: { off: 0, tables: 0.05, threeByTwo: 0.15 },
  fractionAddition: { off: 0, "12": 0.1, "99": 0.2 },
} as const;

const BOOLEAN_BONUSES = {
  fractionMultiplication: 0.1,
  decimals: 0.15,
  negatives: 0.1,
} as const;

/** AC-027 — `1 + Σ bonus(setting)` over the seven task-shaping settings. */
export function modeModifierOf(settings: MathGeneratorSettings): number {
  let modifier = 1;
  modifier += MODE_BONUSES.addition[settings.addition];
  modifier += MODE_BONUSES.multiplication[settings.multiplication];
  modifier += MODE_BONUSES.division[settings.division];
  modifier += MODE_BONUSES.fractionAddition[settings.fractionAddition];
  if (settings.fractionMultiplication) {
    modifier += BOOLEAN_BONUSES.fractionMultiplication;
  }
  if (settings.decimals) modifier += BOOLEAN_BONUSES.decimals;
  if (settings.negatives) modifier += BOOLEAN_BONUSES.negatives;
  return modifier;
}

/**
 * AC-025 … AC-039.
 *
 * Dropped from monkeytype's `calculateXp`: the quote / punctuation / numbers /
 * funbox bonuses (no such settings exist), the "corrected everything" bonus
 * (AC-028 — croco calc has no character-level correction), the streak modifier
 * (C17) and the incomplete-tests component (AC-032 — fixed-duration timers have
 * no partial-word notion).
 */
export async function calculateXp(
  result: Pick<
    CompletedEvent,
    "acc" | "testDuration" | "afkDuration" | "settings"
  >,
  xpConfiguration: Configuration["users"]["xp"],
  lastResultTimestamp: number | null,
  currentTotalXp: number,
): Promise<XpResult> {
  const { acc, testDuration, afkDuration, settings } = result;
  const { enabled, gainMultiplier, maxDailyBonus, minDailyBonus } =
    xpConfiguration;

  if (!enabled) {
    return { xp: 0 };
  }

  const breakdown: XpBreakdown = {};

  // AC-026 — XP rewards time on task, not score, so a beginner still levels up.
  // The floor is belt and braces: `assertIdleWithinTest` has already rejected an
  // over-long idle at the controller, and AC-034 would turn a negative base into
  // a 500 rather than a rejection.
  const baseXp = Math.max(0, Math.round((testDuration - afkDuration) * 2));
  breakdown.base = baseXp;

  let modifier = modeModifierOf(settings);

  // AC-028 — the perfect-accuracy bonus. There is deliberately no
  // "corrected everything" counterpart.
  let perfectBonus = 0;
  if (acc === 100) {
    perfectBonus = 0.5;
    modifier += perfectBonus;
    breakdown.fullAccuracy = Math.round(baseXp * perfectBonus);
  }

  // AC-037 — so the breakdown rows sum to the awarded XP.
  breakdown.modes = Math.round(baseXp * (modifier - 1 - perfectBonus));

  // AC-029 — the lower clamp is mandatory. croco calc accuracy legitimately
  // reaches 0 and `result.ts` throws on negative XP (AC-034).
  const accuracyModifier = Math.min(Math.max((acc - 50) / 50, 0), 1);

  // AC-035 — first completed test of a UTC day.
  let dailyBonus = 0;
  if (isSafeNumber(lastResultTimestamp)) {
    const lastResultDay = getStartOfDayTimestamp(lastResultTimestamp);
    const today = getCurrentDayTimestamp();
    if (lastResultDay !== today) {
      const proportionalXp = Math.round(currentTotalXp * 0.05);
      dailyBonus = Math.max(
        Math.min(maxDailyBonus, proportionalXp),
        minDailyBonus,
      );
      breakdown.daily = dailyBonus;
    }
  }

  // AC-030 / AC-031.
  const xpWithModifiers = Math.round(baseXp * modifier);
  const xpAfterAccuracy = Math.round(xpWithModifiers * accuracyModifier);
  breakdown.accPenalty = xpWithModifiers - xpAfterAccuracy;

  // AC-034.
  const totalXp = Math.round(xpAfterAccuracy * gainMultiplier) + dailyBonus;

  // AC-033 — surfaced only when it is doing something.
  if (gainMultiplier !== 1) {
    breakdown.configMultiplier = gainMultiplier;
  }

  return {
    xp: totalXp,
    dailyBonus: dailyBonus > 0,
    breakdown,
  };
}
