import { Config as ConfigType } from "@croco-calc/schemas/configs";
import { cleanup, render } from "@solidjs/testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const remoteConfig = vi.hoisted<{ value: Partial<ConfigType> | null }>(() => ({
  value: null,
}));
const getSpy = vi.hoisted(() =>
  vi.fn(async () => ({
    status: 200,
    body: { message: "ok", data: remoteConfig.value },
  })),
);
const saveSpy = vi.hoisted(() =>
  vi.fn(async () => ({ status: 200, body: { message: "ok" } })),
);

vi.mock("../../src/ts/ape", () => ({
  default: { configs: { get: getSpy, save: saveSpy } },
}));

// `states/test.ts` is WP-06's and is mid-migration; the bar reads exactly two
// signals out of it. The factory is async so `createSignal` comes from the very
// same solid-js instance the component under test uses.
vi.mock("../../src/ts/states/test", async () => {
  const { createSignal } = await import("solid-js");
  const [getFocus, setFocus] = createSignal(false);
  const [getResultVisible, setResultVisible] = createSignal(false);
  return { getFocus, setFocus, getResultVisible, setResultVisible };
});

vi.mock("../../src/ts/events/test", () => ({
  restartTestEvent: { dispatch: (): void => undefined },
}));

import { TestConfig } from "../../src/ts/components/pages/test/TestConfig";
import { BAR_KEYS } from "../../src/ts/config/coupling";
import { updateFromServer } from "../../src/ts/config/remote";
import { setConfig } from "../../src/ts/config/setters";
import { Config } from "../../src/ts/config/store";
import { __testing } from "../../src/ts/config/testing";
import { getDefaultConfig } from "../../src/ts/constants/default-config";

/**
 * SB-208 — signing in with a server config that differs from the local one
 * overwrites the local config and repaints the bar (SB-127, SB-128, SB-192).
 */

function control(container: HTMLElement, key: string): HTMLButtonElement {
  const found = container.querySelector<HTMLButtonElement>(
    `[data-setting="${key}"]`,
  );
  expect(found, key).not.toBeNull();
  return found as HTMLButtonElement;
}

function barValues(container: HTMLElement): Record<string, string> {
  return Object.fromEntries(
    BAR_KEYS.map((key) => [key, control(container, key).dataset["value"]]),
  ) as Record<string, string>;
}

/** Put both `Config` and the Solid store into a known state. */
function seedLocalConfig(overrides: Partial<ConfigType>): void {
  __testing.replaceConfig(overrides);
  for (const key of BAR_KEYS) {
    setConfig(key, getDefaultConfig()[key] as never, { nosave: true });
  }
  for (const [key, value] of Object.entries(overrides)) {
    setConfig(key as keyof ConfigType, value as never, { nosave: true });
  }
}

beforeEach(() => {
  getSpy.mockClear();
  saveSpy.mockClear();
  remoteConfig.value = null;
  seedLocalConfig({});
});

afterEach(() => {
  cleanup();
});

describe("SB-208 - sign-in with a differing server config", () => {
  it("fetches GET /configs", async () => {
    remoteConfig.value = { ...getDefaultConfig() };
    await updateFromServer();
    expect(getSpy).toHaveBeenCalledTimes(1);
  });

  it("SB-127 - the server config wins over the local one", async () => {
    // the local (anonymous) config
    seedLocalConfig({ addition: "100", time: 1, decimals: false });

    // ...and a different config on the account
    remoteConfig.value = {
      ...getDefaultConfig(),
      addition: "off",
      multiplication: "20",
      division: "off",
      fractionAddition: "12",
      fractionMultiplication: true,
      decimals: true,
      negatives: false,
      time: 4,
    };

    await updateFromServer();

    expect(Config.addition).toBe("off");
    expect(Config.multiplication).toBe("20");
    expect(Config.division).toBe("off");
    expect(Config.fractionAddition).toBe("12");
    expect(Config.fractionMultiplication).toBe(true);
    expect(Config.decimals).toBe(true);
    expect(Config.negatives).toBe(false);
    expect(Config.time).toBe(4);
  });

  it("repaints the bar with the server values", async () => {
    seedLocalConfig({ addition: "100", time: 1 });
    const { container } = render(() => <TestConfig />);

    expect(barValues(container)).toMatchObject({
      addition: "100",
      time: "1",
    });

    remoteConfig.value = {
      ...getDefaultConfig(),
      addition: "off",
      multiplication: "12",
      time: 4,
      negatives: false,
    };

    await updateFromServer();

    expect(barValues(container)).toMatchObject({
      addition: "off",
      multiplication: "12",
      time: "4",
      negatives: "false",
    });
    // SB-071/SB-072: the now-off control picks up the strikethrough too
    expect(
      control(container, "addition").querySelector("span")?.className,
    ).toContain("line-through");
  });

  it("SB-127 - it does not write the server config straight back", async () => {
    seedLocalConfig({ time: 1 });
    remoteConfig.value = { ...getDefaultConfig(), time: 4 };

    await updateFromServer();

    // `saveFullConfigToLocalStorage(true)` suppresses the write-back.
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it("leaves the bar alone when the two configs already agree", async () => {
    seedLocalConfig({});
    const { container } = render(() => <TestConfig />);
    const before = barValues(container);

    remoteConfig.value = { ...Config };
    await updateFromServer();

    expect(barValues(container)).toEqual(before);
  });

  it("SB-128 - a user with no server config yet gets the defaults", async () => {
    seedLocalConfig({ addition: "100", time: 1 });
    remoteConfig.value = null;

    await updateFromServer();

    const defaults = getDefaultConfig();
    for (const key of BAR_KEYS) {
      expect(Config[key], key).toEqual(defaults[key]);
    }
  });

  it("SB-104 - a hand-edited server config with every generator off is repaired", async () => {
    remoteConfig.value = {
      ...getDefaultConfig(),
      addition: "off",
      multiplication: "off",
      division: "off",
      fractionAddition: "off",
      fractionMultiplication: false,
    };

    await updateFromServer();

    expect(Config.addition).toBe("1000");
  });
});
