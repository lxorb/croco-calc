import { cleanup, render } from "@solidjs/testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import baseline from "../../../../__screenshots__/baseline/settings-bar-geometry.json";

vi.mock("../../../../src/ts/states/test", async () => {
  const { createSignal } = await import("solid-js");
  const [getFocus] = createSignal(false);
  const [getResultVisible] = createSignal(false);
  return { getFocus, getResultVisible };
});

vi.mock("../../../../src/ts/events/test", () => ({
  restartTestEvent: { dispatch: (): void => undefined },
}));

import { TestConfig } from "../../../../src/ts/components/pages/test/TestConfig";
import { __testing } from "../../../../src/ts/config/testing";

/**
 * SB-214 / DoD-19 — the settings bar's geometry at 849 / 1105 / 1361 / 1617 px,
 * diffed against the baseline captured from monkeytype's own bar.
 *
 * DoD-19 requires the comparison to measure **geometry, not content**: card
 * radii, gaps, paddings and font sizes (SB-081-083), with label text and icons
 * masked out. Nothing below reads a label, an icon id or any text node — the
 * masking is structural. See `frontend/__screenshots__/README.md` for why the
 * comparison is made against the declarations rather than against a PNG, and
 * for the part of SB-214 that remains open.
 */

const BREAKPOINTS = baseline.breakpoints as Record<string, number>;
const VARIABLE_NAMES = [
  "--card-gap",
  "--font-size",
  "--horizontal-padding",
  "--vertical-padding",
] as const;

/**
 * Resolve the four responsive custom properties from an element's class list at
 * a given viewport width.
 *
 * A Tailwind arbitrary-property class is either `[--x:v]` (always on) or
 * `<variant>:[--x:v]` (on at and above `--breakpoint-<variant>`). Later, wider
 * variants win, which is the cascade order Tailwind emits them in. jsdom
 * compiles no CSS, so the resolution is done here rather than read back off
 * `getComputedStyle` — the input is the very class list the browser would be
 * handed, so the two agree by construction.
 */
function resolveVariables(
  classList: string,
  width: number,
): Record<string, string> {
  const declarations: { minWidth: number; name: string; value: string }[] = [];

  for (const token of classList.split(/\s+/).filter(Boolean)) {
    const match = /^(?:([a-z0-9]+):)?\[(--[a-z-]+):([^\]]+)\]$/.exec(token);
    if (match === null) continue;
    const [, variant, name, value] = match;
    if (name === undefined || value === undefined) continue;

    const minWidth = variant === undefined ? 0 : BREAKPOINTS[variant];
    // A variant this file does not know about is a real failure, not a skip:
    // it would silently drop a declaration out of the comparison.
    expect(
      minWidth,
      `unknown responsive variant "${variant ?? ""}"`,
    ).toBeTypeOf("number");
    declarations.push({ minWidth: minWidth as number, name, value });
  }

  const resolved: Record<string, string> = {};
  for (const { minWidth, name, value } of declarations.sort(
    (a, b) => a.minWidth - b.minWidth,
  )) {
    if (width >= minWidth) resolved[name] = value;
  }
  return resolved;
}

function bar(container: HTMLElement): HTMLElement {
  const element = container.querySelector<HTMLElement>(
    '[data-ui-element="testConfig"]',
  );
  expect(element).not.toBeNull();
  return element as HTMLElement;
}

function cards(container: HTMLElement): HTMLElement[] {
  return [...bar(container).querySelectorAll<HTMLElement>(".card")];
}

function controls(container: HTMLElement): HTMLElement[] {
  return [...bar(container).querySelectorAll<HTMLElement>("[data-setting]")];
}

beforeEach(() => {
  __testing.replaceConfig({});
});

afterEach(() => {
  cleanup();
});

describe("SB-214 - the bar's geometry matches the monkeytype baseline", () => {
  it("declares the same responsive variables the baseline records", () => {
    const { container } = render(() => <TestConfig />);
    const classList = bar(container).className;

    for (const [variant, declared] of Object.entries(
      baseline.declaredVariables as Record<string, Record<string, string>>,
    )) {
      const prefix = variant === "base" ? "" : `${variant}:`;
      for (const [name, value] of Object.entries(declared)) {
        expect(classList, `${prefix}[${name}:${value}]`).toContain(
          `${prefix}[${name}:${value}]`,
        );
      }
    }
  });

  it.each(baseline.sampleWidths)(
    "resolves card gap, font size and paddings identically at %ipx",
    (width: number) => {
      const { container } = render(() => <TestConfig />);
      const resolved = resolveVariables(bar(container).className, width);
      const expected = (baseline.resolved as Record<string, unknown>)[
        String(width)
      ];

      expect(expected, `no baseline for ${width}px`).toBeDefined();
      for (const name of VARIABLE_NAMES) {
        expect(resolved[name], `${name} @ ${width}px`).toBe(
          (expected as Record<string, string>)[name],
        );
      }
    },
  );

  it("SB-082 - every pill card carries the baseline's radius and padding classes", () => {
    const { container } = render(() => <TestConfig />);
    const pills = cards(container);
    expect(pills).toHaveLength(3);

    for (const card of pills) {
      for (const cls of baseline.cardClasses) {
        expect(card.className, cls).toContain(cls);
      }
    }
  });

  it("SB-083 - every control carries the baseline's padding classes", () => {
    const { container } = render(() => <TestConfig />);
    const buttons = controls(container);
    expect(buttons).toHaveLength(8);

    for (const button of buttons) {
      for (const cls of baseline.controlPaddingClasses) {
        expect(button.className, cls).toContain(cls);
      }
    }
  });

  it("SB-081 - the container keeps the baseline's grid and font-size hooks", () => {
    const { container } = render(() => <TestConfig />);
    const classList = bar(container).className;
    for (const cls of baseline.containerClasses) {
      expect(classList, cls).toContain(cls);
    }
  });

  it("SB-084 - the outer pills keep the baseline's card gap", () => {
    const { container } = render(() => <TestConfig />);
    const [left, , right] = cards(container);

    expect(left?.className).toContain(baseline.cardGapClasses.left);
    expect(right?.className).toContain(baseline.cardGapClasses.right);
  });

  it("the four sample widths are monkeytype's md/lg/xl/2xl breakpoints", () => {
    // If this ever drifts, the four samples stop covering every responsive
    // branch and the diff above silently loses coverage.
    expect(baseline.sampleWidths).toEqual([
      BREAKPOINTS["md"],
      BREAKPOINTS["lg"],
      BREAKPOINTS["xl"],
      BREAKPOINTS["2xl"],
    ]);
  });
});
