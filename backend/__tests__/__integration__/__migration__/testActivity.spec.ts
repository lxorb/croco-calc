import { describe, it, expect } from "vitest";
import { ObjectId } from "mongodb";
import {
  buildSettingsId,
  type MathGeneratorSettings,
} from "@croco-calc/schemas/math";
import * as Migration from "../../../__migration__/testActivity";
import * as UserTestData from "../../__testData__/users";
import * as UserDal from "../../../src/dal/user";
import * as ResultDal from "../../../src/dal/result";
import { DBResult } from "../../../src/utils/result";

describe("testActivity migration", () => {
  it("migrates users without results", async () => {
    //given
    const user1 = await UserTestData.createUser();
    const user2 = await UserTestData.createUser();

    //when
    await Migration.migrate();

    //then
    const readUser1 = await UserDal.getUser(user1.uid, "");
    expect(readUser1.testActivity).toEqual({});

    const readUser2 = await UserDal.getUser(user2.uid, "");
    expect(readUser2.testActivity).toEqual({});
  });

  it("migrates users with results", async () => {
    //given
    const withResults = await UserTestData.createUserWithoutMigration();
    const withoutResults = await UserTestData.createUserWithoutMigration();

    const uid = withResults.uid;

    //2023-01-02
    await createResult(uid, 1672621200000);

    //2024-01-01
    await createResult(uid, 1704070800000);
    await createResult(uid, 1704070800000 + 3600000);
    await createResult(uid, 1704070800000 + 3600000);

    //2024-01-02
    await createResult(uid, 1704157200000);
    //2024-01-03
    await createResult(uid, 1704243600000);

    //when
    await Migration.migrate();

    //then
    const readWithResults = await UserDal.getUser(withResults.uid, "");
    expect(readWithResults.testActivity).toEqual({
      "2023": [null, 1],
      "2024": [3, 1, 1],
    });

    const readWithoutResults = await UserDal.getUser(withoutResults.uid, "");
    expect(readWithoutResults.testActivity).toEqual({});
  });
});

const SETTINGS: MathGeneratorSettings = {
  addition: "1000",
  multiplication: "100",
  division: "threeByTwo",
  fractionAddition: "99",
  fractionMultiplication: true,
  decimals: true,
  negatives: true,
};

/**
 * A minimal but *real* croco calc result.
 *
 * This fixture used to be a monkeytype one — `wpm`, `rawWpm`, `charStats`,
 * `keyConsistency`, and a second-based `mode2: "60"` — smuggled past the type
 * checker with `as unknown as DBResult`. None of those fields exist on
 * `DBResult` any more, so the cast was the only thing keeping the last typing
 * metrics in the backend alive. Dropping the cast is the point: the shape is now
 * checked, so it cannot drift back.
 *
 * The migration only reads `timestamp`, so every other value is arbitrary — but
 * it has to be arbitrary *and valid*.
 */
async function createResult(uid: string, timestamp: number): Promise<void> {
  const result: DBResult = {
    _id: new ObjectId(),
    uid,
    name: "",
    score: 0,
    correct: 0,
    wrong: 0,
    acc: 0,
    tpm: 0,
    spm: 0,
    consistency: 0,
    mode: "time",
    mode2: "8",
    timestamp,
    testDuration: 1,
    chartData: "toolong",
    settings: SETTINGS,
    settingsId: buildSettingsId(SETTINGS),
  };

  await ResultDal.addResult(uid, result);
}
