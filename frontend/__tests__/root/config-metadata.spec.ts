import { ConfigKey, Config as ConfigType } from "@croco-calc/schemas/configs";
import { afterAll, describe, expect, it, vi } from "vitest";

import { configMetadata } from "../../src/ts/config/metadata";
import { setConfig } from "../../src/ts/config/setters";
import { __testing } from "../../src/ts/config/testing";

const { replaceConfig, getConfig } = __testing;

type TestsByConfig<T> = Partial<{
  [K in keyof ConfigType]: (T & { value: ConfigType[K] })[];
}>;

describe("ConfigMeta", () => {
  afterAll(() => {
    replaceConfig({});
    vi.resetModules();
  });

  it("SB-055 - exactly the eight settings-bar keys require a restart", () => {
    const configsRequiringRestarts = Object.entries(configMetadata)
      .filter(([_key, value]) => value.changeRequiresRestart)
      .map(([key]) => key)
      .sort();

    expect(configsRequiringRestarts).toEqual(
      [
        "addition",
        "multiplication",
        "division",
        "fractionAddition",
        "fractionMultiplication",
        "decimals",
        "negatives",
        "time",
      ].sort(),
    );
  });

  it("should have triggerResize defined", () => {
    const configsWithTriggerResize = Object.entries(configMetadata)
      .filter(([_key, value]) => value.triggerResize === true)
      .map(([key]) => key)
      .sort();

    // monkeytype's `keymapSize`, `tapeMode` and `tapeMargin` are gone with the
    // keymap and the tape (SB-159, section 6.1).
    expect(configsWithTriggerResize).toEqual(
      ["fontFamily", "fontSize", "maxLineWidth"].sort(),
    );
  });

  it("SB-130 - the eight settings-bar keys are all in the test group", () => {
    const testGroup = Object.entries(configMetadata)
      .filter(([_key, value]) => value.group === "test")
      .map(([key]) => key)
      .sort();

    expect(testGroup).toEqual(
      [
        "addition",
        "multiplication",
        "division",
        "fractionAddition",
        "fractionMultiplication",
        "decimals",
        "negatives",
        "time",
      ].sort(),
    );
  });

  describe("overrideValue", () => {
    const testCases: TestsByConfig<{
      given?: Partial<ConfigType>;
      expected: Partial<ConfigType>;
    }> = {
      customBackground: [
        {
          value: " https://example.com/test.jpg ",
          expected: { customBackground: "https://example.com/test.jpg" },
        },
      ],
      fontSize: [
        { value: 1.5, expected: { fontSize: 1.5 } },
        { value: 1.234, expected: { fontSize: 1.2 } },
        { value: -3, expected: { fontSize: 1 } },
      ],
      maxLineWidth: [
        { value: 0, expected: { maxLineWidth: 0 } },
        { value: 5, expected: { maxLineWidth: 20 } },
        { value: 5000, expected: { maxLineWidth: 1000 } },
        { value: 100, expected: { maxLineWidth: 100 } },
      ],
      // AC-085 (master section 6.1 arity note): five toggles, not monkeytype's
      // four - the fifth is `Per minute`. The guard on the first two (Score,
      // Accuracy) is unchanged: they may not both be off, or the history chart
      // has nothing left to draw.
      accountChart: [
        {
          value: ["on", "off", "off", "off", "on"],
          expected: { accountChart: ["on", "off", "off", "off", "on"] },
        },
        {
          value: ["off", "off", "off", "off", "on"],
          given: { accountChart: ["on", "off", "off", "off", "on"] },
          expected: { accountChart: ["off", "on", "off", "off", "on"] },
        },
        {
          value: ["off", "off", "on", "on", "off"],
          given: { accountChart: ["off", "on", "off", "off", "on"] },
          expected: { accountChart: ["on", "off", "on", "on", "off"] },
        },
      ],
    };

    it.for(
      Object.entries(testCases).flatMap(([key, value]) =>
        value.flatMap((it) => ({ key: key as ConfigKey, ...it })),
      ),
    )(
      `$key value=$value given=$given expect=$expected`,
      ({ key, value, given, expected }) => {
        //GIVEN
        replaceConfig(given ?? {});

        //WHEN
        setConfig(key, value as never);

        //THEN
        expect(getConfig()).toMatchObject(expected);
      },
    );
  });

  describe("isBlocked", () => {
    const allGeneratorsOff = {
      addition: "off",
      multiplication: "off",
      division: "off",
      fractionAddition: "off",
      fractionMultiplication: false,
    } as const satisfies Partial<ConfigType>;

    const testCases: TestsByConfig<{
      given?: Partial<ConfigType>;
      fail?: true;
    }> = {
      // SB-101 / SB-215 (master C36): the guard is evaluated post-cascade.
      addition: [
        { value: "off", given: { ...allGeneratorsOff, division: "tables" } },
        {
          value: "off",
          given: { ...allGeneratorsOff, addition: "1000" },
          fail: true,
        },
      ],
      multiplication: [
        {
          value: "off",
          given: {
            ...allGeneratorsOff,
            multiplication: "100",
            addition: "100",
          },
        },
        {
          value: "off",
          given: {
            ...allGeneratorsOff,
            multiplication: "100",
            fractionMultiplication: true,
          },
          fail: true,
        },
      ],
      fractionMultiplication: [
        {
          value: false,
          given: {
            ...allGeneratorsOff,
            multiplication: "100",
            fractionMultiplication: true,
          },
        },
      ],
      division: [
        {
          value: "off",
          given: { ...allGeneratorsOff, division: "tables" },
          fail: true,
        },
      ],
      fractionAddition: [
        {
          value: "off",
          given: { ...allGeneratorsOff, fractionAddition: "99" },
          fail: true,
        },
      ],
      // SB-106: time is never blocked, not even with a single generator on.
      time: [{ value: 1, given: { ...allGeneratorsOff, addition: "1000" } }],
      // SB-098: the two modifiers are never blocked either.
      decimals: [
        { value: false, given: { ...allGeneratorsOff, addition: "1000" } },
      ],
      negatives: [
        { value: false, given: { ...allGeneratorsOff, addition: "1000" } },
      ],
    };

    it.for(
      Object.entries(testCases).flatMap(([key, value]) =>
        value.flatMap((it) => ({ key: key as ConfigKey, ...it })),
      ),
    )(
      `$key value=$value given=$given fail=$fail`,
      ({ key, value, given, fail }) => {
        //GIVEN
        replaceConfig(given ?? {});

        //WHEN
        const applied = setConfig(key, value as never);

        //THEN
        expect(applied).toEqual(!fail);
      },
    );
  });

  describe("overrideConfig", () => {
    const testCases: TestsByConfig<{
      given: Partial<ConfigType>;
      expected?: Partial<ConfigType>;
    }> = {
      // SB-090 / SB-091 - the only coupling in croco calc (master C21).
      fractionMultiplication: [
        {
          value: true,
          given: { multiplication: "off", fractionMultiplication: false },
          expected: { multiplication: "100", fractionMultiplication: true },
        },
        {
          value: true,
          given: { multiplication: "20", fractionMultiplication: false },
          expected: { multiplication: "20", fractionMultiplication: true },
        },
        {
          value: false,
          given: { multiplication: "20", fractionMultiplication: true },
          expected: { multiplication: "20", fractionMultiplication: false },
        },
      ],
      multiplication: [
        {
          value: "off",
          given: {
            addition: "1000",
            multiplication: "100",
            fractionMultiplication: true,
          },
          expected: { multiplication: "off", fractionMultiplication: false },
        },
        {
          value: "12",
          given: { multiplication: "100", fractionMultiplication: true },
          expected: { multiplication: "12", fractionMultiplication: true },
        },
      ],
      theme: [
        {
          value: "8008",
          given: { customTheme: true },
          expected: { customTheme: false },
        },
      ],
    };

    it.for(
      Object.entries(testCases).flatMap(([key, value]) =>
        value.flatMap((it) => ({ key: key as ConfigKey, ...it })),
      ),
    )(
      `$key value=$value given=$given expected=$expected`,
      ({ key, value, given, expected }) => {
        //GIVEN
        replaceConfig(given);

        //WHEN
        setConfig(key, value as never);

        //THEN
        expect(getConfig()).toMatchObject(expected ?? {});
      },
    );
  });
});
