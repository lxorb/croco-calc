# croco calc — Authoritative Requirements Specification

**Status:** authoritative. Supersedes the seven source documents wherever this file rules on a conflict.
**Date:** 2026-08-03
**Revision:** **6** — records **C46**, the user's **mathematical typography** decision (**D4**): fractions
MUST be displayed as real stacked fractions rather than with a `/`, and the in-run screen MUST be typeset as
mathematics throughout. `docs/requirements/07-test-screen-redesign.md` grows a §14 and extends to
`TR-001 … TR-335`. C46 **amends ME-130** (its prohibition on stacked rendering had exactly one stated
reason — the wrapping word-row layout — which C45 had already deleted) and **strikes TR-029** and **amends
TR-145** inside doc 07, each struck in place with a pointer. No engine version bump: `packages/math-engine`
is not modified, and the string form `n/d` remains the encoding used by the task log, the event log and
ME-174's server-side regeneration. C29, CP-036 / ME-152 and ME-153 remain upheld.
**Revision 5** — records **C45**, the user's in-run test screen redesign (decision **D3**), and adds
`docs/requirements/07-test-screen-redesign.md` (`TR-001 … TR-262`) as a seventh source document, authoritative
for the in-run experience. Every requirement C45 withdraws is struck **in §2.31 with a pointer**, never edited
away; the earlier rulings C11 and C12 keep their original text in §2 and are marked struck there too. The
chrome (header, settings bar, footer, results page, account pages, themes) is unchanged, and CP-036 / ME-152,
ME-153 and C29 are explicitly upheld.
**Revision history (earlier revisions, retained):**
**Revision 2** — incorporates an adversarial completeness review. 23 new requirements were added to the
source documents (ME-179…184, SB-215, CP-058a, CP-191…196, AC-187, INF-058a, INF-086a, INF-151…156), seven
new contradiction rulings (C36…C42), two new open questions (OQ-15, OQ-16), a residual-ownership section
(§6.2), a full coverage map (§6.3) and ten new DoD items (DoD-04a, DoD-13a, DoD-19a, DoD-45a, DoD-45b,
DoD-49…DoD-53). All original IDs are unchanged; four existing DoD items (02, 04, 07, 19) and the exit criteria
of WP-03, WP-08, WP-11 and WP-12 were corrected in place.
**Sources:** `docs/requirements/01-math-engine.md` … `docs/requirements/07-test-screen-redesign.md`
**Total requirements consolidated:** **1448** (1113 after revision 3's correction, plus doc 07's 335)

This document does three things and nothing else:

1. It **indexes** every requirement ID from the seven source documents and declares them all binding.
2. It **resolves** every contradiction between those documents, by ID, with a ruling and a reason.
3. It defines the **assumptions**, **blockers**, **deferred work**, **work breakdown** and **definition of done**
   for the next stage.

It does not restate the source requirements. The source documents remain the detailed specification and
MUST be read by implementers. Where this document rules against a source requirement, **this document wins**.

---

## 1. Requirement index and ID namespace

| Source document | Prefix | ID range | Count | Owns |
|---|---|---|---|---|
| `01-math-engine.md` | `ME-` | ME-001 … ME-184 | **184** | Task generation, answer judging, determinism/anti-cheat primitives + plausibility thresholds, engine-owned metrics |
| `02-settings-bar.md` | `SB-` | SB-001 … SB-215 (sparse) | **165** | The 8-control settings bar, config key domains, coupling, guards, defaults, persistence, command palette, leaderboard settings id |
| `03-pages-core.md` | `CP-` | CP-001 … CP-196 (+ CP-058a) | **197** | Test page, results page, about page, contact/support/theme modals, shared shell, mobile answer entry |
| `04-pages-account.md` | `AC-` | AC-001 … AC-187 | **187** | User stats, leaderboard, friends, public profile, account settings, profile menu, XP/level system, persisted result/user schema |
| `05-monkeytype-inventory.md` | `ME-` → **`INV-`** | INV-000 … INV-208 (+ 11 lettered) | **220** | Keep/adapt/delete disposition for every file inherited from monkeytype |
| `06-infra-and-ops.md` | `INF-` | INF-001 … INF-156 (+ INF-058a, INF-086a) | **158** | Hosting, Terraform, database, secrets, job locking, Firebase auth, reCAPTCHA, app icon, repo, CI/CD, observability, cost |
| `07-test-screen-redesign.md` | `TR-` | TR-001 … TR-335 | **335** | The in-run test screen: layout per state, the state machine and the timer, the answer input, the feedback animations, keyboard-only operation, the C29 proof, the results payload confirmation, the typing-machinery deletion inventory (added in revision 5 by **C45**); **mathematical typography** — stacked fractions, operator glyphs, division-vs-fraction, accessibility, input-vs-display (`TR-263 … TR-335`, added in revision 6 by **C46**) |
| | | | **1448** | |

**Revision-2 additions, by document** (all appended; no existing ID was renumbered):
`ME-179`…`ME-183` (plausibility thresholds, review gap 8), `ME-184` (engine-version/compatibility bump,
gap 26c); `SB-215` (post-cascade guard predicate, gap 1); `CP-058a` (commit-time input normalisation,
gap 21), `CP-191`…`CP-196` (mobile symbol row, gap 9); `AC-187` (no bail-out concept, gap 6);
`INF-058a` (DB fallback follow-through, gap 14), `INF-086a` (`BACKEND_URL` / `DB_URI` sources, gap 13),
`INF-151`…`INF-155` (job advisory lock + idempotency, gap 2), `INF-156` (cost-table verification gate,
gap 23).

### 1.1 CONTRADICTION C1 — `ME-` prefix collision (resolved)

**Conflict.** `01-math-engine.md` numbers ME-001 … ME-178. `05-monkeytype-inventory.md` independently numbers
ME-000 … ME-208. Every ID from ME-000 to ME-178 exists twice with unrelated meaning (e.g. ME-083 is
"fraction multiplication forces multiplication to `12`" in doc 01 and "delete `words-generator.ts`" in doc 05).

**Ruling.** Doc 01 keeps `ME-`. **Every ID in `05-monkeytype-inventory.md` is re-prefixed `INV-`, number unchanged**
(`ME-083` → `INV-083`, `ME-118g` → `INV-118g`). No renumbering occurs; the mapping is mechanical
(`s/^ME-/INV-/` within doc 05 only). All references to doc 05 in this file and in stage-2 work use `INV-`.
Doc 05 MUST be updated in place with the new prefix as the first task of WP-01.

### 1.2 Binding status

Every ID listed above is **binding** on stage 2 **except** the IDs explicitly overruled in §2. The complete
overruled list is §2.31. An implementer who finds a source requirement not listed as overruled MUST implement it.

**Precedence, after revision 5.** For the **in-run test screen only**,
`docs/requirements/07-test-screen-redesign.md` (`TR-`) outranks this document and docs 01–06, but **only for
the IDs its §13 names**. Everything else — the chrome, the results page, the account pages, the math engine,
the backend and the infrastructure — is governed by this document and docs 01–06 exactly as before. When in
doubt: if the requirement describes what happens on screen between "start" and "the timer expires", read
doc 07 first.

---

## 2. Contradiction register

Forty-one conflicts were found (C2 … C42). Each states the conflict, the ruling, and the reason. Rulings
are binding. **C36 … C42 were added in revision 2**, in response to an adversarial completeness review; the
review's numbered gaps are cited so the two documents can be read side by side. **C43 and C44 were added in
revision 4**; **C45 was added in revision 5** and is not a conflict between the source documents at all — it
records a user design decision that overrides them, and it strikes C11 and (in part) C12, both of which keep
their original text above their strike notice.

### C2 — Config value literals for the arithmetic settings

**Conflict.** Three different vocabularies for the same states:

| Key | ME-009 (doc 01) | SB-010 (doc 02) | AC-009 (doc 04) |
|---|---|---|---|
| `division` | `"off" \| "tables" \| "free"` | `"off" \| "tables" \| "threeByTwo"` | `"off" \| "144/12" \| "xxx/xx"` |
| `multiplication` | `"off" \| "12" \| "20" \| "100"` | same | `"off" \| "12x12" \| "20x20" \| "100x100"` |
| `fractionAddition` | `"off" \| "12" \| "99"` | same | `"off" \| "1/12" \| "1/xx"` |

**Ruling.** **SB-010 wins.** The canonical config value domain, used in the config store, the result payload,
the CSV export, the filters and the leaderboard key, is exactly:

```
addition               "off" | "100" | "1000"
multiplication         "off" | "12" | "20" | "100"
division               "off" | "tables" | "threeByTwo"
fractionAddition       "off" | "12" | "99"
fractionMultiplication boolean
decimals               boolean
negatives              boolean
time                   1 | 2 | 4 | 8          (minutes)
```

ME-009's `division: "free"` and AC-009's display-string literals are **superseded**. Display labels
(`144/12`, `xxx/xx`, `100x100`, `+1/xx`, …) remain exactly as SB-024 … SB-047 specify — they are labels, never
stored values.
**Reason.** Doc 02 owns `packages/schemas/src/configs.ts`. Storing display strings (doc 04) would create a second
literal vocabulary that every consumer would have to translate, and `"free"` (doc 01) carries no information
about the `xxx/xx` shape it names.

### C3 — Booleans vs `"off"`/`"on"` strings

**Conflict.** ME-009 and AC-009 model `fractionMultiplication`, `decimals`, `negatives` as `"off"`/`"on"` enums;
SB-010 models them as booleans.
**Ruling.** **Booleans (SB-010).** The math engine's public API accepts the boolean and normalises internally.
The result payload stores booleans.
**Reason.** Same as C2 — one vocabulary, and monkeytype's config schema already uses booleans for
`punctuation`/`numbers`, which these two controls structurally replace (SB-084).

### C4 — Leaderboard settings signature: three incompatible definitions

**Conflict.**
* SB-170/171/173/174: field `settingsId`, `:`-joined, constant `LEADERBOARD_SETTINGS_ID = "1000:100:threeByTwo:99:1:1:1"`, declared as a frozen literal.
* AC-010/011: field `settingsSignature`, `|`-joined, constant `DEFAULT_SETTINGS_SIGNATURE = "1000|100x100|xxx/xx|1/xx|on|on|on"`.
* ME-017/019: a derived boolean `defaultSettings`.

**Ruling.** **SB-170 … SB-178 win.** The persisted field is **`settingsId`**, built by the SB-170 join over the
C2 canonical literals, and `LEADERBOARD_SETTINGS_ID = "1000:100:threeByTwo:99:1:1:1"` is a frozen literal
constant in `packages/schemas` (SB-173/174). `settingsSignature` and `DEFAULT_SETTINGS_SIGNATURE` are **struck**;
every doc-04 occurrence of `settingsSignature` reads `settingsId`. ME-017's `defaultSettings` survives only as a
**derived, server-computed** boolean equal to `settingsId === LEADERBOARD_SETTINGS_ID` (ME-019 stands: never
trusted from the client). SB-178 (immutable once written) is binding.
**Reason.** SB-174's argument is decisive: a leaderboard baseline derived from `getDefaultConfig()` silently
invalidates every historical entry if a default ever changes. Doc 04's separator and literals would reintroduce
the vocabulary C2 just eliminated.

### C5 — `consistency`: keep or drop

**Conflict.** ME-165 and CP-107/CP-096/CP-142 retain it (redefined over per-task response times).
AC-007 and INV-163 remove it everywhere.
**Ruling.** **Split by surface.**
* `consistency` **IS** computed and stored on the result, and **IS** displayed in the results-page `morestats`
  row (CP-096) and defined on the about page (CP-142). ME-165 governs the formula: monkeytype's existing
  `kogasa` transform (`packages/util/src/numbers.ts`) applied to the coefficient of variation of per-task
  response times (`tEnd − tStart`, ME-159). CP-107's alternative `100 × (1 − CV)` is **superseded** — kogasa is
  what monkeytype actually computes, and reusing it keeps the helper and the about-page wording honest.
* `consistency` **is NOT** stored on personal bests (AC-064 stands), **NOT** a leaderboard column (AC-131 stands),
  **NOT** a CSV column (AC-100 stands), **NOT** on PB hover (AC-062 stands), **NOT** on the friends table
  (AC-148 stands), and **NOT** in the daily-activity tooltip (AC-091 stands).
**Reason.** 2-vs-2 on the raw count, but the two surfaces are genuinely different: the results screen has a
`morestats` slot that would otherwise be empty, and the metric is nearly free once per-task times are logged;
the account/leaderboard surfaces are the ones AC-007 actually enumerates, and there the metric adds a column
nobody asked for. `<2` answered tasks displays `-` (CP-107).

### C6 — Accuracy with zero answered tasks

**Conflict.** ME-162 and AC-004 require the stored value `0`. CP-103 requires the display `-`.
**Ruling.** No real conflict — **layer them.** Stored/serialised `acc = 0` when `correct + wrong === 0`
(ME-162, AC-004). *Displayed* `acc` on the results page is `-` when `answered === 0` (CP-103). Live in-test acc
displays `100%` at zero answered (CP-080). CP-109 makes the stored case near-unreachable anyway (a run with
`answered === 0` is invalid and is not saved).

### C7 — `ChartDataSchema` array cap vs an 8-minute test

**Conflict.** INV-033 records monkeytype's `ChartDataSchema` arrays as capped at **122** points. CP-113 requires
**one data point per elapsed second**, and croco calc's longest test is 480 s.
**Ruling.** The cap MUST be raised to **481** (indices 0…480 inclusive) for every chart series. One point per
second stands (CP-113). The `"toolong"` degradation precedent (ME-176) is **not** applied to chart data — three
series of 481 numbers is ~1.4 kB.
**Reason.** monkeytype's 122 is exactly its 120 s maximum plus slack; it is an artefact of a shorter test, not a
payload-size decision.

### C8 — Command palette: keep or delete

**Conflict.** INV-117 (assumption A-02) deletes `frontend/src/ts/commandline/**`, `commandline.scss` (INV-069) and
the commandline hotkey (INV-098). SB-150 … SB-162 require it, generate all eight settings commands from config
metadata, and add `restoreDefaultTestSettings`. CP-014/CP-164 … CP-173/CP-190 define the **theme modal as the
commandline dialog** on the `themes` subgroup. CP-015 renders a `command line` keytip. CP-141 documents it on
the about page. SB-181 clicks a notice to run a palette command.
**Ruling.** **The command palette is KEPT.** INV-117, INV-069 and the commandline half of INV-098 are
**OVERRULED**. `singleListCommandLine` (SB-161) is retained as a config key.
**Reason.** Four requirements in two other documents depend on it, including the theme modal the brief
explicitly lists. Doc 05's own assumption A-02 flags it as "the single most likely thing the user will want back".

### C9 — Settings page: deleted, but its theme picker "kept in full"

**Conflict.** INV-116 deletes `frontend/src/ts/components/pages/settings/**` and INV-058 deletes the `/settings`
route; INV-128 removes `/settings` from the sitemap. CP-174 requires the settings-page theme picker
(`custom-setting/Theme.tsx`) "kept in full". CP-011 requires a `settings` nav item; CP-005/CP-164 require the
`data-nav-item="settings"` selector to survive because 52 theme CSS files target it.
**Ruling.**
1. The monkeytype settings **page** is deleted; the `/settings` route and sitemap entry go (INV-116, INV-058, INV-128).
2. `custom-setting/Theme.tsx` is **extracted, not kept in place**, into the theme modal. All of CP-174's content
   survives (preset/custom toggle, favourites-first grid, swatches, ten colour pickers, load-from-preset, share,
   save / save as new); only its host changes.
3. The `settings` **nav item stays** (CP-011, icon `ph:gear-bold`) and **opens the theme modal**. The
   `data-nav-item="settings"` attribute is preserved verbatim so CP-164/CP-166 hold.
**Reason.** The brief lists a theme modal and no settings page. Repurposing the nav item is the only resolution
that keeps 52 theme files untouched without inventing a dead link. *Flagged for sign-off — see OQ-8.*

### C10 — Icon collection: three different sets

**Conflict.** SB-060/061 mandate `tabler:*` and **prohibit mixing collections inside the bar**. CP-002 names
~40 `ph:*` (Phosphor) icons across shell, test, results, about and modals. AC-020 mandates a 1:1 mapping to
`fa6-solid:*` / `fa6-brands:*`. INV-063 / A-16 want the `FaObject` prop shape preserved.
**Ruling.**
* **Settings bar → `tabler:*`** (SB-060/061), the single documented exception.
* **Everything else → `ph:*` (Phosphor)**. AC-020 is restated as: map each monkeytype Font Awesome name to its
  **Phosphor** equivalent in one shared table; `fa6-*` is **superseded**.
* One component `frontend/src/ts/components/common/Icon.tsx` with props
  `{ icon: string; class?: string; spin?: boolean; fixedWidth?: boolean; size?: number }`, rendering an inline
  `<svg>` at `1em` inheriting `currentColor`, `width: 1.25em` when `fixedWidth` (SB-062). `FaObject` is
  **superseded** — CP-002 requires auditable literal `set:name` strings, which a `{ icon, variant }` pair cannot
  express. INV-063's A-16 is overruled on the prop shape only; the "swap the renderer, not the call sites"
  strategy stands.
* All icon data **bundled at build time**; zero runtime requests to `api.iconify.design` (SB-063, AC-021).
**Reason.** Doc 03 names the most concrete icons and owns the shell; doc 04's `fa6-*` is a migration convenience,
not a design choice. The bar's exception is already argued (SB-061) and is internally consistent.
*Flagged for sign-off — see OQ-7.*

### ~~C11 — Caret: keep or delete~~ — **STRUCK by C45**

> **STRUCK 2026-08-03 by C45.** The ruling below is preserved verbatim for the audit trail and is **no longer
> binding**. Its reason clause presupposed CP-053's hidden capture textarea, which C45 struck; with a visible
> `<input id="answerInput">` there *is* a native caret to see. **INV-068 and INV-160 are reinstated**: the
> caret element, `caret.scss`, `elements/caret.ts`, `test/caret.ts` and the `smoothCaret` / `caretStyle`
> config keys are all deleted. `--caret-color` is **kept** and is applied to the native caret. See
> `docs/requirements/07-test-screen-redesign.md` TR-020, TR-091, TR-178 … TR-180, TR-203 … TR-209.

**Conflict.** INV-068 / INV-160 delete `caret.scss`, `elements/caret.ts`, `test/caret.ts` and the
`smoothCaret` / `caretStyle` config keys, on the reasoning that "the answer field uses the browser's native
caret". CP-067 … CP-070 keep the caret, rename `goTo({wordIndex, letterIndex})` → `goTo({taskIndex, charIndex})`,
and keep the shape options and blink behaviour.
**Ruling.** **The caret is KEPT** (CP-067 … CP-070). INV-068 and INV-160 are **OVERRULED**; `smoothCaret` and
`caretStyle` are restored to the retained config key set. The **pace caret** is deleted — CP-071 and INV-161 agree.
**Reason.** INV-068 presupposes a visible `<input>`. CP-053 keeps monkeytype's hidden capture textarea with
per-character `<letter>` rendering, so there is no native caret to see.

### ~~C12 — Answer input model~~ — **STRUCK IN PART by C45**

> **STRUCK IN PART 2026-08-03 by C45.** The ruling below is preserved verbatim for the audit trail.
> **No longer binding:** "hidden-textarea capture + rendered `.answer` letters is normative (CP-053, CP-032)".
> **INV-051 is reinstated on its "a single numeric answer input" clause** — the in-run screen uses a visible
> `<input id="answerInput">` with `inputmode="decimal"` and no per-character `<letter>` rendering.
> **Still binding, and explicitly re-affirmed by C45:** INV-090's "submit on Enter **or on unique-match**"
> remains **OVERRULED** — auto-advance on unique match is rejected in every form; and ME-153 (no
> auto-advance, `quickEnd` not ported) and ME-152 / CP-036 (no per-character feedback) remain binding
> anti-cheat requirements. C45 additionally strikes `Space` as a second commit key. See
> `docs/requirements/07-test-screen-redesign.md` TR-079 … TR-098, TR-131 … TR-135.

**Conflict.** INV-051 replaces the capture textarea with "a single numeric answer input"; INV-090 replaces the
input pipeline with a module that submits "on Enter **or on unique-match**". CP-053 keeps the hidden
`<textarea id="tasksInput">` with all anti-interference attributes; CP-032 renders the answer as `<letter>`
elements; CP-036 and ME-153 **forbid** auto-advance.
**Ruling.** **Doc 03 wins.** Hidden-textarea capture + rendered `.answer` letters is normative (CP-053, CP-032,
CP-054 `inputmode="decimal"`). INV-051 and INV-090 are **OVERRULED** on both points. ME-153 (no auto-advance,
`quickEnd` not ported) and ME-152 / CP-036 (no per-character feedback) are binding anti-cheat requirements.

