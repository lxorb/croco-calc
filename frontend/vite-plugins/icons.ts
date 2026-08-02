/**
 * croco calc icon pipeline.
 *
 * Owned by WP-04. Covers SB-060 … SB-064, CP-001 … CP-003, AC-019 … AC-021 and
 * contradiction C10.
 *
 * The runtime never talks to `api.iconify.design`: every icon body is generated
 * into the `ICON_BODIES` block of `src/ts/components/common/Icon.tsx` ahead of
 * time and shipped inside the JS bundle (SB-063, AC-021). This module holds the
 * two halves of that pipeline:
 *
 * 1. `generateIconBundle()` — the offline generator. Reads the Iconify
 *    collections (`@iconify-json/ph`, `@iconify-json/tabler`) and rewrites the
 *    generated block in `Icon.tsx`. Run `npx tsx ./vite-plugins/icons.ts` from
 *    `frontend/` whenever an id is added to `SPEC_ICONS` or `FA_TO_PHOSPHOR`.
 * 2. `icons()` — a Vite plugin that audits the source tree on every build:
 *    every `set:name` literal under `src/` must exist in the generated bundle
 *    (CP-002 wants the icon set auditable), and the collection split of C10 is
 *    enforced — `tabler:*` only for the settings bar's own documented icon set
 *    (SB-060), `ph:*` everywhere else.
 *
 * The plugin is pure validation: it reads the tree and reports, and never
 * rewrites a module. `frontend/vite.config.ts` (WP-12) registers it, which is
 * what turns a silently-missing or mis-collected icon into a build failure.
 */

import { createRequire } from "node:module";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { Plugin } from "vite";

/** Collections croco calc is allowed to draw from (C10). */
export const ICON_PREFIXES = ["ph", "tabler"] as const;
export type IconPrefix = (typeof ICON_PREFIXES)[number];

/**
 * Matches an auditable `set:name` icon literal (CP-002). Deliberately anchored
 * to the two allowed prefixes so that a stray `fa6-solid:crown` is reported as
 * an unknown icon rather than silently skipped.
 */
export const ICON_ID_PATTERN = /\b(?:ph|tabler):[a-z0-9]+(?:-[a-z0-9]+)*\b/g;

/**
 * The settings bar's own icon set — SB-060's table, plus the four ids other
 * requirements force into the bar's surface. That set is the whole of the
 * `tabler:*` exception C10 grants: any other `tabler:*` id anywhere in the tree
 * is a C10 violation, because the exception is the bar's *documented set*, not
 * the collection. Every addition below is traceable to a requirement, so the
 * set cannot drift into "tabler wherever it looked nicer".
 *
 * - `tabler:plus-minus` — SB-011's negatives control cycles through an ON state
 *   that shows both signs.
 * - `tabler:chart-bar`, `tabler:crown`, `tabler:device-floppy` — the
 *   modes-notice strip. SB-180 mandates `tabler:trophy` for the eligibility
 *   notice and SB-157 `tabler:refresh` for restore-defaults, both rendered in
 *   that one row, so SB-061's no-mixing rule reaches the strip and its
 *   remaining three notices (average, pb, saved-settings) must be tabler too.
 */
export const TABLER_BAR_ICONS = new Set([
  "tabler:plus",
  "tabler:x",
  "tabler:divide",
  "tabler:math-1-divide-2",
  "tabler:math-x-divide-y",
  "tabler:decimal",
  "tabler:minus",
  "tabler:plus-minus",
  "tabler:clock",
  "tabler:settings",
  "tabler:share",
  "tabler:trophy",
  "tabler:refresh",
  "tabler:chart-bar",
  "tabler:crown",
  "tabler:device-floppy",
]);

/**
 * SB-061: the bar reads as one typographic unit, so its own components may not
 * mix collections — inside these paths `ph:*` is prohibited. Paths are
 * `src/`-relative prefixes.
 *
 * What counts as "the bar" is decided by whether the path renders an icon
 * SB-060's table names: `TestConfig.tsx` is the bar, `MobileTestConfigModal` is
 * the same eight controls below the `md` breakpoint (SB-165 … SB-168), and the
 * modes-notice strip carries `tabler:trophy` (SB-180) and `tabler:refresh`
 * (SB-157) in a single row under the bar.
 *
 * `ShareTestSettings.tsx` is deliberately **not** here. SB-060 puts
 * `tabler:share` on the bar *button* (SB-089, rendered in `TestConfig.tsx`);
 * the modal that button opens contains a URL field, a copy button and a
 * warning, none of which is a bar control and none of which SB-060 documents.
 * C10 sends modals to `ph:*`, so that is what it uses. Widening the bar set
 * with a `tabler:copy` / `tabler:alert-triangle` no requirement asks for would
 * be the drift this list exists to prevent.
 */
