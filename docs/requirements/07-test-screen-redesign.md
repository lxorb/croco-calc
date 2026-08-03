# 07 — In-run test screen redesign (one task at a time)

**Status:** authoritative for the in-run experience. Supersedes the rulings listed in §13 of this document
and recorded as **C45** in `docs/REQUIREMENTS.md` §2.
**Date:** 2026-08-03
**Requirement prefix:** `TR-` (**test redesign**). Range **TR-001 … TR-262**, contiguous, no gaps, no
duplicates.
**Owner work package:** WP-06 (test page and test engine), with named carve-outs to WP-03 (schemas),
WP-04 (themes, styles), WP-05 (config metadata, command palette) and WP-07 (results screen, read-only
confirmation) in §10.

---

## 0. Why this document exists

The in-run screen was specified (CP-030 … CP-089) as a faithful port of monkeytype's word stream, on the
premise that "the test screen must look EXACTLY like monkeytype". The user has withdrawn that premise **for
the in-run screen only**:

> "You need to fully redo the tests themselves. I based this on monkeytype because I liked the interface. But
> this has nothing to do with typing, so all the typing related stuff can be fully removed from the codebase.
> The whole interface while we're in a run needs to be different. It should be one task at a time. And not
> with all the typing interface stuff, that just doesn't make sense."

The reasoning is sound and is recorded here as the design rationale: monkeytype streams words because you
type continuously *through* them — the stream is the input surface. A math trainer has no stream to read
ahead in. You see one problem, you solve it, you get the next one. The task-stream metaphor, the caret, the
per-character `<letter>` rendering and the hidden capture textarea are all artefacts of an input model that
croco calc does not have.

**The chrome stays monkeytype-like.** The header, the settings bar, the modes-notice strip, the footer, the
results page, the account pages, the themes and the overall minimalism are unchanged and remain the
reference. §11 states that explicitly and testably.

- **TR-001** This document is binding. Where it conflicts with `01-math-engine.md` … `06-infra-and-ops.md` or
  with a §2 ruling in `docs/REQUIREMENTS.md`, **this document wins**, and only for the requirements
  enumerated in §13. Every other requirement in those documents remains binding as written.
- **TR-002** This is a **presentation-layer change**. `packages/math-engine` (343 passing tests) is correct
  and MUST NOT be reimplemented, re-tuned or re-derived. Task generation, judging, seeding, the
  decimals/negatives/fraction rules, the metric formulas and the plausibility thresholds are all unchanged.
  The one permitted engine-package edit is documentation (see TR-217).
- **TR-003** The persisted result payload, the anti-cheat surface and the server-side revalidation contract
  MUST NOT change. §9 is the proof obligation for this.
- **TR-004** Implementation MUST NOT begin before this document is merged. No application code is written in
  the specification phase.
- **TR-005** Every `MUST` below is unconditional unless the requirement itself names a config key. A
  behaviour MUST NOT be satisfied by a config default alone (restatement of CP-185 for this document).
- **TR-006** Where this document deletes a feature, the tests that assert that feature MUST be **rewritten to
  assert the new behaviour**, not weakened and not silently dropped. A test may be deleted only when the
  feature it covers is genuinely gone; §10 marks each such case explicitly.
- **TR-007** Two anti-cheat properties are **binding and preserved verbatim** through this redesign:
  1. judgement happens only on an explicit submit event, never per character (CP-036 / ME-152); and
  2. the correct answer of a task that has not been submitted is not present in the DOM or in readable
     client state (master C29 / ME-135).
  Every design decision below is subordinate to these two.
- **TR-008** The change MUST be shippable in one deploy. §10's deletion inventory and §12's acceptance
  criteria together define "done".

---

## 1. Vocabulary and the DOM contract

- **TR-009** The in-run surface is called the **task arena**. Its root element is
  `<div id="taskArena">`, and it replaces `#tasksWrapper` + `#tasks` + `#caret` + `#tasksInput` entirely.
- **TR-010** `#taskArena` MUST carry `data-state` with exactly one of these four values at all times:

  | `data-state` | meaning |
  |---|---|
  | `preStart` | no run in progress; nothing has been generated onto the screen |
  | `running` | a run is in progress and the arena is awaiting or has just judged an answer |
  | `awaitingContinue` | the last answer was wrong; the correct answer is on screen; the run is waiting for an explicit continue |
  | `finished` | the timer expired; the results screen owns the page |

  This **amends CP-186**, which named only three values.
- **TR-011** `#taskArena` MUST additionally carry `data-feedback` with exactly one of `none`, `correct`,
  `wrong`. It is the animation and colour hook, never a source of truth.
- **TR-012** The normative element set inside `#taskArena`, in DOM order:

  | id / mount | role |
  |---|---|
  | `#taskReadouts` | the timer / tpm / acc row (§3.2) |
  | `#taskPrompt` | the expression, large and centred |
  | `#taskRule` | the horizontal rule between prompt and answer; decorative, `aria-hidden="true"` |
  | `#answerInput` | the single `<input>` the user answers into |
  | `#taskReveal` | the correct answer, shown only in `awaitingContinue` |
  | `#taskContinueHint` | the `press enter to continue` affordance, shown only in `awaitingContinue` |
  | `outoffocuswarning` mount | CP-083's warning, overlaying the arena |
  | `startgate` mount | the pre-start `start test` control (§3.1) |

- **TR-013** `#taskAnnouncer` MUST be kept exactly as it is today — a visually-hidden
  `role="status" aria-live="polite" aria-atomic="true"` region, clipped to a 1 px box rather than hidden with
  `display:none` / `visibility:hidden` / `hidden`. It is the **only** live region on the test page; the
  visible elements MUST NOT carry `aria-live`, so there are never two regions competing. CP-183 and DoD-36
  are satisfied through it.
- **TR-014** `#taskArena` MUST live inside the existing `#tasksTest` container, in the position
  `#tasksWrapper` occupies today. `#tasksTest`, `#testInitFailed`, `#restartTestButton`, `#answerSymbols`
  and the `testconfig` / `testmodesnotice` mounts keep their identifiers and their positions.
- **TR-015** `data-taskindex` MUST be carried by `#taskArena` (the index of the task currently on screen),
  not by a per-task element — there is exactly one task. `data-result` MUST be set to `correct` or `wrong`
  on `#taskArena` for the duration of the feedback, and removed on advance. This **amends CP-187**, whose
  per-`.task` placement presupposed a stream.
- **TR-016** The `.task`, `.prompt`, `.answer`, `.hints`, `hint` and `letter` class/element names MUST NOT
  appear anywhere in `frontend/src` after this change.
- **TR-017** The timer's `data-seconds-remaining` hook (CP-189) MUST be kept. It MUST be written to
  `#taskArena` and to every `[data-timer]` element, exactly as `test-timer.ts` does today for `#tasks`.
- **TR-018** `#taskPrompt`, `#taskRule`, `#taskReveal` and `#taskContinueHint` MUST be `user-select: none`.
  `#answerInput` MUST NOT be — the user must be able to select their own answer.
- **TR-019** The four CSS custom properties that colour the task MUST be renamed out of typing vocabulary:

  | old | new | meaning |
  |---|---|---|
  | `--correct-letter-color` | `--task-active-color` | the prompt and the answer being entered |
  | `--untyped-letter-color` | `--task-dim-color` | the rule, and any de-emphasised task text |
  | `--incorrect-letter-color` | `--task-error-color` | a wrong answer |
  | `--correct-letter-animation` / `--untyped-letter-animation` / `--incorrect-letter-animation` | `--task-active-animation` / `--task-dim-animation` / `--task-error-animation` | the theme animations that ride on the above |

  `--extra-letter-animation` (`rainbow_trail.css` only) has no math analogue and MUST be deleted.
- **TR-020** `--caret-color` MUST be **kept**, in all 52 theme files, in `CustomThemeColorsSchema`'s 10-tuple
  and in the theme modal's picker. It acquires a real analogue: `#answerInput` MUST set
  `caret-color: var(--caret-color)` so the browser's own text caret is themed. The croco default
  (`sub/caret #9ec1cc`) is unchanged.

---

## 2. Screen layout, state by state

### 2.1 The shape

```
        +-----------------------------------------+
        |            [ settings bar ]             |   unchanged (CP-023 … CP-029)
        |          [ modes notice strip ]         |   unchanged (CP-082)
        |                                         |
        |        7:42      36 tpm      96%        |   #taskReadouts
        |                                         |
        |              847 + 1293 =               |   #taskPrompt
        |            ---------------              |   #taskRule
        |                2140|                    |   #answerInput
        |                                         |
        |               [ restart ]               |   #restartTestButton, unchanged
        +-----------------------------------------+
```

- **TR-021** The arena MUST be a single centred column. `#taskPrompt`, `#taskRule`, `#answerInput`,
  `#taskReveal` and `#taskContinueHint` MUST all be horizontally centred on the same axis.
- **TR-022** There MUST be exactly one task on screen. No upcoming task, no previous task, no history strip,
  no scroll, no wrap, no line jump.
- **TR-023** `#taskPrompt` MUST render at `2 × var(--font-size-base)` where the base is the `fontSize` config
  key in `rem` (default `2`), i.e. `4rem` at the default. `#answerInput` MUST render at the same size as
  `#taskPrompt`. Both MUST scale down at the `sm` and below breakpoints so CP-180's 320 px requirement holds
  with no horizontal scrollbar.
- **TR-024** `#taskArena` MUST have a fixed minimum height equal to the tallest of its four states, so that
  entering `awaitingContinue` does not move the prompt, the rule or the input. Nothing above `#taskReveal`
  may shift when the reveal appears. This is testable: the bounding rect of `#taskPrompt` MUST be identical
  in `running` and in `awaitingContinue`.
- **TR-025** `#taskArena`'s `max-width` MUST be `maxLineWidth` rem when that key is non-zero, and unbounded
  at `0` (the default). `#taskRule`'s width MUST equal the arena's content width, so `maxLineWidth` visibly
  controls the rule. See TR-256 for why the key is retained under its existing name.
- **TR-026** `#taskRule` MUST be a 2 px solid `var(--task-dim-color)` horizontal rule with `0.25em` of
  vertical margin above and below. No shadow, no gradient, no rounding beyond `var(--roundness)`.
- **TR-027** `#answerInput` MUST have no border, no background, no box-shadow and no outline in its resting
  state — the rule above it is the only affordance. It MUST show a visible `:focus-visible` treatment only
  when focus arrives by keyboard from outside the arena.
- **TR-028** `#answerInput` MUST use `font-variant-numeric: tabular-nums` so digit widths are constant and
  the caret does not jitter between digits. (This is CP-043, kept — it is about numerals, not about typing.)
- **TR-029** The prompt MUST be rendered with the engine's glyphs verbatim: `×`, `÷`, `/` for fraction
  values, and U+2212 for every minus and negative sign (ME-127, ME-128, ME-130, ME-131, master C33).
