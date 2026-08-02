# 02 — Top settings bar

**Component:** the settings bar rendered above the test on the main/test page of **croco calc**.
**Requirement ID prefix:** `SB-` (SB-001 … SB-215). SB-215 was added in revision 2 of the master document (the post-cascade all-off guard predicate, master C36).
**Reference implementation:** monkeytype checkout at
`C:\Users\me\AppData\Local\Temp\claude\C--Users-me-Projects-calc-trainer\2ed5ffdc-09db-4833-a58e-c5b7bd58be53\scratchpad\monkeytype-ref`
(referred to below as `<ref>`; all cited paths are relative to it and were read directly).

Every requirement is written to be independently verifiable. "MUST" is binding; "MUST NOT" is a
prohibition. Anything labelled **ASSUMPTION** resolves an ambiguity in the brief and needs a human
yes/no before implementation freezes — it does not block building.

---

## 1. Reference map — what we are copying, and from where

| Concern | monkeytype file (in `<ref>`) | Notes |
|---|---|---|
| The settings bar itself | `frontend/src/ts/components/pages/test/TestConfig.tsx` | 3 pill cards in a `grid-cols-[1fr_auto_1fr]`, responsive CSS vars, mobile fallback button |
| Button colours / active / disabled | `frontend/src/ts/components/common/Button.tsx` (`getClasses`, lines 57–89) | `variant="text"`, `active`, `disabled` |
| Icon element | `frontend/src/ts/components/common/Fa.tsx` | to be **replaced** by an iconify component (§5) |
| Tooltip + aria-label | `frontend/src/ts/components/common/Balloon.tsx` (`buildBalloonHtmlProperties`) | sets `aria-label`, `data-balloon-pos` |
| Mobile settings modal | `frontend/src/ts/components/modals/MobileTestConfigModal.tsx` | shown below the `md` breakpoint |
| Config store (SolidJS) | `frontend/src/ts/config/store.ts` | `Config` object + `createStore` mirror |
| Config setter, overrides, blocking | `frontend/src/ts/config/setters.ts` (lines 19–140) | `overrideValue`, `overrideConfig`, `isBlocked` |
| Config metadata (icon, group, restart) | `frontend/src/ts/config/metadata.tsx` (lines 30–118 type, 139–198 examples) | `overrideConfig` precedent: `words`/`time` force `mode` |
| localStorage persistence | `frontend/src/ts/config/persistence.ts` + `frontend/src/ts/utils/local-storage-with-schema.ts` | key `"config"`, zod-validated, migrating |
| Debounced account sync | `frontend/src/ts/config/persistence.ts` lines 52–60 + `frontend/src/ts/ape/config.ts` | 1000 ms debounce, PATCH of changed keys only |
| Boot / login load order | `frontend/src/ts/config/lifecycle.ts` (44–54, 71–112), `frontend/src/ts/index.ts:65`, `frontend/src/ts/config/remote.ts:11–24`, `frontend/src/ts/auth.tsx:180` | LS first, server config wins on login |
| API contract | `packages/contracts/src/configs.ts` (GET / PATCH / DELETE `/configs`) | `PartialConfigSchema.strict()` body |
| Config schema + groups | `packages/schemas/src/configs.ts` (`ConfigGroupNameSchema`, lines 520–532) | our 8 keys go in group `"test"` |
| Defaults | `frontend/src/ts/constants/default-config.ts` | single source of default config |
| Command palette | `frontend/src/ts/commandline/lists.ts` (49–57), `commandline/commandline-metadata.ts` (96–190), `commandline/util.ts` (17–24), `commandline/commandline.ts` (`show`, line 94) | commands are generated from config metadata |
| Commandline hotkey | `frontend/src/ts/input/hotkeys/commandline.ts:11–12`, `frontend/src/ts/states/hotkeys.ts:29–53` | `Escape` (or `Tab` if `quickRestart === "esc"`), plus `Mod+Shift+P` |
| "modes notice" strip under the bar | `frontend/src/ts/components/pages/test/modes-notice/TestModesNotice.tsx`, `.../Notice.tsx` | clickable notices that open the commandline |
| Reduced motion helper | `frontend/src/ts/utils/misc.ts:494–505` (`prefersReducedMotion`, `applyReducedMotion`) | reuse as-is |
| Leaderboard eligibility (all-time) | `backend/src/utils/pb.ts:206–210` (`shouldUpdateLeaderboardPersonalBests`) | `mode === "time" && (mode2 === "15" \|\| mode2 === "60") && !lazyMode` |
| Leaderboard eligibility (daily) | `backend/src/api/controllers/result.ts:490–515` | keyed by `(language, mode, mode2)`; extra user/result gates |
| Theme colour variables | `frontend/src/styles/tailwind.css` (`@theme`), `frontend/src/styles/core.scss:2` (`--roundness: 0.5rem`) | `--main-color`, `--sub-color`, `--sub-alt-color`, `--text-color` |

**SB-001** The settings bar MUST be implemented as a SolidJS component that replaces
`frontend/src/ts/components/pages/test/TestConfig.tsx`, keeping that file path and the
`data-ui-element="testConfig"` attribute on the outer container (TestConfig.tsx:41).

**SB-002** The bar MUST NOT introduce a second state container. All eight settings MUST live in the
existing config store (`frontend/src/ts/config/store.ts`) and be read via `getConfig.<key>` and
written via `setConfig(<key>, value)` from `frontend/src/ts/config/setters.ts`.

**SB-003** All monkeytype typing-specific settings-bar controls MUST be removed from the bar:
`punctuation`, `numbers`, `mode` (time/words/quote/zen/custom), `words`, `quoteLength`, the custom-text
"change" button, and the quote search/favourite buttons (all defined in TestConfig.tsx:85–371).
The share-settings button (TestConfig.tsx:232–238) MUST be kept (see SB-166).

---

## 2. Config keys and value domains

**SB-010** Exactly eight config keys MUST back the bar. They MUST be added to the `Config` zod schema
in `packages/schemas/src/configs.ts` with `group: "test"` in `frontend/src/ts/config/metadata.tsx`:

| # | Config key | Type | Allowed values (in cycle order) |
|---|---|---|---|
| 1 | `addition` | enum | `"off"`, `"100"`, `"1000"` |
| 2 | `multiplication` | enum | `"off"`, `"12"`, `"20"`, `"100"` |
| 3 | `division` | enum | `"off"`, `"tables"`, `"threeByTwo"` |
| 4 | `fractionAddition` | enum | `"off"`, `"12"`, `"99"` |
| 5 | `fractionMultiplication` | boolean | `false`, `true` |
| 6 | `decimals` | boolean | `false`, `true` |
| 7 | `negatives` | boolean | `false`, `true` |
| 8 | `time` | number literal union | `1`, `2`, `4`, `8` |

**SB-011** The zod enum member order MUST equal the cycle order in the table above, because both the
bar cycle (§4) and the generated command-palette option list (§11) derive their order from the schema
via `getOptions` (`frontend/src/ts/commandline/util.ts`, `frontend/src/ts/utils/zod.ts`).

**SB-012** `time` MUST be stored in **minutes**, not seconds. `time: 8` means an eight-minute test.
> **ASSUMPTION.** The brief says "Time (in minutes): 1, 2, 4, 8". monkeytype's `time` config is in
> seconds (`default-config.ts` → `time: 30`). Storing minutes keeps the config value identical to the
> displayed label, which every other control in this bar also does. The result payload MUST keep
> monkeytype's second-based `testDuration` field; conversion happens in the test/result layer, not here.

**SB-013** `division: "tables"` MUST mean "dividend and divisor are drawn from the times tables
(Einmaleins), remainder always 0" and `division: "threeByTwo"` MUST mean "at most 3-digit dividend
divided by at most 2-digit divisor, remainder always 0". The bar owns only the value; the generator
semantics are specified in the task-generation requirements.

**SB-014** `fractionAddition: "12"` MUST mean "maximum common denominator 12" and
`fractionAddition: "99"` MUST mean "maximum common denominator is two-digit (≤ 99)". In both cases the
numerator is always smaller than the denominator.

**SB-015** `addition: "100"` MUST mean "operands and result bounded by 100"; `addition: "1000"` MUST
mean "bounded by 1000". `multiplication: "12" | "20" | "100"` MUST mean "both factors ≤ 12 / ≤ 20 /
≤ 100" respectively.

**SB-016** No other config key may be added to or removed from the bar without updating this document.

---

## 3. The eight controls — exact states, labels and icons

**SB-020** Each of the eight settings MUST be rendered as **exactly one** interactive element (a single
`<button>`), never as a row of per-option buttons. Clicking it advances to the next state in its cycle
and wraps around (see §4).