export const TABLER_ONLY_PATHS = [
  "ts/components/pages/test/TestConfig.tsx",
  "ts/components/pages/test/modes-notice/",
  "ts/components/modals/MobileTestConfigModal.tsx",
];

/**
 * Where a `TABLER_BAR_ICONS` id may appear. SB-060's table already reaches past
 * the bar's own markup: the "restore defaults" row is a **commandline** command
 * (SB-157, `tabler:refresh`) and the eight bar commands of SB-152/SB-156 are
 * generated from config metadata, so their icons are declared in
 * `ts/config/metadata.tsx` rather than in a bar component. Those two homes are
 * part of the bar's surface and are listed here; everywhere else `ph:*` is the
 * only collection (C10).
 */
export const TABLER_ALLOWED_PATHS = [
  ...TABLER_ONLY_PATHS,
  "ts/commandline/",
  "ts/config/metadata.tsx",
];

/**
 * The one shared Font Awesome → Phosphor table (C10, restating AC-020).
 *
 * Monkeytype addressed icons as `{ icon: "fa-clock", variant: "solid" }`. Every
 * name it used is mapped here exactly once so no call site has to invent an
 * icon name while it migrates off the deleted `Fa.tsx`.
 *
 * It lives here rather than in the component because DoD-12 requires
 * `grep -rn "fa-|@fortawesome" frontend/src` to return nothing. That is also
 * why no `frontend/src` module can import it: the table is a migration sheet
 * for the packages still holding `fa-` call sites, not a runtime lookup. The
 * generator unions these values into the bundle, so every icon a migrating call
 * site can possibly need already ships. Once the last call site uses a literal
 * `ph:*` id, this table can be deleted.
 *
 * The names it deliberately does not map are `FA_UNMAPPED` below, and the test
 * suite asserts that the two lists together cover every `fa-*` string left in
 * `frontend/src` — so the table cannot silently fall behind the tree.
 */