- **TR-030** The **display** form of the prompt MUST strip a single trailing ` =` from `task.prompt`, because
  `#taskRule` now carries the equals relation. The stripping is display-only:
  `packages/math-engine/src/render.ts` `renderPrompt` MUST NOT change, `task.prompt` MUST keep its trailing
  ` =`, and the value written to the task log and to `#taskAnnouncer` MUST be `task.prompt` **verbatim**.
  Rationale: ME-174 regenerates and compares the logged prompt string; changing what the engine produces
  would break revalidation and force an ME-177/ME-184 engine-version bump for a cosmetic reason.

### 2.2 The readouts

- **TR-031** The three C13 readouts — the countdown timer, live tpm, live acc — MUST all render in a single
  horizontal row, `#taskReadouts`, directly above `#taskPrompt`, in the fixed order **timer, tpm, acc**.
  **No fourth readout may be added.**
- **TR-032** The existing config keys keep their exact domains and their exact meanings; only the placement
  changes:

  | key | value | rendering in `#taskReadouts` |
  |---|---|---|
  | `timerStyle` | `off` | timer hidden |
  | | `bar` | timer hidden from the row; the fixed full-width top-of-viewport progress bar (CP-076) is unchanged |
  | | `mini` / `flash_mini` | timer at the row's base size |
  | | `text` / `flash_text` | timer at the row's large size (`2×` the base), same row, same order |
  | `liveSpeedStyle` | `off` / `mini` / `text` | tpm hidden / base size / large size |
  | `liveAccStyle` | `off` / `mini` / `text` | acc hidden / base size / large size |

- **TR-033** The `flash_text` and `flash_mini` behaviour is unchanged: the time is revealed only when
  `(duration − elapsed) % 15 === 0`. `flash_text` blanks the text; `flash_mini` fades it. Both keep working
  in the new row.
- **TR-034** `timerColor` and `timerOpacity` MUST keep applying to all three readouts and to the progress
  bar, unchanged (CP-077).
- **TR-035** Live tpm MUST remain `answered / (elapsedSeconds / 60)`, displayed as an integer (CP-079). Live
  acc MUST remain `floor(correct / answered × 100)`, displayed `NN%`, and `100%` before anything is answered
  (CP-080). Neither formula changes.
- **TR-036** The readouts MUST be visible only while `isTestActive() && getFocus()` (CP-081). In
  `awaitingContinue` the run is still active, so the readouts stay visible and the timer keeps counting down
  on screen.
- **TR-037** The monkeytype "oversized number behind the content" treatment
  (`text-[4rem] … xl:text-[10rem]`, `z-[-1]`, `h-0`) is **struck**. It existed to sit behind a wrapping word
  stream. In the new arena the readouts are a normal, in-flow row.

### 2.3 State: `preStart`

- **TR-038** In `preStart`, `#taskPrompt` MUST contain **no text node at all** and MUST carry no `data-*`
  attribute holding a prompt. `#taskReveal`, `#taskContinueHint` and `#taskRule` MUST be absent from the
  layout (`display: none`, not merely transparent). `#answerInput` MUST be empty.
- **TR-039** The pre-start guarantee is therefore satisfied **structurally, not visually**: there is nothing
  to read because nothing is rendered. The blur, the `preStart` class, the `masked` task markup, the
  fixed-width blanks and `MASK_WIDTHS` are all **struck** (§13). Deleting a CSS class in devtools,
  screenshotting the page, or reading `document.body.textContent` yields no prompt, because there is none.
- **TR-040** The `startgate` mount MUST render a real, focusable `start test` button centred in the arena,
  with icon `ph:play-bold` and `data-test-id="startTestButton"`. This is the adaptation of the existing
  `PreStartHint` component and preserves the fix it embodies: a passive hint made starting the run depend
  entirely on a hidden field holding focus, and a stray click stranded focus on `<body>` so the page looked
  live and swallowed every keystroke. A real button cannot be defeated by focus living elsewhere.
- **TR-041** Typing an accepted answer character while in `preStart` MUST also start the run, and that same
  character MUST enter the buffer (it is not consumed by the start). This is the fast path for repeat users;
  the button is the discoverable path. Both funnel through the same start routine.
- **TR-042** `#answerInput` MUST be present, enabled and focusable in `preStart`. It MUST NOT be `disabled`
  (a disabled input cannot receive the keystroke that starts the run) and MUST NOT be `readonly`.
- **TR-043** `#taskReadouts` MUST render in `preStart` with the timer showing the full configured duration
  and tpm/acc hidden (they are gated on `isTestActive()`, TR-036).

### 2.4 State: `running`, awaiting an answer

- **TR-044** `#taskPrompt` shows the current task's display prompt (TR-030). `#taskRule` is visible.
  `#answerInput` holds the live buffer and has focus. `#taskReveal` and `#taskContinueHint` are absent from
  the layout. `data-feedback="none"`.
- **TR-045** `#taskPrompt` MUST be `var(--task-active-color)` with `var(--task-active-animation)`.
  `#answerInput`'s text MUST be `var(--task-active-color)`. `#taskRule` MUST be `var(--task-dim-color)`.
- **TR-046** No correctness signal of any kind may be rendered while the buffer is being entered: no colour
  change, no length hint, no digit-count hint, no enabling/disabling of a submit affordance based on the
  buffer's value, no change to the rule. This is CP-036 / ME-152, restated for the new surface and still
  **critical**.

### 2.5 State: `running`, feedback `correct`

- **TR-047** `data-feedback="correct"`, `data-result="correct"`, `data-state` stays `running`.
- **TR-048** The submitted answer stays on screen, in `var(--main-color)`, and `#taskRule` takes
  `var(--main-color)`, for the dwell defined in §6. Then the arena advances to the next task.
- **TR-049** No correct answer is revealed on a correct submission — the user already produced it.

### 2.6 State: `awaitingContinue` (feedback `wrong`)

- **TR-050** `data-state="awaitingContinue"`, `data-feedback="wrong"`, `data-result="wrong"`.
- **TR-051** The user's submitted answer MUST remain on screen in `var(--task-error-color)`, and `#taskRule`
  MUST take `var(--task-error-color)`.
- **TR-052** `#taskReveal` MUST show the correct answer — the engine's `answerDisplay` for the **just
  committed** task, U+2212 for a negative (ME-134, C33) — rendered at `0.75em` of the prompt size in
  `var(--main-color)` at full opacity, directly below `#answerInput`. It MUST be readable, not the 50 %-opacity
  decorative hint CP-041 specified for a committed stream item: after this change it is the primary
  information on the screen.
- **TR-053** `#taskContinueHint` MUST show a `press <kbd>enter</kbd> to continue` affordance in
  `var(--sub-color)` at `0.6em` of the prompt size, below `#taskReveal`, using the existing `Kbd` component
  so it matches the footer keytips. It MUST be present unconditionally — it is not gated on `showKeyTips`,
  because without it the run appears frozen.
- **TR-054** Below the `md` breakpoint the answer symbol row MUST additionally offer a continue button
  (TR-105), because the `inputmode="decimal"` keypad has no return key on iOS.
- **TR-055** The state persists indefinitely until the user continues or the timer expires. There is no
  timeout, no auto-advance and no countdown on the reveal.
- **TR-056** `#answerInput` MUST be `readonly` in `awaitingContinue` so the wrong answer cannot be edited
  after the correct one has been shown. It MUST retain focus (a `readonly` input still receives `keydown`,
  which is how Enter continues).

### 2.7 State: `finished`

- **TR-057** `data-state="finished"`, `data-feedback="none"`, `data-result` removed. `#taskArena` is hidden
  and the results screen takes the page, exactly as today. The results screen is unchanged (§11).
- **TR-058** If the timer expires while the arena is in the correct-answer dwell or in `awaitingContinue`,
  the run MUST finish immediately: the dwell is cancelled, the reveal is discarded, and the partially
  answered task (if any) is discarded per ME-157.

---

## 3. The state machine

### 3.1 States and transitions

```
                    ┌──────────────┐
                    │   preStart   │◄──────────── restart (any path)
                    └──────┬───────┘
        start button, or first accepted answer character
                           ▼
                    ┌──────────────┐
             ┌─────►│   running    │
             │      │  (awaiting)  │
             │      └──────┬───────┘
             │        Enter (submit)
             │             ▼
             │      ┌──────────────┐
             │      │ judge (sync) │
             │      └──┬────────┬──┘
             │ correct │        │ wrong
             │         ▼        ▼
             │  ┌───────────┐  ┌──────────────────┐
             └──┤  dwell    │  │ awaitingContinue │
    dwell ends  │ (180 ms,  │  │  (indefinite)    │
    or is       │cancellable│  └────────┬─────────┘
    cancelled   └───────────┘           │ Enter (continue), armed at 210 ms
             ▲                          │
             └──────────────────────────┘

    timer expiry, from running / dwell / awaitingContinue ──► finished
```

- **TR-059** The engine (`test/test-engine.ts`) remains the single source of truth for phase, active index,
  buffer, counts and the task log. The arena's `data-state` is a **projection** of engine phase plus the two
  presentation-only sub-states (`dwell`, `awaitingContinue`); it MUST NOT be authoritative for anything the
  result payload is derived from.
- **TR-060** `engine.commit(now)` MUST still be called **exactly once per submit**, synchronously, before any
  animation starts. The engine advances `activeIndex` at that moment. The dwell and the continue pause are
  purely presentational.
- **TR-061** A commit that the engine reports as `noop` (empty buffer, or a buffer with no digit after
  CP-058a normalisation — ME-141, CP-038) MUST NOT change state, MUST NOT animate, MUST NOT advance and MUST
  NOT count. The arena stays in `running` awaiting an answer.
- **TR-062** Entering `awaitingContinue` MUST NOT stop, pause, slow or rewind the timer. **This is the
  point of the design: the cost of an error is time.** Restated as a hard rule in §3.2.
- **TR-063** Restart is reachable from every state (`preStart`, `running`, dwell, `awaitingContinue`,
  `finished`) and always lands in `preStart`.
- **TR-064** Navigating away from the test page MUST behave exactly as today: the run is abandoned, recorded
  as an incomplete test, and the arena is reset to `preStart` (CP-052, `pages/test.ts`).

### 3.2 What the timer does in each state

- **TR-065** The timer MUST count **down** from `time × 60` seconds, formatted `m:ss` above 60 s (CP-073,
  CP-074). Unchanged.
- **TR-066** The timer MUST start on the same event that first renders a task — the start button press or
  the first accepted answer character — and never on page load, focus, restart, modal close or any other
  input (CP-075, CP-049 as adapted).

  | state | timer |
  |---|---|
  | `preStart` | not started; displays the full configured duration |
  | `running` (awaiting) | running |
  | `running` (correct dwell) | **running** |
  | `awaitingContinue` | **running** — MUST NOT pause, for any duration, ever |
  | `finished` | stopped at 0 |