**SB-021** Each control MUST render, left to right inside the button: the control's icon, then a gap of
`0.5em` (monkeytype's `Button` base class `gap-[0.5em]`, Button.tsx:59), then the state label text.
The icon MUST be present in **every** state, including the OFF state.

**SB-022** The label text of each state MUST be **exactly** the string in the "Label" column below —
lowercase, no padding characters, no unit suffixes. `~x~` in the brief denotes the OFF state and is
rendered as a strikethrough (§6), not as literal tilde characters.

### 3.1 Control 1 — normal addition

**SB-023** Icon MUST be `tabler:plus`.
**SB-024** Cycle and labels:

| Order | Value | Label | Rendering |
|---|---|---|---|
| 0 | `"off"` | `+100` | OFF style (struck through, sub colour) |
| 1 | `"100"` | `+100` | ON style |
| 2 | `"1000"` | `+1000` | ON style |

**SB-025** Tooltip/aria text MUST be `addition: off`, `addition: +100`, `addition: +1000` respectively.

### 3.2 Control 2 — multiplication

**SB-026** Icon MUST be `tabler:x`.
**SB-027** Cycle and labels:

| Order | Value | Label | Rendering |
|---|---|---|---|
| 0 | `"off"` | `12x12` | OFF |
| 1 | `"12"` | `12x12` | ON |
| 2 | `"20"` | `20x20` | ON |
| 3 | `"100"` | `100x100` | ON |

**SB-028** Tooltip/aria text MUST be `multiplication: off | 12x12 | 20x20 | 100x100`.

### 3.3 Control 3 — division

**SB-029** Icon MUST be `tabler:divide`.
**SB-030** Cycle and labels:

| Order | Value | Label | Rendering |
|---|---|---|---|
| 0 | `"off"` | `/` | OFF |
| 1 | `"tables"` | `144/12` | ON |
| 2 | `"threeByTwo"` | `xxx/xx` | ON |

**SB-031** The OFF label MUST be the single character `/` (per the brief `~/~`), **not** `144/12`.
**SB-032** Tooltip/aria text MUST be `division: off | 144/12 | xxx/xx`.

### 3.4 Control 4 — fraction addition

**SB-033** Icon MUST be `tabler:math-1-divide-2`.
**SB-034** Cycle and labels:

| Order | Value | Label | Rendering |
|---|---|---|---|
| 0 | `"off"` | `+1/12` | OFF |
| 1 | `"12"` | `+1/12` | ON |
| 2 | `"99"` | `+1/xx` | ON |

**SB-035** Tooltip/aria text MUST be `fraction addition: off | max denominator 12 | max denominator 99`.

### 3.5 Control 5 — fraction multiplication

**SB-036** Icon MUST be `tabler:math-x-divide-y`.
**SB-037** Cycle and labels:

| Order | Value | Label | Rendering |
|---|---|---|---|
| 0 | `false` | `*x/y` | OFF |
| 1 | `true` | `*x/y` | ON |

**SB-038** Tooltip/aria text MUST be `fraction multiplication: off` when off, and
`fraction multiplication: max 12 | max 20 | max 100` when on, where the number mirrors the current
`multiplication` value (see coupling, §8).

### 3.6 Control 6 — decimals

**SB-039** Icon MUST be `tabler:decimal`.
**SB-040** Cycle and labels:

| Order | Value | Label | Rendering |
|---|---|---|---|
| 0 | `false` | `4.2` | OFF |
| 1 | `true` | `4.2` | ON |

**SB-041** Tooltip/aria text MUST be `decimals: off | on`.

### 3.7 Control 7 — negative numbers

**SB-042** Icon MUST be `tabler:minus`.
**SB-043** Cycle and labels:

| Order | Value | Label | Rendering |
|---|---|---|---|
| 0 | `false` | `-` | OFF |
| 1 | `true` | `-` | ON |

**SB-044** Tooltip/aria text MUST be `negative numbers: off | on`. The tooltip is load-bearing here:
a bare minus glyph would otherwise read as "subtraction", which croco calc does not have.
> **ASSUMPTION.** The brief explicitly says "minus for negatives", so `tabler:minus` is used. If a
> reviewer prefers unambiguity over literal compliance, `tabler:plus-minus` (± , verified to exist)
> is the drop-in alternative and only SB-042 changes.

### 3.8 Control 8 — time

**SB-045** Icon MUST be `tabler:clock`.
**SB-046** Cycle and labels — this control has **no** OFF state:

| Order | Value | Label |
|---|---|---|
| 0 | `1` | `1` |
| 1 | `2` | `2` |
| 2 | `4` | `4` |
| 3 | `8` | `8` |

**SB-047** Tooltip/aria text MUST be `time: 1 minute` for `1` and `time: N minutes` for `2`, `4`, `8`.
**SB-048** The time control MUST NOT ever render in the OFF style.

---

## 4. Cycling behaviour

**SB-050** A primary click (left mouse button), `Enter`, or `Space` on a control MUST advance it to the
next allowed state in its cycle, wrapping from the last state to the first.

**SB-051** `Shift`+click, `Shift`+`Enter`, `Shift`+`Space`, and the browser context-menu event
(right click) MUST move to the **previous** allowed state, wrapping from the first to the last. The
context-menu event MUST call `preventDefault()`.

**SB-052** A shared helper `cycleSetting(key, direction)` MUST implement SB-050/SB-051 for all eight
controls: read the state list from the zod schema (SB-011), find the current index, step by
`direction`, wrap modulo the list length, and **skip** any state disallowed by §9. If every other state
is disallowed the call MUST be a no-op.

**SB-053** Every state change MUST go through `setConfig(key, value)` so that validation, overrides,
persistence and the config event bus all run exactly as they do in monkeytype
(`frontend/src/ts/config/setters.ts:19–150`).

**SB-054** Every state change MUST dispatch `restartTestEvent` (`frontend/src/ts/events/test.ts`),
mirroring TestConfig.tsx:110, 140, 255. Consequently the current test is discarded and a fresh first
task is generated and re-blurred.

**SB-055** All eight config keys MUST set `changeRequiresRestart: true` in their config metadata
(`frontend/src/ts/config/metadata.tsx`), matching monkeytype's `punctuation`/`numbers`/`mode`/`time`.

**SB-056** Rapid repeated clicks MUST NOT queue: each click advances exactly one step and each restart
supersedes the previous one.

---

## 5. Icons (iconify)

**SB-060** Icons MUST come from iconify. The full set used by the bar, all verified to exist against
`https://api.iconify.design/tabler.json` on 2026-08-02:

| Control | Iconify ID |
|---|---|
| addition | `tabler:plus` |
| multiplication | `tabler:x` |
| division | `tabler:divide` |
| fraction addition | `tabler:math-1-divide-2` |
| fraction multiplication | `tabler:math-x-divide-y` |
| decimals | `tabler:decimal` |
| negatives | `tabler:minus` |
| time | `tabler:clock` |
| mobile "test settings" button | `tabler:settings` |
| share test settings | `tabler:share` |
| "not leaderboard eligible" notice | `tabler:trophy` |
| "restore defaults" command | `tabler:refresh` |

**SB-061** All bar icons MUST come from the single `tabler` collection. Mixing collections inside the
bar is prohibited, because stroke weight and optical sizing differ between collections and monkeytype's
bar reads as one typographic unit.

**SB-062** `frontend/src/ts/components/common/Fa.tsx` MUST be superseded by an `Icon.tsx` component
with the signature `Icon(props: { icon: string; class?: string; spin?: boolean })` that renders an
inline `<svg>` inheriting `currentColor` and sized `1em`. The `fixedWidth` behaviour of the Font
Awesome component (`fa-fw`, used by `TCButton`, TestConfig.tsx:76) MUST be reproduced by giving the
`<svg>` a fixed `width: 1.25em` so labels of different lengths stay optically aligned.

**SB-063** Icon SVG data MUST be **bundled at build time** (e.g. `unplugin-icons` or
`@iconify/solid` + a local `addCollection` bundle). The runtime MUST NOT make any network request to
`api.iconify.design` or any other host, because the frontend is served as static assets from
Cloudflare Workers and must work offline/behind a strict CSP.

**SB-064** Icons MUST inherit the button's colour (`currentColor`) so the OFF/ON/hover/disabled colour
rules in §6 apply to icon and label together with no extra CSS.

---

## 6. Visual states — reproducing monkeytype's dimmed/inactive styling

The rules below are a literal reproduction of `Button.tsx` `getClasses()` (lines 57–89) with
`variant="text"`. Implementations SHOULD reuse the existing `Button` component with
`variant="text"` and `active={<control is ON>}` rather than writing new CSS.

**SB-070** Every control MUST use monkeytype's text-button base classes verbatim:

```
inline-flex h-min cursor-pointer appearance-none items-center justify-center gap-[0.5em]
rounded border-0 p-[0.5em] text-center leading-[1.25]
transition-[color,background,opacity] duration-125 ease-in-out select-none
```

**SB-071 (OFF state)** A control whose value is `"off"`/`false` MUST render with
`--themable-button-text: var(--sub-color)` (i.e. Tailwind `text-sub`) and a transparent background —
identical to an *inactive* monkeytype text button.

**SB-072 (OFF state, strikethrough)** In the OFF state the **label span only** (never the icon) MUST
additionally carry `text-decoration-line: line-through`, `text-decoration-thickness: 0.1em`,
`text-decoration-color: currentColor`. This is croco calc's rendering of the brief's `~x~` notation and
is the only visual addition to monkeytype's button styling.

**SB-073 (ON state)** A control whose value is not off MUST render with
`--themable-button-text: var(--main-color)` (monkeytype's `--themable-button-active`), i.e. identical
to an *active* monkeytype text button, and MUST NOT have a strikethrough.

**SB-074 (hover)** Hovering an OFF control MUST change its colour to `var(--text-color)` over 125 ms.
Hovering an ON control MUST NOT change its colour — this reproduces monkeytype exactly, where the
active text-button variant re-declares `--themable-button-hover-text` as itself (Button.tsx:77–79),
producing a cyclic custom property and therefore no hover transition.

**SB-075 (pressed)** `:active` MUST set the colour to `var(--sub-color)` (`active:text-sub`,
Button.tsx:71).

**SB-076 (focus)** `:focus-visible` MUST apply
`box-shadow: 0 0 0 0.1rem var(--bg-color), 0 0 0 0.2rem var(--text-color)` and `outline: none`
(Button.tsx:61).

**SB-077 (disabled)** When the test is focused/being typed or the result screen is visible, every
control MUST receive the real `disabled` attribute plus `pointer-events-none opacity-[0.33]` — exactly
`TCButton`'s `disabled={getFocus() || getResultVisible() || props.disabled}` (TestConfig.tsx:80) and
`Button.tsx:81`.

**SB-078 (bar fade)** The whole bar container MUST fade to `opacity-0 pointer-events-none` with
`transition-opacity duration-125` when `getFocus() || getResultVisible()` is true, reproducing
TestConfig.tsx:36–40.

**SB-079** OFF and disabled MUST remain visually distinguishable: OFF is sub-coloured **and struck
through** at full opacity; disabled is 33 % opacity with the strikethrough state unchanged. A control
that is both OFF and disabled shows both.

> **Noted risk (needs a human eyeball, not a blocker).** With the default settings all eight controls
> are ON, so the whole bar renders in `--main-color`, which is heavier than monkeytype's bar (where
> typically 2 of ~12 buttons are accent-coloured). This is the faithful mapping of monkeytype's
> active/inactive semantics onto one-element-per-setting controls. If it reads as too loud, the single
> change is SB-073: swap `var(--main-color)` for `var(--text-color)`. No other requirement moves.

---

## 7. Layout and grouping into pill cards

**SB-080** The bar MUST use the same container as monkeytype (TestConfig.tsx:32–46): a
`grid grid-cols-[1fr_auto_1fr] w-max justify-center place-self-center mx-auto mb-8`, hidden below the
`md` breakpoint (`hidden md:grid`).

**SB-081** The responsive custom properties MUST be copied verbatim from TestConfig.tsx:18–23:

```
[--card-gap:0.25em] [--font-size:0.5em] [--horizontal-padding:0.4em] [--vertical-padding:0.5rem]
md:[--card-gap:1em]  md:[--font-size:0.6em]  md:[--horizontal-padding:0.45em] md:[--vertical-padding:0.75rem]
lg:[--card-gap:1em]  lg:[--font-size:0.75em] lg:[--horizontal-padding:0.5em]  lg:[--vertical-padding:0.75rem]
xl:[--card-gap:2em]  xl:[--font-size:0.75em] xl:[--horizontal-padding:1em]    xl:[--vertical-padding:0.75rem]
```

**SB-082** Each pill card MUST use monkeytype's card class verbatim:
`card rounded-(--roundness) bg-sub-alt px-(--horizontal-padding)` (TestConfig.tsx:25–26), where
`--roundness: 0.5rem` (`frontend/src/styles/core.scss:2`) and `--sub-alt-color` is the theme's
secondary background.

**SB-083** Each control button MUST use `px-(--horizontal-padding) py-(--vertical-padding)`
(TestConfig.tsx:24).

**SB-084** The eight controls MUST be grouped into **exactly three** pill cards, laid out as follows:

| Slot | croco calc content | monkeytype counterpart |
|---|---|---|
| Left (`1fr`, right-aligned, `mr-(--card-gap)`) | **decimals**, **negatives** | the punctuation + numbers card (TestConfig.tsx:85–119) |
| Centre (`auto`, page-centred) | **addition**, **multiplication**, **division**, **fraction addition**, **fraction multiplication** | the mode card, 5 options (TestConfig.tsx:121–147) |
| Right (`1fr`, left-aligned, `ml-(--card-gap)`) | **time** | the mode2 card (TestConfig.tsx:149–271) |

**SB-085** Rationale (binding, so later reviewers do not "simplify" it away): this grouping is a
one-to-one structural match with monkeytype's bar. Left card = two on/off modifiers that decorate the
generated task (punctuation/numbers ↔ decimals/negatives). Centre card = the five mutually-visible
"what am I practising" controls, occupying the same optically-centred slot as monkeytype's five modes.
Right card = the single test-length parameter, exactly monkeytype's mode2 slot. Because the counts and
the semantic roles line up, the existing `grid-cols-[1fr_auto_1fr]` and all gap/padding variables work
unchanged, which is the strongest guarantee that the copy "looks EXACTLY like monkeytype".

**SB-086** Within the centre card the order MUST be brief order 1→5: addition, multiplication,
division, fraction addition, fraction multiplication. Within the left card the order MUST be decimals,
then negatives.

**SB-087** Because a control's label changes width when cycled (`12x12` → `100x100`), each pill card
MUST animate its width over 250 ms when its content width changes, reusing monkeytype's `Anime`
wrapper and `durationMs = 250` (TestConfig.tsx:27, 168–214). The card MUST NOT jump.

**SB-088** All bar animations MUST be passed through `applyReducedMotion()`
(`frontend/src/ts/utils/misc.ts:498–505`) so they collapse to 0 ms under
`prefers-reduced-motion`.

**SB-089** The share-test-settings button MUST be kept in the right card exactly as monkeytype renders
it — hidden at `opacity-0`, revealed on `group-hover` sliding out to the right of the card
(TestConfig.tsx:232–238), with icon `tabler:share`.

---

## 8. Coupling: multiplication ↔ fraction multiplication

The coupling MUST be implemented with monkeytype's own mechanism, `overrideConfig` in
`frontend/src/ts/config/metadata.tsx` (precedent: `words` and `time` force `mode`, lines 175–198),
executed by the loop in `frontend/src/ts/config/setters.ts:100–122`. It MUST NOT be implemented inside
the bar component, so that it applies identically from every entry point.

**SB-090** Setting `fractionMultiplication` to `true` while `multiplication === "off"` MUST also set
`multiplication` to `"100"`.
> **ASSUMPTION.** The brief says fraction multiplication "switches normal multiplication ON too" but
> does not say to which size. `"100"` is chosen because it is the configured default (§10) and because
> monkeytype's `overrideConfig` precedent uses fixed values, not remembered ones. Alternative
> ("restore the last non-off multiplication value") would require a new config key and is rejected.

**SB-091** Setting `multiplication` to `"off"` MUST also set `fractionMultiplication` to `false`.

**SB-092** Setting `multiplication` to any non-off value MUST NOT change `fractionMultiplication`.

**SB-093** Setting `fractionMultiplication` to `false` MUST NOT change `multiplication`.

**SB-094** The maximum numerator/denominator used by fraction multiplication MUST follow the current
`multiplication` value (`"12"` → ≤ 12, `"20"` → ≤ 20, `"100"` → ≤ 100). The bar reflects this only in
the tooltip (SB-038); the label stays `*x/y` in all cases.

**SB-095** Both coupling rules MUST fire identically when triggered from: a bar click, the mobile
modal, the command palette, an imported settings JSON (`applyConfigFromJson`), a shared-settings URL,
a preset, and the server config applied at login (`config/remote.ts:21`).

**SB-096** When a coupling rule changes a control the user did not click, that control MUST play a
250 ms colour/opacity pulse so the change is visible. It MUST NOT raise a notification pop-up (too
noisy for a two-click interaction).

**SB-097** Coupling MUST be idempotent and MUST NOT recurse: applying the config twice produces the
same result, and no `overrideConfig` chain may exceed one level (guaranteed by SB-092/SB-093).

**SB-098** No other pair of controls may be coupled. In particular `decimals` and `negatives` MUST NOT
alter any other control's value.

---

## 9. Guards — states that must not be reachable

**SB-100** "Generator controls" means the five controls `addition`, `multiplication`, `division`,
`fractionAddition`, `fractionMultiplication`.

**SB-101** A configuration in which all five generator controls are off MUST NOT be reachable. The
`"off"`/`false` value of a generator control MUST be blocked (`isBlocked` in config metadata,
`setters.ts:61–68`) whenever selecting it would leave zero enabled generator controls **after the
SB-090/SB-091 coupling cascade has been applied** (see SB-215). It is therefore blocked both when the
control is the last enabled generator and when it is the last enabled generator *together with* a
control that the cascade would switch off with it.

**SB-102** In the bar, `cycleSetting` MUST *skip* any state that, **after `overrideConfig` cascades**,
would leave zero enabled generator controls (SB-215) — silently (SB-052), rather than attempting it.
Consequence: cycling the last enabled control wraps from its final ON state straight back to its first
ON state without ever showing OFF; and with `multiplication` + `fractionMultiplication` as the only two
enabled generators, cycling `multiplication` also skips `"off"`, because SB-091 would cascade
`fractionMultiplication` off with it.

**SB-103** From every non-bar entry point (command palette, settings import, shared URL, preset,
server config), an attempt to reach the all-off state MUST be rejected by `setConfig` returning `false`
and MUST show the notice *"at least one task type must be enabled"* via
`showNoticeNotification` (`frontend/src/ts/states/notifications.ts`).

**SB-104** If a stored/remote config nevertheless arrives with all five generator controls off (e.g. a
hand-edited account config), `applyConfig` MUST fall back to the default value of `addition`
(`"1000"`) and persist the correction, mirroring how monkeytype re-saves keys that failed to apply
(`config/lifecycle.ts:87, 106–108`).

**SB-105** `decimals` MUST be rendered in the **disabled** style (SB-077) whenever `addition`,
`multiplication` and `division` are all off, because decimal tasks are derived only from those three
kinds. It MUST retain its stored value while disabled and become interactive again as soon as one of
the three is switched on. This mirrors monkeytype disabling punctuation/numbers in quote/zen mode
(TestConfig.tsx:106–107).
> **ASSUMPTION — RESOLVED.** The brief is internally inconsistent about decimals: "randomly one of
> types 1–3" versus "Effectively we base ourselves on the division tasks". The settings bar only needs
> the enable/disable rule, which is the same under both readings. The generator semantics were deferred
> to the task-generation requirements and **are now resolved there**: doc 01 assumption A13 / ME-091 /
> ME-107, ruled binding by master C39 — the base kind is uniform over the enabled subset of
> `{add, mul, div}`, and "based on division" is the brief's *explanation* of why the decimal shift is
> safe, not a restriction. No bar-level consequence; SB-105 is unchanged.

**SB-106** `time` MUST always be enabled and MUST never be blocked.

**SB-215 (added by master C36 — BLOCKER fix)** The guard of SB-101 MUST be evaluated on the
**post-cascade** configuration, exactly as ME-089 requires. Normative predicate, used by `isBlocked`, by
`cycleSetting` (SB-102) and by `setConfig` (SB-103) alike:

```
wouldBeAllOff(key, candidateValue, current):
  next = applyCoupling({ ...current, [key]: candidateValue })   // SB-090 + SB-091, idempotent per SB-097
  return enabledGeneratorCount(next) === 0
```

`enabledGeneratorCount` counts, over SB-100's five controls, those whose value is not `"off"` / not
`false`. The single worked case this exists for: with `multiplication = "100"`,
`fractionMultiplication = true` and `addition`/`division`/`fractionAddition` all off, selecting
`multiplication = "off"` is **blocked**, because SB-091 would then also clear `fractionMultiplication`
and the engine would throw `MathGenError` (ME-016). ME-089 is binding over the naive
"last enabled generator" reading of SB-101; where the two disagree, ME-089 wins.

---

## 10. Defaults

**SB-110** The default values MUST be declared in `frontend/src/ts/constants/default-config.ts` (the
single source of truth, consumed by `config/store.ts`, `config/persistence.ts` and
`config/remote.ts`):

| Key | Default | Label shown |
|---|---|---|
| `addition` | `"1000"` | `+1000` |
| `multiplication` | `"100"` | `100x100` |
| `division` | `"threeByTwo"` | `xxx/xx` |
| `fractionAddition` | `"99"` | `+1/xx` |
| `fractionMultiplication` | `true` | `*x/y` |
| `decimals` | `true` | `4.2` |
| `negatives` | `true` | `-` |
| `time` | `8` | `8` |

**SB-111** With the defaults applied, all eight controls MUST render in the ON style; none is struck
through.

**SB-112** The defaults MUST satisfy the coupling rules (SB-090/091) without any override firing —
verifiable by asserting that applying `getDefaultConfig()` produces a byte-identical config.

**SB-113** A first-time anonymous visitor MUST see exactly these defaults, with no flash of a different
state during boot.

**SB-114** Resetting the config (`resetConfig()` in `config/lifecycle.ts:114–118`, and the
`DELETE /configs` endpoint) MUST restore exactly this table.

---

## 11. Persistence

**SB-120** Anonymous persistence MUST reuse monkeytype's `LocalStorageWithSchema` instance
(`frontend/src/ts/config/persistence.ts:14–25`) under the same localStorage key `"config"`, with the
croco calc `ConfigSchema` as the validation schema and `getDefaultConfig()` as the fallback.

**SB-121** Every settings change MUST call `saveToLocalStorage(key)` synchronously
(`persistence.ts:27–39`), i.e. the full config object is written to localStorage on every click.

**SB-122** A localStorage value that fails schema validation MUST be repaired by `migrateConfig`
(`frontend/src/ts/config/utils.ts`) rather than discarded, and MUST fall back to the full default
config only if it is not an object (`persistence.ts:18–24`).

**SB-123** For a signed-in user, changed keys MUST be accumulated in `configToSend` and flushed by a
**1000 ms debounce** to `PATCH /configs` with only the changed keys in the body
(`persistence.ts:36–38, 52–60`; contract `packages/contracts/src/configs.ts` → `save`, body
`PartialConfigSchema.strict()`).

**SB-124** While a config sync request is in flight, the account button in the header MUST show its
spinner and clear it in `finally` (`setAccountButtonSpinner`, `persistence.ts:44–49, 53–58`).

**SB-125** For an anonymous user no network request may be made: `saveConfig` MUST early-return when
`isAuthenticated()` is false (`frontend/src/ts/ape/config.ts:6–13`).

**SB-126** On page load the config MUST be read from localStorage before first paint, via
`loadFromLocalStorage()` (`config/lifecycle.ts:44–54`) invoked from `frontend/src/ts/index.ts:65`.

**SB-127** On successful sign-in the **server config wins**: `updateFromServer()`
(`config/remote.ts:11–24`) MUST fetch `GET /configs`, compare with the in-memory config, and if they
differ call `applyConfig(remoteConfig)` followed by `saveFullConfigToLocalStorage(true)` (the `true`
suppresses an immediate write-back). It MUST be called from the post-authentication path
(`frontend/src/ts/auth.tsx:180`).

**SB-128** If the signed-in user has no server config yet, the defaults MUST be used
(`config/remote.ts:43–46`) and then written to the account by the first subsequent change.

**SB-129** On sign-out the local config MUST be left untouched (monkeytype behaviour — there is no
config reset in the sign-out path), so the user keeps their settings anonymously.

**SB-130** All eight keys MUST be part of the `"test"` config group
(`packages/schemas/src/configs.ts:520–532`) so that partial presets covering "test" carry them.

**SB-131** The settings-JSON import/export commands (`commandline/lists.ts:224–243`) MUST round-trip
all eight keys losslessly.

**SB-132** Config changes made while offline MUST persist to localStorage and MUST be retried on the
next successful change; a failed `PATCH` MUST surface `showErrorNotification("Failed to save config")`
exactly as `ape/config.ts:9–11` does, and MUST NOT roll back the local value.

---

## 12. Keyboard accessibility

**SB-140** Every control MUST be a native `<button type="button">` with `tabIndex={0}` (as
`Button.tsx` already renders), never a `div` with a click handler.

**SB-141** Tab order MUST follow DOM order: decimals → negatives → addition → multiplication →
division → fraction addition → fraction multiplication → time → share button.

**SB-142** `Enter` and `Space` MUST cycle forward (native button activation, SB-050);
`Shift`+`Enter`/`Shift`+`Space` MUST cycle backward (SB-051).

**SB-143** Focus MUST be visible using monkeytype's ring (SB-076) and MUST NOT be suppressed by any
`outline: none` without a replacement.

**SB-144** Each control MUST expose an `aria-label` equal to its tooltip text (§3), produced by
`buildBalloonHtmlProperties` (`Balloon.tsx:20–36`) which also sets `data-balloon-pos="up"`. The
`aria-label` MUST update whenever the value changes.

**SB-145** Because the visible label alone (`4.2`, `-`, `/`) is not self-describing, the `aria-label`
MUST always include the control name, never only the state.

**SB-146** When the bar is disabled (SB-077) all eight buttons MUST carry the real `disabled`
attribute, removing them from the tab order — this is monkeytype's existing behaviour via
`TCButton`'s `disabled` prop and MUST NOT be replaced by `pointer-events: none` alone.

**SB-147** The bar MUST NOT trap focus and MUST NOT steal focus from the test input; typing a digit
while a control is focused MUST behave as it does in monkeytype (input is routed to the test), so the
test input handler keeps precedence.

**SB-148** Each control MUST carry `data-setting="<config key>"` and `data-value="<current value>"`
attributes for end-to-end tests, following monkeytype's `data-ui-element` convention
(TestConfig.tsx:41, Button.tsx `data-ui-element="button"`).

---

## 13. The command line (Escape command palette)

**SB-150** The command palette MUST keep monkeytype's bindings unchanged: `Escape` opens it (or `Tab`
when `quickRestart === "esc"`), plus `Mod+Shift+P` on non-Firefox
(`frontend/src/ts/input/hotkeys/commandline.ts:11–12`, `frontend/src/ts/states/hotkeys.ts:36, 48–51`,
`components/hotkeys/CommandlineHotkey.tsx`).

