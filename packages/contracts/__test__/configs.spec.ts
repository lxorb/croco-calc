import { describe, expect, it } from "vitest";
import { ConfigSchema } from "@croco-calc/schemas/configs";

import { configsContract } from "../src/configs";

/**
 * TR-210 / TR-260 — the `PATCH /configs` body must strip unknown keys, not
 * reject them.
 *
 * This exists because the obvious way to write it does not work. `ConfigSchema`
 * is `.strict()`, and zod's `.partial()` propagates `unknownKeys`, so
 * `PartialConfigSchema` is strict too. `body: PartialConfigSchema` therefore
 * reads as "non-strict" and behaves as strict — which is precisely the bug this
 * file guards, and precisely the bug that shipped once already.
 *
 * The failure it prevents is not theoretical and not confined to deploy day: a
 * browser holding a cached SPA build keeps sending the keys that build knew
 * about. If the body rejects unknown keys, that user's *every* subsequent
 * setting change 422s until they hard-refresh — they cannot change their theme,
 * their test length, anything.
 */
describe("PATCH /configs body (TR-210 / TR-260)", () => {
  const body = configsContract.save.body;

  const strippedKeys = [
    // TR-203 — struck with the custom caret by the one-task-at-a-time redesign.
    // These two are the concrete keys that motivated the ruling.
    ["smoothCaret", "medium"],
    ["caretStyle", "default"],
    // §6.1 — struck with the typing engine.
    ["paceCaret", "average"],
    ["blindMode", true],
    ["lazyMode", true],
    ["freedomMode", true],
    ["strictSpace", true],
    ["stopOnError", "letter"],
    ["quickEnd", true],
    ["confidenceMode", "on"],
    ["indicateTypos", "below"],
    ["hideExtraLetters", true],
    ["capsLockWarning", true],
    ["monkeyPowerLevel", "2"],
    ["liveBurstStyle", "mini"],
    ["tapeMode", "letter"],
    ["keymapMode", "next"],
    ["funbox", ["58008"]],
  ] as const;

  it.for(strippedKeys)(
    "strips the removed key `%s` instead of rejecting the whole save",
    ([key, value]) => {
      const result = body.safeParse({ theme: "croco", [key]: value });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ theme: "croco" });
    },
  );

  it("strips every removed key at once", () => {
    const staleSave = Object.fromEntries(
      strippedKeys.map(([key, value]) => [key, value]),
    );

    const result = body.safeParse({ ...staleSave, theme: "croco" });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ theme: "croco" });
  });

  it("still rejects a bad value for a key that DOES exist", () => {
    // Stripping unknown keys is not the same as accepting anything. A key the
    // schema knows about is still validated exactly as before.
    expect(body.safeParse({ time: 7 }).success).toBe(false);
    expect(body.safeParse({ theme: "not-a-theme" }).success).toBe(false);
  });

  it("leaves ConfigSchema itself strict — this relaxes the wire, not the model", () => {
    expect(ConfigSchema._def.unknownKeys).toBe("strict");
    expect(
      ConfigSchema.partial().safeParse({ smoothCaret: "medium" }).success,
    ).toBe(false);
  });
});