- **TR-067** The drift-corrected scheduling MUST be kept unchanged: each tick is scheduled against the
  absolute start time, so an 8-minute run does not accumulate the timer's own lateness. `enableTimerDebug()`
  and `getTimerStats()` stay.
- **TR-068** Opening the command palette, opening any modal, losing window focus, or the out-of-focus warning
  appearing MUST NOT pause the timer. This is existing behaviour and is restated because
  `awaitingContinue` makes "the run is paused" a tempting but wrong reading.
- **TR-069** The AFK accounting (C37, C19) is unchanged: a second in which no input was accepted counts
  toward `afkDuration`, and `afkDetected` is still "the last five seconds carried no input at all".
  A long `awaitingContinue` pause therefore accrues idle seconds exactly as thinking time does today. This
  is correct and MUST NOT be special-cased.
- **TR-070** The per-second chart sampling (`score`, `tpm`, `wrong` — CP-113 … CP-116) is unchanged and keeps
  sampling through the dwell and the pause.

### 3.3 Task timing semantics

- **TR-071** ME-159's `tStart` for task *n+1* MUST be recorded at the moment task *n+1*'s prompt is
  **rendered** — i.e. when the dwell ends, or when the user continues after a wrong answer — **not** at the
  moment task *n* was committed.
- **TR-072** Consequence, and it is intended: `tEnd(n) < tStart(n+1)`, and the gap is exactly the dwell or
  the pause. A user's response time for a task no longer includes the time they spent looking at the previous
  task's correct answer, which is what ME-159 always meant ("ms from test start at which the task became
  active") and what ME-165's consistency metric needs to be meaningful.
- **TR-073** This MUST NOT be implemented by changing `packages/math-engine`. It is a one-line change to when
  `test-engine.ts` sets its private `taskStartedAt`, which is frontend-owned.
- **TR-074** Proof that TR-071 is anti-cheat-safe, and this MUST be covered by a test:
  - ME-180 / ME-181 compute `Δᵢ = tEndᵢ − tEndᵢ₋₁` (see `packages/math-engine/src/plausibility.ts`
    `interAnswerIntervals`). They **do not read `tStart`**, so neither threshold moves.
  - The dwell and the pause only ever *increase* `Δᵢ`, i.e. they move every plausibility check strictly away
    from its rejection boundary.
  - ME-182(b) checks only `taskLog[0].tStart >= 0` and `last tEnd <= duration*1000 + 2000`. Both still hold.
  - ME-165 `consistencyOf` maps `tEnd − tStart` per entry; client and server compute it from the *same*
    submitted log, so `backend/src/api/controllers/result.ts`'s re-verification agrees by construction.
  - ME-179's tpm ceiling is computed from `taskLog.length / minutes`; the dwell can only reduce it.
- **TR-075** The 180 ms dwell reduces the theoretical maximum answer rate. At ME-179's ceiling of 120 tpm
  (500 ms per task) the dwell consumes 36 % of the budget. This moves the ceiling further out of reach, which
  is safe; the threshold MUST NOT be re-tuned.

### 3.4 The event log

- **TR-076** `EVENT_LOG_VERSION` MUST be bumped from `2` to `3`. No new event type is added; `taskShown`
  changes meaning slightly (it now fires when the prompt actually appears, which lags `answerSubmitted` by
  the dwell or the pause), and the version bump records that.
- **TR-077** `taskShown` MUST be logged at the moment defined in TR-071, carrying `{ taskIndex, prompt }`
  with `prompt` being `task.prompt` **verbatim**. `answerSubmitted` MUST be logged at commit time, carrying
  `{ taskIndex, given, correct }`. No event may carry the expected answer of any task (C29, restated as
  TR-158).
- **TR-078** The continue press needs no event of its own: it is exactly the timestamp of the following
  `taskShown`, so the pause is fully reconstructible from the existing stream.

---

## 4. The answer input

### 4.1 The element

- **TR-079** The hidden `<textarea id="tasksInput">` is **struck**. It is replaced by a single visible
  `<input id="answerInput">` with exactly these attributes:

  ```html
  <input
    id="answerInput"
    type="text"
    inputmode="decimal"
    enterkeyhint="done"
    maxlength="16"
    autocomplete="off"
    autocapitalize="none"
    autocorrect="off"
    spellcheck="false"
    translate="no"
    aria-label="Answer"
    data-gramm="false"
    data-gramm_editor="false"
    data-enable-grammarly="false"
    data-bwignore
    data-1p-ignore
    data-lpignore="true"
    data-form-type="other"
  />
  ```

- **TR-080** `type` MUST be `text`, never `number`. `type="number"` rejects `/`, applies locale-dependent
  parsing, adds spinner controls and reports an empty `value` for intermediate states — all three are wrong
  for an answer that may be `7/12`.
- **TR-081** `inputmode="decimal"` MUST be kept (CP-054) so mobile browsers open a numeric keypad rather than
  a full alphabetic keyboard. It MUST NOT be changed to `"text"`.
- **TR-082** `maxlength="16"` MUST be present as defence in depth. It is **not** the enforcement point:
  ME-151's 16-character cap is enforced by the engine's `appendAnswerChar`, which stays the single authority.
- **TR-083** The anti-interference attributes above MUST be kept. They are not typing machinery — they stop
  password managers, Grammarly, Bitwarden and 1Password injecting into or reading the field. The one
  attribute that is struck is `list="autocompleteOff"`: it referenced a `<datalist>` that does not exist in
  this codebase, so it is dead weight.
- **TR-084** `#answerInput` MUST NOT be inside a `<form>`, so there is no implicit form submission to
  suppress.

### 4.2 The filter — what characters are accepted

- **TR-085** The accepted-character set is **unchanged**, and remains defined by
  `packages/math-engine/src/judge.ts`. Restated here for completeness only; the engine is normative:

  | keystroke | result |
  |---|---|
  | `0`–`9` | appended |
  | `-` (U+002D), `−` (U+2212), `–` (U+2013), `—` (U+2014) | normalised to `-`, accepted **only as the first character** of the buffer |
  | `.` | appended, at most one per answer, and only when at least one digit already precedes it |
  | `,` | normalised to `.`, then treated exactly as `.` (German numpad — ME-138) |
  | `/` | appended, at most one per answer, mutually exclusive with `.`, and only when at least one digit already precedes it |
  | anything else | silently ignored — no insertion, no error, no state change |

  Buffer cap: **16 characters** total (ME-151).
- **TR-086** The three answer shapes the engine judges (ME-143) are unchanged, and the filter above is the
  input-side harmonisation of them:
  - `INT` := `-?` `DIGIT{1,7}` — e.g. `2140`, `−84`
  - `DEC` := `-?` `DIGIT{1,7}` `.` `DIGIT{1,7}` — e.g. `2.1`, `0.25` (a leading `0` is required; `.5` and `5.` are not valid grammar)
  - `FRAC` := `-?` `DIGIT{1,7}` `/` `DIGIT{1,7}` — e.g. `7/12`, `−5/6`
- **TR-087** CP-058a's commit-time normalisation is unchanged and still runs **before** judging: strip a
  single trailing `.`/`,`, strip a single trailing `/`, strip a lone `-` not followed by a digit. If the
  normalised buffer contains no digit, the commit is a no-op (TR-061). So `5.` still judges as `5`, and a
  user is never marked wrong for a value they meant correctly.
- **TR-088** Judging is unchanged: exact rational equality by cross-multiplication (ME-147), never string
  comparison, never with an epsilon. Any representation of the correct value is accepted across formats
  (ME-148): `1/4`, `2/8`, `0.25` and `0,25` are all correct for an expected `0.25`.

### 4.3 How the filter is applied to a real input

- **TR-089** The engine's buffer remains the single source of truth. `#answerInput.value` is a **mirror** of
  it, never the other way round.
- **TR-090** Every mutation of `#answerInput` MUST go through `beforeinput`, and the handler MUST
  `preventDefault()` on **every** `inputType` without exception, then apply the corresponding engine
  operation and write `engine.buffer()` back to `#answerInput.value`:

  | `inputType` | action |
  |---|---|
  | `insertText`, `insertCompositionText`, `insertFromPaste`, `insertFromDrop`, `insertReplacementText` | for each character in `event.data`, call the engine's append; characters the filter rejects are dropped |
  | `deleteContentBackward` | engine backspace, one character |
  | `deleteWordBackward`, `deleteHardLineBackward`, `deleteSoftLineBackward` | engine backspace, whole buffer |
  | everything else | `preventDefault()` only; no engine call |

  Applying the filter to pasted text rather than refusing the paste outright is a deliberate improvement: a
  paste that survives the filter is indistinguishable from typing the same characters, so refusing it bought
  nothing and only annoyed users.
- **TR-091** After every write to `#answerInput.value`, the selection MUST be collapsed to the end
  (`setSelectionRange(value.length, value.length)`). The browser's native caret is therefore always in the
  correct place and is the **only** caret on the page.
- **TR-092** Consequence, and it MUST be specified rather than discovered: mid-string editing is not
  supported. Clicking into the middle of the answer and typing appends at the end. Answers are at most 16
  characters and are almost always corrected by backspacing, so the cost is negligible and the alternative —
  a controlled input that reconciles arbitrary cursor positions against a filtered buffer — is a large amount
  of machinery for no user benefit.
- **TR-093** An `input` listener MUST remain as defence in depth: if `#answerInput.value` ever diverges from
  `engine.buffer()`, it MUST be rewritten from the engine.