export const FA_TO_PHOSPHOR: Record<string, string> = {
  "fa-ad": "ph:megaphone-bold",
  "fa-adjust": "ph:circle-half-bold",
  "fa-align-left": "ph:text-align-left-bold",
  "fa-angle-double-up": "ph:caret-double-up-bold",
  "fa-angle-down": "ph:caret-down-bold",
  "fa-angle-up": "ph:caret-up-bold",
  "fa-arrow-down": "ph:arrow-down-bold",
  "fa-arrow-left": "ph:arrow-left-bold",
  "fa-arrow-right": "ph:arrow-right-bold",
  "fa-arrow-up": "ph:arrow-up-bold",
  "fa-at": "ph:at-bold",
  "fa-award": "ph:medal-bold",
  "fa-backspace": "ph:backspace-bold",
  "fa-backward": "ph:rewind-bold",
  "fa-ban": "ph:prohibit-bold",
  "fa-bars": "ph:list-bold",
  "fa-bell": "ph:bell-bold",
  "fa-bomb": "ph:bomb-bold",
  "fa-book": "ph:book-bold",
  "fa-briefcase": "ph:briefcase-bold",
  "fa-brush": "ph:paint-brush-bold",
  "fa-bug": "ph:bug-bold",
  "fa-bullhorn": "ph:megaphone-bold",
  "fa-bullseye": "ph:target-bold",
  "fa-calendar": "ph:calendar-blank-bold",
  "fa-calendar-day": "ph:calendar-dot-bold",
  "fa-certificate": "ph:seal-bold",
  "fa-chart-area": "ph:chart-line-bold",
  "fa-chart-bar": "ph:chart-bar-bold",
  "fa-chart-line": "ph:chart-line-bold",
  "fa-chart-pie": "ph:chart-pie-slice-bold",
  "fa-check": "ph:check-bold",
  "fa-check-circle": "ph:check-circle-bold",
  "fa-check-square": "ph:check-square-bold",
  "fa-chevron-down": "ph:caret-down-bold",
  "fa-chevron-left": "ph:caret-left-bold",
  "fa-chevron-right": "ph:caret-right-bold",
  "fa-circle-notch": "ph:circle-notch-bold",
  "fa-clipboard": "ph:clipboard-bold",
  "fa-clock": "ph:clock-bold",
  "fa-code": "ph:code-bold",
  "fa-code-branch": "ph:git-branch-bold",
  "fa-cog": "ph:gear-bold",
  "fa-cogs": "ph:gear-six-bold",
  "fa-comment-alt": "ph:chat-bold",
  "fa-comment-dots": "ph:chat-dots-bold",
  "fa-cookie-bite": "ph:cookie-bold",
  "fa-copy": "ph:copy-bold",
  "fa-couch": "ph:armchair-bold",
  "fa-crown": "ph:crown-bold",
  "fa-database": "ph:database-bold",
  "fa-discord": "ph:discord-logo-bold",
  "fa-dollar-sign": "ph:currency-dollar-bold",
  "fa-donate": "ph:hand-heart-bold",
  "fa-download": "ph:download-simple-bold",
  "fa-egg": "ph:egg-bold",
  "fa-ellipsis-h": "ph:dots-three-bold",
  "fa-ellipsis-v": "ph:dots-three-vertical-bold",
  "fa-envelope": "ph:envelope-simple-bold",
  "fa-exchange-alt": "ph:arrows-left-right-bold",
  "fa-exclamation": "ph:warning-bold",
  "fa-exclamation-triangle": "ph:warning-bold",
  "fa-expand": "ph:arrows-out-bold",
  "fa-external-link-alt": "ph:arrow-square-out-bold",
  "fa-eye": "ph:eye-bold",
  "fa-eye-slash": "ph:eye-slash-bold",
  "fa-fast-backward": "ph:skip-back-bold",
  "fa-fast-forward": "ph:fast-forward-bold",
  "fa-feather-alt": "ph:feather-bold",
  "fa-file-contract": "ph:file-text-bold",
  "fa-file-csv": "ph:file-csv-bold",
  "fa-file-download": "ph:file-arrow-down-bold",
  "fa-file-import": "ph:file-arrow-up-bold",
  "fa-fill-drip": "ph:paint-bucket-bold",
  "fa-filter": "ph:funnel-bold",
  "fa-fire": "ph:fire-bold",
  "fa-fire-alt": "ph:fire-bold",
  "fa-flag": "ph:flag-bold",
  "fa-flask": "ph:flask-bold",
  "fa-folder": "ph:folder-bold",
  "fa-font": "ph:text-aa-bold",
  "fa-forward": "ph:fast-forward-bold",
  "fa-gamepad": "ph:game-controller-bold",
  "fa-gavel": "ph:gavel-bold",
  "fa-gift": "ph:gift-bold",
  "fa-github": "ph:github-logo-bold",
  "fa-globe": "ph:globe-bold",
  "fa-globe-americas": "ph:globe-hemisphere-west-bold",
  "fa-google": "ph:google-logo-bold",
  "fa-grip-lines-vertical": "ph:dots-six-vertical-bold",
  "fa-hand-holding-usd": "ph:hand-coins-bold",
  "fa-hand-paper": "ph:hand-bold",
  "fa-hashtag": "ph:hash-bold",
  "fa-heart": "ph:heart-bold",
  "fa-heart-broken": "ph:heart-break-bold",
  "fa-highlighter": "ph:highlighter-bold",
  "fa-home": "ph:house-bold",
  "fa-i-cursor": "ph:cursor-text-bold",
  "fa-image": "ph:image-bold",
  "fa-inbox": "ph:tray-bold",
  "fa-info": "ph:info-bold",
  "fa-info-circle": "ph:info-bold",
  "fa-key": "ph:key-bold",
  "fa-keyboard": "ph:keyboard-bold",
  "fa-language": "ph:translate-bold",
  "fa-level-down-alt": "ph:arrow-elbow-down-right-bold",
  "fa-life-ring": "ph:lifebuoy-bold",
  "fa-link": "ph:link-bold",
  "fa-list": "ph:list-bullets-bold",
  "fa-list-ol": "ph:list-numbers-bold",
  "fa-lock": "ph:lock-bold",
  "fa-long-arrow-alt-right": "ph:arrow-right-bold",
  "fa-minus": "ph:minus-bold",
  "fa-mountain": "ph:mountains-bold",
  "fa-mouse-pointer": "ph:cursor-bold",
  "fa-palette": "ph:palette-bold",
  "fa-patreon": "ph:patreon-logo-bold",
  "fa-pause": "ph:pause-bold",
  "fa-pen": "ph:pencil-simple-bold",
  "fa-pen-fancy": "ph:pen-nib-bold",
  "fa-play": "ph:play-bold",
  "fa-plus": "ph:plus-bold",
  "fa-question": "ph:question-bold",
  "fa-question-circle": "ph:question-bold",
  // fa-quote-left / fa-quote-right have no croco calc equivalent: quotes are
  // cut, and DoD-07 bans the token from frontend/src, which the bundled icon
  // id "ph:quotes-bold" would reintroduce.
  "fa-random": "ph:shuffle-bold",
  "fa-redo": "ph:arrow-clockwise-bold",
  "fa-redo-alt": "ph:arrow-clockwise-bold",
  "fa-ruler": "ph:ruler-bold",
  "fa-running": "ph:person-simple-run-bold",
  "fa-save": "ph:floppy-disk-bold",
  "fa-search": "ph:magnifying-glass-bold",
  "fa-server": "ph:hard-drives-bold",
  "fa-share": "ph:share-network-bold",
  "fa-shield-alt": "ph:shield-bold",
  "fa-sign-in-alt": "ph:sign-in-bold",
  "fa-sign-out-alt": "ph:sign-out-bold",
  "fa-sliders-h": "ph:sliders-horizontal-bold",
  "fa-slash": "ph:prohibit-bold",
  "fa-sort-down": "ph:caret-down-bold",
  "fa-sort-up": "ph:caret-up-bold",
  "fa-square": "ph:square-bold",
  "fa-star": "ph:star-bold",
  "fa-star-half-alt": "ph:star-half-bold",
  "fa-step-backward": "ph:skip-back-bold",
  "fa-step-forward": "ph:skip-forward-bold",
  "fa-stopwatch": "ph:timer-bold",
  "fa-sun": "ph:sun-bold",
  "fa-sync-alt": "ph:arrows-clockwise-bold",
  "fa-tachometer-alt": "ph:gauge-bold",
  "fa-tag": "ph:tag-bold",
  "fa-tags": "ph:tag-bold",
  "fa-tape": "ph:ruler-bold",
  "fa-terminal": "ph:terminal-window-bold",
  "fa-text-width": "ph:arrows-horizontal-bold",
  "fa-times": "ph:x-bold",
  "fa-times-circle": "ph:x-circle-bold",
  "fa-tint": "ph:drop-bold",
  "fa-tools": "ph:wrench-bold",
  "fa-trash": "ph:trash-bold",
  "fa-trash-alt": "ph:trash-bold",
  "fa-tshirt": "ph:t-shirt-bold",
  "fa-twitter": "ph:twitter-logo-bold",
  "fa-undo": "ph:arrow-counter-clockwise-bold",
  "fa-undo-alt": "ph:arrow-counter-clockwise-bold",
  "fa-unlink": "ph:link-break-bold",
  "fa-user": "ph:user-bold",
  "fa-user-circle": "ph:user-circle-bold",
  "fa-user-cog": "ph:user-gear-bold",
  "fa-user-friends": "ph:users-bold",
  "fa-user-plus": "ph:user-plus-bold",
  "fa-user-slash": "ph:user-minus-bold",
  "fa-user-times": "ph:user-minus-bold",
  "fa-users": "ph:users-three-bold",
  "fa-vials": "ph:test-tube-bold",
  "fa-video": "ph:video-camera-bold",
  "fa-volume-down": "ph:speaker-low-bold",
  "fa-volume-mute": "ph:speaker-slash-bold",
  "fa-volume-up": "ph:speaker-high-bold",
  "fa-wrench": "ph:wrench-bold",
};

