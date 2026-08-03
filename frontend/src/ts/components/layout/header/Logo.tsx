import { JSXElement } from "solid-js";

import { restartTestEvent } from "../../../events/test";
import { getActivePage } from "../../../states/core";
import { getFocus } from "../../../states/test";
import { cn } from "../../../utils/cn";
import { isDevEnvironment } from "../../../utils/env";

/**
 * The crocodile mark (CP-010). Kept in sync with
 * `frontend/static/images/logo/croco-mark.svg`, which WP-12 generated; it is
 * inlined here rather than fetched so the header paints with the rest of the
 * shell and so `fill="currentColor"` picks up the focus-dimming colour change.
 */
const CROCO_MARK_PATH =
  "M101.06 165.24L199.46 158.93A26.00 26.00 0 0 1 222.39 169.92L240.28 195.34A34.00 34.00 0 0 0 272.22 209.52L349.63 200.05A40.00 40.00 0 0 1 350.37 199.96L437.32 190.97A26.00 26.00 0 0 1 466.00 216.83L466.00 233.97A26.00 26.00 0 0 1 444.27 259.62L312.29 281.62A30.00 30.00 0 0 0 308.07 339.78L424.71 377.11A22.00 22.00 0 0 1 440.00 398.06L440.00 419.37A28.00 28.00 0 0 1 413.40 447.33L209.93 457.50A46.00 46.00 0 0 1 190.75 454.35L92.19 415.48A54.00 54.00 0 0 1 58.00 365.25L58.00 211.15A46.00 46.00 0 0 1 101.06 165.24ZM138.00 232.00 A34.00 34.00 0 1 0 206.00 232.00 A34.00 34.00 0 1 0 138.00 232.00 Z";

export function Logo(): JSXElement {
  return (
    <a
      href={`${location.origin}/`}
      class="-m-2 flex h-6 w-max gap-2 rounded-[0.8rem] p-2 focus-visible:**:data-[ui-element='logoSubtext']:text-transparent"
      aria-label="croco calc Home"
      router-link
      style={{
        "box-sizing": "content-box",
        "font-family": "Lexend Deca ,sans-serif",
      }}
      data-ui-element="logo"
      onClick={() => {
        if (getActivePage() === "test") restartTestEvent.dispatch();
      }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="54 154 416 308"
        class={cn("h-full fill-[currentColor] text-main transition-colors", {
          "text-sub": getFocus(),
        })}
      >
        <path d={CROCO_MARK_PATH}></path>
      </svg>
      <div class="hidden h-6 place-content-center text-[2rem] leading-0 sm:grid">
        <div
          class={cn(
            "-mt-[1.65em] hidden pl-[0.5em] text-[0.315em] leading-0 whitespace-nowrap text-sub transition-colors duration-125 lg:block",
            {
              "text-transparent": getFocus(),
            },
          )}
          data-ui-element="logoSubtext"
        >
          {isDevEnvironment() ? "localhost" : "snap snap"}
        </div>
        <h1
          class={cn(
            "-mt-[0.11em] whitespace-nowrap text-text transition-colors duration-250",
            {
              "text-sub": getFocus(),
            },
          )}
          data-ui-element="logoText"
        >
          croco calc
        </h1>
      </div>
    </a>
  );
}