### C13 — Live stats during the test

**Conflict.** INV-096 / A-05: keep the timer bar plus a live **score** counter, delete live acc.
CP-078 … CP-081: timer, live **acc**, live **tpm**; burst removed.
**Ruling.** **CP-078 … CP-081 win.** Timer + live acc + live tpm. No live score counter. A-05 is superseded.
**Reason.** Doc 03 owns the test page and maps `liveSpeedStyle`/`liveAccStyle` onto existing components; adding
a fourth readout monkeytype does not have contradicts "EXACTLY like monkeytype".

### C14 — Sound subsystem

**Conflict.** INV-182 / A-03 delete `frontend/static/sounds/` (155 files), `sound-controller.ts`, `howler` and the
four sound config keys. SB-160 lists "sound commands" among palette commands that MUST be kept.
**Ruling.** **Sounds are CUT** (INV-182). SB-160's keep-list is amended: **strike** `sound commands`, `presets`,
`tags`, `difficulty`, and `minWpm`/`minAcc` equivalents. **Revision 2 strikes two more: `bailOut` (C38 — no
bail-out concept exists) and `blindMode` (C41 — no defined behaviour survives CP-036).** **Retain** in
SB-160: theme commands (incl. favourites,
custom themes, random theme, custom background + filters), navigation commands, result-screen commands,
`resultSaving`, `quickRestart`, `singleListCommandLine`, caret commands,
appearance commands (`timerStyle`, `timerColor`, `timerOpacity`, `fontSize`, `fontFamily`, `maxLineWidth`,
`alwaysShowDecimalPlaces`, `startGraphsAtZero`), show/hide commands, settings import/export,
`clearNotifications`, `signOut`.
**Reason.** The brief says "extremely minimalist" and never mentions sound; 155 assets plus `howler` is real
bundle weight. The other struck entries are commands for features other rulings delete (C15, C22, C23).

### C15 — Tags

**Conflict.** AC-016 and INV-186 delete tags entirely (schema, collection, modals, filters, PBs, table column).
CP-098 keeps the tags sub-block and the `EditResultTags` modal; CP-119 keeps a `tagPbLine` legend button;
CP-118 keeps a `<tag> PB: <score>` chart annotation.
**Ruling.** **Tags are DELETED** (AC-016, INV-186, INV-115). CP-098 is **struck**. CP-119's legend row becomes
**four** buttons — `scale`, `pb`, `tpm`, `wrong`. CP-118's label set becomes `PB: <score>` only.
`collections/tags.ts`, `custom-setting/Tags.tsx`, `commandline/lists/tags.ts`, `AddTagModal`,
`EditResultTagsModal`, `Result.tags`, `tagPbs` all go.
**Reason.** 2-vs-1; doc 04 owns the persisted result schema and AC-100's CSV has no tag column; tags are
configured on the settings page this project deletes (C9).

### C16 — Badges and user flags

**Conflict.** AC-018 permits retaining badges/flags/`inventory` but forbids awarding them. INV-101 deletes
`UserBadge.tsx` and `UserFlags.tsx`; INV-034 deletes `BadgeSchema`/`UserInventorySchema`; INV-190 cuts badges.
Meanwhile AC-048, AC-131 and AC-148 render "badges/flags" in three places.
**Ruling.** **Split.** **User flags** (verified/country — `UserFlags.tsx`, `user-flag-controller.ts`) are **KEPT**.
**Badges** (`BadgeSchema`, `UserInventorySchema`, `UserBadge.tsx`, `badge-controller.ts`, `user.inventory`) are
**DELETED**. Wherever doc 04 says "badges", read "flags".
**Reason.** AC-018 concedes nothing awards badges in v1, so they would ship permanently empty; flags are
referenced by three live requirements and cost nothing.

### C17 — Streaks

**Conflict.** AC-015 deletes streaks from the profile header, friends table, account settings and the XP formula.
INV-034/INV-114 keep `UserStreakSchema` and `StreakHourOffsetModal`; assumption A-10 says "keep XP, levels and
streaks".
**Ruling.** **Streaks are DELETED** (AC-015). XP and levels stay (AC-022 … AC-039). A-10 is overruled on streaks
only. AC-035's daily XP bonus preserves the daily-return incentive.
**Reason.** The brief enumerates the profile header contents and never mentions a streak; doc 04 enumerates every
affected surface, doc 05 does not.

### C18 — "Presets" name collision (config presets vs filter presets)

**Conflict.** INV-187 / INV-115 delete "presets"; SB-160 keeps a "presets" palette command; AC-074/AC-075 require
a `save as preset` button, a `filter presets` section and a `Delete Filter Preset` modal.
**Ruling.** Two unrelated features share a word.
* **Config presets** — `packages/schemas/src/presets.ts`, `packages/contracts/src/presets.ts`,
  `backend/src/dal/preset.ts`, `collections/presets.ts`, `modals/preset/**`, `custom-setting/Presets.tsx`,
  `controllers/preset-controller.ts`, the `presets` palette command — **DELETED**.
* **Result-filter presets** — AC-074/AC-075, `collections/result-filter-presets.ts`, persisted on the user
  document — **KEPT**.
This is an explicit trap for stage 2 and MUST be called out in WP-09's brief.

### C19 — "Practise mistakes" button

**Conflict.** CP-123 lists a `practise mistakes` action-row button that "starts a test built only from the
generator kinds the user got wrong". ME-124 states: implementers MUST NOT add weighting, adaptive difficulty,
spaced repetition, or practise-your-weak-spots behaviour in v1. INV-093/INV-183 delete `practise-words.ts` and
`weak-spot.ts`.
**Ruling.** **The `practise mistakes` button is CUT from v1.** The results action row has **four** buttons:
`next test`, `repeat test`, `toggle task history`, `copy screenshot` (CP-123 items 1, 2, 4, 5). Recorded as a
deferred idea (§5).
**Reason.** ME-124 is an explicit MUST NOT and doc 05 deletes the machinery; CP-123 is the only requirement on
the other side.

### C20 — Settings-bar pill grouping

**Conflict.** SB-084/085/086: Left = `decimals`, `negatives`; Centre = `addition`, `multiplication`, `division`,
`fractionAddition`, `fractionMultiplication`; Right = `time`. CP-025: `[addition | multiplication | division]`,
`[fraction add | fraction mul | decimals | negatives]`, `[time]`.
**Ruling.** **SB-084/085/086 win.** CP-025 is **superseded**.
**Reason.** SB-085 is a structural one-to-one match with monkeytype's `[punctuation numbers][mode][mode2]` — the
counts and the semantic roles line up, so `grid-cols-[1fr_auto_1fr]` and every gap/padding variable work
unchanged. That is the strongest available guarantee of "looks EXACTLY like monkeytype".
Consequence: SB-165's mobile button icon `tabler:settings` wins over CP-027's `ph:gear-bold` (the bar is
tabler-only, C10).

### C21 — Which multiplication state the coupling forces on

**Conflict.** ME-083 / assumption A6: force `multiplication = "12"`. SB-090: force `multiplication = "100"`.
**Ruling.** **`"100"` (SB-090).** ME-083 and A6 are **superseded**.
**Reason.** `"100"` is the shipped default (SB-110, ME-009 agree), so a coupling-forced config equals the default
config — which makes SB-112 trivially true and leaves the user leaderboard-eligible after a two-click
interaction. `"12"` would silently drop them off the leaderboard. SB-096's 250 ms pulse on the
not-clicked control stands. ME-086/SB-092/SB-093 (no memory, no reverse coupling) stand.

### C22 — Difficulty, min-speed / min-accuracy fail conditions

**Conflict.** SB-160 keeps `difficulty` and "`minWpm`/`minAcc` equivalents if the results spec keeps them" as
palette commands. INV-176 cuts `DifficultySchema`; INV-178 cuts min-speed/min-acc/min-burst; ME-004/ME-033 leave
no difficulty dimension; no results requirement keeps a min-* fail path.
**Ruling.** **Cut.** `difficulty`, `minWpm`, `minAcc`, `minBurst` and their palette commands, config keys, result
fields and fail paths are all deleted. Already folded into C14's amended SB-160 keep-list.

### C23 — Redis and BullMQ

**Conflict.** INV-142 keeps the Redis-Lua daily/weekly-XP leaderboards "verbatim"; INV-145 keeps the BullMQ
queues and the email worker; INV-195 warns that rebuilding paginated leaderboards is "the single largest
avoidable cost". INF-063 … INF-069 delete Redis, BullMQ, `backend/redis-scripts/`, `backend/src/init/redis.ts`,
`backend/src/queues/`, `backend/src/workers/` and the `ioredis` / `bullmq` dependencies.
**Ruling.** **INF-063 … INF-069 win.** INV-142 and INV-145 are **OVERRULED**.
* Daily and weekly-XP leaderboards move to MongoDB collections keyed `{ timestamp, modeKey, uid }` with a
  compound index `{ timestamp, modeKey, score: -1 }` and a TTL index, ranked with `$setWindowFields`
  `$rank`/`$denseRank` (INF-064) — the same technique the all-time board already uses in
  `backend/src/dal/leaderboards.ts`.
* `later-queue` work moves into the existing cron job runner (INF-066).
* Rate limiting stays in-memory per replica (INF-063), acceptable at `maxReplicas = 3`.
**Reason.** Doc 06 owns infrastructure and cost. Azure Cache for Redis Basic C0 is ~$16/mo — a third of the
entire $50 ceiling for a single-user-scale app — and the `$setWindowFields` replacement is already proven in
this codebase. INV-195's warning is acknowledged and mitigated by reusing that existing pattern.

### C24 — Transactional email / SMTP

**Conflict.** INV-145 and INV-150 keep the email queue, email worker and `backend/email-templates/`.
INF-053 removes the email client entirely — Firebase Auth sends verification and reset mail.
**Ruling.** **INF-053 wins.** `backend/src/init/email-client.ts`, the email queue, the email worker and
`backend/email-templates/` are **DELETED**; no `EMAIL_*` env vars are provisioned. `backend/src/utils/monkey-mail.ts`
(the in-app **inbox** message builder, not SMTP) is **KEPT** and renamed `croco-mail.ts` (INV-139).
**Reason.** The only user-facing mail is verification and password reset, both of which Firebase Auth sends.

**DISCHARGED 2026-08-02 — audited, and the mail architecture is now fixed by user decision.**
The deletion this ruling ordered is **already complete**; re-verified at audit time (INF-053a):
`backend/src/init/email-client.ts` does not exist, `nodemailer` has zero references in `backend/src` and is
absent from `backend/package.json`, and `backend/email-templates/`, `backend/src/queues/` and
`backend/src/workers/` are all gone. `backend/src/utils/croco-mail.ts` survives correctly as the in-app
inbox builder — it sends nothing and imports no transport. **No backend-sent email survives in croco calc,
and nothing remains for WP-11 to delete.**

The complete mail architecture, both directions:

| Direction | Owner | Cost | DNS on `crococalc.com` |
|---|---|---|---|
| **Sending** (verification, password reset) | **Firebase Auth**, from its own Firebase domain | $0 | none required |
| **Receiving** (`contact@`, `support@` → `me@emilvinu.de`) | **Cloudflare Email Routing** | $0 | MX + SPF, created by Cloudflare when the user enables routing |

Moving either half to Azure Communication Services was evaluated on 2026-08-02 and **rejected**. For
receiving the rejection is on capability rather than price: **ACS Email has no inbound feature at all** — its
Event Grid integration carries only delivery/engagement reports for outbound mail, so there is no inbound
event to route and no mailbox a human can read. The Azure-family answer would be an Exchange Online mailbox
at ~$4/user/month, which buys nothing over Cloudflare's $0 forward. Cloudflare Email Routing is therefore
retained deliberately. Enabling it is a **user action** (the API token lacks Email Routing scope, and
Cloudflare requires a human to click the destination-verification link) — tracked as BL-7 in doc 06.

### C25 — Prometheus and the stats dashboard

**Conflict.** INV-144 deletes `prom-client`, `swagger-stats` and `backend/src/utils/prometheus.ts`. INF-147 says
they *should* go; INF-050/INF-083 keep `STATS_USERNAME`/`STATS_PASSWORD` "only if the dashboard is kept".
**Ruling.** **Deleted.** Consequently Key Vault holds exactly **three** secrets — `mongodb-uri`,
`firebase-service-account`, `recaptcha-secret` (INF-083 reduced) — and `STATS_USERNAME`/`STATS_PASSWORD` are
never set. INV-146's "delete the two size-logging jobs" applies.

### C26 — Where the math engine lives, and the package scope

**Conflict.** ME-001 puts it at `packages/math-engine`, named `@crococalc/math-engine`. INV-083 puts it at
`frontend/src/ts/test/task-generator.ts`. INV-013 renames all workspace packages `@monkeytype/*` → `@croco-calc/*`.
**Ruling.** **`packages/math-engine`, named `@croco-calc/math-engine`** (ME-001's location, INV-013's scope
spelling — `@croco-calc`, hyphenated, not `@crococalc`). INV-083's `frontend/src/ts/test/task-generator.ts`
becomes a thin frontend adapter over the package.
**Reason.** ME-174 requires the **backend** to regenerate tasks from the identical code; a file under
`frontend/src` cannot serve that.

### C27 — `#wpmChart` and `#resultWordsHistory`

**Conflict.** INV-052 says KEEP the `#wpmChart` canvas and DELETE `#resultWordsHistory`, `#copyWordsListButton`,
`#copyMissedWordsListButton`, `#showWordHistoryButton`. CP-112 renames the canvas `#resultChart`; CP-126 renames
the history block `#resultTaskHistory` and keeps `copy list` / `copy missed list`.
**Ruling.** **Doc 03 wins on both.** Canvas → `#resultChart` (CP-112; CP-178 forbids the `wpm` token).
History block → `#resultTaskHistory`, kept, with both copy buttons (CP-126). INV-052's "keep `#wpmChart`" means
keep the chart, not the id.
Both documents agree on deleting: the replay subsystem and `#watchReplayButton` (CP-124, INV-183), the burst
heatmap toggle (CP-126, INV-166), `#practiseWordsButton` (C19), `.group.raw`, `.group.key`, `.group.source`,
and every `#ad-result*` block (CP-006, CP-097, CP-125).

### C28 — `xxx/xx` dividend width

**Conflict.** SB-013: "at most 3-digit dividend". ME-047/ME-052: dividend MUST be 3-digit (`≥ 100`).
**Ruling.** **Exactly three digits (ME-047 … ME-052).** SB-013's "at most" is corrected.
**Reason.** ME-052 argues it: a 2-digit dividend collapses `threeByTwo` into the `tables` band and makes the
control's own label false. Divisors remain 2 **or fewer** digits (ME-053, assumption A3).

### C29 — Answers in the DOM

**Conflict.** ME-135: the exact answer MUST NOT be present anywhere in the DOM — not as text, not as a `data-`
attribute, not as an `aria-label`; only prompts may be rendered. CP-041: when a committed task is incorrect the
correct answer MUST be shown beneath it as a hint. CP-126: the task history lists every committed task with the
correct answer.
**Ruling.** **ME-135 is scoped, not removed.** The exact answer of a task that has **not yet been committed**
MUST NOT appear anywhere in the DOM. After a task is committed, **that task's** answer MAY be rendered (CP-041
hint, CP-126 history). CP-036 / ME-152 / ME-153 (no pre-commit feedback, no auto-advance) remain the enforcement
that makes this safe.
This is directly testable: at any moment, `document.body.textContent` MUST NOT contain the answer of any task
with `data-result` unset.

### C30 — Theme CSS "byte-for-byte" vs the `#words` → `#tasks` rename

**Conflict.** CP-164 requires all 52 files under `frontend/static/themes/` kept **byte-for-byte**. INV-062 requires
pruning selectors that reference deleted UI. CP-020 renames `#words` → `#tasks` with "no `#words` selector may
remain".
**Ruling.** CP-164 is softened to: the 52 files are **kept**, and the **only** permitted edits are (a) removal of
rule blocks whose selectors target deleted UI (`#keymap`, funbox classes, replay, burst heatmap) and (b) the
`#words` → `#tasks` rename. `[data-nav-item="…"]` rules MUST NOT be touched (CP-005, CP-166). Every edited file
and every removed selector MUST be listed in the WP-04 PR description so the diff is auditable.

### C31 — `mode` / `mode2` / `time` field naming

**Conflict.** SB-175 gates eligibility on `result.time === 4 || result.time === 8`. AC-008 stores
`mode: "time"` and `mode2: "1"|"2"|"4"|"8"` (strings) and no `result.time`.
**Ruling.** **AC-008 wins for the persisted result**; SB-175's predicate is restated as
`result.settingsId === LEADERBOARD_SETTINGS_ID && (result.mode2 === "4" || result.mode2 === "8")`.
The **config** key remains `time: 1|2|4|8` (number, minutes — SB-012, ME-013); `testDuration = time * 60` seconds
(CP-073). Personal bests key on `(mode2, settingsId)` — CP-110, AC-065 and assumption A-12 all reduce to this
once C4 is applied.
**Reason.** `utils/pb.ts` and `PersonalBestsSchema` key off `mode`/`mode2`; keeping them is what lets INV-140's
PB algorithm survive unchanged.

### C32 — Input filter vs judging grammar for a leading `.`

**Conflict.** CP-058 requires at most one `.` and requires a digit before a `/`, but says nothing about a digit
before a `.`. ME-143's `DEC` grammar requires `DIGIT{1,7} "." DIGIT{1,7}`, so `.5` is judged incorrect.
**Ruling.** Harmonise: the **input filter** MUST additionally require at least one digit before a `.`, exactly as
CP-058 already requires for `/`. A leading `.` keystroke is silently ignored. Judging (ME-143 … ME-147) is
unchanged. Without this, a user can type `.5` and be marked wrong for a value they meant correctly.

### C33 — Minus glyph in prompts

**Conflict.** CP-033 renders `−` (U+2212) for a negative sign. ME-131 writes `-12 + 5 =`, `12 + (−5) =` with
ASCII. ME-139 normalises U+2212 → ASCII on input.
**Ruling.** **Display uses U+2212** (CP-033), including in `answerDisplay` (ME-134). ME-131's rules for *where*
the sign goes (bare when first operand, parenthesised when second, never rewritten as a subtraction operator)
are binding. ME-127's `+`, `×`, `÷` and ME-128's `÷`-not-`/` are binding. Input normalisation (ME-138, ME-139) is
unaffected. Internal comparison always uses exact rationals (ME-147), never strings.

### C34 — About-page copy names seven generators but says eight

**Conflict.** CP-139's copy reads "eight independent task generators — addition, multiplication, division,
fraction addition, fraction multiplication, decimals and negative numbers", which is seven items.
**Ruling.** Copy correction, binding: "**seven independent task settings** — addition, multiplication, division,
fraction addition, fraction multiplication, decimals and negative numbers — **plus a test length** of 1, 2, 4 or
8 minutes". CP-140's `task set` section explains all eight controls.

### C35 — `minTimeTyping` configuration key name

**Conflict.** AC-014 renames every "typing" string to "time spent" / "solving"; AC-120.3 keeps
`configuration.leaderboards.minTimeTyping`.
**Ruling.** Rename to **`minTimeSpent`**, default **7200** seconds (AC-120.3). AC-129.3's message reads
"Your account must have {duration} spent to be placed on the leaderboard."

### C36 — the last-generator guard and the coupling can still reach the all-off state (review gap 1)

**Conflict.** SB-101/SB-102 block only the `off` value of "the last enabled generator control", and SB-203's
test statement asserts "with two generators on, either can be switched off". With
`multiplication = "100"` + `fractionMultiplication = true` and everything else off, that permits switching
multiplication off — which SB-091 then cascades into `fractionMultiplication = false`, leaving **zero**
enabled generators, exactly the state ME-016 throws `MathGenError` on. ME-089 already says the guard must be
evaluated **after** the coupling, but nothing in doc 02 referenced ME-089 and §2 had no ruling.

**Ruling. ME-089 is binding over the naive reading of SB-101.** Concretely:
1. **SB-101 is restated**: a generator control's `off` value is blocked whenever selecting it *would, after
   the `overrideConfig` cascade of SB-090/SB-091 has been applied*, leave zero enabled generators.
2. **SB-102 is restated**: `cycleSetting` MUST skip any state that, **after the cascade**, would leave zero
   enabled generators.
3. **SB-103** (the non-bar entry points) uses the identical predicate — one implementation, not two.
4. The predicate itself is written out as new **SB-215** and is the single source of truth:
   `wouldBeAllOff(key, value, current) := enabledGeneratorCount(applyCoupling({...current,[key]:value})) === 0`.
