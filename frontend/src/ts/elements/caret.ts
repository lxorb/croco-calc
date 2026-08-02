/**
 * The caret element (CP-067 … CP-070, master C11).
 *
 * Kept, not deleted: CP-053 keeps the hidden capture textarea, so there is no
 * native browser caret to fall back on — that is exactly the presupposition
 * INV-068 got wrong, and why C11 overrules it.
 *
 * Cut relative to upstream: the pace caret (CP-071), the tape-mode margin
 * bookkeeping, the RTL / joining-script handling (CP-072) and the three image
 * carets (CP-069).
 *
 * The upstream `goTo` argument pair is renamed to
 * `goTo({ taskIndex, charIndex })` with identical semantics (CP-067).
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

  /** CP-070: blinking stops while the user is answering and resumes when idle. */
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
   * Folds a finished line-jump margin back into `top`, leaving the caret in
   * exactly the same place on screen but with a clean margin, so the next
   * absolute placement is not offset by a line. Without this the caret drifts
   * one line up after every jump.
   */
  private settleLineJumpMargin(): void {
    if (!this.readyToResetMarginTop) return;
    this.readyToResetMarginTop = false;
    // Inline styles only: these are the ones the animation writes, and reading
    // them is far cheaper than a computed-style lookup.
    const inline = this.element.getStyle();
    const margin = parseFloat(inline.marginTop) || 0;
    if (margin === 0) {
      this.element.setStyle({ marginTop: "0px" });
      return;
    }
    const top = parseFloat(inline.top) || 0;
    this.element.setStyle({ marginTop: "0px", top: `${top + margin}px` });
  }

  /**
   * CP-067 / CP-068 — sit immediately after the last entered symbol of the
   * active task's `.answer`; with an empty answer, immediately after the
   * prompt's trailing ` = `.
   *
   * Positions are measured against `#tasksWrapper`, which is the caret's
   * offset parent, so no scroll bookkeeping is needed beyond settling the
   * line-jump margin above.
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

      this.settleLineJumpMargin();

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
