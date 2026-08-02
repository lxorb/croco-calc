/**
 * Generic string helpers.
 *
 * INV-118c keeps this module, but most of what used to live here served the
 * prose input pipeline and has no meaning for croco calc: an answer is a short
 * ASCII string of digits with at most one `.`, one `/` and a leading `-`
 * (CP-055 … CP-058, ME-133 … ME-151). There is no prose, no language catalogue
 * and no space separator, so the following are gone with the features that
 * needed them:
 *
 * - `getLanguageDisplayString`, `removeLanguageSize`, `LANGUAGE_EQUIVALENCE_SETS`
 *   — the language catalogue is deleted (INV-064; `@croco-calc/schemas/languages`
 *   no longer exists, which is what this file's last type error was).
 * - `isWordRightToLeft`, `hasRTLCharacters`, the direction cache — an answer is
 *   digits, which have no bidirectional behaviour.
 * - `areCharactersVisuallyEqual`, `CHAR_EQUIVALENCE_SETS`, `isSpace` — judging
 *   compares exact rationals (ME-068, ME-025), not glyphs, and the input filter
 *   rejects everything outside `[0-9./-]` before it can reach a comparison.
 * - `splitIntoCharacters` — answers are ASCII, so `String.prototype[i]` is safe;
 *   the astral-plane handling existed for prose.
 * - `cleanTypographySymbols`, `replaceControlCharacters` — no pasted prose.
 * - `countChars` / `CharCounts` — superseded by the score/correct/wrong counters
 *   (AC-003 … AC-006, CP-142).
 * - `getLastChar`, `replaceCharAt`, `splitByAndKeep`, `highlightMatches`,
 *   `camelCaseToWords`, `wordsToCamelCase` — unreferenced once the settings page
 *   (INV-116) and the generators above went.
 */

/**
 * Removes accents from a string, by decomposing to NFD and dropping the
 * combining diacritical marks block.
 * @param str The input string.
 * @returns A new string with accents removed.
 */
export function replaceSpecialChars(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // Remove accents
}

/**
 * Capitalizes the first letter of every space-separated segment.
 * @param str The input string.
 * @returns A new string with each segment's first letter capitalized.
 */
export function capitalizeEachSegment(str: string): string {
  return str
    .split(/ +/)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");
}

/**
 * Capitalizes the first letter of a string.
 * @param str The input string.
 * @returns A new string with the first letter capitalized.
 */
export function capitalizeFirstLetter(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Normalizes free-form names to canonical storage format.
 * Trims edge whitespace and collapses all inner whitespace runs to underscores.
 */
export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, "_");
}

export function toHex(buffer: ArrayBuffer): string {
  const u8 = new Uint8Array(buffer);

  // Use native toHex if available (modern browsers / future runtimes)
  if (
    "toHex" in u8 &&
    typeof (u8 as { toHex?: unknown }).toHex === "function"
  ) {
    return (u8 as unknown as { toHex(): string }).toHex();
  }

  const hashArray = Array.from(u8);
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hashHex;
}

/** CP-168 — an underscore in a theme name reads as a space. */
export function replaceUnderscoresWithSpaces(text: string): string {
  return text.replace(/_/g, " ");
}

export function replaceSpacesWithUnderscores(text: string): string {
  return text.replace(/ /g, "_");
}
