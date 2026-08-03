import { describe, expect, it, vi } from "vitest";

import { CustomThemeColors } from "@croco-calc/schemas/configs";
import { PersonalBest } from "@croco-calc/schemas/shared";
import { CrocoMail, ResultFilters } from "@croco-calc/schemas/users";
import { ObjectId } from "mongodb";
import * as UserDAL from "../../../src/dal/user";
import { createConnection as createFriend } from "../../__testData__/connections";
import * as UserTestData from "../../__testData__/users";

const mockPersonalBest: PersonalBest = {
  score: 215,
  correct: 220,
  wrong: 5,
  acc: 97,
  tpm: 55,
  spm: 53,
  settings: UserTestData.TEST_SETTINGS,
  settingsId: "1000:100:threeByTwo:99:1:1:1",
  timestamp: 13123123,
};

const mockResultFilter: ResultFilters = {
  _id: "id",
  name: "sfdkjhgdf",
  pb: {
    true: true,
    false: true,
  },
  time: {
    "1": false,
    "2": true,
    "4": false,
    "8": false,
  },
  addition: {
    off: false,
    "100": true,
    "1000": false,
  },
  multiplication: {
    off: false,
    "12": true,
    "20": false,
    "100": false,
  },
  division: {
    off: false,
    tables: true,
    threeByTwo: false,
  },
  fractionAddition: {
    off: false,
    "12": true,
    "99": false,
  },
  fractionMultiplication: {
    true: true,
    false: false,
  },
  decimals: {
    true: true,
    false: false,
  },
  negatives: {
    true: false,
    false: true,
  },
  date: {
    last_day: false,
    last_week: false,
    last_month: false,
    last_3months: false,
    all: true,
  },
};

const mockDbResultFilter = { ...mockResultFilter, _id: new ObjectId() };

