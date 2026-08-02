import { initContract } from "@ts-rest/core";
import { adminContract } from "./admin";
import { configsContract } from "./configs";
import { psasContract } from "./psas";
import { publicContract } from "./public";
import { leaderboardsContract } from "./leaderboards";
import { resultsContract } from "./results";
import { configurationContract } from "./configuration";
import { devContract } from "./dev";
import { usersContract } from "./users";
import { connectionsContract } from "./connections";

const c = initContract();

export const contract = c.router({
  admin: adminContract,
  configs: configsContract,
  psas: psasContract,
  public: publicContract,
  leaderboards: leaderboardsContract,
  results: resultsContract,
  configuration: configurationContract,
  dev: devContract,
  users: usersContract,
  connections: connectionsContract,
});

/**
 * Whenever there is a breaking change with old frontend clients increase this number.
 * This will inform the frontend to refresh.
 *
 * ME-184: any change to the `@croco-calc/math-engine` generation, mixing or
 * judging semantics MUST bump this in the same commit, or cached clients will
 * silently produce results the server rejects (ME-177).
 */
export const COMPATIBILITY_CHECK = 6;
export const COMPATIBILITY_CHECK_HEADER = "X-Compatibility-Check";