**SB-151** The `quickRestart` config MUST keep monkeytype's default `"off"`, so `Escape` opens the
palette by default.

**SB-152** All eight settings MUST have palette commands, and those commands MUST be **generated from
config metadata** via `buildCommandForConfigKey` (`commandline/util.ts:17–24`) — not hand-written —
so the bar and the palette can never disagree about the option set.

**SB-153** The eight commands MUST appear first in the command list, in bar order (decimals, negatives,
addition, multiplication, division, fraction addition, fraction multiplication, time), replacing the
`"punctuation", "numbers", "mode", "time", "words", "quoteLength", "language"` block at
`commandline/lists.ts:49–57`.

**SB-154** Each command MUST use `subgroup: { options: "fromSchema" }` so the palette lists states in
schema order (= cycle order, SB-011), and `afterExec: () => void TestLogic.restart()` mirroring
`commandline-metadata.ts:98–151`.

**SB-155** In the palette the OFF state MUST display as the word `off` (never as a struck-through
glyph, which the palette cannot render). ON states MUST display the same label text as the bar
(`+1000`, `100x100`, `xxx/xx`, `+1/xx`, `on`, `on`, `on`, `8`). Display strings MUST be supplied via
`optionsMetadata` on the config metadata, so there is one mapping table, not two.

