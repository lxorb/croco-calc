import { MINUS } from "@croco-calc/math-engine";
import { For, Show } from "solid-js";

import { getConfig } from "../../../config/store";
import { focusInputElement } from "../../../input/input-element";
import { bp } from "../../../states/breakpoints";
import * as TestLogic from "../../../test/test-logic";
import { Button } from "../../common/Button";

/**
 * The mobile answer symbol row (CP-191 … CP-196).
 *
 * `inputmode="decimal"` (CP-054) yields a keypad with digits and a decimal
 * separator only — no `/` and no `-`. Since `fractionAddition`,
 * `fractionMultiplication` and `negatives` are all ON by default (SB-110), the
 * shipped default configuration is literally unplayable on a phone without this.
 * It is a functional necessity, not the decorative numpad diagram CP-061 defers.
 */

type AnswerSymbol = {
  /** What is fed to the engine — ASCII (ME-139 normalises either way). */
  char: string;
  /** What is drawn — U+2212 for the minus (CP-033). */
  label: string;
  /** CP-196 — the symbol spelled out for screen readers. */
  ariaLabel: string;
  visible: () => boolean;
};

/** CP-192 — only the glyphs the current configuration can actually need. */
const SYMBOLS: AnswerSymbol[] = [
  {
    char: "-",
    label: MINUS,
    ariaLabel: "minus",
    visible: () => getConfig.negatives,
  },
  {
    char: ".",
    label: ".",
    ariaLabel: "decimal point",
    visible: () => getConfig.decimals,
  },
  {
    char: "/",
    label: "/",
    ariaLabel: "fraction slash",
    visible: () =>
      getConfig.fractionAddition !== "off" || getConfig.fractionMultiplication,
  },
];

export function AnswerSymbols() {
  const shown = () => SYMBOLS.filter((symbol) => symbol.visible());
  // CP-191 — at and above `md` the row is not rendered at all, not merely hidden.
  const isMobile = () => !bp().md;

  return (
    <Show when={isMobile() && shown().length > 0}>
      <div
        id="answerSymbols"
        // CP-194 — swallowing the bubbled `mousedown`/`pointerdown` default is
        // what stops focus leaving #tasksInput, so the on-screen keypad does
        // not close mid-answer. `tabindex="-1"` is deliberately NOT used:
        // CP-183's keyboard-reachability rule still applies.
        onMouseDown={(e) => {
          e.preventDefault();
        }}
        onPointerDown={(e) => {
          e.preventDefault();
        }}
      >
        <For each={shown()}>
          {(symbol) => (
            <Button
              variant="text"
              text={symbol.label}
              balloon={{ text: symbol.ariaLabel, position: "up" }}
              dataset={{ "data-symbol": symbol.char }}
              onClick={() => {
                // CP-193 / CP-195 — the exact same path as a physical
                // keystroke, filter and all, so a press also starts the test
                // and lifts the pre-start blur.
                TestLogic.pressCharacter(symbol.char);
                focusInputElement(true);
              }}
            />
          )}
        </For>
      </div>
    </Show>
  );
}