- **TR-094** `copy` and `cut` MUST be allowed (the user's own answer is theirs). `drop` MUST be prevented.
  The `select` / `selectstart` `preventDefault()` handlers are **struck** — they were a hidden-textarea hack
  and would now stop the user selecting their own answer.
- **TR-095** The `event.isComposing` guard and the composition branch are **struck**. No IME composes
  digits, `-`, `.` or `/`; the guard existed for the word stream.

### 4.4 The minus sign

- **TR-096** A minus is **entered** with any of `-` (U+002D), `−` (U+2212), `–` (U+2013), `—` (U+2014), or —
  below `md` — the symbol-row minus button. All four normalise to ASCII `-` in the buffer (ME-139).
- **TR-097** A minus is **displayed**, everywhere the user can see it, as **U+2212**: in `#taskPrompt`
  (ME-131, C33), in `#taskReveal` (ME-134), and on the symbol-row button's label (CP-192). The buffer and the
  submitted `given` string stay ASCII.
- **TR-098** `#answerInput` is the one exception, and it MUST be stated: the value the user sees in the input
  is the ASCII buffer, so a negative answer in progress reads `-84` with U+002D. Rendering U+2212 there would
  require the input's value to diverge from the buffer, which TR-089 forbids. This is not a C33 violation:
  C33 governs *rendered prompts and answers*, and the in-progress buffer is neither.
- **TR-099** A minus is accepted only as the first character (ME-137, CP-057). A `-` pressed later is
  silently ignored — no insertion, no error, no state change.

### 4.5 Mobile

- **TR-100** All of CP-180's breakpoints (320, 768, 1024, 1920 px) MUST render the arena interactively with
  no horizontal scrollbar.
- **TR-101** The answer symbol row (CP-191 … CP-196) MUST be kept. It exists because `inputmode="decimal"`
  yields a keypad with digits and a decimal separator only — no `/`, no `-` — and `fractionAddition`,
  `fractionMultiplication` and `negatives` are all ON by default (SB-110), so the shipped default
  configuration is literally unplayable on a phone without it.
- **TR-102** The row MUST be rendered only below the `md` breakpoint (849 px), and MUST NOT be merely hidden
  at and above it.
- **TR-103** The row MUST contain only the glyphs the current configuration can need (CP-192): minus when
  `negatives`, decimal point when `decimals`, fraction slash when `fractionAddition !== "off" ||
  fractionMultiplication`.
- **TR-104** A symbol press MUST feed through the same engine path as a physical keystroke — the same filter,
  the same 16-character cap, the same buffer write-back (CP-193) — and MUST start the run when pressed in
  `preStart` (CP-195).
- **TR-105** The row MUST additionally contain, at its right end, a **submit / continue** button:
  - icon `ph:arrow-elbow-down-left-bold`;
  - `aria-label="submit answer"` in `running`, `aria-label="continue"` in `awaitingContinue`;
  - it MUST invoke exactly the same handler Enter invokes in that state, including the TR-118 arming delay;
  - it MUST be hidden in `preStart` and `finished`.

  Rationale: on iOS the `inputmode="decimal"` keypad has **no return key at all**, so without this button
  the run cannot be submitted on an iPhone. This is a functional necessity of the same kind as CP-191, not
  the decorative numpad diagram CP-061 defers.
- **TR-106** Every symbol-row button MUST keep CP-194's focus behaviour (`preventDefault()` on the bubbled
  `mousedown` / `pointerdown` so the soft keyboard does not close mid-answer), MUST keep CP-196's
  spelled-out `aria-label` and its 44 × 44 px minimum hit target, and MUST NOT use `tabindex="-1"`.

---

## 5. Feedback animations

Design constraint, binding: **monkeytype's restrained visual language.** Colour and a few tenths of an em of
motion. No confetti, no bounce, no shake, no scale, no rotation, no sound, no particle effect, no easing that
overshoots.

### 5.1 Correct

- **TR-107** Total duration **180 ms**, in two phases of 90 ms.
- **TR-108** Phase A, `0 → 90 ms`: `data-feedback="correct"`. `#answerInput`'s text colour and `#taskRule`'s
  `border-color` transition to `var(--main-color)`. `transition-property` is exactly
  `color, border-color`; `transition-duration: 90ms`; `transition-timing-function: ease-out`. Nothing else
  animates in phase A.
- **TR-109** Phase B, `90 → 180 ms`: `#taskPrompt`, `#taskRule` and `#answerInput` translate `-0.35em` on Y
  and fade to `opacity: 0` over 90 ms with `cubic-bezier(0.4, 0, 1, 1)`. The incoming task's prompt and an
  empty input enter from `translateY(0.35em)` / `opacity: 0` to `translateY(0)` / `opacity: 1` over the same
  90 ms with `cubic-bezier(0, 0, 0.2, 1)`. Nothing else moves; `#taskReadouts` and `#restartTestButton` are
  static.
- **TR-110** The dwell is **cancellable**. Any accepted answer character pressed during the 180 ms MUST
  immediately complete the advance and enter that character into the new task's buffer. No keystroke may be
  dropped by the animation. A fast user therefore never waits; a normal user sees the confirmation.
- **TR-111** Enter pressed during the dwell MUST be ignored (the new buffer is empty, so a commit would be a
  no-op anyway — TR-061 — but this is stated so the behaviour is not accidental).

### 5.2 Wrong

- **TR-112** Phase A, `0 → 90 ms`: `data-feedback="wrong"`, `data-state="awaitingContinue"`.
  `#answerInput`'s text colour and `#taskRule`'s `border-color` transition to `var(--task-error-color)`, same
  properties, same 90 ms, same `ease-out` as TR-108.
- **TR-113** Phase B, `90 → 210 ms`: `#taskReveal` and `#taskContinueHint` fade in from `opacity: 0` to `1`
  over 120 ms with `cubic-bezier(0, 0, 0.2, 1)`. **No translate** — they must not appear to push the prompt
  around, and TR-024 already reserves their space.
- **TR-114** After 210 ms the arena is static and stays that way until the user continues. Nothing pulses,
  breathes, blinks or loops. `#taskContinueHint` MUST NOT animate.
- **TR-115** On continue: `#taskReveal` and `#taskContinueHint` are removed with no exit animation, and the
  same advance animation as TR-109 phase B plays for 90 ms. Total continue-to-next-prompt latency is 90 ms.
- **TR-116** There is no shake, no horizontal jitter and no `filter: blur` on a wrong answer. The colour and
  the reveal are the entire feedback.

### 5.3 Guards

- **TR-117** The engine advances synchronously at submit (TR-060), so neither animation may gate correctness,
  scoring, the task log, the chart samples or the timer. If an animation fails to run — a dropped frame, a
  cancelled transition, a hidden tab — the run MUST still be correct.
- **TR-118** `CONTINUE_ARM_MS = 210`. An Enter (or a continue-button press) that arrives less than 210 ms
  after the wrong submit MUST be ignored. Rationale: without it, a user who double-taps Enter blows straight
  past the correct answer and never sees it, which defeats the entire feature.
- **TR-119** Entering any state MUST cancel any animation still in flight from the previous state. A restart
  during the dwell or during the reveal fade MUST land cleanly in `preStart` with no residual inline style,
  no residual `data-feedback` and no pending timeout.
- **TR-120** All timings are module-level named constants
  (`CORRECT_DWELL_MS = 180`, `FEEDBACK_PHASE_MS = 90`, `REVEAL_FADE_MS = 120`, `CONTINUE_ARM_MS = 210`), so a
  test can import them rather than hard-coding magic numbers.

### 5.4 `prefers-reduced-motion`

- **TR-121** Under `prefers-reduced-motion: reduce`, all **transform** and **opacity** transitions in §5 MUST
  be suppressed. The prompt is replaced instantly; the reveal appears instantly.
- **TR-122** Colour transitions MAY be suppressed to instant colour changes. Colour carries information, not
  motion, so the information MUST still be delivered — the answer still turns `--main-color` or
  `--task-error-color`, just without a transition.
- **TR-123** **Timing MUST be preserved.** `CORRECT_DWELL_MS` stays 180 ms and `CONTINUE_ARM_MS` stays 210 ms
  under reduced motion. Reduced motion means less movement, not less feedback: collapsing the dwell to zero
  would remove the affirmative signal entirely for the users who most need it to be unambiguous.
- **TR-124** Consequently, the dwell and the arming delay MUST NOT be routed through
  `utils/misc.ts` `applyReducedMotion()`, which returns `0`. That helper is for animation durations only.
- **TR-125** The existing global rule in `styles/media-queries.scss` already sets
  `animation: none !important; transition: none !important` on everything outside its allowlist under
  `@media (prefers-reduced-motion)`. The arena MUST NOT be added to that allowlist, and MUST NOT carry
  `ignore-reduced-motion`.
- **TR-126** A test MUST assert TR-123 explicitly: with `prefers-reduced-motion` mocked to `reduce`, a
  correct submit still takes 180 ms to advance.

---

## 6. Keyboard-only operation, end to end

- **TR-127** The entire run MUST be completable with a keyboard alone, on desktop, without ever moving a
  mouse: start, answer, submit, continue after a wrong answer, restart, and reach the results screen.
- **TR-128** **Start.** From a freshly loaded page, pressing any accepted answer character starts the run and
  enters that character (TR-041). Alternatively, Tab reaches the `start test` button and Enter or Space
  activates it. Both paths MUST start the timer exactly once.
- **TR-129** **Focus on load.** `#answerInput` MUST hold focus when the test page is shown, and MUST regain
  it when a modal closes, when the results screen is dismissed by a restart, and when a background click
  strands focus on `<body>`. The existing `pointerdown` restoration in `event-handlers/global.ts` MUST be
  kept and retargeted at `#answerInput`.
- **TR-130** **Answer.** Accepted characters go into the buffer; everything else is silently ignored. No key
  other than those in TR-085 may modify the buffer.
- **TR-131** **Submit = Enter.** Enter is the only submit key.
- **TR-132** **`Space` is struck as a submit key.** CP-037's own rationale for it was "preserves monkeytype
  muscle memory (space commits a word)", which is precisely the typing artefact this document removes. In the
  new design Space would additionally have to double as "continue", giving one key two meanings in two
  states for no benefit. ME-140 is amended accordingly.
- **TR-133** Space pressed in the arena MUST be silently ignored, and MUST NOT scroll the page. The existing
  `window` keydown guard that suppresses Space-scrolling on `<body>` and `#result` MUST be kept.
- **TR-134** **Auto-advance-on-unique-match is REJECTED and MUST NOT be implemented**, in any form, including
  "advance when the buffer length equals the answer length" and "advance when the parsed value equals the
  answer". ME-153 forbids it, and it is an information leak: it tells the user their answer is right before
  they commit, and it tells them the digit count. `quickEnd` MUST NOT be ported.
- **TR-135** **ME-153 is PRESERVED, and the distinction MUST be documented in code.** ME-153 forbids the
  *task* from auto-advancing when the entered value happens to equal the answer — i.e. it forbids advancing
  **without a submit event**. The post-submit advance on a correct answer is a different thing entirely: the
  submit has already happened, the judgement has already been made and recorded, and the anti-cheat property
  ME-153 exists to protect — one clean, user-initiated event boundary per task, at which and only at which
  correctness is revealed — is fully intact. The rule that survives is: *nothing may reveal correctness
  before an explicit Enter.*
- **TR-136** **Continue after a wrong answer = Enter**, armed at `CONTINUE_ARM_MS` (TR-118). No other key
  continues. In particular a digit typed during `awaitingContinue` MUST be discarded, not buffered for the
  next task — the pause exists to make the user read the correct answer.
- **TR-137** **Restart: `tab > enter` MUST survive.** With the default `quickRestart: "off"`, Tab from
  `#answerInput` MUST move focus to the next focusable element and Enter MUST activate it, and
  `#restartTestButton` MUST be reachable that way. DOM order MUST therefore be
  `#answerInput` → (symbol-row buttons, below `md` only) → `#restartTestButton`. On desktop the symbol row is
  not rendered at all (TR-102), so `tab > enter` is literally two keystrokes to a restart.
