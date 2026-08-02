const flags: UserFlag[] = [
  {
    name: "Premium",
    description: "Paying for a monthly subscription",
    icon: "ph:currency-dollar-bold",
    test: (it) => it.isPremium === true,
  },
  {
    name: "Banned",
    description: "This account is banned",
    icon: "ph:gavel-bold",
    color: "var(--error-color)",
    test: (it) => it.banned === true,
  },
  {
    name: "LbOptOut",
    description: "This account has opted out of leaderboards",
    icon: "ph:crown-bold",
    color: "var(--error-color)",
    test: (it) => it.lbOptOut === true,
  },
  {
    name: "Friend",
    description: "Friend :)",
    icon: "ph:users-bold",
    test: (it) => it.isFriend === true,
  },
];

export type SupportsFlags = {
  isPremium?: boolean;
  banned?: boolean;
  lbOptOut?: boolean;
  isFriend?: boolean;
};

export type UserFlag = {
  readonly name: string;
  readonly description: string;
  /** An iconify `set:name` id (CP-002, C10). */
  readonly icon: string;
  readonly color?: string;
  readonly background?: string;
  test(source: SupportsFlags): boolean;
};

export type UserFlagOptions = {
  iconsOnly?: boolean;
  isFriend?: boolean;
};

const USER_FLAG_OPTIONS_DEFAULT: UserFlagOptions = {
  iconsOnly: false,
};

export function getMatchingFlags(source: SupportsFlags): UserFlag[] {
  const result = flags.filter((it) => it.test(source));
  return result;
}
/**
 * The string form used by the screenshot watermark, which composes raw HTML and
 * therefore cannot mount the solid `Icon` component. Font awesome's `<i>` glyph
 * is gone (CP-001), so the flag renders as its name instead of an icon.
 */
function toHtml(flag: UserFlag, formatOptions: UserFlagOptions): string {
  const label = `<span class="flag-name">${flag.name}</span>`;

  if (formatOptions.iconsOnly) {
    return label;
  }

  const style = [];
  if (flag.background !== undefined) {
    style.push(`background: ${flag.background};`);
  }
  if (flag?.color !== undefined) {
    style.push(`color: ${flag.color};`);
  }

  const balloon = `aria-label="${flag.description}" data-balloon-pos="right"`;

  return `<div class="flag" ${balloon} style="${style.join("")}">${label}</div>`;
}

export function getHtmlByUserFlags(
  source: SupportsFlags,
  options?: UserFlagOptions,
): string {
  const formatOptions = { ...USER_FLAG_OPTIONS_DEFAULT, ...options };
  return getMatchingFlags(source)
    .map((it) => toHtml(it, formatOptions))
    .join("");
}
