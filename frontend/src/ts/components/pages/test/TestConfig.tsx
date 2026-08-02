import { For, JSXElement, createMemo, createSignal } from "solid-js";

import {
  getBarLabel,
  getBarTooltip,
  isBarValueOff,
  BAR_PILLS,
} from "../../../config/bar-controls";
import { BarKey, isDecimalsDisabled } from "../../../config/coupling";
import { configMetadata } from "../../../config/metadata";
import { cycleSetting } from "../../../config/setters";
import { getConfig } from "../../../config/store";
import { configEvent } from "../../../events/config";
import { restartTestEvent } from "../../../events/test";
import { createEffectOn } from "../../../hooks/effects";
import { useRefWithUtils } from "../../../hooks/useRefWithUtils";
import { showModal } from "../../../states/modals";
import { getResultVisible, getFocus } from "../../../states/test";
import { cn } from "../../../utils/cn";
import { applyReducedMotion } from "../../../utils/misc";
import { buildBalloonHtmlProperties } from "../../common/Balloon";
import { Button } from "../../common/Button";
import { Icon } from "../../common/Icon";

/**
 * The croco calc settings bar (SB-001 … SB-089).
 *
 * Structurally identical to monkeytype's `TestConfig`: a
 * `grid-cols-[1fr_auto_1fr]` of three pill cards, with the same responsive
 * custom properties, the same card class, the same 250 ms width animation and
 * the same mobile fallback button. Only the contents change — eight controls,
 * each a **single** button that cycles through its own states (SB-020).
 */

// SB-081 — copied verbatim from monkeytype's TestConfig.tsx:18–23.
const variables = cn(
  "[--card-gap:0.25em] [--font-size:0.5em] [--horizontal-padding:0.4em] [--vertical-padding:0.5rem]",
  "md:[--card-gap:1em] md:[--font-size:0.6em] md:[--horizontal-padding:0.45em] md:[--vertical-padding:0.75rem]",
  "lg:[--card-gap:1em] lg:[--font-size:0.75em] lg:[--horizontal-padding:0.5em] lg:[--vertical-padding:0.75rem]",
  "xl:[--card-gap:2em] xl:[--font-size:0.75em] xl:[--horizontal-padding:1em] xl:[--vertical-padding:0.75rem]",
);
// SB-083
const buttonClass = "px-(--horizontal-padding) py-(--vertical-padding)";
// SB-082
const cardClass =
  "card rounded-(--roundness) bg-sub-alt px-(--horizontal-padding)";
const durationMs = 250;

/**
 * SB-070 … SB-076 — monkeytype's `Button` `getClasses()` for `variant="text"`,
 * reproduced verbatim (Button.tsx:57–89).
 *
 * The bar cannot use `components/common/Button` itself because SB-051 needs a
 * `contextmenu` handler and SB-096 needs an element ref, neither of which that
 * component exposes; everything else — base classes, focus ring, active/hover
 * custom properties, the 0.33 disabled opacity — is byte-identical.
 */
const textButtonClass = cn(
  "inline-flex h-min cursor-pointer appearance-none items-center justify-center gap-[0.5em] rounded border-0 p-[0.5em] text-center leading-[1.25] text-text transition-[color,background,opacity] duration-125 ease-in-out select-none",
  "focus-visible:shadow-[0_0_0_0.1rem_var(--bg-color),_0_0_0_0.2rem_var(--text-color)] focus-visible:outline-none",
  "bg-(--themable-button-bg) text-(--themable-button-text) hover:bg-(--themable-button-hover-bg) hover:text-(--themable-button-hover-text)",
  "[--themable-button-active:var(--main-color)]",
  "[--themable-button-bg:transparent] [--themable-button-hover-bg:transparent] [--themable-button-hover-text:var(--text-color)] [--themable-button-text:var(--sub-color)] active:text-sub",
);
// SB-073/SB-074 — the active declaration re-declares `--themable-button-hover-text`
// as itself, producing a cyclic custom property and therefore no hover change.
const textButtonActiveClass =
  "[--themable-button-hover-text:var(--themable-button-hover-text)] [--themable-button-text:var(--themable-button-active)]";
// SB-077
const disabledClass = "pointer-events-none opacity-[0.33]";

/**
 * The control the user last activated. SB-096: when a coupling rule changes a
 * control the user did *not* click, that control pulses for 250 ms so the
 * change is visible — and never raises a notification, which would be far too
 * noisy for a two-click interaction.
 */