**SB-156** Command display names MUST be: `Decimals...`, `Negative numbers...`, `Addition...`,
`Multiplication...`, `Division...`, `Fraction addition...`, `Fraction multiplication...`, `Time...`.
Aliases MUST include at least: `plus`, `add` (addition); `times`, `multiply` (multiplication);
`divide` (division); `fraction`, `fractions` (both fraction controls); `decimal`, `point`, `comma`
(decimals); `minus`, `negative` (negatives); `duration`, `minutes` (time).

**SB-157** A new command `restoreDefaultTestSettings` MUST exist, display
`Restore default test settings`, icon `tabler:refresh`, alias `default leaderboard eligible`, which
sets all eight keys to the SB-110 defaults in one `applyConfig` call and restarts the test.

**SB-158** The `time` command MUST NOT offer a free-text custom duration. monkeytype's `time` command
has an `input` branch (`commandline-metadata.ts:130–143`) and a `fa-tools` custom button
(TestConfig.tsx:260–268); both MUST be removed, because croco calc's time domain is closed
(1/2/4/8) and arbitrary durations would fragment leaderboards.

**SB-159** The following monkeytype commands MUST be removed from the palette because the underlying
feature does not exist in croco calc: `language`, `quoteLength`, `punctuation`, `numbers`, `mode`,
`words`, `changeCustomModeText`, `viewQuoteSearchPopup`, quote-favourite commands, `britishEnglish`,
`lazyMode`, `customPolyglot`, `customLayoutfluid`, `layout`, all `keymap*` commands, all funbox
commands, `loadChallenge`, `watchVideoAd`, `ads`, and `minBurst`.

