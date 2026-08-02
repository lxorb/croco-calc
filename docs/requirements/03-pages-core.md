# croco calc — Core Pages Requirements (test, results, about, modals)

Status: draft for implementation
Owner of this document: core-pages requirements author
Requirement ID range: **CP-001 … CP-196** plus **CP-058a** (197 requirements, contiguous, no gaps, no duplicates). CP-058a and CP-191 … CP-196 were added in revision 2 of the master document (commit-time input normalisation; the mobile answer symbol row).
Plus 7 open items **B-1 … B-7** in §10 that need a human decision.

## 0. Scope, sources and conventions

This document owns:

- the **test page** (page shell, settings bar placement, task stream, blur/reveal, caret, timer, restart button, footer);
- the **results page**;
- the **info/about page**;
- the **contact modal**, **support modal** and **theme modal**.

It does **not** own: the semantics of the 8 settings controls (owned by the settings/config
requirements), task generation and answer-equivalence rules (owned by the task-generation
requirements), the leaderboard/profile/account pages, auth, or infra. Where this document needs
those, it states the interface it needs and cross-references, rather than redefining them.

### 0.1 Reference checkout

Every claim about monkeytype below was read out of the reference checkout at
`C:\Users\me\AppData\Local\Temp\claude\C--Users-me-Projects-calc-trainer\2ed5ffdc-09db-4833-a58e-c5b7bd58be53\scratchpad\monkeytype-ref`.
The project repo `C:\Users\me\Projects\calc-trainer` has the identical tree (verified:
`frontend/src/ts/components/pages/test/` and `frontend/src/html/pages/` match file-for-file), so all
paths below are written **repo-relative** and resolve in both.

### 0.2 Document conventions

- **MUST** = mandatory, verifiable by inspection or test. **SHOULD** = strong default, deviation
  requires a note in the PR. **MUST NOT** = forbidden.
- Requirements are numbered `CP-nnn`. Later stages verify coverage ID by ID.
- Every place where the brief is under-specified is marked **ASSUMPTION** inline and repeated in
  §9. Open items that need a human decision are in §10.

### 0.3 Global rules that apply to everything in this document

- **CP-001** All UI icons MUST be rendered through iconify, replacing monkeytype's Font Awesome.
  The existing wrapper `frontend/src/ts/components/common/Fa.tsx` (which emits `<i class="fas fa-x">`)
  MUST be replaced by an equivalent `Icon.tsx` wrapper with the same prop surface
  (`icon`, `fixedWidth`, `spin`, `size`, `class`) so that the ~200 call sites change only their icon
  string. The SCSS files `frontend/src/styles/fontawesome-5.scss` and
  `frontend/src/styles/fontawesome-6.scss` MUST be deleted and the webfonts under
  `frontend/static/webfonts/` removed.
- **CP-002** Every icon named in this document is given as `iconify-set:icon-name`. Implementations
  MUST use exactly those names so that the icon set is auditable.
- **CP-003** The `.content-grid` layout system in `frontend/src/styles/core.scss` (lines 58–100:
  named grid columns `full-width` / `full-width-padding` / `breakout` / `content`,
  `--content-max-width: 1536px`, `--padding-inline: 2rem`) MUST be kept unchanged. Pages MUST keep
  using `content` / `full-width` column names exactly as monkeytype does.
- **CP-004** The Solid page-visibility wrapper `frontend/src/ts/components/common/Page.tsx` and the
  page id registry `frontend/src/ts/pages/page.ts` MUST be kept; page ids `test`, `about` are reused
  verbatim.
- **CP-005** The header nav (`frontend/src/ts/components/layout/header/Nav.tsx`) MUST keep the
  `data-nav-item` attribute values `test`, `leaderboards`, `about`, `settings`, `alerts`, `login`,
  `account`. Rationale (verifiable): all 52 theme CSS files under `frontend/static/themes/` colour
  the nav through these exact selectors — e.g. `frontend/static/themes/dracula.css` opens with
  `[data-nav-item="test"] { color: #ec75c4; … }`. Renaming them silently breaks 52 themes.
- **CP-006** Ads MUST NOT be built in this stage (brief: deferred). All ad markup MUST be removed
  from the pages this document owns: the four `#ad-*-wrapper` blocks in `frontend/src/index.html`,
  the `#ad-result-wrapper` / `#ad-result-small-wrapper` block in
  `frontend/src/html/pages/test-result.html` (lines 306–318), and both
  `<Advertisement id="ad-about-1|ad-about-2">` usages in
  `frontend/src/ts/components/pages/AboutPage.tsx`. `frontend/src/ts/components/common/Advertisement.tsx`,
  `frontend/src/ts/controllers/ad-controller.ts`, `eg-ad-controller.ts`, `pw-ad-controller.ts`,
  `frontend/src/ts/popups/video-ad-popup.ts`, `frontend/src/ts/elements/monkey-power.ts` and
  `frontend/src/styles/ads.scss` MUST be deleted.
- **CP-007** Product name string MUST be `croco calc` (lowercase, with a space) everywhere in user-
  facing copy. The mascot is a crocodile.

---

## 1. Shared page shell (header / footer) — applies to test, results and about

Reference: `frontend/src/index.html`, `frontend/src/ts/components/layout/header/Header.tsx`,
`Logo.tsx`, `Nav.tsx`, `frontend/src/ts/components/layout/footer/Footer.tsx`, `Keytips.tsx`,
`ThemeIndicator.tsx`, `VersionButton.tsx`, `ScrollToTop.tsx`.

- **CP-008** The app shell MUST keep monkeytype's structure from `frontend/src/index.html`:
  `<mount data-component="overlays">`, `theme`, `bartimerprogress`, `modals`, `popups`, then
  `#app.content-grid` containing `header` → `main.full-width.content-grid` → `footer`.
- **CP-009** The header MUST remain `Logo` + `Nav` in one flex row and MUST keep the
  `data-ui-element="header"` and `data-focused` attributes (`Header.tsx` lines 11–17), because the
  focus-dimming CSS keys off them.
- **CP-010** The logo MUST be replaced: the inline monkeytype `<svg>` in `Logo.tsx` (lines 26–37)
  MUST be swapped for the crocodile mark, `aria-label` becomes `croco calc Home`, `<h1>` text becomes
  `croco calc`, and the sub-text (`monkey see`) becomes `croco calc`'s tagline. The logo MUST keep
  its click behaviour: clicking it while on the test page dispatches `restartTestEvent`.
  **ASSUMPTION**: tagline text is not in the brief; use `snap snap` as a placeholder and flag for the
  user (§10).
- **CP-011** The nav MUST contain exactly: test, leaderboards, about, settings, alerts, then
  login-or-account — same set and order as `Nav.tsx`. Nav icons MUST become:
  test `ph:calculator-bold` (replacing `fa-keyboard`, which is wrong for a math trainer),
  leaderboards `ph:crown-bold`, about `ph:info-bold`, settings `ph:gear-bold`,
  alerts `ph:bell-bold`, login `ph:user-bold`.
- **CP-012** The footer MUST contain exactly these **seven** buttons, in this order, each with a
  fixed-width leading icon (the word `eight` in the original text was a miscount — corrected by master
  §2.31; the list below is, and always was, seven items): `contact` (`ph:envelope-simple-bold`, opens the Contact modal),
  `support` (`ph:hand-heart-bold`, opens the Support modal), `github`
  (`ph:code-bold`, links to the croco calc repo), `discord` (`simple-icons:discord`),
  `terms` (`ph:file-text-bold`, `/terms-of-service.html`), `security`
  (`ph:shield-bold`, `/security-policy.html`), `privacy` (`ph:lock-bold`,
  `/privacy-policy.html`).
- **CP-013** The `twitter` footer button present in `Footer.tsx` (lines 65–74) MUST be removed — the
  brief's footer list does not contain it.
- **CP-014** The bottom-right cluster MUST keep `ThemeIndicator` then `VersionButton`
  (`Footer.tsx` lines 103–106). The theme indicator MUST display the active theme's name with a
  palette icon (`ph:palette-bold`), MUST open the theme modal on click, and MUST keep the
  shift-click behaviour that toggles custom theme (`ThemeIndicator.tsx` lines 18–35).
- **CP-015** `Keytips` MUST be kept and MUST render two lines: `<restart key> - restart test` and
  `<commandline key> - command line`, gated on the `showKeyTips` config, fading to `opacity-0` while
  the test has focus (`Keytips.tsx`).
- **CP-016** Header and footer MUST fade out while typing exactly as monkeytype does: footer uses
  `classList={{ "opacity-0": getFocus() }}` and header uses `data-focused`. This behaviour MUST be
  preserved unchanged.
- **CP-017** The `discord` footer link MUST read its URL from a single build-time constant
  (`SOCIAL_LINKS.discord`). If that constant is empty the button MUST render disabled with tooltip
  `coming soon` rather than linking to a dead invite. Rationale: "discord integration" is on the
  deferred list, but the brief explicitly lists discord in the footer.

---

## 2. Test page

Reference: `frontend/src/html/pages/test.html`, `frontend/src/ts/components/pages/test/*`,
`frontend/src/ts/test/test-ui.ts`, `frontend/src/ts/test/caret.ts`,
`frontend/src/ts/elements/caret.ts`, `frontend/src/ts/test/test-timer.ts`,
`frontend/src/ts/states/test.ts`, `frontend/src/ts/states/live-stats.ts`,
`frontend/src/styles/test.scss`, `frontend/src/styles/caret.scss`.