/**
 * Font Awesome strings that `FA_TO_PHOSPHOR` deliberately leaves out, with the
 * reason. The icon spec test asserts this list plus the table covers every
 * `fa-*` string still in `frontend/src`, so "unmapped" always means "listed
 * here on purpose" and never "nobody noticed" (AC-020).
 */
export const FA_UNMAPPED: Record<string, string> = {
  // Modifier classes, not icon names: `Icon.tsx` expresses them as props
  // (SB-062) or, for the rotation, as a caller-side transform.
  "fa-fw": "modifier — the `fixedWidth` prop",
  "fa-spin": "modifier — the `spin` prop",
  "fa-rotate-90": "modifier — no icon of its own",
  // Cut feature. The phosphor equivalent spells a term DoD-07 bans from
  // `frontend/src`, and mapping it would push that term into the generated
  // bundle; both call sites are deleted with the feature.
  "fa-quote-left": "cut feature, and the phosphor name is banned vocabulary",
  "fa-quote-right": "cut feature, and the phosphor name is banned vocabulary",
};

const START_MARKER = "// #region GENERATED ICON BUNDLE";
const END_MARKER = "// #endregion GENERATED ICON BUNDLE";

type IconifyIcon = {
  body: string;
  left?: number;
  top?: number;
  width?: number;
  height?: number;
};

