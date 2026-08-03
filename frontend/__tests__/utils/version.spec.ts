import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const getLatestReleaseFromGitHub = vi.hoisted(() => vi.fn());
const isDevEnvironment = vi.hoisted(() => vi.fn(() => false));

vi.mock("../../src/ts/utils/static-data", () => ({
  getLatestReleaseFromGitHub,
}));
vi.mock("../../src/ts/utils/env", () => ({ isDevEnvironment }));

const { fetchLatestVersion } = await import("../../src/ts/utils/version");

function spyOnConsoleError(): {
  calls: unknown[][];
} {
  const calls: unknown[][] = [];
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    calls.push(args);
  });
  return { calls };
}

describe("fetchLatestVersion", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    isDevEnvironment.mockReturnValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * The production defect: croco calc has published no GitHub release, so every
   * page load logged "Failed to fetch version number from GitHub: No release
   * found" at ERROR. An empty release feed is an expected state, not a failure.
   */
  it("is silent when the repository has published no release", async () => {
    const { calls } = spyOnConsoleError();
    getLatestReleaseFromGitHub.mockResolvedValue(null);

    await expect(fetchLatestVersion()).resolves.toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("still reports a genuine lookup failure", async () => {
    const { calls } = spyOnConsoleError();
    getLatestReleaseFromGitHub.mockRejectedValue(new Error("503 from GitHub"));

    await expect(fetchLatestVersion()).resolves.toBeNull();
    expect(calls).toHaveLength(1);
    expect(String(calls[0]?.[0])).toContain(
      "Failed to fetch version number from GitHub",
    );
  });

  it("returns the release name once one exists", async () => {
    const { calls } = spyOnConsoleError();
    getLatestReleaseFromGitHub.mockResolvedValue("1.0.0");

    await expect(fetchLatestVersion()).resolves.toEqual({
      text: "1.0.0",
      isNew: false,
    });
    expect(calls).toHaveLength(0);
  });
});