- **TR-138** `#restartTestButton` MUST keep its `opacity: 0` treatment under `main.focus` **and** its
  `&:focus-visible { opacity: 1 }` override, so tabbing to it makes it visible.
- **TR-139** The quick-restart hotkey MUST keep working from every state and MUST remain user-configurable
  through `quickRestart` (`off` | `esc` | `tab` | `enter`) — CP-087, SB-151. Restarting from
  `awaitingContinue` MUST discard the reveal and land in `preStart`.
- **TR-140** **Enter collision.** When `quickRestart === "enter"`, Enter has two meanings. The ruling:
  - in `running` and `awaitingContinue`, Enter belongs to the arena (submit / continue) and MUST NOT trigger
    quick-restart;
  - in `preStart` and `finished`, Enter triggers quick-restart as configured.

  This MUST be implemented as an explicit guard in the hotkey layer keyed on `data-state`, and MUST have a
  test. Without it, `quickRestart: "enter"` makes the app unusable.
- **TR-141** **Escape.** SB-150 is unchanged: Escape opens the command palette unless `quickRestart === "esc"`,
  in which case the palette moves to Tab. Escape MUST reach the palette from `preStart`, `running`,
  `awaitingContinue` and `finished` alike.
- **TR-142** Opening the palette MUST NOT pause the timer, MUST NOT leave `awaitingContinue`, and MUST NOT
  submit. Closing it MUST return focus to `#answerInput` and leave `data-state` exactly as it was.
- **TR-143** When `quickRestart === "esc"` the palette is on Tab, so `tab > enter` opens the palette instead
  of restarting. That is a direct consequence of the user's own config choice and is not a defect; the
  restart button remains reachable by mouse and by the Escape-bound restart.
- **TR-144** Every interactive element in the arena MUST be keyboard-reachable and MUST have an accessible
  name (CP-183, DoD-36). `tabindex="-1"` MUST NOT be used on any of them.
- **TR-145** `#taskAnnouncer` MUST be written on exactly these occasions, and no others:

  | occasion | announced text |
  |---|---|
  | run starts / a new prompt is rendered after a wrong answer | `task.prompt` verbatim |
  | a new prompt is rendered after a correct answer | `` `correct. ${task.prompt}` `` |
  | a wrong answer is judged | `` `incorrect. correct answer ${answerDisplay}. press enter to continue.` `` |
  | restart | empty string |

- **TR-146** The restart clearing (row four) is mandatory: without it a screen reader re-reads the previous
  run's last prompt as if it were live.
- **TR-147** The announcer MUST NOT be written in `preStart` other than to clear it, so it can never leak a
  prompt before the run begins.
- **TR-148** The out-of-focus warning (CP-083) MUST be kept: after 1 s of lost focus the arena is blurred and
  the warning overlays it, with the two existing messages unchanged. It MUST cover `#taskArena` via
  `position: absolute; inset: 0`, which removes the need for the JS-measured `outOfFocusMaxHeight` signal
  (§10).
- **TR-149** Regaining focus MUST lift the out-of-focus blur and MUST NOT change `data-state`. In particular
  it MUST NOT start a `preStart` run and MUST NOT continue from `awaitingContinue` (CP-085, restated).
- **TR-150** Keyboard acceptance test, which MUST exist as an integration test: load the page; press `4`;
  assert the run started and the buffer is `4`; press Enter; assert either an advance or a reveal; if a
  reveal, press Enter within 100 ms and assert **nothing happened**, then press Enter after 210 ms and assert
  the advance; press Tab then Enter; assert `data-state === "preStart"`.

---

## 7. How C29 is satisfied

- **TR-151** **The rule, restated and still binding.** The exact answer of a task that has not yet been
  submitted MUST NOT be present anywhere in the DOM — not as text, not as a `data-` attribute, not as an
  `aria-label`, not in a `title`, not in an inline style, and not in any element's `value`.
- **TR-152** The redesign makes this **strictly easier**, and the argument MUST be preserved in code
  comments: exactly one task exists on screen at a time, and only one task's answer is ever in play.
- **TR-153** The answer enters the DOM at exactly one moment, and it is after submission:

  | moment | is the answer in the DOM? |
  |---|---|
  | `preStart` | **No** — there is no task on screen at all |
  | `running`, buffer being entered | **No** |
  | Enter pressed, `engine.commit()` returns `correct` | **No** — a correct answer is never revealed (TR-049) |
  | Enter pressed, `engine.commit()` returns `incorrect` | **Yes**, from the first paint of `#taskReveal` — i.e. from the moment the task is already committed, scored and logged |
  | `awaitingContinue` | **Yes**, for that one committed task only |
  | continue pressed | **No** — `#taskReveal` is emptied before the next prompt renders |

- **TR-154** The engine's `Task` objects, which carry `answer` (an exact rational) and `answerDisplay` (the
  canonical string), MUST stay inside `createTestEngine`'s closure. The array MUST NOT be exported, MUST NOT
  be attached to `window`, and no accessor may hand one out.
- **TR-155** `viewAt(index)` MUST keep its current contract: `expected` is populated **only** for a task that
  has already been committed. An upcoming or active task MUST report `expected: undefined`, so a renderer
  cannot put an in-play answer in the DOM even by accident.
- **TR-156** `test-logic.ts` MUST keep the engine module-private. `getEngine()` MUST NOT be exported and the
  engine MUST NOT appear in `index.ts`'s `addToGlobal({ … })` list.
- **TR-157** `#taskReveal` MUST be **emptied**, not merely hidden, on continue, on restart and on finish. A
  `display: none` element with the answer still in its text content is a C29 violation.
- **TR-158** No test event may carry the expected answer of any task. `answerSubmitted` records what the user
  entered and whether it was right, never what was right. `window.currentEventLog()` MUST therefore be
  answer-free at every moment of a run.
- **TR-159** CP-184 (the screenshot path must not bypass the pre-start blur) is satisfied **vacuously** after
  this change: in `preStart` there is no prompt and no answer to capture. The requirement is retained in
  spirit — the screenshot path MUST NOT render a task or an answer that is not already on screen.
- **TR-160** The C29 test MUST be rewritten, not deleted, for the new DOM. Its assertion is unchanged in
  substance: at any moment during a run, `document.body.textContent` MUST NOT contain the `answerDisplay` of
  any task for which `#taskArena` does not carry `data-result`.
- **TR-161** A second, stronger test MUST exist: drive 20 tasks through the engine, and after every single
  state transition assert that no un-submitted task's `answerDisplay` appears in `document.body.innerHTML`
  (which catches attributes and inline styles that `textContent` misses).
- **TR-162** Open item, unchanged by this document and explicitly **not** resolved here: `mathSeed` and
  `settingsId` are readable pre-start from `window.currentEventLog()`, which is a theoretical
  regenerate-the-sequence vector. It is tracked separately as a defence-in-depth item and is out of scope for
  the redesign.

---

## 8. What the results screen receives

- **TR-163** The results screen and its payload are **unchanged**. `TestResultPayload` keeps its exact shape:
  `{ completedEvent, isRepeated, afkDetected, tooShort, dontSave }`.
- **TR-164** `completedEvent` keeps every field it has today, produced by the same `buildCompletedEvent`
  logic: `score`, `correct`, `wrong`, `acc`, `tpm`, `spm`, `consistency`, `mode`, `mode2`, `timestamp`,
  `testDuration`, `chartData`, `settings`, `settingsId`, `restartCount`, `incompleteTestSeconds`,
  `afkDuration`, `mathSeed`, `mathSettings`, `engineVersion`, `taskLog`, `incompleteTests`.
- **TR-165** WP-10's server-side validation is therefore satisfied unchanged. Specifically, and this MUST be
  confirmed by running the existing backend tests rather than by inspection:
  - **ME-174 seeded regeneration** — the server regenerates tasks `0 … n-1` from `(mathSeed, mathSettings)`
    and checks, per entry, that the regenerated prompt equals the logged `prompt`, the regenerated exact
    answer equals the logged `expected`, and re-judging the logged `given` reproduces the logged `correct`.
    All four inputs are engine-produced and untouched by this redesign — in particular `prompt` keeps its
    trailing ` =` (TR-030).
  - **ME-176** — the `"toolong"` degradation past 1000 entries, and the 50-index deterministic sample
    fallback, are unchanged.
  - **ME-177 / ME-184** — `engineVersion` is unchanged, because `packages/math-engine` is unchanged. **No
    engine version bump is required by this redesign**, and one MUST NOT be issued, because it would reject
    every cached client mid-flight for a change that does not touch generation, mixing or judging.
  - **ME-175** — the `objectHash` anti-cheat and the duplicate-hash check sit on top and are unchanged.
  - **ME-179 … ME-182** — the plausibility thresholds are unchanged, and TR-074 proves the new timing
    semantics move every one of them away from its rejection boundary.
  - The controller's metric re-verification (`correct`, `wrong`, `score` exact; `acc`, `tpm`, `spm`,
    `consistency` within tolerance) recomputes from the submitted `taskLog`, so client and server agree by
    construction.
- **TR-166** **The per-task log records everything the server needs, and it is engine-owned.** ME-159's
  entry — `{ i, kind, prompt, expected, given, correct, tStart, tEnd }` — is written by `test-engine.ts`
  inside `commit()` and is not touched by the presentation change. The only semantic movement is `tStart`
  (TR-071), which is analysed in TR-074.
- **TR-167** **The event log is not the anti-cheat artefact and MUST NOT be confused with it.**
  `frontend/src/ts/test/events/` is a debug and replay stream reachable from the console as
  `currentEventLog()`. `buildCompletedEvent` reads `engine.taskLog()`, never the event log. Nothing the
  server validates depends on `EVENT_LOG_VERSION` or on the event vocabulary, which is why TR-076's bump to
  `3` is free.
- **TR-168** The results screen itself is **unchanged**: `score = correct − wrong`, `correct` and `wrong`
  side by side, accuracy, tasks per minute, the `morestats` row, the chart with its `score` / `tpm` /
  `wrong` axes and its four-button legend, the four action buttons, the PB crown, the task history.
- **TR-169** CP-188's eight `data-*` hooks on `#result` are unchanged.
- **TR-170** CP-109 is unchanged: a run with `answered === 0` is invalid, is not saved, is not a PB and is
  not on a leaderboard.
- **TR-171** ME-157 is unchanged: a task that is partially answered when the timer expires is discarded — it
  counts neither correct nor wrong, and contributes nothing to the tpm numerator.
- **TR-172** ME-157's edge case in the new design MUST be specified: if the timer expires while the arena is
  in `awaitingContinue`, the last task **was** committed (as wrong) before the pause began, so it counts. It
  is not discarded. Only a task with an uncommitted buffer is discarded.
- **TR-173** CP-089 ("repeat test", identical seeded sequence) is unchanged.
- **TR-174** CP-088's restart semantics are unchanged: reset the timer to the full duration, discard all
  committed tasks, generate a fresh sequence, return to `preStart`, and record the abandoned run as an
  incomplete test.
