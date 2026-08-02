import { Mode, PersonalBest, PersonalBests } from "@croco-calc/schemas/shared";
import { Result as ResultType } from "@croco-calc/schemas/results";
import {
  isDefaultSettingsId,
  LeaderboardMode2,
  LEADERBOARD_TIMES,
} from "@croco-calc/schemas/math";

/**
 * The denormalised "best eligible result per board" projection the all-time
 * leaderboard aggregation reads (`dal/leaderboards.ts`).
 *
 * monkeytype nested a language level under `mode2`; croco calc has no language
 * dimension at all (AC-113, INV-153), so a board is identified by `mode2` alone
 * and the innermost value is the personal best itself.
 */
export type LbPersonalBests = {
  time: Partial<Record<LeaderboardMode2, PersonalBest>>;
};

type CheckAndUpdatePbResult = {
  isPb: boolean;
  personalBests: PersonalBests;
  lbPersonalBests?: LbPersonalBests;
};

type Result = Omit<ResultType<Mode>, "_id" | "name">;

/**
 * AC-065 / C31 — personal bests are keyed on `(mode2, settingsId)` and the
 * comparison is on `score`. A result is a PB iff its `score` **strictly** exceeds
 * the stored best for the same pair, so an equal score never overwrites the older
 * (and therefore earlier-achieved) entry.
 */
export function checkAndUpdatePb(
  userPersonalBests: PersonalBests,
  lbPersonalBests: LbPersonalBests | undefined,
  result: Result,
): CheckAndUpdatePbResult {
  const mode = result.mode;
  const mode2 = result.mode2;

  const userPb = userPersonalBests ?? { time: {} };
  userPb[mode] ??= {};
  userPb[mode][mode2] ??= [];

  const bests = userPb[mode][mode2];
  const personalBestMatch = bests.find((pb) => matchesPersonalBest(result, pb));

  let isPb = true;

  if (personalBestMatch !== undefined) {
    isPb = updatePersonalBest(personalBestMatch, result);
  } else {
    bests.push(buildPersonalBest(result));
  }

  if (lbPersonalBests !== undefined && lbPersonalBests !== null) {
    const newLbPb = updateLeaderboardPersonalBests(
      userPb,
      lbPersonalBests,
      result,
    );
    if (newLbPb !== null) {
      lbPersonalBests = newLbPb;
    }
  }

  return {
    isPb,
    personalBests: userPb,
    lbPersonalBests,
  };
}

/**
 * C31: the PB key. `mode2` is already the record key, so the only remaining
 * discriminator is the settings signature — one string equality against the
 * value frozen on the result at submission time (SB-178).
 */
function matchesPersonalBest(
  result: Result,
  personalBest: PersonalBest,
): boolean {
  if (result.settingsId === undefined) {
    throw new Error("Missing result data (matchesPersonalBest)");
  }
  return result.settingsId === personalBest.settingsId;
}

function assertComplete(result: Result, caller: string): void {
  if (
    result.score === undefined ||
    result.correct === undefined ||
    result.wrong === undefined ||
    result.acc === undefined ||
    result.tpm === undefined ||
    result.spm === undefined ||
    result.settings === undefined ||
    result.settingsId === undefined
  ) {
    throw new Error(`Missing result data (${caller})`);
  }
}

function updatePersonalBest(
  personalBest: PersonalBest,
  result: Result,
): boolean {
  // AC-065 — strictly greater.
  if (personalBest.score >= result.score) {
    return false;
  }

  assertComplete(result, "updatePersonalBest");

  personalBest.score = result.score;
  personalBest.correct = result.correct;
  personalBest.wrong = result.wrong;
  personalBest.acc = result.acc;
  personalBest.tpm = result.tpm;
  personalBest.spm = result.spm;
  personalBest.settings = result.settings;
  personalBest.settingsId = result.settingsId;
  personalBest.timestamp = Date.now();

  return true;
}

function buildPersonalBest(result: Result): PersonalBest {
  assertComplete(result, "buildPersonalBest");
  return {
    score: result.score,
    correct: result.correct,
    wrong: result.wrong,
    acc: result.acc,
    tpm: result.tpm,
    spm: result.spm,
    settings: result.settings,
    settingsId: result.settingsId,
    timestamp: Date.now(),
  };
}

/**
 * Recomputes the denormalised leaderboard PB for the board this result belongs
 * to. Only default-settings runs at `time` 4 or 8 have a board at all (SB-175 as
 * restated by C31), so nothing else can ever touch `lbPersonalBests`.
 */
export function updateLeaderboardPersonalBests(
  userPersonalBests: PersonalBests,
  lbPersonalBests: LbPersonalBests,
  result: Result,
): LbPersonalBests | null {
  if (!shouldUpdateLeaderboardPersonalBests(result)) {
    return null;
  }

  const lbPb: LbPersonalBests = lbPersonalBests ?? { time: {} };
  lbPb.time ??= {};

  const mode2 = result.mode2 as LeaderboardMode2;
  const stored = userPersonalBests.time?.[mode2] ?? [];

  // The board is the *default settings* board, so the candidate is the stored PB
  // carrying `LEADERBOARD_SETTINGS_ID` — never simply the highest-scoring entry,
  // which could have been set under an easier configuration.
  const candidate = stored.find((pb) => isDefaultSettingsId(pb.settingsId));
  if (candidate === undefined) return null;

  const current = lbPb.time[mode2];
  if (current === undefined || current.score < candidate.score) {
    lbPb.time[mode2] = candidate;
  }

  return lbPb;
}

function shouldUpdateLeaderboardPersonalBests(result: Result): boolean {
  return (
    result.mode === "time" &&
    (LEADERBOARD_TIMES as readonly number[]).includes(Number(result.mode2)) &&
    isDefaultSettingsId(result.settingsId)
  );
}