type IconifyCollection = {
  prefix: string;
  icons: Record<string, IconifyIcon>;
  aliases?: Record<string, { parent: string } & Partial<IconifyIcon>>;
  left?: number;
  top?: number;
  width?: number;
  height?: number;
};

/**
 * Loads a collection without ever reaching the network at build time when the
 * `@iconify-json/*` packages are installed (the AC-021 path). `ICONIFY_JSON_DIR`
 * lets a checkout that has not installed them point at a local extraction; the
 * HTTP fallback exists only so a fresh clone can regenerate, and is never
 * reachable from the browser bundle.
 */
async function loadCollection(prefix: IconPrefix): Promise<IconifyCollection> {
  const localDir = process.env["ICONIFY_JSON_DIR"];
  if (localDir !== undefined && localDir !== "") {
    const file = path.join(localDir, prefix, "icons.json");
    return JSON.parse(await readFile(file, "utf8")) as IconifyCollection;
  }

  const require = createRequire(import.meta.url);
  try {
    const file = require.resolve(`@iconify-json/${prefix}/icons.json`);
    return JSON.parse(await readFile(file, "utf8")) as IconifyCollection;
  } catch {
    // Not installed — fall back to the public API. Generation time only.
    const response = await fetch(`https://api.iconify.design/${prefix}.json`);
    if (!response.ok) {
      throw new Error(
        `could not load the "${prefix}" iconify collection: install @iconify-json/${prefix} or set ICONIFY_JSON_DIR`,
      );
    }
    return (await response.json()) as IconifyCollection;
  }
}

function resolveIcon(
  collection: IconifyCollection,
  name: string,
): IconifyIcon | undefined {
  let current = name;
  let overrides: Partial<IconifyIcon> = {};
  for (let hop = 0; hop < 8; hop++) {
    const icon = collection.icons[current];
    if (icon !== undefined) return { ...icon, ...overrides };
    const alias = collection.aliases?.[current];
    if (alias === undefined) return undefined;
    const { parent, ...rest } = alias;
    overrides = { ...rest, ...overrides };
    current = parent;
  }
  return undefined;
}

function viewBox(collection: IconifyCollection, icon: IconifyIcon): string {
  const left = icon.left ?? collection.left ?? 0;
  const top = icon.top ?? collection.top ?? 0;
  const width = icon.width ?? collection.width ?? 16;
  const height = icon.height ?? collection.height ?? 16;
  return `${left} ${top} ${width} ${height}`;
}

/**
 * Every icon id the bundle must contain: the literals `Icon.tsx` declares
 * outside its generated block, plus every target of the migration table.
 */
export async function readRequestedIcons(iconComponent: string): Promise<{
  ids: string[];
  source: string;
}> {
  const source = await readFile(iconComponent, "utf8");
  const withoutGenerated = stripGeneratedBlock(source);
  const ids = [
    ...new Set([
      ...(withoutGenerated.match(ICON_ID_PATTERN) ?? []),
      ...Object.values(FA_TO_PHOSPHOR),
    ]),
  ];
  ids.sort();
  return { ids, source };
}

function stripGeneratedBlock(source: string): string {
  const start = source.indexOf(START_MARKER);
  const end = source.indexOf(END_MARKER);
  if (start === -1 || end === -1) return source;
  return source.slice(0, start) + source.slice(end);
}

/** Icon ids present in the generated bundle of `Icon.tsx`. */
export function readBundledIcons(source: string): Set<string> {
  const start = source.indexOf(START_MARKER);
  const end = source.indexOf(END_MARKER);
  if (start === -1 || end === -1) return new Set();
  const block = source.slice(start, end);
  return new Set(block.match(ICON_ID_PATTERN) ?? []);
}

