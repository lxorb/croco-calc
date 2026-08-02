import { Config as ConfigType } from "@croco-calc/schemas/configs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BAR_KEYS, getCycleValues } from "../../src/ts/config/coupling";
import { cycleSetting, setConfig } from "../../src/ts/config/setters";
import { Config } from "../../src/ts/config/store";
import { __testing } from "../../src/ts/config/testing";
import { getDefaultConfig } from "../../src/ts/constants/default-config";
import * as Notifications from "../../src/ts/states/notifications";

const noticeSpy = vi.spyOn(Notifications, "showNoticeNotification");

function setState(overrides: Partial<ConfigType>): void {
  __testing.replaceConfig(overrides);
}

const ALL_GENERATORS_OFF = {
  addition: "off",
  multiplication: "off",
  division: "off",
  fractionAddition: "off",
  fractionMultiplication: false,
} as const satisfies Partial<ConfigType>;

beforeEach(() => {
  __testing.replaceConfig({});
  noticeSpy.mockClear();
});

describe("SB-053 - every state change goes through setConfig", () => {
  it("writes the value and reports success", () => {
    expect(setConfig("addition", "100")).toBe(true);
    expect(Config.addition).toBe("100");
  });

  it("rejects a value outside the schema domain", () => {
    expect(setConfig("addition", "9999" as never)).toBe(false);
    expect(Config.addition).toBe("1000");
  });
});

describe("SB-050, SB-051, SB-052 - cycleSetting", () => {
  it("advances one step forward per call and wraps", () => {
    setState({ time: 1 });
    const seen: number[] = [Config.time];
    for (let i = 0; i < 4; i++) {
      expect(cycleSetting("time", 1)).toBe(true);
      seen.push(Config.time);
    }
    expect(seen).toEqual([1, 2, 4, 8, 1]);
  });

  it("SB-051 - a backward cycle walks the domain in reverse", () => {
    setState({ time: 1 });
    const seen: number[] = [Config.time];
    for (let i = 0; i < 4; i++) {
      expect(cycleSetting("time", -1)).toBe(true);
      seen.push(Config.time);
    }
    expect(seen).toEqual([1, 8, 4, 2, 1]);
  });

  it("defaults to a forward cycle", () => {
    setState({ time: 2 });
    cycleSetting("time");
    expect(Config.time).toBe(4);
  });

  it("SB-052 - returns false and changes nothing when every other state is disallowed", () => {
    setState({
      ...ALL_GENERATORS_OFF,
      fractionMultiplication: true,
      multiplication: "off",
    });
    // The stored state is the illegal pair, so the only generator on is
    // fractionMultiplication and it has nowhere legal to go.
    expect(cycleSetting("fractionMultiplication", 1)).toBe(false);
    expect(Config.fractionMultiplication).toBe(true);
  });

  it("SB-102 - the last enabled generator wraps through its ON states only", () => {
    setState({ ...ALL_GENERATORS_OFF, addition: "1000" });
    const seen: string[] = [Config.addition];
    for (let i = 0; i < 4; i++) {
      expect(cycleSetting("addition", 1)).toBe(true);
      seen.push(Config.addition);
    }
    expect(seen).toEqual(["1000", "100", "1000", "100", "1000"]);
    expect(seen).not.toContain("off");
  });
});