const [getLastInteracted, setLastInteracted] = createSignal<
  BarKey | undefined
>();

/**
 * SB-192 — a whole-config apply (the server config at login, an imported JSON,
 * a shared-settings URL) repaints the bar reactively but MUST NOT animate.
 * Only a user interaction animates.
 */
const [getProgrammaticChange, setProgrammaticChange] = createSignal(false);

configEvent.subscribe((data) => {
  if (data.key === "fullConfigChange") setProgrammaticChange(true);
  if (data.key === "fullConfigChangeFinished") {
    queueMicrotask(() => setProgrammaticChange(false));
  }
});

export function TestConfig(): JSXElement {
  return (
    <>
      <div
        class={cn(
          variables,
          "group relative mb-8 hidden w-max grid-cols-[1fr_auto_1fr] justify-center place-self-center [font-size:var(--font-size)] md:grid",
          "mx-auto transition-opacity duration-125",
          // SB-078
          getFocus() || getResultVisible()
            ? "pointer-events-none opacity-0"
            : "",
        )}
        data-ui-element="testConfig"
      >
        <Modifiers />
        <Generators />
        <TestLength />
      </div>
      {/* SB-165 — below `md` the bar is replaced by one button (C20: tabler). */}
      <Button
        class={cn(
          "mx-auto flex place-self-center px-4 py-2 text-sub md:hidden",
        )}
        variant="button"
        onClick={() => {
          showModal("MobileTestConfig");
        }}
      >
        <Icon icon="tabler:settings" fixedWidth />
        test settings
      </Button>
    </>
  );
}

/**
 * One control = one `<button>` that cycles (SB-020, SB-050 … SB-052).
 *
 * SB-140: a native `<button type="button">` with `tabIndex={0}`, never a `div`
 * with a click handler. `Enter` and `Space` therefore cycle forward for free,
 * and the synthesized click carries `shiftKey`, which is what makes
 * `Shift`+`Enter` / `Shift`+`Space` cycle backward (SB-142).
 */
function BarControl(props: { configKey: BarKey }): JSXElement {
  const [ref, element] = useRefWithUtils<HTMLButtonElement>();

  const value = () => getConfig[props.configKey];
  const isOff = () => isBarValueOff(props.configKey, value());
  const label = () => getBarLabel(props.configKey, value());
  const tooltip = () => getBarTooltip(props.configKey, value(), getConfig);

  // SB-105 — decimals is disabled (but keeps its stored value) while addition,
  // multiplication and division are all off, and becomes interactive again as
  // soon as one of the three comes back on.
  const isSettingDisabled = () =>
    props.configKey === "decimals" && isDecimalsDisabled(getConfig);
  const isDisabled = () =>
    getFocus() || getResultVisible() || isSettingDisabled();

  // SB-096 — pulse when the coupling moved this control instead of the user.
  createEffectOn(value, (next, previous) => {
    if (previous === undefined || next === previous) return;
    if (getLastInteracted() === props.configKey) return;
    if (getProgrammaticChange()) return;
    void element()?.promiseAnimate({
      opacity: [1, 0.25, 1],
      duration: applyReducedMotion(durationMs),
    });
  });

  const cycle = (direction: 1 | -1): void => {
    setLastInteracted(props.configKey);
    const changed = cycleSetting(props.configKey, direction);
    // SB-054 — every state change restarts the test, so a fresh first task is
    // generated and re-blurred. SB-056: each click advances exactly one step
    // and each restart supersedes the previous one, so nothing queues.
    if (changed) restartTestEvent.dispatch();
    queueMicrotask(() => setLastInteracted(undefined));
  };

  return (
    <button
      ref={ref}
      type="button"
      tabIndex={0}
      class={cn(textButtonClass, buttonClass, {
        // SB-073 — an ON control uses the active text-button colour.
        [textButtonActiveClass]: !isOff(),
        [disabledClass]: isDisabled(),
      })}
      // SB-077/SB-146 — the real `disabled` attribute, so the control also
      // leaves the tab order; never `pointer-events: none` alone.
      disabled={isDisabled()}
      data-ui-element="button"
      data-ui-variant="text"
      // SB-148 — end-to-end test hooks.
      data-setting={props.configKey}
      data-value={String(value())}
      // SB-144/SB-145 — `aria-label` === tooltip, always naming the control,
      // because `4.2`, `-` and `/` are not self-describing on their own.
      {...buildBalloonHtmlProperties({ text: tooltip(), position: "up" })}
      onClick={(e) => cycle(e.shiftKey ? -1 : 1)}
      // SB-051 — the context-menu event steps backwards and is swallowed.
      onContextMenu={(e) => {
        e.preventDefault();
        cycle(-1);
      }}
    >
      {/* SB-021 — icon first, then the 0.5em gap from the button base class,
          then the label. The icon is present in every state, OFF included. */}
      <Icon icon={configMetadata[props.configKey].icon} fixedWidth />
      <span
        // SB-072 — croco calc's rendering of the brief's `~x~` notation, on
        // the label span only and never on the `<svg>` (SB-210).
        classList={{
          "[text-decoration-color:currentColor] [text-decoration-thickness:0.1em] line-through":
            isOff(),
        }}
      >
        {label()}
      </span>
    </button>
  );
}

