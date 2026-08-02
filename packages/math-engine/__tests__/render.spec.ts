import { describe, expect, it } from "vitest";
import {
  MINUS,
  OPERATOR_ADD,
  OPERATOR_DIV,
  OPERATOR_MUL,
  decimalString,
  renderAnswerDisplay,
  renderOperand,
  renderPrompt,
} from "../src/render";
import {
  decimalOperand,
  fractionOperand,
  intOperand,
  negateOperand,
  operandValue,
} from "../src/operand";
import { fromInt, rational } from "../src/rational";

describe("operator glyphs (ME-127, ME-128, A9)", () => {
  it("uses +, × (U+00D7) and ÷ (U+00F7)", () => {
    expect(OPERATOR_ADD).toBe("+");
    expect(OPERATOR_ADD.codePointAt(0)).toBe(0x002b);
    expect(OPERATOR_MUL).toBe("×");
    expect(OPERATOR_DIV).toBe("÷");
  });

  it("reserves / for fractions — a division prompt never uses it", () => {
    const prompt = renderPrompt(
      [intOperand(144), intOperand(12)],
      OPERATOR_DIV,
    );
    expect(prompt).toBe("144 ÷ 12 =");
    expect(prompt).not.toContain("/");
  });
});

describe("minus glyph (C33 over ME-131)", () => {
  it("displays U+2212, not ASCII hyphen", () => {
    expect(MINUS).toBe("−");
    expect(MINUS).not.toBe("-");
  });
});

describe("decimal canonicalisation (ME-132, ME-133, A10)", () => {
  it("strips trailing zeros and a trailing bare point", () => {
    expect(decimalString(rational(100, 100))).toBe("1");
    expect(decimalString(rational(250, 100))).toBe("2.5");
    expect(decimalString(rational(2500, 1000))).toBe("2.5");
  });

  it("always renders a leading 0 before the point", () => {
    expect(decimalString(rational(25, 100))).toBe("0.25");
    expect(decimalString(rational(1, 2))).toBe("0.5");
    expect(decimalString(rational(87, 1000))).toBe("0.087");
    expect((decimalString(rational(25, 100)) as string).startsWith(".")).toBe(
      false,
    );
  });

  it("uses '.' as the separator and no thousands separator", () => {
    expect(decimalString(rational(12345, 10))).toBe("1234.5");
    expect(decimalString(rational(12345, 10))).not.toContain(",");
    expect(decimalString(rational(12345, 10))).not.toContain(" ");
  });

  it("renders negatives with U+2212 and never renders negative zero", () => {
    expect(decimalString(rational(-25, 100))).toBe(`${MINUS}0.25`);
    expect(decimalString(rational(0, 5))).toBe("0");
    expect(decimalString(fromInt(-0))).toBe("0");
  });

  it("returns null for a non-terminating value rather than rounding (ME-025)", () => {
    expect(decimalString(rational(1, 3))).toBeNull();
    expect(decimalString(rational(19, 12))).toBeNull();
  });

  it("handles the 6-fractional-digit worst case of the golden vectors", () => {
    expect(decimalString(rational(8178, 1000000))).toBe("0.008178");
  });
});

describe("operand rendering (ME-129 … ME-133)", () => {
  it("renders integers, decimals and fractions", () => {
    expect(renderOperand(intOperand(12), 0)).toBe("12");
    expect(renderOperand(decimalOperand(42, 1), 0)).toBe("4.2");
    expect(renderOperand(decimalOperand(100, 2), 0)).toBe("1"); // E7
    expect(renderOperand(decimalOperand(87, 3), 0)).toBe("0.087");
    expect(renderOperand(fractionOperand(5, 6), 0)).toBe("5/6");
  });

  it("ME-130: fractions are inline, with no spaces around the slash", () => {
    expect(renderOperand(fractionOperand(19, 12), 0)).toBe("19/12");
    expect(renderOperand(fractionOperand(19, 12), 0)).not.toContain(" ");
  });

  it("ME-131: a negative FIRST operand is bare with a leading minus", () => {
    expect(renderOperand(negateOperand(intOperand(12)), 0)).toBe(`${MINUS}12`);
    expect(renderOperand(negateOperand(fractionOperand(3, 4)), 0)).toBe(
      `${MINUS}3/4`,
    );
    expect(renderOperand(negateOperand(decimalOperand(5, 1)), 0)).toBe(
      `${MINUS}0.5`,
    );
  });

  it("ME-131: a negative SECOND operand is wrapped in parentheses", () => {
    expect(renderOperand(negateOperand(intOperand(5)), 1)).toBe(`(${MINUS}5)`);
    expect(renderOperand(negateOperand(decimalOperand(5, 1)), 1)).toBe(
      `(${MINUS}0.5)`,
    );
    expect(renderOperand(negateOperand(fractionOperand(3, 4)), 1)).toBe(
      `(${MINUS}3/4)`,
    );
  });

  it("E38 / ME-113: the sign is on the whole fraction; the denominator stays positive", () => {
    const negated = negateOperand(fractionOperand(3, 4));
    expect(negated).toMatchObject({
      numerator: 3,
      denominator: 4,
      negative: true,
    });
    expect(operandValue(negated)).toEqual({ n: -3, d: 4 });
    expect(renderOperand(negated, 0)).toBe(`${MINUS}3/4`);
  });
});

