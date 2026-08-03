import { z, ZodSchema } from "zod";
import * as Themes from "./themes";
import {
  AdditionSchema,
  DivisionSchema,
  FractionAdditionSchema,
  MultiplicationSchema,
  TestTimeSchema,
} from "./math";

export const QuickRestartSchema = z.enum(["off", "esc", "tab", "enter"]);
export type QuickRestart = z.infer<typeof QuickRestartSchema>;

export const TimerStyleSchema = z.enum([
  "off",
  "bar",
  "text",
  "mini",
  "flash_text",
  "flash_mini",
]);
export type TimerStyle = z.infer<typeof TimerStyleSchema>;

/** Drives the live tpm (`liveSpeedStyle`) and live acc (`liveAccStyle`) readouts (CP-078, master C13). */
export const LiveStatStyleSchema = z.enum(["off", "text", "mini"]);
export type LiveStatStyle = z.infer<typeof LiveStatStyleSchema>;

export const RandomThemeSchema = z.enum([
  "off",
  "on",
  "fav",
  "light",
  "dark",
  "custom",
  "auto",
]);
export type RandomTheme = z.infer<typeof RandomThemeSchema>;

export const TimerColorSchema = z.enum(["black", "sub", "text", "main"]);
export type TimerColor = z.infer<typeof TimerColorSchema>;

export const TimerOpacitySchema = z.enum(["0.25", "0.5", "0.75", "1"]);
export type TimerOpacity = z.infer<typeof TimerOpacitySchema>;

export const SingleListCommandLineSchema = z.enum(["manual", "on"]);
export type SingleListCommandLine = z.infer<typeof SingleListCommandLineSchema>;

/**
 * Five toggles, one per account-page chart series (AC-085 adds `Per minute` to
 * monkeytype's four). Stored four-element arrays are padded with a fifth `"on"`
 * at read time by the config layer.
 */
export const AccountChartSchema = z.tuple([
  z.enum(["on", "off"]),
  z.enum(["on", "off"]),
  z.enum(["on", "off"]),
  z.enum(["on", "off"]),
  z.enum(["on", "off"]),
]);
export type AccountChart = z.infer<typeof AccountChartSchema>;

export const CustomBackgroundSizeSchema = z.enum(["cover", "contain", "max"]);
export type CustomBackgroundSize = z.infer<typeof CustomBackgroundSizeSchema>;

export const CustomBackgroundFilterSchema = z.tuple([
  z.number(),
  z.number(),
  z.number(),
  z.number(),
]);
export type CustomBackgroundFilter = z.infer<
  typeof CustomBackgroundFilterSchema
>;

export const ShowAverageSchema = z.enum(["off", "speed", "acc", "both"]);
export type ShowAverage = z.infer<typeof ShowAverageSchema>;

export const ShowPbSchema = z.boolean();
export type ShowPb = z.infer<typeof ShowPbSchema>;