**SB-160** The following MUST be kept: theme commands (incl. favourites, custom themes, random theme,
custom background and its filters), navigation commands, presets, tags, result-screen commands,
`bailOut`, `resultSaving`, `difficulty`, `quickRestart`, `blindMode`, `singleListCommandLine`,
`minWpm`/`minAcc` equivalents if the results spec keeps them, sound commands, caret commands,
appearance commands (`timerStyle`, `timerColor`, `timerOpacity`, `fontSize`, `fontFamily`,
`maxLineWidth`, `alwaysShowDecimalPlaces`, `startGraphsAtZero`), show/hide commands, settings
import/export, `clearNotifications`, and `signOut`.
> Ownership note: SB-159/SB-160 cover the palette entries that follow from the settings bar's scope.
> Page-specific commands introduced by other requirement documents are those documents' responsibility.

**SB-161** `singleListCommandLine` MUST keep working for the eight new commands, i.e. their subgroup
entries must flatten into `"<Command> > <option>"` rows (`commandline/lists.ts:447–509`).

**SB-162** Executing any of the eight commands MUST produce exactly the same config mutation, coupling
behaviour, persistence and restart as clicking the corresponding control in the bar.

---

## 14. Mobile

**SB-165** Below the `md` breakpoint (849 px, `frontend/src/styles/tailwind.css` `--breakpoint-md`) the
bar MUST be hidden and replaced by a single `variant="button"` labelled `test settings` with icon
`tabler:settings`, opening the mobile modal — exactly TestConfig.tsx:47–59.