describe("prompt rendering (ME-129, ME-131)", () => {
  it("renders '<a> <op> <b> =' with single spaces", () => {
    expect(renderPrompt([intOperand(3), intOperand(4)], OPERATOR_ADD)).toBe(
      "3 + 4 =",
    );
    expect(
      renderPrompt(
        [fractionOperand(3, 4), fractionOperand(5, 6)],
        OPERATOR_ADD,
      ),
    ).toBe("3/4 + 5/6 =");
    expect(
      renderPrompt([decimalOperand(1, 0), intOperand(4)], OPERATOR_DIV),
    ).toBe("1 ÷ 4 =");
  });

  it("ME-131: a negative second operand is never rewritten as a subtraction", () => {
    const prompt = renderPrompt(
      [intOperand(12), negateOperand(intOperand(5))],
      OPERATOR_ADD,
    );
    expect(prompt).toBe(`12 + (${MINUS}5) =`);
    expect(prompt).not.toBe("12 - 5 =");
    expect(prompt).not.toBe(`12 ${MINUS} 5 =`);
  });

  it("ME-033: there is no subtraction operator at all", () => {
    const glyphs = [OPERATOR_ADD, OPERATOR_MUL, OPERATOR_DIV];
    expect(glyphs).toHaveLength(3);
    expect(glyphs).not.toContain("-");
    expect(glyphs).not.toContain(MINUS);
  });
});

describe("answerDisplay (ME-134, ME-072, C33)", () => {
  it("renders integral answers as bare integers for every kind", () => {
    expect(renderAnswerDisplay(fromInt(12), "div")).toBe("12");
    expect(renderAnswerDisplay(fromInt(82), "div")).toBe("82");
    expect(renderAnswerDisplay(fromInt(1), "fracAdd")).toBe("1");
    expect(renderAnswerDisplay(fromInt(2), "decimal")).toBe("2");
  });

  it("ME-072: fraction answers display the fully reduced p/q", () => {
    expect(renderAnswerDisplay(rational(19, 12), "fracAdd")).toBe("19/12");
    expect(renderAnswerDisplay(rational(38, 24), "fracAdd")).toBe("19/12");
    expect(renderAnswerDisplay(rational(3, 10), "fracMul")).toBe("3/10");
    expect(renderAnswerDisplay(rational(6, 20), "fracMul")).toBe("3/10");
  });

  it("renders decimal-kind answers as canonical decimals", () => {
    expect(renderAnswerDisplay(rational(1, 4), "decimal")).toBe("0.25");
    expect(renderAnswerDisplay(rational(23, 2), "decimal")).toBe("11.5");
    expect(renderAnswerDisplay(rational(8178, 1000000), "decimal")).toBe(
      "0.008178",
    );
  });

  it("C33: negatives carry a leading U+2212", () => {
    expect(renderAnswerDisplay(fromInt(-7), "add")).toBe(`${MINUS}7`);
    expect(renderAnswerDisplay(fromInt(-56), "mul")).toBe(`${MINUS}56`);
    expect(renderAnswerDisplay(rational(-19, 12), "fracAdd")).toBe(
      `${MINUS}19/12`,
    );
    expect(renderAnswerDisplay(rational(-1, 4), "decimal")).toBe(
      `${MINUS}0.25`,
    );
  });

  it("E6 / ME-134: negative zero renders as 0", () => {
    expect(renderAnswerDisplay(fromInt(0), "add")).toBe("0");
    expect(renderAnswerDisplay(rational(-0, 5), "add")).toBe("0");
    expect(renderAnswerDisplay(fromInt(-0), "decimal")).toBe("0");
  });

  it("never renders a mixed number (ME-071)", () => {
    expect(renderAnswerDisplay(rational(19, 12), "fracAdd")).not.toContain(" ");
  });
});
