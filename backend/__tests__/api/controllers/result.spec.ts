import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { setup } from "../../__testData__/controller-test";
import * as Configuration from "../../../src/init/configuration";
import * as ResultDal from "../../../src/dal/result";
import * as UserDal from "../../../src/dal/user";
import * as LogsDal from "../../../src/dal/logs";
import * as PublicDal from "../../../src/dal/public";
import { ObjectId } from "mongodb";
import { enableRateLimitExpects } from "../../__testData__/rate-limit";
import { DBResult } from "../../../src/utils/result";
import { CompletedEvent } from "@croco-calc/schemas/results";
import {
  buildSettingsId,
  type MathGeneratorSettings,
} from "@croco-calc/schemas/math";
import {
  computeMetrics,
  generateSequence,
  MATH_ENGINE_VERSION,
  type TaskLogEntry,
} from "@croco-calc/math-engine";

/** SB-012: the test length the fixtures use, in minutes. */
const SETTINGS_TIME = 8;

const { mockApp, uid, mockAuth } = setup();
const configuration = Configuration.getCachedConfiguration();
enableRateLimitExpects();

describe("result controller test", () => {
  describe("getResults", () => {
    const resultMock = vi.spyOn(ResultDal, "getResults");

    beforeEach(async () => {
      resultMock.mockResolvedValue([]);
    });

    afterEach(() => {
      resultMock.mockClear();
    });

    it("should get results", async () => {
      //GIVEN
      const resultOne = givenDbResult(uid);
      const resultTwo = givenDbResult(uid);
      resultMock.mockResolvedValue([resultOne, resultTwo]);

      //WHEN
      const { body } = await mockApp
        .get("/results")
        .set("Authorization", `Bearer ${uid}`)
        .send()
        .expect(200);

      //THEN

      expect(body.message).toEqual("Results retrieved");
      expect(body.data).toEqual([
        { ...resultOne, _id: resultOne._id.toHexString() },
        { ...resultTwo, _id: resultTwo._id.toHexString() },
      ]);
    });
    it("should get latest 1000 results for regular user", async () => {
      //WHEN
      await mockApp
        .get("/results")
        .set("Authorization", `Bearer ${uid}`)
        .send()
        .expect(200);

      //THEN
      expect(resultMock).toHaveBeenCalledWith(uid, {
        limit: 1000,
        offset: 0,
        onOrAfterTimestamp: NaN,
      });
    });
    it("should get results filter by onOrAfterTimestamp", async () => {
      //GIVEN
      const now = Date.now();
      //WHEN
      await mockApp
        .get("/results")
        .query({ onOrAfterTimestamp: now })
        .set("Authorization", `Bearer ${uid}`)
        .send()
        .expect(200);

      //THEN

      expect(resultMock).toHaveBeenCalledWith(uid, {
        limit: 1000,
        offset: 0,
        onOrAfterTimestamp: now,
      });
    });
    it("should get with limit and offset", async () => {
      //WHEN
      await mockApp
        .get("/results")
        .query({ limit: 250, offset: 500 })
        .set("Authorization", `Bearer ${uid}`)
        .send()
        .expect(200);

      //THEN
      expect(resultMock).toHaveBeenCalledWith(uid, {
        limit: 250,
        offset: 500,
        onOrAfterTimestamp: NaN,
      });
    });
    it("should fail exceeding max limit for regular user", async () => {
      //WHEN
      const { body } = await mockApp
        .get("/results")
        .query({ limit: 100, offset: 1000 })
        .set("Authorization", `Bearer ${uid}`)
        .send()
        .expect(422);

      //THEN
      expect(body.message).toEqual(
        `Max results limit of ${
          (await configuration).results.limits.regularUser
        } exceeded.`,
      );
    });
    it("should get results if offset/limit is partly outside the max limit", async () => {
      //WHEN
      await mockApp
        .get("/results")
        .query({ limit: 20, offset: 990 })
        .set("Authorization", `Bearer ${uid}`)
        .send()
        .expect(200);

      //THEN

      expect(resultMock).toHaveBeenCalledWith(uid, {
        limit: 10, //limit is reduced to stay within max limit
        offset: 990,
        onOrAfterTimestamp: NaN,
      });
    });
    it("should fail exceeding 1k limit", async () => {
      //GIVEN

      //WHEN
      const { body } = await mockApp
        .get("/results")
        .query({ limit: 2000 })
        .set("Authorization", `Bearer ${uid}`)
        .send()
        .expect(422);

      //THEN
      expect(body).toEqual({
        message: "Invalid query schema",
        validationErrors: ['"limit" Number must be less than or equal to 1000'],
      });
    });
    it("should fail with unknown query parameters", async () => {
      //WHEN
      const { body } = await mockApp
        .get("/results")
        .query({ extra: "value" })
        .set("Authorization", `Bearer ${uid}`)
        .send()
        .expect(422);

      //THEN
      expect(body).toEqual({
        message: "Invalid query schema",
        validationErrors: ["Unrecognized key(s) in object: 'extra'"],
      });
    });
    it("should be rate limited", async () => {
      await expect(
        mockApp.get("/results").set("Authorization", `Bearer ${uid}`),
      ).toBeRateLimited({ max: 60, windowMs: 60 * 60 * 1000, key: uid });
    });
  });
  describe("getResultById", () => {
    const getResultMock = vi.spyOn(ResultDal, "getResult");

    afterEach(() => {
      getResultMock.mockClear();
    });

    it("should get result", async () => {
      //GIVEN
      const result = givenDbResult(uid);
      getResultMock.mockResolvedValue(result);

      //WHEN
      const { body } = await mockApp
        .get(`/results/id/${result._id}`)
        .set("Authorization", `Bearer ${uid}`)
        .send()
        .expect(200);

      //THEN
      expect(body.message).toEqual("Result retrieved");
      expect(body.data).toEqual({ ...result, _id: result._id.toHexString() });
    });
  });
  describe("getLastResult", () => {
    const getLastResultMock = vi.spyOn(ResultDal, "getLastResult");

    afterEach(() => {
      getLastResultMock.mockClear();
    });

    it("should get last result", async () => {
      //GIVEN
      const result = givenDbResult(uid);
      getLastResultMock.mockResolvedValue(result);

      //WHEN
      const { body } = await mockApp
        .get("/results/last")
        .set("Authorization", `Bearer ${uid}`)
        .send()
        .expect(200);

      //THEN
      expect(body.message).toEqual("Result retrieved");
      expect(body.data).toEqual({ ...result, _id: result._id.toHexString() });
    });
  });
  describe("deleteAll", () => {
    const deleteAllMock = vi.spyOn(ResultDal, "deleteAll");
    const logToDbMock = vi.spyOn(LogsDal, "addLog");
    afterEach(() => {
      deleteAllMock.mockClear();
      logToDbMock.mockClear();
    });

    it("should delete", async () => {
      //GIVEN
      mockAuth.modifyToken({ iat: Date.now() - 1000 });
      deleteAllMock.mockResolvedValue(undefined as any);

      //WHEN
      const { body } = await mockApp
        .delete("/results")
        .set("Authorization", `Bearer ${uid}`)
        .send()
        .expect(200);

      //THEN
      expect(body.message).toEqual("All results deleted");
      expect(body.data).toBeNull();

      expect(deleteAllMock).toHaveBeenCalledWith(uid);
      expect(logToDbMock).toHaveBeenCalledWith("user_results_deleted", "", uid);
    });
    it("should fail to delete with non-fresh token", async () => {
      //GIVEN
      mockAuth.modifyToken({ iat: 0 });

      //WHEN/THEN
      await mockApp
        .delete("/results")
        .set("Authorization", `Bearer ${uid}`)
        .send()
        .expect(401);
    });
  });
  describe("addResult", () => {
    //TODO improve test coverage for addResult
    const insertedId = new ObjectId();
    const userGetMock = vi.spyOn(UserDal, "getUser");
    const userCheckIfPbMock = vi.spyOn(UserDal, "checkIfPb");
    const userIncrementXpMock = vi.spyOn(UserDal, "incrementXp");
    const userUpdateSolveStatsMock = vi.spyOn(UserDal, "updateSolveStats");
    const resultAddMock = vi.spyOn(ResultDal, "addResult");
    const publicUpdateStatsMock = vi.spyOn(PublicDal, "updateStats");

    beforeEach(async () => {
      await enableResultsSaving(true);
      await enableUsersXpGain(true);

      [
        userGetMock,
        userCheckIfPbMock,
        userIncrementXpMock,
        userUpdateSolveStatsMock,
        resultAddMock,
        publicUpdateStatsMock,
      ].forEach((it) => it.mockClear());

      userGetMock.mockResolvedValue({ name: "bob", uid } as any);
      userCheckIfPbMock.mockResolvedValue(true);
      resultAddMock.mockResolvedValue({ insertedId });
      userIncrementXpMock.mockResolvedValue();
    });

    /**
     * The whole point of this block: `POST /results` runs the ME-174
     * regeneration, ME-175's hash/duplicate checks, ME-179 … ME-182's
     * plausibility layer and AC-025's metric recomputation before anything is
     * saved. Before this rewrite the spec sent a monkeytype payload and never
     * mentioned `mathSeed`, `taskLog` or `engineVersion` at all, so none of that
     * pipeline was exercised end to end.
     */
    it("should add an honest result", async () => {
      //GIVEN
      const completedEvent = buildCompletedEvent();

      //WHEN
      const { body } = await mockApp
        .post("/results")
        .set("Authorization", `Bearer ${uid}`)
        .send({ result: completedEvent })
        .expect(200);

      //THEN
      expect(body.message).toEqual("Result saved");
      expect(body.data).toMatchObject({
        isPb: true,
        insertedId: insertedId.toHexString(),
      });

      expect(resultAddMock).toHaveBeenCalledWith(
        uid,
        expect.objectContaining({
          score: completedEvent.score,
          correct: completedEvent.correct,
          wrong: completedEvent.wrong,
          acc: completedEvent.acc,
          mode: "time",
          mode2: `${SETTINGS_TIME}`,
          settingsId: completedEvent.settingsId,
          name: "bob",
          uid,
          isPb: true,
        }),
      );
    });

    it("never persists the anti-cheat inputs", async () => {
      await mockApp
        .post("/results")
        .set("Authorization", `Bearer ${uid}`)
        .send({ result: buildCompletedEvent() })
        .expect(200);

      const stored = resultAddMock.mock.calls[0]?.[1] as Record<
        string,
        unknown
      >;
      for (const field of [
        "hash",
        "mathSeed",
        "mathSettings",
        "engineVersion",
        "taskLog",
        "incompleteTests",
      ]) {
        expect(stored[field], field).toBeUndefined();
      }
    });

    it("ME-174 — rejects a forged task log with 467", async () => {
      const forged = honestTaskLog(60);
      forged[7] = { ...(forged[7] as TaskLogEntry), prompt: "1 + 1" };

      await mockApp
        .post("/results")
        .set("Authorization", `Bearer ${uid}`)
        .send({ result: buildCompletedEvent({ taskLog: forged }) })
        .expect(467);

      expect(resultAddMock).not.toHaveBeenCalled();
    });

    it("ME-174 — rejects a log that belongs to a different seed", async () => {
      await mockApp
        .post("/results")
        .set("Authorization", `Bearer ${uid}`)
        .send({ result: buildCompletedEvent({ mathSeed: MATH_SEED + 1 }) })
        .expect(467);

      expect(resultAddMock).not.toHaveBeenCalled();
    });

    it("ME-184 — rejects a stale engine version with 468, not 467", async () => {
      const { status } = await mockApp
        .post("/results")
        .set("Authorization", `Bearer ${uid}`)
        .send({ result: buildCompletedEvent({ engineVersion: "0.0.1" }) });

      expect(status).toBe(468);
      expect(resultAddMock).not.toHaveBeenCalled();
    });

    it("ME-179 — rejects an implausibly fast run", async () => {
      // Driven through ME-176's `"toolong"` path, where the ceiling is measured
      // against the committed count. A full 968-entry log would be a ~105 kB
      // body, which express's default `json()` limit rejects before the
      // controller is reached — see the note on `app.ts` in the WP-10 report.
      await mockApp
        .post("/results")
        .set("Authorization", `Bearer ${uid}`)
        .send({
          result: buildCompletedEvent({
            taskLog: "toolong",
            correct: 1400,
            wrong: 0,
            score: 1400,
            acc: 100,
            tpm: 175,
            spm: 175,
          }),
        })
        .expect(467);

      expect(resultAddMock).not.toHaveBeenCalled();
    });

    it("ME-176 — accepts a plausible run whose log was too long to send", async () => {
      await mockApp
        .post("/results")
        .set("Authorization", `Bearer ${uid}`)
        .send({
          result: buildCompletedEvent({
            taskLog: "toolong",
            correct: 800,
            wrong: 0,
            score: 800,
            acc: 100,
            tpm: 100,
            spm: 100,
          }),
        })
        .expect(200);
    });

    it("ME-182(a) — rejects a testDuration that is not time * 60", async () => {
      // `assertSettingsConsistent` catches this before the anti-cheat layer
      // does, so the code is RESULT_DATA_INVALID rather than 467. Both checks
      // exist on purpose; the anti-cheat copy is covered directly in
      // `__tests__/anticheat/index.spec.ts`.
      await mockApp
        .post("/results")
        .set("Authorization", `Bearer ${uid}`)
        .send({
          result: buildCompletedEvent({ testDuration: TEST_DURATION + 1 }),
        })
        .expect(463);

      expect(resultAddMock).not.toHaveBeenCalled();
    });

    it("ME-019/C4 — rejects a settingsId that does not derive from settings", async () => {
      // Well-formed, but not the signature these settings hash to.
      await mockApp
        .post("/results")
        .set("Authorization", `Bearer ${uid}`)
        .send({
          result: buildCompletedEvent({
            settingsId: "100:12:off:off:0:0:0",
          }),
        })
        .expect(463);

      expect(resultAddMock).not.toHaveBeenCalled();
    });

    it("AC-025 — rejects metrics that disagree with the task log", async () => {
      await mockApp
        .post("/results")
        .set("Authorization", `Bearer ${uid}`)
        .send({ result: buildCompletedEvent({ score: 9999 }) })
        .expect(463);

      expect(resultAddMock).not.toHaveBeenCalled();
    });

    it("AC-025/C5 — rejects a consistency that disagrees with the task log", async () => {
      // `consistency` is persisted and rendered in the CP-096 morestats row, but
      // it is not a PB, leaderboard, CSV or XP input (C5) — so nothing
      // downstream would have caught a forged value. It was the one metric of
      // the six the anti-cheat layer did not re-derive.
      await mockApp
        .post("/results")
        .set("Authorization", `Bearer ${uid}`)
        .send({ result: buildCompletedEvent({ consistency: 12.34 }) })
        .expect(463);

      expect(resultAddMock).not.toHaveBeenCalled();
    });

    it("C37 — rejects idle time longer than the test itself", async () => {
      // Unbounded above in the schema. Left unchecked it makes `calculateXp`
      // produce a negative base, which AC-034 turns into a client-triggerable
      // 500, and drives the site-wide training time backwards.
      await mockApp
        .post("/results")
        .set("Authorization", `Bearer ${uid}`)
        .send({
          result: buildCompletedEvent({ afkDuration: TEST_DURATION + 100 }),
        })
        .expect(463);

      expect(resultAddMock).not.toHaveBeenCalled();
    });

    it("C37 — accepts idle time exactly equal to the test", async () => {
      await mockApp
        .post("/results")
        .set("Authorization", `Bearer ${uid}`)
        .send({ result: buildCompletedEvent({ afkDuration: TEST_DURATION }) })
        .expect(200);

      // AC-026: the base is zero, so no XP — but no 500 either.
      expect(userIncrementXpMock).toHaveBeenCalledWith(uid, 0);
    });

    it("never reports a negative training time to the public stats", async () => {
      await mockApp
        .post("/results")
        .set("Authorization", `Bearer ${uid}`)
        .send({ result: buildCompletedEvent({ afkDuration: TEST_DURATION }) })
        .expect(200);

      const [, seconds] = publicUpdateStatsMock.mock.calls[0] ?? [];
      expect(seconds).toBeGreaterThanOrEqual(0);
    });

    it("BL-5 — saves a run whose accuracy is well under 75 %", async () => {
      // The single reason BL-5 was a blocker: monkeytype rejected `acc < 75`.
      const taskLog = honestTaskLog(60).map((entry, i) =>
        i % 2 === 0 ? { ...entry, given: "999999", correct: false } : entry,
      );
      // Derived, not asserted: the controller recomputes them from the log
      // (AC-025), so hard-coding would test the fixture rather than the floor.
      const metrics = computeMetrics(taskLog, TEST_DURATION);
      expect(metrics.acc).toBe(50);

      await mockApp
        .post("/results")
        .set("Authorization", `Bearer ${uid}`)
        .send({ result: buildCompletedEvent({ taskLog, ...metrics }) })
        .expect(200);

      expect(resultAddMock).toHaveBeenCalledWith(
        uid,
        expect.objectContaining({ acc: 50, score: 0 }),
      );
    });

    it("DoD-24 — saves a run with acc = 12.5, end to end", async () => {
      // The literal DoD-24 case. The test above stops at 50 %, which is exactly
      // where monkeytype's *schema* floor sat (`.min(50)`), so on its own it
      // cannot tell a removed floor from a floor that happens to be satisfied.
      // 56 tasks, one right in every eight: 7 / 56 = 12.5 %.
      const taskLog = honestTaskLog(56).map((entry, i) =>
        i % 8 === 0 ? entry : { ...entry, given: "999999", correct: false },
      );
      const metrics = computeMetrics(taskLog, TEST_DURATION);
      expect(metrics.acc).toBe(12.5);

      await mockApp
        .post("/results")
        .set("Authorization", `Bearer ${uid}`)
        .send({ result: buildCompletedEvent({ taskLog, ...metrics }) })
        .expect(200);

      expect(resultAddMock).toHaveBeenCalledWith(
        uid,
        expect.objectContaining({ acc: 12.5 }),
      );
    });

    it("should fail if result saving is disabled", async () => {
      //GIVEN
      await enableResultsSaving(false);

      //WHEN
      const { body } = await mockApp
        .post("/results")
        .set("Authorization", `Bearer ${uid}`)
        .send({})
        .expect(503);

      //THEN
      expect(body.message).toEqual("Results are not being saved at this time.");
    });
    it("should fail without mandatory properties", async () => {
      //GIVEN

      //WHEN
      const { body } = await mockApp
        .post("/results")
        .set("Authorization", `Bearer ${uid}`)
        .send({})
        .expect(422);

      //THEN
      expect(body).toEqual({
        message: "Invalid request data schema",
        validationErrors: ['"result" Required'],
      });
    });
    it("should fail with unknown properties", async () => {
      //GIVEN

      //WHEN
      const { body } = await mockApp
        .post("/results")
        .set("Authorization", `Bearer ${uid}`)
        .send({
          result: buildCompletedEvent({
            extra2: "value",
          } as any),
          extra: "value",
        })
        .expect(422);

      //THEN
      expect(body).toEqual({
        message: "Invalid request data schema",
        validationErrors: [
          `"result" Unrecognized key(s) in object: 'extra2'`,
          "Unrecognized key(s) in object: 'extra'",
        ],
      });
    });

    // it("should fail invalid properties ", async () => {
    //GIVEN
    //WHEN
    // const { body } = await mockApp
    //   .post("/results")
    //   .set("Authorization", `Bearer ${uid}`)
    //   //TODO add all properties
    //   .send({ result: { acc: 25 } })
    //   .expect(422);
    //THEN
    /*
      expect(body).toEqual({
        message: "Invalid request data schema",
        validationErrors: [
        ],
      });
      */
    // });
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

const MATH_SEED = 0x0badf00d;
const TEST_DURATION = SETTINGS_TIME * 60;

/**
 * An **honest** payload: the task log is regenerated from `(mathSeed, settings)`
 * by `packages/math-engine`, so it reproduces exactly and the ME-174 layer
 * accepts it. Building it any other way would make every `addResult` test a test
 * of the anti-cheat rejection path instead of the save path.
 */
function honestTaskLog(n: number, stepMs = 1000): TaskLogEntry[] {
  return generateSequence(
    MATH_SEED,
    { ...SETTINGS, time: SETTINGS_TIME },
    n,
  ).map((task, i) => ({
    i,
    kind: task.kind,
    prompt: task.prompt,
    expected: task.answerDisplay,
    given: task.answerDisplay.replace("−", "-"),
    correct: true,
    tStart: i * stepMs,
    tEnd: i * stepMs + stepMs - 1,
  }));
}

function buildCompletedEvent(result?: Partial<CompletedEvent>): CompletedEvent {
  const taskLog = result?.taskLog ?? honestTaskLog(60);
  const correct = taskLog === "toolong" ? 60 : taskLog.length;
  return {
    score: correct,
    correct,
    wrong: 0,
    acc: 100,
    tpm: correct / (TEST_DURATION / 60),
    spm: correct / (TEST_DURATION / 60),
    // Derived like every other metric. `honestTaskLog` gives every task the same
    // response time, so the coefficient of variation is 0 and kogasa reports
    // 100 (ME-165 / C5). The literal that used to sit here was only accepted
    // because `assertMetricsMatchTaskLog` never re-derived `consistency` — which
    // is the hole this fixture must not paper over again.
    consistency:
      taskLog === "toolong"
        ? 90
        : computeMetrics(taskLog, TEST_DURATION).consistency,
    mode: "time",
    mode2: `${SETTINGS_TIME}`,
    timestamp: Date.now() - 1000,
    testDuration: TEST_DURATION,
    chartData: { score: [1, 2, 3], tpm: [4, 5, 6], wrong: [0, 0, 0] },
    uid,
    settings: SETTINGS,
    settingsId: buildSettingsId(SETTINGS),
    restartCount: 4,
    incompleteTestSeconds: 2,
    afkDuration: 5,
    hash: "hash",
    mathSeed: MATH_SEED,
    mathSettings: { ...SETTINGS, time: SETTINGS_TIME },
    engineVersion: MATH_ENGINE_VERSION,
    taskLog,
    incompleteTests: [{ acc: 75, seconds: 10 }],
    ...result,
  };
}

function givenDbResult(uid: string, customize?: Partial<DBResult>): DBResult {
  return {
    _id: new ObjectId(),
    score: 190,
    correct: 200,
    wrong: 10,
    // BL-5: accuracy is unbounded below — a stored result may legitimately be
    // anywhere in [0, 100].
    acc: Math.random() * 100,
    tpm: Math.random() * 100,
    spm: Math.random() * 100,
    consistency: Math.random() * 100,
    mode: "time",
    mode2: "8",
    timestamp: Math.round(Math.random() * 100),
    testDuration: 480,
    chartData: {
      score: [Math.random() * 100],
      tpm: [Math.random() * 100],
      wrong: [Math.random() * 10],
    },
    settings: SETTINGS,
    settingsId: buildSettingsId(SETTINGS),
    isPb: true,
    uid,
    name: "testName",
    ...customize,
  };
}

async function enableResultsSaving(enabled: boolean): Promise<void> {
  const mockConfig = await configuration;
  mockConfig.results = { ...mockConfig.results, savingEnabled: enabled };

  vi.spyOn(Configuration, "getCachedConfiguration").mockResolvedValue(
    mockConfig,
  );
}
async function enableUsersXpGain(enabled: boolean): Promise<void> {
  const mockConfig = await configuration;
  mockConfig.users.xp = { ...mockConfig.users.xp, enabled };

  vi.spyOn(Configuration, "getCachedConfiguration").mockResolvedValue(
    mockConfig,
  );
}
