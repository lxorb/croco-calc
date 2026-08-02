# 04 — Account-related pages (croco calc)

Owner scope: **user stats / profile page, leaderboard, friends page, public profile page, account
settings, profile-button hover menu, and the XP/level system** that those pages depend on.

Requirement IDs: **AC-001 … AC-187**. AC-187 was added in revision 2 of the master document (no bail-out concept, master C38). Every requirement uses MUST / MUST NOT / SHOULD language and is
individually verifiable.

## 0. How to read this document

* **Reference checkout** (read-only) used for every citation:
  `C:\Users\me\AppData\Local\Temp\claude\C--Users-me-Projects-calc-trainer\2ed5ffdc-09db-4833-a58e-c5b7bd58be53\scratchpad\monkeytype-ref`
  Every path below is relative to that root and to the identical path in the project repo
  `C:\Users\me\Projects\calc-trainer` (monkeytype history was imported, so the files exist in both).
* "Adapt X" means: **edit the existing file in place**, keep its component structure, layout classes and
  Solid/TanStack wiring, and only change the domain content. Do not rewrite from scratch, do not swap
  frameworks.
* "ASSUMPTION" marks a place where the brief was ambiguous; the chosen reading is stated and justified.
  A later stage may overrule these, but they must be overruled explicitly.

---

## 1. Shared domain model — metrics, modes, naming

The account pages are entirely metric-driven, so the metric vocabulary is fixed here first. Doc 03
(test/results pages) MUST use the same field names.

### 1.1 Per-result metrics

**AC-001** Every saved result MUST store `correct` (integer ≥ 0): number of tasks answered correctly.

**AC-002** Every saved result MUST store `wrong` (integer ≥ 0): number of tasks answered incorrectly.

**AC-003** Every saved result MUST store `score` (integer, MAY be negative), defined exactly as
`score = correct - wrong`. This is the headline metric mandated by the brief and is the croco calc
analogue of monkeytype's `wpm`.

**AC-004** Every saved result MUST store `acc` (number, 0–100, 2 decimal places), defined exactly as
`acc = correct / (correct + wrong) * 100`, and `acc = 0` when `correct + wrong === 0`.
This is the croco calc analogue of monkeytype's `acc`
(`packages/schemas/src/results.ts` → `ResultBaseSchema.acc`).

**AC-005** Every saved result MUST store `tpm` (number, 2 decimal places) — "tasks per minute" —
defined exactly as `tpm = (correct + wrong) / (testDuration / 60)`, where `testDuration` is in seconds.
This is the croco calc analogue of monkeytype's `rawWpm` and is the metric the brief names
"tasks per minute = how many responses you made per minute".

**AC-006** Every saved result MUST store `spm` (number, 2 decimal places) — "score per minute" —
defined exactly as `spm = score / (testDuration / 60)`. `spm` exists solely so that results of
different durations can be plotted on one axis (see AC-086).

**AC-007** croco calc MUST NOT have a `consistency` metric, a `rawWpm` metric, a `charStats` tuple, a
`keyConsistency` metric, or a `burst` metric. Every column, stat box, chart axis, CSV column and
leaderboard column in monkeytype that renders one of those MUST be removed or replaced as specified
below. Rationale: the brief enumerates the results-page metrics exhaustively (score, correct, wrong,
accuracy, tasks per minute) and none of the removed metrics is meaningful for arithmetic input.
*(ASSUMPTION — the brief says "keep accuracy" and lists no other carried-over metric; the removals are
the most sensible reading of "cutting what we don't need".)*

**AC-008** Every saved result MUST store `testDuration` (seconds; one of 60, 120, 240, 480) and
`mode2` (string; one of `"1"`, `"2"`, `"4"`, `"8"` — the time setting in minutes). `mode` MUST always
be the literal `"time"`; croco calc has exactly one test mode, so the `mode` dimension is retained only
so that the existing monkeytype schemas (`packages/schemas/src/shared.ts` `ModeSchema` / `Mode2Schema`)
and the personal-best storage shape keep working unchanged.

### 1.2 The settings signature

**AC-009 — SUPERSEDED BY MASTER C2.** Every saved result MUST store a `settings` object with exactly these
seven keys. The value domains below are the **display labels** and are NOT what is stored; the stored
domains are SB-010's, restated by master C2:
`addition "off"|"100"|"1000"`, `multiplication "off"|"12"|"20"|"100"`,
`division "off"|"tables"|"threeByTwo"`, `fractionAddition "off"|"12"|"99"`,
`fractionMultiplication`/`decimals`/`negatives` **booleans**. Every other requirement in this document
that names a value literal — AC-027, AC-078, AC-081, AC-100, AC-101, AC-102, AC-121.3 — has been rewritten
against the stored domain (master §2.31, gap 4). The table below is retained only as the label mapping:

| key | values |
|---|---|
| `addition` | `"off"` \| `"100"` \| `"1000"` |
| `multiplication` | `"off"` \| `"12x12"` \| `"20x20"` \| `"100x100"` |
| `division` | `"off"` \| `"144/12"` \| `"xxx/xx"` |
| `fractionAddition` | `"off"` \| `"1/12"` \| `"1/xx"` |
| `fractionMultiplication` | `"off"` \| `"on"` |
| `decimals` | `"off"` \| `"on"` |
| `negatives` | `"off"` \| `"on"` |

**AC-010** A `settingsSignature` MUST be derivable from `settings` as the deterministic string
`` `${addition}|${multiplication}|${division}|${fractionAddition}|${fractionMultiplication}|${decimals}|${negatives}` ``.
It MUST be computed by one shared helper in `packages/util` so frontend and backend agree byte-for-byte.

**AC-011** `DEFAULT_SETTINGS_SIGNATURE` MUST be the constant
`"1000|100x100|xxx/xx|1/xx|on|on|on"`, i.e. addition `+1000`, multiplication `100x100`, division
`xxx/xx`, fraction addition `+1/xx`, fraction multiplication ON, decimals ON, negatives ON — exactly the
defaults named in the brief. It MUST be exported from a single shared constants module and MUST be the
only definition of "default settings" used by the leaderboard eligibility check (AC-121).

