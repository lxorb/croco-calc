import { cleanup, render } from "@solidjs/testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `states/test.ts` is WP-06's and is mid-migration (it still imports the
// deleted `utils/key-converter` and `utils/json-data`). The bar reads exactly
// two signals out of it, both reproduced here.
//
// The factory is async so `createSignal` comes from the very same solid-js
// instance the component under test uses - two instances would mean two
// reactive graphs and the bar would never see the update.
vi.mock("../../../../src/ts/states/test", async () => {
  const { createSignal } = await import("solid-js");
  const [getFocus, setFocus] = createSignal(false);
  const [getResultVisible, setResultVisible] = createSignal(false);
  return { getFocus, setFocus, getResultVisible, setResultVisible };
});

const restartDispatch = vi.hoisted(() => vi.fn());
vi.mock("../../../../src/ts/events/test", () => ({
  restartTestEvent: { dispatch: (): void => void restartDispatch() },
}));

import * as TestState from "../../../../src/ts/states/test";

const { setFocus, setResultVisible } = TestState as unknown as {
  setFocus: (value: boolean) => void;
  setResultVisible: (value: boolean) => void;
};

import { TestConfig } from "../../../../src/ts/components/pages/test/TestConfig";
import { BAR_KEYS } from "../../../../src/ts/config/coupling";
import { configMetadata } from "../../../../src/ts/config/metadata";
import { setConfig } from "../../../../src/ts/config/setters";
import { __testing } from "../../../../src/ts/config/testing";
import { getDefaultConfig } from "../../../../src/ts/constants/default-config";

/** The eight cycling controls, in DOM order. */
function controls(container: HTMLElement): HTMLButtonElement[] {
  return [...container.querySelectorAll<HTMLButtonElement>("[data-setting]")];
}

function control(container: HTMLElement, key: string): HTMLButtonElement {
  const found = container.querySelector<HTMLButtonElement>(
    `[data-setting="${key}"]`,
  );
  expect(found, key).not.toBeNull();
  return found as HTMLButtonElement;
}

beforeEach(() => {
  __testing.replaceConfig({});
  // The store is what the component reads; keep it in step with `Config`.
  for (const key of BAR_KEYS) {
    setConfig(key, getDefaultConfig()[key] as never, { nosave: true });
  }
  setFocus(false);
  setResultVisible(false);
  restartDispatch.mockClear();
});

afterEach(() => {
  cleanup();
});

describe("SB-001, SB-020, SB-084 - the bar structure", () => {
  it("keeps the data-ui-element hook and renders exactly eight controls", () => {
    const { container } = render(() => <TestConfig />);

    expect(
      container.querySelector('[data-ui-element="testConfig"]'),
    ).not.toBeNull();
    expect(controls(container)).toHaveLength(8);
  });

  it("SB-141 - DOM order is decimals, negatives, the five generators, then time", () => {
    const { container } = render(() => <TestConfig />);
    expect(controls(container).map((el) => el.dataset["setting"])).toEqual([
      ...BAR_KEYS,
    ]);
  });

  it("SB-084 - the eight controls sit in exactly three pill cards", () => {
    const { container } = render(() => <TestConfig />);
    const cards = [...container.querySelectorAll(".card")];
    expect(cards).toHaveLength(3);
    expect(
      cards.map((card) => card.querySelectorAll("[data-setting]").length),
    ).toEqual([2, 5, 1]);
  });

  it("SB-140 - every control is a native button, never a div with a handler", () => {
    const { container } = render(() => <TestConfig />);
    for (const el of controls(container)) {
      expect(el.tagName).toBe("BUTTON");
      expect(el.getAttribute("type")).toBe("button");
      expect(el.tabIndex).toBe(0);
    }
  });

  it("SB-165 - a mobile fallback button is rendered alongside the bar", () => {
    const { container } = render(() => <TestConfig />);
    const mobile = [...container.querySelectorAll("button")].find((el) =>
      el.textContent?.includes("test settings"),
    );
    expect(mobile).toBeDefined();
    expect(
      mobile?.querySelector('[data-icon="tabler:settings"]'),
    ).not.toBeNull();
  });
});

describe("SB-209 - with the defaults, every control shows its SB-110 value and none is struck through", () => {
  it("data-value matches the SB-110 table", () => {
    const { container } = render(() => <TestConfig />);
    const defaults = getDefaultConfig();
    for (const key of BAR_KEYS) {
      expect(control(container, key).dataset["value"], key).toBe(
        String(defaults[key]),
      );
    }
  });

  it("SB-111 - no label carries the strikethrough class", () => {
    const { container } = render(() => <TestConfig />);
    expect(container.querySelectorAll(".line-through")).toHaveLength(0);
  });

  it("SB-021 - every control renders its icon and then its label", () => {
    const { container } = render(() => <TestConfig />);
    for (const key of BAR_KEYS) {
      const button = control(container, key);
      const icon = button.querySelector("svg");
      expect(icon, key).not.toBeNull();
      expect(icon?.getAttribute("data-icon"), key).toBe(
        configMetadata[key].icon,
      );
      // icon first, label second
      expect(button.firstElementChild?.tagName, key).toBe("svg");
      expect(button.lastElementChild?.tagName, key).toBe("SPAN");
    }
  });
});

