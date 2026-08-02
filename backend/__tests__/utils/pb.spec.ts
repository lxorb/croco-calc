import { describe, it, expect } from "vitest";
import * as pb from "../../src/utils/pb";
import { Mode, PersonalBest, PersonalBests } from "@croco-calc/schemas/shared";
import { Result } from "@croco-calc/schemas/results";
import {
  buildSettingsId,
  LEADERBOARD_SETTINGS_ID,
  type MathGeneratorSettings,
} from "@croco-calc/schemas/math";

/**
 * AC-065 / C31 — personal bests.
 *
 * The whole key changed from monkeytype's. A PB used to be keyed on
 * `(mode, mode2, language, difficulty, punctuation, numbers, lazyMode)` and
 * compared on `wpm`; croco calc keys on `(mode2, settingsId)` and compares on
 * `score`. There is no language dimension anywhere (AC-113, INV-153), so
 * `LbPersonalBests` is one level shallower than monkeytype's too. This spec was
 * still written against `wpm` / `english` / `"15"` and asserted the old shape.
 *
 * The rules worth pinning:
 *  * a PB is **strictly** greater — an equal score must not overwrite the older,
 *    earlier-achieved entry (AC-065);
 *  * different `settingsId`s are different PBs and coexist in the same `mode2`
 *    bucket, so a run under easier settings can never shadow a harder one;
 *  * `lbPersonalBests` only ever tracks the **default-settings** PB at `time` 4
 *    or 8 — picking the highest-scoring entry instead would put an easy-settings
 *    run on the leaderboard (SB-175/C31).
 */

const DEFAULT_SETTINGS: MathGeneratorSettings = {
  addition: "1000",
  multiplication: "100",
  division: "threeByTwo",
  fractionAddition: "99",
  fractionMultiplication: true,
  decimals: true,
  negatives: true,
};

/** Deliberately easier than the board settings. */
const EASY_SETTINGS: MathGeneratorSettings = {
  addition: "100",
  multiplication: "12",
  division: "off",
  fractionAddition: "off",
  fractionMultiplication: false,
  decimals: false,
  negatives: false,
};

const EASY_SETTINGS_ID = buildSettingsId(EASY_SETTINGS);

function emptyPbs(): PersonalBests {
  return { time: {} };
}

function result(
  over: Partial<Result<Mode>> & { settings?: MathGeneratorSettings } = {},
): Result<Mode> {
  const settings = over.settings ?? DEFAULT_SETTINGS;
  return {
    score: 190,
    correct: 200,
    wrong: 10,
    acc: 95.24,
    tpm: 26.25,
    spm: 23.75,
    consistency: 82,
    mode: "time",
    mode2: "8",
    timestamp: 1_754_000_000_000,
    testDuration: 480,
    settings,
    settingsId: buildSettingsId(settings),
    ...over,
  } as Result<Mode>;
}

function personalBest(over: Partial<PersonalBest> = {}): PersonalBest {
  return {
    score: 100,
    correct: 110,
    wrong: 10,
    acc: 91.67,
    tpm: 15,
    spm: 12.5,
    settings: DEFAULT_SETTINGS,
    settingsId: LEADERBOARD_SETTINGS_ID,
    timestamp: 1_700_000_000_000,
    ...over,
  };
}

function pbsWith(mode2: string, bests: PersonalBest[]): PersonalBests {
  return { time: { [mode2]: bests } };
}