**AC-012** `DEFAULT_SETTINGS_SIGNATURE` MUST NOT include the time setting. Rationale: the leaderboard
offers time 4 **and** time 8, so "default settings" can only mean the seven arithmetic controls.
*(ASSUMPTION, but strongly implied: the brief lists "Time options are ONLY 4 and 8" and "Only runs made
with the DEFAULT settings count" as two separate rules in the same paragraph.)*

### 1.3 Aggregate user stats

**AC-013** The user document MUST carry `startedTests`, `completedTests` and `timeSpent` (seconds),
replacing monkeytype's `startedTests` / `completedTests` / `timeTyping`
(`packages/schemas/src/users.ts` → `UserSchema`, `TypingStatsSchema`).

**AC-014** All UI copy that reads "time typing" or "typing" in monkeytype MUST read **"time spent"** /
"solving" in croco calc. Specifically `TypingStatsSchema` MUST be renamed to `SolveStatsSchema` with
field `timeSpent`, and every consumer updated
(`frontend/src/ts/components/pages/profile/UserDetails.tsx:413-476`,
`frontend/src/ts/components/pages/account/TestStats.tsx:85-91`).

**AC-015** croco calc MUST NOT have streaks. `UserStreakSchema`, `streak`, `maxStreak`,
`streakHourOffset`, the streak balloon in the profile header
(`frontend/src/ts/components/pages/profile/UserDetails.tsx:204-255,322-332`), the streak column in the
friends table (`frontend/src/ts/components/pages/connections/FriendsList.tsx:207-223`), the
"set streak hour offset" account-settings section
(`frontend/src/ts/components/pages/account-settings/AccountTab.tsx:116-140`) and the streak XP bonus
(`backend/src/api/controllers/result.ts:779-795`) MUST all be removed.
*(ASSUMPTION — the brief enumerates the profile-header contents as "avatar, name, joined date, level bar
with XP, tests started / tests completed / time spent" and never mentions streaks; the daily XP bonus
(AC-035) preserves the daily-return incentive.)*

**AC-016** croco calc MUST NOT have tags, filter tags, tag personal bests, or the tag column in the
results table (`frontend/src/ts/components/pages/account/Table.tsx:230-276`,
`frontend/src/ts/collections/tags.ts`). Rationale: tags are configured on monkeytype's settings page,
and croco calc's settings surface is reduced to the eight-control bar.
*(ASSUMPTION.)*

**AC-017** croco calc MUST NOT have a premium tier. Every `isPremium` / `premium` gate
(`packages/schemas/src/users.ts` `PremiumInfoSchema`,
`frontend/src/ts/components/pages/profile/ActivityCalendar.tsx:77-88`) MUST be removed and the gated
behaviour made unconditionally available.

**AC-018** Badges, user flags and the `inventory` field MAY be retained as-is
(`frontend/src/ts/components/common/UserBadge.tsx`, `UserFlags.tsx`) but MUST NOT be awarded by any
croco calc code path in v1; no badge-granting logic (`backend/src/api/controllers/result.ts:564-583`)
is carried over.

### 1.4 Icons

**AC-019** Every icon on the pages in this document MUST be rendered through iconify, not Font Awesome
webfont classes. The existing `frontend/src/ts/components/common/Fa.tsx` component MUST be replaced by
an `Icon.tsx` component with the same props surface (`icon`, `variant`, `fixedWidth`, `class`) so all
call sites keep compiling.

**AC-020** Icon identity MUST be preserved 1:1 by mapping each monkeytype Font Awesome name to its
iconify Font Awesome 6 equivalent (`fa-crown` → `fa6-solid:crown`, `fa-user-friends` →
`fa6-solid:user-group`, `fa-github` → `fa6-brands:github`, `fa-google` → `fa6-brands:google`, etc.).
A single mapping table MUST exist so that no call site invents its own icon name.

**AC-021** All iconify icon sets used MUST be bundled offline (`@iconify-json/*` + `addCollection`) —
no runtime requests to the iconify API. Rationale: the frontend is served from Cloudflare Workers static
assets and must work with a strict CSP.

---

## 2. XP and level system

This section is the concrete proposal the assignment asks for. It is required because the profile
header level bar (AC-046) and the weekly-XP leaderboard (AC-104) both depend on it.

### 2.1 Level curve

**AC-022** The level curve MUST be carried over from monkeytype unchanged
(`frontend/src/ts/utils/levels.ts:9-63`):
`getLevelFromTotalXp(totalXp) = floor((sqrt(392*totalXp + 22801) - 53) / 98)`,
`getLevelMaxXp(level) = 49*(level-1) + 100`,
`getTotalXpToReachLevel(level) = (49*level² + 53*level - 102) / 2`.
Rationale: it is already tuned, already inverse-consistent, and the brief says to keep what makes
sense.

**AC-023** `getXpDetails(totalXp)` MUST return `{ level, levelFloat, levelCurrentXp, levelMaxXp,
levelProgressPercent }` exactly as `frontend/src/ts/utils/levels.ts:50-63` does, and
`formatXp` MUST keep abbreviating at ≥ 1000 (`levels.ts:65-71`).

**AC-024** `user.xp` MUST be a non-negative integer, incremented server-side only.

### 2.2 XP earned per test

The formula below adapts `calculateXp` in `backend/src/api/controllers/result.ts:696-849`.

**AC-025** XP MUST be computed server-side on result submission. The client MUST NOT be trusted for any
XP input other than the raw result payload, which is validated first.

**AC-026** `base` MUST be `round((testDuration - afkDuration) * 2)` where `afkDuration` is the summed
whole seconds during which no key was pressed and no task was submitted. Per master **C37** the persisted
field keeps monkeytype's own name `afkDuration` (`result.ts:732`, retained unchanged by INV-033); the
user-visible label is `idle` (CP-108); the DOM hook is `data-afk` (CP-188); the CSV column is
`afkDuration` (AC-100). The spelling `idleDuration` used by earlier drafts of this document is **struck**.
An 8-minute test with no idle time therefore yields `base = 960`.
Rationale: XP must reward time on task, not score, so a beginner still levels up — this is exactly
monkeytype's design and is what makes the weekly-XP leaderboard a "who practised most" board rather
than a second speed board.

**AC-027** `modeModifier` MUST be `1 + Σ bonus(setting)` over the seven settings of the result, using
this table. **The `value` column is keyed on the C2 canonical stored literals** (master §2.31, gap 4) —
the display labels shown in brackets are what SB-024 … SB-047 render and MUST NOT be used as map keys:

| setting | stored value (display label) | bonus |
|---|---|---|
| `addition` | `"off"` / `"100"` (`+100`) / `"1000"` (`+1000`) | 0.00 / 0.00 / **0.05** |
| `multiplication` | `"off"` / `"12"` (`12x12`) / `"20"` (`20x20`) / `"100"` (`100x100`) | 0.00 / **0.05** / **0.10** / **0.20** |
| `division` | `"off"` / `"tables"` (`144/12`) / `"threeByTwo"` (`xxx/xx`) | 0.00 / **0.05** / **0.15** |
| `fractionAddition` | `"off"` / `"12"` (`+1/12`) / `"99"` (`+1/xx`) | 0.00 / **0.10** / **0.20** |
| `fractionMultiplication` | `false` / `true` (`*x/y`) | 0.00 / **0.10** |
| `decimals` | `false` / `true` (`4.2`) | 0.00 / **0.15** |
| `negatives` | `false` / `true` (`-`) | 0.00 / **0.10** |

Implemented against the display literals instead, every lookup would miss and `modeModifier` would be a
constant `1` — AC-039's 1694-XP acceptance test is the guard against exactly that regression.

Rationale: this is the direct analogue of monkeytype's punctuation (+0.40) / numbers (+0.10) / quote
(+0.50) / funbox difficulty bonuses (`result.ts:750-777`) — harder configurations pay more, so grinding
the easiest possible pool is never the optimal XP strategy. With the default settings the sum is
`0.05+0.20+0.15+0.20+0.10+0.15+0.10 = 0.95`, i.e. `modeModifier = 1.95`, which is deliberately close to
monkeytype's typical loaded modifier.

**AC-028** A perfect-accuracy bonus of `+0.5` MUST be added to `modeModifier` when `acc === 100`
(monkeytype `result.ts:741-744`). There MUST NOT be a "corrected everything" bonus (monkeytype's
`+0.25`, `result.ts:744-748`) because croco calc has no character-level correction.

**AC-029** `accuracyModifier` MUST be `clamp((acc - 50) / 50, 0, 1)`. Unlike monkeytype (whose schema
floors accuracy at 50, `packages/schemas/src/results.ts` `acc: PercentageSchema.min(50)`), croco calc
accuracy can legitimately reach 0, so the lower clamp is mandatory to prevent negative XP
(`result.ts:605-615` throws on negative XP).

**AC-030** `xpWithModifiers` MUST be `round(base * modeModifier)`; `xpAfterAccuracy` MUST be
`round(xpWithModifiers * accuracyModifier)`.

**AC-031** `breakdown.accPenalty` MUST be `xpWithModifiers - xpAfterAccuracy` (monkeytype
`result.ts:829`).

**AC-032** There MUST NOT be an "incomplete tests" XP component (monkeytype `result.ts:797-808`),
because croco calc tests are fixed-duration timers with no partial-word notion.
*(The assumption "if doc 03 defines a 'bailed out early' concept, it earns zero XP" is **resolved and
removed** by master C38 / AC-187: doc 03 defines no such concept and none is to be added, so there is no
bail-out XP case to specify.)*

**AC-033** `gainMultiplier` MUST remain a server-configuration value defaulting to `1`
(`packages/schemas/src/configuration.ts` → `users.xp.gainMultiplier`), and MUST be surfaced in the
breakdown as `configMultiplier` only when `!== 1` (`result.ts:834-840`).

**AC-034** Total XP MUST be
`round((xpAfterAccuracy) * gainMultiplier) + dailyBonus`, MUST be an integer, MUST NOT be `NaN`, and
MUST NOT be negative; the backend MUST throw a 500 with the offending payload if either invariant is
violated (`result.ts:593-615`).

**AC-035** `dailyBonus` MUST be awarded on the first completed test of a UTC day and MUST be
`max(min(maxDailyBonus, round(user.xp * 0.05)), minDailyBonus)` with `minDailyBonus` / `maxDailyBonus`
from server configuration (`result.ts:812-824`). `dailyXpBonus: true` MUST be returned to the client so
the results screen can flag it.

**AC-036** The XP breakdown returned to the client MUST use exactly these keys, in this display order,
with these labels in the header XP bar:

| key | label |
|---|---|
| `base` | `time solving` |
| `fullAccuracy` | `perfect` |
| `modes` | `modes` |
| `accPenalty` | `accuracy penalty` |
| `configMultiplier` | `global multiplier` |
| `daily` | `daily bonus` |

`XpBreakdownSchema` (`packages/schemas/src/results.ts`) MUST be narrowed to exactly these keys, and
`frontend/src/ts/components/layout/header/AccountXpBar.tsx:136-231` MUST be reduced to emit exactly
these items in this order (dropping `corrected`, `quote`, `punctuation`, `numbers`, `funbox`, `streak`,
`incomplete`).

**AC-037** `breakdown.modes` MUST be `round(base * (modeModifier - 1 - perfectBonus))` so that the
breakdown items sum to the awarded XP (excluding the multiplier and daily rows, which are rendered as
their own operations exactly as monkeytype does).

**AC-038** The header XP bar animation behaviour (bar fill, multi-level roll-over, skip-on-input,
auto-hide after 4 s, hide while focused) MUST be preserved unchanged from
`frontend/src/ts/components/layout/header/AccountXpBar.tsx:97-309`; only the breakdown item set changes.
Ownership note: the header component itself belongs to doc 03; it MUST consume the keys listed in
AC-036.

**AC-039** A worked example MUST hold as an acceptance test: default settings, 8-minute test, 0 s idle,
`correct = 200`, `wrong = 10` ⇒ `acc = 95.24`, `base = 960`, `modeModifier = 1.95`,
`xpWithModifiers = 1872`, `accuracyModifier = 0.9048`, `xpAfterAccuracy = 1694`, `gainMultiplier = 1`,
XP awarded (no daily bonus) = **1694**.

---

## 3. User stats page (`/account`)

Adapt `frontend/src/ts/components/pages/account/AccountPage.tsx` and its siblings. Route already exists
at `frontend/src/ts/controllers/route-controller.ts:97-110`.

### 3.1 Page shell

**AC-040** The page MUST remain gated: unauthenticated visitors MUST be redirected to `/login`, and
visitors with auth unavailable to `/` (`route-controller.ts:97-110`). The `<Page id="account"
needsAuthentication>` wrapper MUST be kept (`AccountPage.tsx:55`).

**AC-041** The page MUST be a single vertical `flex flex-col gap-8` column with the sections in exactly
this order (`AccountPage.tsx:54-141`):
1. email-verification notice
2. profile card block (header card, leaderboard-ranks strip, PB cards, activity heatmap)
3. filters block
4. charts block (filter-icon summary row, history chart, histogram, daily-activity chart)
5. totals block
6. Export CSV button row
7. results table
8. "load more" button

**AC-042** The two `<Advertisement>` slots (`AccountPage.tsx:60,117`) MUST be removed in v1 (ads are on
the deferred list).

**AC-043** When the filtered result set is empty the page MUST render a
`grid h-150 place-items-center` block containing the text `No data found. Check your filters.` and MUST
NOT render sections 4–8 (`AccountPage.tsx:64-71`).

**AC-044** The email-verification notice MUST be kept verbatim from
`frontend/src/ts/components/pages/account/VerifyNotice.tsx`: shown only when the user is not verified,
warning-triangle icon, text `Your email address is still not verified`, and a
`resend verification email` button that disables itself while the request is in flight.

### 3.2 Profile header card

Adapt `frontend/src/ts/components/pages/profile/UserDetails.tsx` (shared with the public profile page
via `MyProfile.tsx` → `UserProfile.tsx`).

**AC-045** The header card MUST be a `rounded bg-sub-alt` card laid out as
`grid grid-cols-[1fr_minmax(0,2rem)]` — content area plus a full-height right-hand action button rail
(`UserDetails.tsx:60-102`).

**AC-046** The content area MUST contain, left to right at `md` and above: avatar + name block
(including the level bar), a `w-2 rounded bg-bg` separator, and the three-stat block. Bio and socials
columns MUST be kept and MUST retain the four responsive variants `basic` / `hasSocials` /
`hasBioOrKeyboard` / `full` (`UserDetails.tsx:38-57,60-91`), except that the `keyboard` field is
replaced (AC-052).

**AC-047** The avatar MUST be a generic user-circle avatar in v1; the Discord avatar component
(`UserDetails.tsx:267-272`, `frontend/src/ts/components/common/DiscordAvatar.tsx`) MUST be replaced by
an avatar component that renders the crocodile app icon fallback. Discord avatars are deferred.

**AC-048** The name MUST render through the auto-shrinking name element (`AutoShrink`,
`UserDetails.tsx:275-284`) with user flags beside it.

**AC-049** Below the name the card MUST render `Joined {dd MMM yyyy}` with a hover balloon reading
`{N} day(s) ago` (`UserDetails.tsx:204-208,318-321`).

**AC-050** The level bar row MUST span both columns and MUST contain, left to right
(`UserDetails.tsx:341-365`):
* the level number, with a hover balloon `{formatXp(totalXp)} total xp`;
* a progress `Bar` filled to `levelProgressPercent`, showing the percentage on hover;
* the text `{levelCurrentXp}/{levelMaxXp}` with a hover balloon
  `{levelMaxXp - levelCurrentXp} xp until next level`.

**AC-051** The three-stat block MUST show exactly `tests started`, `tests completed`, `time spent`
(`UserDetails.tsx:443-473`). `tests completed` MUST keep its hover balloon
`{completedPercentage}% ({restartRatio} restarts per completed test)`. `time spent` MUST be formatted
by `secondsToString(seconds, true, true)`.

**AC-052** The profile details MUST be `bio` (max 250 chars) and `socialProfiles` (github, twitter,
website) only. The `keyboard` field (`packages/schemas/src/users.ts` → `UserProfileDetailsSchema`,
rendered at `UserDetails.tsx:386-407`) MUST be removed; the component variant named
`hasBioOrKeyboard` MUST be renamed `hasBio` with identical layout classes.

**AC-053** On `/account` the right-hand rail MUST show exactly two buttons, stacked full-height
(`UserDetails.tsx:161-195`): `Edit profile` (pen icon, balloon "Edit profile", opens the edit-profile
modal) and `Copy public link` (link icon, balloon "Copy public link", copies
`{origin}/profile/{name}` and raises the notice `URL Copied to clipboard`).

**AC-054** Banned users MUST NOT be able to open the edit-profile modal; clicking `Edit profile` MUST
raise the notice `Banned users cannot edit their profile` (`UserDetails.tsx:166-171`).

### 3.3 All-time leaderboard ranks strip

Adapt `frontend/src/ts/components/pages/profile/UserProfile.tsx:64-99`.

**AC-055** The strip MUST be a `rounded bg-sub-alt p-4 text-sub` block laid out
`grid-cols-1 md:grid-cols-2 lg:grid-cols-3`, hidden when the user is banned or has opted out
(`UserProfile.tsx:26-31`).

**AC-056** Its caption MUST read **`All-Time Leaderboards`** (monkeytype's `All-Time English
Leaderboards`, `UserProfile.tsx:72-74`, minus the language word — the brief forbids a language option).

**AC-057** It MUST show exactly two rank cells — **`4 minutes`** and **`8 minutes`** — replacing
monkeytype's `15 seconds` / `60 seconds` (`UserProfile.tsx:75-96`). Each cell MUST render the rank in
`text-3xl text-text` and the top-percentage string (`formatTopPercentage`) beneath the label. A cell
MUST be hidden when the user holds no rank for that duration.

**AC-058** The rank source MUST be `user.allTimeLbs.time["4"]` / `user.allTimeLbs.time["8"]`. The
language level of `AllTimeLbsSchema` (`packages/schemas/src/users.ts:170-176`) MUST be removed so the
shape becomes `{ time: Record<"4"|"8", RankAndCount | undefined> }`.

### 3.4 Personal-best boxes

Adapt `frontend/src/ts/components/pages/profile/UserProfile.tsx:101-186`.

**AC-059** There MUST be exactly two PB cards side by side in a
`grid grid-cols-1 gap-8 lg:grid-cols-2` (`UserProfile.tsx:32-45`). Each card MUST be
`grid grid-cols-[1fr_minmax(0,2rem)] rounded bg-sub-alt` with an inner
`grid grid-cols-2 gap-8 p-4 md:grid-cols-4`.

**AC-060** **Concrete grid proposal** (this replaces monkeytype's "15/30/60/120 seconds" and
"10/25/50/100 words" grids):

| card | caption (text-sub, above the cells) | cells |
|---|---|---|
| left | `default settings` | `1 minute`, `2 minutes`, `4 minutes`, `8 minutes` |
| right | `current settings` | `1 minute`, `2 minutes`, `4 minutes`, `8 minutes` |

The left card MUST show the best `score` for each duration among results whose `settingsSignature`
equals `DEFAULT_SETTINGS_SIGNATURE`. The right card MUST show the best `score` for each duration among
results whose `settingsSignature` equals the signature currently selected in the settings bar.
Rationale: croco calc has only one mode axis (time), so a second duration grid would be redundant;
splitting by settings signature is the only second axis that exists, mirrors monkeytype's
"current settings" filter button, and keeps every cell within one card directly comparable. Because both
cards use the same unit word ("minutes"), the captions are mandatory to satisfy the brief's rule that
each control/box always be identifiable.
*(ASSUMPTION — the brief said "propose the concrete grid".)*

**AC-061** Each PB cell MUST render, stacked and centred: the duration label in `text-xs text-sub`, the
`score` in `text-4xl`, and the accuracy in `text-xl opacity-75`
(`UserProfile.tsx:130-151`). When no PB exists the cell MUST still render with placeholder dashes.

**AC-062** Hovering a populated PB cell MUST cross-fade to a detail overlay
(`opacity-0 → group-hover:opacity-100`, `UserProfile.tsx:153-169`) listing: duration label, `{score}
score`, `{tpm} tpm`, `{acc} acc`, and the PB date as `dd MMM yyyy`. The monkeytype `raw` and `con` rows
MUST be replaced by the `tpm` row per AC-007.

**AC-063** On `/account` only, each card MUST have a full-height ellipsis-vertical button in the right
rail with balloon `Show all personal bests`, opening a modal that tables every stored PB keyed by
`(mode2, settingsSignature)` (`UserProfile.tsx:174-183`,
`frontend/src/ts/states/pb-tables-modal.ts`). On the public profile the rail MUST be absent.

**AC-064** `PersonalBestsSchema` MUST become `{ time: Record<"1"|"2"|"4"|"8", PersonalBest[]> }` where
`PersonalBest` = `{ score, acc, tpm, spm, correct, wrong, settings, settingsSignature, timestamp }`.
Fields `wpm`, `raw`, `consistency`, `language`, `punctuation`, `numbers`, `difficulty`, `lazyMode` MUST
be removed. The "pick the max" reducer (`UserProfile.tsx:109-123`) MUST select on `score`.

**AC-065** A result MUST be recorded as a personal best (`isPb: true`) iff its `score` strictly exceeds
the best stored `score` for the same `(mode2, settingsSignature)` pair.

### 3.5 Activity heatmap

Adapt `frontend/src/ts/components/pages/profile/ActivityCalendar.tsx` and
`frontend/src/ts/elements/test-activity-calendar.ts`.

**AC-066** The heatmap MUST keep monkeytype's markup skeleton exactly: `.testActivity > .wrapper` with
children `.top` (containing `.year`, `.title`, `.legend`), `.activity`, `.months`, `.daysFull`,
`.days`, `.nodata`, `.note` (`ActivityCalendar.tsx:94-136`).

**AC-067** The legend MUST read `less` then five swatches `data-level="0".."4"` then `more`
(`ActivityCalendar.tsx:118-126`).

**AC-068** The empty state MUST read `No data found.` and the footnote MUST read
`Note: All activity data is using UTC time.` (`ActivityCalendar.tsx:132-133`).

**AC-069** On `/account` the `.year` slot MUST contain a `SlimSelect` dropdown with `showSearch: false`
whose first option is `last 12 months` (value `current`) followed by one option per calendar year from
the current year down to the account-creation year, **all years selectable** — the monkeytype premium
gate (`ActivityCalendar.tsx:77-88`) MUST be removed per AC-017.

**AC-070** Changing the dropdown MUST fetch that year's activity and update the rendered calendar
in place without a full page re-render (`ActivityCalendar.tsx:105-113`).

**AC-071** On a public profile the dropdown MUST NOT be rendered and the literal text ` last 12 months`
MUST be appended to the `.title` element instead (`ActivityCalendar.tsx:57-61`).

**AC-072** The tests-per-day buckets that drive `data-level` MUST count completed croco calc tests per
UTC day (`TestActivitySchema`, `packages/schemas/src/users.ts:199-213`, unchanged).

### 3.6 Filters block

Adapt `frontend/src/ts/components/pages/account/Filters.tsx`.

**AC-073** The block MUST open with an `H3` headed by a filter icon and the text `filters`
(`Filters.tsx:243`).

**AC-074** Directly beneath it there MUST be a four-button row
(`grid gap-4 sm:grid-cols-2 lg:flex lg:justify-evenly`) with exactly the buttons `all`,
`current settings`, `advanced`, `save as preset` (`Filters.tsx:244-296`).
* `all` MUST reset every filter group to "everything selected".
* `current settings` MUST set the filters to match the settings bar's current state: the seven setting
  groups set to the currently selected value, the time group set to the current time option, `pb` set
  to both yes and no, and `date` set to `all` (adapting `fromCurrentSettings`, `Filters.tsx:380-453`).
* `advanced` MUST be a toggle whose `active` state matches the visibility of the advanced block.
* `save as preset` MUST open the simple modal titled `New Filter Preset` with a single `Preset Name`
  text input, button text `add`, persisting the current filter object.

**AC-075** A `filter presets` section (H3 with sliders icon) MUST render above the filters block
whenever the user has ≥ 1 saved preset, as a
`grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4` of preset buttons, each paired
with a trash button that opens a `Delete Filter Preset` confirmation modal
(`Filters.tsx:41-97`).

**AC-076** Beneath the four-button row there MUST be a **single-select** date button group with exactly
these five options and labels, in this order: `last day`, `last week`, `last month`, `last 3 months`,
`all time` (`Filters.tsx:298-307`). Default MUST be `all time`.

**AC-077** The advanced block MUST be revealed by a slide animation (`AnimeShow ... slide`,
`Filters.tsx:309`), MUST open with an `H3` `advanced filters` (tools icon) and a full-width
`clear filters` button that deselects everything except the date group (`Filters.tsx:310-316,368-378`).

**AC-078** The advanced block MUST contain exactly these multi-select button groups in a
`gap-4 md:grid md:grid-cols-2`, each with an icon + label heading. **The `stored value` column is
normative** (C2 canonical literals, master §2.31 gap 4); the `label` column is what the button renders:

| heading | icon | labels shown | stored values |
|---|---|---|---|
| `personal best` | crown | `yes`, `no` | `true`, `false` |
| `time` | clock | `1`, `2`, `4`, `8` | `"1"`, `"2"`, `"4"`, `"8"` (`mode2`) |
| `addition` | plus | `off`, `+100`, `+1000` | `"off"`, `"100"`, `"1000"` |
| `multiplication` | xmark / times | `off`, `12x12`, `20x20`, `100x100` | `"off"`, `"12"`, `"20"`, `"100"` |
| `division` | divide | `off`, `144/12`, `xxx/xx` | `"off"`, `"tables"`, `"threeByTwo"` |
| `fraction addition` | plus-minus | `off`, `+1/12`, `+1/xx` | `"off"`, `"12"`, `"99"` |
| `fraction multiplication` | asterisk | `off`, `on` | `false`, `true` |
| `decimals` | circle (decimal point) | `off`, `on` | `false`, `true` |
| `negatives` | minus | `off`, `on` | `false`, `true` |

**AC-079** The advanced block MUST NOT contain difficulty, mode, quote length, words, punctuation,
numbers, tags, funbox or language groups (`Filters.tsx:318-360`) — all are removed.

**AC-080** Shift-clicking any button in a multi-select group MUST switch that group to exclusively that
option (`Filters.tsx:193-200`).

**AC-081** Filter state MUST be persisted per user and restored on page load, exactly as monkeytype
persists `ResultFilters` (`packages/schemas/src/users.ts:21-60`,
`frontend/src/ts/states/result-filters.ts`). `ResultFiltersSchema` MUST be rewritten to the groups in
AC-078 plus `date`, and its keys MUST be the **C2 canonical stored literals** of AC-078's fourth column,
never the display labels (master §2.31, gap 4). Persisting display labels would make every stored filter
fail to match every stored result.

**AC-082** The **icon filter row** ("the icon filter row" in the brief) MUST render directly above the
history chart as a `flex flex-wrap justify-center gap-4 text-sub` row of icon+value pairs, one per
filter group, where a fully-selected group renders the literal value `all` and any other selection
renders the selected values comma-joined; each pair MUST carry a hover balloon naming its group
(adapting `FilterSummary`, `frontend/src/ts/components/pages/account/Charts.tsx:77-135`). The groups
shown MUST be: date, time, addition, multiplication, division, fraction addition, fraction
multiplication, decimals, negatives.

### 3.7 Charts

**AC-083** The chart block MUST render, in order and inside a `flex flex-col gap-8`: the icon filter row
(AC-082), the history chart, the histogram, the daily-activity chart
(`Charts.tsx:45-74`). All three MUST remain Chart.js via the existing
`frontend/src/ts/components/common/ChartJs.tsx` wrapper.

**AC-084 — history chart (main scatter + line chart).** Adapt
`frontend/src/ts/components/pages/account/HistoryChart.tsx`. It MUST be 400 px tall, of Chart.js type
`line`, x-axis = result index (newest at index 0), and MUST carry exactly these datasets:
* `score` points (left `score` axis, `borderWidth: 0` so only points show) — theme `main` colour;
* stepped personal-best line on the same axis, colour = bg/text blend at 0.2;
* `accuracy` points (right `acc` axis, `pointStyle: "triangle"`, `pointRadius: 3.5`) — theme `sub`;
* moving averages of window 10 and window 100 for both score and accuracy, drawn as lines with
  `pointRadius: 0`, colour-blended so the more averages are on the fainter the raw points become
  (`HistoryChart.tsx:49-132`).

**AC-085** Beneath the history chart there MUST be a button row of **five** toggles in a
`grid grid-cols-5 gap-2 text-em-xs max-[475px]:grid-cols-2`, adapting the monkeytype four
(`HistoryChart.tsx:318-345`):
`Score` (tachometer icon), `Accuracy` (bullseye icon), `Avg of 10` (chart-line icon),
`Avg of 100` (chart-line icon), and a new `Per minute` (clock icon). Each MUST persist its on/off state
in the user config array `accountChart`, whose schema MUST be **extended from 4 to 5 entries**
(`["on"|"off", ...]` of length 5, defaulting to all `"on"`). This is an amendment to the retained
config-key set in master §6.1, which annotates `accountChart` accordingly (master §2.31, gap 3); a
migration MUST pad any stored 4-element array with a fifth `"on"` on read.

**AC-086** When `Per minute` is active the score dataset MUST plot `spm` instead of `score` and the
left axis title MUST read `Score / min`; when inactive it MUST plot `score` with axis title `Score`.
Rationale: unlike monkeytype's wpm, croco calc's `score` scales with test duration, so a chart mixing
1- and 8-minute results is unreadable without this normalisation. *(ASSUMPTION — this is the only
addition to monkeytype's control set on this page and it is required for the chart to be meaningful.)*

**AC-087** The history-chart tooltip MUST show, per point: `score`, `tpm`, `accuracy`,
`correct`/`wrong`, the test duration in minutes, the enabled settings, `new personal best` when
applicable, and the date as `dd MMM yyyy HH:mm` (adapting `HistoryChart.tsx:275-303`). Duration MUST be
present even when `Per minute` is off.

**AC-088** Clicking a history-chart point MUST raise the result's `_id` and index, MUST grow the table
limit to `ceil(index / 10) * 10` if needed, MUST select the matching table row, and MUST scroll that
row to the vertical centre of the viewport (`AccountPage.tsx:76-90`).

**AC-089** A trend line MUST be rendered below the chart, left of the toggle row, reading
`Score change per hour spent: {+|-}{value}` computed by least-squares over the filtered results, and
MUST be hidden when it cannot be computed (adapting `HistoryChart.tsx:350-375`).

**AC-090 — histogram.** Adapt `frontend/src/ts/components/pages/account/HistogramChart.tsx`: 200 px
tall bar chart, x-axis = `score` buckets labelled `{start}-{end}`, y-axis titled `Tests`, beginning at
zero with `stepSize: 10`, tooltip `mode: "index"`. Bucket size MUST be a configurable constant
(default **10 score points**), replacing monkeytype's `typingSpeedUnit.histogramDataBucketSize`.

**AC-091 — time-spent chart.** Adapt
`frontend/src/ts/components/pages/account/DailyActivityChart.tsx`: 200 px tall, x-axis of type `time`
with unit `day` and display format `d MMM`, a bar dataset on the left axis titled
`Time spent (minutes)` with a dotted linear trendline, and a line dataset on the right axis titled
`Average score`. Tooltip MUST be filtered to the bar dataset and MUST list, for that day: date heading,
`Time Spent`, `Tests Completed`, `Restarts per test`, `Highest score`, `Average score`,
`Average Accuracy` — the monkeytype `Average Consistency` line MUST be removed
(`DailyActivityChart.tsx:139-174`).

### 3.8 Totals block

Adapt `frontend/src/ts/components/pages/account/TestStats.tsx`.

**AC-092** Above the grid there MUST be a centred headline row reading
`tasks answered` followed by the total task count in `p-5 text-5xl text-text`
(replacing monkeytype's `estimated words typed`, `TestStats.tsx:43-48`).

**AC-093** The totals grid MUST be a `grid grid-cols-3 gap-4` with exactly these fifteen cells in this
reading order (replacing `TestStats.tsx:49-156`):

| row | cell 1 | cell 2 | cell 3 |
|---|---|---|---|
| 1 | tests started | tests completed | time spent |
| 2 | highest score | average score | average score (last 10 tests) |
| 3 | highest tpm | average tpm | average tpm (last 10 tests) |
| 4 | highest acc | average acc | average acc (last 10 tests) |
| 5 | total correct | total wrong | total tasks |

**AC-094** Each cell MUST render its label in `text-sub` and its value in
`text-2xl leading-[1.1] md:text-3xl lg:text-5xl` (`TestStats.tsx:166-184`).

**AC-095** The `tests completed` cell MUST keep its special layout: value rendered as
`{completed}({percent}%)`, a sub-line `{ratio} restarts per completed test`, and a question-mark icon
with the balloon explaining that only the last 1000 results are shown in detail while the totals above
the filters remain complete (`TestStats.tsx:54-83`).

**AC-096** `time spent` MUST be formatted by `secondsToString(round(value), true, true)`
(`TestStats.tsx:85-91`).

**AC-097** The "last 10 tests" cells MUST be sourced from a separate query limited to the ten most
recent filtered results (`TestStats.tsx:21-23`).

### 3.9 Export CSV

**AC-098** A single `Export CSV` button with a file-csv icon MUST sit in a `grid grid-cols-3` at
`col-start-3 w-full` (right-aligned third), MUST disable itself while exporting, and MUST show the
global loader bar for the duration (`AccountPage.tsx:94-115`).

**AC-099** The export MUST include **all** results matching the current filters, not just the rows
currently loaded into the table (`AccountPage.tsx:103-108`).

**AC-100** The CSV MUST be downloaded as `results.csv` with MIME type `text/csv` and MUST have exactly
this header row, in this order (adapting `frontend/src/ts/utils/misc.ts:261-321`):

```
_id,isPb,score,correct,wrong,acc,tpm,spm,mode2,testDuration,afkDuration,restartCount,
addition,multiplication,division,fractionAddition,fractionMultiplication,decimals,negatives,
settingsId,timestamp
```

Two amendments to the original header (master §2.31): `idleDuration` → **`afkDuration`** (C37, one
persisted name); `bailedOut` → **removed** and replaced by `settingsId` (C38 — there is no bail-out
concept in a fixed-duration test, while `settingsId` is the field every eligibility question turns on and
is therefore the one worth exporting). The seven setting columns MUST carry the **C2 canonical stored
literals** (`"1000"`, `"100"`, `"threeByTwo"`, `"99"`, `true`, `true`, `true`), not display labels, so a
re-imported CSV round-trips. This header is the WP-03-owned contract referenced by C37 and C38.

The monkeytype columns `wpm`, `rawWpm`, `consistency`, `charStats`, `quoteLength`,
`incompleteTestSeconds`, `punctuation`, `numbers`, `language`, `funbox`, `difficulty`, `lazyMode`,
`blindMode`, `tags`, `mode` MUST NOT appear.

### 3.10 Results table

Adapt `frontend/src/ts/components/pages/account/Table.tsx`. It MUST remain a
`@tanstack/solid-table` `DataTable` with `id="resultList"`, `table-auto`, and the responsive text sizes
`text-xs md:text-sm lg:text-base` (`Table.tsx:53-79`).

**AC-101** The table MUST have exactly these columns, in this order:

| # | id | header | cell | sortable | hidden below |
|---|---|---|---|---|---|
| 1 | `isPb` | *(empty)* | crown icon when `isPb`, otherwise the same icon at `opacity-0` so column width is stable | no | — |
| 2 | `score` | `score` | signed integer | yes | — |
| 3 | `tpm` | `tpm` | 2 decimals | yes | `xs` |
| 4 | `acc` | `accuracy` | percentage, 2 decimals | yes | `xs` |
| 5 | `tasks` | `correct/wrong` | `{correct}/{wrong}` | no | `lg` |
| 6 | `mode2` | `time` | `{mode2} min` | no | `md` |
| 7 | `info` | `info` | icon strip, see AC-102 | no | `sm` |
| 8 | `timestamp` | `date` | two lines: `dd MMM yyyy` in `text-em-sm`, `HH:mm` in `text-em-sm text-sub` | yes | — |

**AC-102** The `info` cell MUST be a `flex gap-0.5` strip containing one fixed-width icon per **enabled**
setting on that result, each with a hover balloon naming the setting and its level. The balloon text MUST
be produced by mapping the **C2 canonical stored value** through the shared SB-024 … SB-047 label table
(e.g. stored `multiplication === "100"` renders the balloon `multiplication 100x100`); the balloon MUST
NOT be built by string-matching the display literal against the stored value (master §2.31, gap 4).
The strip is followed by a chart-line button that opens the mini result chart modal. The
chart button MUST be disabled with the balloon
`Graph history is not available for long tests` when no chart data was stored, and
`View graph` otherwise (`Table.tsx:156-229`).

**AC-103** Default sort MUST be `timestamp` descending; clearing the sort MUST fall back to
`timestamp` descending (`AccountPage.tsx:29-35`, `Table.tsx:55-64`).

**AC-104** The table MUST render 10 rows initially; the `load more` button MUST add 10 more per click,
MUST be full width and centred, and MUST be disabled while loading or when no further rows exist
(`AccountPage.tsx:27,127-135`).

**AC-105** The row selected via the history chart (AC-088) MUST be highlighted using the `text-main`
row-selection class set (`Table.tsx:71-78`).

**AC-106** The table's empty fallback MUST read `No data found. Check your filters.`
(`Table.tsx:70`).

---

## 4. Leaderboard (`/leaderboards`)

Adapt `frontend/src/ts/components/pages/leaderboard/*`.

### 4.1 Layout

**AC-107** The page MUST be a `content-grid flex flex-col gap-8 lg:flex-row` with a left sidebar of
`w-full shrink-0 lg:w-60 2xl:w-75` and a `flex w-full flex-1 flex-col gap-8` main column
(`LeaderboardPage.tsx:172-190`).

**AC-108** The page MUST be reachable without authentication; only the "You" row and the friends-only
switch require a signed-in user (`route-controller.ts:65-69`, `LeaderboardPage.tsx:103-106,200-203`).

### 4.2 Sidebar

**AC-109** The sidebar MUST consist of `mb-4 grid gap-4 rounded-xl bg-sub-alt p-4` groups whose buttons
are left-aligned (`justify-start px-[0.75em]`) with a leading icon, and whose selected entry uses the
`active` button state (`Sidebar.tsx:107-130`).

**AC-110** Group 1 (type) MUST contain exactly three buttons, in this order:
`all-time` (globe icon), `weekly xp` (calendar-day icon), `daily` (sun icon). The monkeytype label
`all-time english` MUST become `all-time` (`Sidebar.tsx:55-67`).

**AC-111** Group 2 (audience) MUST contain `everyone` (users icon) and `friends only` (user-friends
icon), and MUST be rendered only when the visitor is authenticated and connections are enabled
(`Sidebar.tsx:68-77`).

**AC-112** Group 3 (time) MUST contain exactly two buttons, `time 4` and `time 8`, each with a clock
icon, and MUST be hidden when the selected type is `weekly xp`
(`Sidebar.tsx:79-91`). No other duration MUST be offered.

**AC-113** There MUST NOT be a language group anywhere on this page. `getLanguageButtons`
(`Sidebar.tsx:203-215`), the `language` field of `Selection`
(`frontend/src/ts/states/leaderboard-selection.ts`), the language segment of leaderboard IDs, and the
`language` level of the leaderboard DAL keys MUST all be removed.

**AC-114** The valid-leaderboard matrix MUST be
`{ allTime: { time: ["4","8"] }, weekly: {}, daily: { time: ["4","8"] } }`, replacing the hard-coded
`{ time: { "15": ["english"], "60": ["english"] } }` at `Sidebar.tsx:231-238` and the
configuration-driven daily rules. `ValidModeRuleSchema`'s `language` field
(`packages/schemas/src/configuration.ts` → `dailyLeaderboards.validModeRules`) MUST be dropped.

**AC-115** Selecting a type MUST reset the page index to 0 (`LeaderboardPage.tsx:113-116`), and the
current selection + page MUST be reflected in the URL query string
(`LeaderboardPage.tsx:69-74`).

### 4.3 Title and reset countdown

**AC-116** The title MUST be an `H2` in `text-2xl text-text md:text-3xl xl:text-4xl` reading
`{All-time|Weekly XP|Daily}{ Time 4|Time 8}{ Friends} Leaderboard` — i.e. monkeytype's title
(`Title.tsx:23-40`) with the language segment removed.

**AC-117** For the daily and weekly boards a subtitle row MUST render the UTC period
(`EEEE, do MMMM yyyy` for daily, `start - end` for weekly) with a hover balloon showing the same period
in local time, a `bg-sub-alt` separator pip, and a text button reading `show yesterday` /
`show today` (daily) or `show last week` / `show this week` (weekly) with a backward/forward icon
(`Title.tsx:42-107`).

**AC-118** A next-reset/next-update line MUST render above the table on the left of a
`grid-cols-1 sm:grid-cols-2` row, in `text-sub`, ticking once per second
(`NextUpdate.tsx:19-25`, `LeaderboardPage.tsx:256-278`), with exactly these three behaviours
(`NextUpdate.tsx:27-52`):
* **all-time** → `Next update in: {mm:ss}`, counting down to the next 15-minute boundary;
* **daily** → `Next reset in: {hh:mm:ss}`, counting down to `endOfDay` UTC;
* **weekly xp** → `Next reset in: {d hh:mm:ss}`, counting down to `endOfWeek` UTC with
  `weekStartsOn: 1` (Monday).

**AC-119** The all-time leaderboards MUST actually be recomputed on the cron schedule
`30 14/15 * * * *` so the countdown in AC-118 is truthful; the job MUST rebuild the `time 4` and
`time 8` boards (adapting `backend/src/jobs/update-leaderboards.ts:6,59-69`, which today rebuilds
`60` then `15`). The Discord announcement queue call (`update-leaderboards.ts:51-55`) MUST be removed
(Discord is deferred).

### 4.4 Eligibility — exact definition

**AC-120** A **user** MUST be leaderboard-eligible iff all of the following hold (adapting
`backend/src/api/controllers/result.ts:506-509`):
1. `user.banned !== true`;
2. `user.lbOptOut !== true`;
3. `user.timeSpent > configuration.leaderboards.minTimeTyping` (strict `>`), where
   `minTimeTyping` is a server-configuration value (`packages/schemas/src/configuration.ts:113-119`)
   whose croco calc default MUST be **7200** seconds (2 hours);
4. the check MUST be bypassed entirely in the dev environment, as monkeytype does
   (`result.ts:509`).

**AC-121** A **result** MUST be eligible for the all-time and daily speed leaderboards iff **all** of:
1. the submitting user is leaderboard-eligible per AC-120; **and**
2. `result.mode2 === "4" || result.mode2 === "8"`; **and**
3. `result.settingsId === LEADERBOARD_SETTINGS_ID` — i.e., in the **C2 canonical stored literals**,
   `addition === "1000"` **and** `multiplication === "100"` **and** `division === "threeByTwo"` **and**
   `fractionAddition === "99"` **and** `fractionMultiplication === true` **and** `decimals === true`
   **and** `negatives === true`; **and**
4. *(struck by master C38 — see below)*; **and**
5. the result passed the standard anti-cheat/validation pipeline that already gates
   `validResultCriteria` (`result.ts:514-519`), which per ME-174 … ME-183 now includes engine
   regeneration and the numeric plausibility thresholds.

Amendments, both binding (master §2.31):
* **C4** — the field is `settingsId` and the constant is `LEADERBOARD_SETTINGS_ID`
  (`"1000:100:threeByTwo:99:1:1:1"`); `settingsSignature` / `DEFAULT_SETTINGS_SIGNATURE` are struck.
* **C2 (gap 4)** — the value literals in clause 3 are the stored ones above, **not** the display strings
  `100x100` / `xxx/xx` / `1/xx` / `"on"`. Written against the display strings, clause 3 never matches and
  no result is ever leaderboard-eligible.
* **C38 (gap 6)** — clause 4 is **struck**: croco calc has no bail-out concept (see below). Eligibility is
  clauses 1, 2, 3 and 5 only.

The comparison in (3) MUST be a single string equality against the shared constant — it MUST NOT be
re-derived per call site.

**AC-187 (added by master C38, gap 6)** croco calc has **no "bailed out" concept**. `bailedOut` MUST NOT
appear in `ResultBaseSchema` / `CompletedEventSchema`, in the CSV (AC-100), in the results table, in the
eligibility predicate (AC-121.4, struck) or in the command palette (C14's keep-list, amended). Reason:
monkeytype's bail-out exists for open-ended word/quote/zen runs, where a user may want to end early and
still save; every croco calc test is a fixed-duration timer, so the only ways to end a run are the timer
expiring (a normal, saveable result) and restarting (CP-088, recorded as an incomplete test and never
saved as a result). A field that can only ever be `false` would be a permanent trap for the eligibility
predicate. AC-032's hedge ("if doc 03 defines a 'bailed out early' concept") is hereby resolved: it does
not, and none is to be added.

**AC-122** A result failing AC-121 MUST still be saved, still count towards XP, personal bests, the
activity heatmap and the results table. Only the speed-leaderboard submission is skipped.

**AC-123** Weekly-XP leaderboard eligibility MUST be: the user is leaderboard-eligible per AC-120
**and** the awarded XP for that result is `> 0` (`result.ts:623`). The default-settings restriction
(AC-121.3) and the 4/8-minute restriction (AC-121.2) MUST **NOT** apply to the weekly XP board.
Rationale: the weekly board has no time selector at all (AC-112 hides the group), and restricting it
would make the weekly totals disagree with the XP shown on the user's own profile.
*(ASSUMPTION — the brief's "only default settings count" sentence sits in the paragraph about the time
4/8 options, which only exist on the speed boards; this is flagged for explicit sign-off.)*

### 4.5 The "You" row

Adapt `frontend/src/ts/components/pages/leaderboard/UserRank.tsx`.

**AC-124** The row MUST be an `h-18 rounded bg-sub-alt` block rendered above the table, between the
title and the pagination row (`LeaderboardPage.tsx:200-245`, `UserRank.tsx:70-72`).

**AC-125** While the rank query is in flight the block MUST show a centred `text-2xl` loading circle
(`UserRank.tsx:72-75`).

**AC-126** When the user is ranked, the block MUST render a **single-row, header-less instance of the
leaderboard table itself** (same columns, same formatting) with the name cell overridden
(`UserRank.tsx:112-120`).

**AC-127** The overridden name cell MUST read `You (Top {X}%)` where
`X = (rank / totalEntries) * 100` formatted to **2 decimal places**; when `rank === 1` it MUST instead
read `You (GOAT)` (`UserRank.tsx:27-37`).

**AC-128** Beneath that, on `sm` and up only, an all-time board MUST render the rank delta since the
user last viewed the board, as `( {=|↑N|↓N} since you last checked)` using angle-up / angle-down icons
(`UserRank.tsx:44-65`). The stored "last seen rank" MUST be updated after the rank query succeeds
(`LeaderboardPage.tsx:76-81,130-149`) and MUST be keyed by `(mode2)` only — the language key
(`updateLbMemory("time", mode2, "english", ...)`, `LeaderboardPage.tsx:141-147`) MUST be dropped.

**AC-129** When the user is **not** ranked the block MUST render a centred `text-sub` message chosen by
this priority (`UserRank.tsx:78-110`):
1. opted out → `You have opted out of the leaderboards.`
2. banned → `Your account is banned.`
3. `timeSpent < minTimeTyping` → `Your account must have {duration} spent to be placed on the
   leaderboard.`
4. a minimum score exists for the board → `Not qualified (min score required: {minScore})`
5. otherwise → `Not qualified`

**AC-130** The croco calc back end MUST expose `minScore` (the score of the last entry of a full board)
where monkeytype exposes `minWpm` (`backend/src/api/controllers/leaderboard.ts:160`,
`LeaderboardPage.tsx:218-221`).

### 4.6 Table and columns

Adapt `frontend/src/ts/components/pages/leaderboard/Table.tsx`. `id` MUST remain
`leaderboardTable`; the responsive padding/text ladder at `Table.tsx:49-55` MUST be kept verbatim.

**AC-131** Speed boards (all-time, daily) MUST have exactly these columns, in this order:

| # | column | header | cell |
|---|---|---|---|
| 1 | `friendsRank` | user-friends icon (aria-label `Friends rank`) | rank number, or a **crown icon when the value is 1** |
| 2 | `rank` | hashtag icon (users icon when friends-only), aria-label `Global rank` | rank number, or a **crown icon when the value is 1** |
| 3 | `name` | `name` | avatar + name + badges/flags, linking to `/profile/{name}` |
| 4+5 | `score` + `acc` | `score` / `accuracy` | two columns at `xl` and above; below `xl` merged into one right-aligned cell with score on top and accuracy beneath in `text-sub` |
| 6+7 | `tpm` + `tasks` | `tpm` / `correct/wrong` | same responsive-pair treatment; the merged cell is itself hidden below `xs` |
| 8 | `timestamp` | `date` | two lines `dd MMM yyyy` / `HH:mm`, right-aligned |

Columns 4–7 MUST use the existing `defineResponsivePair` helper (`Table.tsx:185-252`) unchanged.

**AC-132** Column 1 MUST be present **only** when the friends-only filter is active; it MUST be removed
from the column list otherwise (`Table.tsx:328-331`).

**AC-133** Every leaderboard column MUST be non-sortable (`Table.tsx:333-334`).

**AC-134** The signed-in user's own row MUST be highlighted with the `text-main` row-selection class set
(`Table.tsx:56-66`).

**AC-135** The weekly-XP board MUST have exactly these columns: `friendsRank` (friends-only only),
`rank`, `name`, the responsive pair `xp gained` + `time spent`, and `date` bound to
`lastActivityTimestamp` with a hover balloon giving the relative distance to now
(`Table.tsx:337-413`). `xp gained` MUST print raw integers below 1000 and abbreviated values at and
above 1000; `time spent` MUST use `secondsToString(round(v), true, true, ":")`.

**AC-136** When a board page has no entries the table MUST render a
`flex flex-row items-center justify-center rounded bg-sub-alt p-4 text-text` block reading
`No entries found ¯\_(ツ)_/¯` (`Table.tsx:125-131`).

**AC-137** The crown for rank 1 MUST be the same crown icon used for personal bests (AC-101 row 1) so
the two reads are visually consistent.

### 4.7 Pagination

**AC-138** Page size MUST be **50** entries (`frontend/src/ts/states/leaderboard-selection.ts:11`).

**AC-139** A navigation control MUST render **twice**: once above the table (right-aligned, sharing a
row with the next-reset text) and once below it (`LeaderboardPage.tsx:256-303`). Clicking a page button
in the lower control MUST additionally scroll the window to the top
(`LeaderboardPage.tsx:296-299`).

**AC-140** The navigation control MUST contain, left to right (`Navigation.tsx:21-96`):
1. a spinner shown only while the entries query is loading/fetching/refetching;
2. a crown button → jump to page 0, disabled on page 0;
3. a user button → jump to the page containing the signed-in user and scroll that row into view;
   rendered only when the user's page is known, disabled when already on it;
4. a chevron-left button → previous page, disabled on page 0;
5. a hashtag button labelled with the **1-based** current page number, opening a `Go to page` modal
   with a numeric input (minimum 1) and button text `Go`; disabled when there is ≤ 1 page;
6. a chevron-right button → next page, disabled on the last page.

**AC-141** The user's page MUST be computed as `ceil(userRank / 50) - 1`, using `friendsRank` when the
friends-only filter is active (`LeaderboardPage.tsx:121-128`).

**AC-142** The next page MUST be prefetched whenever the leaderboard page is open
(`LeaderboardPage.tsx:57-67`), and the daily/weekly caches MUST be invalidated when the page is closed
(`LeaderboardPage.tsx:46-55`).

---

## 5. Friends page (`/friends`)

Adapt `frontend/src/ts/components/pages/connections/*`. Route exists at
`route-controller.ts:144-155`.

**AC-143** The page MUST require authentication and redirect to `/login` otherwise
(`route-controller.ts:144-155`), and MUST be a `content-grid grid gap-8` containing the pending-requests
section above the friends list (`FriendsPage.tsx:5-14`).

**AC-144** The pending-requests section MUST be rendered **only** when at least one incoming request
exists (`PendingRequests.tsx:26`). When shown it MUST have an `H2` reading `Incoming Requests` with a
user-plus icon, and a `DataTable` with `id="pendingConnections"`.

**AC-145** Pending-request columns MUST be exactly: `user` (name linking to the profile, no avatar,
sortable), `date` (`{age} ago` with a hover balloon `since {dd MMM yyyy HH:mm}`, sortable, hidden below
`md`), and an unlabelled action cell containing three buttons right-aligned with `gap-2`: check
(balloon `accept`), times (balloon `reject`), ban (balloon `block user`)
(`PendingRequests.tsx:43-96`).

**AC-146** The friends list MUST have a header row (`items-bottom flex`) containing an `H2` `Friends`
with a fixed-width user-friends icon, a loading circle shown while refetching, and — pushed to the right
with `ml-auto` — an `add friend` button with a plus icon (`FriendsList.tsx:46-108`).

**AC-147** The `add friend` button MUST open a simple modal titled `Add a friend` with a single text
input placeholdered `user name`, button text `request`, and asynchronous validation debounced by
**1000 ms** that rejects with exactly these messages (`FriendsList.tsx:56-107`):
* own username → `That is not how you make friends.`
* the target has blocked you → `{name} has blocked you from sending friend requests.`
* you have blocked the target → `You have blocked {name}. Unblock them to sent a friend request in the
  account settings.`
* request already pending → `You have already sent a friend request to {name}`
* already friends → `You are already friends with {name}`
* unknown user → `Unknown user`

**AC-148** The friends table (`id="friendsList"`, `bodyCellClass="text-xs sm:text-sm xl:text-base"`)
MUST have exactly these columns, all sortable unless noted:

| # | column | header | cell | hidden below |
|---|---|---|---|---|
| 1 | `name` | *(none)* | avatar + name + badges, linking to `/profile/{name}` | — |
| 2 | `lastModified` | `friends for` | short age, balloon `since {dd MMM yyy HH:mm}` | — |
| 3 | `xp` | `level` | level from XP, balloon `total xp: {formatXp}` | — |
| 4 | `completedTests` | `tests` | `{completed}/{started}`, balloon `{pct}% ({ratio} restarts per completed test)` | `lg` |
| 5 | `timeSpent` | `time spent` | `secondsToString(round(v), true, true)` | `sm` |
| 6 | `top4.score` | `time 4 pb` | score with accuracy beneath at `opacity-50`; balloon lists score / tpm / acc / date on separate lines | `lg` |
| 7 | `top8.score` | `time 8 pb` | same as column 6 | `lg` |
| 8 | `connectionId` | *(none)* | user-times button, balloon `remove friend`, opening a confirm modal titled `remove user {name}?` with button text `remove friend` and success message `User {name} removed` | — |

This replaces monkeytype's `streak`, `time 15 pb` and `time 60 pb` columns
(`FriendsList.tsx:207-270`) per AC-015 and the 4/8-minute rule.

**AC-149** The empty state MUST be a centred `text-sub` line reading exactly
`You don't have any friends :(` (`FriendsList.tsx:117-120`).

**AC-150** Connection states MUST remain `pending` / `accepted` / `blocked` with `incoming` /
`outgoing` types (`packages/schemas/src/connections.ts:4-23`), and the friends feature MUST remain
gated by the `connections.enabled` server-configuration flag
(`packages/schemas/src/configuration.ts` → `connections`).

**AC-151** The profile-menu Friends entry MUST show a notification bubble whenever ≥ 1 incoming request
is pending (`frontend/src/ts/components/layout/header/AccountMenu.tsx:48-52`).

---

## 6. Public profile page (`/profile/:uidOrName`)

Adapt `frontend/src/ts/components/pages/profile/ProfilePage.tsx` and `UserProfile.tsx`.

**AC-152** The route MUST be `/profile/:uidOrName`, MUST be reachable without authentication, and MUST
force a page reload on parameter change (`route-controller.ts:131-143`).

**AC-153** The page MUST render the **same** `UserProfile` component tree as `/account` but **without**
the `isAccountPage` flag (`ProfilePage.tsx:21-37`, `MyProfile.tsx:7-15`), which by construction means:
header card (AC-045…AC-052), leaderboard-ranks strip (AC-055…AC-058), the two PB cards
(AC-059…AC-062) **without** the ellipsis rail, and the activity heatmap **without** the year dropdown
(AC-071).

**AC-154** The right-hand action rail MUST instead contain (`UserDetails.tsx:126-160`):
* a flag button (balloon `Report user`, positioned left) shown for any profile that is not the
  visitor's own; clicking it while signed out MUST raise the notice
  `You must be logged in to submit a report`, otherwise it MUST open the user-report modal;
* a user-plus button (balloon `Send friend request`) shown only when the visitor is authenticated, is
  not viewing their own profile, and has no existing connection to that user.

**AC-155** When the profile has opted out of the leaderboards, a centred `text-xs text-sub` note MUST
be rendered beneath the PB cards reading exactly: `Note: This account has opted out of the
leaderboards, meaning their results aren't verified by the anticheat system and may not be legitimate.`
(`UserProfile.tsx:46-52`).

**AC-156** Banned profiles MUST render in the `basic` layout variant with bio, socials, badges and the
ranks strip suppressed (`UserDetails.tsx:39,46`, `UserProfile.tsx:26`).

**AC-157** A failed profile lookup MUST render a `text-error` line with a times icon reading
`User {name} not found` (`ProfilePage.tsx:29-34`).

**AC-158** The activity heatmap on a public profile MUST be rendered only when that user has enabled
`showActivityOnPublicProfile` (`packages/schemas/src/users.ts` →
`UserProfileDetailsSchema.showActivityOnPublicProfile`); the toggle MUST live in the edit-profile modal.

**AC-159** `/profile` with no name MUST render the profile-search page: a centred form with a single
username input (auto-focused when the page opens) and a submit button that navigates to
`/profile/{username}` (`ProfileSearchPage.tsx:17-50`, `route-controller.ts:125-130`). SHOULD-level, not
MUST — it is not named in the brief but is the natural landing for the bare route.

---

## 7. Account settings (`/account-settings`)

Adapt `frontend/src/ts/components/pages/account-settings/*`.

**AC-160** The page MUST require authentication (`route-controller.ts:111-124`) and MUST be a
`content-grid flex flex-col gap-8 md:flex-row` with a `w-full shrink-0 md:w-60` sidebar and a
`flex w-full flex-1 flex-col gap-8` content column (`AccountSettingsPage.tsx:26-38`).

**AC-161** The sidebar MUST be a `flex flex-col gap-4 rounded-double bg-sub-alt p-4 md:items-start`
list of text-variant buttons with leading icons, the current tab shown `active`
(`AccountSettingsPage.tsx:40-57`).

**AC-162** There MUST be exactly **four** tabs, in this order, with these labels and icons
(`frontend/src/ts/states/account-settings.ts:12-30`):

| key | label | icon |
|---|---|---|
| `account` | `account` | user |
| `authentication` | `authentication` | key |
| `blockedUsers` | `blocked users` | ban |
| `dangerZone` | `danger zone` | exclamation-triangle |

**AC-163** The `apeKeys` tab MUST be removed **entirely**: the enum member and its entry in
`accountSettingsTabs` (`states/account-settings.ts:12-30`), the `getLastGeneratedApeKey` /
`isApeKeysDenied` signals (`states/account-settings.ts:8-52`), the `ApeKeysTab` component
(`frontend/src/ts/components/pages/account-settings/ApeKeysTab.tsx`, 209 lines), the tab entry in
`tabContent` (`AccountSettingsPage.tsx:17-23`), the backend controller
(`backend/src/api/controllers/ape-key.ts`), the DAL (`backend/src/dal/ape-keys.ts`), the schemas
(`packages/schemas/src/ape-keys.ts`) and the `apeKeys` configuration block
(`packages/schemas/src/configuration.ts`) MUST all be deleted. No ape-key artefact may remain anywhere
in the repository.

**AC-164** The active tab MUST be readable from and written to the URL as `?tab={key}` via
`history.replaceState`, and only while the account-settings page is the active page
(`states/account-settings.ts:32-73`).

**AC-165** Every settings item MUST use the existing `Section` wrapper (title + icon + description +
optional right-hand button, `breakpoints="narrow"` unless `fullWidth`)
(`frontend/src/ts/components/pages/account-settings/utils.tsx:6-29`).

### 7.1 Account tab

**AC-166** The account tab MUST contain exactly these three sections, in this order (adapting
`AccountTab.tsx:18-29`):

1. **`update account name`** (user icon) — description `Change the name of your account.` plus, in
   `text-error`, `You can only do this once every 30 days.`; button `update name` opening the
   update-name modal (`AccountTab.tsx:99-114`).
2. **`opt out of leaderboards`** (crown icon) — description explaining that this removes the account
   from all leaderboards, plus `You can't undo this action!` in `text-error`; button `opt out` opening
   the re-auth confirmation modal. Once opted out, the section MUST render disabled with the
   exclamation-triangle line `You have opted out of leaderboards.` (`AccountTab.tsx:142-163`). The
   monkeytype wording about stenography and the anticheat MUST be replaced with croco-calc-appropriate
   wording.
3. **`reset personal bests`** (crown icon) — description
   `Resets all your personal bests (but doesn't delete any tests from your history).` plus
   `You can't undo this!` in `text-error`; button `reset personal bests` opening the re-auth
   confirmation modal (`AccountTab.tsx:165-179`).

**AC-167** The **discord integration** section (`AccountTab.tsx:31-97`) MUST NOT be present in v1. It
is recorded as **DEFERRED** together with the rest of the Discord work (bot, avatar sync, role rewards,
`backend/src/utils/discord.ts`, `backend/src/queues/george-queue.ts`).

**AC-168** The **set streak hour offset** section (`AccountTab.tsx:116-140`) MUST NOT be present, per
AC-015.

### 7.2 Authentication tab

**AC-169** The authentication tab MUST contain exactly four sections, in this order (adapting
`AuthenticationTab.tsx:19-28`): password authentication, Google, GitHub, revoke all tokens. All three
auth methods are **in scope for v1** — none may be stubbed or hidden behind a flag.

**AC-170** The **password authentication settings** section (key icon, description
`Add password authentication, update your password or email.`) MUST render
(`AuthenticationTab.tsx:30-71`):
* when password auth is **not** linked: a single full-width button
  `add password authentication`;
* when it **is** linked: a `flex flex-col gap-2` of full-width buttons `update email`,
  `update password`, and — **only when at least one other auth method is linked** —
  `remove password authentication`.

**AC-171** The **Google** and **GitHub** sections MUST each render one button
(`AuthenticationTab.tsx:73-97`): `add {provider} authentication` when not linked (starting the Firebase
provider link flow), or `remove {provider} authentication` when linked. The remove button MUST be
**disabled** when no other auth method is linked.

**AC-172** It MUST be impossible, through any path in this tab, to remove the last remaining
authentication method from an account.

**AC-173** The **revoke all tokens** section (user-slash icon) MUST describe the action, warn in
`text-error` `This will log you out of all devices.`, and expose an error-coloured button
(`--themable-button-bg:var(--error-color)`, `--themable-button-text:var(--bg-color)`) reading
`revoke all tokens` that opens the re-auth confirmation modal (`AuthenticationTab.tsx:99-118`).

**AC-174** Every destructive or credential-changing action in this tab MUST require Firebase
re-authentication first (`frontend/src/ts/components/modals/account-settings/ReauthConfirmModals.tsx`).

### 7.3 Blocked users tab

**AC-175** The tab MUST be a single `fullWidth` section titled `blocked users` (ban icon) with the
description `Blocked users cannot send you friend requests.` (`BlockedUsersTab.tsx:21-43`).

**AC-176** When the block list is empty it MUST render the paragraph
`You have not blocked any users.` (`BlockedUsersTab.tsx:36-38`).

**AC-177** Otherwise it MUST render a `DataTable` with `id="blockedUsers"` and exactly three columns:
`name` (linking to the profile, no avatar), `blocked on` (`dd MMM yyyy HH:mm`), and an unlabelled
trash-alt button with balloon `unblock user` that opens a confirmation modal titled
`Unblock user {name}?` with button text `unblock` and success message `User {name} unblocked`
(`BlockedUsersTab.tsx:46-91`).

### 7.4 Danger zone tab

**AC-178** The tab MUST contain exactly two sections in this order (`DangerZoneTab.tsx:7-54`):
1. **`reset account`** (redo-alt icon) — `Completely resets your account to a blank state.` plus
   `You can't undo this action!` in `text-error`; error-coloured button `reset account`.
2. **`delete account`** (trash icon) — `Deletes your account and all data connected to it.` plus
   `You can't undo this action!` in `text-error`; error-coloured button `delete account`.

**AC-179** Both buttons MUST use the error colour override
(`[--themable-button-bg:var(--error-color)] [--themable-button-text:var(--bg-color)]`) and both MUST go
through the re-auth confirmation modal.

**AC-180** `delete account` MUST delete the user document, all results, all personal bests, all
connections (in both directions), all leaderboard entries, and the Firebase auth user.

---

## 8. Profile-button hover menu

Adapt `frontend/src/ts/components/layout/header/AccountMenu.tsx`.

**AC-181** The menu MUST be absolutely positioned at `right-0` with `z-1000`, MUST be
`pointer-events-none opacity-0` by default and transition to visible over **125 ms**, and MUST be
separated from the trigger by a 12 px (`h-3`) invisible bridge so the pointer can travel from the
avatar into the menu without closing it (`AccountMenu.tsx:18-26`).

**AC-182** The menu panel MUST be a `grid grid-flow-row rounded bg-sub-alt ring-6 ring-bg` at
`text-xs`, with each item a full-width, left-aligned button
(`w-full justify-start px-3 py-2 whitespace-nowrap gap-2 bg-transparent`)
(`AccountMenu.tsx:14-15,23-26`).

**AC-183** The menu MUST contain exactly these five entries, in this order, with these labels, icons
and targets (`AccountMenu.tsx:27-85`):

| # | label | icon | action |
|---|---|---|---|
| 1 | `User stats` | chart-line | client-side navigate to `/account` |
| 2 | `Friends` | user-friends | client-side navigate to `/friends`; carries the pending-request notification bubble (AC-151); rendered only when connections are enabled |
| 3 | `Public profile` | globe | client-side navigate to `/profile/{own name}` |
| 4 | `Account settings` | cog | client-side navigate to `/account-settings` |
| 5 | `Sign out` | sign-out-alt | call `signOut()` |

**AC-184** Entries 1–4 MUST be real router links (`router-link` attribute) so they are middle-clickable
and open in a new tab correctly; they MUST NOT be `onClick`-only handlers.

**AC-185** The menu MUST be shown only when the visitor is authenticated; when signed out the header
avatar MUST link to `/login` and the menu MUST NOT be mounted.

**AC-186** The menu MUST be reachable by keyboard: focusing the profile button MUST open it and the
five entries MUST be tab-navigable in the order given.

---

## 9. Ambiguities, assumptions and deferrals

### 9.1 Assumptions made (each needs sign-off, none silently guessed)

| # | Ambiguity in the brief | Chosen reading | Where |
|---|---|---|---|
| A1 | The brief lists only score / correct / wrong / accuracy / tpm as results-page metrics; it never says what happens to consistency, raw, chars. | Drop consistency, raw wpm, charStats, keyConsistency, burst everywhere. | AC-007 |
| A2 | "Only runs made with the DEFAULT settings count" — does the time setting count as part of "default settings"? | No: the leaderboard offers time 4 **and** 8, so "default settings" = the seven arithmetic controls only. | AC-012, AC-121 |
| A3 | Does the default-settings restriction apply to the **weekly XP** board as well? | No — the weekly board has no time selector and restricting it would make weekly totals disagree with profile XP. Flagged for explicit sign-off. | AC-123 |
| A4 | The brief says to "adapt the 15/30/60/120 seconds and 10/25/50/100 words grids… propose the concrete grid" — the second axis is undefined. | Two cards, both 1/2/4/8 minutes: left = default settings, right = current settings, with captions. | AC-060 |
| A5 | Streaks are never mentioned in the brief but exist throughout monkeytype's profile, friends table, account settings and XP formula. | Drop streaks entirely in v1; the daily XP bonus preserves the daily-return incentive. | AC-015 |
| A6 | Tags exist in monkeytype's results table, filters and PBs; the brief's settings surface has no tags. | Drop tags entirely. | AC-016 |
| A7 | `score` is duration-dependent, so a history chart mixing 1- and 8-minute results is unreadable, but the brief mandates absolute `score` as the headline metric. | Store both `score` and `spm`; add a fifth chart toggle `Per minute` that switches the axis. This is the only control added beyond monkeytype's set on these pages. | AC-006, AC-085, AC-086 |
| A8 | The brief lists "keyboard" nowhere but monkeytype's profile has a keyboard field. | Drop `keyboard`, keep `bio` and socials. | AC-052 |
| A9 | "Time spent" vs monkeytype's "time typing" wording. | Rename globally to "time spent". | AC-014 |
| A10 | Activity heatmap year dropdown is premium-gated in monkeytype; croco calc has no premium. | All years since account creation are selectable for everyone. | AC-017, AC-069 |
| A11 | `/profile` with no username is not mentioned in the brief. | Keep monkeytype's profile-search page, at SHOULD level. | AC-159 |
| A12 | Histogram bucket size is derived from the typing-speed unit in monkeytype. | Fixed configurable constant, default 10 score points. | AC-090 |

### 9.2 Blockers / cross-document dependencies

* **B1 — Metric names are cross-cutting.** AC-001…AC-014 define field names (`score`, `correct`,
  `wrong`, `acc`, `tpm`, `spm`, `timeSpent`, `settings`, `settingsSignature`) that doc 03 (test and
  results pages) and the backend/contracts doc MUST adopt verbatim. If another document names these
  differently, this document wins for the persisted schema and the divergence must be reconciled before
  implementation starts.
* **B2 — `DEFAULT_SETTINGS_SIGNATURE` (AC-011) must match the settings-bar defaults doc exactly.** It
  encodes the brief's defaults; if the settings-bar document changes any default value, AC-011 and every
  historical leaderboard entry are invalidated.
* **B3 — The header XP bar** (`AccountXpBar.tsx`) is owned by doc 03 but MUST consume exactly the
  breakdown keys of AC-036.
* **B4 — Anti-cheat.** AC-121.5 defers to whatever result-validation pipeline the backend document
  defines; if none is defined, leaderboard eligibility reduces to AC-121.1–.4 and that must be an
  explicit decision, not an omission.

### 9.3 Recorded as deferred (not built in v1)

* Discord integration in the account tab, Discord avatars on the profile, and the Discord announcement
  hook in the all-time leaderboard cron (AC-047, AC-119, AC-167).
* Advertisement slots on the account page (AC-042).
* Ko-fi / Patreon links (belongs to the info/support-modal document).
* Badges as an earnable reward (retained as a render-only capability, AC-018).
* Streaks (AC-015) — recorded here as a candidate post-v1 feature since the XP formula has a clean slot
  for a streak modifier.