- **TR-175** `registerResultPresenter` and the WP-06 → WP-07 hand-off contract are unchanged.
- **TR-176** WP-07 MUST NOT be asked to change anything for this redesign. Its only obligation is to confirm,
  by running its existing suite, that the payload it receives is byte-identical in shape.
- **TR-177** The result-handoff and result-screen jsdom specs MUST be updated **only** where they build the
  test-page DOM fixture (they currently hand-roll `#tasks*` markup). Their assertions MUST NOT change.

---

## 9. Deletion inventory

Every path below was verified to exist in the working tree at the time of writing. Line counts are from
`wc -l`. Items marked **AMBIGUOUS** carry a recommendation and are also listed in §14.

### 9.1 Files deleted outright

| # | path | lines | what it is | why it goes |
|---|---|---|---|---|
| **TR-178** | `frontend/src/styles/caret.scss` | 48 | `#caret` element styling — bar/block/outline/underline shapes, the flash animation binding | The custom caret existed only because CP-053 hid the input, so there was no native caret to see. `#answerInput` is visible and has one. |
| **TR-179** | `frontend/src/ts/elements/caret.ts` | 209 | the `Caret` class: `goTo({taskIndex, charIndex})`, `place()`, `settleLineJumpMargin()`, `handleLineJump()`, `SMOOTH_DURATIONS`, blink control | Positions a caret over a `<letter>` inside a scrolling stream. Neither the letter nor the stream exists. |
| **TR-180** | `frontend/src/ts/test/caret.ts` | 55 | the live caret singleton and its `configEvent` subscription | Same. |
| **TR-181** | `frontend/__tests__/test/task-stream-geometry.jsdom-spec.ts` | 275 | asserts the three-line window, the line jump, the clip on `#tasksWrapper`, and the caret delta | The feature is genuinely gone. This is the one spec this document deletes rather than rewrites. Its useful residue — "the active task is inside the visible box" — is re-expressed by TR-024's bounding-rect assertion. |

### 9.2 HTML

| # | path | what is removed |
|---|---|---|
| **TR-182** | `frontend/src/html/pages/test.html` | `<textarea id="tasksInput">` and its 14 attributes; `<div id="caret" class="full-width default">`; `<div id="tasks" class="full-width preStart" data-state="preStart">`; `<div id="tasksWrapper" class="content-grid full-width" translate="no">`. Replaced by the TR-012 element set. `#taskAnnouncer`, `#tasksTest`, `#testInitFailed`, `#restartTestButton` and the four mounts are kept. |

### 9.3 Styles

| # | path | what is removed |
|---|---|---|
| **TR-183** | `frontend/src/styles/test.scss` | the `#tasks` block (`display:flex; flex-wrap:wrap; align-content:flex-start`, the six `--*-letter-*` properties, `.task` colour states, `&.preStart`, `&.blurred`, `&.preStart.blurred`, `&.noErrorBorder .task.typed.incorrect`, `&.flipped`, `&.colorfulMode`, `&.flipped.colorfulMode`); the `#tasks .task .hints hint` block; the standalone `.task` block (`display:inline-block`, `white-space:nowrap`, `.prompt { white-space: pre }`, `.answer letter { display: inline-block }`); the `#tasksInput` hidden-field block (30 lines, including the Firefox `text-wrap-mode` and Safari comments); `#tasksWrapper { overflow: visible clip }`; the `#preStartHint` block is **renamed**, not deleted. |
| **TR-184** | `frontend/src/styles/animations.scss` | the `caretFlashSmooth` and `caretFlashHard` `@keyframes` |
| **TR-185** | `frontend/src/styles/index.scss` | `"caret"` from the `@import` list |
| **TR-186** | `frontend/static/themes/{aurora,fire,grape,phantom,rainbow_trail,rgb,solarized_osaka,trance}.css` (8 files) | `#tasks` → `#taskArena`; the six `--*-letter-color` / `--*-letter-animation` properties renamed per TR-019; `--extra-letter-animation` deleted (`rainbow_trail.css` only). `--caret-color` is **kept** in all 52 files (TR-020). This is a **C30 edit-class-(b) extension** and every edited file and every renamed property MUST be listed in the PR description, exactly as C30 requires. |
| **TR-187** | `frontend/static/themes/dark_note.css` | the `.colorfulMode` rule is **kept** — the class name survives (TR-247). |

### 9.4 Test-page TypeScript

| # | path | lines | what is removed |
|---|---|---|---|
| **TR-188** | `frontend/src/ts/test/test-ui.ts` | 466 | Rewritten. Deleted: `lettersHtml()`, `taskHtml()`, `maskedTaskHtml()`, `MASK_WIDTHS`, `VISIBLE_LINES`, `ACTIVE_LINE`, `RENDER_AHEAD`, `RENDER_BEHIND`, `LINE_JUMP_MS`, `lineHeight`, `streamOffset`, `lineJumpAnimation`, `getRenderWindow()`, `applyPreStart()`, `revealStream()`, `renderStream()`, `updateActiveAnswer()`, `updateActiveElement()`, `lineIndexOf()`, `scrollActiveIntoView()`, `resetStreamOffset()`, `measureLineHeight()`, `applyGeometry()`, `applyStreamStyles()`, the `window.addEventListener("resize", …)` handler, and every `Caret.*` call. Kept and adapted: `announceTask()` (per TR-145), `setTestState()`, `resultAttr()`, `setBlurred()`, `focusTasks()`, `showTestInitFailed()`, `hideTestInitFailed()`. |
| **TR-189** | `frontend/src/ts/test/test-logic.ts` | 432 | Deleted: the `Caret` import and all five `Caret.*` calls; `currentViews()`; the `TestUI.getRenderWindow` plumbing; `TestUI.applyPreStart()` / `revealStream()` / `updateActiveAnswer()`; the `if (next > 0 && next % 20 === 0) TestUI.renderStream(...)` runway re-render. Added: the dwell / `awaitingContinue` orchestration and the TR-071 `tStart` change. |
| **TR-190** | `frontend/src/ts/test/test-engine.ts` | 381 | `TaskView.state === "upcoming"` and the `given` field for non-active tasks become unreachable and MUST be removed from the type. `MIN_MATERIALISED_AHEAD = 60` is **kept** but its doc comment MUST be re-pointed from CP-045 ("the stream must never visibly run dry") to ME-158 (the rolling generation batch), which is the requirement that actually survives. |
| **TR-191** | `frontend/src/ts/states/test.ts` | 127 | Deleted: `isPreStart` / `setPreStart` (replaced by the `data-state` projection and the engine phase); `getAnswerLength` / `setAnswerLength` (existed only to position the custom caret); `outOfFocusMaxHeight` / `setOutOfFocusMaxHeight` (the warning is now `inset: 0` over the arena, TR-148). The file-header comment listing "passages, challenges, keymap resources, IME composition, RTL/Korean flags" MUST be rewritten. |
| **TR-192** | `frontend/src/ts/test/focus.ts` | 73 | the `Caret` import and the `Caret.stopAnimation()` / `Caret.startAnimation()` calls |
| **TR-193** | `frontend/src/ts/test/test-timer.ts` | 114 | `qs("#tasks")` → `qs("#taskArena")` for the `data-seconds-remaining` hook. No other change; the drift-corrected scheduler is kept verbatim. |
| **TR-194** | `frontend/src/ts/test/events/types.ts` | 86 | `EVENT_LOG_VERSION` `2` → `3`; the `taskShown` doc comment updated per TR-077. No type is added or removed. |
| **TR-195** | `frontend/src/ts/event-handlers/test.ts` | 36 | the `#tasksWrapper` click selector → `#taskArena` |
| **TR-196** | `frontend/src/ts/controllers/theme-controller.ts` | — | `qs("#tasks")` → `qs("#taskArena")` in both `noErrorBorder` branches |

### 9.5 The input pipeline

| # | path | lines | what is removed |
|---|---|---|---|
| **TR-197** | `frontend/src/ts/input/input-element.ts` | 47 | Rewritten against `#answerInput`. The file header describing "the hidden capture textarea (CP-053, CP-054)", the `HTMLTextAreaElement` type, and the "the element's value is never read … the textarea is a pure focus target" contract all go. `moveInputElementCaretToTheEnd()` is kept and becomes TR-091's selection-collapse helper. `clearInputElement()` is kept. |
| **TR-198** | `frontend/src/ts/input/listeners/key.ts` | 52 | the `event.isComposing` early return; the `Space` / `event.code === "Space"` branch of `isCommitKey()` (TR-132) |
| **TR-199** | `frontend/src/ts/input/listeners/input.ts` | 50 | the `insertCompositionText` branch; the `if (ch === " ") TestLogic.commitAnswer()` branch; the blanket "paste, drop and every other insertion mode are refused outright" fallthrough, replaced by TR-090's table |
| **TR-200** | `frontend/src/ts/input/listeners/misc.ts` | 22 | the `select` / `selectstart` `preventDefault()` loop (TR-094), and `copy` / `cut` removed from the prevented list. `paste` and `drop` stay prevented. |
| **TR-201** | `frontend/src/ts/input/hotkeys/utils.ts` | — | the doc comment about IME composition and `legacy-states/composition`; the `#tasksInput` reference in the `ignoreInputs` comment. Add TR-140's `data-state` guard. |
| **TR-202** | `frontend/src/ts/event-handlers/global.ts` | — | `focusTasks` retargeted at `#answerInput`. The autofocus keydown handler, the `pointerdown` focus restoration and the Space-scroll guard are all **kept**. |

### 9.6 Config: `smoothCaret` and `caretStyle` are struck

| # | path | what is removed |
|---|---|---|
| **TR-203** | `packages/schemas/src/configs.ts` | `SmoothCaretSchema` + `SmoothCaret`; `CaretStyleSchema` + `CaretStyle`; both fields from `ConfigSchema`; `"caret"` from `ConfigGroupNameSchema` (no key remains in that group) |
| **TR-204** | `frontend/src/ts/constants/default-config.ts` | `smoothCaret: "medium"`, `caretStyle: "default"`, and the `// caret (restored by master C11)` comment |
| **TR-205** | `frontend/src/ts/config/metadata.tsx` | `caretOptionsMetadata` (lines 160-166); the `smoothCaret` and `caretStyle` entries; the `// caret (restored by master C11)` section header |
| **TR-206** | `frontend/src/ts/commandline/commandline-metadata.ts` | the `smoothCaret` and `caretStyle` entries and the `//caret` comment |
| **TR-207** | `frontend/src/ts/commandline/lists.ts` | `...buildCommands("smoothCaret", "caretStyle")` and the `//caret (restored by master C11)` comment |
| **TR-208** | `frontend/src/ts/config/utils.ts` | the boolean-`smoothCaret` migration (`if (typeof configObj.smoothCaret === "boolean")`) and the mention in the doc comment. The other legacy migrations (`quickTab`, `swapEscAndTab`, `showAverage === "wpm"`, `showTimerProgress`, string `fontSize`, `accountChart` padding, `comfy` → `croco`) are **kept** — they repair stored configs for keys that still exist. |
| **TR-209** | — | `--caret-color`, `CustomThemeColorsSchema`'s 10-tuple and `ThemeModal.tsx`'s `<Picker color="caret" />` are all **KEPT** (TR-020). |
| **TR-210** | — | **Deploy hazard, MUST be handled.** `packages/contracts/src/configs.ts` declares `PATCH /configs` with `body: PartialConfigSchema.strict()`. A cached SPA that still sends `smoothCaret` / `caretStyle` will get a 422 from a newly deployed backend. Recommendation: relax that body to `PartialConfigSchema` (non-strict, which strips unknown keys) permanently — the frontend already sanitises with `.strip()` on read, so strictness on write buys nothing and breaks every removal. Flagged in §14. |

