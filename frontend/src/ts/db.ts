import Ape from "./ape";
import { showErrorNotification } from "./states/notifications";
import { isAuthenticated } from "./states/core";
import * as Dates from "date-fns";
import {
  TestActivityCalendar,
  ModifiableTestActivityCalendar,
} from "./elements/test-activity-calendar";
import { showLoaderBar, hideLoaderBar } from "./states/loader-bar";
import { Mode, Mode2, PersonalBest } from "@croco-calc/schemas/shared";
import { MathGeneratorSettings } from "@croco-calc/schemas/math";
import {
  getDefaultSnapshot,
  Snapshot,
  SnapshotResult,
} from "./constants/default-snapshot";
import { getFirstDayOfTheWeek } from "./utils/date-and-time";
import { authEvent } from "./events/auth";
import { configurationPromise } from "./ape/server-configuration";
import { insertLocalResult } from "./collections/results";
import {
  setLastResult,
  _setSnapshot as setSolidSnapshot,
} from "./states/snapshot";
import { XpBreakdown } from "@croco-calc/schemas/results";
import { setXpBarData } from "./states/header";
import { fetchUserFromApi } from "./ape/user";
import { SnapshotInitError } from "./utils/snapshot-init-error";

let dbSnapshot: Snapshot | undefined;
const firstDayOfTheWeek = getFirstDayOfTheWeek();

export function getSnapshot(): Snapshot | undefined {
  return dbSnapshot;
}

export function setSnapshot(
  newSnapshot: Snapshot | undefined,
  options?: { dispatchEvent?: boolean },
): void {
  const originalBanned = dbSnapshot?.banned;
  const originalVerified = dbSnapshot?.verified;
  const lbOptOut = dbSnapshot?.lbOptOut;

  //not allowing user to override these values i guess?
  try {
    delete newSnapshot?.banned;
  } catch {}
  try {
    delete newSnapshot?.verified;
  } catch {}
  try {
    delete newSnapshot?.lbOptOut;
  } catch {}
  dbSnapshot = newSnapshot;
  if (dbSnapshot) {
    dbSnapshot.banned = originalBanned;
    dbSnapshot.verified = originalVerified;
    dbSnapshot.lbOptOut = lbOptOut;
  }

  if (options?.dispatchEvent !== false) {
    authEvent.dispatch({ type: "snapshotUpdated", data: { isInitial: false } });
  }

  setSolidSnapshot(newSnapshot);
}

export async function initSnapshot(): Promise<Snapshot | false> {
  //send api request with token that returns the data needed for the snapshot
  const snap = getDefaultSnapshot();
  await configurationPromise;

  try {
    if (!isAuthenticated()) return false;

    const [userData] = await Promise.all([fetchUserFromApi()]);

    if (userData === null || userData === undefined) {
      throw new SnapshotInitError(
        `Request was successful but user data is null/undefined`,
        200,
      );
    }

    snap.name = userData.name;
    snap.personalBests = userData.personalBests;
    snap.personalBests ??= { time: {} };
    snap.personalBests.time ??= {};

    snap.banned = userData.banned;
    snap.lbOptOut = userData.lbOptOut;
    snap.verified = userData.verified;
    snap.needsToChangeName = userData.needsToChangeName;
    //AC-013 / AC-014: the time-at-the-keyboard total is "time spent" everywhere.
    snap.testStats = {
      timeSpent: userData.timeSpent ?? 0,
      startedTests: userData.startedTests ?? 0,
      completedTests: userData.completedTests ?? 0,
    };
    snap.details = userData.profileDetails;
    snap.addedAt = userData.addedAt;
    snap.xp = userData.xp ?? 0;
    snap.inboxUnreadSize = userData.inboxUnreadSize ?? 0;
    snap.allTimeLbs = userData.allTimeLbs;

    if (userData.testActivity !== undefined) {
      snap.testActivity = new ModifiableTestActivityCalendar(
        userData.testActivity.testsByDays,
        new Date(userData.testActivity.lastDay),
        firstDayOfTheWeek,
      );
    }

    if (userData.lbMemory !== undefined) {
      snap.lbMemory = userData.lbMemory;
    }

    dbSnapshot = snap;

    return dbSnapshot;
  } catch (e) {
    dbSnapshot = getDefaultSnapshot();
    throw e;
  } finally {
    setSolidSnapshot(dbSnapshot);
  }
}

/**
 * AC-065 / master C31: personal bests are keyed on `(mode2, settingsId)` and
 * nothing else — there is no language, difficulty, punctuation or lazy-mode
 * dimension left to disambiguate them.
 */
export function getLocalPB(
  mode2: Mode2<"time">,
  settingsId: string,
): PersonalBest | undefined {
  return dbSnapshot?.personalBests?.time?.[mode2]?.find(
    (pb) => pb.settingsId === settingsId,
  );
}

