import { describe, it, expect } from "vitest";
import * as PublicDAL from "../../../src/dal/public";

describe("PublicDAL", function () {
  it("should be able to update stats", async function () {
    // checks it doesn't throw an error. the actual values are checked in another test.
    await PublicDAL.updateStats(1, 15);
  });

  it("should be able to get site stats", async function () {
    const siteStats = await PublicDAL.getSiteStats();
    expect(siteStats).toHaveProperty("testsCompleted");
    expect(siteStats).toHaveProperty("testsStarted");
    expect(siteStats).toHaveProperty("timeSpent");
  });

  it("should increment stats on update", async function () {
    // checks that both functions are working on the same data in mongo
    const priorStats = await PublicDAL.getSiteStats();
    await PublicDAL.updateStats(1, 60);
    const afterStats = await PublicDAL.getSiteStats();
    expect(afterStats.testsCompleted).toBe(priorStats.testsCompleted + 1);
    expect(afterStats.testsStarted).toBe(priorStats.testsStarted + 2);
    expect(afterStats.timeSpent).toBe(priorStats.timeSpent + 60);
  });
});
