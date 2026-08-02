/**
 * The event-log recorder (INV-089, INV-197).
 *
 * monkeytype kept five parallel arrays plus a pressed-key map because it had to
 * reconstruct a word from raw key events. croco calc's engine already owns the
 * authoritative task log (ME-159), so this module is what it always should have
 * been: an append-only, timestamped stream for replay and debugging.
 *
 * `buildEventLog()` is reachable from the console as `currentEventLog()`
 * (`src/ts/index.ts`). It is therefore held to master C29: nothing it emits
 * contains the answer of any task, committed or not.
 */

import { isSafeNumber, roundTo2 } from "@croco-calc/util/numbers";

import { EVENT_LOG_VERSION } from "./types";
import type {
  EventLog,
  EventLogContext,
  TestEvent,
  TestEventData,
  TestEventNoMs,
  TestEventType,
} from "./types";

let events: TestEvent[] = [];
let cached: TestEventNoMs[] | undefined;
let context: EventLogContext | undefined;

/** Ordering tiebreak when two events land on the same millisecond. */
const sortTieRank = (type: TestEventType): number =>
  type === "taskShown" ? 0 : type === "answerSubmitted" ? 1 : 2;

export function logTestEvent(
  type: TestEventType,
  now: number,
  data: TestEventData,
): void {
  cached = undefined;
  const ms = roundTo2(now);
  if (!isSafeNumber(ms)) {
    throw new Error(`Invalid timestamp: ${String(now)}`);
  }
  events.push({ type, ms, testMs: 0, data } as TestEvent);
}

/** Called by `test-logic.ts` on restart, so a run never inherits stale events. */
export function resetTestEvents(): void {
  events = [];
  cached = undefined;
  context = undefined;
}

/** Recorded at test start so a dumped log is self-contained and reproducible. */
export function setEventLogContext(next: EventLogContext): void {
  context = next;
}

export function getAllTestEvents(): TestEventNoMs[] {
  if (cached !== undefined) return cached;
  const first = events[0];
  if (first === undefined) {
    cached = [];
    return cached;
  }

  const start =
    events.find((e) => e.type === "timer" && e.data.event === "start")?.ms ??
    first.ms;

  cached = [...events]
    .sort((a, b) => a.ms - b.ms || sortTieRank(a.type) - sortTieRank(b.type))
    .map(
      (event) =>
        ({
          type: event.type,
          testMs: roundTo2(event.ms - start),
          data: event.data,
        }) as TestEventNoMs,
    );
  return cached;
}

const EMPTY_CONTEXT: EventLogContext = {
  targetPrompts: [],
  mode: "time",
  mode2: "0",
  mathSeed: 0,
  settingsId: "",
};

export function buildEventLog(): EventLog {
  return {
    version: EVENT_LOG_VERSION,
    events: getAllTestEvents(),
    context: context ?? EMPTY_CONTEXT,
  };
}

export function logEventsDataToTheConsoleTable(): void {
  console.table(
    getAllTestEvents().map((event) => ({
      type: event.type,
      testMs: event.testMs,
      ...event.data,
    })),
  );
}