### 9.7 Components

| # | path | what changes |
|---|---|---|
| **TR-211** | `frontend/src/ts/components/pages/test/PreStartHint.tsx` | **Renamed** to `StartGate.tsx`, mount name `startgate`, root id `#startGate`. The component's logic — a real `start test` button, the 250 ms fade before unmount, the cancel-on-re-show effect — is kept. The name "hint" and the CP-048 `type a digit to start` lineage go. |
| **TR-212** | `frontend/src/ts/components/pages/test/OutOfFocusWarning.tsx` | the `outOfFocusMaxHeight()` inline `max-height` style, replaced by CSS `inset: 0` over `#taskArena` |
| **TR-213** | `frontend/src/ts/components/pages/test/AnswerSymbols.tsx` | the `#tasksInput` reference in the CP-194 comment; **add** TR-105's submit/continue button |
| **TR-214** | `frontend/src/ts/components/pages/test/live-stats/{LiveStatsTextTop,LiveStatsTextBottom,LiveStatsMini}.tsx` and `styles.tsx` | The three files collapse into one `TaskReadouts.tsx` rendering `#taskReadouts` per TR-031/TR-032. `TEXT_DISPLAY_CLASS`'s `text-[4rem] sm:text-[6rem] … xl:text-[10rem]`, `z-[-1]`, `h-0`, `w-0` and the negative-margin overlay geometry are **struck** (TR-037). `BarTimerProgress.tsx` is **kept unchanged** — `timerStyle: "bar"` is still the fixed top-of-viewport bar. `liveStatsTextColor()` / `liveStatsBgColor()` are kept. |
| **TR-215** | `frontend/src/ts/states/live-stats.ts` | kept in full. `getBarTarget`, `showLiveStats`, `getLiveSpeedText`, `getLiveAccText`, `getTimerText`, `getSecondsRemaining`, `isTimerFlashHidden` all keep their formulas. |

### 9.8 Documentation and comments

| # | path | what changes |
|---|---|---|
| **TR-216** | `frontend/src/ts/test/test-screenshot.ts` | the comment referring to "the per-character highlight overlays (CP-036)" |
| **TR-217** | `packages/math-engine/src/judge.ts` | **comment only.** The header's "No per-character validation or colouring (ME-152)" and "No auto-advance … `quickEnd` is not ported (ME-153)" are still true and MUST stay; add the TR-135 distinction so a future reader does not "fix back" the post-submit advance. **No executable line in `packages/math-engine` may change.** |
| **TR-218** | `frontend/src/ts/commandline/lists.ts`, `types.ts` | the comment inventories naming `lazyMode`, `minBurst`, `freedomMode`, `strictSpace`, `stopOnError`, `quickEnd`, `hideExtraLetters`, `capsLockWarning`, `monkeyPowerLevel`, `liveBurstStyle`, `tapeMode` are **kept**. Per master C44 these are the audit trail that records what was struck; deleting them would remove the evidence the removal happened. |

### 9.9 Tests

| # | path | disposition |
|---|---|---|
| **TR-219** | `frontend/__tests__/test/task-view.jsdom-spec.ts` (518) | **Rewritten.** The `preStart` mask describe, the `<letter>` markup describe and the `.hints hint` assertions go with their features. The "answers never reach the DOM" describe (C29) and the aria-live describe are **kept and rewritten** against the new selectors, and extended per TR-160/TR-161. |
| **TR-220** | `frontend/__tests__/test/task-stream-geometry.jsdom-spec.ts` (275) | **Deleted** (TR-181). |
| **TR-221** | `frontend/__tests__/test/test-engine.spec.ts` (463) | **Kept**, with two additions: the TR-071 `tStart` semantics, and the TR-074 proof that `interAnswerIntervals` is unaffected. The input-filter, judging, backspace, C29 and timer describes are unchanged. |
| **TR-222** | `frontend/__tests__/components/pages/test/PreStartHint.spec.tsx` (110) | **Renamed and rewritten** to `StartGate.spec.tsx`. Every existing behaviour assertion survives; only the ids and the CP-048 references change. |
| **TR-223** | `frontend/__tests__/test/result-handoff.jsdom-spec.ts`, `result-screen.jsdom-spec.ts` | **Fixture-only change** (TR-177). The DOM they hand-roll gains `#taskArena` / `#answerInput` and loses `#tasks` / `#tasksInput`. No assertion changes. |
| **TR-224** | `frontend/__tests__/constants/themes.spec.ts` | lines 41-43's `#words:not(.blind).colorfulMode .word letter.incorrect` selectors, and the `C30_REMOVED_SELECTORS` / `#tasks` audit at lines 285-305, updated for `#taskArena` and the TR-019 property names |
| **TR-225** | `frontend/__tests__/commandline/settings-commands.spec.ts` | `"changeSmoothCaret"` and `"changeCaretStyle"` removed from the expected command list |
| **TR-226** | `frontend/__tests__/root/config.spec.ts` | the `CaretStyleSchema` import and the two `caretStyle` cases (lines 121, 125) |
| **TR-227** | `frontend/__tests__/utils/config.spec.ts` | the two `smoothCaret` boolean-migration cases (lines 195-196) |
| **TR-228** | `packages/schemas/__tests__/config.spec.ts` | `"smoothCaret"` and `"caretStyle"` from the key list, the `CaretStyleSchema` import, and the options assertion at line 99 |
| **TR-229** | `frontend/__tests__/root/config-metadata.spec.ts` | the `caret` group expectation, if the group list is asserted |
| **TR-230** | new | `frontend/__tests__/test/task-arena.jsdom-spec.ts` — the state machine, the four `data-state` values, TR-024's no-shift assertion, TR-110's cancellable dwell, TR-118's arming delay, TR-123's reduced-motion timing, and TR-150's keyboard walk. |

### 9.10 Already clean — verified, no action

- **TR-231** The following were greped across `frontend/src`, `backend/src` and `packages/*/src` and appear
  **only inside comments that record their removal**, which C44 requires to stay:
  `quickEnd`, `stopOnError`, `blindMode`, `lazyMode`, `strictSpace`, `freedomMode`, `confidenceMode`,
  `indicateTypos`, `hideExtraLetters`, `capsLockWarning`, `monkeyPowerLevel`, `paceCaret`, `burst`,
  `rawWpm`, `keymap`, `tapeMode`, `liveBurstStyle`.
  There is **no live identifier** for any of them. The only live `CapsLock` reference is
  `frontend/src/ts/constants/modifier-keys.ts`, which lists it as a modifier key to ignore — correct and
  unrelated to typing tests.
- **TR-232** `backend/src/utils/misc.ts` `kogascore(wpm, acc, timestamp)` and `backend/src/dal/leaderboards.ts`'s
  `wpm` comments are **out of scope for this document**. They are leaderboard-scoring residue already tracked
  by DoD-07/C44 and are not in-run typing machinery.
- **TR-233** `frontend/src/ts/legacy-states/{glarses-mode,slow-timer,page-transition,connection}.ts` contain
  no typing machinery and are kept.

---

## 10. What is NOT changing

- **TR-234** The **header** — logo, nav, account menu, XP bar — is unchanged.
- **TR-235** The **settings bar** (`TestConfig.tsx`) is unchanged: eight controls, the three-pill layout, the
  fade to `pointer-events-none opacity-0` on focus, the `disabled` buttons, the mobile `test settings` button
  and modal, the hover-revealed share button, and `restartTestEvent` on every change.
- **TR-236** The **modes-notice strip** (`TestModesNotice.tsx`) is unchanged: repeated, result saving,
  average, PB, leaderboard eligibility.
- **TR-237** The **footer** — keytips, theme indicator, scroll-to-top — is unchanged. `showKeyTips` keeps its
  meaning.
- **TR-238** The **results page** is unchanged in every respect: layout, metrics, the chart and its axes and
  legend, the action row, the PB crown, the task history, the screenshot path, CP-188's data hooks.
- **TR-239** The **account, profile, leaderboard, friends and account-settings pages** are unchanged.
- **TR-240** All **52 themes** are kept. The only edits are TR-186's eight files, and they are a C30
  edit-class-(b) extension with the same PR-listing obligation.
- **TR-241** The **command palette** is unchanged except for the two removed caret commands (TR-207).
- **TR-242** The **overall minimalism** and monkeytype's restraint remain the design reference for
  everything, including the new arena.
- **TR-243** `theme`, `customTheme`, `customThemeColors`, `customBackground*`, `autoSwitchTheme`,
  `randomTheme`, `favThemes`, `themeLight`, `themeDark` are unchanged.
- **TR-244** `quickRestart`, `resultSaving`, `singleListCommandLine`, `showKeyTips`, `showOutOfFocusWarning`,
  `showAverage`, `showPb`, `alwaysShowDecimalPlaces`, `startGraphsAtZero`, `accountChart` are unchanged.
- **TR-245** `timerStyle`, `timerColor`, `timerOpacity`, `liveSpeedStyle`, `liveAccStyle`, `fontSize`,
  `fontFamily` are unchanged in domain and meaning; only where they render moves (§3.2).
- **TR-246** `maxLineWidth` is kept under its existing key name, retargeted per TR-025. See TR-256.
- **TR-247** `flipTestColors` and `colorfulMode` are kept. They have a direct math analogue — which of the
  prompt and the answer is emphasised, and whether the palette is the colourful variant — and they simply
  bind to the TR-019 property names instead of the letter ones.
- **TR-248** The eight arithmetic settings and `time` are untouched, as is every coupling rule, guard and
  default.

---

## 11. Test hooks and acceptance

- **TR-249** `#taskArena[data-state]` ∈ `{preStart, running, awaitingContinue, finished}` at all times
  (amends CP-186).
- **TR-250** `#taskArena[data-feedback]` ∈ `{none, correct, wrong}` at all times.
- **TR-251** `#taskArena[data-taskindex]` is the index of the task on screen; `#taskArena[data-result]` ∈
  `{correct, wrong}` while feedback is showing and is **absent** otherwise (amends CP-187).
