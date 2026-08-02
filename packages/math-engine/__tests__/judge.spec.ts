import { describe, expect, it } from "vitest";
import {
  ANSWER_MAX_LENGTH,
  MAX_COMPONENT_DIGITS,
  appendAnswerChar,
  commitAnswer,
  isAnswerCorrect,
  judgeAnswer,
  normalizeAnswerChar,
  normalizeAnswerInput,
  normalizeForCommit,
  parseAnswer,
} from "../src/judge";
import { fromInt, rational } from "../src/rational";
import type { Rational } from "../src/rational";
import type { Task } from "../src/types";

function taskWithAnswer(answer: Rational): Task {
  return {
    index: 0,
    kind: "add",
    operator: "+",
    operands: [
      { type: "int", magnitude: 1, negative: false },
      { type: "int", magnitude: 1, negative: false },
    ],
    prompt: "1 + 1 =",
    answer,
    answerDisplay: "2",
    taskSeed: 0,
    attempts: 1,
  };
}

describe("accepted characters (ME-137, ME-138, ME-139, E26, E28, E29)", () => {
  it("accepts digits, -, /, . and ,", () => {
    for (const ch of "0123456789") expect(normalizeAnswerChar(ch)).toBe(ch);
    expect(normalizeAnswerChar("-")).toBe("-");
    expect(normalizeAnswerChar("/")).toBe("/");
    expect(normalizeAnswerChar(".")).toBe(".");
  });

  it("E28 / ME-138: the German numpad comma normalises to a point", () => {
    expect(normalizeAnswerChar(",")).toBe(".");
    expect(normalizeAnswerInput("4,2")).toBe("4.2");
  });

  it("E29 / ME-139: unicode minus variants normalise to ASCII '-'", () => {
    expect(normalizeAnswerChar("−")).toBe("-");
    expect(normalizeAnswerChar("–")).toBe("-");
    expect(normalizeAnswerChar("—")).toBe("-");
    expect(normalizeAnswerInput("−5")).toBe("-5");
  });

  it("E26 / ME-137: any other printable character is silently ignored", () => {
    for (const ch of "abcZ+*=% x!\t") {
      expect(normalizeAnswerChar(ch)).toBeNull();
    }
    expect(appendAnswerChar("1", "a")).toBe("1");
    expect(appendAnswerChar("1", "+")).toBe("1");
    expect(appendAnswerChar("1", " ")).toBe("1");
  });
});

describe("input filter (CP-055 … CP-058, C32, ME-151, E24)", () => {
  it("allows one leading minus only", () => {
    expect(appendAnswerChar("", "-")).toBe("-");
    expect(appendAnswerChar("-", "-")).toBe("-");
    expect(appendAnswerChar("12", "-")).toBe("12");
    expect(appendAnswerChar("1/", "-")).toBe("1/");
  });

  it("allows at most one '.' and at most one '/'", () => {
    expect(appendAnswerChar("1.2", ".")).toBe("1.2");
    expect(appendAnswerChar("1/2", "/")).toBe("1/2");
    expect(appendAnswerChar("1.2", "/")).toBe("1.2");
    expect(appendAnswerChar("1/2", ".")).toBe("1/2");
  });

  it("C32: requires at least one digit before both '.' and '/'", () => {
    expect(appendAnswerChar("", ".")).toBe("");
    expect(appendAnswerChar("-", ".")).toBe("-");
    expect(appendAnswerChar("", "/")).toBe("");
    expect(appendAnswerChar("-", "/")).toBe("-");
    expect(appendAnswerChar("1", ".")).toBe("1.");
    expect(appendAnswerChar("-1", "/")).toBe("-1/");
  });

  it("E24 / ME-151: input is capped at 16 characters", () => {
    expect(ANSWER_MAX_LENGTH).toBe(16);
    const full = "1234567890123456";
    expect(full).toHaveLength(16);
    expect(appendAnswerChar(full, "7")).toBe(full);
    expect(appendAnswerChar("123456789012345", "6")).toBe(full);
  });
});

