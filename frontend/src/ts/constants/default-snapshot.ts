import { User, UserProfileDetails } from "@croco-calc/schemas/users";
import { Mode } from "@croco-calc/schemas/shared";
import { Result } from "@croco-calc/schemas/results";
import {
  ModifiableTestActivityCalendar,
  TestActivityCalendar,
} from "../elements/test-activity-calendar";

/**
 * A result as the account page consumes it: every field the API strips when it
 * equals its default has been filled back in, plus three values derived once at
 * normalisation time so the table, the charts and the aggregations can sort and
 * group on them directly.
 *
 * The upstream item count (an estimate derived from the speed metric) becomes
 * `tasks` (`correct + wrong`, exact — AC-092/AC-093), and the time-on-task
 * field becomes `timeSpent` (AC-013, AC-014). Every prose-mode field —
 * `bailedOut`, `blindMode`, `lazyMode`, `difficulty`, `funbox`, `language`,
 * `numbers`, `punctuation`, the prompt-length field — and `tags` are all gone
 * (master C15, C38, C41; AC-016, AC-079, AC-187).
 */
export type SnapshotResult<M extends Mode> = Omit<
  Result<M>,
  "restartCount" | "incompleteTestSeconds" | "afkDuration" | "isPb"
> & {
  restartCount: number;
  incompleteTestSeconds: number;
  /** persisted as `afkDuration`, displayed as `idle` (master C37) */
  afkDuration: number;
  isPb: boolean;
  //calculated values
  /** `correct + wrong` — the number the totals block calls "tasks answered". */
  tasks: number;
  /** seconds of the test plus its restarts, minus idle time (AC-013). */
  timeSpent: number;
  dayTimestamp: number;
};

/**
 * The local mirror of the user document.
 *
 * Streaks (master C17), badges/`inventory` (master C16), premium (AC-017),
 * tags (master C15), config presets (master C18) and every Discord field
 * (AC-047, AC-167) are removed. The upstream aggregate stats block becomes
 * `testStats`, carrying `timeSpent` (AC-013, AC-014).
 */
export type Snapshot = Omit<
  User,
  | "timeSpent"
  | "startedTests"
  | "completedTests"
  | "profileDetails"
  | "customThemes"
  | "xp"
  | "testActivity"
> & {
  testStats: {
    timeSpent: number;
    startedTests: number;
    completedTests: number;
  };
  details?: UserProfileDetails;
  inboxUnreadSize: number;
  xp: number;
  testActivity?: ModifiableTestActivityCalendar;
  testActivityByYear?: { [key: string]: TestActivityCalendar };
  isMiniSnapshot?: never;
};

const defaultSnap = {
  personalBests: {
    time: {},
  },
  name: "",
  email: "",
  uid: "",
  banned: undefined,
  verified: undefined,
  lbMemory: { time: { "4": 0, "8": 0 } },
  testStats: {
    timeSpent: 0,
    startedTests: 0,
    completedTests: 0,
  },
  addedAt: 0,
  xp: 0,
  inboxUnreadSize: 0,
  allTimeLbs: {
    time: {
      "4": { count: 0, rank: 0 },
      "8": { count: 0, rank: 0 },
    },
  },
} as Snapshot;

export function getDefaultSnapshot(): Snapshot {
  return structuredClone(defaultSnap);
}
