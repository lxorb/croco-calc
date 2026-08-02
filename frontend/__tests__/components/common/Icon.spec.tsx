import { cleanup, render } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  bundledIcons,
  hasIcon,
  Icon,
  SPEC_ICONS,
} from "../../../src/ts/components/common/Icon";

describe("Icon component", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders an inline svg carrying the icon id", () => {
    const { container } = render(() => <Icon icon="ph:gear-bold" />);

    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
    expect(svg).toHaveAttribute("data-icon", "ph:gear-bold");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveClass("icon");
    expect(svg?.innerHTML.length).toBeGreaterThan(0);
  });

  it("uses the phosphor 256 viewBox and the tabler 24 viewBox (C10)", () => {
    const { container: phosphor } = render(() => <Icon icon="ph:x-bold" />);
    expect(phosphor.querySelector("svg")).toHaveAttribute(
      "viewBox",
      "0 0 256 256",
    );

    const { container: tabler } = render(() => <Icon icon="tabler:clock" />);
    expect(tabler.querySelector("svg")).toHaveAttribute("viewBox", "0 0 24 24");
  });

  it("applies fixedWidth, spin, size and class (SB-062)", () => {
    const { container } = render(() => (
      <Icon icon="ph:crown-bold" fixedWidth spin size={2} class="text-main" />
    ));

    const svg = container.querySelector("svg");
    expect(svg).toHaveClass("icon-fw");
    expect(svg).toHaveClass("icon-spin");
    expect(svg).toHaveClass("text-main");
    expect(svg?.getAttribute("style")).toContain("font-size: 2em");
  });

  it("omits the sizing style when no size is given", () => {
    const { container } = render(() => <Icon icon="ph:crown-bold" />);
    const svg = container.querySelector("svg");
    expect(svg).not.toHaveClass("icon-fw");
    expect(svg).not.toHaveClass("icon-spin");
    expect(svg?.getAttribute("style") ?? "").not.toContain("font-size");
  });

  it("bundles every icon id the requirements name (CP-002)", () => {
    const missing = SPEC_ICONS.filter((id) => !hasIcon(id));
    expect(missing).toEqual([]);
  });

  it("bundles both collections and nothing else (C10)", () => {
    const ids = bundledIcons();
    expect(ids.length).toBeGreaterThan(100);
    expect(
      ids.filter((id) => !id.startsWith("ph:") && !id.startsWith("tabler:")),
    ).toEqual([]);
    expect(ids.some((id) => id.startsWith("tabler:"))).toBe(true);
    expect(ids.some((id) => id.startsWith("ph:"))).toBe(true);
  });

  it("renders every bundled icon from inline geometry only (SB-063, AC-021)", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      throw new Error("no network");
    });

    for (const id of bundledIcons()) {
      const { container } = render(() => <Icon icon={id} />);
      // The body — everything except the <svg> element's own attributes, which
      // legitimately carry the SVG xml namespace.
      const body = container.querySelector("svg")?.innerHTML ?? "";
      expect(body.length).toBeGreaterThan(0);
      expect(body).not.toContain("iconify");
      expect(body).not.toMatch(/https?:\/\//);
      expect(body).not.toContain("<image");
      expect(body).not.toContain("url(");
      cleanup();
    }

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("renders an empty svg and warns for an unknown id", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const { container } = render(() => <Icon icon="ph:not-a-real-icon" />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
    expect(svg?.innerHTML).toBe("");
    expect(warn).toHaveBeenCalled();

    warn.mockRestore();
  });
});
