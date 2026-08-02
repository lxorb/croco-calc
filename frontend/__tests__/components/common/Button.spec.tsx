import { cleanup, render } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Button } from "../../../src/ts/components/common/Button";

describe("Button component", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders a button element when onClick is provided", () => {
    const onClick = vi.fn();

    const { container } = render(() => (
      <Button onClick={onClick} text="Click me" />
    ));

    const button = container.querySelector("button");
    expect(button).toBeTruthy();
    expect(button).toHaveTextContent("Click me");
    expect(button).not.toBeDisabled();
  });

  it("renders an anchor element when href is provided", () => {
    const { container } = render(() => (
      <Button href="https://example.com" text="Go" />
    ));

    const anchor = container.querySelector("a");
    expect(anchor).toBeTruthy();
    expect(anchor).toHaveAttribute("href", "https://example.com");
    expect(anchor).toHaveAttribute("target", "_blank");
    expect(anchor).toHaveAttribute("rel", "noreferrer noopener");
    expect(anchor).not.toHaveAttribute("router-link");
    expect(anchor).not.toHaveAttribute("aria-label");
    expect(anchor).not.toHaveAttribute("data-balloon-pos");
  });

  it("calls onClick when button is clicked", async () => {
    const onClick = vi.fn();

    const { container } = render(() => (
      <Button onClick={onClick} text="Click me" />
    ));

    const button = container.querySelector("button");
    button?.click();

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders icon when icon prop is provided", () => {
    const { container } = render(() => (
      <Button
        onClick={() => {
          //
        }}
        icon={{
          icon: "ph:calculator-bold",
        }}
      />
    ));

    const icon = container.querySelector("svg.icon");
    expect(icon).toBeTruthy();
    expect(icon).toHaveAttribute("data-icon", "ph:calculator-bold");
  });

  it("renders icon when icon prop has changed", () => {
    const [icon, setIcon] = createSignal("ph:calculator-bold");
    const { container } = render(() => (
      <Button
        onClick={() => {
          //
        }}
        icon={{
          icon: icon(),
          class: "test",
        }}
      />
    ));

    setIcon("ph:gear-bold");

    const svg = container.querySelector("svg.icon");
    expect(svg).toBeTruthy();
    expect(svg).toHaveAttribute("data-icon", "ph:gear-bold");
    expect(svg).toHaveClass("test");
  });

  it("applies icon-fw class when fixedWidth is true", () => {
    const { container } = render(() => (
      <Button
        onClick={() => {
          //
        }}
        icon={{
          fixedWidth: true,
          icon: "ph:calculator-bold",
        }}
        text="Hello"
      />
    ));

    const icon = container.querySelector("svg.icon");
    expect(icon).toHaveClass("icon-fw");
  });

  it("does not apply icon-fw when text is present and fixedWidth is false", () => {
    const { container } = render(() => (
      <Button
        onClick={() => {
          //
        }}
        icon={{
          icon: "ph:calculator-bold",
        }}
        text="Hello"
      />
    ));

    const icon = container.querySelector("svg.icon");
    expect(icon).not.toHaveClass("icon-fw");
  });

  it("applies default button class", () => {
    const { container } = render(() => (
      <Button
        onClick={() => {
          //
        }}
        text="Hello"
      />
    ));

    const button = container.querySelector("button");
    expect(button).not.toHaveClass("button");
  });

  it("applies custom class when class prop is provided", () => {
    const { container } = render(() => (
      <Button
        onClick={() => {
          //
        }}
        text="Hello"
        class="custom-class"
      />
    ));

    const button = container.querySelector("button");
    expect(button).toHaveClass("custom-class");
  });

  it("renders children content", () => {
    const { container } = render(() => (
      <Button
        onClick={() => {
          //
        }}
      >
        <span data-testid="child">Child</span>
      </Button>
    ));

    const child = container.querySelector('[data-testid="child"]');
    expect(child).toBeTruthy();
    expect(child).toHaveTextContent("Child");
  });

  it("applies balloon to button with default position", () => {
    const { container } = render(() => (
      <Button
        onClick={() => {
          //
        }}
        text="Hello"
        balloon={{ text: "test" }}
      />
    ));

    const button = container.querySelector("button");
    expect(button).toHaveAttribute("aria-label", "test");
    expect(button).toHaveAttribute("data-balloon-pos", "up");
  });

  it("applies balloon to button with custom position", () => {
    const { container } = render(() => (
      <Button
        onClick={() => {
          //
        }}
        text="Hello"
        balloon={{ text: "test", position: "down" }}
      />
    ));

    const button = container.querySelector("button");
    expect(button).toHaveAttribute("aria-label", "test");
    expect(button).toHaveAttribute("data-balloon-pos", "down");
  });

  it("applies router-link to button", () => {
    const { container } = render(() => (
      <Button
        onClick={() => {
          //
        }}
        text="Hello"
        router-link
      />
    ));

    const button = container.querySelector("button");
    expect(button).toHaveAttribute("router-link", "");
  });

  it("applies balloon to anchor with default position", () => {
    const { container } = render(() => (
      <Button
        href="http://example.com"
        text="Hello"
        balloon={{ text: "test" }}
      />
    ));

    const anchor = container.querySelector("a");
    expect(anchor).toHaveAttribute("aria-label", "test");
    expect(anchor).toHaveAttribute("data-balloon-pos", "up");
  });

  it("applies balloon to anchor with custom position", () => {
    const { container } = render(() => (
      <Button
        href="http://example.com"
        text="Hello"
        balloon={{ text: "test", position: "down" }}
      />
    ));

    const anchor = container.querySelector("a");
    expect(anchor).toHaveAttribute("aria-label", "test");
    expect(anchor).toHaveAttribute("data-balloon-pos", "down");
  });

  it("applies router-link to anchor", () => {
    const { container } = render(() => (
      <Button href="http://example.com" text="Hello" router-link />
    ));

    const anchor = container.querySelector("a");
    expect(anchor).toHaveAttribute("router-link", "");
  });

  it("applies disabled to button", () => {
    const { container } = render(() => (
      <Button
        onClick={() => {
          /** */
        }}
        text="Hello"
        disabled={true}
      />
    ));

    const button = container.querySelector("button");
    expect(button).toBeDisabled();
  });
});