5. **SB-203's test statement is corrected** to three cases, the third being the one this ruling exists for:
   `multiplication="100"` + `fractionMultiplication=true` with everything else off → multiplication
   **cannot** be switched off, fraction multiplication **can**.

**Reason.** The engine throws on the all-off state (ME-016) and the bar is the only thing preventing it, so
the guard must be evaluated on the configuration that will actually be committed — which is the post-cascade
one. Evaluating it pre-cascade makes the guard a lie in exactly the configuration the defaults are one click
away from. This is a correctness bug, not a wording preference; ME-089 was right and doc 02 simply never
referenced it.

### C37 — the idle/AFK field had three names (review gap 5)

**Conflict.** CP-108 called it `afk`; AC-026 and AC-100 called it `idleDuration`; INV-033 keeps monkeytype's
`afkDuration` "as-is"; DoD-27 requires `data-afk`. The XP formula
(`base = round((testDuration − idle) * 2)`) and AC-039's 1694-XP acceptance test both depend on it.

**Ruling. One persisted name, one display name, and they are different on purpose:**

| surface | name |
|---|---|
| persisted result field (`ResultBaseSchema`) | **`afkDuration`** (integer seconds) |
| CSV column (AC-100) | `afkDuration` |
| DOM hook (CP-188, DoD-27) | `data-afk` |
| CSS class (`test-result.html`) | `.afk` |
| **user-visible label** | **`idle`** — e.g. `12s idle` |

`idleDuration` is **struck** everywhere; AC-026's formula reads `round((testDuration − afkDuration) * 2)`.
**Reason.** `afkDuration` is monkeytype's own field name, already computed at `result.ts:732` and already
kept unchanged by INV-033 — renaming it would force a schema edit, a DoD-27 edit and a CSS edit for nothing.
The *label* changes to `idle` because "afk" is gamer jargon that CP-178's tone rules argue against, and
because doc 04's authors reached for "idle" independently. AC-039's worked example is unaffected (0 s idle).

**Amendment (task #75, coordinator ruling R5 — `afkDetected` is a separate quantity from `afkDuration`).**
The table above governs `afkDuration`: the **summed** count of whole seconds that carried no input, persisted,
and the term in AC-026's XP formula. That is unchanged.

`afkDetected` — the boolean behind the results screen's `idle detected` note (CP-096's `.group.info`) — was
previously undefined. It is hereby defined as **"the run *ended* idle"**: true when the last
**5** seconds of the run all carried no input. A run shorter than the window is judged on its whole length,
and a run with zero elapsed seconds is never flagged. This is upstream's own rule under C19
(`getKeypressesPerSecond(eventLog).slice(-5).every(kps => kps === 0)`), reproduced exactly.

**It is explicitly NOT `afkDuration >= 60`.** In a typing test a second with no keystroke is anomalous; in a
math trainer it is the *normal* state — a user computing `847 × 23` is silent for several seconds by design,
and those seconds are counted in `afkDuration`. A summed threshold would therefore fire on a perfectly
attentive eight-minute run made of sixty ordinary thinking pauses, which is precisely the population the note
must not accuse of walking away. The trailing-window rule says only what the note claims: you stopped and did
not come back. `afkDetected` is display-only — not persisted, not part of any metric, and with no effect on
saving, PBs or leaderboards — so this definition is scoped to the notice and touches nothing in C37's table.

### C38 — `bailedOut` was load-bearing but never defined (review gap 6)

**Conflict.** AC-121.4 made a result ineligible when `result.bailedOut === true`; INV-033 keeps the field;
C14 kept the `bailOut` palette command; AC-032 hedged with "if doc 03 defines a 'bailed out early' concept".
Doc 03 defines no such concept — no requirement anywhere describes how a user bails out of a fixed-duration
math test, what the result payload looks like, or the effect on PBs/XP/tpm.

**Ruling. `bailOut` is STRUCK in full.** Removed from: the retained result schema (INV-033's keep-list loses
`bailedOut`), AC-100's CSV header (replaced by `settingsId`, which is the field every eligibility question
actually turns on), AC-121 clause 4, and C14's palette keep-list. New **AC-187** states the rule positively.
AC-032's hedge is resolved: there is no bail-out and none is to be added.
**Reason.** monkeytype's bail-out exists for open-ended word/quote/zen runs where a user wants to stop early
and still save. Every croco calc test is a fixed-duration timer, so a run ends in exactly two ways: the timer
expires (a normal saveable result) or the user restarts (CP-088 — recorded as an incomplete test, never
saved as a result). A field that can only ever be `false` is a permanent trap sitting inside the eligibility
predicate. Defining a bail-out instead would mean inventing product behaviour the brief never asked for.

### C39 — the brief's decimals self-contradiction (review gap 7)

**Conflict.** The brief says a decimal task "is randomly one of types 1-3 (addition / multiplication /
division)" and then "Effectively we base ourselves on the division tasks". SB-105's assumption note flagged
the inconsistency and deferred it to the task-generation requirements; doc 01 then resolved *adjacent*
questions (A7 kind-vs-modifier, A11 enabled-subset) but never this one, and §2 had no entry.

**Ruling. The first sentence is normative.** The decimal base kind is drawn **uniformly over the enabled
subset of `{add, mul, div}`** (ME-091, A11). The "based on division" sentence is read as the brief's
*explanation of why decimal shifting is safe* — the same argument ME-107 makes, that a remainder-free
division stays terminating under any power-of-ten shift (`1 / 4 = 0.25` because `100 / 4 = 25`) — and **not**
as a restriction on the base kind. Implementers MUST NOT restrict decimal tasks to division. Recorded as
doc 01 assumption **A13**; SB-105's deferral note is updated to point at it.
**Reason.** Read as a restriction, the sentence makes settings 1 and 2 dead whenever decimals is on, which
contradicts both the eight-control design and ME-092. Grammatically the brief offers it as a justification
("is fine **because** 100 / 4 = 25"), not as a rule. *If the user intended the literal restriction, this is
the one ruling in §2 most worth a sanity check — see OQ-15.*

### C40 — the headline metric had two names (review gap 17)

**Conflict.** ME-161 named it `net = correct − wrong`; CP-101 and AC-003 name it `score`. §2 never ruled,
yet WP-07's exit criteria and DoD-27's `data-score` already assumed `score`.
**Ruling. `score` wins; `net` is struck.** The persisted field, the DOM hook, the CSV column, the chart axis,
the PB key and every identifier are `score`. ME-161 is amended in place. The same applies to ME-160 / ME-162
/ ME-163: their field names are AC-001 … AC-005's (`correct`, `wrong`, `score`, `acc`, `tpm`, `spm`), not
doc 01's prose spellings (`accuracy`, `tasksPerMinute`) — doc 01 owns the *formulas*, doc 04 owns the
*schema*.
**Reason.** Two documents against one, and `score` is the word the results page, the leaderboard column, the
XP breakdown and the test hooks already use. `net` appears nowhere a user can see.

### C41 — `blindMode` retained with undefined semantics (review gap 22)

**Conflict.** §6.1 kept `blindMode` and C14 kept its palette command, but CP-036 already forbids **all**
pre-commit feedback. The only thing blind mode could still suppress is the post-commit `correct`/`incorrect`
colouring (CP-035) and the CP-041 answer hint — and no requirement says it does.
**Ruling. `blindMode` is STRUCK** from §6.1's retained config key set and from C14's palette keep-list.
**Reason.** In monkeytype, blind mode is meaningful because feedback is continuous and per-character;
croco calc has already removed that (CP-036, ME-152). What is left is the *only* feedback the user ever
gets, and a mode that suppresses it would make the test unusable rather than harder. Shipping a config key
with no defined behaviour is worse than shipping neither.

### C42 — CP-178 forbade a substring the auth UI must contain (review gap 16)

**Conflict.** CP-178 banned the words `word` and `character` from every user-visible string, while AC-170 /
AC-171 mandate the literal buttons `add password authentication`, `update password` and
`remove password authentication`, and the login/register pages are unavoidably full of "password".
DoD-07's grep silently omitted `word`/`character`, so the DoD and the requirement already disagreed.
**Ruling.** CP-178 is amended: `word(s)` and `character(s)` are banned **as whole words only**, with
`password` / `passwords` / `passwordless` explicitly exempt. DoD-07's grep pattern is aligned to match
CP-178 exactly and is the normative form of the check.
**Reason.** The intent of CP-178 is to erase typing-domain vocabulary, not to ban an English substring. A
rule that cannot be satisfied is not a rule; a grep that does not implement the rule it enforces is worse.

### 2.31 Complete list of overruled / amended source requirements