function saveLocalPB(
  mode2: Mode2<"time">,
  settingsId: string,
  settings: MathGeneratorSettings,
  score: number,
  acc: number,
  tpm: number,
  spm: number,
  correct: number,
  wrong: number,
): void {
  if (!dbSnapshot) return;

  dbSnapshot.personalBests ??= { time: {} };
  dbSnapshot.personalBests.time ??= {};
  dbSnapshot.personalBests.time[mode2] ??= [];

  const bests = dbSnapshot.personalBests.time[mode2];
  const existing = bests.find((pb) => pb.settingsId === settingsId);

  if (existing !== undefined) {
    existing.score = score;
    existing.acc = acc;
    existing.tpm = tpm;
    existing.spm = spm;
    existing.correct = correct;
    existing.wrong = wrong;
    existing.settings = settings;
    existing.timestamp = Date.now();
  } else {
    bests.push({
      score,
      acc,
      tpm,
      spm,
      correct,
      wrong,
      settings,
      settingsId,
      timestamp: Date.now(),
    });
  }
}

/**
 * AC-128: the "since you last checked" memory is keyed by `(mode, mode2)` only.
 * The language key upstream threaded through here is gone (AC-113).
 */
export async function updateLbMemory<M extends Mode>(
  mode: M,
  mode2: Mode2<M> | undefined,
  rank: number,
  api = false,
): Promise<void> {
  if (mode2 === undefined) return;
  if (mode !== "time") return;

  const snapshot = getSnapshot();
  if (!snapshot) return;

  snapshot.lbMemory ??= { time: {} };
  snapshot.lbMemory.time ??= {};

  const timeMode2 = mode2;
  const current = snapshot.lbMemory.time[timeMode2];
  snapshot.lbMemory.time[timeMode2] = rank;

  if (api && current !== rank) {
    await Ape.users.updateLeaderboardMemory({
      body: { mode: "time", mode2: timeMode2, rank },
    });
  }
  setSnapshot(snapshot);
}

export type SaveLocalResultData = {
  xp?: number;
  xpBreakdown?: XpBreakdown;
  result?: SnapshotResult<Mode>;
  isPb?: boolean;
};

export function saveLocalResult(data: SaveLocalResultData): void {
  const snapshot = getSnapshot();
  if (!snapshot) return;

  if (data.result !== undefined) {
    void insertLocalResult({ result: data.result });
    setLastResult(data.result);
    if (snapshot.testActivity !== undefined) {
      snapshot.testActivity.increment(new Date(data.result.timestamp));
    }
    snapshot.testStats ??= {
      timeSpent: 0,
      startedTests: 0,
      completedTests: 0,
    };

    const time =
      data.result.testDuration +
      data.result.incompleteTestSeconds -
      data.result.afkDuration;

    snapshot.testStats.timeSpent += time;
    snapshot.testStats.startedTests += data.result.restartCount + 1;
    snapshot.testStats.completedTests += 1;

    if (data.isPb) {
      saveLocalPB(
        data.result.mode2,
        data.result.settingsId,
        data.result.settings,
        data.result.score,
        data.result.acc,
        data.result.tpm,
        data.result.spm,
        data.result.correct,
        data.result.wrong,
      );
    }
  }

  if (data.xp !== undefined) {
    snapshot.xp ??= 0;
    snapshot.xp += data.xp;
  }

  setSnapshot(snapshot, {
    dispatchEvent: false,
  });
  if (data.xp !== undefined) {
    setXpBarData({
      addedXp: data.xp,
      resultingXp: snapshot.xp,
      breakdown: data.xpBreakdown,
    });
  }
}

export function addXp(xp: number, breakdown?: XpBreakdown): void {
  const snapshot = getSnapshot();
  if (!snapshot) return;

  snapshot.xp ??= 0;
  snapshot.xp += xp;
  setSnapshot(snapshot, {
    dispatchEvent: false,
  });
  setXpBarData({
    addedXp: xp,
    resultingXp: snapshot.xp,
    breakdown: breakdown,
  });
}

export function updateInboxUnreadSize(newSize: number): void {
  const snapshot = getSnapshot();
  if (!snapshot) return;

  snapshot.inboxUnreadSize = newSize;
  setSnapshot(snapshot);
}

/**
 * AC-069 / AC-017: every year since the account was created is fetchable — the
 * upstream premium gate is gone.
 */
export async function getTestActivityCalendar(
  yearString: string,
): Promise<TestActivityCalendar | undefined> {
  if (!isAuthenticated() || dbSnapshot === undefined) return undefined;

  if (yearString === "current") return dbSnapshot.testActivity;

  const currentYear = new Date().getFullYear().toString();
  if (yearString === currentYear) {
    return dbSnapshot.testActivity?.getFullYearCalendar();
  }

  if (dbSnapshot.testActivityByYear === undefined) {
    showLoaderBar();
    const response = await Ape.users.getTestActivity();
    if (response.status !== 200) {
      showErrorNotification("Error getting test activities", { response });
      hideLoaderBar();
      return undefined;
    }

    dbSnapshot.testActivityByYear = {};
    for (const year in response.body.data) {
      if (year === currentYear) continue;
      const testsByDays = response.body.data[year] ?? [];
      const lastDay = Dates.addDays(
        new Date(parseInt(year), 0, 1),
        testsByDays.length,
      );

      dbSnapshot.testActivityByYear[year] = new TestActivityCalendar(
        testsByDays,
        lastDay,
        firstDayOfTheWeek,
        true,
      );
    }
    hideLoaderBar();
  }

  return dbSnapshot.testActivityByYear[yearString];
}
