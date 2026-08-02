import { z } from "zod";
import {
  IdSchema,
  PercentageSchema,
  ScoreSchema,
  TasksPerMinuteSchema,
  token,
} from "./util";
import { Mode, Mode2, Mode2Schema, ModeSchema } from "./shared";
import {
  MathGeneratorSettingsSchema,
  MathSettingsSchema,
  SettingsIdSchema,
  TaskKindSchema,
} from "./math";

export const IncompleteTestSchema = z.object({
  acc: PercentageSchema,
  seconds: z.number().nonnegative(),
});
export type IncompleteTest = z.infer<typeof IncompleteTestSchema>;

/**
 * One data point per elapsed second (CP-113). The cap is 481 — indices 0…480
 * inclusive, covering the longest (8-minute) test. monkeytype's 122 was its own
 * 120 s maximum plus slack (master C7).
 */
export const CHART_DATA_MAX_POINTS = 481;

export const ChartDataSchema = z.object({
  /** cumulative `correct - wrong` after each second (CP-114) */
  score: z.array(z.number().int()).max(CHART_DATA_MAX_POINTS),
  /** running-average tasks per minute (CP-115) */
  tpm: z.array(z.number().nonnegative()).max(CHART_DATA_MAX_POINTS),
  /** wrong answers committed in each second (CP-116) */
  wrong: z.array(z.number().int().nonnegative()).max(CHART_DATA_MAX_POINTS),
});
export type ChartData = z.infer<typeof ChartDataSchema>;

/** ME-159: one entry per committed task. */
export const TaskLogEntrySchema = z
  .object({
    i: z.number().int().nonnegative(),
    kind: TaskKindSchema,
    prompt: z.string().max(64),
    /** the canonical exact answer */
    expected: z.string().max(64),
    /** the normalised input the user committed */
    given: z.string().max(64),
    correct: z.boolean(),
    /** ms from test start */
    tStart: z.number().nonnegative(),
    /** ms from test start */
    tEnd: z.number().nonnegative(),
  })
  .strict();
export type TaskLogEntry = z.infer<typeof TaskLogEntrySchema>;

export const TASK_LOG_MAX_ENTRIES = 1000;

/**
 * ME-176: degrades to the literal `"toolong"` past 1000 entries, following the
 * precedent monkeytype set for its key-timing arrays. Server-side revalidation
 * then falls back to a deterministic sample of 50 indices.
 */
export const TaskLogSchema = z
  .array(TaskLogEntrySchema)
  .max(TASK_LOG_MAX_ENTRIES)
  .or(z.literal("toolong"));
export type TaskLog = z.infer<typeof TaskLogSchema>;

const ResultBaseSchema = z.object({
  /** AC-003 (master C40): `correct - wrong`, the headline metric. MAY be negative. */
  score: ScoreSchema,
  correct: z.number().int().nonnegative(),
  wrong: z.number().int().nonnegative(),
  /**
   * AC-004: `correct / (correct + wrong) * 100`, `0` when nothing was answered.
   * There is deliberately no lower bound — a math trainer legitimately scores
   * below 50 % and monkeytype's `.min(50)` silently discarded genuine runs (BL-5).
   */
  acc: PercentageSchema,
  /** AC-005: `(correct + wrong) / (testDuration / 60)` */
  tpm: TasksPerMinuteSchema,
  /** AC-006: `score / (testDuration / 60)`, so runs of different lengths share an axis. MAY be negative. */
  spm: z.number(),
  /** ME-165 (master C5): kogasa over per-task response times. */
  consistency: PercentageSchema,
  mode: ModeSchema,
  mode2: Mode2Schema,
  timestamp: z.number().int().nonnegative(),
  testDuration: z.number().min(1),
  chartData: ChartDataSchema.or(z.literal("toolong")),
  uid: IdSchema,
  /** AC-009: the seven task-shaping settings, as C2 canonical stored literals. */
  settings: MathGeneratorSettingsSchema,
  /** SB-170 (master C4): immutable once written, never recomputed on read (SB-178). */
  settingsId: SettingsIdSchema,

  //required on POST but optional in the database and might be removed to save space
  restartCount: z.number().int().nonnegative().optional(),
  incompleteTestSeconds: z.number().nonnegative().optional(),
  /** persisted as `afkDuration`, displayed as `idle` (master C37) */
  afkDuration: z.number().nonnegative().optional(),
});

export const ResultSchema = ResultBaseSchema.extend({
  _id: IdSchema,
  name: z.string(),
  isPb: z.boolean().optional(), //true or undefined
});

export type Result<M extends Mode> = Omit<
  z.infer<typeof ResultSchema>,
  "mode" | "mode2"
> & {
  mode: M;
  mode2: Mode2<M>;
};

export const ResultMinifiedSchema = ResultSchema.omit({
  name: true,
  chartData: true,
});
export type ResultMinified = z.infer<typeof ResultMinifiedSchema>;

export const CompletedEventSchema = ResultBaseSchema.required({
  restartCount: true,
  incompleteTestSeconds: true,
  afkDuration: true,
})
  .extend({
    hash: token().max(100),
    /** ME-169: uint32 drawn from `crypto.getRandomValues` at test start. */
    mathSeed: z.number().int().nonnegative().max(4294967295),
    /** ME-173: the full eight-key snapshot the server regenerates the tasks from. */
    mathSettings: MathSettingsSchema,
    /** ME-177: the engine version the client generated with. */
    engineVersion: z.string().max(32),
    taskLog: TaskLogSchema,
    incompleteTests: z.array(IncompleteTestSchema),
  })
  .strict();

export type CompletedEvent = z.infer<typeof CompletedEventSchema>;

/** AC-036: exactly these keys, in this display order. */
export const XpBreakdownSchema = z.object({
  base: z.number().int().optional(),
  fullAccuracy: z.number().int().optional(),
  modes: z.number().int().optional(),
  accPenalty: z.number().int().optional(),
  configMultiplier: z.number().int().optional(),
  daily: z.number().int().optional(),
});
export type XpBreakdown = z.infer<typeof XpBreakdownSchema>;

export const PostResultResponseSchema = z.object({
  insertedId: IdSchema,
  isPb: z.boolean(),
  dailyLeaderboardRank: z.number().int().nonnegative().optional(),
  weeklyXpLeaderboardRank: z.number().int().nonnegative().optional(),
  xp: z.number().int().nonnegative(),
  dailyXpBonus: z.boolean(),
  xpBreakdown: XpBreakdownSchema,
});
export type PostResultResponse = z.infer<typeof PostResultResponseSchema>;

/**
 * AC-100: the CSV export contract. This header string is normative and is
 * consumed by the account page's export; the seven setting columns carry the C2
 * canonical stored literals so a re-imported CSV round-trips.
 */
export const RESULT_CSV_COLUMNS = [
  "_id",
  "isPb",
  "score",
  "correct",
  "wrong",
  "acc",
  "tpm",
  "spm",
  "mode2",
  "testDuration",
  "afkDuration",
  "restartCount",
  "addition",
  "multiplication",
  "division",
  "fractionAddition",
  "fractionMultiplication",
  "decimals",
  "negatives",
  "settingsId",
  "timestamp",
] as const;

export const RESULT_CSV_HEADER = RESULT_CSV_COLUMNS.join(",");