describe("SB-210 - the OFF style", () => {
  it("puts line-through on the label span only, never on the svg", () => {
    const { container } = render(() => <TestConfig />);

    setConfig("negatives", false);

    const button = control(container, "negatives");
    expect(button.dataset["value"]).toBe("false");

    const label = button.querySelector("span");
    expect(label?.className).toContain("line-through");
    expect(
      button.querySelector("svg")?.getAttribute("class") ?? "",
    ).not.toContain("line-through");
  });

  it("SB-048 - the time control never renders struck through, in any state", () => {
    const { container } = render(() => <TestConfig />);
    for (const value of [1, 2, 4, 8] as const) {
      setConfig("time", value);
      const label = control(container, "time").querySelector("span");
      expect(label?.className, String(value)).not.toContain("line-through");
    }
  });
});

describe("SB-211 - the bar during a focused test", () => {
  it("SB-078 - the container fades out and stops taking pointer events", () => {
    const { container } = render(() => <TestConfig />);
    const bar = container.querySelector(
      '[data-ui-element="testConfig"]',
    ) as HTMLElement;

    expect(bar.className).not.toContain("opacity-0");

    setFocus(true);
    expect(bar.className).toContain("opacity-0");
    expect(bar.className).toContain("pointer-events-none");

    setFocus(false);
    setResultVisible(true);
    expect(bar.className).toContain("opacity-0");
  });

  it("SB-077, SB-146 - every control gets the real disabled attribute", () => {
    const { container } = render(() => <TestConfig />);

    for (const el of controls(container)) expect(el.disabled).toBe(false);

    setFocus(true);
    for (const el of controls(container)) {
      expect(el.disabled, el.dataset["setting"]).toBe(true);
    }
  });
});

describe("SB-105 - decimals is disabled while addition, multiplication and division are all off", () => {
  it("disables the control but keeps its stored value", () => {
    const { container } = render(() => <TestConfig />);

    setConfig("addition", "off");
    setConfig("multiplication", "off");
    setConfig("division", "off");

    const decimals = control(container, "decimals");
    expect(decimals.disabled).toBe(true);
    expect(decimals.dataset["value"]).toBe("true");

    setConfig("addition", "1000");
    expect(control(container, "decimals").disabled).toBe(false);
  });
});

describe("SB-050, SB-051, SB-054 - clicking a control", () => {
  it("advances one step and dispatches a restart", () => {
    const { container } = render(() => <TestConfig />);
    const time = control(container, "time");

    expect(time.dataset["value"]).toBe("8");
    time.click();
    expect(control(container, "time").dataset["value"]).toBe("1");
    expect(restartDispatch).toHaveBeenCalledTimes(1);
  });

  it("SB-051 - shift+click steps backwards", () => {
    const { container } = render(() => <TestConfig />);

    control(container, "time").dispatchEvent(
      new MouseEvent("click", { bubbles: true, shiftKey: true }),
    );
    expect(control(container, "time").dataset["value"]).toBe("4");
  });

  it("SB-051 - the context menu event steps backwards and is swallowed", () => {
    const { container } = render(() => <TestConfig />);

    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
    });
    control(container, "time").dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(control(container, "time").dataset["value"]).toBe("4");
  });

  it("SB-056 - three clicks advance exactly three steps", () => {
    const { container } = render(() => <TestConfig />);
    control(container, "time").click();
    control(container, "time").click();
    control(container, "time").click();
    expect(control(container, "time").dataset["value"]).toBe("4");
    expect(restartDispatch).toHaveBeenCalledTimes(3);
  });

  it("SB-052, SB-102 - cycling the last enabled generator never shows OFF and never restarts on a no-op", () => {
    const { container } = render(() => <TestConfig />);

    setConfig("multiplication", "off");
    setConfig("division", "off");
    setConfig("fractionAddition", "off");
    restartDispatch.mockClear();

    const seen: (string | undefined)[] = [];
    for (let i = 0; i < 4; i++) {
      control(container, "addition").click();
      seen.push(control(container, "addition").dataset["value"]);
    }
    expect(seen).not.toContain("off");
  });
});

describe("SB-144, SB-145, SB-148 - accessibility hooks", () => {
  it("every control exposes an aria-label naming the control", () => {
    const { container } = render(() => <TestConfig />);
    for (const key of BAR_KEYS) {
      const label = control(container, key).getAttribute("aria-label") ?? "";
      expect(label, key).not.toBe("");
      expect(label, key).toContain(configMetadata[key].displayString as string);
    }
  });

  it("the aria-label updates when the value changes", () => {
    const { container } = render(() => <TestConfig />);
    expect(control(container, "addition").getAttribute("aria-label")).toBe(
      "addition: +1000",
    );
    setConfig("addition", "100");
    expect(control(container, "addition").getAttribute("aria-label")).toBe(
      "addition: +100",
    );
  });

  it("SB-148 - data-setting and data-value are present on every control", () => {
    const { container } = render(() => <TestConfig />);
    for (const el of controls(container)) {
      expect(el.dataset["setting"]).toBeTruthy();
      expect(el.dataset["value"]).toBeTruthy();
    }
  });
});