**SB-166** `MobileTestConfigModal` MUST render the eight controls as full-width rows in three
`Separator`-delimited groups matching the three pills (SB-084), reusing
`frontend/src/ts/components/modals/MobileTestConfigModal.tsx`'s structure and its `Separator` usage.

**SB-167** In the modal each control MUST remain a single cycling element (tap = next state), showing
`<icon> <control name>: <label>`. The modal MUST NOT expand controls into per-option button lists, so
that the interaction model is identical on both layouts.

**SB-168** The modal MUST keep the `share` button row (MobileTestConfigModal.tsx:209–211).

---

## 15. Leaderboard eligibility — one comparable value

monkeytype gates its all-time leaderboards with
`result.mode === "time" && (result.mode2 === "15" || result.mode2 === "60") && !result.lazyMode`
(`backend/src/utils/pb.ts:206–210`), and keys daily leaderboards by `(language, mode, mode2)`
(`backend/src/api/controllers/result.ts:490–496`). croco calc has no `mode`/`mode2`/`language`, so the
equivalent gate is defined here.

**SB-170** Every saved result MUST carry a string field `settingsId`, computed at result-submission
time from the seven non-time settings, joined by `:` in this fixed order:

```
settingsId = [addition, multiplication, division, fractionAddition,
              fractionMultiplication ? "1" : "0",
              decimals ? "1" : "0",
              negatives ? "1" : "0"].join(":")
```

**SB-171** With the SB-110 defaults, `settingsId` MUST equal exactly:

```
1000:100:threeByTwo:99:1:1:1
```

**SB-172** `time` MUST NOT be part of `settingsId`. It is the leaderboard's second axis, exactly as
`mode2` is in monkeytype.

**SB-173** A shared frozen constant `LEADERBOARD_SETTINGS_ID = "1000:100:threeByTwo:99:1:1:1"` MUST be
declared in `packages/schemas` (or `packages/util`) and used by both frontend and backend.

**SB-174** `LEADERBOARD_SETTINGS_ID` MUST be a literal constant and MUST NOT be derived from
`getDefaultConfig()`. If the product defaults ever change, historical results must remain comparable;
changing the leaderboard baseline must be a deliberate, separately-reviewed act.