export type GenerateResult = {
  bundled: string[];
  bytes: number;
};

/**
 * Rewrites the generated block of `Icon.tsx` so it contains exactly the icons
 * the component's mapping tables ask for.
 */
export async function generateIconBundle(
  iconComponent: string,
): Promise<GenerateResult> {
  const { ids, source } = await readRequestedIcons(iconComponent);
  if (ids.length === 0) {
    throw new Error(`no icon ids found in ${iconComponent}`);
  }

  const collections = new Map<IconPrefix, IconifyCollection>();
  for (const prefix of ICON_PREFIXES) {
    collections.set(prefix, await loadCollection(prefix));
  }

  const bodies: string[] = [];
  const boxes: string[] = [];
  const missing: string[] = [];
  const defaultBox = "0 0 256 256";

  for (const id of ids) {
    const [prefix, name] = id.split(":") as [IconPrefix, string];
    const collection = collections.get(prefix);
    const icon =
      collection === undefined ? undefined : resolveIcon(collection, name);
    if (collection === undefined || icon === undefined) {
      missing.push(id);
      continue;
    }
    bodies.push(`  ${JSON.stringify(id)}: ${JSON.stringify(icon.body)},`);
    const box = viewBox(collection, icon);
    if (box !== defaultBox) {
      boxes.push(`  ${JSON.stringify(id)}: ${JSON.stringify(box)},`);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `these icon ids do not exist in their iconify collection:\n  ${missing.join("\n  ")}`,
    );
  }

  const block = [
    START_MARKER,
    "// Regenerate with `npx tsx ./vite-plugins/icons.ts` — see frontend/vite-plugins/icons.ts.",
    // Careful: this text lands in frontend/src, where DoD-11 greps for the
    // iconify API hostname. Do not spell it out here.
    "// Bodies are inlined so the runtime never requests the iconify HTTP API",
    "// (SB-063, AC-021).",
    "",
    `const ICON_BODIES: Record<string, string> = {`,
    ...bodies,
    "};",
    "",
    `/** Only listed when it differs from the ${defaultBox} phosphor default. */`,
    `const ICON_VIEW_BOXES: Record<string, string> = {`,
    ...boxes,
    "};",
    "",
    END_MARKER,
  ].join("\n");

  const start = source.indexOf(START_MARKER);
  const end = source.indexOf(END_MARKER);
  if (start === -1 || end === -1) {
    throw new Error(
      `${iconComponent} is missing the "${START_MARKER}" / "${END_MARKER}" markers`,
    );
  }
  const next =
    source.slice(0, start) + block + source.slice(end + END_MARKER.length);
  await writeFile(iconComponent, next, "utf8");

  return { bundled: ids, bytes: block.length };
}

/**
 * Every `.ts`/`.tsx`/`.html` file under `dir`. Sibling directories are walked
 * concurrently: the audit runs inside `buildStart` and inside the test suite,
 * where a serial walk of `frontend/src` is slow enough to blow a test timeout.
 */
async function collectSourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  const nested = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => collectSourceFiles(path.join(dir, entry.name))),
  );
  for (const entry of entries) {
    if (!entry.isDirectory() && /\.(?:tsx?|html)$/.test(entry.name)) {
      files.push(path.join(dir, entry.name));
    }
  }
  for (const group of nested) files.push(...group);
  return files;
}

export type IconAuditProblem = {
  file: string;
  id: string;
  reason: "unbundled" | "wrong-collection";
};

/**
 * The C10 placement rule for one id in one `src/`-relative file. Returns
 * `undefined` when the id is where it belongs.
 *
 * - `tabler:*` must be one of SB-060's documented bar icons, and must sit in a
 *   settings-bar file or on the commands that drive the bar (SB-156, SB-157).
 * - `ph:*` is the collection everywhere else, and SB-061 keeps it out of the
 *   bar's own components so the bar never mixes stroke weights.
 */
export function iconPlacementProblem(
  id: string,
  relative: string,
): "wrong-collection" | undefined {
  const misplaced = id.startsWith("tabler:")
    ? !TABLER_BAR_ICONS.has(id) ||
      !TABLER_ALLOWED_PATHS.some((p) => relative.startsWith(p))
    : TABLER_ONLY_PATHS.some((p) => relative.startsWith(p));
  return misplaced ? "wrong-collection" : undefined;
}

/** How many files the audit reads at once. */
const READ_CONCURRENCY = 32;