### 2.1 Page skeleton

- **CP-018** The test page MUST keep the DOM skeleton of `frontend/src/html/pages/test.html`, in
  this order inside `.page.pageTest.full-width.content-grid`:
  1. `<mount data-component="testconfig" class="full-width">` — the settings bar;
  2. `#testInitFailed` — the "generation failed" panel;
  3. `#typingTest.content-grid.full-width-padding` — everything below;
  4. `.loading` spinner;
  5. `<load src="./test-result.html" />` — the results block, hidden until the test finishes.
- **CP-019** `#typingTest` MUST contain, in order: live-stats-text-top mount, live-stats-mini mount,
  `#tasksWrapper` (renamed from `#wordsWrapper`), the restart button, live-stats-text-bottom mount.
- **CP-020** `#tasksWrapper` MUST contain, in order: the hidden capture `<textarea id="tasksInput">`,
  the out-of-focus warning mount, `#caret`, and `#tasks` (renamed from `#words`). The rename
  `words → tasks` MUST be applied consistently across HTML, SCSS and TS; no `#words` selector may
  remain.
- **CP-021** The following mounts present in `test.html` MUST be removed together with their
  components and styles: `capswarning`, `#memoryTimer`, `#layoutfluidTimer`, `compositiondisplay`,
  `keymap`, `monkey`, `premid`, `#paceCaret`. See CP-060…CP-066 for the per-item justification and
  the file list.
- **CP-022** `#testInitFailed` MUST be kept, with the copy rewritten to
  `Task generation failed. Please try different settings or refresh the page. If the problem
  persists, please contact support.` and a `restart` button with icon `ph:arrow-counter-clockwise-bold`.

### 2.2 Settings bar (placement only — semantics owned by the settings requirements)

- **CP-023** The settings bar MUST be the Solid `TestConfig` component
  (`frontend/src/ts/components/pages/test/TestConfig.tsx`), mounted at the top of the test page,
  above the task area, centred, using the same responsive CSS-variable scale defined at
  `TestConfig.tsx` lines 18–26 (`--card-gap`, `--font-size`, `--horizontal-padding`,
  `--vertical-padding`, `card rounded-(--roundness) bg-sub-alt`).
- **CP-024** The bar MUST contain exactly **8 controls**, each one single element that cycles through
  its states on click, each with a leading iconify icon that identifies which setting it belongs to:
  addition, multiplication, division, fraction addition, fraction multiplication, decimals,
  negatives, time. Their state lists, OFF states, coupling rules and defaults are specified in the
  settings requirements document and MUST NOT be duplicated here.
- **CP-025** The 8 controls MUST be laid out as monkeytype lays out its config bar: one or more
  `card` pills in a centred row (`TestConfig.tsx` lines 32–46 uses
  `grid-cols-[1fr_auto_1fr] justify-center place-self-center`). **ASSUMPTION**: the brief does not say
  how to group them. Group as three pills — `[addition | multiplication | division]`,
  `[fraction add | fraction mul | decimals | negatives]`, `[time]` — because that mirrors
  monkeytype's `[punctuation numbers] [mode] [mode2]` three-pill rhythm and keeps related toggles
  adjacent.
- **CP-026** The bar MUST fade to `pointer-events-none opacity-0` when the test has focus or the
  result is visible, exactly as `TestConfig.tsx` line 38 does, and its buttons MUST be `disabled`
  in those states (line 80).
- **CP-027** Below the `md` breakpoint the bar MUST be replaced by a single `test settings` button
  (icon `ph:gear-bold`) that opens the `MobileTestConfig` modal, as in `TestConfig.tsx` lines 47–59.
  The mobile modal MUST expose the same 8 controls.
- **CP-028** Changing any of the 8 controls MUST dispatch `restartTestEvent`
  (`frontend/src/ts/events/test.ts`) so the task stream regenerates immediately, matching monkeytype.
- **CP-029** The hover-revealed `share settings` button (`TestConfig.tsx` lines 232–238, opens the
  `ShareTestSettings` modal) MUST be kept.

### 2.3 Task stream — the adaptation of monkeytype's word stream

Design and justification (normative rationale for CP-030…CP-045):

monkeytype renders `#words` as `display:flex; flex-wrap:wrap` (`frontend/src/styles/test.scss`
lines 85–92), each `.word` holding `<letter>` children, with the caret absolutely positioned over
the active letter and a line-jump scroll implemented in `test-ui.ts`. The signature look is
**three visible lines of upcoming content that flow past you**. croco calc MUST keep exactly that
metaphor, with `word → task`:

```
   847 + 156 = 1003     12 × 12 = 144       -84 + 917 = 833
   7/12 + 1/4 = 5/6     4.2 × 0.5 = 2.1     144 / 12 = |
   xxx / xx =           …
```

Alternative considered and **rejected**: a single large centred task (Zetamac style). Rejected
because it discards the wrapping stream that is the whole visual identity of monkeytype, removes the
sense of pace and progress, and would leave the caret / line-jump machinery unused. The brief demands
"EXACTLY like monkeytype in design", so the stream wins.

- **CP-030** `#tasks` MUST be `display:flex; flex-wrap:wrap; align-content:flex-start; width:100%`,
  i.e. the existing `#words` rule in `frontend/src/styles/test.scss` lines 85–92 reused unchanged.
- **CP-031** Each task MUST be one `div.task[data-taskindex="n"]`, `display:inline-block`,
  `white-space:nowrap`, so a task never breaks across two lines.
- **CP-032** Each `.task` MUST contain exactly two children:
  `<span class="prompt">` (the expression plus a trailing ` = `) and `<span class="answer">`
  (the user's typed characters, one `<letter>` element per character, empty before any input).
- **CP-033** `.prompt` MUST render the expression using proper glyphs, not ASCII: `×` for
  multiplication, `÷` (or `/` for fractions — see CP-034), `−` (U+2212) for a binary minus and for a
  negative sign. Fractions MUST be rendered inline as `a/b` (slash form), not as stacked fractions,
  so that a task stays on one text line and the flex wrap behaves identically to monkeytype.
- **CP-034** Division tasks MUST use `÷` in the prompt; fraction values MUST use `/`. This makes the
  two visually distinguishable in a mixed stream.
- **CP-035** Colouring MUST reuse the `#words` custom properties in
  `frontend/src/styles/test.scss` lines 116–122. Mapping: upcoming task prompts use
  `--untyped-letter-color` (`var(--sub-color)`); the active task prompt and all typed answer
  characters use `--correct-letter-color` (`var(--text-color)`); a committed **wrong** task uses
  `--incorrect-letter-color` (`var(--error-color)`); a committed **correct** task returns to
  `--untyped-letter-color`. All `highlight-*`, `flipped` and `colorfulMode` variants in that file
  MUST keep working against the new class names.
- **CP-036 (critical)** While an answer is being typed the app MUST NOT give any per-character
  correctness feedback: no red/green letters, no length hint, no auto-advance when the typed length
  equals the answer length. Rationale: any of those leaks the answer (typing `1` and seeing it go red
  tells you the first digit is not 1; auto-advance tells you the digit count). This is the single
  biggest deliberate divergence from monkeytype's per-character model and it is mandatory.
- **CP-037** An answer MUST be committed only on an explicit submit key: `Enter` or `Space`. Both
  MUST behave identically. Rationale: `Space` preserves monkeytype muscle memory (space commits a
  word) and is meaningless inside a numeric answer, so accepting it costs nothing.
- **CP-038** Submitting an empty answer MUST be a no-op (no commit, no advance, no score change).
- **CP-039** On commit the app MUST evaluate the answer through a single shared pure function
  `isAnswerCorrect(task, rawInput): boolean` owned by the task-generation requirements. The test page
  MUST NOT contain its own comparison logic.
- **CP-040** On commit the task MUST receive class `typed` plus `correct` or `incorrect`, and the
  active task pointer MUST advance by exactly one.
- **CP-041** When a committed task is `incorrect`, the correct answer MUST be shown beneath it as a
  hint, reusing monkeytype's hint mechanism (`#words .word .hints hint`,
  `frontend/src/styles/test.scss` lines 181–195: absolutely positioned, `bottom:-1.1em`,
  `font-size:0.75em`, `opacity:0.5`). This does not leak anything, because the task is already
  committed.
- **CP-042** A committed task MUST NOT be revisitable. Backspace MUST NOT move the caret out of the
  active task's answer. Rationale: CP-041 has already revealed that task's answer, so re-entry would
  be free points. monkeytype's `freedomMode` / "backspace into previous word" behaviour and the
  `confidenceMode` config MUST be removed.
- **CP-043** `.answer` MUST use `font-variant-numeric: tabular-nums` so digit widths are constant and
  the caret does not jitter between digits.