**SB-175** A result MUST be eligible for all-time and daily leaderboards if and only if
`result.settingsId === LEADERBOARD_SETTINGS_ID && (result.time === 4 || result.time === 8)`, in
addition to monkeytype's existing non-settings gates that MUST be kept: user not banned, not
`lbOptOut`, `timeTyping > minTimeTyping`, not bailed out (`result.ts:503–515`).

**SB-176** Leaderboards MUST be split by `time` into exactly two boards, `4` and `8`; `1` and `2`
MUST NOT produce leaderboard entries. There MUST be no language axis.

**SB-177** Weekly XP leaderboards MUST NOT apply the `settingsId` gate — XP is earned from all tests,
matching monkeytype where the weekly XP board is independent of `mode`/`mode2`
(`result.ts:617`).

**SB-178** The `settingsId` of a result MUST be immutable once written; it MUST NOT be recomputed from
the user's current config when the leaderboard is read.

### 15.1 Eligibility feedback in the UI

**SB-180** Whenever the current settings are not leaderboard-eligible, a notice MUST appear in the
strip under the bar (the croco calc equivalent of
`frontend/src/ts/components/pages/test/modes-notice/TestModesNotice.tsx`), using the `Notice`
component (`modes-notice/Notice.tsx`) with icon `tabler:trophy` and text
`not eligible for leaderboards`.

**SB-181** That notice MUST be a clickable `Notice` (the `onClick` variant, Notice.tsx:22–37) that
executes `restoreDefaultTestSettings` (SB-157).

**SB-182** The notice MUST be hidden when the settings are eligible, and MUST NOT be shown at all on
the results page.

**SB-183** The notice MUST fade with the rest of the mode-notice strip when the test is focused
(`TestModesNotice.tsx:36–40`).

---

## 16. Interaction with the rest of the test page

**SB-190** Changing any setting MUST cause the next task to be regenerated **and re-blurred**, per the
brief's "first task must be blurred until you start". The bar owns only the restart dispatch (SB-054);
the blur is specified in the test-page requirements.

**SB-191** The bar MUST NOT be rendered on any page other than the test page.

**SB-192** The bar MUST render before the config finishes loading from the server without flashing
another state: initial paint uses the localStorage config (SB-126); a later server-applied config
(SB-127) MUST update the controls reactively through the Solid store, with the width animation
(SB-087) suppressed for that first programmatic update.

**SB-193** The share-settings URL (`ShareTestSettings.tsx`) MUST encode the eight keys instead of
monkeytype's `[mode, mode2, customText, punctuation, numbers, language, difficulty, funbox]` tuple,
keeping the `?testSettings=` query parameter name and the `lz-ts` `compressToURI` encoding.

**SB-194** Applying a shared-settings URL MUST run through the same `setConfig` path, so guards (§9)
and coupling (§8) apply.

---

## 17. Verification checklist (for stage 3)

**SB-200** Unit: `cycleSetting` produces the exact ordered sequences in §3 for forward and backward
cycling, for all eight keys, including wraparound.
**SB-201** Unit: the label/tooltip mapping table (§3) is exhaustive — every schema value has a label
and a tooltip string; a schema value with no entry is a build error.
**SB-202** Unit: SB-090 through SB-098 coupling truth table (all 4 × 2 combinations of
`multiplication` × `fractionMultiplication` transitions).
**SB-203** Unit: SB-101/102/215 — with only one generator on, cycling that control never yields an off
value; with two generators on, either can be switched off **unless the coupling would cascade the other
one off too**. The three cases MUST all be asserted:
(a) `addition="1000"` only → cycling `addition` never yields `"off"`;
(b) `addition="1000"` + `division="tables"` → either can be switched off;
(c) `multiplication="100"` + `fractionMultiplication=true`, everything else off → `multiplication`
    **cannot** be switched off (SB-215, ME-089), while `fractionMultiplication` **can**.
**SB-204** Unit: `settingsId` for `getDefaultConfig()` equals `LEADERBOARD_SETTINGS_ID` (SB-171/173).
**SB-205** Unit: eligibility predicate (SB-175) true for default+4 and default+8; false for default+1,
default+2, and for any single-setting deviation from default.
**SB-206** Integration: a click writes localStorage synchronously and issues exactly one debounced
`PATCH /configs` after 1000 ms containing only the changed key (SB-121/123).
**SB-207** Integration: anonymous user click issues zero network requests (SB-125).
**SB-208** Integration: sign-in with a differing server config overwrites the local one and repaints
the bar (SB-127).
**SB-209** DOM: with defaults, all eight buttons have `data-value` matching SB-110 and none carries the
strikethrough class (SB-111).
**SB-210** DOM: an off control has `text-sub` on the button and `line-through` on the label span only,
never on the `<svg>` (SB-071/072).
**SB-211** DOM: during a focused test all eight buttons have the `disabled` attribute and the container
has `opacity-0` (SB-077/078).
**SB-212** A11y: every control has a non-empty `aria-label` containing its control name, and the whole
bar is reachable and operable by keyboard alone (SB-140–147).
**SB-213** Palette: each of the eight commands lists exactly the schema options in cycle order and
applying one leaves the bar in the identical state as clicking (SB-154/162).
**SB-214** Visual: side-by-side screenshot diff against monkeytype's bar at the 849 / 1105 / 1361 /
1617 px breakpoints confirms identical card radii, gaps, paddings and font sizes (SB-081–083).

---

## 18. Open ambiguities (summary)

| ID | Ambiguity | Chosen reading |
|---|---|---|
| SB-012 | Is `time` stored in minutes or seconds? | Minutes in config; seconds only in the result payload |
| SB-044 | "minus for negatives" is visually ambiguous | Follow the brief (`tabler:minus`) + mandatory tooltip; `tabler:plus-minus` is the one-line alternative |
| SB-090 | Which multiplication size does the coupling switch on? | `"100"` (the default) |
| SB-101 | May the user turn every task type off? | No — blocked, last generator cannot be switched off |
| SB-105 | Decimals: "random of types 1–3" vs "based on division" | Bar-level rule is the same either way (disabled only when 1–3 are all off); generator semantics deferred |
| SB-073 | Every ON control rendering in `--main-color` may be visually heavy | Kept for exact monkeytype fidelity; single-line override documented |

**Blockers: none.** All six ambiguities have a chosen, implementable reading; none prevents stage 2
from starting.