describe("UserDal", () => {
  it("should be able to insert users", async () => {
    // given
    const uid = new ObjectId().toHexString();
    const newUser = {
      name: "Test",
      email: "mockemail@email.com",
      uid,
    };

    // when
    await UserDAL.addUser(newUser.name, newUser.email, newUser.uid);
    const insertedUser = await UserDAL.getUser(newUser.uid, "test");

    // then
    expect(insertedUser.email).toBe(newUser.email);
    expect(insertedUser.uid).toBe(newUser.uid);
    expect(insertedUser.name).toBe(newUser.name);
  });

  it("should error if the user already exists", async () => {
    // given
    const uid = new ObjectId().toHexString();
    const newUser = {
      name: "Test",
      email: "mockemail@email.com",
      uid: uid,
    };

    // when
    await UserDAL.addUser(newUser.name, newUser.email, newUser.uid);

    // then
    // should error because user already exists
    await expect(
      UserDAL.addUser(newUser.name, newUser.email, newUser.uid),
    ).rejects.toThrow("User document already exists");
  });

  it("isNameAvailable should correctly check if a username is available", async () => {
    // given
    const name1 = `user${new ObjectId().toHexString()}`;
    const name2 = `user${new ObjectId().toHexString()}`;
    const { uid: user1 } = await UserTestData.createUser({ name: name1 });
    await UserTestData.createUser({ name: name2 });

    const testCases = [
      {
        name: name1,
        whosChecking: user1,
        expected: true,
      },
      {
        name: name1.toUpperCase(),
        whosChecking: user1,
        expected: true,
      },
      {
        name: name2,
        whosChecking: user1,
        expected: false,
      },
    ];

    // when, then
    for (const { name, expected, whosChecking } of testCases) {
      const isAvailable = await UserDAL.isNameAvailable(name, whosChecking);
      expect(isAvailable).toBe(expected);
    }
  });

  it("isNameAvailable should treat regex metacharacters in the name literally", async () => {
    // given
    // dots are legal in usernames (`slug()`), and the lookup is a `$regex`
    // because Cosmos vCore rejects `collation` on `find` (INF-057). An
    // unescaped dot would make `a.c` match the taken name `abc`.
    const suffix = new ObjectId().toHexString();
    const taken = `abc${suffix}`;
    await UserTestData.createUser({ name: taken });
    const { uid: other } = await UserTestData.createUser({
      name: `other${suffix}`,
    });

    // when, then
    expect(await UserDAL.isNameAvailable(`a.c${suffix}`, other)).toBe(true);
    expect(await UserDAL.isNameAvailable(taken, other)).toBe(false);
    expect(await UserDAL.isNameAvailable(taken.toUpperCase(), other)).toBe(
      false,
    );
  });

  it("updatename should not allow unavailable usernames", async () => {
    // given
    const name1 = `user${new ObjectId().toHexString()}`;
    const name2 = `user${new ObjectId().toHexString()}`;
    const user1 = await UserTestData.createUser({ name: name1 });
    const user2 = await UserTestData.createUser({ name: name2 });
    const _decoy = await UserTestData.createUser();

    // when, then
    await expect(
      UserDAL.updateName(user1.uid, user2.name, user1.name),
    ).rejects.toThrow("Username already taken");
  });

  it("same usernames (different casing) should be available only for the same user", async () => {
    const name1 = `user${new ObjectId().toHexString()}`;
    const name2 = `user${new ObjectId().toHexString()}`;
    const user1 = await UserTestData.createUser({ name: name1 });
    const user2 = await UserTestData.createUser({ name: name2 });

    await UserDAL.updateName(user1.uid, name1.toUpperCase(), user1.name);

    const updatedUser1 = await UserDAL.getUser(user1.uid, "test");

    // when, then
    expect(updatedUser1.name).toBe(name1.toUpperCase());

    await expect(
      UserDAL.updateName(user2.uid, name1, user2.name),
    ).rejects.toThrow("Username already taken");
  });

  it("UserDAL.updateName should change the name of a user", async () => {
    // given
    const name = `user${new ObjectId().toHexString()}`;
    const renamed = `renamed${new ObjectId().toHexString()}`;
    const testUser = await UserTestData.createUser({ name: name });

    // when
    await UserDAL.updateName(testUser.uid, renamed, testUser.name);

    // then
    const updatedUser = await UserDAL.getUser(testUser.uid, "test");
    expect(updatedUser.name).toBe(renamed);
  });

  it("clearPb should clear the personalBests of a user", async () => {
    // given
    const testUser = await UserTestData.createUser();
    await UserDAL.getUsersCollection().updateOne(
      { uid: testUser.uid },
      {
        $set: {
          personalBests: {
            time: { "4": [mockPersonalBest] },
          },
        },
      },
    );

    const { personalBests } =
      (await UserDAL.getUser(testUser.uid, "test")) ?? {};
    expect(personalBests).toStrictEqual({
      time: { "4": [mockPersonalBest] },
    });
    // when
    await UserDAL.clearPb(testUser.uid);

    // then
    const updatedUser = (await UserDAL.getUser(testUser.uid, "test")) ?? {};
    expect(updatedUser.personalBests).toStrictEqual({
      time: {},
    });
  });

  it("autoBan should automatically ban after configured anticheat triggers", async () => {
    // given
    const testUser = await UserTestData.createUser();

    // when
    Date.now = vi.fn(() => 0);
    await UserDAL.recordAutoBanEvent(testUser.uid, 2, 1);
    await UserDAL.recordAutoBanEvent(testUser.uid, 2, 1);
    await UserDAL.recordAutoBanEvent(testUser.uid, 2, 1);

    // then
    const updatedUser = await UserDAL.getUser(testUser.uid, "test");
    expect(updatedUser.banned).toBe(true);
    expect(updatedUser.autoBanTimestamps).toEqual([0, 0, 0]);
  });

  it("autoBan should not ban ban if triggered once", async () => {
    // given
    const testUser = await UserTestData.createUser();

    // when
    Date.now = vi.fn(() => 0);
    await UserDAL.recordAutoBanEvent(testUser.uid, 2, 1);

    // then
    const updatedUser = await UserDAL.getUser(testUser.uid, "test");
    expect(updatedUser.banned).toBe(undefined);
    expect(updatedUser.autoBanTimestamps).toEqual([0]);
  });

  it("autoBan should correctly remove old anticheat triggers", async () => {
    // given
    const testUser = await UserTestData.createUser();

    // when
    Date.now = vi.fn(() => 0);
    await UserDAL.recordAutoBanEvent(testUser.uid, 2, 1);
    await UserDAL.recordAutoBanEvent(testUser.uid, 2, 1);

    Date.now = vi.fn(() => 36000000);

    await UserDAL.recordAutoBanEvent(testUser.uid, 2, 1);

    // then
    const updatedUser = await UserDAL.getUser(testUser.uid, "test");
    expect(updatedUser.banned).toBe(undefined);
    expect(updatedUser.autoBanTimestamps).toEqual([36000000]);
  });

  describe("addResultFilterPreset", () => {
    it("should return error if uid not found", async () => {
      // when, then
      await expect(
        UserDAL.addResultFilterPreset("non existing uid", mockResultFilter, 5),
      ).rejects.toThrow(
        "Maximum number of custom filters reached\nStack: add result filter preset",
      );
    });

    it("should return error if user has reached maximum", async () => {
      // given
      const { uid } = await UserTestData.createUser({
        resultFilterPresets: [mockDbResultFilter],
      });

      // when, then
      await expect(
        UserDAL.addResultFilterPreset(uid, mockResultFilter, 1),
      ).rejects.toThrow(
        "Maximum number of custom filters reached\nStack: add result filter preset",
      );
    });

    it("should handle zero maximum", async () => {
      // given
      const { uid } = await UserTestData.createUser();

      // when, then
      await expect(
        UserDAL.addResultFilterPreset(uid, mockResultFilter, 0),
      ).rejects.toThrow(
        "Maximum number of custom filters reached\nStack: add result filter preset",
      );
    });

    it("addResultFilterPreset success", async () => {
      // given
      const { uid } = await UserTestData.createUser({
        resultFilterPresets: [mockDbResultFilter],
      });

      // when
      const result = await UserDAL.addResultFilterPreset(
        uid,
        { ...mockResultFilter },
        2,
      );

      // then
      const read = await UserDAL.getUser(uid, "read");
      const createdFilter = read.resultFilterPresets ?? [];

      expect(result).toStrictEqual(createdFilter[1]?._id);
    });
  });

  describe("removeResultFilterPreset", () => {
    it("should return error if uid not found", async () => {
      // when, then
      await expect(
        UserDAL.removeResultFilterPreset(
          "non existing uid",
          new ObjectId().toHexString(),
        ),
      ).rejects.toThrow("Custom filter not found\nStack: remove result filter");
    });

    it("should return error if filter is unknown", async () => {
      // given
      const { uid } = await UserTestData.createUser({
        resultFilterPresets: [mockDbResultFilter],
      });

      // when, then
      await expect(
        UserDAL.removeResultFilterPreset(uid, new ObjectId().toHexString()),
      ).rejects.toThrow("Custom filter not found\nStack: remove result filter");
    });
    it("should remove filter", async () => {
      // given
      const filterOne = { ...mockDbResultFilter, _id: new ObjectId() };
      const filterTwo = { ...mockDbResultFilter, _id: new ObjectId() };
      const filterThree = { ...mockDbResultFilter, _id: new ObjectId() };
      const { uid } = await UserTestData.createUser({
        resultFilterPresets: [filterOne, filterTwo, filterThree],
      });

      // when, then
      await UserDAL.removeResultFilterPreset(uid, filterTwo._id.toHexString());

      const read = await UserDAL.getUser(uid, "read");
      expect(read.resultFilterPresets).toStrictEqual([filterOne, filterThree]);
    });
  });

  describe("updateProfile", () => {
    it("updateProfile should appropriately handle multiple profile updates", async () => {
      const uid = new ObjectId().toHexString();
      await UserDAL.addUser("test name", "test email", uid);

      await UserDAL.updateProfile(uid, {
        bio: "test bio",
      });

      const user = await UserDAL.getUser(uid, "test add result filters");
      expect(user.profileDetails).toStrictEqual({
        bio: "test bio",
      });

      await UserDAL.updateProfile(uid, {
        socialProfiles: {
          twitter: "test twitter",
        },
      });

      const updatedUser = await UserDAL.getUser(uid, "test add result filters");
      expect(updatedUser.profileDetails).toStrictEqual({
        bio: "test bio",
        socialProfiles: {
          twitter: "test twitter",
        },
      });

      await UserDAL.updateProfile(uid, {
        bio: "test bio 2",
        socialProfiles: {
          github: "test github",
          website: "test website",
        },
      });

      const updatedUser2 = await UserDAL.getUser(
        uid,
        "test add result filters",
      );
      expect(updatedUser2.profileDetails).toStrictEqual({
        bio: "test bio 2",
        socialProfiles: {
          twitter: "test twitter",
          github: "test github",
          website: "test website",
        },
      });
    });
    it("should omit undefined or empty object values", async () => {
      //GIVEN
      const givenUser = await UserTestData.createUser({
        profileDetails: {
          bio: "test bio",
          socialProfiles: {
            twitter: "test twitter",
            github: "test github",
          },
        },
      });

      //WHEN
      await UserDAL.updateProfile(givenUser.uid, {
        bio: undefined, //ignored
        showActivityOnPublicProfile: true,
        socialProfiles: {}, //ignored
      });

      //THEN
      const read = await UserDAL.getUser(givenUser.uid, "read");
      expect(read.profileDetails).toStrictEqual({
        ...givenUser.profileDetails,
        showActivityOnPublicProfile: true,
      });
    });
  });

  it("resetUser should reset user", async () => {
    const uid = new ObjectId().toHexString();
    await UserDAL.addUser("test name", "test email", uid);

    await UserDAL.updateProfile(uid, {
      bio: "test bio",
      socialProfiles: {
        twitter: "test twitter",
        github: "test github",
      },
    });

    await UserDAL.incrementXp(uid, 15);

    await UserDAL.resetUser(uid);
    const resetUser = await UserDAL.getUser(uid, "test add result filters");

    expect(resetUser.profileDetails).toStrictEqual({
      bio: "",
      socialProfiles: {},
    });

    expect(resetUser.xp).toStrictEqual(0);
    expect(resetUser.personalBests).toStrictEqual({ time: {} });
  });

  it("getInbox should return the user's inbox", async () => {
    const uid = new ObjectId().toHexString();
    await UserDAL.addUser("test name", "test email", uid);

    const emptyInbox = await UserDAL.getInbox(uid);

    expect(emptyInbox).toStrictEqual([]);

    await UserDAL.addToInbox(
      uid,
      [
        {
          subject: `Hello!`,
        } as any,
      ],
      {
        enabled: true,
        maxMail: 100,
      },
    );

    const inbox = await UserDAL.getInbox(uid);

    expect(inbox).toStrictEqual([
      {
        subject: "Hello!",
      },
    ]);
  });

  it("addToInbox discards mail if inbox is full", async () => {
    const uid = new ObjectId().toHexString();
    await UserDAL.addUser("test name", "test email", uid);

    const config = {
      enabled: true,
      maxMail: 1,
    };

    await UserDAL.addToInbox(
      uid,
      [
        {
          subject: "Hello 1!",
        } as any,
      ],
      config,
    );

    await UserDAL.addToInbox(
      uid,
      [
        {
          subject: "Hello 2!",
        } as any,
      ],
      config,
    );

    const inbox = await UserDAL.getInbox(uid);

    expect(inbox).toStrictEqual([
      {
        subject: "Hello 2!",
      },
    ]);
  });

  it("addToInboxBulk should add mail to multiple users", async () => {
    const { uid: user1 } = await UserTestData.createUser();
    const { uid: user2 } = await UserTestData.createUser();

    await UserDAL.addToInboxBulk(
      [
        {
          uid: user1,
          mail: [
            {
              subject: `Hello!`,
            } as any,
          ],
        },
        {
          uid: user2,
          mail: [
            {
              subject: `Hello 2!`,
            } as any,
          ],
        },
      ],
      {
        enabled: true,
        maxMail: 100,
      },
    );

    const inbox = await UserDAL.getInbox(user1);
    const inbox2 = await UserDAL.getInbox(user2);

    expect(inbox).toStrictEqual([
      {
        subject: "Hello!",
      },
    ]);

    expect(inbox2).toStrictEqual([
      {
        subject: "Hello 2!",
      },
    ]);
  });

  describe("incrementTestActivity", () => {
    it("ignores user without migration", async () => {
      // given
      const user = await UserTestData.createUserWithoutMigration();

      //when
      await UserDAL.incrementTestActivity(user, 1712102400000);

      //then
      const read = await UserDAL.getUser(user.uid, "");
      expect(read.testActivity).toBeUndefined();
    });
    it("increments for new year", async () => {
      // given
      const user = await UserTestData.createUser({
        testActivity: { "2023": [null, 1] },
      });

      //when
      await UserDAL.incrementTestActivity(user, 1712102400000);

      //then
      const read = (await UserDAL.getUser(user.uid, "")).testActivity ?? {};
      expect(read).toHaveProperty("2024");
      const year2024 = read["2024"] as number[];
      expect(year2024).toHaveLength(94);
      //fill previous days with null
      expect(year2024.slice(0, 93)).toEqual(new Array(93).fill(null));
      expect(year2024[93]).toEqual(1);
    });
    it("increments for existing year", async () => {
      // given
      const user = await UserTestData.createUser({
        testActivity: { "2024": [null, 5] },
      });

      //when
      await UserDAL.incrementTestActivity(user, 1712102400000);

      //then
      const read = (await UserDAL.getUser(user.uid, "")).testActivity ?? {};
      expect(read).toHaveProperty("2024");
      const year2024 = read["2024"] as number[];
      expect(year2024).toHaveLength(94);

      expect(year2024[0]).toBeNull();
      expect(year2024[1]).toEqual(5);
      expect(year2024.slice(2, 91)).toEqual(new Array(89).fill(null));
      expect(year2024[93]).toEqual(1);
    });
    it("increments for existing day", async () => {
      // given
      let user = await UserTestData.createUser({ testActivity: {} });
      await UserDAL.incrementTestActivity(user, 1712102400000);
      user = await UserDAL.getUser(user.uid, "");

      //when
      await UserDAL.incrementTestActivity(user, 1712102400000);

      //then
      const read = (await UserDAL.getUser(user.uid, "")).testActivity ?? {};
      const year2024 = read["2024"] as any;
      expect(year2024[93]).toEqual(2);
    });
  });

  describe("getUser", () => {
    it("should get with missing personalBests", async () => {
      //GIVEN
      let user = await UserTestData.createUser({ personalBests: undefined });

      //WHEN
      const read = await UserDAL.getUser(user.uid, "read");

      // SB-176 / INV-153: `time` is the only mode croco calc has.
      expect(read.personalBests).toEqual({
        time: {},
      });
    });
  });

  describe("getUserByName", () => {
    it("should get with missing personalBests", async () => {
      //GIVEN
      let user = await UserTestData.createUser({ personalBests: undefined });

      //WHEN
      const read = await UserDAL.getUserByName(user.name, "read");

      // SB-176 / INV-153: `time` is the only mode croco calc has.
      expect(read.personalBests).toEqual({
        time: {},
      });
    });
  });

  describe("getPersonalBests", () => {
    it("should get with missing personalBests", async () => {
      //GIVEN
      let user = await UserTestData.createUser({ personalBests: undefined });

      //WHEN
      const read = await UserDAL.getPersonalBests(user.uid, "time", "4");

      expect(read).toBeUndefined();
    });
  });

  describe("getPartialUser", () => {
    it("should throw for unknown user", async () => {
      await expect(async () =>
        UserDAL.getPartialUser("1234", "stack", []),
      ).rejects.toThrow("User not found\nStack: stack");
    });

    it("should get with missing personalBests", async () => {
      //GIVEN
      let user = await UserTestData.createUser({ personalBests: undefined });

      //WHEN
      const read = await UserDAL.getPartialUser(user.uid, "read", [
        "uid",
        "personalBests",
      ]);

      // SB-176 / INV-153: `time` is the only mode croco calc has.
      expect(read.personalBests).toEqual({
        time: {},
      });
    });
  });
  describe("updateEmail", () => {
    it("throws for nonexisting user", async () => {
      await expect(async () =>
        UserDAL.updateEmail("unknown", "test@example.com"),
      ).rejects.toThrow("User not found\nStack: update email");
    });
    it("should update", async () => {
      //given
      const { uid } = await UserTestData.createUser({ email: "init" });

      //when
      await expect(UserDAL.updateEmail(uid, "next")).resolves.toBe(true);

      //then
      const read = await UserDAL.getUser(uid, "read");
      expect(read.email).toEqual("next");
    });
  });
  describe("resetPb", () => {
    it("throws for nonexisting user", async () => {
      await expect(async () => UserDAL.resetPb("unknown")).rejects.toThrow(
        "User not found\nStack: reset pb",
      );
    });
    it("should reset", async () => {
      //given
      const { uid } = await UserTestData.createUser({
        personalBests: { time: { "4": [{ acc: 1 } as any] } },
      });

      //when
      await UserDAL.resetPb(uid);

      //then
      const read = await UserDAL.getUser(uid, "read");
      expect(read.personalBests).toStrictEqual({
        time: {},
      });
    });
  });
  describe("updateInbox", () => {
    it("claims rewards on read", async () => {
      //GIVEN
      const rewardOne: CrocoMail = {
        id: "b5866d4c-0749-41b6-b101-3656249d39b9",
        body: "test",
        subject: "reward one",
        timestamp: 1,
        read: false,
        rewards: [
          { type: "xp", item: 400 },
          { type: "xp", item: 600 },
        ],
      };
      const rewardTwo: CrocoMail = {
        id: "3692b9f5-84fb-4d9b-bd39-9a3217b3a33a",
        body: "test",
        subject: "reward two",
        timestamp: 2,
        read: false,
        rewards: [{ type: "xp", item: 2000 }],
      };
      const rewardThree: CrocoMail = {
        id: "0d73b3e0-dc79-4abb-bcaf-66fa6b09a58a",
        body: "test",
        subject: "reward three",
        timestamp: 3,
        read: true,
        rewards: [{ type: "xp", item: 3000 }],
      };
      const rewardFour: CrocoMail = {
        id: "d852d2cf-1802-4cd0-9fb4-336650fc470a",
        body: "test",
        subject: "reward four",
        timestamp: 4,
        read: false,
        rewards: [{ type: "xp", item: 4000 }],
      };

      let user = await UserTestData.createUser({
        xp: 100,
        inbox: [rewardOne, rewardTwo, rewardThree, rewardFour],
      });

      //WNEN

      await UserDAL.updateInbox(
        user.uid,
        [rewardOne.id, rewardTwo.id, rewardThree.id],
        [],
      );

      //THEN
      const read = await UserDAL.getUser(user.uid, "");
      expect(read).not.toHaveProperty("tmp");

      const { xp, inbox } = read;
      expect(xp).toEqual(3100); //100 existing + 1000 from rewardOne, 2000 from rewardTwo

      //inbox is sorted by timestamp
      expect(inbox).toStrictEqual([
        { ...rewardFour },
        { ...rewardThree },
        { ...rewardTwo, read: true, rewards: [] },
        { ...rewardOne, read: true, rewards: [] },
      ]);
    });

    it("claims rewards on delete", async () => {
      //GIVEN
      //GIVEN
      const rewardOne: CrocoMail = {
        id: "b5866d4c-0749-41b6-b101-3656249d39b9",
        body: "test",
        subject: "reward one",
        timestamp: 1,
        read: false,
        rewards: [
          { type: "xp", item: 400 },
          { type: "xp", item: 600 },
        ],
      };
      const rewardTwo: CrocoMail = {
        id: "3692b9f5-84fb-4d9b-bd39-9a3217b3a33a",
        body: "test",
        subject: "reward two",
        timestamp: 2,
        read: true,
        rewards: [{ type: "xp", item: 2000 }],
      };

      const rewardThree: CrocoMail = {
        id: "0d73b3e0-dc79-4abb-bcaf-66fa6b09a58a",
        body: "test",
        subject: "reward three",
        timestamp: 4,
        read: false,
        rewards: [{ type: "xp", item: 3000 }],
      };

      let user = await UserTestData.createUser({
        xp: 100,
        inbox: [rewardOne, rewardTwo, rewardThree],
      });

      //WNEN
      await UserDAL.updateInbox(user.uid, [], [rewardOne.id, rewardTwo.id]);

      //THEN
      const { xp, inbox } = await UserDAL.getUser(user.uid, "");
      expect(xp).toBe(1100);
      expect(inbox).toStrictEqual([rewardThree]);
    });

    it("updates badge", async () => {
      //GIVEN
      const rewardOne: CrocoMail = {
        id: "b5866d4c-0749-41b6-b101-3656249d39b9",
        body: "test",
        subject: "reward one",
        timestamp: 2,
        read: false,
        rewards: [{ type: "xp", item: 400 }],
      };
      const rewardTwo: CrocoMail = {
        id: "3692b9f5-84fb-4d9b-bd39-9a3217b3a33a",
        body: "test",
        subject: "reward two",
        timestamp: 1,
        read: false,
        rewards: [
          { type: "xp", item: 300 },
          { type: "xp", item: 500 },
        ],
      };
      const rewardThree: CrocoMail = {
        id: "0d73b3e0-dc79-4abb-bcaf-66fa6b09a58a",
        body: "test",
        subject: "reward three",
        timestamp: 0,
        read: true,
        rewards: [{ type: "xp", item: 600 }],
      };

      let user = await UserTestData.createUser({
        inbox: [rewardOne, rewardTwo, rewardThree],
      });

      //WNEN
      await UserDAL.updateInbox(
        user.uid,
        [rewardOne.id, rewardTwo.id, rewardThree.id, rewardOne.id],
        [],
      );

      //THEN
      const { inbox } = await UserDAL.getUser(user.uid, "");
      expect(inbox).toStrictEqual([
        { ...rewardOne, read: true, rewards: [] },
        { ...rewardTwo, read: true, rewards: [] },
        { ...rewardThree },
      ]);
    });
    it("read and delete the same message does not claim reward twice", async () => {
      //GIVEN
      const rewardOne: CrocoMail = {
        id: "b5866d4c-0749-41b6-b101-3656249d39b9",
        body: "test",
        subject: "reward one",
        timestamp: 0,
        read: false,
        rewards: [{ type: "xp", item: 1000 }],
      };
      const rewardTwo: CrocoMail = {
        id: "3692b9f5-84fb-4d9b-bd39-9a3217b3a33a",
        body: "test",
        subject: "reward two",
        timestamp: 0,
        read: false,
        rewards: [{ type: "xp", item: 2000 }],
      };
      let user = await UserTestData.createUser({
        xp: 100,
        inbox: [rewardOne, rewardTwo],
      });

      await UserDAL.updateInbox(
        user.uid,
        [rewardOne.id, rewardTwo.id],
        [rewardOne.id, rewardTwo.id],
      );

      //THEN

      const { xp } = await UserDAL.getUser(user.uid, "");
      expect(xp).toEqual(3100);
    });

    it("concurrent calls dont claim a reward multiple times", async () => {
      //GIVEN
      const rewardOne: CrocoMail = {
        id: "b5866d4c-0749-41b6-b101-3656249d39b9",
        body: "test",
        subject: "reward one",
        timestamp: 0,
        read: false,
        rewards: [
          { type: "xp", item: 400 },
          { type: "xp", item: 600 },
        ],
      };
      const rewardTwo: CrocoMail = {
        id: "3692b9f5-84fb-4d9b-bd39-9a3217b3a33a",
        body: "test",
        subject: "reward two",
        timestamp: 0,
        read: false,
        rewards: [{ type: "xp", item: 2000 }],
      };
      const rewardThree: CrocoMail = {
        id: "0d73b3e0-dc79-4abb-bcaf-66fa6b09a58a",
        body: "test",
        subject: "reward three",
        timestamp: 0,
        read: true,
        rewards: [{ type: "xp", item: 2000 }],
      };

      let user = await UserTestData.createUser({
        xp: 100,
        inbox: [rewardOne, rewardTwo, rewardThree],
      });

      const count = 100;
      const calls = new Array(count)
        .fill(0)
        .map(async () =>
          UserDAL.updateInbox(
            user.uid,
            [rewardOne.id, rewardTwo.id, rewardThree.id],
            [],
          ),
        );

      await Promise.all(calls);

      //THEN

      const { xp } = await UserDAL.getUser(user.uid, "");
      expect(xp).toEqual(3100);
    });
  });
  describe("updateLbMemory", () => {
    it("should return error if uid not found", async () => {
      // when, then
      await expect(
        UserDAL.updateLbMemory("non existing uid", "time", "4", 4711),
      ).rejects.toThrow("User not found\nStack: update lb memory");
    });

    it("updates on empty lbMemory", async () => {
      //GIVEN
      const { uid } = await UserTestData.createUser({});

      //WHEN
      await UserDAL.updateLbMemory(uid, "time", "4", 4711);

      //THEN
      const read = await UserDAL.getUser(uid, "read");
      expect(read.lbMemory).toStrictEqual({
        time: {
          "4": 4711,
        },
      });
    });
    it("updates on empty lbMemory.mode", async () => {
      //GIVEN
      const { uid } = await UserTestData.createUser({
        lbMemory: { time: {} },
      });

      //WHEN
      await UserDAL.updateLbMemory(uid, "time", "4", 4711);

      //THEN
      const read = await UserDAL.getUser(uid, "read");
      expect(read.lbMemory).toStrictEqual({
        time: {
          "4": 4711,
        },
      });
    });
    it("updates on empty lbMemory.mode.mode2", async () => {
      //GIVEN
      const { uid } = await UserTestData.createUser({
        lbMemory: { time: { "8": 12 } },
      });

      //WHEN
      await UserDAL.updateLbMemory(uid, "time", "4", 4711);

      //THEN
      // INV-153: lbMemory is `mode -> mode2 -> rank`; the language level is gone.
      const read = await UserDAL.getUser(uid, "read");
      expect(read.lbMemory).toStrictEqual({
        time: {
          "4": 4711,
          "8": 12,
        },
      });
    });
  });

  describe("addTheme", () => {
    it("should return error if uid not found", async () => {
      // when, then
      await expect(
        UserDAL.addTheme("non existing uid", {
          name: "new",
          colors: [] as any,
        }),
      ).rejects.toThrow(
        "Maximum number of custom themes reached\nStack: add theme",
      );
    });

    it("should return error if user has reached maximum", async () => {
      // given
      const { uid } = await UserTestData.createUser({
        customThemes: new Array(20).fill(0).map(() => ({
          _id: new ObjectId(),
          name: "any",
          colors: [] as any,
        })),
      });

      // when, then
      await expect(
        UserDAL.addTheme(uid, { name: "new", colors: [] as any }),
      ).rejects.toThrow(
        "Maximum number of custom themes reached\nStack: add theme",
      );
    });

    it("addTheme success", async () => {
      // given
      const themeOne = {
        _id: new ObjectId(),
        name: "first",
        colors: new Array(10).fill("#123456") as CustomThemeColors,
      };
      const { uid } = await UserTestData.createUser({
        customThemes: [themeOne],
      });

      const newTheme = {
        name: "newTheme",
        colors: new Array(10).fill("#000000") as CustomThemeColors,
      };
      // when
      await UserDAL.addTheme(uid, { ...newTheme });

      // then
      const read = await UserDAL.getUser(uid, "read");
      expect(read.customThemes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "first",
            colors: themeOne.colors,
          }),
          expect.objectContaining({
            name: "newTheme",
            colors: newTheme.colors,
          }),
        ]),
      );
    });
  });

  describe("editTheme", () => {
    it("should return error if uid not found", async () => {
      // when, then
      await expect(
        UserDAL.editTheme("non existing uid", new ObjectId().toHexString(), {
          name: "newName",
          colors: [] as any,
        }),
      ).rejects.toThrow("Custom theme not found\nStack: edit theme");
    });

    it("should fail if theme not found", async () => {
      // given
      const themeOne = {
        _id: new ObjectId(),
        name: "first",
        colors: ["green", "white", "red"] as any,
      };
      const { uid } = await UserTestData.createUser({
        customThemes: [themeOne],
      });

      // when, then
      await expect(
        UserDAL.editTheme(uid, new ObjectId().toHexString(), {
          name: "newName",
          colors: [] as any,
        }),
      ).rejects.toThrow("Custom theme not found\nStack: edit theme");
    });

    it("editTheme success", async () => {
      // given
      const themeOne = {
        _id: new ObjectId(),
        name: "first",
        colors: ["green", "white", "red"] as any,
      };
      const { uid } = await UserTestData.createUser({
        customThemes: [themeOne],
      });
      // when
      await UserDAL.editTheme(uid, themeOne._id.toHexString(), {
        name: "newThemeName",
        colors: ["red", "white", "blue"] as any,
      });

      // then
      const read = await UserDAL.getUser(uid, "read");
      expect(read.customThemes ?? [][0]).toStrictEqual([
        { ...themeOne, name: "newThemeName", colors: ["red", "white", "blue"] },
      ]);
    });
  });

  describe("removeTheme", () => {
    it("should return error if uid not found", async () => {
      // when, then
      await expect(
        UserDAL.removeTheme("non existing uid", new ObjectId().toHexString()),
      ).rejects.toThrow("Custom theme not found\nStack: remove theme");
    });

    it("should return error if theme is unknown", async () => {
      // given
      const themeOne = {
        _id: new ObjectId(),
        name: "first",
        colors: ["green", "white", "red"] as any,
      };
      const { uid } = await UserTestData.createUser({
        customThemes: [themeOne],
      });

      // when, then
      await expect(
        UserDAL.removeTheme(uid, new ObjectId().toHexString()),
      ).rejects.toThrow("Custom theme not found\nStack: remove theme");
    });
    it("should remove theme", async () => {
      // given
      const themeOne = {
        _id: new ObjectId(),
        name: "first",
        colors: [] as any,
      };
      const themeTwo = {
        _id: new ObjectId(),
        name: "second",
        colors: [] as any,
      };

      const themeThree = {
        _id: new ObjectId(),
        name: "third",
        colors: [] as any,
      };

      const { uid } = await UserTestData.createUser({
        customThemes: [themeOne, themeTwo, themeThree],
      });

      // when, then
      await UserDAL.removeTheme(uid, themeTwo._id.toHexString());

      const read = await UserDAL.getUser(uid, "read");
      expect(read.customThemes).toStrictEqual([themeOne, themeThree]);
    });
  });

  describe("getFriends", () => {
    it("get list of friends", async () => {
      //GIVEN
      const me = await UserTestData.createUser({ name: "Me" });
      const uid = me.uid;

      const friendOne = await UserTestData.createUser({
        name: "One",
        personalBests: {
          time: {
            "4": [UserTestData.pb(100)],
            "8": [UserTestData.pb(85), UserTestData.pb(90)],
          },
        },
        banned: true,
        lbOptOut: true,
      });
      const friendOneRequest = await createFriend({
        initiatorUid: uid,
        receiverUid: friendOne.uid,
        status: "accepted",
        lastModified: 100,
      });
      const friendTwo = await UserTestData.createUser({
        name: "Two",
        timeSpent: 600,
        startedTests: 150,
        completedTests: 125,
        xp: 42,
      });
      const friendTwoRequest = await createFriend({
        initiatorUid: uid,
        receiverUid: friendTwo.uid,
        status: "accepted",
        lastModified: 200,
      });

      const friendThree = await UserTestData.createUser({ name: "Three" });
      const friendThreeRequest = await createFriend({
        receiverUid: uid,
        initiatorUid: friendThree.uid,
        status: "accepted",
        lastModified: 300,
      });

      //non accepted
      await createFriend({ receiverUid: uid, status: "pending" });
      await createFriend({ initiatorUid: uid, status: "blocked" });

      //WHEN
      const friends = await UserDAL.getFriends(uid);

      //THEN
      expect(friends).toEqual([
        {
          uid: friendOne.uid,
          name: "One",
          lastModified: 100,
          connectionId: friendOneRequest._id,
          // oxlint-disable-next-line no-non-null-assertion
          top4: friendOne.personalBests.time["4"]![0] as any,
          // oxlint-disable-next-line no-non-null-assertion
          top8: friendOne.personalBests.time["8"]![1] as any,
          banned: true,
          lbOptOut: true,
        },
        {
          uid: friendTwo.uid,
          name: "Two",
          lastModified: 200,
          connectionId: friendTwoRequest._id,
          timeSpent: friendTwo.timeSpent,
          startedTests: friendTwo.startedTests,
          completedTests: friendTwo.completedTests,
          xp: friendTwo.xp,
        },
        {
          uid: friendThree.uid,
          name: "Three",
          lastModified: 300,
          connectionId: friendThreeRequest._id,
        },
        {
          uid: me.uid,
          name: "Me",
        },
      ]);
    });
  });
});
