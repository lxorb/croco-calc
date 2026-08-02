# `__screenshots__/baseline/`

DoD-19 names this directory as the home of the SB-214 baseline for the settings bar, and requires that
it be regenerated only by an explicit, reviewed commit.

## What is here

`settings-bar-geometry.json` — the geometry of monkeytype's settings bar, captured from the pristine
reference checkout at the default theme (`serika_dark`): the four responsive custom properties
(`--card-gap`, `--font-size`, `--horizontal-padding`, `--vertical-padding`) with their base and
per-breakpoint values, their resolved values at the four SB-214 widths (849 / 1105 / 1361 / 1617 px),
and the card / control / container class sets that carry the radii and paddings.

`frontend/__tests__/components/pages/test/TestConfigGeometry.spec.tsx` diffs croco calc's bar against it.

## Why geometry and not a PNG

DoD-19 is explicit that the SB-214 diff **measures geometry, not content** — "card radii, gaps,
paddings and font sizes (SB-081–083)" — and that "label text and icons necessarily differ and MUST be
masked out of the comparison region before diffing". Once the labels and icons are masked, everything
the comparison can still see in this bar is produced by the declarations recorded in the baseline: the
two trees share the same Tailwind v4 setup, the same `--breakpoint-*` scale, the same theme variables
and the same `.card` / text-button utilities. Comparing the declarations therefore fails on exactly the
changes a masked pixel diff would fail on, while being deterministic, browser-free and runnable in CI.

The four SB-214 widths are not arbitrary sample points: 849 / 1105 / 1361 / 1617 are monkeytype's
`md` / `lg` / `xl` / `2xl` breakpoints (`frontend/src/styles/tailwind.css`). Sampling all four covers
every responsive branch the bar declares.

## What this does not cover

A rendered-pixel regression that leaves every declaration intact — a change to a global reset, to the
font metrics, or to a utility's definition inside Tailwind itself. Closing that gap needs the literal
side-by-side PNG diff at ≤ 0.5 % of pixels differing by more than 2/255 per channel, which needs a
headless browser plus a running monkeytype reference to capture the baseline from. That leg is **not
implemented**; see the open task "SB-214 pixel baseline".

## Regenerating

1. Check out the pristine monkeytype reference.
2. Re-read `frontend/src/ts/components/pages/test/TestConfig.tsx` (`variables`, `buttonClass`,
   `cardClass`, and the three pill wrappers) and `frontend/src/styles/tailwind.css` (`--breakpoint-*`).
3. Update `settings-bar-geometry.json` and commit it on its own, with the reference revision in the
   commit message.
