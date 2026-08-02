import * as Numbers from "@croco-calc/util/numbers";
import { Config as ConfigType } from "@croco-calc/schemas/configs";

export type FormatOptions = {
  showDecimalPlaces?: boolean;
  suffix?: string;
  rounding?: (val: number) => number;
} & FallbackOptions;

const FORMAT_DEFAULT_OPTIONS: FormatOptions = {
  suffix: "",
  fallback: "-",
  showDecimalPlaces: undefined,
  rounding: Math.round,
};

export type FallbackOptions = {
  fallback?: string;
};

type FormatConfig = Pick<ConfigType, "alwaysShowDecimalPlaces">;

export class Formatting {
  private config: FormatConfig;

  constructor(config: FormatConfig) {
    this.config = config;
  }

  /**
   * CP-142 — `score`: correct tasks minus wrong tasks. Can be negative, and is
   * always a whole number, so it ignores `alwaysShowDecimalPlaces`.
   *
   * ME-161 / C33 — a negative score displays with U+2212 MINUS SIGN, not the
   * U+002D hyphen `Number.prototype.toString` produces. The substitution lives
   * here rather than in {@link number} because `number` also feeds `acc`,
   * `tpm`, `consistency` and `percentage`: none of those is ever displayed
   * negative, and a U+2212 leaking into one of them could reach something that
   * later parses the string. `score` is the only signed display value.
   *
   * Callers that need the machine-readable form (a `data-` attribute, a CSV
   * cell, a sort key) must use the raw number, not this string.
   */
  score(
    score: number | null | undefined,
    formatOptions: FormatOptions = {},
  ): string {
    const options = { ...FORMAT_DEFAULT_OPTIONS, ...formatOptions };
    if (score === undefined || score === null) return options.fallback ?? "";

    const formatted = this.number(score, {
      ...options,
      showDecimalPlaces: false,
    });
    // `number` always emits the sign first, so only a leading hyphen is the
    // minus sign — a hyphen anywhere else belongs to a caller-supplied suffix.
    return formatted.startsWith("-") ? `−${formatted.slice(1)}` : formatted;
  }

  /**
   * CP-142 — `tpm`: tasks per minute. Replaces the deleted keystroke-rate unit
   * system (INV-118c), so croco calc has exactly one speed unit.
   */
  tpm(
    tpm: number | null | undefined,
    formatOptions: FormatOptions = {},
  ): string {
    const options = { ...FORMAT_DEFAULT_OPTIONS, ...formatOptions };
    if (tpm === undefined || tpm === null) return options.fallback ?? "";

    return this.number(tpm, options);
  }

  percentage(
    percentage: number | null | undefined,
    formatOptions: FormatOptions = {},
  ): string {
    const options = { ...FORMAT_DEFAULT_OPTIONS, ...formatOptions };
    options.suffix = `%${options.suffix ?? ""}`;

    return this.number(percentage, options);
  }

  accuracy(
    accuracy: number | null | undefined,
    formatOptions: FormatOptions = {},
  ): string {
    return this.percentage(accuracy, {
      rounding: Math.floor,
      ...formatOptions,
    });
  }

  decimals(
    value: number | null | undefined,
    formatOptions: FormatOptions = {},
  ): string {
    const options = { ...FORMAT_DEFAULT_OPTIONS, ...formatOptions };
    return this.number(value, options);
  }

  private number(
    value: number | null | undefined,
    formatOptions: FormatOptions,
  ): string {
    if (value === undefined || value === null) {
      return formatOptions.fallback ?? "";
    }
    const suffix = formatOptions.suffix ?? "";

    if (
      formatOptions.showDecimalPlaces ??
      this.config.alwaysShowDecimalPlaces
    ) {
      return Numbers.roundTo2(value).toFixed(2) + suffix;
    }
    return (formatOptions.rounding ?? Math.round)(value).toString() + suffix;
  }

  rank(
    position: number | null | undefined,
    formatOptions: FallbackOptions = {},
  ): string {
    const options = { fallback: "-", ...formatOptions };

    if (position === undefined || position === null) {
      return options.fallback ?? "";
    }
    let numend = "th";
    const t = position % 10;
    const h = position % 100;
    if (t === 1 && h !== 11) {
      numend = "st";
    }
    if (t === 2 && h !== 12) {
      numend = "nd";
    }
    if (t === 3 && h !== 13) {
      numend = "rd";
    }
    return position + numend;
  }
}
