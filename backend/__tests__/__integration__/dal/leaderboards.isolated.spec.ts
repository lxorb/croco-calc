import { describe, it, expect, afterEach } from "vitest";
import { ObjectId } from "mongodb";
import * as UserDal from "../../../src/dal/user";
import * as LeaderboardsDal from "../../../src/dal/leaderboards";
import * as PublicDal from "../../../src/dal/public";
import type { DBLeaderboardEntry } from "../../../src/dal/leaderboards";
import type { PersonalBest } from "@croco-calc/schemas/shared";

import * as DB from "../../../src/init/db";
import { LbPersonalBests } from "../../../src/utils/pb";

import { pb } from "../../__testData__/users";
import { createConnection } from "../../__testData__/connections";
import { omit } from "../../../src/utils/misc";
import { LeaderboardEntry } from "@croco-calc/schemas/leaderboards";

describe("LeaderboardsDal", () => {
  afterEach(async () => {
    await DB.collection("users").deleteMany({});
  });
  describe("update", () => {
    it("should ignore unapplicable users on leaderboard", async () => {
      //GIVEN
      const lbPersonalBests = lbBests(pb(100), pb(90));
      const applicableUser = await createUser(lbPersonalBests);
      // AC-120's four exclusions.
      await createUser(lbPersonalBests, { banned: true });
      await createUser(lbPersonalBests, { lbOptOut: true });
      await createUser(lbPersonalBests, { needsToChangeName: true });
      await createUser(lbPersonalBests, { timeSpent: 0 });
      // No PB on this board at all.
      await createUser(lbBests(undefined, pb(60)));
      // `timestamp: 0` means the PB was never actually set.
      await createUser(lbBests(pb(60, 90, 0)));
      // BL-5 / C40: a zero score and a zero accuracy are both **legitimate** in
      // a math trainer. monkeytype excluded them with `wpm > 0`; carrying that
      // over would silently delete every struggling player from the board, so
      // the only real condition is that a PB exists (`dal/leaderboards.ts`).
      const zeroScore = await createUser(lbBests(pb(0, 90, 1)));
      const zeroAcc = await createUser(lbBests(pb(60, 0, 1)));

      //WHEN
      await LeaderboardsDal.update("time", "4");
      const results = (await LeaderboardsDal.get(
        "time",
        "4",
        0,
        50,
      )) as LeaderboardsDal.DBLeaderboardEntry[];

      //THEN
      expect(results.map((it) => it.uid).sort()).toEqual(
        [applicableUser.uid, zeroScore.uid, zeroAcc.uid].sort(),
      );
    });

    it("should create leaderboard time 4", async () => {
      //GIVEN
      const rank1 = await createUser(lbBests(pb(100, 90, 2)));
      const rank2 = await createUser(lbBests(pb(100, 90, 1)));
      const rank3 = await createUser(lbBests(pb(100, 80, 2)));
      const rank4 = await createUser(lbBests(pb(90, 100, 1)));

      //WHEN
      await LeaderboardsDal.update("time", "4");
      const results = (await LeaderboardsDal.get(
        "time",
        "4",
        0,
        50,
      )) as DBLeaderboardEntry[];

      //THEN

      const lb = results.map((it) => omit(it, ["_id"]));

      expect(lb).toEqual([
        expectedLbEntry("4", { rank: 1, user: rank1 }),
        expectedLbEntry("4", { rank: 2, user: rank2 }),
        expectedLbEntry("4", { rank: 3, user: rank3 }),
        expectedLbEntry("4", { rank: 4, user: rank4 }),
      ]);
    });
    it("should create leaderboard time 8", async () => {
      //GIVEN
      const rank1 = await createUser(lbBests(pb(90), pb(100, 90, 2)));
      const rank2 = await createUser(lbBests(undefined, pb(100, 90, 1)));
      const rank3 = await createUser(lbBests(undefined, pb(100, 80, 2)));
      const rank4 = await createUser(lbBests(undefined, pb(90, 100, 1)));

      //WHEN
      await LeaderboardsDal.update("time", "8");
      const results = (await LeaderboardsDal.get(
        "time",
        "8",
        0,
        50,
      )) as LeaderboardsDal.DBLeaderboardEntry[];

      //THEN
      const lb = results.map((it) => omit(it, ["_id"]));

      expect(lb).toEqual([
        expectedLbEntry("8", { rank: 1, user: rank1 }),
        expectedLbEntry("8", { rank: 2, user: rank2 }),
        expectedLbEntry("8", { rank: 3, user: rank3 }),
        expectedLbEntry("8", { rank: 4, user: rank4 }),
      ]);
    });
    it("should update public scoreHistogram for time 4", async () => {
      //GIVEN
      await createUser(lbBests(pb(10), pb(60)));
      await createUser(lbBests(pb(24)));
      await createUser(lbBests(pb(28)));
      await createUser(lbBests(pb(31)));

      //WHEN
      await LeaderboardsDal.update("time", "4");
      const result = await PublicDal.getScoreHistogram(4);

      //THEN
      expect(result).toEqual({ "10": 1, "20": 2, "30": 1 });
    });

    it("should update public scoreHistogram for time 8", async () => {
      //GIVEN
      await createUser(lbBests(pb(60), pb(20)));
      await createUser(lbBests(undefined, pb(21)));
      await createUser(lbBests(undefined, pb(110)));
      await createUser(lbBests(undefined, pb(115)));

      //WHEN
      await LeaderboardsDal.update("time", "8");
      const result = await PublicDal.getScoreHistogram(8);

      //THEN
      expect(result).toEqual({ "20": 2, "110": 2 });
    });
  });

  describe("get", () => {
    it("should get for page", async () => {
      //GIVEN
      const _rank1 = await createUser(lbBests(pb(90), pb(105, 90, 2)));
      const _rank2 = await createUser(lbBests(undefined, pb(100, 90, 1)));
      const rank3 = await createUser(lbBests(undefined, pb(95, 80, 2)));
      const rank4 = await createUser(lbBests(undefined, pb(90, 100, 1)));
      await LeaderboardsDal.update("time", "8");

      //WHEN

      const results = (await LeaderboardsDal.get(
        "time",
        "8",
        1,
        2,
      )) as LeaderboardsDal.DBLeaderboardEntry[];

      //THEN
      const lb = results.map((it) => omit(it, ["_id"]));

      expect(lb).toEqual([
        expectedLbEntry("8", { rank: 3, user: rank3 }),
        expectedLbEntry("8", { rank: 4, user: rank4 }),
      ]);
    });
    it("should get for friends only", async () => {
      //GIVEN
      const rank1 = await createUser(lbBests(pb(90), pb(100, 90, 2)));
      const uid = rank1.uid;
      const _rank2 = await createUser(lbBests(undefined, pb(100, 90, 1)));
      const _rank3 = await createUser(lbBests(undefined, pb(100, 80, 2)));
      const rank4 = await createUser(lbBests(undefined, pb(90, 100, 1)));

      //two friends, one is not on the leaderboard
      await createConnection({
        initiatorUid: uid,
        receiverUid: rank4.uid,
        status: "accepted",
      });

      await createConnection({ initiatorUid: uid, status: "accepted" });

      await LeaderboardsDal.update("time", "8");

      //WHEN

      const results = (await LeaderboardsDal.get(
        "time",
        "8",
        0,
        50,
        uid,
      )) as LeaderboardsDal.DBLeaderboardEntry[];

      //THEN
      const lb = results.map((it) => omit(it, ["_id"]));

      expect(lb).toEqual([
        expectedLbEntry("8", { rank: 1, user: rank1, friendsRank: 1 }),
        expectedLbEntry("8", { rank: 4, user: rank4, friendsRank: 2 }),
      ]);
    });
    it("should get for friends only with page", async () => {
      //GIVEN
      const rank1 = await createUser(lbBests(pb(90), pb(105, 90, 2)));
      const uid = rank1.uid;
      const rank2 = await createUser(lbBests(undefined, pb(100, 90, 1)));
      const _rank3 = await createUser(lbBests(undefined, pb(95, 80, 2)));
      const rank4 = await createUser(lbBests(undefined, pb(90, 100, 1)));
      await LeaderboardsDal.update("time", "8");

      await createConnection({
        initiatorUid: uid,
        receiverUid: rank2.uid,
        status: "accepted",
      });
      await createConnection({
        initiatorUid: rank4.uid,
        receiverUid: uid,
        status: "accepted",
      });

      //WHEN
      const results = (await LeaderboardsDal.get(
        "time",
        "8",
        1,
        2,
        uid,
      )) as LeaderboardsDal.DBLeaderboardEntry[];

      //THEN
      const lb = results.map((it) => omit(it, ["_id"]));

      expect(lb).toEqual([
        expectedLbEntry("8", { rank: 4, user: rank4, friendsRank: 3 }),
      ]);
    });
    it("should return empty list if no friends", async () => {
      //GIVEN
      const uid = new ObjectId().toHexString();

      //WHEN
      const results = (await LeaderboardsDal.get(
        "time",
        "8",
        1,
        2,
        uid,
      )) as LeaderboardsDal.DBLeaderboardEntry[];
      //THEN
      expect(results).toEqual([]);
    });
  });
  describe("getCount / getRank", () => {
    it("should get count", async () => {
      //GIVEN
      await createUser(lbBests(undefined, pb(105)), { name: "One" });
      await createUser(lbBests(undefined, pb(100)), { name: "Two" });
      const me = await createUser(lbBests(undefined, pb(95)), { name: "Me" });
      await createUser(lbBests(undefined, pb(90)), { name: "Three" });
      await LeaderboardsDal.update("time", "8");

      //WHEN / THEN

      expect(await LeaderboardsDal.getCount("time", "8")) //
        .toEqual(4);
      expect(await LeaderboardsDal.getRank("time", "8", me.uid)) //
        .toEqual(
          expect.objectContaining({
            score: 95,
            rank: 3,
            name: me.name,
            uid: me.uid,
          }),
        );
    });
    it("should get for friends only", async () => {
      //GIVEN
      const friendOne = await createUser(lbBests(undefined, pb(105)));
      await createUser(lbBests(undefined, pb(100)));
      await createUser(lbBests(undefined, pb(95)));
      const friendTwo = await createUser(lbBests(undefined, pb(90)));
      const me = await createUser(lbBests(undefined, pb(99)));
      await LeaderboardsDal.update("time", "8");

      await createConnection({
        initiatorUid: me.uid,
        receiverUid: friendOne.uid,
        status: "accepted",
      });

      await createConnection({
        initiatorUid: friendTwo.uid,
        receiverUid: me.uid,
        status: "accepted",
      });

      //WHEN / THEN

      expect(await LeaderboardsDal.getCount("time", "8", me.uid)) //
        .toEqual(3);
      expect(await LeaderboardsDal.getRank("time", "8", me.uid, true)) //
        .toEqual(
          expect.objectContaining({
            score: 99,
            rank: 3,
            friendsRank: 2,
            name: me.name,
            uid: me.uid,
          }),
        );
    });
  });
});