export const ColorHexValueSchema = z.string().regex(/^#([\da-f]{3}){1,2}$/i);
export type ColorHexValue = z.infer<typeof ColorHexValueSchema>;

export const CustomThemeColorsSchema = z.tuple([
  ColorHexValueSchema,
  ColorHexValueSchema,
  ColorHexValueSchema,
  ColorHexValueSchema,
  ColorHexValueSchema,
  ColorHexValueSchema,
  ColorHexValueSchema,
  ColorHexValueSchema,
  ColorHexValueSchema,
  ColorHexValueSchema,
]);
export type CustomThemeColors = z.infer<typeof CustomThemeColorsSchema>;

export const ThemeNameSchema = Themes.ThemeNameSchema;
export type ThemeName = z.infer<typeof ThemeNameSchema>;

export const FavThemesSchema = z.array(ThemeNameSchema);
export type FavThemes = z.infer<typeof FavThemesSchema>;

/**
 * INV-064 reduces the font catalogue to a short hard-coded list owned by the
 * frontend; the schema only constrains the shape of the name.
 */
export const FontNameSchema = z
  .string()
  .max(50)
  .regex(/^[a-zA-Z0-9_\-+.]+$/);
export type FontName = z.infer<typeof FontNameSchema>;

export const FontSizeSchema = z.number().positive();
export type FontSize = z.infer<typeof FontSizeSchema>;

export const MaxLineWidthSchema = z.number().min(20).max(1000).or(z.literal(0));
export type MaxLineWidth = z.infer<typeof MaxLineWidthSchema>;

export const CustomBackgroundSchema = z
  .string()
  .url("Needs to be an URI")
  .regex(/^(https|http):\/\/.*/, "Unsupported protocol")
  .regex(/^[^`'"]*$/, "May not contain quotes")
  .regex(/.+(\.png|\.gif|\.jpeg|\.jpg|\.webp)/gi, "Unsupported image format")
  .max(2048, "URL is too long")
  .or(z.literal(""));
export type CustomBackground = z.infer<typeof CustomBackgroundSchema>;

/**
 * The complete croco calc config (§6.1 of the master document): the eight
 * settings-bar keys plus the retained appearance/behaviour keys. Nothing else.
 */
export const ConfigSchema = z
  .object({
    // test — the eight settings-bar controls (SB-010, SB-130, master C2/C3)
    addition: AdditionSchema,
    multiplication: MultiplicationSchema,
    division: DivisionSchema,
    fractionAddition: FractionAdditionSchema,
    fractionMultiplication: z.boolean(),
    decimals: z.boolean(),
    negatives: z.boolean(),
    time: TestTimeSchema,

    // behavior
    quickRestart: QuickRestartSchema,
    resultSaving: z.boolean(),
    singleListCommandLine: SingleListCommandLineSchema,

    // appearance
    timerStyle: TimerStyleSchema,
    liveSpeedStyle: LiveStatStyleSchema,
    liveAccStyle: LiveStatStyleSchema,
    timerColor: TimerColorSchema,
    timerOpacity: TimerOpacitySchema,
    alwaysShowDecimalPlaces: z.boolean(),
    startGraphsAtZero: z.boolean(),
    maxLineWidth: MaxLineWidthSchema,
    fontSize: FontSizeSchema,
    fontFamily: FontNameSchema,

    // theme
    flipTestColors: z.boolean(),
    colorfulMode: z.boolean(),
    customBackground: CustomBackgroundSchema,
    customBackgroundSize: CustomBackgroundSizeSchema,
    customBackgroundFilter: CustomBackgroundFilterSchema,
    autoSwitchTheme: z.boolean(),
    themeLight: ThemeNameSchema,
    themeDark: ThemeNameSchema,
    randomTheme: RandomThemeSchema,
    favThemes: FavThemesSchema,
    theme: ThemeNameSchema,
    customTheme: z.boolean(),
    customThemeColors: CustomThemeColorsSchema,

    // hide elements
    showKeyTips: z.boolean(),
    showOutOfFocusWarning: z.boolean(),
    showAverage: ShowAverageSchema,
    showPb: ShowPbSchema,

    // other (hidden)
    accountChart: AccountChartSchema,
  } satisfies Record<string, ZodSchema>)
  .strict();

export type Config = z.infer<typeof ConfigSchema>;
export const ConfigKeySchema = ConfigSchema.keyof();
export type ConfigKey = z.infer<typeof ConfigKeySchema>;
export type ConfigValue = Config[keyof Config];

export const PartialConfigSchema = ConfigSchema.partial();
export type PartialConfig = z.infer<typeof PartialConfigSchema>;

export const ConfigGroupNameSchema = z.enum([
  "test",
  "behavior",
  "appearance",
  "theme",
  "hideElements",
  "hidden",
]);
export type ConfigGroupName = z.infer<typeof ConfigGroupNameSchema>;

/** The eight keys backing the settings bar (SB-010). All carry `group: "test"` (SB-130). */
export const TEST_CONFIG_KEYS = [
  "addition",
  "multiplication",
  "division",
  "fractionAddition",
  "fractionMultiplication",
  "decimals",
  "negatives",
  "time",
] as const satisfies readonly ConfigKey[];
