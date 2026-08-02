import { z, ZodErrorMap, ZodString } from "zod";

export const StringNumberSchema = z
  .string()
  .regex(
    /^\d+$/,
    'Needs to be a number or a number represented as a string e.g. "10".',
  )
  .or(z.number().transform(String));
export type StringNumber = z.infer<typeof StringNumberSchema>;
export const token = (): ZodString => z.string().regex(/^[a-zA-Z0-9_]+$/);

export const slug = (): ZodString =>
  z
    .string()
    .regex(
      /^[0-9a-zA-Z_.-]+$/,
      "Only letters, numbers, underscores, dots and hyphens allowed",
    )
    .regex(/^[^.].*$/, "Cannot start with a dot");

export const nameWithSeparators = (): ZodString =>
  z
    .string()
    .regex(
      /^[0-9a-zA-Z_-]+$/,
      "Only letters, numbers, underscores and hyphens allowed",
    )
    .regex(
      /^[a-zA-Z0-9]+(?:[_-][a-zA-Z0-9]+)*$/,
      "Separators cannot be at the start or end, or appear multiple times in a row",
    );

export const IdSchema = token();
export type Id = z.infer<typeof IdSchema>;

export const NullableStringSchema = z
  .string()
  .nullable()
  .optional()
  .transform((value) => value ?? undefined);
export type NullableString = z.infer<typeof NullableStringSchema>;

export const PercentageSchema = z.number().nonnegative().max(100);
export type Percentage = z.infer<typeof PercentageSchema>;

/**
 * The headline croco calc metric, `correct - wrong` (AC-003, ME-161 as renamed by
 * master C40). It is an integer and MAY be negative, which is why it replaces
 * monkeytype's nonnegative-and-capped speed schema rather than reusing it.
 */
export const ScoreSchema = z.number().int();
export type Score = z.infer<typeof ScoreSchema>;

/** Tasks per minute — responses per minute, so it is never negative (AC-005). */
export const TasksPerMinuteSchema = z.number().nonnegative();
export type TasksPerMinute = z.infer<typeof TasksPerMinuteSchema>;

export function customEnumErrorHandler(message: string): ZodErrorMap {
  return (issue, _ctx) => ({
    message:
      issue.code === "invalid_enum_value"
        ? `Invalid enum value. ${message}`
        : (issue.message ?? "Required"),
  });
}

export const PageNumberSchema = z
  .number()
  .int()
  .safe()
  .nonnegative()
  .default(0);