- **CP-044** The task stream MUST keep monkeytype's line behaviour: at most `N` lines are shown
  (`N = 3`, monkeytype's default), and when the active task moves to a new line the stream scrolls up
  by one line with the existing animation in `test-ui.ts` (`updateActiveElement`, `lineJump`,
  `activeWordTop` / `wordTopBeforeLineJump` bookkeeping at `test-ui.ts` lines 90–104 and following).
  The `tape` display mode (`#words.tape`, `test.scss` lines 199–207) MAY be kept as an option but is
  not required.
- **CP-045** The generator MUST keep at least `3 × lineCapacity` tasks materialised ahead of the
  active index at all times, so the stream never visibly runs dry in an 8-minute test. Tasks MUST be
  generated lazily in batches, not all up front.

### 2.4 First-task blur and reveal

- **CP-046** Before the test starts, the task stream MUST be visually obscured so that no task can be
  read. Implementation: `#tasks` carries class `preStart`, styled identically to monkeytype's
  existing blur rule (`frontend/src/styles/test.scss` line 237:
  `&.blurred { opacity: 0.25; filter: blur(4px); }`) — `preStart` MUST be a **separate** class with
  the same declarations, so it composes independently with the out-of-focus `blurred` class and each
  can be asserted in isolation.
- **CP-047 (ASSUMPTION — read §9.1)** The blur MUST cover the **whole** task stream, not only the
  first task. The brief says "THE FIRST TASK MUST BE BLURRED until you start", and gives the reason
  "so you don't get an advantage by pre-reading it". Blurring only `.task[data-taskindex="0"]` would
  leave tasks 1..n readable and the stated advantage fully intact. Blurring the whole stream is a
  strict superset that satisfies the literal wording and actually delivers the stated intent. If the
  literal reading is later preferred, the change is one selector (`#tasks.preStart` →
  `#tasks.preStart .task[data-taskindex="0"]`).
- **CP-048** While `preStart` is active, a centred hint MUST be rendered over the blurred stream
  reading `type a digit to start`. The original copy `press any key to start` was **false as specified**
  — CP-050 requires that Tab, Escape, Enter, Space, arrows, function keys, modifiers, clicks and focus
  changes all do nothing — and is corrected here (master §2.31). The hint names the common case; per
  CP-049 any accepted answer character (CP-055, i.e. also `-`, `.`, `,`, `/`) starts the test. Rendered using the layout of
  `frontend/src/ts/components/pages/test/OutOfFocusWarning.tsx` (absolutely positioned, full width,
  `place-content-center items-center`, `select-none`, `pointer-events-none`) with icon
  `ph:keyboard-bold`. Without it, a fully blurred screen gives the user no affordance.
- **CP-049** The reveal MUST be triggered by the **same event that starts the test and the timer** —
  the first accepted input character. Accepted characters are defined in CP-053. This ordering is
  mandatory: the clock MUST NOT be startable without the tasks becoming legible, and the tasks MUST
  NOT become legible before the clock starts.
- **CP-050** The following MUST NOT reveal the stream and MUST NOT start the test: `Tab`, `Escape`,
  `Enter`, `Space`, arrow keys, function keys, any bare modifier, any keyboard shortcut, mouse
  movement, clicking the page, focusing the window, opening/closing any modal.
- **CP-051** The reveal MUST animate: the `preStart` class is removed with a `0.25s` transition on
  `filter` and `opacity`, mirroring how `test-ui.ts` lines 97–103 set `transition: "0.25s"` before
  adding the blur class. The hint from CP-048 MUST fade out over the same 0.25 s.
- **CP-052** Restarting the test (restart button, `Tab`, quick-restart hotkey, changing any setting,
  clicking the logo or the test nav item) MUST re-apply `preStart` and re-hide the stream. A test is
  never resumed half-revealed.

### 2.5 Input capture

- **CP-053** Keyboard capture MUST continue to go through a single hidden `<textarea>`
  (`#tasksInput`, the renamed `#wordsInput` from `test.html` lines 26–42) with all of monkeytype's
  anti-interference attributes preserved: `autocomplete="off"`, `autocapitalize="none"`,
  `autocorrect="off"`, `spellcheck="false"`, `data-gramm="false"`, `data-1p-ignore`,
  `data-lpignore="true"`, `data-form-type="other"`.
- **CP-054** `#tasksInput` MUST additionally set `inputmode="decimal"` so that mobile browsers open a
  numeric keypad instead of a full keyboard. **Consequence, and why CP-191 exists:** the iOS/Android
  decimal keypad offers digits and a decimal separator only — no `/` and no `-`. Since fraction addition,
  fraction multiplication and negatives are all ON by default (SB-110), `inputmode="decimal"` alone makes
  the *default* configuration unplayable on a phone. `inputmode` MUST NOT be changed to `"text"` (that
  re-opens the full alphabetic keyboard, which CP-060's rationale rejects); the missing glyphs MUST be
  supplied by the symbol row of CP-191 … CP-196.
- **CP-055** Accepted answer characters MUST be exactly: `0`–`9`, `-` (minus / U+002D, also accept
  U+2212), `.`, `,`, `/`. Every other printable character MUST be ignored (no letter appended, no
  error counted). The buffer MUST additionally be capped at **16 characters** total, further keystrokes
  being ignored — this is ME-151, restated here because the input filter is the only place it can be
  enforced (master §2.31, gap 21).
- **CP-056** `,` MUST be normalised to `.` on input. **ASSUMPTION**: the brief is German-language in
  origin, where `,` is the decimal separator; accepting both and normalising avoids punishing either
  habit. The rendered `<letter>` MUST show `.` after normalisation, so what is on screen is what will
  be evaluated.
- **CP-057** A leading `-` MUST be accepted only as the first character of an answer. `-` typed later
  MUST be ignored.
- **CP-058** At most one `.` and at most one `/` MUST be accepted per answer. A `/` MUST be accepted
  only when at least one digit precedes it, and — per master C32 — a `.` MUST likewise be accepted only
  when at least one digit precedes it (a leading `.` keystroke is silently ignored).
- **CP-058a (added by master C32-extended, gap 21)** **Commit-time normalisation.** Because CP-055–CP-058
  accept `5.`, `1/` and a bare `-` into the buffer while ME-143's grammar judges all three incorrect, the
  buffer MUST be normalised at commit, before judging: strip a single trailing `.` or `,`, strip a single
  trailing `/`, and strip a lone `-` that is not followed by a digit. If the normalised buffer contains no
  digit, the commit MUST be a **no-op** under ME-141 — it MUST NOT advance, MUST NOT count as correct and
  MUST NOT count as wrong. Judging (ME-143 … ME-147) then runs on the normalised buffer, so `5.` is judged
  as `5`. Rationale: identical to the C32 rationale — a user must never be marked wrong for a value they
  meant correctly, and a user who has typed only a sign or a trailing operator has not answered at all.
- **CP-059** `Backspace` MUST delete the last character of the current answer (and `Ctrl`/`Alt` +
  `Backspace` MUST clear the whole current answer, matching monkeytype's word-delete). Neither may
  cross a task boundary (CP-042).

### 2.6 What replaces monkeytype's on-screen keyboard

- **CP-060 (recommendation, normative)** The on-screen keymap MUST be **removed entirely**, not
  replaced. Files to delete: `frontend/src/ts/components/pages/test/Keymap.tsx`,
  `keymapConverter.ts`, `keymapLayouts.ts`; the `<mount data-component="keymap">` in
  `frontend/src/html/pages/test.html` line 50; the keymap section of
  `frontend/src/styles/test.scss`; the configs `keymapMode`, `keymapStyle`, `keymapLegendStyle`,
  `keymapLayout`, `keymapShowTopRow`, `keymapSize` and their settings-page entries
  (`frontend/src/ts/components/pages/settings/custom-setting/KeymapLayout.tsx`, `KeymapSize.tsx`);
  the layout data under `frontend/static/layouts/` and
  `frontend/src/ts/constants/layouts.ts`; `frontend/src/ts/test/layout-emulator.ts`.
  Rationale: (a) the keymap exists to train finger placement on a specific keyboard layout, which has
  no analogue when the input alphabet is ten digits and three symbols; (b) digits sit on the number
  row or the numpad, both of which are layout-invariant, so a keymap teaches nothing; (c) it is the
  single largest block of dead weight on the test page (294 lines of component + two data modules +
  the whole `layouts` static payload + 6 config keys).
- **CP-061** A numpad hint (the alternative offered in the brief) MUST NOT be built now. It is
  recorded as a deferred idea: a small 3×4 numpad diagram under the task stream that flashes the
  pressed key. Rejected for v1 because it re-introduces exactly the visual weight CP-060 removes and
  serves only first-time numpad users. Anyone reinstating it MUST re-open this requirement.
  **Note (gap 9):** CP-061 defers a *decorative* affordance for desktop numpad users. It does NOT cover
  mobile answer entry, which is a functional necessity and is specified in CP-191 … CP-196 below.

### 2.6a Mobile answer entry — the symbol row (added by the master document, gap 9)

Mobile is **in scope for v1**: CP-180 already requires an interactive 320 px render, and SB-165 … SB-168
already specify the mobile settings bar. But `inputmode="decimal"` (CP-054) yields a keypad with no `/`
and no `-`, while `fractionAddition`, `fractionMultiplication` and `negatives` are all ON by default
(SB-110) — so without the following the shipped default configuration cannot be played on a phone at all.

- **CP-191** Below the `md` breakpoint (849 px, the same `--breakpoint-md` SB-165 uses), a **symbol row**
  MUST be rendered directly beneath the task stream and above `#restartTestButton`, as
  `<div id="answerSymbols">`: a `flex justify-center gap-2` row of `text`-variant buttons using the same
  `Button.tsx` styling as the settings bar, so it reads as part of monkeytype's chrome rather than a
  bolt-on. At and above `md` the row MUST NOT be rendered at all (not merely hidden).
- **CP-192** The row MUST contain **only the glyphs the current configuration can actually need**, in this
  fixed order, each rendered only when its condition holds:
  | button | label | rendered when |
  |---|---|---|
  | minus | `−` (U+2212, per CP-033) | `negatives === true` |
  | decimal point | `.` | `decimals === true` |
  | slash | `/` | `fractionAddition !== "off"` **or** `fractionMultiplication === true` |
  When no condition holds the row MUST NOT be rendered. The row MUST re-evaluate reactively on any config
  change, like every other bar-driven surface.
- **CP-193** Pressing a symbol button MUST feed the character through **exactly the same path** as a
  physical keystroke — the CP-055 … CP-058 filter, the 16-character cap, the `<letter>` rendering (CP-032)
  and the caret update (CP-067) — and MUST NOT bypass any of them. In particular a `/` press is ignored
  when no digit precedes it, exactly as a typed `/` is.
- **CP-194** The buttons MUST NOT take focus away from `#tasksInput`: each MUST call `preventDefault()` on
  `pointerdown`/`mousedown` and MUST re-assert focus on `#tasksInput` afterwards, so the on-screen keypad
  does not close mid-answer. `tabindex="-1"` MUST NOT be used — CP-183's keyboard-reachability rule still
  applies (a desktop user never sees the row, but assistive technology on a small viewport must).
- **CP-195** A symbol press is an accepted input character, so per CP-049 it MUST start the test and lift
  the pre-start blur exactly as a typed digit does. The row itself MUST remain interactive while
  `preStart` is active and MUST NOT be blurred — it is chrome, not task content.
- **CP-196** Each button MUST carry an `aria-label` naming the character in words (`minus`,
  `decimal point`, `fraction slash`) and MUST have a minimum 44 × 44 px hit target. CP-180's
  no-horizontal-scrollbar assertion at 320 px MUST be re-checked with the row present and all three
  buttons visible.
- **CP-062** The typing monkey (`frontend/src/ts/components/pages/test/Monkey.tsx`, the
  `frontend/static/images/monkey/*.png` assets, `frontend/src/ts/states/monkey.ts` and the
  `monkey` / `monkeyPowerLevel` configs) MUST be removed. It is monkeytype branding keyed to WPM
  thresholds (`MIN_WPM = 130`, `MAX_WPM = 180`, `Monkey.tsx` lines 8–9) and has no meaning here.
  A crocodile equivalent is explicitly **out of scope** for v1.
- **CP-063** `CapsWarning.tsx` MUST be removed: caps lock cannot affect digit input.
- **CP-064** `CompositionDisplay.tsx` and the IME composition state
  (`frontend/src/ts/legacy-states/composition.ts`, the `compositionupdate`/`compositionend`
  handling) MUST be removed: numeric input is never IME-composed.
- **CP-065** `Premid.tsx` (Discord rich presence) MUST be removed — discord integration is deferred.
- **CP-066** All language/text machinery MUST be removed from the test page: `test-words.ts`,
  `wordset.ts`, `words-generator.ts`, `british-english.ts`, `english-punctuation.ts`, `lazy-mode.ts`,
  `poetry.ts`, `wikipedia.ts`, `custom-text.ts`, `quotes-controller.ts`, `break-joining.ts`,
  `weak-spot.ts`, `tts.ts`, the whole `frontend/src/ts/test/funbox/` tree, `frontend/static/quotes/`,
  `frontend/static/languages/`, `frontend/static/funbox/`. They are replaced by the task generator
  owned by the task-generation requirements.

### 2.7 Caret

- **CP-067** The caret MUST remain a single absolutely positioned `#caret` element driven by the
  `Caret` class in `frontend/src/ts/elements/caret.ts` via `frontend/src/ts/test/caret.ts`. The
  `goTo({ wordIndex, letterIndex, … })` API MUST be renamed to `goTo({ taskIndex, charIndex, … })`
  with identical semantics.
- **CP-068** The caret MUST sit immediately after the last typed character of the active task's
  `.answer`; when the answer is empty it MUST sit immediately after the ` = ` of the prompt.
- **CP-069** Caret shape options MUST be kept: `off`, `default` (0.1em bar), `block` (0.5em),
  `outline`, `underline` — all already defined in `frontend/src/styles/caret.scss` lines 22–85. The
  `carrot`, `banana` and `monkey` image carets MUST be removed together with
  `frontend/static/images/caret/*.png`.
- **CP-070** The caret MUST keep `smoothCaret` (animated movement) and the
  `caretFlashSmooth 1s infinite` blink, and MUST stop blinking while the user is typing —
  `Caret.startBlinking()` / `stopBlinking()` behaviour preserved.
- **CP-071** The pace caret (`#paceCaret`, `frontend/src/ts/test/pace-caret.ts`) MUST be removed.
  Rationale: it interpolates a per-character target position from a target WPM; with explicit-submit
  task granularity there is no per-character position to interpolate to. A pace indicator MAY later
  return as a target-score line on the live stats, but not as a caret.
- **CP-072** The RTL / joining-script caret handling (`isLanguageRightToLeft`,
  `isDirectionReversed`, `#words.rightToLeftTest`, `#words.joiningScript`) MUST be removed: all
  tasks are LTR arithmetic.

### 2.8 Live timer and live stats

- **CP-073** The test MUST be time-limited only. Durations are 1, 2, 4 and 8 minutes, i.e. 60, 120,
  240 and 480 seconds. There is no word-count mode, no quote mode, no zen mode, no custom mode; the
  branches for those in `frontend/src/ts/states/live-stats.ts` (lines 19–54, 107–120) MUST be
  deleted, leaving only the time-limited path.
- **CP-074** The timer MUST count **down** from the configured duration and MUST be formatted with
  `secondsToString` from `frontend/src/ts/utils/date-and-time.ts` (already used at
  `live-stats.ts` line 111), which yields `m:ss` above 60 s — e.g. `8:00`, `7:59`, `0:09`.
- **CP-075** The timer MUST start on the first accepted input character (CP-049) and MUST NOT start
  on page load, focus, or restart.
- **CP-076** All four `timerStyle` presentations MUST be kept and MUST keep their current behaviour:
  - `bar` — the fixed full-width progress bar at the top of the viewport
    (`frontend/src/ts/components/pages/test/live-stats/BarTimerProgress.tsx`,
    `fixed top-0 left-0 h-2 w-screen`), driven by `getBarTarget()` in `live-stats.ts` lines 56–72
    (`width: ${100 - ((seconds + 1) / limit) * 100}vw`, `duration: 1000`, `ease: "linear"`);
  - `text` — large centred text above the stream (`LiveStatsTextTop.tsx`);
  - `mini` — small text at the left of the stream (`LiveStatsMini.tsx`);
  - `flash_mini` / `flash_text` — same, but only visible every 15 s
    (`isTimerFlashHidden()`, `live-stats.ts` lines 125–131).
- **CP-077** The `timerOpacity` and `timerColor` configs MUST be kept and MUST keep applying to all
  timer presentations.
- **CP-078** Live stats MUST show, while the test is running and focused: the timer, live **acc**,
  and live **tpm**. Mapping from monkeytype: `liveSpeedStyle` → live tpm (replacing wpm),
  `liveAccStyle` → live acc (unchanged), `liveBurstStyle` → **removed** (burst is per-word
  instantaneous speed and has no useful analogue at task granularity).
- **CP-079** Live tpm MUST be computed as `answeredTasks / (elapsedSeconds / 60)` and displayed as an
  integer (no decimals), matching how `getLiveSpeedText()` formats with
  `{ showDecimalPlaces: false }` (`live-stats.ts` lines 92–97).
- **CP-080** Live acc MUST be `floor(correct / answered * 100)` and display as `NN%`, matching
  `getLiveAccText()` (`live-stats.ts` lines 98–101). With zero answered tasks it MUST show `100%`.
- **CP-081** Live stats MUST be visible only while `isTestActive() && getFocus()`
  (`showLiveStats`, `live-stats.ts` line 91) — unchanged.
- **CP-082** The modes notice above the stream
  (`frontend/src/ts/components/pages/test/modes-notice/`) MUST be kept and MUST show, at minimum:
  the active PB for the current settings (`PbNotice`) and the account average
  (`AverageNotice`). Quote-, funbox-, language- and layout-related notices MUST be removed.

### 2.9 Out-of-focus behaviour

- **CP-083** The out-of-focus warning MUST be kept unchanged in behaviour: after 1 s of lost focus
  (`setTestFocusState` timeout, `frontend/src/ts/states/test.ts` lines 40–54) `#tasks` gains
  `blurred` and the centred message appears — `Click here or press any key to focus` when the page
  lost focus, `Click anywhere to focus the window` when the window did
  (`OutOfFocusWarning.tsx` lines 11–14).
- **CP-084** The out-of-focus blur and the pre-start blur MUST be independent classes (CP-046). When
  both apply the stream MUST NOT be double-blurred to the point of an 8 px radius; the `preStart`
  rule MUST win and the composed result MUST equal a single 4 px blur.
- **CP-085** Regaining focus MUST NOT reveal a `preStart` stream (restatement of CP-050 for this
  path, listed separately so it is tested separately).

### 2.10 Restart button and restart paths

- **CP-086** `#restartTestButton` MUST be kept exactly where `test.html` lines 53–60 put it —
  centred, directly below the task stream — as a `text`-variant button with
  `aria-label="Restart Test"`, `data-balloon-pos="down"` and icon
  `ph:arrow-counter-clockwise-bold`.
- **CP-087** The quick-restart hotkey MUST be kept and MUST remain user-configurable
  (`hotkeys.quickRestart`, default `Tab`, with the `tab > enter` fallback rendering in
  `frontend/src/ts/components/hotkeys/QuickRestartHotkey.tsx`).
- **CP-088** Restart MUST: reset the timer to the full duration, discard all committed tasks,
  generate a fresh task stream, re-apply `preStart` (CP-052), reset the caret to task 0 / char 0
  (`Caret.resetPosition()`), and record the abandoned run as an incomplete test
  (`pushIncompleteTest`, `frontend/src/ts/states/test.ts` lines 73–83).
- **CP-089** "Repeat test" (same task set) MUST be supported and MUST reproduce the identical task
  sequence. This requires the generator to be seeded and the seed to be stored on the result.

---

## 3. Results page

Reference: `frontend/src/html/pages/test-result.html`, `frontend/src/ts/test/result.ts`,
`frontend/src/ts/controllers/chart-controller.ts`, `frontend/src/styles/test.scss` lines 609+.

### 3.1 Layout

- **CP-090** The results block MUST keep the grid from `frontend/src/styles/test.scss` lines
  625–635: `#result .wrapper { display:grid; grid-template-columns: auto 1fr;
  grid-template-areas: "stats chart" "morestats morestats"; gap: 1rem; }`.
- **CP-091** The left `.stats` column MUST contain, top to bottom, exactly three groups:
  1. `.group.score` — the main metric;
  2. `.group.correctwrong` — correct and wrong side by side;
  3. `.group.acc` — accuracy.
- **CP-092** `.group.score` MUST render `score` as the small `.top` label and the value as the large
  `.bottom`, in the same typographic scale monkeytype uses for `wpm`.
- **CP-093** `.group.correctwrong` MUST be a two-column sub-grid rendering
  `correct` over its value and `wrong` over its value, adjacent, in the smaller morestats scale.
  This is the brief's "below that number, display correct and wrong next to each other".
- **CP-094** `.group.acc` MUST keep monkeytype's `acc` label and `NN%` presentation
  (`test-result.html` lines 23–26).
- **CP-095** The PB crown element (`test-result.html` lines 9–19: `.crown` with its four state icons
  and balloon tooltip) MUST be kept, attached to `.group.score`, since PB is now measured in score.
- **CP-096** The `.stats.morestats` row MUST contain, in order: `test type`, `tpm`, `tasks`,
  `avg time`, `consistency`, `time`, and the (hidden-by-default) `daily leaderboard` group.
- **CP-097** The `source`, `raw`, and `characters`/`key` groups from `test-result.html`
  (lines 57–71, 102–132) MUST be removed: there is no quote source, no raw WPM and no character
  counting in a math trainer.
- **CP-098** The `tags` sub-block inside `.group.testType` (`test-result.html` lines 32–47) MUST be
  kept, including the edit-tags button that opens the `EditResultTags` modal.
- **CP-099** `test type` MUST render as two lines: line 1 `time <minutes>`, line 2 a
  space-separated list of the enabled generators in fixed order using their settings-bar short
  labels, e.g. `+1000 100x100 xxx/xx +1/xx *x/y 4.2 -`. Disabled generators MUST be omitted.
- **CP-100** Every `.bottom` value that is rounded for display MUST keep monkeytype's hover-tooltip
  behaviour showing the unrounded value (`aria-label` + `data-balloon-pos="up"`, as
  `result.ts` lines 353–397 do for wpm/raw/acc).

### 3.2 Metric definitions (all normative, all testable)

Let `answered` = number of committed tasks (CP-037/CP-038), `correct` = committed tasks where
`isAnswerCorrect` returned true, `wrong = answered − correct`, `durationSeconds` = the configured
test duration in seconds, `t_i` = wall-clock seconds between the commit of task `i−1` (or test
start, for `i = 0`) and the commit of task `i`.

- **CP-101** `score = correct − wrong`. Integer. MUST be displayed without a `+` sign when positive
  and with a `−` sign when negative. `score` MAY be negative and the UI MUST render negative values
  without layout shift.
- **CP-102** `correct` and `wrong` MUST be displayed as plain integers.
- **CP-103** `acc = correct / answered × 100`, rounded to 2 decimal places for the tooltip and
  displayed rounded to a whole number followed by `%`. When `answered = 0`, `acc` MUST display `-`
  (not `0%` and not `100%`), because accuracy over zero attempts is undefined.
- **CP-104** `tpm = answered / (durationSeconds / 60)`, i.e. **responses per minute including wrong
  ones** — this is the brief's "how many responses you made per minute". Displayed rounded to 2
  decimal places; tooltip shows the unrounded value.
- **CP-105** `tasks` MUST display `answered` as a single integer, with a tooltip breaking it down as
  `correct / wrong`.
- **CP-106** `avg time` = `durationSeconds / answered`, displayed in seconds with one decimal (e.g.
  `4.7s`). When `answered = 0` it MUST display `-`.
- **CP-107** `consistency` MUST be defined as `100 × (1 − CV)` clamped to `[0, 100]`, where `CV` is
  the coefficient of variation (standard deviation ÷ mean) of the per-task times `t_i`. This is the
  direct analogue of monkeytype's definition, which the about page states as "based on the variance
  of your raw wpm … using the coefficient of variation … mapped onto a scale from 0 to 100"
  (`frontend/src/ts/components/pages/AboutPage.tsx` lines 248–253). Displayed as a whole-number
  percentage. Requires fewer than 2 answered tasks → display `-`.
- **CP-108** `time` MUST keep monkeytype's presentation (`test-result.html` lines 80–87): the main
  duration text, an `.afk` sub-line, and a `.timeToday` sub-line. Per master C37 the naming is fixed as:
  persisted field **`afkDuration`** (whole seconds, monkeytype's own field name, kept unchanged by
  INV-033), CSS class `.afk`, DOM hook `data-afk` (CP-188), CSV column `afkDuration` (AC-100), and the
  **user-visible label `idle`**. `afkDuration` = number of whole seconds during the test in which no
  accepted input character was received, shown as `NNs idle` when greater than zero. The spellings
  `idleDuration` (AC-026, AC-100) and a user-visible `afk` are struck; no other spelling may appear.
- **CP-109** A test with `answered = 0` MUST be marked invalid, MUST NOT be saved, MUST NOT count
  toward PBs or leaderboards, and MUST show the standard "test invalid" notice.
- **CP-110** A personal best MUST be defined as the highest `score` for the exact combination of
  (duration, enabled generators). PB comparison MUST NOT mix different generator sets.

### 3.3 Chart

The chart is chart.js, instantiated once in
`frontend/src/ts/controllers/chart-controller.ts` (lines 106+, `export const result = new
ChartWithUpdateColors<...>(document.querySelector("#wpmChart"), {...})`) against the canvas
`#wpmChart` in `test-result.html` line 163, with `chartjs-plugin-annotation` and
`chartjs-plugin-trendline` registered at lines 34–49.

- **CP-111** chart.js MUST be kept as the charting library; the `ChartWithUpdateColors` wrapper and
  its `updateColors(theme)` theme-reactivity MUST be kept unchanged (it is what makes the chart
  re-colour when a theme is picked).
- **CP-112** The canvas MUST be renamed `#wpmChart` → `#resultChart`, and all selectors updated.
- **CP-113** The **x axis** MUST stay time: `axis: "x"`, `ticks: { autoSkip: true,
  autoSkipPadding: 20 }`, title text `Seconds`. One data point per elapsed second, exactly as
  monkeytype does.
- **CP-114** The **primary left y axis** MUST become `score`: cumulative `correct − wrong` after each
  second. Solid line, `borderWidth: 3`, `pointRadius: 1`, `order: 2`, axis title `Score`,
  `display: true`. Rationale: monkeytype's primary line is the metric the result is judged by (wpm)
  and the PB annotation sits on it; croco calc is judged by score, so score takes that slot and the
  PB line stays meaningful — you can see the second at which you crossed your personal best.
- **CP-115** A **secondary left y axis** `tpm` MUST carry the running-average tasks-per-minute line:
  dashed (`borderDash: [8, 8]`), `borderWidth: 2`, `pointRadius: 0`, `display: false` by default,
  title `Tasks per Minute` — the structural analogue of monkeytype's `raw` axis
  (`chart-controller.ts` lines 209–224).
- **CP-116** The **right y axis** MUST become `wrong`: a `scatter` dataset with
  `pointStyle: "crossRot"`, `position: "right"`, `beginAtZero: true`, `ticks: { precision: 0 }`,
  title `Wrong`, plotting the number of wrong answers committed in each second. Point radius MUST be
  0 when the value is ≤ 0 and 3 otherwise (5 on hover), copying `chart-controller.ts` lines 154–165.
- **CP-117** monkeytype's `burst` dataset and axis (`chart-controller.ts` lines 166–176, 229–241)
  MUST be removed.
- **CP-118** The PB annotation line MUST be kept, drawn on the `score` scale, using the same
  `chartjs-plugin-annotation` line + label configuration monkeytype uses for `pb` and `tpb`
  (`result.ts` lines 729–757). Label content becomes `PB: <score>` and `<tag> PB: <score>`.
- **CP-119** The `.chartLegend` button row (`test-result.html` lines 135–161) MUST become exactly
  five buttons with these `data-id`s and labels:
  `scale` (`ph:chart-line-bold`, "scale"), `pb` (`ph:crown-bold`, "pb"),
  `tagPbLine` (`ph:tag-bold`, "tag pb"), `tpm` (dashed line swatch, "tpm"),
  `wrong` (`ph:x-bold`, "wrong"). The `raw` and `burst` buttons are gone.
- **CP-120** The `scale` legend button MUST keep its existing meaning — it toggles the
  `startGraphsAtZero` config (`result.ts` line 1310) — and that config MUST keep applying to both the
  `score` and `tpm` axes.
- **CP-121** The chart tooltip MUST stay `mode: "index", intersect: false` with a 250 ms animation
  (`chart-controller.ts` lines 265–269). monkeytype's `afterLabel` callback, which highlights the
  words typed in that second (`result.ts` / `elements/result-word-highlight.ts`), MUST be adapted to
  highlight the **tasks committed in that second** in the task-history list (CP-126).

### 3.4 Bottom action row

Reference: `test-result.html` lines 233–298.

- **CP-122** The action row MUST be a centred `grid-auto-flow: column` row of `text`-variant icon
  buttons with `data-balloon-pos="down"` tooltips, spanning both grid columns
  (`test.scss` lines 651–657) — unchanged structurally.
- **CP-123** The row MUST contain exactly these five buttons, in this order:
  1. `next test` — `ph:caret-right-bold`, starts a fresh test with a new task set;
  2. `repeat test` — `ph:arrows-clockwise-bold`, replays the identical task set (CP-089);
  3. `practise mistakes` — `ph:warning-bold`, starts a test built only from the generator kinds the
     user got wrong in this run (replaces monkeytype's "practice words");
  4. `toggle task history` — `ph:list-bullets-bold`, shows/hides the per-task list (CP-126);
  5. `copy screenshot` — `ph:image-bold`, tooltip
     `Copy screenshot to clipboard\n(shift click to download)` — behaviour unchanged from
     `frontend/src/ts/test/test-screenshot.ts`.
- **CP-124** The `watch replay` button and the whole replay subsystem
  (`test-result.html` lines 210–228, `frontend/src/ts/test/replay-ui.ts`, `#replayWords`,
  `#replayWordsWrapper`, `#replayStats`) MUST be removed. Rationale: the replay reconstructs a
  keystroke-by-keystroke typing animation; with explicit-submit numeric answers there is nothing to
  watch that the task history does not already show as static text.
- **CP-125** The commented-out `watch video ad` button (`test-result.html` lines 289–297) MUST be
  deleted rather than left commented (ads deferred, CP-006).
- **CP-126** The words-history block (`#resultWordsHistory`) MUST become `#resultTaskHistory` and
  MUST list every committed task as `<prompt> = <your answer>`, with wrong entries coloured
  `--error-color` and annotated with the correct answer. The `copy list` and
  `copy missed list` text buttons MUST be kept (copying the task list / the wrong tasks as plain
  text). The burst heatmap toggle and its legend (`test-result.html` lines 188–206) MUST be removed
  along with the burst metric (CP-117).
- **CP-127** The `loginTip` block (`test-result.html` lines 300–303) MUST be kept:
  `Sign in to save your result`, shown only when signed out.
- **CP-128** `#retrySavingResultButton` (line 229) MUST be kept.
- **CP-129** The screenshot watermark (`.ssWatermark`, line 304) MUST read the croco calc domain
  instead of `monkeytype.com`, sourced from the same build-time constant used elsewhere so it never
  drifts.
- **CP-130** The daily-leaderboard group (`test-result.html` lines 90–100) MUST be kept and MUST only
  appear when the run is actually eligible for a daily board — i.e. when **the full predicate** holds, not
  only the default-settings half: `result.settingsId === LEADERBOARD_SETTINGS_ID`
  **and** `result.mode2 === "4" || result.mode2 === "8"` (SB-175 as restated by master C31; AC-121.2/.3).
  Rendering the block for a default-settings 1- or 2-minute run would advertise a board that run can never
  enter. Both halves MUST be evaluated from the shared constant and the persisted `mode2`; neither may be
  re-derived per call site.
- **CP-131** The confetti on a new PB (`result.ts` lines 626–656, using `--main-color`,
  `--text-color`, `--sub-color`) MUST be kept.

---

## 4. Info / about page

Reference: `frontend/src/ts/components/pages/AboutPage.tsx`,
`frontend/src/ts/queries/public.ts`, `packages/contracts/src/public.ts`,
`frontend/src/ts/components/common/Headers.tsx`.

- **CP-132** The about page MUST keep its section order and heading hierarchy from `AboutPage.tsx`:
  credit line → global stats hero → distribution histogram → `H2 about` → `H3 task set` →
  `H3 keybinds` → `H3 stats` → `H3 results screen` → `H3 bug report or feature request` →
  `H2 support` → `H2 contact` → `H2 credits` → `H2 top supporters` → `H2 contributors`.
  Headings MUST use the existing `H2` / `H3` components (`Headers.tsx`), which render a leading icon
  at `text-sub` in a `2.25em` / `1em` scale.
- **CP-133** The credit line MUST read (three lines, centred, `text-sub`):
  `Created with love by Emil.` / `[Supported](#supporters_title) and [expanded](#contributors_title)
  by many awesome people.` / `Launched in 2026.` The anchor ids `#supporters_title` and
  `#contributors_title` MUST be kept so the in-page links keep working.
- **CP-134** The **global stats hero** MUST keep the three-up `sm:grid-cols-3` layout with, per cell,
  a `text-sub` title, a `text-5xl` primary number and a `text-xl` sub-unit
  (`AboutPage.tsx` lines 72–99). The three cells MUST be:
  1. `total tests started`;
  2. `total time training` (primary = whole years, sub = `years`, hover label = total hours);
  3. `total tests completed`.
  Numbers MUST be magnitude-abbreviated exactly as `getNumberWithMagnitude` does today
  (`queries/public.ts`, `fetchTypingStats`).
- **CP-135** The backing endpoint `GET /public/typingStats` (`packages/contracts/src/public.ts`)
  MUST be renamed `GET /public/trainingStats` returning `{ testsStarted, testsCompleted,
  timeTraining }`. The frontend query key `typingStats` MUST be renamed accordingly.
- **CP-136** The **distribution histogram** MUST keep the chart.js bar chart at a fixed `h-48`
  section (`AboutPage.tsx` lines 103–189) with: `minBarLength: 2`, bars coloured `getTheme().main`,
  y axis titled `Users`, `maintainAspectRatio: false`, `hover: { mode: "nearest", intersect: false }`,
  and the `afterLabel` tooltip callback that appends the `top N%` string.
- **CP-137** For croco calc the histogram MUST show the **distribution of personal-best scores of
  `time 8` leaderboard results**, bucketed in steps of 10 score points, x labels formatted
  `N - N+9`. The `language` query parameter MUST be removed from
  `GetSpeedHistogramQuerySchema` (the brief removes language from the leaderboard entirely); the
  endpoint MUST be renamed `GET /public/scoreHistogram` with query `{ time: 4 | 8 }` and the about
  page MUST request `time: 8`.
- **CP-138** The histogram caption MUST read
  `distribution of time 8 leaderboard results (score)` on line 1 and
  `<N> total results` on line 2, right-aligned, `text-xs text-sub` — same shape as
  `AboutPage.tsx` lines 181–185.
- **CP-139** The `about` section copy MUST be replaced with:
  > croco calc is a minimalistic and customizable mental-arithmetic trainer. It features eight
  > independent task generators — addition, multiplication, division, fraction addition, fraction
  > multiplication, decimals and negative numbers — an account system to save your score history,
  > and user-configurable features such as themes, sounds, a smooth caret, and more. croco calc keeps
  > the task prompts unobtrusive and shows your answer in place, so the only thing between you and
  > the next result is the arithmetic.
  >
  > Test yourself in various modes, track your progress and get faster.
- **CP-140** The `word set` section MUST become `task set` (icon `ph:function-bold`) and MUST
  explain, in one paragraph each, what the eight settings-bar controls generate, including that
  divisions never have a remainder, that fraction numerators are always smaller than their
  denominators, that decimal tasks are ordinary tasks with the decimal point shifted, and that
  negative numbers make exactly one operand negative with 50% probability. Exact generator semantics
  MUST be copied from the task-generation requirements document — this section MUST NOT introduce new
  rules.
- **CP-141** The `keybinds` section MUST read: `You can use <QuickRestartHotkey /> to restart the
  test. Open the command line by pressing <CommandlineHotkey /> — there you can access all the
  functionality you need without touching your mouse.` It MUST keep rendering the live hotkey
  components (`QuickRestartHotkey.tsx`, `CommandlineHotkey.tsx`) rather than hard-coded key names, so
  the text follows the user's configured keys.
- **CP-142** The `stats` section MUST be a `<dl>` (two-column grid, as `AboutPage.tsx` lines 226–254)
  defining **every** results metric, with wording matching §3.2 exactly:
  - `score` — correct tasks minus wrong tasks. Can be negative.
  - `correct` — number of tasks you answered correctly.
  - `wrong` — number of tasks you answered incorrectly.
  - `acc` — percentage of your answers that were correct.
  - `tpm` — tasks per minute: every answer you submitted, right or wrong, divided by the length of
    the test in minutes.
  - `tasks` — total number of answers you submitted.
  - `avg time` — average number of seconds per answer.
  - `consistency` — based on the variance of your per-task answer times. Closer to 100% is better.
    Calculated using the coefficient of variation of those times and mapped onto a scale from 0 to 100.
  - `afk` — seconds during the test in which you pressed no key.
- **CP-143** The `results screen` section MUST read:
  > After completing a test you will be able to see your score, correct and wrong counts, accuracy,
  > tasks per minute, consistency, test length, leaderboard info and test info (you can hover over
  > some values to get exact numbers). You can also see a graph of your score over the duration of
  > the test, with a marker for every task you got wrong. Remember that the score line is cumulative,
  > while the tasks-per-minute line is a running average.
- **CP-144** The `bug report or feature request` section MUST read:
  `If you encounter a bug, or have a feature request - send me an email or create an issue on
  GitHub.` (Discord is not offered here while discord integration is deferred.)
- **CP-145** The `support` section MUST keep its paragraph and its single full-width `p-8` button
  that opens the Support modal (`AboutPage.tsx` lines 278–294).
- **CP-146** The `contact` section MUST keep the responsive button grid but drop the twitter button,
  leaving three buttons — `mail` (opens the Contact modal), `discord`, `github` — and the grid MUST
  become `sm:grid-cols-2 lg:grid-cols-3`. The discord button MUST honour CP-017.
- **CP-147** The `credits` section MUST credit, at minimum: monkeytype and its authors for the design
  and the codebase croco calc is adapted from (with a link to
  `https://github.com/monkeytypegame/monkeytype`), the supporters anchor, and the contributors link
  pointing at the croco calc repository's contributor graph. The monkeytype credit is mandatory —
  this project is a direct adaptation of a GPL-licensed codebase.
- **CP-148** `top supporters` and `contributors` MUST keep their `AsyncContent` + auto-fill grid
  rendering (`repeat(auto-fill, minmax(13em, 1fr))`, `AboutPage.tsx` lines 380–422), backed by
  `frontend/static/supporters.json` and `frontend/static/contributors.json`. Both files MUST be
  emptied to `[]` at launch rather than deleted, so the sections render empty instead of erroring.
- **CP-149** All four about-page queries MUST keep their `enabled: getActivePage() === "about"` gate
  and their one-hour `staleTime` (`queries/public.ts` line 24), so opening the page does not hammer
  the backend.
- **CP-150** Query failures MUST surface through the existing `AsyncContent` error messages, reworded
  to `Failed to get global stats` and `Failed to get global score distribution`.

---

## 5. Contact modal

Reference: `frontend/src/ts/components/modals/ContactModal.tsx`,
`frontend/src/ts/components/common/AnimatedModal.tsx`, `frontend/src/ts/states/modals.ts`.

- **CP-151** The modal MUST be an `AnimatedModal` with `id="Contact"`, `title="Contact"`,
  `modalClass="max-w-4xl"` — unchanged from `ContactModal.tsx` line 10.
- **CP-152** It MUST keep the `AnimatedModal` behaviours: 125 ms show/hide animation, close on
  backdrop click, close on `Escape`, focus trapping, and registration in the `ModalId` union in
  `frontend/src/ts/states/modals.ts`.
- **CP-153** The intro copy MUST read:
  > Feel free to send an email to `<CONTACT_EMAIL>` (the buttons below will open your default mail
  > client).
  >
  > Please **do not send** requests to delete your account, update your email, update your name or
  > clear personal bests — you can do that on the [account settings](/account-settings) page.
  The "do not send" span MUST keep the `text-error` class and the account-settings link MUST keep
  pointing at `/account-settings`.
- **CP-154** The monkeytype business-inquiry sentence and the second `jack@monkeytype.com` address
  MUST be removed; croco calc has one address.
- **CP-155** The button grid MUST stay `mt-4 grid gap-4 md:grid-cols-2` with buttons using
  `gap-4 text-md p-4 text-lg justify-start`, and MUST contain exactly six buttons, each a `mailto:`
  link to `<CONTACT_EMAIL>` with the given subject prefix:
  | label | icon | subject |
  |---|---|---|
  | Question | `ph:question-bold` | `[Question] ` |
  | Feedback | `ph:chat-dots-bold` | `[Feedback] ` |
  | Bug Report | `ph:bug-bold` | `[Bug] ` |
  | Account Help | `ph:user-circle-bold` | `[Account] ` |
  | Business Inquiry | `ph:briefcase-bold` | `[Business] ` |
  | Other | `ph:dots-three-bold` | `[Other] ` |
- **CP-156** `<CONTACT_EMAIL>` MUST come from one build-time constant, not be inlined six times.
  **ASSUMPTION**: until a project address exists, it is `me@emilvinu.de` (see §10).

---

## 6. Support modal

Reference: `frontend/src/ts/components/modals/SupportModal.tsx`.

- **CP-157** The modal MUST be an `AnimatedModal` with `id="Support"`,
  `title="Support croco calc"`, `modalClass="max-w-4xl"`.
- **CP-158** The intro copy MUST read: `Thank you so much for thinking about supporting this project.
  It would not be possible without you and your continued support.` followed by a heart icon
  (`ph:heart-fill`), matching `SupportModal.tsx` lines 20–24.
- **CP-159** The **Buy Merch** button (`SupportModal.tsx` lines 63–73, linking to
  `https://monkeytype.store`) MUST be removed. This is an explicit instruction in the brief.
- **CP-160** The remaining three buttons MUST be kept in this order: `Enable Ads`
  (`ph:megaphone-bold`), `Donate` (`ph:hand-heart-bold`), `Join Patreon`
  (`simple-icons:patreon`). Button styling MUST stay
  `p-4 flex flex-col text-md h-full justify-center items-center` with icons at `size: 2`.
- **CP-161** The grid MUST become `grid-cols-1 xs:grid-cols-2 md:grid-cols-3` (down from
  `md:grid-cols-4`) so three buttons fill the row.
- **CP-162** Each of the three buttons MUST read its target from a single `SUPPORT_LINKS` constant
  (`{ ads: boolean, kofi: string | null, patreon: string | null }`). When a target is `null`/`false`
  the button MUST render **disabled** with tooltip `coming soon` rather than being hidden.
  Rationale: ads, ko-fi and patreon are all on the deferred list, but the brief says to mirror the
  reference modal and leave out only merch. Rendering them disabled satisfies both: the layout
  matches, and nothing links anywhere dead. Enabling them later is a one-line constant change.
- **CP-163** The `Enable Ads` button's click handler in the reference opens the commandline `ads`
  subgroup (`SupportModal.tsx` lines 28–31). Since ads are deferred, that subgroup MUST NOT exist and
  the button MUST therefore be disabled per CP-162.

---

## 7. Theme modal

References: `frontend/src/html/popups.html` (the `#commandLine` dialog, lines 50–78),
`frontend/src/ts/commandline/commandline.ts`, `frontend/src/ts/commandline/lists/themes.ts`,
`frontend/src/ts/components/pages/settings/custom-setting/Theme.tsx`,
`frontend/src/ts/constants/themes.ts`, `frontend/static/themes/*.css`.

Note on what "the theme modal" is in this codebase: in this monkeytype version the theme picker with
search and swatches is the **commandline dialog opened on the `themes` subgroup**. The footer theme
indicator opens it with `setCommandlineSubgroup("themes"); showModal("Commandline")`
(`ThemeIndicator.tsx` lines 30–34). A second, larger picker (a grid of theme buttons with swatches)
lives on the settings page (`custom-setting/Theme.tsx`). Both MUST be kept.

- **CP-164** All **52** theme CSS files under `frontend/static/themes/` MUST be kept **as-is,
  byte-for-byte**. Verified count: 52 files (`9009.css` … `trance.css`). They contain no monkeytype
  branding — a representative file (`dracula.css`) consists only of `[data-nav-item="…"]` colour
  rules — so there is nothing to rewrite, and rewriting them would only risk breaking them.
- **CP-165** The theme metadata module `frontend/src/ts/constants/themes.ts` (the `ThemeSchema` zod
  object with `bg`, `main`, `caret`, `sub`, `subAlt`, `text`, `error`, `errorExtra`,
  `colorfulError`, `colorfulErrorExtra`, `hasCss`, and the `themes` record) MUST be kept unchanged,
  as MUST the `ThemeName` union in `packages/schemas`.
- **CP-166** CP-005 (keeping `data-nav-item` values) is a hard prerequisite of CP-164 and MUST be
  verified together with it.
- **CP-167** The theme modal MUST be the `#commandLine` dialog markup from
  `frontend/src/html/popups.html`: a search icon, a checking spinner, a text input with placeholder
  `Type to search`, a warning row, and a `.suggestions` list.
- **CP-168** The search input MUST filter the theme list as the user types, using the existing
  commandline fuzzy matching. Filtering MUST be case-insensitive and MUST treat the underscore in
  theme names as a space (`replaceUnderscoresWithSpaces`, used at
  `commandline/lists/themes.ts` line 23: `display: theme.name.replace(/_/g, " ")`).
- **CP-169** Each row MUST show the theme name and **colour swatches**, rendered from the
  `customData: { main, bg, sub, text, isFavorite }` payload the theme commands already carry
  (`commandline/lists/themes.ts` lines 25–31). A row MUST be painted with that theme's `bg` as the
  row background and `main` as its text colour, plus three circular swatches for `main`, `sub`,
  `text` — matching the settings-page theme button (`custom-setting/Theme.tsx` lines 506–510).
- **CP-170** Hovering or keyboard-highlighting a row MUST **live-preview** the theme
  (`ThemeController.preview(theme.name)`, `lists/themes.ts` lines 32–35). Leaving the list or
  closing without selecting MUST revert to the previously active theme.
- **CP-171** Clicking a row or pressing `Enter` MUST commit via `setConfig("theme", name)`
  (`lists/themes.ts` lines 36–39), persist, and close the modal.
- **CP-172** Favourites MUST be supported: `favThemes` config, a star toggle per row, and favourites
  sorted to the top of the list (`sortThemesByFavorite`, `lists/themes.ts` lines 47–50). The footer
  theme indicator MUST keep showing a small star badge when the active theme is a favourite
  (`ThemeIndicator.tsx` lines 46–50).
- **CP-173** The theme list MUST rebuild automatically when `favThemes` changes — the existing
  `configEvent.subscribe` hook at `lists/themes.ts` lines 80–94 MUST be kept.
- **CP-174** The settings-page theme picker (`custom-setting/Theme.tsx`) MUST be kept in full,
  including: the `preset` / `custom` toggle, the favourites-first two-section preset grid
  (`grid-cols-[repeat(auto-fill,minmax(17rem,1fr))]`), theme buttons showing name + three swatches +
  a 4px active ring, the ten custom-colour pickers, `load from preset`, `share` (which encodes the
  theme into a `?customTheme=` base64 URL), and `save` / `save as new`.
- **CP-175** Themes MUST be sorted by background lightness on the settings page, using the existing
  `hexToHSL`-based sort (`custom-setting/Theme.tsx` lines 46–50).
- **CP-176** Applying a theme MUST propagate to the chart colours through the existing
  `ChartWithUpdateColors.updateColors(theme)` path (`chart-controller.ts` lines 84–88) — the results
  chart MUST re-colour without a reload.
- **CP-177** The `autoSwitchTheme`, `themeLight`, `themeDark` and `randomTheme` features MUST be
  kept; they are theme-only and carry no monkeytype specificity.

---

## 8. Cross-cutting acceptance criteria

- **CP-178** No user-visible string on any page owned by this document may contain the words
  `monkey`, `monkeytype`, `typing`, `wpm`, `words per minute`, `keyboard layout` or `quote`, except the
  mandatory monkeytype attribution in the credits section (CP-147).
  `word` / `words` and `character` / `characters` are banned as **whole words only**, and the following
  are explicitly **exempt**: `password`, `passwords`, `passwordless` — AC-170/AC-171 mandate the literal
  buttons `add password authentication`, `update password` and `remove password authentication`, and the
  login/register pages are unavoidably full of the word. Without this carve-out CP-178 and AC-170/AC-171
  are in direct contradiction (master §2.31, gap 16). A grep over `frontend/src` for these tokens outside
  of `docs/` MUST be part of the acceptance check, and its pattern MUST match this requirement exactly —
  DoD-07 in the master document is the normative form of that grep.
- **CP-179** No file listed for deletion in CP-006, CP-021, CP-060, CP-062–CP-066, CP-071, CP-117 or
  CP-124 may still exist in `frontend/src` or `frontend/static` at acceptance.
- **CP-180** The test page MUST render, interactively, at 320 px, 768 px, 1024 px and 1920 px widths
  with no horizontal scrollbar.
- **CP-181** All 52 themes MUST render the test page, the results page and the about page with no
  invisible text: every foreground/background pair used for a value or a label MUST meet WCAG AA
  contrast against its own theme background, or be inherited unchanged from monkeytype's own usage
  of the same CSS variables.
- **CP-182** The results chart, the about-page histogram and the theme picker swatches MUST all
  re-colour within one animation frame of a theme change.
- **CP-183** Every interactive element added or changed by this document MUST be reachable by keyboard
  and MUST have an accessible name (`aria-label` or visible text). The task stream itself MUST be
  `user-select: none` (as `#words` already is, `test.scss` line 92) but MUST NOT be hidden from
  screen readers — the active task's prompt MUST be exposed via an `aria-live="polite"` region so a
  screen-reader user hears the next task.
- **CP-184** The pre-start blur MUST also apply a `filter` to any screenshot taken before the test
  starts — i.e. the screenshot path MUST NOT bypass the blur. Rationale: otherwise the blur is
  trivially defeated.
- **CP-185** No requirement in this document may be satisfied by a config default alone; behaviours
  described as MUST are unconditional unless the requirement itself names a config key.

### 8.1 Test hooks (so later stages can verify mechanically)

- **CP-186** `#tasks` MUST carry `data-state` with value `preStart` | `running` | `finished`.
- **CP-187** Each `.task` MUST carry `data-taskindex`, and after commit `data-result="correct"` or
  `data-result="wrong"`.
- **CP-188** The results page MUST expose the computed metrics on `#result` as data attributes:
  `data-score`, `data-correct`, `data-wrong`, `data-acc`, `data-tpm`, `data-answered`,
  `data-consistency`, `data-afk`.
- **CP-189** The timer element MUST carry `data-seconds-remaining`.
- **CP-190** Every modal owned by this document MUST keep its `ModalId` string exactly: `Contact`,
  `Support`, `Commandline`.

---

## 9. Ambiguities, assumptions and decisions

Each item states the ambiguity, the chosen reading, and the requirement it lives in.

- **§9.1 — "the FIRST task must be blurred" (CP-047).** ASSUMPTION. Literal reading: blur only task
  index 0. Chosen reading: blur the entire stream before start. Reason: the brief gives its own
  rationale — "so you don't get an advantage by pre-reading it" — and blurring only task 0 leaves
  tasks 1..n readable, preserving the exact advantage the requirement exists to remove. The chosen
  reading is a superset of the literal one. Reversible in one selector.
- **§9.2 — Per-character feedback (CP-036).** ASSUMPTION. The brief says "identical to monkeytype's
  test page" but monkeytype colours each character right/wrong as you type. Doing that here would
  leak the answer digit by digit. Chosen: no feedback until submit. This is the one place where
  fidelity to monkeytype's *mechanics* had to yield to the product actually working; the *visual*
  design is unchanged.
- **§9.3 — Submit key (CP-037).** Not specified in the brief. Chosen: `Enter` and `Space` both
  commit.
- **§9.4 — Settings-bar grouping (CP-025).** Not specified. Chosen: three pills mirroring
  monkeytype's three-pill rhythm.
- **§9.5 — On-screen keyboard (CP-060/CP-061).** The brief asked for a recommendation. Chosen:
  remove, do not replace. The numpad-hint alternative is recorded as explicitly rejected for v1 with
  reasons, not silently dropped.
- **§9.6 — Chart primary axis (CP-114).** Not specified. Two candidates: tasks-per-minute (structural
  analogue of wpm) or cumulative score (analogue of "the metric you are judged by"). Chosen: score,
  because the PB annotation line — a feature monkeytype's chart is built around — is only meaningful
  on the axis the PB is measured in. tpm is kept as the secondary, legend-toggleable line.
- **§9.7 — Where tasks-per-minute goes on the results page (CP-096).** The brief says "also display
  tasks per minute" without placing it. Chosen: the `morestats` row, immediately after `test type`,
  because the left column is reserved by the brief for score / correct+wrong / accuracy.
- **§9.8 — Momentary vs averaged tpm (CP-115).** A per-second momentary tpm would be 0 or 60 for
  almost every second (a task takes 2–10 s), producing a useless square wave. Chosen: running
  average. If a momentary line is ever wanted it MUST use a sliding window of at least 10 s.
- **§9.9 — Decimal separator (CP-056).** Not specified. The brief is a translation from German.
  Chosen: accept `.` and `,`, normalise to `.`.
- **§9.10 — Consistency (CP-107).** monkeytype's consistency is the CV of raw wpm samples. There is
  no per-second speed here. Chosen: CV of per-task answer times, same 0–100 mapping. This keeps the
  metric's meaning ("were you steady?") while changing its input.
- **§9.11 — Support modal buttons (CP-162).** The brief says mirror the reference and leave out only
  merch, but ads, ko-fi and patreon are all on the deferred list. Chosen: render all three, disabled,
  behind one constant.
- **§9.12 — Discord in the footer and about page (CP-017, CP-146).** The brief lists discord in the
  footer while "discord integration" is deferred. Chosen: render the link, disabled, until a server
  exists.
- **§9.13 — Contact email (CP-156).** No project address is decided. Chosen placeholder:
  `me@emilvinu.de`, behind a constant. See §10.
- **§9.14 — Logo tagline (CP-010).** monkeytype's logo has a `monkey see` sub-text. No croco calc
  equivalent given. Chosen placeholder: `snap snap`. See §10.
- **§9.15 — Replay removal (CP-124).** Not mentioned in the brief either way. Chosen: remove, with
  the reasoning stated in the requirement, because the task-history list supersedes it.
- **§9.16 — Number of visible lines (CP-044).** Not specified. Chosen: 3, monkeytype's default.

## 10. Open items needing a human decision (blockers for final copy, not for build)

- **B-1** Contact email address for croco calc (CP-156). Placeholder `me@emilvinu.de` is in use.
- **B-2** Logo tagline / sub-text (CP-010). Placeholder `snap snap` is in use.
- **B-3** Discord server invite URL (CP-017, CP-146). Button ships disabled until provided.
- **B-4** ko-fi and patreon URLs (CP-162). Buttons ship disabled until provided.
- **B-5** Launch date string for the about page credit line (CP-133). Currently `Launched in 2026.`
- **B-6** The public domain used in the screenshot watermark (CP-129) depends on the chosen
  `workers.dev` subdomain, which the infra requirements own.
- **B-7** Whether `frontend/static/supporters.json` and `contributors.json` should be populated from
  the GitHub API instead of shipping empty (CP-148).
