import { describe, it, expect } from "vitest";
import { buildDbResult } from "../../src/utils/result";
import { ResultSchema, type CompletedEvent } from "@croco-calc/schemas/results";
import {
  buildSettingsId,
  type MathGeneratorSettings,
} from "@croco-calc/schemas/math";

/**
 * `backend/src/utils/result.ts`.
 *
 * This spec used to exercise monkeytype's `replaceLegacyValues` — the
 * `correctChars`/`incorrectChars` → `charStats` conversion, `funbox` as a
 * `#`-joined string, and `chartData.raw` → `chartData.burst`. Every one of those
 * fields is deleted by AC-007 / ME-164 / C15, `replaceLegacyValues` is gone with
 * them (croco calc starts from an empty `results` collection, so there is no
 * legacy shape to migrate from), and the old file asserted over nothing that
 * exists.
 *
 * What the module does now is `buildDbResult`, which had no coverage at all. The
 * two load-bearing behaviours are:
 *
 *  * **what is dropped** — the client-supplied anti-cheat inputs are consumed by
 *    the validation pipeline and MUST NOT be persisted. `taskLog` in particular
 *    holds every task's exact answer, in a document the owning user can read
 *    back (C29's spirit), and it is several kB per result;
 *  * **the default-omission compression**, which the frontend reverses on read.
 */

const settings: MathGeneratorSettings = {
  addition: "1000",
  multiplication: "100",
  division: "threeByTwo",
  fractionAddition: "99",
  fractionMultiplication: true,
  decimals: true,
  negatives: true,
};

function completedEvent(over: Partial<CompletedEvent> = {}): CompletedEvent {
  return {
    score: 190,
    correct: 200,
    wrong: 10,
    acc: 95.24,
    tpm: 26.25,
    spm: 23.75,
    consistency: 82,
    mode: "time",
    mode2: "8",
    timestamp: 1_754_000_000_000,
    testDuration: 480,
    chartData: {
      score: [10, 40, 90, 190],
      tpm: [24, 26, 27, 26],
      wrong: [1, 3, 6, 10],
    },
    uid: "buildresultuid00000000000000000",
    settings,
    settingsId: buildSettingsId(settings),
    restartCount: 0,
    incompleteTestSeconds: 0,
    afkDuration: 0,
    hash: "0123456789abcdef0123456789abcdef",
    mathSeed: 4_242_424_242,
    mathSettings: { ...settings, time: 8 },
    engineVersion: "1.0.0",
    taskLog: [
      {
        i: 0,
        kind: "add",
        prompt: "12 + 30",
        expected: "42",
        given: "42",
        correct: true,
        tStart: 0,
        tEnd: 1200,
      },
    ],
    incompleteTests: [],
    ...over,
  };
}

/** `Result` carries `_id` as a hex string; the document carries an `ObjectId`. */
function onTheWire(event: CompletedEvent): unknown {
  const { _id, ...rest } = buildDbResult(event, "croco", false);
  return { ...rest, _id: _id.toHexString() };
}

describe("buildDbResult", () => {
  it("produces a document the persisted-result schema accepts", () => {
    const parsed = ResultSchema.safeParse(onTheWire(completedEvent()));
    expect(parsed.error?.issues ?? []).toEqual([]);
    expect(parsed.success).toBe(true);
  });

  it("carries the metrics through unchanged", () => {
    const event = completedEvent();
    const doc = buildDbResult(event, "croco", true);

    expect(doc).toMatchObject({
      uid: event.uid,
      name: "croco",
      score: 190,
      correct: 200,
      wrong: 10,
      acc: 95.24,
      tpm: 26.25,
      spm: 23.75,
      consistency: 82,
      mode: "time",
      mode2: "8",
      testDuration: 480,
      settings,
      settingsId: event.settingsId,
      isPb: true,
    });
    expect(doc.chartData).toEqual(event.chartData);
  });

  it("takes the name from the caller, not from the payload", () => {
    // The client never gets to choose the name a leaderboard row is built from.
    const doc = buildDbResult(completedEvent(), "the-real-name", false);
    expect(doc.name).toBe("the-real-name");
  });

  /**
   * The important one. Each of these is a client-supplied anti-cheat input; the
   * pipeline has already consumed it by the time this runs.
   */
  it.each([
    "hash",
    "mathSeed",
    "mathSettings",
    "engineVersion",
    "taskLog",
    "incompleteTests",
  ])("does not persist %s", (field) => {
    const doc = buildDbResult(completedEvent(), "croco", false) as Record<
      string,
      unknown
    >;
    expect(doc[field]).toBeUndefined();
    expect(Object.keys(doc)).not.toContain(field);
  });

  it("never leaks a task's expected answer into the stored document", () => {
    const doc = buildDbResult(completedEvent(), "croco", false);
    expect(JSON.stringify(doc)).not.toContain("12 + 30");
    expect(JSON.stringify(doc)).not.toContain("expected");
  });

  describe("default-omission compression", () => {
    it.each(["restartCount", "incompleteTestSeconds", "afkDuration"])(
      "omits %s when it is 0",
      (field) => {
        const doc = buildDbResult(completedEvent(), "croco", false) as Record<
          string,
          unknown
        >;
        expect(field in doc).toBe(false);
      },
    );

    it("omits isPb when the result is not a personal best", () => {
      const doc = buildDbResult(completedEvent(), "croco", false);
      expect("isPb" in doc).toBe(false);
    });

    it("keeps isPb when the result is a personal best", () => {
      const doc = buildDbResult(completedEvent(), "croco", true);
      expect(doc.isPb).toBe(true);
    });

    it.each([
      ["restartCount", 3],
      ["incompleteTestSeconds", 12],
      ["afkDuration", 45],
    ] as const)("keeps %s when it is %i", (field, value) => {
      const doc = buildDbResult(
        completedEvent({ [field]: value }),
        "croco",
        false,
      ) as Record<string, unknown>;
      expect(doc[field]).toBe(value);
    });

    it("a compressed document still parses", () => {
      expect(ResultSchema.safeParse(onTheWire(completedEvent())).success).toBe(
        true,
      );
    });
  });

  it("mints a fresh _id per call", () => {
    const a = buildDbResult(completedEvent(), "croco", false);
    const b = buildDbResult(completedEvent(), "croco", false);
    expect(a._id.equals(b._id)).toBe(false);
  });

  it("does not mutate the event it was given", () => {
    const event = completedEvent();
    const before = JSON.stringify(event);
    buildDbResult(event, "croco", true);
    expect(JSON.stringify(event)).toBe(before);
  });

  it("BL-5 — persists a low accuracy without floor or clamp", () => {
    for (const acc of [0, 12.5, 45, 49.9]) {
      const doc = buildDbResult(completedEvent({ acc }), "croco", false);
      expect(doc.acc).toBe(acc);
    }
  });

  it("C40 — persists a negative score", () => {
    const doc = buildDbResult(
      completedEvent({ score: -12, correct: 4, wrong: 16 }),
      "croco",
      false,
    );
    expect(doc.score).toBe(-12);
  });
});
