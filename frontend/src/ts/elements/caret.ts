/**
 * The caret element (CP-067 … CP-070, master C11).
 *
 * Kept, not deleted: CP-053 keeps the hidden capture textarea, so there is no
 * native browser caret to fall back on — that is exactly the presupposition
 * INV-068 got wrong, and why C11 overrules it.
 *
 * Cut relative to monkeytype: the pace caret (CP-071), the tape-mode margin
 * bookkeeping, the RTL / joining-script handling (CP-072) and the `carrot` /
 * `banana` / `monkey` image carets (CP-069).
 *
 * `goTo({ wordIndex, letterIndex })` is renamed to `goTo({ taskIndex, charIndex })`
 * with identical semantics (CP-067).
 */

import { EasingParam, JSAnimation } from "animejs";

import { CaretStyle } from "@croco-calc/schemas/configs";
import { Config } from "../config/store";
import { requestDebouncedAnimationFrame } from "../utils/debounced-animation-frame";
import { ElementWithUtils, qs } from "../utils/dom";

const CARET_STYLES: CaretStyle[] = [
  "off",
  "default",
  "underline",
  "outline",
  "block",
];

/** ms of travel per `smoothCaret` step. `off` snaps. */
const SMOOTH_DURATIONS: Record<string, number> = {
  off: 0,
  slow: 150,
  medium: 100,
  fast: 85,
};

export class Caret {
  private readonly id: string;
  private readonly element: ElementWithUtils;
  private style: CaretStyle = "default";
  private posAnimation: JSAnimation | null = null;
  private marginTopAnimation: JSAnimation | null = null;
  private readyToResetMarginTop = false;

  constructor(element: ElementWithUtils, style: CaretStyle) {
    this.id = element.native.id;
    this.element = element;
    this.setStyle(style);
  }

  public setStyle(style: CaretStyle): void {
    this.style = style;
    this.element.setStyle({ width: "" });
    this.element.removeClass(CARET_STYLES);
    this.element.addClass(style);
  }

  public show(): void {
    this.element.show();
    this.element.setStyle({ display: "" });
  }

  public hide(): void {
    this.element.hide();
  }

  public isHidden(): boolean {
    return this.element.hasClass("hidden");
  }

  /** CP-070: blinking stops while the user is typing and resumes when idle. */
  public startBlinking(): void {
    this.element.setStyle({
      animationName:
        Config.smoothCaret === "off" ? "caretFlashHard" : "caretFlashSmooth",
    });
  }

  public stopBlinking(): void {
    this.element.setStyle({ animationName: "none", opacity: "1" });
  }

  public updateBlinkingAnimation(): void {
    this.startBlinking();
  }

  public stopAllAnimations(): void {
    this.posAnimation?.cancel();
    this.marginTopAnimation?.cancel();
  }

  public clearMargins(): void {
    this.element.setStyle({ marginTop: "" });
    this.readyToResetMarginTop = false;
  }

  /** Keeps the caret glued to the stream while CP-044's line jump animates. */
  public handleLineJump(options: {
    newMarginTop: number;
    duration: number;
  }): void {
    if (this.readyToResetMarginTop) {
      this.element.setStyle({ marginTop: "0px" });
    }
    this.readyToResetMarginTop = false;

    if (options.duration === 0) {
      this.marginTopAnimation?.cancel();
      this.element.setStyle({ marginTop: `${options.newMarginTop}px` });
      this.readyToResetMarginTop = true;
      return;
    }

    this.marginTopAnimation = this.element.animate({
      marginTop: options.newMarginTop,
      duration: options.duration,
      onComplete: () => {
        this.readyToResetMarginTop = true;
      },
    });
  }

  private place(
    left: number,
    top: number,
    animate: boolean,
    easing?: EasingParam,
  ): void {
    const duration = animate ? (SMOOTH_DURATIONS[Config.smoothCaret] ?? 0) : 0;
    this.posAnimation?.cancel();
    if (duration === 0) {
      this.element.setStyle({ left: `${left}px`, top: `${top}px` });
      return;
    }
    this.posAnimation = this.element.animate({
      left,
      top,
      duration,
      ease: easing ?? "inOut(1.25)",
    });
  }

  /**
   * CP-067 / CP-068 — sit immediately after the last typed character of the
   * active task's `.answer`; with an empty answer, immediately after the
   * prompt's trailing ` = `.
   *
   * Positions are measured against `#tasksWrapper`, which is the caret's
   * offset parent, so no scroll bookkeeping is needed.
   */
  public goTo(options: {
    taskIndex: number;
    charIndex: number;
    animate?: boolean;
    easing?: EasingParam;
  }): void {
    if (this.style === "off") return;
    requestDebouncedAnimationFrame(`caret.${this.id}.goTo`, () => {
      const wrapper = qs("#tasksWrapper");
      const task = qs(`#tasks .task[data-taskindex="${options.taskIndex}"]`);
      if (wrapper === null || task === null) return;

      const letters =
        task.native.querySelectorAll<HTMLElement>(".answer letter");
      // charIndex is clamped: anything past the end sits at the right edge.
      const anchorIndex = Math.min(options.charIndex, letters.length) - 1;
      const anchor =
        anchorIndex >= 0
          ? letters[anchorIndex]
          : task.native.querySelector<HTMLElement>(".prompt");

      const base = wrapper.native.getBoundingClientRect();
      const rect = (anchor ?? task.native).getBoundingClientRect();

      this.place(
        rect.right - base.left,
        rect.top - base.top,
        options.animate ?? false,
        options.easing,
      );
    });
  }
}