describe("commit-time normalisation (CP-058a) and the empty commit (ME-141, E25)", () => {
  it("strips a trailing '.', ',' or '/' and a lone '-'", () => {
    expect(normalizeForCommit("5.")).toBe("5");
    expect(normalizeForCommit("5,")).toBe("5");
    expect(normalizeForCommit("1/")).toBe("1");
    expect(normalizeForCommit("-")).toBe("");
    expect(normalizeForCommit("-5")).toBe("-5");
  });

  it("E25 / ME-141: committing an empty or digitless buffer is a no-op", () => {
    const task = taskWithAnswer(fromInt(2));
    for (const buffer of ["", "   ", "-", ".", "/", "-."]) {
      expect(commitAnswer(task, buffer).outcome).toBe("noop");
    }
  });

  it("judges '5.' as 5 after normalisation, not as malformed", () => {
    const task = taskWithAnswer(fromInt(5));
    expect(commitAnswer(task, "5.").outcome).toBe("correct");
    // but the raw ME-143 grammar still rejects it
    expect(parseAnswer("5.")).toBeNull();
  });

  it("reports the normalised buffer so it can be logged as `given` (ME-159)", () => {
    const task = taskWithAnswer(fromInt(5));
    expect(commitAnswer(task, "5,").given).toBe("5");
    expect(commitAnswer(task, "−5").given).toBe("-5");
  });
});

describe("answer grammar (ME-143 … ME-146, ME-150, E2, E23, E27)", () => {
  it("parses INT, DEC and FRAC to exact rationals (ME-145)", () => {
    expect(parseAnswer("7")).toEqual({ n: 7, d: 1 });
    expect(parseAnswer("-7")).toEqual({ n: -7, d: 1 });
    expect(parseAnswer("0.25")).toEqual({ n: 1, d: 4 });
    expect(parseAnswer("-0.5")).toEqual({ n: -1, d: 2 });
    expect(parseAnswer("19/12")).toEqual({ n: 19, d: 12 });
    expect(parseAnswer("-3/4")).toEqual({ n: -3, d: 4 });
  });

  it("ME-150: leading zeros are accepted", () => {
    expect(parseAnswer("007")).toEqual({ n: 7, d: 1 });
    expect(parseAnswer("0000007")).toEqual({ n: 7, d: 1 });
    expect(parseAnswer("00.50")).toEqual({ n: 1, d: 2 });
  });

  it("E2 / ME-146: a zero denominator is incorrect, not Infinity or NaN", () => {
    expect(parseAnswer("3/0")).toBeNull();
    expect(parseAnswer("0/0")).toBeNull();
    const task = taskWithAnswer(fromInt(3));
    expect(() => isAnswerCorrect(task, "3/0")).not.toThrow();
    expect(isAnswerCorrect(task, "3/0")).toBe(false);
  });

  it("E27 / ME-143: malformed input is incorrect and never throws", () => {
    for (const bad of [
      "5/",
      ".",
      "-",
      "1.2.3",
      "1/2/3",
      "1.2/3",
      "1/2.3",
      "1-2",
      "--1",
      "1-",
      "/2",
      ".5",
      "5.",
      "",
      "-.5",
    ]) {
      expect(
        parseAnswer(bad),
        `parseAnswer(${JSON.stringify(bad)})`,
      ).toBeNull();
      const task = taskWithAnswer(fromInt(1));
      expect(() => isAnswerCorrect(task, bad)).not.toThrow();
      expect(isAnswerCorrect(task, bad)).toBe(false);
    }
  });

  it("E23 / ME-143, ME-144: a component longer than 7 digits is incorrect", () => {
    expect(MAX_COMPONENT_DIGITS).toBe(7);
    expect(parseAnswer("1234567")).toEqual({ n: 1234567, d: 1 });
    expect(parseAnswer("12345678")).toBeNull();
    expect(parseAnswer("1.12345678")).toBeNull();
    expect(parseAnswer("12345678/2")).toBeNull();
    expect(parseAnswer("2/12345678")).toBeNull();
    expect(parseAnswer("1234567/1234567")).not.toBeNull();
  });

  it("ME-144: the longest legitimate answer 9801/10000 is well inside the cap", () => {
    expect(parseAnswer("9801/10000")).toEqual({ n: 9801, d: 10000 });
  });

  it("ME-071 / E19: a mixed number is rejected", () => {
    expect(parseAnswer("1 7/12")).toBeNull();
    const task = taskWithAnswer(rational(19, 12));
    expect(isAnswerCorrect(task, "1 7/12")).toBe(false);
  });
});

