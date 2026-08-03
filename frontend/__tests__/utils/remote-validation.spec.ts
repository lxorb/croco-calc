import { describe, expect, it } from "vitest";

import { remoteValidation } from "../../src/ts/utils/remote-validation";
import { IsValidResponse } from "../../src/ts/types/validation";

describe("remoteValidation", () => {
  const respond = (
    status: number,
    message: string,
    available = true,
  ): ((val: string) => Promise<IsValidResponse>) =>
    remoteValidation<string, { available: boolean }>(
      async () => ({ status, body: { data: { available }, message } }),
      { check: (data) => data.available || "Name not available" },
    );

  it("runs the check on success", async () => {
    expect(await respond(200, "ok")("croco")).toBe(true);
    expect(await respond(200, "ok", false)("croco")).toBe("Name not available");
  });

  it("passes a 4xx message through verbatim", async () => {
    expect(await respond(409, "Username unavailable")("croco")).toBe(
      "Username unavailable",
    );
  });

  it("keeps the server's message on a 5xx instead of hiding it", async () => {
    // A bare "Server unavailable. Please try again later." is what made a 500
    // from GET /users/checkName/:name indistinguishable from an outage.
    const result = await respond(500, "collation is not supported")("croco");

    expect(result).toContain("collation is not supported");
  });

  it("falls back to a plain message when the server sent none", async () => {
    expect(await respond(503, "")("croco")).toBe(
      "Server unavailable. Please try again later.",
    );
  });

  it("lets a caller override the 5xx handling", async () => {
    const validate = remoteValidation<string, { available: boolean }>(
      async () => ({ status: 500, body: { message: "boom" } }),
      { on5xx: (message) => ({ warning: `could not check (${message})` }) },
    );

    expect(await validate("croco")).toEqual({
      warning: "could not check (boom)",
    });
  });
});