- **TR-252** `#taskArena[data-seconds-remaining]` and `[data-timer][data-seconds-remaining]` are kept
  (CP-189).
- **TR-253** `[data-test-id="startTestButton"]` is kept.
- **TR-254** New grep assertions, to be added to `docs/REQUIREMENTS.md` §7.3:
  - `grep -rn "tasksInput\|#tasksWrapper\|paceCaret\|<letter\|letter>" frontend/src` returns nothing.
  - `grep -rn "letter-color\|letter-animation" frontend/src frontend/static` returns nothing.
  - `grep -rn "smoothCaret\|caretStyle" frontend/src packages/*/src` returns nothing.
  - `grep -rn "caret" frontend/src` returns only `caret-color` occurrences.
- **TR-255** **DoD-05 MUST be amended.** It currently asserts that `frontend/src/ts/elements/caret.ts` and
  `frontend/src/styles/caret.scss` **do exist**. After this change they MUST NOT exist, and both paths move
  from DoD-05's "these do exist" list to DoD-04's "these do not exist" list.
- **TR-256** Acceptance for the redesign, in addition to the existing DoD:
  1. `pnpm typecheck`, `pnpm lint`, `pnpm test` and `pnpm build-fe` all pass, with real pasted output.
  2. `packages/math-engine`'s 343 tests pass **unchanged** — no spec in that package is edited.
  3. The backend result-controller and anti-cheat suites pass unchanged.
  4. TR-150's keyboard walk passes.
  5. TR-160 and TR-161's C29 assertions pass.
  6. TR-126's reduced-motion timing assertion passes.
  7. TR-024's no-shift bounding-rect assertion passes.
  8. TR-140's `quickRestart: "enter"` guard has a passing test.
  9. The test page renders with no horizontal scrollbar at 320, 768, 1024 and 1920 px (DoD-34).
  10. All 52 themes render the arena with no invisible text (DoD-35).

---

## 12. What this supersedes, by ID

Recorded in `docs/REQUIREMENTS.md` §2 as **C45**. The originals are marked struck **in place** there, with a
pointer to this document; nothing is silently edited.

### 12.1 Struck outright

| ID | was | why |
|---|---|---|
| CP-030, CP-031, CP-032 | `#tasks` flex-wrap stream; `div.task[data-taskindex]`; `.prompt` + `.answer` with one `<letter>` per character | one task at a time; the letter rendering is a typing artefact (TR-016, TR-079) |
| CP-041 | the correct answer as a `0.5`-opacity hint beneath a committed wrong task | replaced by `#taskReveal` (TR-052), which is the primary information, not a decoration |
| CP-044 | three visible lines, the line jump, `activeWordTop` bookkeeping | no stream (TR-022) |
| CP-046, CP-047, CP-051 | the `preStart` blur, its extension to the whole stream, and its 0.25 s reveal transition | nothing is rendered pre-start, so there is nothing to blur (TR-038, TR-039) |
| CP-048 | the `type a digit to start` hint | replaced by the `start test` button (TR-040) |
| CP-053 | the hidden `<textarea id="tasksInput">` | replaced by a visible `<input id="answerInput">` (TR-079) |
| CP-067, CP-068, CP-069, CP-070 | the `#caret` element, its position after the last typed character, its four shapes, `smoothCaret` blink | the browser's native caret, themed with `--caret-color` (TR-020, TR-091) |
| CP-072 | RTL / joining-script caret handling | already gone; the caret it served is now gone too |
| the `Space` half of CP-037 and of ME-140 | Space commits, identically to Enter | typing muscle memory; Enter is the only submit key (TR-131, TR-132) |
| master **C11** | "the caret is KEPT; INV-068 / INV-160 are OVERRULED; `smoothCaret` and `caretStyle` are restored" | C11's stated premise was "CP-053 keeps the hidden capture textarea … so there is no native caret to see". That premise is withdrawn. **INV-068 and INV-160 are reinstated.** |
| master **C12** | "hidden-textarea capture + rendered `.answer` letters is normative" | the capture-textarea and letter-rendering halves are struck. **INV-051 is reinstated on its "single numeric answer input" clause only**; its "delete `#caret`" clause is now also correct. |

### 12.2 Amended, not struck

| ID | amendment |
|---|---|
| CP-019, CP-020 | the `#tasksWrapper` / `#tasks` / `#caret` / `#tasksInput` child list is replaced by TR-012's element set |
| CP-033, CP-034 | binding, unchanged, and now apply to `#taskPrompt`; TR-030 adds the display-only trailing-`=` strip |
| CP-035 | binding in substance; the four custom properties are renamed per TR-019 |
| CP-036 / ME-152 | **binding, unchanged, and still critical.** No pre-commit feedback of any kind. The post-submit animation complies because judgement has already happened (TR-046, TR-135) |
| CP-037 | Enter only; Space struck (TR-131, TR-132) |
| CP-038, CP-039, CP-040 | unchanged in substance; CP-040's classes become `data-feedback` / `data-result` (TR-011, TR-015) |
| CP-042 | binding, and strengthened: a committed task is not revisitable, and `#answerInput` is `readonly` in `awaitingContinue` (TR-056) |
| CP-043 | binding, applied to `#answerInput` (TR-028) |
| CP-045 | the *rendering* rationale is struck; the *generation* rule survives as ME-158 (TR-190) |
| CP-049 | binding in substance — the clock starts with the first task appearing — but there is no "reveal" any more; the two events are "start" and "render task 0" (TR-066) |
| CP-050 | binding: Tab, Escape, Enter, Space, arrows, function keys, bare modifiers, shortcuts, mouse movement, clicks, window focus and modal open/close MUST NOT start the run |
| CP-052 | binding: every restart path returns to `preStart` (TR-063) |
| CP-054 … CP-059 | binding, unchanged. §4.2 restates them; the engine remains the authority |
| CP-058a | binding, unchanged (TR-087) |
| CP-076 … CP-081 | binding; only the layout moves (§3.2) |
| CP-083, CP-084, CP-085 | binding; the blur applies to `#taskArena` and the `preStart` half of CP-084 is moot (TR-148, TR-149) |
| CP-086, CP-087, CP-088, CP-089 | binding, unchanged |
| CP-183 | binding; satisfied through `#taskAnnouncer` (TR-013, TR-145) |
| CP-184 | satisfied vacuously (TR-159) |
| CP-186, CP-187 | amended by TR-010 and TR-015 |
| CP-191 … CP-196 | binding; extended by TR-105's submit/continue button |
| ME-136 | "the first task MUST be generated before the test starts but MUST be visually blurred" — amended: it is generated but **not rendered** (TR-038). The stated intent (no pre-reading advantage) is fully preserved |
| ME-140 | Space struck; Enter commits (TR-132) |
| ME-153 | **PRESERVED.** TR-134 and TR-135 state exactly what it forbids and exactly why the post-submit advance is not that |
| ME-154, ME-156 | binding in substance — a wrong answer is marked wrong, coloured with the error colour, and the run advances to the next task with no retry and no penalty time. **Amended on one point:** the advance after a wrong answer now requires an explicit continue. This is not a "retry" (the task is committed and scored) and not "penalty time" (the timer runs, and the delay is entirely under the user's control) |
| ME-159 | binding; TR-071 makes `tStart` mean what ME-159 already said it meant |
| master **C13** | binding: timer + live acc + live tpm, no fourth readout. Only the layout moves (TR-031) |
| master **C29** | **binding, unchanged, and easier to satisfy.** §7 is the proof |
| master **C30** | extended by one edit class: the TR-019 property rename, with the same PR-listing obligation |
| master **C33** | binding; TR-097 and TR-098 state exactly where U+2212 appears and where it does not |
| DoD-05 | amended by TR-255 |

---

## 13. Ambiguity register — flagged, with recommendations

Each item below is a place where the user's instruction, the existing spec and the code did not
determine a single answer. A decision is recorded for each so implementation is not blocked; each is
individually reversible.

- **TR-257** **`Space` as a second submit key.** *Ambiguity:* the user said "SUBMIT = Enter" but did not
  explicitly strike Space, and CP-037 / ME-140 mandate it. *Decision:* **struck** (TR-132). *Why:* CP-037's
  own justification is monkeytype muscle memory, which is exactly what this document removes; and in the new
  design Space would need a second meaning in `awaitingContinue`. *Reversal cost:* one branch in `key.ts`
  and one in `input.ts`.
- **TR-258** **`maxLineWidth` retained under its old name.** *Ambiguity:* "line width" describes a wrapping
  text stream that no longer exists. *Decision:* **keep the key, retarget it** at the arena's `max-width`
  (TR-025), and change only its palette display string to `max width`. *Why:* it has a real analogue (it now
  visibly controls the rule's width), and renaming the key would strand every stored config and every synced
  remote config for no user-visible gain. *Alternative if the reviewer disagrees:* delete it; nothing else
  depends on it.
- **TR-259** **The trailing `=` in the prompt.** *Ambiguity:* the user's sketch shows `847 + 1293` with a
  rule below, no `=`; the engine emits `847 + 1293 =` and ME-174 checks that string. *Decision:* strip it
  **for display only** (TR-030); the logged and announced prompt stays verbatim. *Why:* matches the sketch
  exactly, and touching `renderPrompt` would force an engine-version bump that rejects every cached client.
- **TR-260** **`PATCH /configs` strictness.** *Ambiguity:* removing two config keys makes a stale cached SPA's
  config save 422 against the new backend. *Recommendation:* relax `packages/contracts/src/configs.ts`'s
  `body: PartialConfigSchema.strict()` to non-strict, permanently. The frontend already `.strip()`s on read,
  so write-side strictness protects nothing and breaks every future key removal the same way. *This is a
  WP-03 / WP-11 change and needs an owner ruling before the deploy, not before the code.*
- **TR-261** **Renaming the theme custom properties.** *Ambiguity:* C30 froze the 52 theme files to two edit
  classes, and `--correct-letter-color` is in `frontend/static`, which no DoD grep covers. *Decision:*
  **rename** (TR-019, TR-186). *Why:* the user's instruction to purge typing vocabulary is explicit and a
  live CSS custom property named `--correct-letter-color` in a math trainer is exactly that. *Cost:* 8 of 52
  files, mechanically. *If the reviewer prefers minimum churn:* keep the names and accept the vocabulary
  debt — nothing functional depends on the rename.
- **TR-262** **The `#tasksTest` container id.** *Ambiguity:* it is plural, and it was itself a rename of
  monkeytype's `#typingTest`. *Decision:* **leave it.** *Why:* it names the test *screen*, not the task
  stream; it is not typing vocabulary; and renaming it touches CP-019, `test-ui.ts`, `test.scss` and the
  init-failed panel for no benefit. Flagged only so the inconsistency with `#taskArena` is a recorded choice
  rather than an oversight.
