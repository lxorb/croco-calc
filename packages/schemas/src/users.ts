import { z, ZodEffects, ZodOptional, ZodString } from "zod";
import { IdSchema, nameWithSeparators, slug, StringNumberSchema } from "./util";
import {
  Mode2Schema,
  ModeSchema,
  PersonalBestsSchema,
  PersonalBestSchema,
} from "./shared";
import { CustomThemeColorsSchema } from "./configs";
import {
  AdditionSchema,
  DivisionSchema,
  FractionAdditionSchema,
  MultiplicationSchema,
} from "./math";
import { doesNotContainDisallowedWords } from "./validation/validation";
import { ConnectionSchema } from "./connections";

export const ResultFilterPresetNameSchema = slug().max(16);

const OnOffFilterSchema = z
  .object({
    on: z.boolean(),
    off: z.boolean(),
  })
  .strict();

/**
 * AC-078 / AC-081: the filter dimensions are the croco calc settings plus `time`,
 * `pb` and `date`, and nothing else (AC-079). Keys are the C2 canonical **stored**
 * literals, never the display labels — persisting labels would make every stored
 * filter fail to match every stored result.
 */
export const ResultFiltersSchema = z.object({
  _id: IdSchema,
  name: ResultFilterPresetNameSchema,
  pb: z
    .object({
      no: z.boolean(),
      yes: z.boolean(),
    })
    .strict(),
  time: z.record(Mode2Schema, z.boolean()),
  addition: z.record(AdditionSchema, z.boolean()),
  multiplication: z.record(MultiplicationSchema, z.boolean()),
  division: z.record(DivisionSchema, z.boolean()),
  fractionAddition: z.record(FractionAdditionSchema, z.boolean()),
  fractionMultiplication: OnOffFilterSchema,
  decimals: OnOffFilterSchema,
  negatives: OnOffFilterSchema,
  date: z
    .object({
      last_day: z.boolean(),
      last_week: z.boolean(),
      last_month: z.boolean(),
      last_3months: z.boolean(),
      all: z.boolean(),
    })
    .strict(),
});
export type ResultFilters = z.infer<typeof ResultFiltersSchema>;
export type ResultFiltersKeys = keyof Omit<ResultFilters, "_id" | "name">;

function profileDetailsBase(
  schema: ZodString,
): ZodEffects<ZodOptional<ZodEffects<ZodString>>> {
  return doesNotContainDisallowedWords("word", schema)
    .optional()
    .transform((value) => (value === null ? undefined : value));
}

export const TwitterProfileSchema = profileDetailsBase(slug().max(15)).or(
  z.literal(""),
);

export const GithubProfileSchema = profileDetailsBase(slug().max(39)).or(
  z.literal(""),
);

export const WebsiteSchema = profileDetailsBase(
  z.string().url().max(200).startsWith("https://"),
).or(z.literal(""));

/** AC-052: `bio` plus socials. monkeytype's `keyboard` field is dropped. */
export const UserProfileDetailsSchema = z
  .object({
    bio: profileDetailsBase(z.string().max(250)).or(z.literal("")),
    socialProfiles: z
      .object({
        twitter: TwitterProfileSchema,
        github: GithubProfileSchema,
        website: WebsiteSchema,
      })
      .strict()
      .optional(),
    showActivityOnPublicProfile: z.boolean().optional(),
  })
  .strict();
export type UserProfileDetails = z.infer<typeof UserProfileDetailsSchema>;

export const CustomThemeNameSchema = nameWithSeparators().max(16);
export type CustomThemeName = z.infer<typeof CustomThemeNameSchema>;

export const CustomThemeSchema = z
  .object({
    _id: IdSchema,
    name: CustomThemeNameSchema,
    colors: CustomThemeColorsSchema,
  })
  .strict();
export type CustomTheme = z.infer<typeof CustomThemeSchema>;

/** AC-113: leaderboard ids are keyed by mode and mode2 alone. */
export const UserLbMemorySchema = z.record(
  ModeSchema,
  z.record(Mode2Schema, z.number().int().nonnegative()),
);
export type UserLbMemory = z.infer<typeof UserLbMemorySchema>;

export const RankAndCountSchema = z.object({
  rank: z.number().int().nonnegative().optional(),
  count: z.number().int().nonnegative(),
});
export type RankAndCount = z.infer<typeof RankAndCountSchema>;

export const AllTimeLbsSchema = z.object({
  time: z.record(Mode2Schema, RankAndCountSchema.optional()),
});
export type AllTimeLbs = z.infer<typeof AllTimeLbsSchema>;

export const TestActivitySchema = z
  .object({
    testsByDays: z
      .array(z.number().int().nonnegative().or(z.null()))
      .describe(
        "Number of tests by day. Last element of the array is on the date `lastDay`. `null` means no tests on that day.",
      ),
    lastDay: z
      .number()
      .int()
      .nonnegative()
      .describe("Timestamp of the last day included in the test activity"),
  })
  .strict();
export type TestActivity = z.infer<typeof TestActivitySchema>;

export const CountByYearAndDaySchema = z.record(
  StringNumberSchema.describe("year"),
  z.array(
    z
      .number()
      .int()
      .nonnegative()
      .nullable()
      .describe(
        "number of tests, position in the array is the day of the year",
      ),
  ),
);
export type CountByYearAndDay = z.infer<typeof CountByYearAndDaySchema>;

