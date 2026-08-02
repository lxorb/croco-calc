import { Config as ConfigType } from "@croco-calc/schemas/configs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const saveSpy = vi.hoisted(() =>
  vi.fn(async () => ({ status: 200, body: { message: "ok" } })),
);
const deleteSpy = vi.hoisted(() =>
  vi.fn(async () => ({ status: 200, body: { message: "ok" } })),
);
const authenticated = vi.hoisted(() => ({ value: false }));

vi.mock("../../src/ts/ape", () => ({
  default: { configs: { save: saveSpy, delete: deleteSpy } },
}));

vi.mock("../../src/ts/states/core", () => ({
  isAuthenticated: (): boolean => authenticated.value,
  getUserId: (): string | null => (authenticated.value ? "uid" : null),
}));

import { setConfig } from "../../src/ts/config/setters";
import { Config } from "../../src/ts/config/store";
import { __testing } from "../../src/ts/config/testing";
import { getDefaultConfig } from "../../src/ts/constants/default-config";

/** The config as it currently sits in localStorage. */
function storedConfig(): Partial<ConfigType> {
  const raw = localStorage.getItem("config");
  expect(raw).not.toBeNull();
  return JSON.parse(raw as string) as Partial<ConfigType>;
}

// `LocalStorageWithSchema` keeps an in-memory cache and skips the write when
// the serialised config is byte-identical to what it last wrote, so the store
// must never be cleared behind its back - that would desync the cache and make
// the writes below look like they never happened. Resetting `Config` to the
// defaults between tests is enough isolation.
beforeEach(() => {
  vi.useFakeTimers();
  saveSpy.mockClear();
  deleteSpy.mockClear();
  authenticated.value = false;
  __testing.replaceConfig({});
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

describe("SB-121 - every settings change writes localStorage synchronously", () => {
  it("writes the whole config object on the very same tick as the click", () => {
    setConfig("addition", "100");

    // No timer has run; the write already happened.
    expect(storedConfig().addition).toBe("100");
  });

  it("SB-120 - it is stored under the key 'config', as a full config object", () => {
    setConfig("time", 4);

    const stored = storedConfig();
    expect(stored.time).toBe(4);
    // Every other key is still present - this is a full write, not a patch.
    for (const key of Object.keys(getDefaultConfig())) {
      expect(stored, key).toHaveProperty(key);
    }
  });

  it("keeps writing on every subsequent change", () => {
    setConfig("time", 4);
    expect(storedConfig().time).toBe(4);
    setConfig("time", 2);
    expect(storedConfig().time).toBe(2);
  });
});

describe("SB-207 - an anonymous user makes zero network requests", () => {
  it("does not call the config endpoint, before or after the debounce window", () => {
    setConfig("addition", "100");
    setConfig("time", 1);

    expect(saveSpy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(5000);
    expect(saveSpy).not.toHaveBeenCalled();

    // ...and the value is still persisted locally (SB-129: local config is
    // never touched by the absence of an account).
    expect(storedConfig().addition).toBe("100");
    expect(Config.addition).toBe("100");
  });
});

describe("SB-123, SB-206 - a signed-in user gets one debounced PATCH of only the changed keys", () => {
  beforeEach(() => {
    authenticated.value = true;
  });

  it("issues exactly one request, 1000 ms after the change, containing only that key", () => {
    setConfig("addition", "100");

    // Nothing yet - the flush is debounced.
    expect(saveSpy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(999);
    expect(saveSpy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(saveSpy).toHaveBeenCalledWith({ body: { addition: "100" } });
  });

  it("coalesces a burst of changes into a single request", () => {
    setConfig("addition", "100");
    vi.advanceTimersByTime(300);
    setConfig("time", 2);
    vi.advanceTimersByTime(300);
    setConfig("negatives", false);

    vi.advanceTimersByTime(1000);

    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(saveSpy).toHaveBeenCalledWith({
      body: { addition: "100", time: 2, negatives: false },
    });
  });

  it("does not resend a key that has not changed again", () => {
    setConfig("addition", "100");
    vi.advanceTimersByTime(1000);
    expect(saveSpy).toHaveBeenCalledTimes(1);

    setConfig("time", 1);
    vi.advanceTimersByTime(1000);

    expect(saveSpy).toHaveBeenCalledTimes(2);
    expect(saveSpy).toHaveBeenLastCalledWith({ body: { time: 1 } });
  });

  it("SB-090 - a coupling cascade sends both keys, because both really changed", () => {
    __testing.replaceConfig({
      multiplication: "off",
      fractionMultiplication: false,
    });

    setConfig("fractionMultiplication", true);
    vi.advanceTimersByTime(1000);

    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(saveSpy).toHaveBeenCalledWith({
      body: { multiplication: "100", fractionMultiplication: true },
    });
  });

  it("a blocked change (SB-103) is never sent", () => {
    __testing.replaceConfig({
      addition: "1000",
      multiplication: "off",
      division: "off",
      fractionAddition: "off",
      fractionMultiplication: false,
    });

    expect(setConfig("addition", "off")).toBe(false);
    vi.advanceTimersByTime(1000);

    expect(saveSpy).not.toHaveBeenCalled();
  });
});
