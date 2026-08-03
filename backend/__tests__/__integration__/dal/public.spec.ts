import { describe, it, expect } from "vitest";
import * as PublicDAL from "../../../src/dal/public";

describe("PublicDAL", function () {
  // Runs before any `updateStats` call, so the counter document does not exist
  // yet -- the state of a freshly deployed site. It must read as zeros, not 404.
  it("should return zeroed training stats when no test has been completed", async function () {
    const trainingStats = await PublicDAL.getTrainingStats();
    expect(trainingStats).toEqual({
      timeTraining: 0,
      testsCompleted: 0,
      testsStarted: 0,
    });
  });

  it("should be able to update stats", async function () {
    // checks it doesn't throw an error. the actual values are checked in another test.
    await PublicDAL.updateStats(1, 15);
  });

  // CP-135: the wire shape is `timeTraining`; the stored document still counts
  // into `timeSpent` and `getTrainingStats` maps it on the way out.
  it("should be able to get training stats", async function () {
    const trainingStats = await PublicDAL.getTrainingStats();
    expect(trainingStats).toHaveProperty("testsCompleted");
    expect(trainingStats).toHaveProperty("testsStarted");
    expect(trainingStats).toHaveProperty("timeTraining");
  });

  it("should increment stats on update", async function () {
    // checks that both functions are working on the same data in mongo
    const priorStats = await PublicDAL.getTrainingStats();
    await PublicDAL.updateStats(1, 60);
    const afterStats = await PublicDAL.getTrainingStats();
    expect(afterStats.testsCompleted).toBe(priorStats.testsCompleted + 1);
    expect(afterStats.testsStarted).toBe(priorStats.testsStarted + 2);
    expect(afterStats.timeTraining).toBe(priorStats.timeTraining + 60);
  });
});