export const UserEmailSchema = z.string().email();

/**
 * username schema without profanity check
 */
export const UserNameWithoutFilterSchema = slug().min(1).max(16);

/**
 * username schema with profanity check
 */
export const UserNameSchema = doesNotContainDisallowedWords(
  "substring",
  UserNameWithoutFilterSchema,
);

export const UserSchema = z.object({
  name: UserNameSchema,
  email: UserEmailSchema,
  uid: z.string(), //defined by firebase, no validation should be applied
  addedAt: z.number().int().nonnegative(),
  personalBests: PersonalBestsSchema,
  lastReultHashes: z.array(z.string()).optional(), //TODO: fix typo (it's in the db too)
  completedTests: z.number().int().nonnegative().optional(),
  startedTests: z.number().int().nonnegative().optional(),
  /** AC-013: monkeytype's `timeTyping`, renamed (AC-014). */
  timeSpent: z
    .number()
    .nonnegative()
    .optional()
    .describe("time spent solving, in seconds"),
  xp: z.number().int().nonnegative().optional(),
  profileDetails: UserProfileDetailsSchema.optional(),
  customThemes: z.array(CustomThemeSchema).optional(),
  lbMemory: UserLbMemorySchema.optional(),
  allTimeLbs: AllTimeLbsSchema,
  banned: z.boolean().optional(),
  lbOptOut: z.boolean().optional(),
  verified: z.boolean().optional(),
  needsToChangeName: z.boolean().optional(),
  resultFilterPresets: z.array(ResultFiltersSchema).optional(),
  testActivity: TestActivitySchema.optional(),
});
export type User = z.infer<typeof UserSchema>;

export type ResultFiltersGroup = keyof ResultFilters;

export type ResultFiltersGroupItem<T extends ResultFiltersGroup> =
  keyof ResultFilters[T];

/** monkeytype's `TypingStatsSchema`, renamed with the AC-014 vocabulary. */
export const TestStatsSchema = z.object({
  completedTests: z.number().int().nonnegative().optional(),
  startedTests: z.number().int().nonnegative().optional(),
  timeSpent: z.number().int().nonnegative().optional(),
});
export type TestStats = z.infer<typeof TestStatsSchema>;

export const UserProfileSchema = UserSchema.pick({
  uid: true,
  name: true,
  banned: true,
  addedAt: true,
  xp: true,
  lbOptOut: true,
  allTimeLbs: true,
  testActivity: true,
})
  .extend({
    testStats: TestStatsSchema,
    personalBests: PersonalBestsSchema.pick({ time: true }),
    details: UserProfileDetailsSchema,
  })
  .partial({
    //omitted for banned users
    details: true,
    allTimeLbs: true,
    uid: true,
  });
export type UserProfile = z.infer<typeof UserProfileSchema>;

/** Badges are cut (master C16), so XP is the only reward kind. */
export const RewardTypeSchema = z.enum(["xp"]);
export type RewardType = z.infer<typeof RewardTypeSchema>;

export const XpRewardSchema = z.object({
  type: z.literal(RewardTypeSchema.enum.xp),
  item: z.number().int(),
});
export type XpReward = z.infer<typeof XpRewardSchema>;

export const AllRewardsSchema = XpRewardSchema;
export type AllRewards = z.infer<typeof AllRewardsSchema>;

/** The in-app inbox message. monkeytype's `MonkeyMail`, renamed with INV-139. */
export const CrocoMailSchema = z.object({
  id: IdSchema,
  subject: z.string(),
  body: z.string(),
  timestamp: z.number().int().nonnegative(),
  read: z.boolean(),
  rewards: z.array(AllRewardsSchema),
});
export type CrocoMail = z.infer<typeof CrocoMailSchema>;

export const ReportUserReasonSchema = z.enum([
  "Inappropriate name",
  "Inappropriate bio",
  "Inappropriate social links",
  "Suspected cheating",
]);
export type ReportUserReason = z.infer<typeof ReportUserReasonSchema>;

// stricter schema used while password creation
export const NewPasswordSchema = z
  .string()
  .min(8, { message: "must be at least 8 characters" })
  .max(64, { message: "must be at most 64 characters" })
  .regex(/[A-Z]/, { message: "must contain at least one capital letter" })
  .regex(/[\d]/, { message: "must contain at least one number" })
  .regex(/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/, {
    message: "must contain at least one special character",
  });
export type NewPassword = z.infer<typeof NewPasswordSchema>;

// lenient schema for existing passwords
export const PasswordSchema = z.string().min(1, "Required");
export type Password = z.infer<typeof PasswordSchema>;

/** AC-148: the friends table shows the time-4 and time-8 personal bests. */
export const FriendSchema = UserSchema.pick({
  uid: true,
  name: true,
  startedTests: true,
  completedTests: true,
  timeSpent: true,
  xp: true,
  banned: true,
  lbOptOut: true,
})
  .extend({
    connectionId: IdSchema.optional(),
    top4: PersonalBestSchema.optional(),
    top8: PersonalBestSchema.optional(),
  })
  .merge(ConnectionSchema.pick({ lastModified: true }).partial());

export type Friend = z.infer<typeof FriendSchema>;