| Source ID | Status | Ruling |
|---|---|---|
| All `ME-nnn` in doc 05 | **re-prefixed** `INV-nnn` | C1 |
| ME-009 (`division: "free"`) | amended | C2 → `"threeByTwo"` |
| ME-009 (on/off enums) | amended | C3 → booleans |
| AC-009 (display-string literals) | superseded | C2 |
| AC-010, AC-011 (`settingsSignature`) | superseded | C4 → `settingsId` |
| ME-017 (`defaultSettings`) | amended | C4 → derived from `settingsId` |
| CP-107 (consistency formula) | superseded | C5 → kogasa (ME-165) |
| AC-007 (drop consistency) | amended | C5 → dropped on account/leaderboard surfaces only |
| INV-163 | amended | C5 |
| INV-033 (chart cap 122) | amended | C7 → 481 |
| INV-117, INV-069 | **overruled** | C8 → command palette kept |
| INV-098 (commandline hotkey half) | **overruled** | C8 |
| CP-174 ("kept in full", in place) | amended | C9 → extracted into the theme modal |
| AC-020 (`fa6-*`) | superseded | C10 → Phosphor |
| INV-063 / A-16 (`FaObject` prop shape) | amended | C10 → `icon: string` |
| INV-068, INV-160 | **overruled** | C11 → caret kept |
| INV-051, INV-090 | **overruled** | C12 → hidden textarea, no unique-match submit |
| INV-096 / A-05 | superseded | C13 → live acc + tpm, no live score |
| SB-160 (keep-list) | amended | C14 → sound/presets/tags/difficulty/min-* struck |
| CP-098 | **struck** | C15 → tags deleted |
| CP-118, CP-119 (tag PB) | amended | C15 → four legend buttons, `PB: <score>` only |
| AC-018 (badges) | amended | C16 → flags kept, badges deleted |
| INV-101 (delete `UserFlags.tsx`) | amended | C16 |
| INV-034, INV-114, A-10 (streaks) | **overruled** | C17 |
| CP-123 item 3 (`practise mistakes`) | **struck** | C19 → four action buttons |
| CP-025 (pill grouping) | superseded | C20 → SB-084 |
| CP-027 (`ph:gear-bold` mobile) | amended | C20 → `tabler:settings` |
| ME-083 / A6 (`"12"`) | superseded | C21 → `"100"` |
| INV-142, INV-145 | **overruled** | C23 → Redis/BullMQ removed |
| INV-150 (email templates) | amended | C24 → deleted |
| INV-144 / INF-147 (stats dashboard) | resolved | C25 → deleted; 3 Key Vault secrets |
| ME-001 (`@crococalc`) | amended | C26 → `@croco-calc/math-engine` |
| INV-083 (engine location) | amended | C26 → `packages/math-engine` |
| INV-052 (`#wpmChart`, `#resultWordsHistory`) | amended | C27 |
| SB-013 ("at most 3-digit") | corrected | C28 → exactly 3 |
| ME-135 | scoped | C29 → pre-commit answers only |
| CP-164 ("byte-for-byte") | softened | C30 |
| SB-175 (`result.time`) | restated | C31 → `result.mode2` |
| CP-058 (leading `.`) | extended | C32 |
| ME-131 / ME-134 (ASCII minus) | amended | C33 → U+2212 for display |
| CP-139 ("eight generators") | corrected | C34 |
| AC-120.3 (`minTimeTyping`) | renamed | C35 → `minTimeSpent` |
| **Rows below added in revision 2** | | |
| SB-101, SB-102 | restated | C36 → guard evaluated **after** the coupling cascade; new SB-215 holds the predicate |
| SB-203 | corrected | C36 → three test cases, incl. the mul + fracMul case |
| ME-089 | **upheld as binding over SB-101** | C36 |
| CP-108 (`afk` display), AC-026 / AC-100 (`idleDuration`) | renamed | C37 → persisted `afkDuration`, displayed `idle`, hook `data-afk` |
| AC-121.4, AC-100 (`bailedOut` column) | **struck** | C38 → no bail-out concept; new AC-187 |
| C14 keep-list (`bailOut`) | amended | C38 → `bailOut` struck from the palette keep-list |
| INV-033 (`bailedOut` in the keep-as-is set) | amended | C38 |
| AC-032 (bail-out hedge) | resolved | C38 |
| SB-105 assumption note (decimals deferral) | resolved | C39 → doc 01 A13 / ME-091 / ME-107 |
| ME-161 (`net`) | renamed | C40 → `score` |
| ME-160 / ME-162 / ME-163 (field spellings) | amended | C40 → AC-001 … AC-006 names are the schema |
| §6.1 + C14 (`blindMode`) | **struck** | C41 |
| CP-178 (`word`, `character`) | amended | C42 → whole-word, `password*` exempt; DoD-07 aligned |
| AC-027 (XP mode-modifier table) | amended | C2 → keyed on stored literals, not display labels |
| AC-078, AC-081 (`ResultFiltersSchema` groups) | amended | C2 → stored literals; labels are presentation only |
| AC-101, AC-102 (table + balloon text) | amended | C2 → label rendered via the SB-024…SB-047 map |
| AC-121.3 (eligibility predicate) | amended | C2 + C4 → `settingsId` over stored literals |
| AC-009 | superseded (already) → **pointer added in place** | C2 |
| §6.1 (`liveSpeedStyle`, `liveAccStyle` missing) | corrected | review gap 3 → both added (CP-078, C13) |
| §6.1 (`accountChart` arity) | corrected | review gap 3 → 5 entries (AC-085) |
| CP-012 (`eight` → `seven`) | corrected | review gap 19 |
| CP-048 (`press any key to start`) | corrected | review gap 20 → `type a digit to start` |
| CP-055 (16-character cap) | extended | review gap 21 → ME-151 restated on the filter |
| CP-058 (trailing `.` / `/` / bare `-`) | extended | C32-extended → new CP-058a commit-time normalisation |
| CP-054 (mobile keypad) | extended | review gap 9 → new CP-191 … CP-196 symbol row |
| CP-130 (daily-leaderboard gate) | corrected | review gap 18 → full predicate incl. `mode2 ∈ {4,8}` |
| INF-034 (rationale) | amended | review gap 2 → correctness comes from INF-151, not `minReplicas` |
| INF-058 ("revisit") | **restated as a decision** | review gap 14 → named fallback Atlas Flex; new INF-058a |
| INF-086 (secrets list) | extended | review gap 13 → new INF-086a (`BACKEND_URL`, `DB_URI`) |
| INF-037 (cost table) | extended | review gap 23 → per-line sources + 5 missing line items; new INF-156 gate |
| INF-038 (60 % headroom) | amended | review gap 23 → Flex path pre-approved under the $50 ceiling |
| INV-148 (plausibility checks) | **quantified** | review gap 8 → new ME-179 … ME-183 |
| ME-177 (engine version gate) | extended | review gap 26c → new ME-184 compatibility-header bump |
| DoD-04 (`backend/src/anticheat/index.ts`) | reworded | review gap 25 → assert the *stub* is gone, not the path |
| DoD-07 (grep pattern) | corrected | C42 |
| DoD-19 (stops at SB-213) | extended | review gap 26a → through SB-214 with a stated tolerance |
| WP-03 / WP-08 / WP-11 exit criteria | scoped | review gap 15 → repo-wide greps demoted to DoD-07/08/-49 |
| §6 file ownership (4 collisions) | corrected | review gap 10 → carve-outs in WP-04/08/09/12 |
| §6 coverage (unowned paths and IDs) | completed | review gaps 11 + 12 → new §6.2 and §6.3 |
| **Rows below added in revision 3 — user decisions of 2026-08-02** | | |
| INF-056 (DB option table) | **re-evaluated with citations** | user decision → Azure DocumentDB (Cosmos MongoDB **vCore**) chosen; Cosmos **RU** rejected on evidence (no `$setWindowFields`, no `$bucket`, no `$lookup` sub-pipeline); self-hosted Mongo rejected on Azure Files/WiredTiger grounds |
| INF-057 (Atlas M0) | **superseded** | user decision → `azurerm_mongo_cluster`, tier M10, `westeurope` |
| INF-058 / INF-058a (M0-vs-Flex probe fork) | **superseded** | user decision → probe now *verifies* the live cluster; four required clauses; no pre-approved fallback tier |
| INF-062 (Flex upgrade path) | **replaced** | user decision → cost lever is `mongodb_tier` + `mongodb_location`; free tier is $0 but `northeurope`-only, no backups, no HA |
| INF-062a | **new** | vCore needs `retrywrites=false` in the URI; the Atlas-era `retryWrites=true` would fail on first write |
| INF-059 / INF-060 / INF-061 | amended | firewall rule replaces the Atlas IP access list; admin user replaces the Atlas DB user; `mongodump` becomes defence in depth on M10 |
| INF-005 (single region) | amended | one documented exception: the free-tier lever moves the DB to `northeurope` |
| INF-074 / INF-086 (providers, secrets) | amended | `mongodbatlas` provider and `MONGODB_ATLAS_*` secrets struck |
| INF-035 (container sizing) | **AMENDED AND APPLIED 2026-08-03** | `cpu = 0.25`, `memory = "0.5Gi"`, down from `0.5` / `"1Gi"`. The original figure was never grounded in measurement; the replica actually draws **0.0050 vCPU** and **~99 MiB**, so ~50× CPU and ~5× memory headroom remain. Applied via Terraform; revision `ca-croco-calc-api--0000003` started **healthy, `restartCount = 0`**, no OOM |
| INF-036 (scale rule) | **re-examined 2026-08-03, unchanged** | `concurrentRequests = 50`, min 1 / max 3 all kept. Scaling out is cost-neutral per unit of load (two 0.25 vCPU replicas bill what one 0.5 vCPU replica did), measured traffic is 0 requests so there is nothing to tune against, and `maxReplicas = 3` bounds the tail against a hard ceiling |
| INF-037 (cost table) | **VERIFIED; CORRECTED 2026-08-03; RE-BASED 2026-08-03** | every row cited from the Azure Retail Prices API for `westeurope`, re-queried 2026-08-03. The single figure ≈ $39.42/mo is **withdrawn** — it assumed ACA free grants croco calc does not get (they are per-subscription and already spent by the user's other apps) and a 0 %-active replica. The corrected ≈ $38.4 – 48.6/mo is **also superseded** by INF-144's applied sizing lever. Current total **≈ $30.5 – 35.6/mo ≡ CHF 24.6 – 28.8** at CHF/USD 0.808 |
| INF-038 (60 % headroom) | **still breached, deliberately, but far less** | ≈ $30.5 – 35.6 leaves **29 – 39 %** headroom (was 3 – 23 % before the sizing lever). Still under the hard $50 ceiling and user-accepted. The database is **74 % of the bill**, so the 60 % rule is unreachable while it stays; ≈ $7.9 – 13.0 remains available via INF-062's free-tier lever, now the only lever left |
| INF-156 (cost-table gate) | **cleared** | no row carries the italic marker; `infra.yml`'s grep made precise so INF-156's own prose cannot trip it |
| **BL-4** (Atlas org + API keys) | **RETIRED** | user decision → no Atlas account needed at all |
| **B6** (ACA rates from memory) | **RESOLVED** | rates now cited; residual risk is the idle-vs-active assumption, policed by INF-144 |
| C24 (transactional email) | **discharged + fixed** | audit found the deletion already complete; receiving = Cloudflare Email Routing, sending = Firebase only; ACS rejected (no inbound capability) |
| **BL-7** | **new** | Cloudflare Email Routing not yet enabled — user is doing it themselves in the dashboard |
| **Rows below added in revision 4 — remediation of the stage-3 validation** | | |
| INF-024 (workers.dev production URL) | **overruled** | D1 → `https://crococalc.com` |
| INF-025 (no custom domain / zone / DNS) | **overruled** | D1 → apex + `www` provisioned as Workers Custom Domains |
| INF-047 second sentence ("No custom domain … for v1") | **scoped** | D1 applies to the **frontend only**; the API keeps its `*.azurecontainerapps.io` FQDN, so INF-030's preconnect is generated from `BACKEND_URL` rather than written literally |
| INF-050 / INF-052 (`FRONTEND_URL` = workers.dev) | **amended** | D1 → `https://crococalc.com`; the backend CORS allowlist carries the `www` sibling too |
| DoD-39 (smoke-test the workers.dev URL) | **amended** | D1 → smoke-test `https://crococalc.com/`; `workers_dev` stays enabled only as a pre-DNS deploy check |
| §5.2 row "Custom domain, Cloudflare zone, DNS" | **struck** | D1 → no longer deferred |
| ME-088 ("one config-change event") vs SB-090 (`overrideConfig` loop) | **reconciled** | C43 |
| DoD-04a, DoD-07, DoD-12, DoD-13a, DoD-14 (grep wording) | **corrected** | C44 |
| INF-043 (`:latest`) | **restated as testable** | `container_image` has no default and two `validation` blocks; `infra.yml` supplies the SHA |
| §1 index total (**1111**) | **corrected** | revision 3 added `INF-053a` and `INF-062a`; the true total is **1113**, INF 158 → 160. Evidence: `docs/coverage/requirement-coverage.md` |
| INF-037 total vs doc 06 range | **corrected, then re-opened 2026-08-03, then re-based** | the single figure ≈ $39.42/mo is withdrawn; doc 06 carries a measured range, which is a range because the ACA vCPU row genuinely is one. After INF-144's sizing lever that range is **≈ $30.5 – 35.6/mo**; the intermediate ≈ $38.4 – 48.6 figure is superseded |
| INF-143a (subscription budget) | **new, created 2026-08-03** | `budget-azure-subscription-total`, **CHF 500**, subscription scope, **Actual 80 % / 100 % only — no Forecasted** (a forecast alert is what produced the 2026-08-03 false alarm). Declared in `infra/terraform/bootstrap/`, **not** `prod/`, so a `terraform destroy` of croco calc cannot delete the user's subscription-wide guard; carries `prevent_destroy`. It is **not** croco calc's budget |
| **Rows below added in revision 5 — the in-run screen redesign (C45, user decision D3, 2026-08-03)** | | |
| ~~CP-030, CP-031, CP-032~~ | **struck** | C45 → one task at a time; `#tasks` flex-wrap stream, `div.task[data-taskindex]` and the `<letter>` answer rendering are all deleted. See `07-…` TR-016, TR-079, §13.1 |
| ~~CP-041~~ | **struck** | C45 → the 0.5-opacity committed-task hint is replaced by `#taskReveal`, which is primary information, not decoration (TR-052) |
| ~~CP-044~~ | **struck** | C45 → no three-line window, no line jump, no `activeWordTop` bookkeeping (TR-022) |
| ~~CP-046, CP-047, CP-051~~ | **struck** | C45 → nothing is rendered pre-start, so there is nothing to blur or reveal. The *requirement* (no pre-reading advantage) is preserved structurally (TR-038, TR-039) |
| ~~CP-048~~ | **struck** | C45 → the `type a digit to start` hint is replaced by a real `start test` button (TR-040) |
| ~~CP-053~~ | **struck** | C45 → the hidden `<textarea id="tasksInput">` becomes a visible `<input id="answerInput">` (TR-079). The anti-interference attributes are kept (TR-083) |
| ~~CP-067, CP-068, CP-069, CP-070, CP-072~~ | **struck** | C45 → the custom caret is deleted; the browser's native caret is used, themed with `--caret-color` (TR-020, TR-091) |
| ~~CP-037 (the `Space` half)~~, ~~ME-140 (the `Space` half)~~ | **struck** | C45 → submit is Enter only; Space's stated rationale was monkeytype muscle memory (TR-131, TR-132) |
| ~~**C11**~~ (caret kept; INV-068 / INV-160 overruled; `smoothCaret` + `caretStyle` restored) | **struck** | C45 → C11's own reason clause presupposed CP-053's hidden textarea, which is now struck. **INV-068 and INV-160 are reinstated**; `smoothCaret` and `caretStyle` are removed from §6.1's retained key set. `--caret-color` is **kept** (TR-020) |
| ~~**C12**~~ (hidden-textarea capture + `.answer` letters normative) | **struck** | C45 → **INV-051 is reinstated on its "single numeric answer input" clause**. C12's other half survives: INV-090's "submit on Enter **or on unique-match**" stays **OVERRULED**, and ME-153 / ME-152 / CP-036 remain binding anti-cheat requirements (TR-134, TR-135) |
| CP-019, CP-020 | amended | C45 → the child list becomes `07-…` TR-012's element set |
| CP-033, CP-034, CP-035 | amended | C45 → binding, applied to `#taskPrompt`; the four `--*-letter-*` custom properties are renamed to math vocabulary (TR-019) |
| CP-036 / ME-152 | **upheld, unchanged, still critical** | C45 → no pre-commit feedback of any kind. The post-submit animation complies because judgement has already happened (TR-046, TR-135) |
| ME-153 | **upheld, unchanged** | C45 → TR-134/TR-135 state exactly what it forbids (advance *without* a submit event) and why the post-submit advance is not that. `quickEnd` still MUST NOT be ported |
| **C29** | **upheld, unchanged, and easier to satisfy** | C45 → one task exists at a time; `07-…` §7 is the proof, including the exact moment the answer enters the DOM |
| **C13** | **upheld** | C45 → timer + live acc + live tpm, no fourth readout. Only the layout moves (TR-031) |
| **C30** | **extended by one edit class** | C45 → the TR-019 property rename in 8 of the 52 theme files, with the same PR-listing obligation C30 already imposes (TR-186) |
| **C33** | **upheld** | C45 → TR-097/TR-098 state exactly where U+2212 appears and where the ASCII buffer legitimately does not |
| CP-040, CP-042, CP-043, CP-045, CP-049, CP-050, CP-052, CP-054 … CP-059, CP-058a, CP-073 … CP-089, CP-183, CP-184, CP-191 … CP-196 | amended in placement only | C45 → binding in substance; see `07-…` §13.2 for the per-ID amendment |
| CP-186, CP-187 | amended | C45 → `data-state` gains `awaitingContinue` (TR-010); `data-taskindex` / `data-result` move to `#taskArena` (TR-015) |
| ME-136 | amended | C45 → the first task is generated but **not rendered** pre-start, rather than rendered-and-blurred (TR-038) |
| ME-154, ME-156 | amended | C45 → a wrong answer still commits, scores and advances with no retry and no penalty time; the advance now requires an explicit continue. The timer runs throughout, so this is not penalty time (TR-062, `07-…` §13.2) |
| ME-159 | clarified | C45 → `tStart` is recorded when the prompt is **rendered**, which is what ME-159 already said. TR-074 proves ME-165 / ME-179 … ME-182 are unaffected |
| ME-158 | **upheld** | C45 → CP-045's *rendering* rationale is struck, but the rolling-batch *generation* rule survives here (TR-190) |
| ME-174 … ME-177, ME-179 … ME-184 | **upheld, unchanged** | C45 → the payload, the seeded regeneration and the plausibility thresholds do not change. **No engine version bump may be issued for this redesign** (`07-…` TR-165) |
| DoD-05 | amended | C45 → `frontend/src/ts/elements/caret.ts` and `frontend/src/styles/caret.scss` move from the "these do exist" list to the "these do not exist" list (TR-255) |
| §6.1 (`smoothCaret`, `caretStyle`) | **struck** | C45 → both keys removed from the schema, the defaults, the metadata, the palette and the migration path (TR-203 … TR-208) |
| §6.1 (`maxLineWidth`) | retained, retargeted | C45 → the key name is kept for stored-config compatibility; it now bounds the task arena's width (TR-025, TR-258) |
| §6.1 (`flipTestColors`, `colorfulMode`) | retained, rebound | C45 → they bind to the renamed math properties (TR-247) |
| §1 index total | **extended** | C45 → `07-test-screen-redesign.md` adds `TR-001 … TR-262` (**262**), taking the consolidated total to **1375**. C46 (revision 6) extends doc 07 to `TR-001 … TR-335` (**335**), taking the total to **1448** |
| **Rows below added in revision 6 — mathematical typography (C46, user decision D4, 2026-08-03)** | | |
| **ME-130** | **amended, not struck** | C46 → survives as the rule for the **string encoding** (`n/d`, no spaces), which the engine, the task log, the event log and ME-174's regeneration all still use. Its prohibition on **stacked/vertical rendering** is withdrawn: its sole stated reason was the wrapping word-row layout, which C45 deleted. Fractions are now displayed stacked (`07-…` TR-263, TR-265, TR-277) |
| ~~`07-…` **TR-029**~~ | **struck** | C46 → it required the prompt to use "`×`, `÷`, `/` for fraction values". The `×` / `÷` / U+2212 clauses survive as TR-281; the `/`-for-fractions clause is exactly what the user rejected. Struck **in place** in doc 07 with its original text preserved |
| `07-…` **TR-145** | amended | C46 → `#taskAnnouncer` receives the **spoken form** ("3 over 4 plus 5 over 6"), not the raw engine string. The occasions are unchanged. The task log and event log still carry `task.prompt` verbatim (TR-303, TR-304) |
| ME-127, ME-128 | **upheld, and load-bearing** | C46 → ME-128's reservation of `/` for fractions and `÷` for division is what makes the stacking predicate exact and the division-vs-fraction distinction mechanically decidable (TR-277, TR-278). Assumption **A9** is reinforced, not disturbed |
| ME-129, ME-131, ME-132, ME-133, ME-134 | **upheld, unchanged** | C46 → they define the display strings §14 parses. `renderPrompt` and `renderAnswerDisplay` are not modified |
| ME-137 … ME-143, ME-147, ME-151 | **upheld, unchanged** | C46 → the **accepted answer format does not change**. The user still types `5/6`; only the reveal is typeset (TR-314) |
| ME-177 / ME-184 | **not triggered** | C46 → no `MATH_ENGINE_VERSION` bump. Generation, mixing and judging are untouched and no engine-produced string moves (TR-266, TR-267) |
| **C29** | **upheld**, with two new obligations | C46 → timing is unchanged, but the answer now has a second textual representation: the reveal must be cleared with `replaceChildren()` so no `aria-label` survives, and the C29 tests must also assert the spoken form is absent (TR-316) |
| **C33** / ME-161 | **upheld and extended** | C46 → from the minus sign to **every** operator glyph. TR-097/TR-098's exemption for the ASCII buffer inside `#answerInput` still stands (TR-284) |
| `07-…` TR-030 | **upheld and reinforced** | C46 → the display/log split it established is the mechanism §14 builds on: display is derived, the logged string is verbatim (TR-268) |
| DoD / §7.3 greps | **extended** | C46 → two greps added: no code path writes a literal `/` into the arena's text, and `git diff --stat packages/math-engine` is empty for the typography commit (TR-330). **Landed as DoD-15a in §7.3** |

Everything not in this table is binding as written.

### 2.32 Standing user decisions cited by code

Source files cite these by id in comments. They are user decisions, not contradictions in the source
documents, and they are recorded here so the citation resolves.

- **D1 — the production frontend runs on `crococalc.com`.** The apex and `www.crococalc.com` are both
  provisioned as Cloudflare **Workers Custom Domains** on zone `crococalc.com`, so Cloudflare owns the DNS
  records and the certificate. `workers_dev` stays enabled purely so a deploy can be smoke-tested before DNS
  is looked at. Consequences, all implemented: `frontend/wrangler.jsonc` `routes`;
  `infra/terraform/prod/terraform.tfvars` `frontend_url`; `backend/src/app.ts`'s CORS allowlist (apex + `www`);
  `deploy-frontend.yml`'s smoke test; `frontend/src/ts/constants/links.ts` `SITE_DOMAIN`. This overrules
  INF-024, INF-025, INF-050 and INF-052, and removes the §5.2 deferral — see the §2.31 rows above.
  D1 covers the **frontend only**: no custom domain is provisioned for the API (INF-047 stands).
- **D2 — two mailboxes on that domain.** `contact@crococalc.com` (CP-156) and `support@crococalc.com`,
  received through Cloudflare Email Routing (C24). Sending stays Firebase-only. BL-7 tracks the dashboard
  side, which the user is enabling themselves.
- **D3 — the in-run screen is one task at a time, and all typing machinery is purged.** The premise "the
  test screen must look EXACTLY like monkeytype" is withdrawn **for the in-run screen only**; the chrome
  stays monkeytype-like. Submit is Enter; a correct answer plays a brief affirmative animation and advances;
  a wrong answer shows the correct result and waits for an explicit continue, **with the timer still
  running**. The caret, the `<letter>` rendering, the hidden capture textarea, the task-stream geometry and
  the first-task blur are deleted; the requirement the blur served is preserved by not rendering a task
  before the run starts. Ruled in **C45**; specified in full in
  `docs/requirements/07-test-screen-redesign.md` (`TR-001 … TR-262`). Code cites this as **D3**.
- **D4 — the in-run screen is typeset as mathematics.** Fractions are displayed as **real stacked
  fractions**, not with a `/`; operators use `×`, `÷` and U+2212 throughout; a division task (an operation)
  and a fraction (a value) are visually distinct by construction. Done with a small CSS/markup primitive,
  not KaTeX/MathJax. The **input format is unchanged** — the user still types `5/6` — and the in-progress
  answer is not live-restacked; the stacked form appears in the wrong-answer reveal. The math engine is not
  modified and no engine version bump is issued. Ruled in **C46**; specified in
  `docs/requirements/07-test-screen-redesign.md` §14 (`TR-263 … TR-335`). Code cites this as **D4**.

### C43 — ME-088's "one config-change event" vs SB-090's mandated mechanism

**The conflict.** ME-088 says ME-082/ME-084 "MUST be implemented as a **single transactional config update
that emits one config-change event**, so ME-007 (restart on change) fires exactly once". SB-090's preamble
says the coupling "MUST be implemented with monkeytype's own mechanism, `overrideConfig` …, executed by the
loop in `frontend/src/ts/config/setters.ts`". That loop recurses into `setConfig` per coupled key, and every
`setConfig` dispatches its own `configEvent`. The two cannot both be satisfied literally.

**Ruling.** SB-090 wins on mechanism; ME-088 wins on its stated *purpose*. `configEvent` is a per-key
notification whose subscribers (themes, the SB-096 pulse, the chart, the caret, the result screen) need the
key, the old value and the new value, so collapsing it would lose information and buy nothing — none of the
eight subscribers restarts the test. What MUST be transactional is the observable consequence:

1. **Exactly one `restartTestEvent` per user action**, however many keys the cascade moved. `applyConfig`
   dispatches once, after the whole batch, comparing only the keys whose metadata declares
   `changeRequiresRestart` (SB-055). The bar, the mobile modal and the palette each dispatch once per click.
2. **One persisted write.** `saveToDatabase` is debounced at 1000 ms (SB-121/SB-123), so the second
   `saveToLocalStorage` in a cascade coalesces into the same request.

ME-088 is therefore **amended** to read "…MUST be implemented as a single transactional config update that
causes exactly one restart", and the per-key `configEvent` count is explicitly not normative.

### C44 — five DoD greps assert more than their requirement means

DoD-04a, DoD-07, DoD-12, DoD-13a and DoD-14 are written as mechanical greps over the tree. Each is a proxy
for a substantive requirement, and each proxy over-fires on *prose that records the removal* — a comment
naming the thing that is gone is evidence the removal happened, not evidence it did not. DoD-14 is worse than
imprecise: it is unsatisfiable, because it greps the whole history and every match is inside monkeytype's
inherited commits, which INF-136 preserves and `NOTICE` clause 3 forbids rewriting.

**Ruling.**

- **DoD-04a** — scope to the runtime surface: the assertion is that no `BYPASS_*` variable is *set* or *read*.
  A Dockerfile comment explaining that upstream hardcoded one does not fail it.
- **DoD-07** — as already amended by C42, the subject is **user-visible strings**. Code comments and legacy
  **migration** comparisons against stored monkeytype values are out of scope.
- **DoD-12** — kept literal and now **passes literally**: zero matches in `frontend/src`. The one place that
  has to talk about the old markup (`utils/icon-html.ts`) is worded so it does not reproduce a class string.
- **DoD-13a** — scope to live identifiers: `grep -rnw` over `bailOut|bailedOut|blindMode|idleDuration|net`
  excluding comment lines. Doc comments recording that C38/C41 struck them are required by C38 itself.
- **DoD-14** — scope to post-fork history: `git log --format=%B f0c57c5c..HEAD`. As written it can never pass
  and contradicts INF-135's own INF-136.

### C45 — the in-run screen is no longer a typing-test stream (user decision D3, 2026-08-03)

**This is not a contradiction between the source documents.** It is a **user design decision that overrides
them**, recorded here so that every ruling it withdraws keeps its audit trail. Nothing below is edited in
place in §2's earlier entries; C45 is additive, and §2.31 gains a corresponding block of rows.

**The decision, verbatim.** "You need to fully redo the tests themselves. I based this on monkeytype because
I liked the interface. But this has nothing to do with typing, so all the typing related stuff can be fully
removed from the codebase. The whole interface while we're in a run needs to be different. It should be one
task at a time. And not with all the typing interface stuff, that just doesn't make sense."

**The premise that is withdrawn.** CP-030 … CP-089, and the §2 rulings C11 and C12 that were made under
them, all rest on "the test screen must look EXACTLY like monkeytype in design". That premise is withdrawn
**for the in-run screen only**. C11's ruling text says so explicitly in its own reason clause — "INV-068
presupposes a visible `<input>`. CP-053 keeps monkeytype's hidden capture textarea … so there is no native
caret to see" — and CP-053 is now struck, so C11's stated ground is gone with it.

**What is NOT withdrawn.** The chrome stays monkeytype-like: the header, the settings bar, the modes-notice
strip, the footer, the results page, the account pages, the 52 themes and the overall minimalism are
unchanged and remain the reference. CP-036 / ME-152 (no per-character feedback), ME-153 (no auto-advance)
and master C29 (answers not in the DOM) are **all preserved**, and the new document restates each with its
proof.

**Ruling.** A seventh source document, **`docs/requirements/07-test-screen-redesign.md`**, is authoritative
for the in-run experience. It numbers **TR-001 … TR-262** and it wins over every requirement it names in
its §13, and over none other. Its §13 is the normative supersession map; the summary rows are mirrored into
§2.31 below.

- The in-run screen is **one task at a time**, large and centred, with the timer / live tpm / live acc row
  above it and the answer entered directly below it. No stream, no upcoming tasks, no committed tasks, no
  scroll geometry, no line jump.
- Submit is **Enter**. `Space` as a second commit key is struck (its own rationale was monkeytype muscle
  memory). Auto-advance on unique match remains **rejected** (ME-153).
- A correct answer plays a brief affirmative animation and advances automatically. A wrong answer plays a
  brief negative animation, **displays the correct answer**, and waits for an explicit continue (Enter).
  **The timer keeps running during that pause** — the cost of an error is time, which is the point.
- The custom caret, the `<letter>` rendering, the hidden capture textarea, the task-stream geometry and the
  first-task blur/mask machinery are all deleted. The *requirement* the blur served — a user must not be
  able to read the first task before starting — is preserved and is satisfied structurally: no task is
  rendered until the run begins.
- Every remaining typing-test concept is purged from the codebase. `docs/requirements/07-…` §10 is the
  deletion inventory, by verified path.
- The math engine is untouched. **No engine version bump is issued**, because generation, mixing and judging
  do not change and a bump would reject every cached client mid-flight (ME-177 / ME-184).
- The result payload, the seeded regeneration (ME-174), the task log (ME-159) and the plausibility
  thresholds (ME-179 … ME-182) are unchanged. `07-…` §8 carries the proof.

### C46 — the in-run screen is typeset as mathematics (user decision D4, 2026-08-03)

**This is not a contradiction between the source documents.** Like C45 it is a **user design decision that
overrides them**, recorded so every ruling it withdraws keeps its audit trail. It is **additive to C45**, not
a reversal of it: C45's one-task-at-a-time arena is the surface C46 typesets.

**The decision, verbatim.** "bitte sorge dafuer, dass bspw. brueche auch als solche angezeigt werden und nicht
mit /" — *make sure that fractions are displayed as fractions, and not with a `/`.*

**The premise that is withdrawn.** **ME-130** reads: *"Fractions MUST be rendered inline as `n/d` with no
spaces around the `/`. Stacked/vertical fractions MUST NOT be used: they would break the single-line, wrapping
word-row layout that the test page inherits from monkeytype."* Its **entire stated reason** is the wrapping
word-row layout — which C45 deleted (TR-022). This is the same pattern as C11: the ruling's own reason clause
names a premise that a later decision withdrew, so the ruling falls with it. ME-130 is **amended, not struck**
— it survives as the rule for the **string encoding**, and loses its authority over the **visual form**.

**Ruling.** `docs/requirements/07-test-screen-redesign.md` gains a **§14** numbering **TR-263 … TR-335**, and
it is authoritative for mathematical typography on the in-run screen.

- Fractions are **stacked** — numerator over denominator, separated by a drawn vinculum. No `/` on screen.
- Operators use proper glyphs throughout: `×` (U+00D7), `÷` (U+00F7), `−` (U+2212). C33 / ME-161's rule for
  the minus sign is **extended to every operator**.
- **A division task and a fraction MUST look different.** `144 ÷ 12` is an operation, on one line, with the
  division sign; `1/2` is a value, stacked. This is decidable mechanically because ME-128 already reserves
  `/` for the fraction separator and mandates `÷` for division — doc 01's assumption **A9**, taken for an
  unrelated reason, is what makes the visual rule exact (TR-277, TR-278).
- Implemented as a **small CSS/markup primitive** (`frontend/src/ts/test/math-typeset.ts`), **not** KaTeX or
  MathJax — the grammar is a two-operand expression and the bundle budget is real (TR-270).
- **Accessible:** a stacked fraction carries `role="math"` and an `aria-label` of "1 over 2", and the live
  announcer is amended to speak "3 over 4 plus 5 over 6" instead of reading the slash aloud (TR-302, TR-303).
- **Input is unchanged.** The user still types `5/6`; the accepted answer grammar (ME-137 … ME-143, ME-147)
  is untouched. The in-progress answer stays **plain text** and is not live-restacked — an `<input>` cannot
  hold markup, so live-stacking would rebuild the very hidden-field-plus-rendered-glyphs architecture C45
  deleted (TR-309 … TR-311). The **wrong-answer reveal** uses the full stacked typography (TR-312).
- **The math engine is untouched and no version bump is issued.** `FRACTION_SEPARATOR = "/"` stays; the task
  log, the event log and ME-174's seeded regeneration keep comparing the engine's verbatim strings. The
  typeset form is a pure function of the display string, computed at render time and never persisted
  (TR-266 … TR-269).
- **C29 is unchanged in timing** but gains two obligations, because the answer now has a second textual
  representation: the reveal must be cleared with `replaceChildren()` so no `aria-label` survives, and the
  C29 tests must also assert the spoken form is absent (TR-316).

---

## 3. Assumptions (consolidated)

All assumptions from the six documents, with their status after §2. "Upheld" means stage 2 implements it as
written; "superseded" means §2 replaced it.

### 3.1 Math generation (doc 01, A1–A12)

| # | Assumption | Status |
|---|---|---|
| A1 | `+100`/`+1000` bound the **whole task** (German *Zahlenraum*), not each operand | Upheld (ME-028/029) |
| A2 | Lower bounds added so the two addition states occupy disjoint difficulty bands | Upheld (ME-031) |
| A3 | `xx` in `xxx/xx` means **at most** two digits; single-digit divisors legal | Upheld (ME-053) |
| A4 | Fraction addition requires `d1 ≠ d2` | Upheld (ME-060) |
| A5 | `numerator < denominator` is a global invariant, not just setting 4 | Upheld (ME-077) |
| A6 | Coupling forces `multiplication = "12"` | **Superseded → `"100"` (C21)** |
| A7 | Decimals is a sixth **task kind**, not a per-task modifier | Upheld (ME-090 ff.) |
| A8 | Strengthen `(sA,sB) ≠ (0,0)` to "A, B and the answer must not all be integers" | Upheld (ME-100/101) |
| A9 | `÷` in prompts, `/` reserved for fractions, `144/12` kept as a bar label | Upheld (ME-128) |
| A10 | `.` for display, `,` also accepted on input | Upheld (ME-133, ME-138) |
| A11 | Decimal base kind drawn uniformly over the **enabled** subset of add/mul/div | Upheld (ME-091) |
| A12 | `144/12` does **not** follow the multiplication setting; fixed at 1…12 | Upheld (ME-045) |
| A13 | The brief's "randomly one of types 1-3" is normative; "based on division" is its *justification*, not a restriction | **New in revision 2** — upheld, and now the ruling (C39). Sign-off requested: OQ-15 |

### 3.2 Settings bar (doc 02, §18)

| Item | Assumption | Status |
|---|---|---|
| SB-012 | `time` stored in **minutes** in config; seconds only in the result payload | Upheld |
| SB-044 | `tabler:minus` for negatives + mandatory tooltip; `tabler:plus-minus` is the one-line alternative | Upheld |
| SB-090 | Coupling switches multiplication to `"100"` | Upheld, and now the ruling (C21) |
| SB-101 | The last enabled generator cannot be switched off | Upheld, **restated by C36** — evaluated after the coupling cascade (SB-215, ME-089) |
| SB-105 | `decimals` disabled when add/mul/div are all off | Upheld (matches ME-092) |
| SB-073 | Every ON control renders in `--main-color`; single-line override documented if too loud | Upheld, flagged OQ-9 |

### 3.3 Core pages (doc 03, §9)

| # | Assumption | Status |
|---|---|---|
| 9.1 | Blur the **whole** stream pre-start, not only task 0 | Upheld (CP-047) |
| 9.2 | No per-character feedback — the one deliberate mechanical divergence from monkeytype | Upheld (CP-036, ME-152) |
| 9.3 | `Enter` **and** `Space` both commit | Upheld (CP-037, ME-140) |
| 9.4 | Three-pill settings-bar grouping | **Superseded by SB-084 (C20)** |
| 9.5 | On-screen keymap removed, not replaced; numpad hint explicitly rejected for v1 | Upheld (CP-060/061) |
| 9.6 | Chart primary axis = cumulative **score** (so the PB annotation stays meaningful) | Upheld (CP-114) |
| 9.7 | `tpm` lives in the `morestats` row | Upheld (CP-096) |
| 9.8 | `tpm` line is a **running average**, not momentary | Upheld (CP-115) |
| 9.9 | Accept `.` and `,`, normalise to `.` | Upheld (CP-056) |
| 9.10 | Consistency = CV of per-task answer times | Upheld, formula per ME-165 (C5) |
| 9.11 | Support-modal ads/ko-fi/patreon buttons rendered **disabled** behind one constant | Upheld (CP-162) |
| 9.12 | Discord footer/about link rendered **disabled** until a server exists | Upheld (CP-017) |
| 9.13 | Contact email placeholder `me@emilvinu.de` | Upheld, blocker B-1 |
| 9.14 | Logo tagline placeholder `snap snap` | Upheld, blocker B-2 |
| 9.15 | Replay removed; the task history supersedes it | Upheld (CP-124) |
| 9.16 | Three visible lines | Upheld (CP-044) |
| 9.17 | Mobile answer entry needs a `-` `/` `.` symbol row because `inputmode="decimal"` supplies none of them | **New in revision 2** (CP-191 … CP-196, review gap 9). Mobile is IN scope: CP-180 already requires a working 320 px render and SB-165…168 already specify the mobile bar |

### 3.4 Account pages (doc 04, §9.1)

| # | Assumption | Status |
|---|---|---|
| A1 | Drop rawWpm/charStats/keyConsistency/burst (and consistency) | Upheld except consistency (C5) |
| A2 | "Default settings" excludes `time` | Upheld (AC-012, ME-017, SB-172) |
| A3 | The default-settings gate does **not** apply to the weekly XP board | Upheld, **needs sign-off (OQ-5)** |
| A4 | Two PB cards, both 1/2/4/8 minutes: `default settings` and `current settings` | Upheld (AC-060) |
| A5 | Streaks dropped | Upheld, and now the ruling (C17) |
| A6 | Tags dropped | Upheld, and now the ruling (C15) |
| A7 | Store `spm`; add a fifth `Per minute` chart toggle | Upheld (AC-006, AC-085, AC-086) |
| A8 | Drop the `keyboard` profile field; keep `bio` + socials | Upheld (AC-052) |
| A9 | "time typing" → "time spent" globally | Upheld (AC-014), incl. `minTimeSpent` (C35) |
| A10 | Activity-heatmap year dropdown ungated (no premium tier) | Upheld (AC-017, AC-069) |
| A11 | `/profile` with no name keeps the search page, at SHOULD level | Upheld (AC-159) |
| A12 | Histogram bucket = 10 score points, configurable | Upheld (AC-090) |

### 3.5 Inventory (doc 05, A-01 … A-18)

| # | Assumption | Status |
|---|---|---|
| A-01 | No settings page; theme picker extracted into a theme modal | Upheld, refined by C9 |
| A-02 | Delete the command palette | **Overruled (C8)** |
| A-03 | Delete the sound subsystem | Upheld (C14) |
| A-04 | Delete Prometheus / swagger-stats | Upheld (C25) |
| A-05 | Live timer + live score counter only | **Superseded (C13)** |
| A-06 | Crocodile in logo/favicon/app icon only; no in-test mascot | Upheld (INV-184) |
| A-07 | Delete the Storybook workspace | Upheld (INV-055) |
| A-08 | Delete Sentry | Upheld (INV-118d, INF-146) |
| A-09 | Delete tags | Upheld (C15) |
| A-10 | Keep XP, levels **and streaks**; delete badges and premium | Upheld except streaks (C17) |
| A-11 | Leaderboard eligibility enforced server-side, client never trusted | Upheld (ME-019, AC-121, SB-175) |
| A-12 | Track PBs per `time` × settings tuple | Upheld, restated as `(mode2, settingsId)` (C31) |
| A-13 | Replace keystroke-biometric anti-cheat with server-side plausibility checks | Upheld, **plus** ME-166 … ME-178 regeneration (C-note in §4) |
| A-14 | Keep the result chart | Upheld, axes per CP-113 … CP-121 |
| A-15 | Rename `master` → `main`, keep all history | Upheld (INF-119/120) |
| A-16 | Keep the `FaObject` prop shape | **Amended (C10)** |
| A-17 | Legal pages kept as build entry points, content rewritten | Upheld (INV-054, INF-011) |
| A-18 | App icon generated separately; only the asset paths are wired here | Upheld (INF-108 … INF-116) |

### 3.6 Infra (doc 06, §14)

| # | Assumption | Status |
|---|---|---|
| A1 | `master` → `main` | Upheld |
| A2 | Compute on Azure; DB is Atlas M0, still Terraform-managed | **OVERTAKEN 2026-08-02 by user decision.** DB is now **Azure DocumentDB (Cosmos DB for MongoDB vCore)**, `azurerm_mongo_cluster`, tier M10 in `westeurope`. Everything is on Azure; the deviation A2 existed to flag is gone (INF-057 amended) |
| A3 | Redis removed entirely | Upheld, and now the ruling (C23) |
| A4 | workers.dev subdomain resolved once at first deploy, then propagated to five places | Upheld (INF-024), open item OQ-1 |
| A5 | Region `westeurope` | Upheld (INF-005) |
| A6 | Default `*.azurecontainerapps.io` API FQDN; no custom domain | Upheld (INF-047) |
| A7 | No SMTP; Firebase Auth sends all user-facing mail | Upheld, and now the ruling (C24). **Verified by audit 2026-08-02** (INF-053a): no mail code remains. Receiving is Cloudflare Email Routing, not SMTP |
| A8 | reCAPTCHA kept (the production build hard-fails without a site key) | Upheld (INF-105) |
| A9 | User's 5-word lowercase commit convention overrides commitlint | Upheld (INF-134 … INF-136) |
| A10 | Database firewall open to all IPs + SCRAM-SHA-256/TLS (a NAT gateway would cost ~$32/mo) | Upheld (INF-059 amended); mechanism is now `azurerm_mongo_cluster_firewall_rule` |

---

## 4. Open questions and blockers

### 4.1 Hard blockers — work can start, but cannot be declared done

| # | Blocker | Blocks | Owner |
|---|---|---|---|
| **BL-1** | **No Firebase credentials exist.** `C:\Users\me\agent-secrets\` contains only `cloudflare.txt` and `openai.txt`. INF-091 … INF-096 and INF-102 (create the Firebase project, register a Web App, enable Email/Password + Google + GitHub providers, add authorised domains, generate a service-account key, set the email action URL) are all **HUMAN ACTIONS** that cannot be automated. | The production frontend build cannot produce a working auth config; the backend cannot verify ID tokens; none of the three sign-in providers can be tested end-to-end. Auth work is **code-complete but unverified** until this clears (INF-103). CI uses the stub config (INF-101). | Human |
| **BL-2** | **GitHub OAuth App cannot be created programmatically** (INF-094). The GitHub REST API has no endpoint for OAuth Apps, and the local `gh` token's scopes (`repo`, `workflow`, `delete_repo`, `read:org`, `gist`) do not cover developer settings. | GitHub sign-in. | Human |
| **BL-3** | **reCAPTCHA v2 keys do not exist** (INF-106). `frontend/vite.config.ts` hard-fails a production build without `RECAPTCHA_SITE_KEY`. | Every production frontend build. | Human |
| ~~**BL-4**~~ | ~~**MongoDB Atlas org + programmatic API key pair do not exist** (INF-086).~~ **RETIRED 2026-08-02 by user decision** ("just host mongodb via azure"). The database is now **Azure DocumentDB (Cosmos DB for MongoDB vCore)**, created by `azurerm_mongo_cluster` with the same Azure credentials as every other resource. No Atlas organisation, no API key pair, no `MONGODB_ATLAS_*` secrets. | ~~`terraform apply`~~ — **nothing**. This blocker is gone. | ~~Human~~ — no action required |
| **BL-5** | **Backend rejects `acc < 75`** (`backend/src/api/controllers/result.ts:215-217`) and `packages/schemas/src/results.ts:74` floors `acc` at 50. A math trainer legitimately produces 40–70 % accuracy. | Result saving would silently drop a large share of genuine runs; AC-029's `clamp((acc-50)/50, 0, 1)` would never see values below 50. **Both constraints MUST be removed or lowered to 0.** | WP-10 |

### 4.2 Open questions needing a decision (defaults chosen so work is not blocked)

| # | Question | Working answer |
|---|---|---|
| **OQ-1a** | Exact `workers.dev` **frontend** subdomain (INF-024) | Resolve at first `wrangler deploy`; propagate to `FRONTEND_URL` (INF-052), Firebase authorised domains, Firebase email action URL, `og:*` meta (INF-030), `sitemap.xml`/`robots.txt`, the CP-129 screenshot watermark, and the CORS allowlist (INF-054) |
| **OQ-1b** | Exact **API** FQDN `ca-croco-calc-api.<env-hash>.westeurope.azurecontainerapps.io` (INF-047) — *added in revision 2, review gap 13; OQ-1 previously propagated only the frontend host* | Resolve as the Terraform output `api_base_url` at first apply; propagate to **`BACKEND_URL`** (the `vars.BACKEND_URL` repository variable of INF-086a, consumed by INF-012/INF-013/INF-129), `head.html`'s preconnect (INF-030), the service-worker runtime-cache hostname (INF-031), and any `connect-src` in `_headers`. `infra.yml` MUST write it back with `gh variable set` so it cannot drift |
| **OQ-2** | Contact email (CP-156, doc 03 B-1) | `me@emilvinu.de` behind one constant |
| **OQ-3** | Logo tagline replacing `monkey see` (CP-010, B-2) | `snap snap` |
| **OQ-4** | Discord invite URL, ko-fi URL, patreon URL (CP-017, CP-162, B-3, B-4) | Buttons ship **disabled** with tooltip `coming soon` |
| **OQ-5** | Does the default-settings gate apply to the **weekly XP** leaderboard? (AC-123 / A3, SB-177) | **No.** Both documents agree; explicit sign-off requested because the brief's sentence is ambiguous |
| **OQ-6** | **The math seed is generated on the client** (`crypto.getRandomValues`, ME-169). ME-171 therefore guarantees *consistency*, not *unpredictability* — a determined cheater can pre-compute the task list before starting. | Ship as specified for v1; ME-174's regeneration still catches forged task logs and ME-175's duplicate-hash check still catches replays. **Recommendation for review:** issue the seed server-side, or accept the residual risk explicitly |
| **OQ-7** | Phosphor (`ph:*`) as the app-wide icon collection, with `tabler:*` for the settings bar only (C10) | As ruled; single alternative is all-tabler, which changes ~40 icon strings in doc 03 and nothing else |
| **OQ-8** | The `settings` nav item repurposed to open the theme modal (C9) | As ruled; alternative is removing the nav item and pruning `[data-nav-item="settings"]` from the affected theme CSS files, which breaks CP-164 |
| **OQ-9** | With defaults, all eight bar controls render ON in `--main-color`, heavier than monkeytype's bar (SB-073 note) | Ship as-is; the single-line fallback is `--main-color` → `--text-color` in SB-073 |
| **OQ-10** | `frontend/static/supporters.json` / `contributors.json` — ship empty or populate from the GitHub API? (doc 03 B-7, INV-007) | Ship `[]` so the sections render empty rather than erroring |
| **OQ-11** | Launch date string on the about page (CP-133, B-5) | `Launched in 2026.` |
| **OQ-12** | Cloudflare Workers static assets honouring `_headers` is **assumed, not verified** (INF-022 / B5) | Verify with `curl -sI` after first deploy; documented fallback is a minimal Worker script with an `assets` binding. The cache policy itself is non-negotiable |
| **OQ-13** | Azure Container Apps per-second rates in INF-037 are from memory (B6) | Re-verify against the Azure pricing calculator for `westeurope` **before** `terraform apply` (INF-037/038) |
| **OQ-14** | ME-104 permits 6-fractional-digit answers at `multiplication = "100"` (`0.087 × 0.094 = 0.008178`) | Implement as specified (faithful to the brief). Cheapest tuning lever if it proves unpleasant: cap `sA + sB` — a one-line change to ME-098 |
| **OQ-15** | **The brief's decimals sentence.** C39 rules that "randomly one of types 1-3" is normative and "we base ourselves on the division tasks" is its justification, not a restriction | Ship as ruled (uniform over the enabled subset of add/mul/div). Sign-off wanted because the alternative reading is a *product* change, not a wording one: it would make decimals apply only to division and leave settings 1 and 2 untouched whenever decimals is on |
| **OQ-16** | **Default theme** (INV-082 leaves it at "`serika_dark` unless a croco calc default theme is chosen", with no owner — review gap 26b) | Ship **`serika_dark`**, monkeytype's own default, so the first-run screen matches the reference screenshots exactly. Changing it later is a one-line edit to `default-config.ts` and affects nothing else; a bespoke crocodile palette is recorded as a deferred idea (§5.2) |

---

## 5. Deferred TODO

**Not built in v1. Recorded only.** Authority: INF-149, INV-189, INV-190, CP-006, CP-061, CP-065, AC-042,
AC-047, AC-119, AC-167.

1. **Discord integration** — bot, avatar sync, role rewards, rich presence, the account-settings Discord section,
   the leaderboard-cron announcement hook. Consequence for v1: `backend/src/utils/discord.ts`,
   `backend/src/queues/george-queue.ts`, `UnlinkDiscordModal.tsx`, `DiscordAvatar.tsx` and `Premid.tsx` are
   **deleted now** rather than carried as dead code (INF-067, INV-143, INV-190, CP-065). The footer and
   about-page Discord **links** still render, disabled, behind `SOCIAL_LINKS.discord` (CP-017, CP-146).
2. **GitHub README** — a full README with screenshots and badges. v1 ships a one-paragraph placeholder (INF-138).
   The **GPL-3.0 attribution to monkeytype is NOT deferred** (INV-005, INV-010, CP-147).
3. **ko-fi.com** setup. The Support-modal `Donate` button ships **disabled** behind `SUPPORT_LINKS.kofi`
   (CP-162).
4. **patreon.com** setup. The Support-modal `Join Patreon` button ships **disabled** behind
   `SUPPORT_LINKS.patreon` (CP-162).
5. **Ads functionality.** All ad markup is **removed from the DOM**, not hidden: the four `#ad-*-wrapper` blocks
   in `frontend/src/index.html`, the result-page ad block, both about-page `<Advertisement>` usages, and the two
   account-page slots. `Advertisement.tsx`, `ad-controller.ts`, `eg-ad-controller.ts`, `pw-ad-controller.ts`,
   `video-ad-popup.ts`, `monkey-power.ts` and `ads.scss` are deleted (CP-006, AC-042, INV-189). The Support-modal
   `Enable Ads` button ships **disabled** (CP-163).

### 5.1 Explicitly IN SCOPE for v1 — not deferred

**Google sign-in and GitHub sign-in were on the original deferred list and have been moved INTO v1 scope.**
Authority: INF-090, INF-150, AC-169, INV-196, INV-109.

All **three** authentication methods — email/password, Google, GitHub — MUST be implemented, wired end to end,
and exposed in the account-settings Authentication tab (AC-169 … AC-174), including provider link/unlink with
the "cannot remove the last auth method" guard (AC-172). Any later stage that finds them listed as deferred
elsewhere MUST treat this document as authoritative (INF-150).

### 5.2 Additional items deferred by a ruling in §2

| Item | Authority |
|---|---|
| `practise mistakes` results button | C19 |
| Numpad hint diagram under the task stream | CP-061 |
| In-test crocodile mascot (the `Monkey.tsx` shell is the template) | INV-184 / A-06 |
| Momentary (sliding-window) tpm chart line | CP-115, doc 03 §9.8 |
| Staging / preview environment | INF-003 |
| Sentry error reporting | INF-146, INV-118d |
| Prometheus + swagger-stats dashboard | C25 |
| Branch protection rules | INF-122 |
| VNet + NAT gateway for a stable database egress IP (~$32/mo) | INF-059 |
| Bespoke croco calc default theme (v1 ships `serika_dark`) | OQ-16 / INV-082 |
| A "bailed out early" test-ending concept | C38 — deliberately not built, see AC-187 |
| Blind mode | C41 — struck, no defined behaviour survives CP-036 |
| SB-214's side-by-side pixel-baseline PNG diff of the settings bar | Coordinator ruling **R6** (task #57) — deferred, MUST NOT block. SB-214's other clauses are implemented and asserted in `__tests__/components/pages/test/TestConfigGeometry.spec.tsx`; only the image comparison against a captured monkeytype baseline is outstanding, and it needs a rendered browser plus a stored baseline the repo does not carry |

**Note on the custom domain.** The row that used to read "Custom domain, Cloudflare zone, DNS | INF-025" is
**removed**: decision **D1** (§2.32) put `crococalc.com` + `www` into v1 and it is implemented. INF-047's
"no custom domain" still stands for the **API**.

---

## 6. Work breakdown

Twelve independently ownable work packages. **File ownership is exclusive** — no two packages may edit the same
file. Where a natural file would be contended, the split is stated explicitly.

**Revision 2 fixed four concrete ownership collisions and two coverage holes.** The rule above was asserted
but not held: WP-04/WP-09 both claimed `collections/`, WP-04/WP-08 both claimed `components/common/`,
WP-08/WP-12 both claimed `head.html`, and WP-11/WP-12 both claimed `INF-049` and `INF-051`…`INF-055`. Those
are now carved out below. In addition, roughly a third of `frontend/src/ts` had **no** owning package and
~40 requirement IDs appeared in no Covers list — see the new **§6.2 (residual file ownership)** and
**§6.3 (residual requirement coverage)**, which together make DoD-02's 1111-row coverage report producible.

**Two reading rules for every Owns list below:**
1. A **more specific** path always beats a **less specific** one. `frontend/src/ts/collections/custom-themes.ts`
   (WP-04) beats `frontend/src/ts/collections/**` (WP-09). Single-file carve-outs are named explicitly.
2. **Deletion is not editing.** A package that only deletes a file does not own it; deletion-only paths
   belong to WP-01 (§6.2). If a package needs to *modify* a file another package deletes, that is a
   sequencing bug — raise it, do not resolve it locally.

**Wave 1 (blocking, ~1 day):** WP-01.
**Wave 2 (five packages fully parallel):** WP-02, WP-03, WP-04, WP-11, WP-12.
**Wave 3 (parallel once wave 2 lands):** WP-05, WP-08, WP-09, WP-10.
**Wave 4 (critical path):** WP-06 → WP-07.

---

### WP-01 — Repo foundation, deletion sweep, tooling

**Covers:** INV-000 … INV-010 (GPL-3.0, attribution, `NOTICE`, the licence consequences — added in revision 2;
DoD-48 depends on INV-005/INV-010), INV-011 … INV-030, INV-044, INV-045, INV-055, INV-120 … INV-125,
INV-128a, INV-185 (challenges, cut), INV-199 … INV-208 (the planning/meta requirements of doc 05 — effort
scale, L-list, dependency order, directory-coverage and brief-coverage checks; satisfied by §6 and §7 of this
document plus DoD-51);
INF-118 … INF-128, INF-134 … INF-139; C1 (the `ME-` → `INV-` re-prefix of doc 05).

**Owns:** root `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `.oxlintrc.json`, `.oxfmtrc*.json`,
`.prettierrc.json`, `stylelint.config.mjs`, `commitlint.config.cjs` (delete), `.husky/**`, `knip.json`,
`.fallowrc.json`, `.gitignore`, `.npmrc`, `.nvmrc`, `monkeytype.code-workspace` (rename), `AGENTS.md`,
`CLAUDE.md`, `README.md`, `LICENSE`, `NOTICE`, `docs/*.md` (excluding this file),
**`docs/requirements/05-monkeytype-inventory.md`** (explicit carve-in, added in revision 2 — review gap 24:
WP-01's Owns list excluded `docs/requirements/**` while its Covers list opened with C1, the `ME-` → `INV-`
re-prefix of doc 05. WP-01 must own the file it edits; the other five source documents and this file remain
read-only to every package),
`packages/release/**` (delete), `packages/funbox/**` (delete), `packages/challenges/**` (delete),
`packages/oxlint-config/**`, `packages/typescript-config/**`, `packages/tsup-config/**`,
`frontend/storybook/**` (delete), `frontend/static/languages/**`, `frontend/static/layouts/**`,
`frontend/static/quotes/**`, `frontend/static/funbox/**`, `frontend/static/challenges/**`,
`frontend/static/sounds/**` (all delete), `frontend/scripts/**`, `.github/**` (delete monkeytype's; land a
single minimal `ci.yml`), git branch rename + `gh repo create`.

**Depends on:** nothing. **Blocks:** everything.

**Exit criteria:** `pnpm install` succeeds; `git branch -a` shows only `main`;
`gh api repos/lxorb/croco-calc --jq '.fork,.private,.default_branch'` → `false,false,main`; doc 05 uses `INV-`
throughout; the five deleted static asset trees are gone.

---

### WP-02 — `@croco-calc/math-engine`

**Covers:** ME-001 … ME-178 in full (generation, judging, determinism, golden vectors, the 40-row edge-case
table); C2, C3, C21, C26, C28, C32, C33.

**Owns:** `packages/math-engine/**` (new package — zero overlap with anything inherited).

**Depends on:** WP-01; consumes `MathSettingsSchema` from WP-03 (which publishes it on day 1).

**Interfaces it must publish before WP-05/WP-06 start:**
`generateTask(seed, index, settings) -> Task`, the batching helper, `isAnswerCorrect(task, rawInput) -> boolean`,
`MathGenError`, the mulberry32 PRNG (ME-167), and the golden-vector fixture (ME-178).

**Exit criteria:** the ≥100 000-task property tests of ME-023, ME-055 and ME-030 pass; every row of ME's §18
edge-case table has a dedicated test; every golden vector reproduces byte-identically under both the frontend
and backend vitest projects; a lint rule proves `Math.random` appears nowhere in the package (ME-166).

---

### WP-03 — Shared schemas, contracts and constants

**Covers:** INV-031 … INV-043, INV-194; SB-010 … SB-016, SB-130, SB-170 … SB-174; AC-001 … AC-012, AC-064,
AC-100 (CSV column contract), AC-114; ME-012; C2, C3, C4, C7, C31.

**Owns:** `packages/schemas/**`, `packages/contracts/**`, `packages/util/**`.

**Depends on:** WP-01. **Blocks:** WP-05, WP-06, WP-07, WP-09, WP-10, WP-11.

**Must land on day 1 (so wave-2 peers can compile):** the config schema (C2/C3 domains),
`MathSettingsSchema`, `LEADERBOARD_SETTINGS_ID`, the result schema field names, `settingsId`.

**Exit criteria** — all scoped to `packages/**`, which is what WP-03 owns (revision 2, review gap 15: the
previous wording asserted a repo-wide condition no single package can satisfy):
`ConfigSchema` contains exactly the eight bar keys plus the retained appearance keys (§6.1, **including
`liveSpeedStyle` and `liveAccStyle`, and `accountChart` as a 5-element array**);
`grep -rn "wpm\|rawWpm\|charStats\|keyConsistency\|burst\|language\|funbox\|difficulty\|lazyMode\|quoteLength\|tags\|bailedOut\|idleDuration\|settingsSignature\|\bnet\b" packages/`
returns nothing; `settingsId(getDefaultConfig())` equals `LEADERBOARD_SETTINGS_ID` (SB-204); chart series cap
is 481 (C7); the AC-100 CSV header string matches the C37/C38-amended contract byte for byte;
`packages/schemas/src/{languages,layouts,fonts,quotes,challenges,ape-keys,presets}.ts` do not exist.
The repo-wide equivalents are **DoD-07** and **DoD-08**, which are project-level and gate the release, not
this package.

---

### WP-04 — Design system, themes, and the Icon component

**Covers:** INV-061 … INV-072, INV-119, INV-126, INV-191, INV-192; CP-001 … CP-003, CP-164 … CP-166,
CP-175 … CP-177, CP-182; SB-060 … SB-064; AC-019 … AC-021; C10, C30.

**Owns:** `frontend/src/styles/**` **except** `test.scss`, `caret.scss`, `commandline.scss`
(and the new `result.scss`); `frontend/src/ts/constants/themes.ts`; `frontend/src/ts/constants/fonts.ts`;
`frontend/static/themes/**`; `frontend/static/webfonts/**`; `frontend/src/ts/components/core/Theme.tsx`;
`FavIcon.tsx`; `frontend/src/ts/states/theme.ts`; `frontend/src/ts/controllers/theme-controller.ts`;
`frontend/src/ts/collections/custom-themes.ts` **(named carve-out from WP-09's `collections/**`)**;
`frontend/src/ts/utils/colors.ts` **(named carve-out from WP-08's `utils/**`, §6.2)**;
**new** `frontend/src/ts/components/common/Icon.tsx` **(named carve-out from WP-08's
`components/common/**`; WP-04 creates and owns this one file, WP-08 owns the rest of that directory and
consumes `Icon.tsx` as a published interface)**; **new** `frontend/vite-plugins/icons.ts`
**(named carve-out from WP-12's `frontend/vite-plugins/**`)**;
deletion of `fontawesome-5.scss`, `fontawesome-6.scss`, `Fa.tsx`, `types/font-awesome.d.ts`, `ads.scss`.

**Depends on:** WP-01. **Blocks:** WP-05, WP-06, WP-07, WP-08, WP-09.

**Exit criteria:** all 187 theme palettes intact; the 52 theme CSS files present with an audited edit list
(C30); zero `fa-` class strings and zero `@fortawesome` imports anywhere in `frontend/src`; `Icon.tsx` renders
both `tabler:*` and `ph:*` from a build-time bundle with no network request; `tailwind.css` `@theme` mapping
unchanged.

---

### WP-05 — Config machinery, settings bar, command palette

**Covers:** SB-001 … SB-214 in full; INV-073 … INV-082, INV-098, INV-104, INV-105, INV-117 (kept, C8);
CP-023, CP-024, CP-026, CP-028, CP-029; ME-006 … ME-018, ME-082 … ME-089; C8, C9 (palette side), C14, C20,
C21, §6.1.

**Owns:** `frontend/src/ts/config/**`; `frontend/src/ts/constants/default-config.ts`;
`frontend/src/ts/components/pages/test/TestConfig.tsx`; `.../test/modes-notice/**`;
`frontend/src/ts/components/modals/MobileTestConfigModal.tsx`; `.../modals/ShareTestSettings.tsx`;
`frontend/src/ts/commandline/**`; `frontend/src/styles/commandline.scss`;
`frontend/src/ts/components/hotkeys/**`; `frontend/src/ts/input/hotkeys/**`; `frontend/src/ts/states/hotkeys.ts`;
`frontend/src/ts/controllers/url-handler.tsx`.

**Depends on:** WP-03 (config schema), WP-04 (Icon), WP-01.

**Exit criteria:** SB-200 … SB-214 all pass, including the SB-214 screenshot diff at 849/1105/1361/1617 px;
the coupling truth table (SB-202) passes with `"100"` (C21); the last-generator guard (SB-203) passes;
one debounced `PATCH /configs` per change containing only the changed key (SB-206); zero network requests for
anonymous users (SB-207).

---

### WP-06 — Test page and test engine

> **Revision 6 (C46).** Doc 07 now runs to **`TR-335`**; its **§14** (`TR-263 … TR-335`) is WP-06-owned and
> adds `frontend/src/ts/test/math-typeset.ts`, the stacked-fraction styles in `frontend/src/styles/test.scss`
> and `frontend/__tests__/test/math-typeset.spec.ts`. **`packages/math-engine` MUST NOT be edited** for it
> (TR-266, TR-329).
>
> **Revision 5 (C45).** WP-06 additionally covers **all of `docs/requirements/07-test-screen-redesign.md`**
> (`TR-001 … TR-262`), which supersedes the stream-side half of the coverage below. Read doc 07 **first**;
> its §13 is the map of what in CP-030 … CP-089, C11 and C12 still applies. Carve-outs to other work
> packages, all named in doc 07 §10: **WP-03** owns the `smoothCaret` / `caretStyle` schema removal
> (TR-203) and the `PATCH /configs` strictness decision (TR-210); **WP-04** owns the 8 theme files and the
> custom-property rename (TR-186, a C30 edit-class-(b) extension with the same PR-listing obligation);
> **WP-05** owns the config metadata and palette removals (TR-205 … TR-208); **WP-07** owns nothing but a
> confirmation that its payload is unchanged (TR-176).

**Covers:** CP-018 … CP-089 (excluding CP-023 … CP-029, owned by WP-05); ME-129 … ME-159 (UI obligations),
ME-135 as scoped by C29; INV-050, INV-051, INV-056, INV-057, INV-058, INV-059, INV-067, INV-083 … INV-100,
INV-153 … INV-184 (test-side deletions), INV-197; ~~C11~~, ~~C12~~ (both struck by C45), C13, C19 (test
side), C29, C30, C32, C33; **and TR-001 … TR-335**.

**Owns:** `frontend/src/html/pages/test.html`; `frontend/src/ts/components/pages/test/**` **except**
`TestConfig.tsx` and `modes-notice/**`; `frontend/src/ts/test/**` **except** `result.ts`, `pb-crown.ts`,
`today-tracker.ts`, `test-screenshot.ts`; `frontend/src/ts/input/**` **except** `hotkeys/**`;
`frontend/src/ts/elements/caret.ts`; `frontend/src/ts/states/test.ts`; `frontend/src/ts/states/live-stats.ts`;
`frontend/src/ts/legacy-states/**`; `frontend/src/styles/test.scss`; `frontend/src/styles/caret.scss`;
`frontend/src/ts/controllers/route-controller.ts`; `frontend/src/ts/components/mount.tsx`;
`frontend/src/ts/index.ts`.

**Depends on:** WP-02, WP-03, WP-04, WP-05.

**First action:** extract every `#result*` rule from `test.scss` into a new `frontend/src/styles/result.scss`
and hand that file to WP-07. This is the one deliberate file split; it MUST happen before WP-07 starts.

**Exit criteria (revision 5, restated for C45):** `#taskArena` carries `data-state` ∈
`{preStart, running, awaitingContinue, finished}` and `data-feedback` ∈ `{none, correct, wrong}`
(TR-010, TR-011, amending CP-186/CP-187); no `#words`, `#tasks`, `#tasksWrapper`, `#tasksInput`, `#caret`,
`<letter>` or `--*-letter-*` selector or identifier remains anywhere (TR-254); nothing that could be read as
a task is rendered before the run starts, and no input listed in CP-050 can start it; no answer of an
un-submitted task appears in the DOM at any point of a run (C29, TR-160/TR-161); the input filter still
matches CP-055 … CP-059 plus C32 and is still enforced by the engine alone; submit is Enter only and the
wrong-answer pause does not stop the timer (TR-062, TR-131); doc 07 §12's ten acceptance items pass with
real, pasted command output.

---

### WP-07 — Results page, result computation, charts

**Covers:** CP-090 … CP-131; ME-160 … ME-165; AC-005, AC-006 (computation side); INV-052, INV-088, INV-092;
C5, C7, C15 (chart/legend side), C19, C27.

**Owns:** `frontend/src/html/pages/test-result.html`; `frontend/src/ts/test/result.ts`;
`frontend/src/ts/test/pb-crown.ts`; `.../today-tracker.ts`; `.../test-screenshot.ts`;
`frontend/src/ts/controllers/chart-controller.ts`; `frontend/src/styles/result.scss` (handed over by WP-06).

**Depends on:** WP-06 (task-log shape and the `result.scss` split), WP-02, WP-03, WP-04.

**Exit criteria:** CP-188's eight `data-*` attributes present on `#result`; `score`, `correct`, `wrong`, `acc`,
`tpm`, `tasks`, `avg time`, `consistency`, `time` all render per §3.2 of doc 03; the chart has axes
`score` / `tpm` / `wrong` and a four-button legend; `#resultChart` and `#resultTaskHistory` exist and
`#wpmChart` / `#resultWordsHistory` / `#replayWords` do not.

---

### WP-08 — Shared shell, about page, core modals, theme modal

**Covers:** CP-004 … CP-017, CP-132 … CP-177, CP-178 … CP-185, CP-190; INV-050 (shell part), INV-053, INV-054,
INV-101, INV-102, INV-103, INV-112 (minus `AccountMenu`/`AccountXpBar`), INV-113, INV-114, INV-115,
INV-116 (theme-modal extraction), INV-118, INV-118b (the `Ape` ts-rest client, minus `ape/config.ts`),
INV-118c (hooks + utils keep/delete/rename set), INV-118e and INV-118f (controller delete/keep sets, minus the
four single-file carve-outs listed in §6.2), INV-118h (cookie consent), INV-118i (dev tooling), INV-189
(ad-markup removal from the shell and the about page); **INF-030 and INF-117** (both are `head.html`
rewrites — moved here from WP-12 in revision 2 so the file has one owner, review gap 10c);
C9, C10, C34, C42.

**Owns:** `frontend/src/index.html`; `frontend/src/html/head.html`, `popups.html`, `warnings.html`,
`pages/loading.html`; `frontend/src/404.html`, `privacy-policy.html`, `security-policy.html`,
`terms-of-service.html`, `email-handler.html`; `frontend/src/ts/components/layout/**` **except**
`header/AccountMenu.tsx` and `header/AccountXpBar.tsx`; `frontend/src/ts/components/pages/AboutPage.tsx`;
`frontend/src/ts/components/common/**` **except** `Icon.tsx` (WP-04); `frontend/src/ts/components/ui/**`;
`frontend/src/ts/components/modals/**` **except** `MobileTestConfigModal.tsx`, `ShareTestSettings.tsx`,
`account-settings/**`, `EditProfileModal.tsx`, `UserReportModal.tsx`, `PbTablesModal.tsx`,
`LastSignedOutResultModal.tsx`; `frontend/src/ts/components/popups/**`;
`frontend/src/ts/queries/public.ts`; `frontend/src/ts/components/pages/settings/custom-setting/Theme.tsx`
(extract, then delete the settings-page tree);
**plus the shared-frontend-infrastructure catch-all of §6.2** (`states/**`, `utils/**`, `hooks/**`, `ape/**`,
`elements/**`, `constants/**`, `dev/**` and the residual `controllers/`, each minus its named carve-outs).

**Depends on:** WP-04, WP-03, WP-05 (the commandline hosts the theme picker).

**Exit criteria** — scoped to the paths WP-08 owns (revision 2, review gap 15: the previous repo-wide grep
depended on WP-04, WP-05, WP-06, WP-07 and WP-09 finishing first, so no package could ever be declared done):
the DoD-07 grep over **WP-08's own paths only** returns nothing but the CP-147 attribution; the theme modal
renders 187 themes with search, swatches, live preview and favourites; the footer has exactly the seven
CP-012 buttons plus the theme indicator and version button;
`frontend/src/ts/components/pages/settings/` does not exist; `head.html` contains no `monkeytype.com`
hostname (INF-030) and its `<title>`/`description`/`og:*` are croco calc's (INF-117).
The repo-wide grep is **DoD-07**, a project-level gate.

---

### WP-09 — Account, profile, friends, leaderboard, account settings

**Covers:** AC-013 … AC-187 (excluding AC-001 … AC-012, AC-064, AC-100 and AC-114, which are WP-03's schema /
CSV-contract deliverables — WP-09 *renders* against them but does not define them; revision 2, review gap 10d);
INV-106 … INV-111, INV-118a, INV-118g (Firebase Auth wiring), INV-186 (tags, cut), INV-187 (config presets,
cut — frontend side), INV-188 (ape keys, cut — frontend side), INV-190 (badges/premium/Discord UI, cut),
INV-195; C15, C16, C17, C18, C31, C35, C37 (display side), C38 (table/CSV side), C40.

**Owns:** `frontend/src/ts/components/pages/account/**`; `.../pages/profile/**`; `.../pages/leaderboard/**`;
`.../pages/connections/**`; `.../pages/account-settings/**`; `.../pages/login/**`;
`frontend/src/ts/components/modals/account-settings/**`, `EditProfileModal.tsx`, `UserReportModal.tsx`,
`PbTablesModal.tsx`, `LastSignedOutResultModal.tsx`;
`frontend/src/ts/components/layout/header/AccountMenu.tsx` and `AccountXpBar.tsx` (single-file carve-outs);
`frontend/src/ts/states/result-filters.ts`, `states/account-settings.ts`, `states/leaderboard-selection.ts`;
`frontend/src/ts/collections/**` **except** `custom-themes.ts` (WP-04);
`frontend/src/ts/queries/**` **except** `public.ts` (WP-08);
`frontend/src/ts/utils/levels.ts` (named carve-out from WP-08's `utils/**`);
`frontend/src/ts/elements/test-activity*.ts` (named carve-out from WP-08's `elements/**`);
`frontend/src/styles/test-activity.scss`; `frontend/src/ts/auth.tsx`, `firebase.ts`, `db.ts`.
*(`frontend/src/ts/cookies.ts` moved to WP-08 in revision 2 — cookie consent is shell chrome and travels with
`CookiesModal.tsx`, which WP-08 already owns under `components/modals/**`.)*

**Depends on:** WP-03, WP-04. Consumes WP-10's XP breakdown keys (AC-036) as a published interface only.

**Exit criteria:** exactly four account-settings tabs, no ape-key artefact anywhere in the repo (AC-163);
leaderboard has no `language` axis and only `time 4` / `time 8` boards; the results table, CSV header and PB
cards match AC-100 / AC-101 / AC-060 exactly; the config-preset vs filter-preset distinction (C18) is respected.

---

### WP-10 — Backend: results, XP, personal bests, leaderboards, anti-cheat

**Covers:** ME-019, ME-166 … ME-184 (server side, **including the new plausibility thresholds ME-179 … ME-183
and the compatibility-header bump ME-184**); AC-022 … AC-039, AC-065, AC-119 … AC-130, AC-187; SB-175 …
SB-178 (enforcement); INV-133, INV-140, INV-141, INV-146, INV-148; INF-064, INF-066,
**INF-151 … INF-155** (the job advisory lock and idempotency — `backend/src/jobs/**` is WP-10's);
C4, C17, C19 (no practise endpoint), C23, C37 (persisted field), C38, C40, BL-5.

**Owns:** `backend/src/api/controllers/result.ts`; `.../controllers/leaderboard.ts`;
`backend/src/utils/pb.ts`, `utils/result.ts`, `utils/daily-leaderboards.ts`;
`backend/src/services/weekly-xp-leaderboard.ts`; `backend/src/anticheat/**`;
`backend/src/dal/result.ts`, `dal/leaderboards.ts`; `backend/src/jobs/**`.

**Depends on:** WP-02 (the engine, for server-side revalidation), WP-03.

**Anti-cheat is two layers, both required:** (1) ME-174's full regeneration of tasks `0…n−1` from
`(mathSeed, mathSettings)` with prompt/answer/verdict comparison, plus ME-175's `objectHash` and duplicate-hash
checks and ME-177's engine-version gate as amended by ME-184; (2) INV-148's plausibility checks, now with
concrete numbers — **ME-179** `MAX_PLAUSIBLE_TPM = 120`, **ME-180** `MIN_INTER_ANSWER_MS = 150` at a 5 %
tolerance band with a 2-interval minimum, **ME-181** median-interval floor 300 ms above 10 tasks,
**ME-182** `testDuration === time * 60` exactly plus a 2 s log-drift and a bounded submission timestamp,
**ME-183** a mandatory passing test for a legitimate fast run and an absolute prohibition on reading `acc`.
Guessing these numbers instead of using them is the BL-5 failure mode repeated.

**Exit criteria:** BL-5 cleared (`acc` floor removed from both the controller and the schema); daily and weekly
XP leaderboards run on MongoDB `$setWindowFields` with zero Redis references; a forged task log is rejected;
AC-039's worked XP example (1694 XP) passes as a test; **every job in `backend/src/jobs/**` acquires the
INF-151 lock before doing work, and INF-154's two acceptance tests pass — (a) three concurrent runners over
one Mongo produce single-runner state, (b) re-running the same `periodKey` is a no-op**; the five
plausibility constants of ME-179 … ME-182 are exported, tested in both directions (ME-183), and no code path
in `backend/src/anticheat/**` reads `acc`.

---

### WP-11 — Backend: platform, auth, routes, DAL, deletions

**Covers:** INV-129 … INV-132, INV-134 … INV-139, INV-143 … INV-145, INV-147, INV-149 … INV-152, INV-196,
INV-198; AC-120, AC-163, AC-166 … AC-180 (server side); INF-049, INF-051 … INF-055, INF-063, INF-065,
INF-067 … INF-069, INF-098; C23, C24, C25, C35.

**Owns:** `backend/src/app.ts`, `server.ts`; `backend/src/api/routes/**`; `backend/src/api/controllers/**`
**except** `result.ts` and `leaderboard.ts`; `backend/src/dal/**` **except** `result.ts` and `leaderboards.ts`;
`backend/src/middlewares/**`; `backend/src/init/**`; `backend/src/utils/**` **except** `pb.ts`, `result.ts`,
`daily-leaderboards.ts`; `backend/src/constants/**`; `backend/src/queues/**` and `backend/src/workers/**`
(delete); `backend/redis-scripts/**` (delete); `backend/email-templates/**` (delete);
`backend/__tests__/**`; `backend/example.env`; `backend/private/**`; `backend/scripts/**`.

**Depends on:** WP-01, WP-03.

**Exit criteria** — scoped to WP-11's own paths (revision 2, review gap 15; the repo-wide form is DoD-08):
the backend boots with **no** `REDIS_URI` in the environment;
`grep -ri "redis\|bullmq"` over WP-11's owned paths returns nothing; `firebase-admin` initialises from
`FIREBASE_SERVICE_ACCOUNT_JSON` with the `BYPASS_FIREBASE` escape hatch removed (INF-098); CORS is an allowlist
(INF-054); the testcontainers integration harness runs green.

---

### WP-12 — Infrastructure, CI/CD, secrets, branding assets

**Covers:** INF-001 … INF-048, INF-050, INF-056 … INF-062 **and INF-058a**, INF-070 … INF-116,
INF-129 … INF-133, INF-140 … INF-148, **INF-156**, and **INF-086a**; INV-046 … INV-049, INV-060, INV-118d
(Sentry removal from the build), INV-127, INV-128; C21 (Sentry removal in the build), C25.

**Explicitly NOT WP-12's** (revision 2, review gap 10d — these were double-assigned):
`INF-049` and `INF-051` … `INF-055` are **WP-11's** (they are backend runtime/env/CORS requirements, and
WP-11 owns `backend/src/app.ts` and `backend/src/init/**`); `INF-030` and `INF-117` are **WP-08's** (both are
`head.html` rewrites, and WP-08 owns that file); `INF-151` … `INF-155` are **WP-10's** (they are code in
`backend/src/jobs/**`). WP-12 still *consumes* INF-047's `api_base_url` output and must publish it as
`vars.BACKEND_URL` per INF-086a so WP-08 and WP-11 can use it.

**Owns:** `infra/terraform/**` (new); `frontend/wrangler.jsonc` (new); `frontend/static/_headers` (new);
`frontend/vite.config.ts`; `frontend/vite-plugins/**` **except** the new `icons.ts` (WP-04);
`.github/workflows/deploy-frontend.yml`, `deploy-backend.yml`, `infra.yml`, `backup-db.yml`, and later edits to
`ci.yml`; `docker/**`; `scripts/generate-icon.ts` (new); `frontend/static/images/**`;
`frontend/static/robots.txt`, `sitemap.xml`, `version.json`, `contributors.json`, `supporters.json`;
`docs/RUNBOOK.md` (new); `frontend/firebase.json` (delete).

**Depends on:** WP-01. **Blocked on:** BL-1 … BL-3 for anything that touches a live cloud resource (BL-4 was
retired on 2026-08-02 when the database moved to Azure); the
Terraform code, workflows, `wrangler.jsonc`, `_headers` and icon pipeline can all be written and dry-run first.

**Exit criteria:** INF-148's ten-point end-to-end acceptance list, minus item 6 while BL-1 is open;
`terraform apply` reports `No changes.` on a second consecutive run (INF-080); the frontend build fails
if `BACKEND_URL` is unset or contains `monkeytype.com` (INF-013); no `BYPASS_*` env var in the built image
(INF-042); **no row of the INF-037 cost table still reads `UNVERIFIED` (INF-156) — this gates
`terraform apply`, not the PR**; **`vars.BACKEND_URL` is written back by `infra.yml` from the Terraform
output (INF-086a) and the backup workflow's Mongo credential source is chosen and documented in
`docs/RUNBOOK.md`**; **the INF-058 probe has been run against the provisioned Azure DocumentDB cluster and
all four required clauses ($setWindowFields, $out, $lookup-with-sub-pipeline, $bucket) passed — a required
clause failing is a hard stop, not a tier flip (INF-058a amended)**.

---

### 6.1 Retained config key set (WP-03 + WP-05 joint deliverable)

The `ConfigSchema` MUST contain exactly:

* **The eight bar keys** (C2/C3 domains): `addition`, `multiplication`, `division`, `fractionAddition`,
  `fractionMultiplication`, `decimals`, `negatives`, `time`.
* **Theme / appearance** (INV-031): `theme`, `themeLight`, `themeDark`, `autoSwitchTheme`, `randomTheme`,
  `favThemes`, `customTheme`, `customThemeColors`, `customBackground*`, `fontSize`, `fontFamily`,
  `flipTestColors`, `colorfulMode`, `maxLineWidth`.
* **Timer / display** (INV-031): `timerStyle`, `timerColor`, `timerOpacity`, `showKeyTips`,
  `showOutOfFocusWarning`, `showAverage`, `showPb`, `accountChart`, `startGraphsAtZero`,
  `alwaysShowDecimalPlaces`, `resultSaving`, `quickRestart`,
  **`liveSpeedStyle`** and **`liveAccStyle`** (added in revision 2, review gap 3 — CP-078, upheld by C13,
  requires both: `liveSpeedStyle` drives the live **tpm** readout and `liveAccStyle` the live **acc** readout.
  Without them in this list, WP-03's exit criterion "exactly the eight bar keys plus the retained appearance
  keys" fails on contact with WP-06).
* **Restored by a ruling:** ~~`smoothCaret`, `caretStyle` (C11)~~ — **struck again by C45**, which struck C11
  itself; both keys are removed from the schema, the defaults, the metadata, the palette and the migration
  path (`07-…` TR-203 … TR-208). `--caret-color` and `customThemeColors`' 10-tuple are **unaffected**: the
  theme colour is kept and now themes the browser's native caret (TR-020). `singleListCommandLine` (C8) is
  unaffected and stays.
* **Struck by a ruling:** `blindMode` (C41 — retained in revision 1 with no defined behaviour; CP-036 already
  forbids all pre-commit feedback, so nothing is left for it to suppress except the only feedback the user
  ever gets).
* **Retained but retargeted by C45:** `maxLineWidth` keeps its key name for stored-config compatibility and
  now bounds the task arena's width rather than a wrapping stream's (`07-…` TR-025, TR-258).
  `flipTestColors` and `colorfulMode` are kept and bind to the renamed math custom properties (TR-019,
  TR-247).

**Arity note (revision 2, review gap 3):** `accountChart` is a **5-element** array, not monkeytype's 4 —
AC-085 adds the `Per minute` toggle. The schema MUST be `["on"|"off"] × 5`, defaulting to all `"on"`, with a
read-time migration that pads a stored 4-element array with a fifth `"on"`.

Nothing else. Every key MUST have complete metadata including an icon (INV-081), and all eight bar keys MUST
carry `changeRequiresRestart: true` (SB-055) and `group: "test"` (SB-130).

---

### 6.2 Residual file ownership (added in revision 2 — review gap 11)

The twelve Owns lists named only ~6 of the ~27 files in `frontend/src/ts/states/`, none of the 39 in
`frontend/src/ts/utils/`, none of `hooks/`, `ape/`, `dev/`, most of `elements/` and `constants/`, and two
`controllers/` files that C16 and INV-118f explicitly require. Since SB-103 must edit `states/notifications.ts`,
SB-125 must edit `ape/config.ts` and INV-118c must delete four `utils/` files, "unowned" meant "nobody may
touch it". The residue is assigned here.

**Rule: WP-08 is the catch-all owner of shared frontend infrastructure.** Everything below belongs to WP-08
unless it appears in the carve-out column, in which case the named package owns that path and WP-08 does not.

| Path | Owner | Named carve-outs (owner in brackets) |
|---|---|---|
| `frontend/src/ts/states/**` | WP-08 | `theme.ts` (WP-04); `test.ts`, `live-stats.ts` (WP-06); `hotkeys.ts` (WP-05); `result-filters.ts`, `account-settings.ts`, `leaderboard-selection.ts` (WP-09). `states/notifications.ts` stays WP-08's — WP-05 calls `showNoticeNotification` for SB-103 but does not edit it |
| `frontend/src/ts/utils/**` (39 files) | WP-08 | `colors.ts` (WP-04); `levels.ts` (WP-09). WP-08 executes INV-118c's delete set — `typing-speed-units.ts`, `key-converter.ts`, `ip-addresses.ts`, `ddr.ts`, `profiler-mode.ts`, `tag-builder.ts`, `discord-avatar.ts`, `json-data.ts` — and the `word-gen-error.ts` → `task-gen-error.ts` rename |
| `frontend/src/ts/hooks/**` (11 files) | WP-08 | — |
| `frontend/src/ts/ape/**` | WP-08 | `ape/config.ts` (WP-05 — SB-121/SB-125 own the debounced `PATCH /configs` behaviour) |
| `frontend/src/ts/elements/**` | WP-08 | `caret.ts` (WP-06); `test-activity*.ts` (WP-09); `merch-banner.tsx`, `monkey-power.ts`, `result-word-highlight.ts` are deletion-only → WP-01 |
| `frontend/src/ts/constants/**` | WP-08 | `themes.ts`, `fonts.ts` (WP-04); `default-config.ts` (WP-05); `firebase-config*.ts` (WP-09); `layouts.ts`, `sounds.ts` are deletion-only → WP-01 |
| `frontend/src/ts/controllers/page-controller.ts` | WP-08 | — |
| `frontend/src/ts/controllers/user-flag-controller.ts` | WP-08 | — (required alive by C16, which keeps user flags and deletes badges) |
| `frontend/src/ts/controllers/**` (rest) | WP-08 | `theme-controller.ts` (WP-04); `route-controller.ts` (WP-06); `chart-controller.ts` (WP-07); `url-handler.tsx` (WP-05). The INV-118e delete set (`ad-controller`, `eg-ad-controller`, `pw-ad-controller`, `quotes-controller`, `challenge-controller`, `badge-controller`, `sound-controller`, `preset-controller`, `analytics-controller`) is deletion-only → WP-01 |
| `frontend/src/ts/dev/**`, `frontend/src/ts/components/dev/**` | WP-08 | — |
| `frontend/src/ts/cookies.ts` | WP-08 | moved here from WP-09 in revision 2, so it travels with `CookiesModal.tsx` |
| `frontend/src/ts/legacy-states/**` | WP-06 | already named in WP-06's Owns |
| `frontend/src/ts/sentry.ts` | WP-12 | deletion + build-config change (INV-118d, INF-146) |

**WP-01 deletion-only catch-all.** Any inherited file whose entire disposition is DELETE, and which no other
package needs to read or edit first, is WP-01's. This includes the whole INV-118e controller delete set, the
funbox/quotes/languages/layouts/sounds trees, `elements/merch-banner.tsx`, `elements/monkey-power.ts`,
`popups/video-ad-popup.ts` and the settings-page tree *after* WP-08 has extracted `Theme.tsx` (C9). A package
that finds it must delete a file WP-01 already deleted has hit a sequencing bug and MUST raise it rather than
re-adding the file.

**Coordinator rulings amending this section (stage 2, recorded here so they survive the task list).**

- **R1** (task #56) — `frontend/src/ts/components/pages/404Page.tsx`, `frontend/src/ts/ui.ts` and
  `frontend/src/ts/pages/page.ts` had no owner in the table above. They are the shared shell/chrome, so they
  belong to **WP-08**, which already owns `pages/**` and the layout tree.
- **R2** (task #61) — the `backend/__tests__/**` tree is WP-11's, with one carve-out: **WP-10 MAY edit the six
  specs whose subject modules it owns** — `api/controllers/result.ts`, `api/controllers/leaderboard.ts`,
  `dal/leaderboards.ts`, `dal/result.ts`, `utils/result.ts`, `utils/pb.ts`. WP-11 handed those over
  explicitly and keeps the rest.
- **R6** (task #57) — SB-214's pixel-baseline PNG diff is deferred and MUST NOT block; §5.2 carries the row.

---

### 6.3 Residual requirement coverage (added in revision 2 — review gap 12)

DoD-02 and DoD-03 demand a coverage report over every indexed ID, but ~40 IDs appeared in no Covers list, so
the report was not producible. They are assigned here. Together with §6.2 this closes the map.

| ID(s) | Owner | Note |
|---|---|---|
| INV-000 … INV-010 | **WP-01** | GPL-3.0 retention, no relicensing, `NOTICE`/attribution, hosted-modification source obligation. DoD-48 depends on INV-005 and INV-010 |
| INV-103 | **WP-08** | `components/ui/table/` + `SlimSelect.tsx` — WP-08 owns `components/ui/**`; WP-09 consumes them |
| INV-118b | **WP-08** | the `Ape` ts-rest client (minus `ape/config.ts` → WP-05) |
| INV-118c | **WP-08** | hooks + the 39 utils: keep set, delete set, `word-gen-error.ts` rename |
| INV-118d | **WP-12** | Sentry deletion — the change is in `vite.config.ts` and `package.json`, which WP-12 owns |
| INV-118e, INV-118f | **WP-08** | controller delete/keep sets, minus the four carve-outs in §6.2 |
| INV-118g | **WP-09** | Firebase Auth wiring (`auth.tsx`, `firebase.ts`, `db.ts`, `firebase-config*`), all three providers |
| INV-118h | **WP-08** | cookie consent gate + `CookiesModal.tsx` (`cookies.ts` moved to WP-08, §6.2) |
| INV-118i | **WP-08** | `dev/`, `components/dev/`, `utils/debug.ts` — kept, excluded from prod builds |
| INV-185 | **WP-01** | challenges: cut (package, static tree, controller, palette list) |
| INV-186 | **WP-09** | tags: cut (C15) |
| INV-187 | **WP-09** frontend / **WP-11** backend | config presets: cut. The C18 name-collision trap is WP-09's to police |
| INV-188 | **WP-09** frontend / **WP-11** backend | ape keys: cut (AC-163) |
| INV-189 | **WP-08** frontend / **WP-11** backend | ads: cut now, deferred as a feature (§5 item 5) |
| INV-190 | **WP-09** frontend / **WP-11** backend | Discord / premium / badges / merch / PreMiD: cut. C16 keeps **flags**, cuts **badges** |
| INV-193 | **WP-05** | the config persistence machinery is kept as a mechanism — `overrideConfig` is the coupling, `optionsMetadata.icon` is the per-control icon |
| INV-199, INV-200 | **WP-01** | effort scale and the L-rated module list: planning metadata, satisfied by §6's wave plan |
| INV-202, INV-204 | **WP-01** | ordering constraints: satisfied by §6's wave plan and the per-WP `Depends on` fields |
| INV-206 | **WP-01** | every directory appears in an inventory row → **DoD-51** |
| INV-207 | **WP-01** | every typing concept in the brief has a cut row → **DoD-52** |
| INV-208 | **WP-01** | "this document authorises no application code" — a scoping statement, satisfied by construction |
| CP-025, CP-027 | **WP-05** | both are settings-bar requirements (pill grouping, mobile button icon), both amended by C20. Excluded from WP-06 in revision 1 but never added anywhere — now WP-05's |
| CP-189 | **WP-06** | `data-seconds-remaining` on the timer element |
| CP-058a, CP-191 … CP-196 | **WP-06** | commit-time normalisation and the mobile symbol row — both live in the test-page input path |
| AC-064, AC-100, AC-114 | **WP-03** only | schema / CSV-contract definitions. WP-09 renders against them; the double-assignment in revision 1 is removed |
| AC-187 | **WP-09** frontend / **WP-10** backend | no bail-out concept (C38) |
| ME-179 … ME-184 | **WP-10**, implemented in **WP-02** | the constants live in `packages/math-engine` (WP-02 owns the file); WP-10 owns their enforcement and their tests |
| SB-215 | **WP-05** | the post-cascade guard predicate (C36) |
| INF-058a, INF-086a, INF-156 | **WP-12** | DB fallback follow-through, secret sources, cost-table gate |
| INF-151 … INF-155 | **WP-10** | job advisory lock + idempotency (`backend/src/jobs/**`) |

**Coverage assertion.** After §6.2 and §6.3, every one of the 1111 indexed IDs appears in exactly one
package's Covers list (or in a named split with an explicit frontend/backend division), and every path under
`packages/`, `frontend/src/`, `backend/src/`, `docker/`, `infra/` and `.github/` has exactly one owner. This
is what DoD-02 and the new **DoD-50** verify.

---

## 7. Definition of done

A validation stage MUST be able to verify every line below mechanically or by direct inspection.

### 7.1 Requirement coverage

- [ ] **DoD-01** Doc 05 uses the `INV-` prefix throughout; `grep -c '^\s*|\?\s*\*\*\?ME-' docs/requirements/05-*.md` → 0.
- [x] **DoD-02** Every ID in the §1 index that is not listed in §2.31 has an implementing commit, a test, or an
      explicit inspection note. §6.2 and §6.3 make this producible; before revision 2 ~40 IDs and roughly a
      third of `frontend/src/ts` had no owning package. **Produced:** `docs/coverage/requirement-coverage.md`,
      regenerate with `node scripts/requirement-coverage.mjs`. The row count is **1113**, not the 1111 this
      item was written against: revision 3 added the lettered `INF-053a` and `INF-062a` after the §1 headline
      was fixed, so INF moved 158 → 160. Every other per-document count matches §1 exactly.
- [ ] **DoD-03** Every ID listed in §2.31 is implemented **as ruled here**, not as written in its source.

### 7.2 Deletion sweep (path-existence assertions)

- [ ] **DoD-04** These do **not** exist under `C:\Users\me\Projects\calc-trainer`:
      `packages/funbox/`, `packages/challenges/`, `packages/release/`, `frontend/storybook/`,
      `frontend/static/languages/`, `frontend/static/layouts/`, `frontend/static/quotes/`,
      `frontend/static/funbox/`, `frontend/static/challenges/`, `frontend/static/sounds/`,
      `frontend/firebase.json`, `frontend/src/ts/components/pages/settings/`,
      `frontend/src/ts/test/funbox/`, `frontend/src/ts/test/words-generator.ts`,
      `frontend/src/ts/test/pace-caret.ts`, `frontend/src/ts/sentry.ts`,
      `frontend/src/styles/ads.scss`, `frontend/src/styles/fontawesome-5.scss`,
      `frontend/src/ts/components/common/Fa.tsx`,
      `backend/redis-scripts/`, `backend/src/init/redis.ts`, `backend/src/queues/`, `backend/src/workers/`,
      `backend/src/utils/discord.ts`, `backend/src/utils/prometheus.ts`,
      `backend/email-templates/`, `packages/schemas/src/ape-keys.ts`, `packages/schemas/src/languages.ts`,
      `packages/schemas/src/layouts.ts`, `packages/schemas/src/quotes.ts`, `packages/schemas/src/presets.ts`.
- [ ] **DoD-04a** The monkeytype anti-cheat **stub** is gone, asserted by behaviour rather than by path
      (revision 2, review gap 25 — DoD-04 previously forbade `backend/src/anticheat/index.ts`, which is the
      natural entry point WP-10 must write): as scoped by **C44**, no `BYPASS_*` variable is set or read —
      `grep -rn "BYPASS_ANTICHEAT" backend/ docker/ infra/ | grep -v "^\s*[#/]"` returns nothing (a comment
      recording that upstream hardcoded one is evidence of the removal, not of its survival) — and
      `backend/src/anticheat/` exports a real implementation of ME-179 … ME-183 whose `validateResult` can
      return `false` (proven by DoD-49).
- [ ] **DoD-05** These **do** exist: `packages/math-engine/`, `frontend/src/ts/components/common/Icon.tsx`,
      `frontend/src/ts/commandline/`, ~~`frontend/src/ts/elements/caret.ts`~~, ~~`frontend/src/styles/caret.scss`~~,
      `frontend/src/styles/result.scss`, `frontend/wrangler.jsonc`, `frontend/static/_headers`,
      `infra/terraform/prod/`, `scripts/generate-icon.ts`, `docs/RUNBOOK.md`, `LICENSE` (GPL-3.0, unmodified).
      **Amended by C45 (`07-…` TR-255):** the two struck caret paths move to DoD-04 — they MUST NOT exist.
- [x] **DoD-05a (added by C45)** These do **not** exist: `frontend/src/ts/elements/caret.ts`,
      `frontend/src/styles/caret.scss`, `frontend/src/ts/test/caret.ts`,
      `frontend/__tests__/test/task-stream-geometry.jsdom-spec.ts`. And these greps return nothing
      (`07-…` TR-254): `grep -rn "tasksInput\|#tasksWrapper\|paceCaret\|<letter\|letter>" frontend/src`;
      `grep -rn "letter-color\|letter-animation" frontend/src frontend/static`;
      `grep -rn "smoothCaret\|caretStyle" frontend/src packages/*/src`.
      **All four paths and all three greps verified after the WP-06 build.**

      **TR-254's fourth grep is amended, because as written it is unsatisfiable and asserts the wrong
      thing.** It read: *`grep -rn "caret" frontend/src` returns only `caret-color` occurrences.* Three
      families of legitimate, unrelated `caret` hits make that impossible, and none of them is typing
      machinery:
      1. **`ph:caret-*`** — Phosphor's name for its *chevron* glyphs (`caret-up`, `caret-down`,
         `caret-left`, `caret-right`, `caret-double-up`). These are the sort arrows in `DataTable`, the
         leaderboard pagination, the scroll-to-top button and the command-palette bullet. They are an
         upstream icon-set naming choice, not a cursor.
      2. **the `caret` theme colour key** — `constants/themes.ts` (one per theme), `states/theme.ts`,
         `controllers/theme-controller.ts`, `components/core/Theme.tsx` and `ThemeModal`'s
         `<Picker color="caret" />`. TR-020 **requires** all of these to be kept: the property is what
         themes the browser's own text caret in `#answerInput`.
      3. **`caret-color` in unrelated stylesheets** — `inputs.scss`, `tailwind.css`, `core.scss` style the
         caret of ordinary form fields across the app.

      The assertion that actually carries TR-254's intent, and which **is** verified:
      `grep -rn "caret" frontend/src | grep -viE "ph:caret|caret-color|caretColor|--picker-caret|color-caret|caret-main|caret-\(|caret: \"#|caret: colors|caret: hexColorSchema|theme\.caret|getTheme\(\)\.caret|color=\"caret\"|color === \"caret\"|sort caret|smooth caret|pace caret"`
      returns only comment lines describing the removal — no executable statement in `frontend/src`
      references a custom caret any more.
- [ ] **DoD-06** All 52 files under `frontend/static/themes/` exist, and the WP-04 PR lists every edited file
      and every removed selector (C30).

### 7.3 Grep assertions

- [ ] **DoD-07** The CP-178 vocabulary grep over `frontend/src` returns only the CP-147 monkeytype
      attribution. The pattern is normative and MUST match CP-178 as amended by C42 — in particular `word`
      and `character` are matched as **whole words** and `password*` is exempt, which the revision-1 pattern
      silently dropped altogether:
      `grep -riE "monkey|monkeytype|typing|wpm|words per minute|keyboard layout|quote|(^|[^a-z])(words?|characters?)([^a-z]|$)" frontend/src | grep -viE "passwords?|passwordless"`
      Per **C44**, the subject is **user-visible strings**: comment lines and legacy *migration* comparisons
      against stored monkeytype values (`configObj.showAverage === "wpm"`) are out of scope, so the assertion
      is on the residue after `grep -v` of comment-only lines.
- [ ] **DoD-08** `grep -ri "redis\|bullmq" backend/ docker/ infra/` returns nothing outside changelog/history.
- [ ] **DoD-09** `grep -ri "monkeytype\.com" frontend/src backend/src infra/` returns nothing.
- [ ] **DoD-10** `grep -rn "Math.random" packages/math-engine/src` returns nothing (ME-166).
- [ ] **DoD-11** `grep -rn "api.iconify.design" frontend/src frontend/dist` returns nothing (SB-063, AC-021).
- [ ] **DoD-12** `grep -rn "fa-\|@fortawesome" frontend/src` returns nothing.
- [ ] **DoD-13** `grep -rn "#words\|wordsInput\|wpmChart\|resultWordsHistory" frontend/src` returns nothing.
- [ ] **DoD-13a** No **live identifier** named `bailedOut`, `bailOut`, `idleDuration`, `settingsSignature` or
      `blindMode` survives in `frontend/src backend/src packages/` (C37, C38, C41, C4), and
      `grep -rnw "net" packages/ backend/src` finds no metric field of that name (C40). Per **C44** the grep
      excludes comment
      lines: C38 itself requires the doc comments that record what was struck.
- [ ] **DoD-14** `git log --format=%B f0c57c5c..HEAD | grep -i "claude\|co-authored-by"` returns nothing
      (INF-135). Per **C44** the range is deliberate: unscoped, the grep matches monkeytype's inherited
      commits, which INF-136 preserves and `NOTICE` clause 3 forbids rewriting, so it could never pass.
- [ ] **DoD-15** Every commit added by stage 2 is single-line, all lowercase, ≤ 5 words (INF-134).
- [ ] **DoD-15a (added by C46)** The two mathematical-typography greps (`07-…` TR-330):
      1. `grep -rn "textContent *= *[^;]*\"/\"" frontend/src/ts/test/` returns nothing — no code path writes a
         literal `/` into the arena's text, which is what would silently defeat TR-263's stacked fractions.
      2. `git diff --stat packages/math-engine` is **empty** for the typography commit (TR-266, TR-329):
         §14 is a pure rendering change, no executable line of the engine may move, and therefore **no
         `MATH_ENGINE_VERSION` bump is permitted** (TR-267) — a bump would reject every cached client
         mid-run for a purely visual change.

      Recorded here because revision 6's C46 row in §2.31 promised these two greps were "added to the
      DoD / §7.3 greps" and no DoD item actually carried them.

### 7.4 Automated tests

- [ ] **DoD-16** `pnpm ts-check` and `pnpm lint` pass with zero errors across all workspaces.
- [ ] **DoD-17** `pnpm knip` reports zero unresolved references (INV-205).
- [ ] **DoD-18** `pnpm test` passes: math-engine property tests over ≥ 100 000 tasks (ME-023, ME-030, ME-055);
      all 40 edge cases of ME §18; all 10 golden vectors under both the frontend and backend vitest projects
      (ME-178).
- [ ] **DoD-19** SB-200 … **SB-214** all pass — extended in revision 2 (review gap 26a; WP-05's exit criteria
      already required SB-214, but DoD-19 stopped at SB-213 and SB-214 had no baseline or tolerance).
      **SB-214's missing terms, now normative:** the baseline is a screenshot of monkeytype's own settings bar
      captured from the reference checkout at
      `…/scratchpad/monkeytype-ref` running locally with the default theme (`serika_dark`), committed under
      `frontend/__screenshots__/baseline/` and regenerated only by an explicit, reviewed commit. Comparison is
      per-breakpoint (849 / 1105 / 1361 / 1617 px) over the settings-bar bounding box only — not the whole
      page — with a tolerance of **≤ 0.5 % of pixels differing by more than 2/255 per channel**. The diff
      measures **geometry**, not content: card radii, gaps, paddings and font sizes (SB-081–083). Label text
      and icons necessarily differ and MUST be masked out of the comparison region before diffing.
- [ ] **DoD-19a** SB-203's third case passes: with `multiplication="100"` + `fractionMultiplication=true` and
      everything else off, `multiplication` cannot be cycled to `"off"`, `fractionMultiplication` can be
      switched off, and no sequence of bar clicks from any reachable state reaches zero enabled generators
      (C36 / SB-215 / ME-089). A property test over all reachable configurations is the intended form.
- [ ] **DoD-20** AC-039's worked XP example yields exactly 1694 XP.
- [ ] **DoD-21** `settingsId(getDefaultConfig()) === "1000:100:threeByTwo:99:1:1:1"` (SB-171, C4).
- [ ] **DoD-22** The eligibility predicate is true for default+4 and default+8, false for default+1, default+2,
      and for any single-setting deviation (SB-205, AC-121).
- [ ] **DoD-23** A result whose task log does not match `(mathSeed, mathSettings)` is rejected by the server
      (ME-174, ME-040/E40).
- [ ] **DoD-24** The backend accepts a result with `acc = 12.5` (BL-5 cleared) — asserted end to end through
      `POST /results`, not only at schema level.
- [ ] **DoD-25** Backend integration tests (testcontainers Mongo, no Redis) pass.
- [ ] **DoD-49** The plausibility layer rejects and accepts as specified (ME-179 … ME-183): a log at 121 tpm,
      a log with >5 % of inter-answer intervals under 150 ms, a log of ≥ 10 tasks with a median interval
      under 300 ms, a `testDuration` that is not `time * 60`, and a `timestamp` 2 minutes in the future are
      each rejected; a legitimate fast run (`tpm = 60`, all intervals ≥ 400 ms, `testDuration = 480`,
      `timestamp = serverNow − 1000`) is **accepted**. No code path in `backend/src/anticheat/**` reads `acc`.
- [ ] **DoD-50** Job single-execution (INF-151 … INF-154): three concurrent runners against one testcontainers
      Mongo produce exactly one unit of work and single-runner state; re-running the same `periodKey` leaves
      the collections byte-identical; a lock stuck in `running` with a `heartbeatAt` older than 10 minutes is
      reclaimed.
- [x] **DoD-51** Every directory under `packages/`, `frontend/src/ts/`, `frontend/src/styles/`,
      `frontend/static/` and `backend/src/` in the reference checkout appears in at least one doc-05 row
      **and** has exactly one owning work package under §6 / §6.2 (INV-206, review gap 11).
      **Produced:** `docs/coverage/directory-ownership.md` — 102 tracked directories, 0 unowned; regenerate
      with `node scripts/requirement-coverage.mjs`.
- [ ] **DoD-52** Every typing-specific concept named in the brief — languages, word lists, quotes, zen mode,
      funbox, layouts/keymaps, on-screen keyboard, caret smoothing, per-character wpm/raw/consistency,
      stenography anti-cheat, lazy mode, punctuation — has an explicit cut row in doc 05 §11 (INV-207).
- [ ] **DoD-53** Mobile answer entry works (CP-191 … CP-196): at 390 × 844 with the **default** settings, a
      real device or emulated touch session can enter `-3/4` and commit it. The symbol row renders only
      below 849 px, only the glyphs the current config needs, does not steal focus from `#tasksInput`, and
      does not introduce a horizontal scrollbar at 320 px.

### 7.5 DOM and behaviour assertions

- [ ] **DoD-26** `#tasks` carries `data-state` ∈ `preStart|running|finished`; each `.task` carries
      `data-taskindex` and, after commit, `data-result` (CP-186, CP-187).
- [ ] **DoD-27** `#result` exposes `data-score`, `data-correct`, `data-wrong`, `data-acc`, `data-tpm`,
      `data-answered`, `data-consistency`, `data-afk` (CP-188).
- [ ] **DoD-28** At any point before a task is committed, its exact answer appears nowhere in the DOM — not as
      text, not as a `data-` attribute, not as an `aria-label` (C29).
- [ ] **DoD-29** None of `Tab`, `Escape`, `Enter`, `Space`, arrow keys, function keys, bare modifiers, mouse
      movement, clicks, window focus, or opening/closing a modal reveals the pre-start blur or starts the timer
      (CP-050, CP-085).
- [ ] **DoD-30** Typing a digit sequence produces **no** per-character colouring and **no** auto-advance
      (CP-036, ME-152, ME-153).
- [ ] **DoD-31** With defaults, all eight bar controls have `data-value` matching SB-110 and none carries the
      strikethrough class; an OFF control has `line-through` on the label span only, never on the `<svg>`
      (SB-209, SB-210).
- [ ] **DoD-32** During a focused test all eight bar buttons carry the real `disabled` attribute and the
      container has `opacity-0` (SB-211).
- [ ] **DoD-33** The results action row has exactly **four** buttons (C19); the chart legend has exactly
      **four** buttons (C15).
- [ ] **DoD-34** Test page, results page and about page render with no horizontal scrollbar at 320, 768, 1024
      and 1920 px (CP-180).
- [ ] **DoD-35** All 52 themes render the test, results and about pages with no invisible text (CP-181).
- [ ] **DoD-36** Every interactive element is keyboard-reachable and has an accessible name; the active task's
      prompt is exposed via `aria-live="polite"` (CP-183, SB-212).

### 7.6 Infrastructure acceptance (INF-148)

- [ ] **DoD-37** `terraform apply` in `infra/terraform/prod` reports `No changes.` on a second consecutive run.
- [ ] **DoD-38** `curl -s <api_base_url>/` → HTTP 200, `"message":"ok"`, non-zero `uptime`.
- [ ] **DoD-39** `https://crococalc.com/` loads the SPA; `/leaderboards` → 200; `https://www.crococalc.com/`
      does the same (D1 — the workers.dev origin stays reachable but is only a pre-DNS smoke-test path).
- [ ] **DoD-40** Response headers on `/` and on a hashed asset match INF-020 / INF-021.
- [ ] **DoD-41** The SPA calls the backend with no CORS error (INF-012, INF-054).
- [ ] **DoD-42** All three sign-in providers work end to end (INF-104) — **blocked on BL-1/BL-2/BL-3**.
- [x] **DoD-43** `az consumption budget list --resource-group rg-croco-calc-prod` shows
      `budget-croco-calc-monthly` at **CHF 40** with a `resourceGroups/rg-croco-calc-prod` id (INF-143). The
      subscription bills in CHF; USD 50 ≡ CHF 40.4. **croco calc's** budget at *subscription* scope would be
      wrong — it would measure ~11 unrelated projects, not croco calc. **Verified 2026-08-03.**
- [x] **DoD-43a ✚** `az consumption budget list` shows a **second, separate** budget
      `budget-azure-subscription-total` at **CHF 500** with a bare `/subscriptions/<id>/…` id and **exactly
      two notifications, both `Actual` (80 % and 100 %) — no `Forecasted` one** (INF-143a). It must not be
      named as if it were croco calc's, and it must not be declared in `infra/terraform/prod`, so that a
      `terraform destroy` of croco calc cannot remove it. **Verified 2026-08-03.**
- [x] **DoD-43b ✚** `az containerapp show -n ca-croco-calc-api -g rg-croco-calc-prod` reports
      `cpu = 0.25` / `memory = 0.5Gi`, and the revision carrying that sizing is **active, at 100 % traffic,
      `runningState = Running`, `healthState = Healthy`, `restartCount = 0`** (INF-035, INF-144). A Node
      backend can OOM at 0.5 GiB, so a healthy *and non-restarting* revision is the check, not a successful
      `terraform apply`. **Verified 2026-08-03 on revision `ca-croco-calc-api--0000003`.**
- [ ] **DoD-44** `gh api repos/lxorb/croco-calc --jq '.fork,.private,.default_branch'` → `false,false,main`;
      `git branch -r` shows exactly one remote branch.
- [ ] **DoD-45** Actual spend checked seven days after go-live and recorded next to the INF-037 estimate.
- [ ] **DoD-45a** No row of INF-037 carries the italic `UNVERIFIED` cell marker at the moment
      `terraform apply` is first run (INF-156 — satisfied 2026-08-02), and the INF-058 probe has been run
      against the deployed Azure DocumentDB cluster with all four required clauses passing (INF-058a).
- [ ] **DoD-45b** `vars.BACKEND_URL` exists on the repo, equals the Terraform `api_base_url` output, and is
      the value the deployed bundle was built with; the backup workflow's Mongo credential mechanism is the
      one written down in `docs/RUNBOOK.md` (INF-086a).

### 7.7 Deferred-work assertions

- [ ] **DoD-46** No Discord integration code, no ad-serving code, no ko-fi/patreon links exist; the
      corresponding UI buttons render **disabled** with tooltip `coming soon` (CP-017, CP-162, CP-163).
- [ ] **DoD-47** Google and GitHub sign-in **are** implemented and exposed in the Authentication tab
      (AC-169 … AC-172) — they are **not** deferred.
- [ ] **DoD-48** A one-paragraph placeholder `README.md` exists containing the GPL-3.0 monkeytype attribution
      required by INV-005 and INV-010.
