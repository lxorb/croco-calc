import { ElementWithUtils } from "../utils/dom";
import { renderIconHtml } from "../utils/icon-html";

type InputIndicatorOption = {
  /** An iconify id, e.g. `"ph:check-bold"` (C10, DoD-12). */
  icon: string;
  spinIcon?: true;
  message?: string;
  level: -1 | 0 | 1;
};

export class InputIndicator {
  private inputElement: ElementWithUtils<HTMLInputElement>;
  private parentElement: ElementWithUtils;
  private options: Record<string, InputIndicatorOption>;
  private currentStatus: keyof typeof this.options | null;

  constructor(
    inputElement: ElementWithUtils<HTMLInputElement>,
    options: Record<string, InputIndicatorOption>,
  ) {
    this.inputElement = inputElement;
    const existingWrapper = inputElement.native.closest(".inputAndIndicator");
    if (existingWrapper) {
      existingWrapper.querySelector(".statusIndicator")?.remove();
      this.parentElement = new ElementWithUtils(
        existingWrapper as HTMLInputElement,
      );
    } else {
      this.parentElement = this.inputElement.wrapWith(
        `<div class="inputAndIndicator"></div>`,
      );
    }
    this.options = options;
    this.currentStatus = null;

    let indicator = `<div class="statusIndicator">`;

    for (const [optionId, option] of Object.entries(options)) {
      indicator += `
      <div
        class="indicator level${option.level} hidden"
        data-option-id="${optionId}"
        
        ${
          (option.message?.length ?? 0) > 27
            ? `data-balloon-length="large"`
            : ""
        }
        data-balloon-pos="left"
        ${(option.message ?? "") ? `aria-label="${option.message}"` : ""}
      >
        ${renderIconHtml(option.icon, {
          fixedWidth: true,
          spin: option.spinIcon,
        })}
      </div>
      `;
    }

    indicator += `</div>`;

    this.parentElement.appendHtml(indicator);
  }

  hide(): void {
    this.parentElement.qsa(".statusIndicator div")?.hide();
    this.currentStatus = null;
    this.inputElement.setStyle({ paddingRight: "0.5em" });
  }

  show(optionId: keyof typeof this.options, messageOverride?: string): void {
    this.hide();

    this.currentStatus = optionId;

    const indicator = this.parentElement.qs(`[data-option-id="${optionId}"]`);

    indicator?.show();

    if (messageOverride !== undefined && messageOverride !== "") {
      if (messageOverride.length > 20) {
        indicator?.setAttribute("data-balloon-length", "large");
      } else {
        indicator?.removeAttribute("data-balloon-length");
      }
      indicator?.setAttribute("aria-label", messageOverride);
    }

    this.inputElement.setStyle({ paddingRight: "2.1em" });
    this.parentElement.setAttribute("data-indicator-status", optionId);
  }

  get(): keyof typeof this.options | null {
    return this.currentStatus;
  }
}