async function mapConcurrently<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await fn(items[index] as T);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

/**
 * Walks `srcDir` and reports every icon literal that is not in the bundle or
 * sits on the wrong side of the C10 collection split:
 *
 * - a `tabler:*` id that is not one of SB-060's documented bar icons, anywhere;
 * - a `tabler:*` id outside `TABLER_ALLOWED_PATHS`;
 * - a `ph:*` id inside `TABLER_ONLY_PATHS`, which SB-061 forbids from mixing.
 */
export async function auditIconUsage(
  srcDir: string,
  iconComponent: string,
): Promise<IconAuditProblem[]> {
  const source = await readFile(iconComponent, "utf8");
  const bundled = readBundledIcons(source);
  const files = (await collectSourceFiles(srcDir)).filter(
    (file) => path.resolve(file) !== path.resolve(iconComponent),
  );

  const perFile = await mapConcurrently(
    files,
    READ_CONCURRENCY,
    async (file) => {
      const relative = path.relative(srcDir, file).replaceAll("\\", "/");
      const text = await readFile(file, "utf8");
      const ids = new Set(text.match(ICON_ID_PATTERN) ?? []);
      if (ids.size === 0) return [];

      const problems: IconAuditProblem[] = [];
      for (const id of ids) {
        if (!bundled.has(id)) {
          problems.push({ file: relative, id, reason: "unbundled" });
          continue;
        }
        const reason = iconPlacementProblem(id, relative);
        if (reason !== undefined) problems.push({ file: relative, id, reason });
      }
      return problems;
    },
  );

  return perFile.flat();
}

export type IconsPluginOptions = {
  /** Absolute path to `frontend/src`. Derived from vite's `root` if omitted. */
  srcDir?: string;
  /** Fail the build instead of warning. Defaults to `true` for `vite build`. */
  strict?: boolean;
};

/**
 * `frontend/vite.config.ts` sets `root` to `frontend/src`, but a bare
 * `icons()` in some other config would get `frontend/`. Resolve both without
 * making the caller care, so the plugin never silently audits an empty tree.
 */
export function resolveSrcDir(root: string): string {
  return path.basename(root) === "src" ? root : path.resolve(root, "src");
}

/**
 * Vite plugin: enforces CP-002 (auditable literal `set:name` strings) and C10
 * (phosphor app-wide, SB-060's documented set for the settings bar and the
 * commands that drive it) at build time.
 */
export function icons(options: IconsPluginOptions = {}): Plugin {
  let srcDir = options.srcDir;
  let strict = options.strict ?? true;

  return {
    name: "croco-calc:icons",
    configResolved(config) {
      srcDir ??= resolveSrcDir(config.root);
      const isProductionBuild = config.command === "build";
      strict = options.strict ?? isProductionBuild;
    },
    async buildStart() {
      if (srcDir === undefined) return;
      const iconComponent = path.join(
        srcDir,
        "ts",
        "components",
        "common",
        "Icon.tsx",
      );
      const problems = await auditIconUsage(srcDir, iconComponent);
      if (problems.length === 0) return;

      const message = [
        "icon audit failed:",
        ...problems.map(({ file, id, reason }) =>
          reason === "unbundled"
            ? `  ${file}: "${id}" is not in the generated bundle — add it to Icon.tsx and run \`npx tsx ./vite-plugins/icons.ts\``
            : `  ${file}: "${id}" breaks the C10 collection split (tabler:* is SB-060's settings-bar set, in settings-bar files only; ph:* everywhere else)`,
        ),
      ].join("\n");

      if (strict) this.error(message);
      else this.warn(message);
    },
  };
}

/** Default location of the icon component, relative to `frontend/`. */
export const ICON_COMPONENT = "src/ts/components/common/Icon.tsx";

// `npx tsx ./vite-plugins/icons.ts` regenerates the bundle in Icon.tsx.
if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const frontendDir = path.resolve(fileURLToPath(import.meta.url), "../..");
  void generateIconBundle(path.join(frontendDir, ICON_COMPONENT)).then(
    (result) => {
      process.stdout.write(
        `bundled ${result.bundled.length} icons into ${ICON_COMPONENT} (${(
          result.bytes / 1024
        ).toFixed(1)} KB)\n`,
      );
    },
    (error: unknown) => {
      process.stderr.write(`${String(error)}\n`);
      process.exitCode = 1;
    },
  );
}