describe("checkAndUpdatePb", () => {
  it("records the first result on a board as a PB", () => {
    const run = pb.checkAndUpdatePb(
      emptyPbs(),
      {} as pb.LbPersonalBests,
      result(),
    );

    expect(run.isPb).toBe(true);
    const bests = run.personalBests.time?.["8"];
    expect(bests).toHaveLength(1);
    expect(bests?.[0]).toMatchObject({
      score: 190,
      settingsId: buildSettingsId(DEFAULT_SETTINGS),
    });
  });

  it("AC-065 — a strictly higher score replaces the stored best", () => {
    const run = pb.checkAndUpdatePb(
      pbsWith("8", [personalBest({ score: 100 })]),
      undefined,
      result({ score: 190 }),
    );

    expect(run.isPb).toBe(true);
    expect(run.personalBests.time?.["8"]).toHaveLength(1);
    expect(run.personalBests.time?.["8"]?.[0]?.score).toBe(190);
  });

  it("AC-065 — an equal score is not a PB and does not overwrite", () => {
    const run = pb.checkAndUpdatePb(
      pbsWith("8", [personalBest({ score: 190, timestamp: 1 })]),
      undefined,
      result({ score: 190 }),
    );

    expect(run.isPb).toBe(false);
    // The earlier-achieved entry survives, timestamp and all.
    expect(run.personalBests.time?.["8"]?.[0]?.timestamp).toBe(1);
  });

  it("AC-065 — a lower score is not a PB", () => {
    const run = pb.checkAndUpdatePb(
      pbsWith("8", [personalBest({ score: 300 })]),
      undefined,
      result({ score: 190 }),
    );

    expect(run.isPb).toBe(false);
    expect(run.personalBests.time?.["8"]?.[0]?.score).toBe(300);
  });

  it("C31 — a different settingsId is a different PB and coexists", () => {
    const run = pb.checkAndUpdatePb(
      pbsWith("8", [
        personalBest({ score: 400, settingsId: LEADERBOARD_SETTINGS_ID }),
      ]),
      undefined,
      result({ score: 12, settings: EASY_SETTINGS }),
    );

    // A weak run under easier settings is still that signature's first PB, and
    // it must not have touched the default-settings entry.
    expect(run.isPb).toBe(true);
    expect(run.personalBests.time?.["8"]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          score: 400,
          settingsId: LEADERBOARD_SETTINGS_ID,
        }),
        expect.objectContaining({ score: 12, settingsId: EASY_SETTINGS_ID }),
      ]),
    );
  });

  it("keeps the mode2 buckets separate", () => {
    const run = pb.checkAndUpdatePb(
      pbsWith("4", [personalBest({ score: 900 })]),
      undefined,
      result({ mode2: "8", score: 5 }),
    );

    expect(run.isPb).toBe(true);
    expect(run.personalBests.time?.["4"]?.[0]?.score).toBe(900);
    expect(run.personalBests.time?.["8"]?.[0]?.score).toBe(5);
  });

  it("BL-5 — a low-accuracy run is still a PB when the score is higher", () => {
    const run = pb.checkAndUpdatePb(
      pbsWith("8", [personalBest({ score: 10 })]),
      undefined,
      result({ score: 40, acc: 45 }),
    );

    expect(run.isPb).toBe(true);
    expect(run.personalBests.time?.["8"]?.[0]?.acc).toBe(45);
  });

  it("C40 — a negative score can be a PB when it beats a worse one", () => {
    const run = pb.checkAndUpdatePb(
      pbsWith("8", [personalBest({ score: -30 })]),
      undefined,
      result({ score: -5 }),
    );

    expect(run.isPb).toBe(true);
    expect(run.personalBests.time?.["8"]?.[0]?.score).toBe(-5);
  });

  it("leaves lbPersonalBests alone when it was not supplied", () => {
    const run = pb.checkAndUpdatePb(emptyPbs(), undefined, result());
    expect(run.lbPersonalBests).toBeUndefined();
  });
});

describe("updateLeaderboardPersonalBests", () => {
  it("promotes the default-settings PB onto the board", () => {
    const lb = pb.updateLeaderboardPersonalBests(
      pbsWith("8", [
        personalBest({ score: 190, settingsId: LEADERBOARD_SETTINGS_ID }),
      ]),
      { time: {} },
      result({ score: 190 }),
    );

    expect(lb?.time["8"]?.score).toBe(190);
  });

  it("builds the structure from an empty object", () => {
    const lb = pb.updateLeaderboardPersonalBests(
      pbsWith("8", [
        personalBest({ score: 190, settingsId: LEADERBOARD_SETTINGS_ID }),
      ]),
      {} as pb.LbPersonalBests,
      result(),
    );

    expect(lb).toEqual({
      time: { "8": expect.objectContaining({ score: 190 }) },
    });
  });

  it("SB-175/C31 — never promotes an easier-settings PB, however high", () => {
    // The whole point: 999 under easy settings must not reach the board.
    const lb = pb.updateLeaderboardPersonalBests(
      pbsWith("8", [
        personalBest({ score: 999, settingsId: EASY_SETTINGS_ID }),
      ]),
      { time: {} },
      result({ score: 999 }),
    );

    expect(lb).toBeNull();
  });

  it("picks the default-settings entry, not the highest-scoring one", () => {
    const lb = pb.updateLeaderboardPersonalBests(
      pbsWith("8", [
        personalBest({ score: 999, settingsId: EASY_SETTINGS_ID }),
        personalBest({ score: 190, settingsId: LEADERBOARD_SETTINGS_ID }),
      ]),
      { time: {} },
      result(),
    );

    expect(lb?.time["8"]?.score).toBe(190);
  });

  it("does not downgrade an existing board entry", () => {
    const lb = pb.updateLeaderboardPersonalBests(
      pbsWith("8", [
        personalBest({ score: 50, settingsId: LEADERBOARD_SETTINGS_ID }),
      ]),
      { time: { "8": personalBest({ score: 800 }) } },
      result({ score: 50 }),
    );

    expect(lb?.time["8"]?.score).toBe(800);
  });

  it("SB-176 — only time 4 and 8 have a board", () => {
    expect(
      pb.updateLeaderboardPersonalBests(
        pbsWith("2", [personalBest()]),
        { time: {} },
        result({ mode2: "2" }),
      ),
    ).toBeNull();
  });

  it.each(["4", "8"] as const)("time %s does have a board", (mode2) => {
    const lb = pb.updateLeaderboardPersonalBests(
      pbsWith(mode2, [
        personalBest({ score: 77, settingsId: LEADERBOARD_SETTINGS_ID }),
      ]),
      { time: {} },
      result({ mode2 }),
    );

    expect(lb?.time[mode2]?.score).toBe(77);
  });
});