describe("SB-090, SB-091, SB-095 - the coupling fires through setConfig, from every entry point", () => {
  it("SB-090 - fractionMultiplication=true while multiplication is off forces multiplication to 100", () => {
    setState({ multiplication: "off", fractionMultiplication: false });
    expect(setConfig("fractionMultiplication", true)).toBe(true);
    expect(Config.multiplication).toBe("100");
    expect(Config.fractionMultiplication).toBe(true);
  });

  it("SB-091 - multiplication=off clears fractionMultiplication", () => {
    setState({
      addition: "1000",
      multiplication: "100",
      fractionMultiplication: true,
    });
    expect(setConfig("multiplication", "off")).toBe(true);
    expect(Config.multiplication).toBe("off");
    expect(Config.fractionMultiplication).toBe(false);
  });

  it("SB-092 - a non-off multiplication leaves fractionMultiplication alone", () => {
    for (const value of ["12", "20", "100"] as const) {
      setState({ multiplication: "off", fractionMultiplication: false });
      setConfig("multiplication", value);
      expect(Config.fractionMultiplication).toBe(false);
      expect(Config.multiplication).toBe(value);
    }
  });

  it("SB-093 - fractionMultiplication=false leaves multiplication alone", () => {
    for (const value of ["12", "20", "100"] as const) {
      setState({ multiplication: value, fractionMultiplication: true });
      setConfig("fractionMultiplication", false);
      expect(Config.multiplication).toBe(value);
    }
  });

  it("SB-098 - decimals and negatives never move another control", () => {
    const before = { ...Config };
    setConfig("decimals", false);
    setConfig("negatives", false);
    for (const key of [
      "addition",
      "multiplication",
      "division",
      "fractionAddition",
      "fractionMultiplication",
      "time",
    ] as const) {
      expect(Config[key]).toEqual(before[key]);
    }
  });
});

describe("SB-101, SB-103, SB-215 - the guard rejects the all-off state from every entry point", () => {
  it("blocks the last enabled generator and shows the notice", () => {
    setState({ ...ALL_GENERATORS_OFF, addition: "1000" });
    expect(setConfig("addition", "off")).toBe(false);
    expect(Config.addition).toBe("1000");
    expect(noticeSpy).toHaveBeenCalledWith(
      "at least one task type must be enabled",
    );
  });

  it("SB-203(c) - blocks multiplication=off when the cascade would clear the only other generator", () => {
    setState({
      ...ALL_GENERATORS_OFF,
      multiplication: "100",
      fractionMultiplication: true,
    });
    expect(setConfig("multiplication", "off")).toBe(false);
    expect(Config.multiplication).toBe("100");
    expect(Config.fractionMultiplication).toBe(true);
    expect(noticeSpy).toHaveBeenCalledWith(
      "at least one task type must be enabled",
    );
  });

  it("SB-203(c) - but fractionMultiplication can still be switched off in that state", () => {
    setState({
      ...ALL_GENERATORS_OFF,
      multiplication: "100",
      fractionMultiplication: true,
    });
    expect(setConfig("fractionMultiplication", false)).toBe(true);
    expect(Config.fractionMultiplication).toBe(false);
    expect(Config.multiplication).toBe("100");
  });

  it("SB-203(b) - two independent generators, either can be switched off", () => {
    setState({ ...ALL_GENERATORS_OFF, addition: "1000", division: "tables" });
    expect(setConfig("addition", "off")).toBe(true);
    expect(Config.addition).toBe("off");

    setState({ ...ALL_GENERATORS_OFF, addition: "1000", division: "tables" });
    expect(setConfig("division", "off")).toBe(true);
    expect(Config.division).toBe("off");
  });

  it("SB-106 - time is never blocked, even with a single generator on", () => {
    setState({ ...ALL_GENERATORS_OFF, addition: "1000" });
    for (const value of getCycleValues("time")) {
      expect(setConfig("time", value)).toBe(true);
    }
  });

  it("the all-off state is unreachable through any sequence of single-key writes", () => {
    setState({});
    // Try to switch every generator off, one at a time, in every rotation.
    for (let offset = 0; offset < 5; offset++) {
      setState({});
      const keys = [
        "addition",
        "multiplication",
        "division",
        "fractionAddition",
        "fractionMultiplication",
      ] as const;
      const rotated = [...keys.slice(offset), ...keys.slice(0, offset)];
      for (const key of rotated) {
        setConfig(
          key,
          (key === "fractionMultiplication" ? false : "off") as never,
        );
      }
      const stillOn = keys.filter(
        (key) => Config[key] !== "off" && Config[key] !== false,
      );
      expect(stillOn.length, `offset ${offset}`).toBeGreaterThan(0);
    }
  });
});

describe("SB-114 - resetting restores exactly the SB-110 table", () => {
  it("replaceConfig with no overrides equals getDefaultConfig", () => {
    setState({ addition: "off", time: 1, decimals: false });
    __testing.replaceConfig({});
    const defaults = getDefaultConfig();
    for (const key of BAR_KEYS) {
      expect(Config[key], key).toEqual(defaults[key]);
    }
  });
});