function expectedLbEntry(
  time: "4" | "8",
  { rank, user, friendsRank }: ExpectedLbEntry,
): LeaderboardEntry {
  // AC-131 / INV-036: score, correct, wrong, acc and tpm are the columns.
  // C5 keeps consistency off this surface and C16 cuts badges.
  const lbBest = user.lbPersonalBests?.time[time] as PersonalBest;

  const entry: LeaderboardEntry = {
    rank,
    uid: user.uid,
    name: user.name,
    score: lbBest.score,
    correct: lbBest.correct,
    wrong: lbBest.wrong,
    acc: lbBest.acc,
    tpm: lbBest.tpm,
    timestamp: lbBest.timestamp,
  };
  if (friendsRank !== undefined) entry.friendsRank = friendsRank;
  return entry;
}

async function createUser(
  lbPersonalBests?: LbPersonalBests,
  userProperties?: Partial<UserDal.DBUser>,
): Promise<UserDal.DBUser> {
  const uid = new ObjectId().toHexString();
  await UserDal.addUser(`User ${uid}`, `${uid}@example.com`, uid);

  await DB.getDb()
    ?.collection<UserDal.DBUser>("users")
    .updateOne(
      { uid },
      {
        $set: {
          timeSpent: 7200,
          ...userProperties,
          lbPersonalBests,
        },
      },
    );

  return await UserDal.getUser(uid, "test");
}

function lbBests(pb4?: PersonalBest, pb8?: PersonalBest): LbPersonalBests {
  // No language level: a board is `(mode, mode2)` (AC-113, INV-153), so the
  // innermost value is the personal best itself.
  const result: LbPersonalBests = { time: {} };
  if (pb4) result.time["4"] = pb4;
  if (pb8) result.time["8"] = pb8;
  return result;
}

type ExpectedLbEntry = {
  rank: number;
  user: UserDal.DBUser;
  friendsRank?: number;
};
