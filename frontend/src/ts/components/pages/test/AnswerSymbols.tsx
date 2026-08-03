import { MINUS } from "@croco-calc/math-engine";
import { For, Show } from "solid-js";

import { getConfig } from "../../../config/store";
import { focusInputElement } from "../../../input/input-element";
import { bp } from "../../../states/breakpoints";
import { getArenaState } from "../../../states/test";
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
  // CP-191 / TR-102 — at and above `md` the row is not rendered at all, not
  // merely hidden.
  const isMobile = () => !bp().md;

  /**
   * TR-105 — the submit / continue button.
   *
   * On iOS the `inputmode="decimal"` keypad has **no return key at all**, so
   * without this the run simply cannot be submitted on an iPhone. That is a
   * functional necessity of exactly the same kind as the symbol row itself.
   * It invokes the same `submitOrContinue()` handler Enter does, so the TR-118
   * arming delay applies to it identically.
   */
  const state = () => getArenaState();
  const showSubmit = () =>
    state() === "running" || state() === "awaitingContinue";

  return (
    <Show when={isMobile() && (shown().length > 0 || showSubmit())}>
      <div
        id="answerSymbols"
        // CP-194 — swallowing the bubbled `mousedown`/`pointerdown` default is
        // what stops focus leaving #answerInput, so the on-screen keypad does
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
                // CP-193 / CP-195 / TR-104 — the exact same engine path as a
                // physical keystroke, filter and 16-character cap and all, so a
                // press also starts the run from `preStart`.
                TestLogic.pressCharacter(symbol.char);
                focusInputElement(true);
              }}
            />
          )}
        </For>
        <Show when={showSubmit()}>
          <Button
            variant="text"
            icon={{ icon: "ph:arrow-elbow-down-left-bold", fixedWidth: true }}
            balloon={{
              // TR-105 — the accessible name follows the state, because the
              // key does two different things in the two states.
              text:
                state() === "awaitingContinue" ? "continue" : "submit answer",
              position: "up",
            }}
            dataset={{ "data-test-id": "submitAnswerButton" }}
            onClick={() => {
              TestLogic.submitOrContinue();
              focusInputElement(true);
            }}
          />
        </Show>
      </div>
    </Show>
  );
}