/**
 * SB-087 — a card animates its width over 250 ms when its content width
 * changes (`12x12` → `100x100`), and never jumps. SB-088: the duration goes
 * through `applyReducedMotion`, so it collapses to 0 ms under
 * `prefers-reduced-motion`.
 */
function AnimatedCard(props: {
  class?: string;
  keys: readonly BarKey[];
  children: JSXElement;
}): JSXElement {
  const [ref, element] = useRefWithUtils<HTMLDivElement>();
  let previousWidth: number | undefined;

  // Every label that contributes to this card's rendered width.
  const signature = createMemo(() =>
    props.keys
      .map((key) => getBarLabel(key, getConfig[key] as never))
      .join(" "),
  );

  createEffectOn(
    () => signature(),
    () => {
      const el = element();
      if (el === undefined) return;

      const newWidth = el.getOuterWidth();
      const from = previousWidth;
      previousWidth = newWidth;

      if (from === undefined || from === newWidth) return;
      // SB-192 — the first programmatic (server/import) repaint does not animate.
      if (getProgrammaticChange()) return;

      void el.promiseAnimate({
        width: [`${from}px`, `${newWidth}px`],
        duration: applyReducedMotion(durationMs),
        onComplete: () => {
          el.setStyle({ width: "" });
        },
      });
    },
  );

  return (
    <div ref={ref} class={props.class}>
      {props.children}
    </div>
  );
}

/** Left pill — the two on/off modifiers (SB-084, SB-086). */
function Modifiers(): JSXElement {
  return (
    <AnimatedCard
      class={cn(cardClass, "mr-(--card-gap) w-max place-self-end")}
      keys={BAR_PILLS.left}
    >
      <For each={BAR_PILLS.left}>
        {(configKey) => <BarControl configKey={configKey} />}
      </For>
    </AnimatedCard>
  );
}

/** Centre pill — the five generator controls, in brief order 1→5 (SB-086). */
function Generators(): JSXElement {
  return (
    <AnimatedCard class={cn("z-2 w-max", cardClass)} keys={BAR_PILLS.centre}>
      <For each={BAR_PILLS.centre}>
        {(configKey) => <BarControl configKey={configKey} />}
      </For>
    </AnimatedCard>
  );
}

/** Right pill — the single test-length parameter, plus the share button. */
function TestLength(): JSXElement {
  return (
    <div class="relative grid w-max">
      <AnimatedCard
        class={cn(
          cardClass,
          "z-2 col-start-1 row-start-1 ml-(--card-gap) grid w-max grid-flow-col place-self-start",
        )}
        keys={BAR_PILLS.right}
      >
        <For each={BAR_PILLS.right}>
          {(configKey) => <BarControl configKey={configKey} />}
        </For>
      </AnimatedCard>
      {/* SB-089 — kept exactly as monkeytype renders it: hidden at opacity-0,
          revealed on group-hover, sliding out to the right of the card. */}
      <button
        type="button"
        class={cn(
          textButtonClass,
          "pointer-events-none absolute right-0 self-center px-(--horizontal-padding) opacity-0 transition-[margin-right,background-color,opacity] duration-125 group-hover:pointer-events-auto group-hover:mr-[calc((1.25em+(var(--horizontal-padding)*2))*-1)] group-hover:opacity-100 hover:mr-[calc((1.25em+(var(--horizontal-padding)*2))*-1)] hover:opacity-100",
        )}
        {...buildBalloonHtmlProperties({
          text: "share test settings",
          position: "up",
        })}
        onClick={() => showModal("ShareTestSettings")}
      >
        <Icon icon="tabler:share" fixedWidth />
      </button>
    </div>
  );
}