describe("exact rational judging (ME-147 … ME-149, E4, E6, E20, E21)", () => {
  it("E20 / ME-068: any equal representation is accepted, reduced or not", () => {
    const task = taskWithAnswer(rational(19, 12));
    for (const given of ["19/12", "38/24", "57/36", "190/120"]) {
      expect(isAnswerCorrect(task, given), given).toBe(true);
    }
  });

  it("ME-148: representations cross formats", () => {
    const quarter = taskWithAnswer(rational(1, 4));
    for (const given of ["1/4", "2/8", "0.25", "0,25", "25/100"]) {
      expect(isAnswerCorrect(quarter, given), given).toBe(true);
    }
    const half = taskWithAnswer(rational(1, 2));
    expect(isAnswerCorrect(half, "0.5")).toBe(true); // ME-070
    expect(isAnswerCorrect(half, "1/2")).toBe(true);
  });

  it("E21 / ME-025, ME-070: a close decimal is NOT accepted", () => {
    const third = taskWithAnswer(rational(1, 3));
    expect(isAnswerCorrect(third, "0.333")).toBe(false);
    expect(isAnswerCorrect(third, "0.3333333")).toBe(false);
    expect(isAnswerCorrect(third, "1/3")).toBe(true);
    expect(isAnswerCorrect(third, "2/6")).toBe(true);
  });

  it("E18 / ME-069: an integer answer accepts a bare integer and any equal fraction", () => {
    const one = taskWithAnswer(fromInt(1));
    for (const given of ["1", "1/1", "2/2", "6/6", "12/12", "1.0", "1.00"]) {
      expect(isAnswerCorrect(one, given), given).toBe(true);
    }
  });

  it("E4: a user-supplied denominator of 1 is accepted when the value matches", () => {
    expect(isAnswerCorrect(taskWithAnswer(fromInt(3)), "3/1")).toBe(true);
    expect(isAnswerCorrect(taskWithAnswer(fromInt(3)), "6/2")).toBe(true);
  });

  it("E6 / ME-149: -0, 0, 0/5 and 0.0 all equal 0", () => {
    const zero = taskWithAnswer(fromInt(0));
    for (const given of ["0", "-0", "0/5", "0.0", "-0.0", "0.000", "000"]) {
      expect(isAnswerCorrect(zero, given), given).toBe(true);
    }
    expect(isAnswerCorrect(zero, "1")).toBe(false);
  });

  it("ME-147: judging is cross-multiplication, never string comparison", () => {
    expect(judgeAnswer(rational(1, 2), "2/4")).toBe(true);
    expect(judgeAnswer(rational(1, 2), "0.5")).toBe(true);
    expect(judgeAnswer(rational(-1, 2), "-2/4")).toBe(true);
    expect(judgeAnswer(rational(-1, 2), "2/-4")).toBe(false); // internal minus
    expect(judgeAnswer(rational(1, 2), "1/2 ")).toBe(true); // surrounding space trimmed
  });

  it("judges negative expected answers", () => {
    const negative = taskWithAnswer(fromInt(-56));
    expect(isAnswerCorrect(negative, "-56")).toBe(true);
    expect(isAnswerCorrect(negative, "−56")).toBe(true); // U+2212 in, C33 out
    expect(isAnswerCorrect(negative, "56")).toBe(false);
  });

  it("commitAnswer reports correct / incorrect and never throws", () => {
    const task = taskWithAnswer(rational(1, 4));
    expect(commitAnswer(task, "0,25")).toEqual({
      outcome: "correct",
      given: "0.25",
    });
    expect(commitAnswer(task, "0.3")).toEqual({
      outcome: "incorrect",
      given: "0.3",
    });
    expect(commitAnswer(task, "1/2/3")).toEqual({
      outcome: "incorrect",
      given: "1/2/3",
    });
  });
});
