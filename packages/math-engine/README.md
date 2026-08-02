# `@croco-calc/math-engine`

The mathematical heart of croco calc: task generation, answer judging, result
metrics and the anti-cheat primitives. Pure, dependency-free and fully
unit-tested.

Spec: `docs/requirements/01-math-engine.md` (**ME-001 … ME-184**), plus the
rulings **C2, C3, C21, C26, C28, C32, C33, C36, C39, C40** in
`docs/REQUIREMENTS.md` §2, which override the source document where they differ.

## Why it is a package and not a frontend module

The backend has to regenerate the exact task sequence from
`(mathSeed, mathSettings)` to revalidate a submitted result (ME-171, ME-174), so
the code cannot live under `frontend/src` (C26). The frontend's
`test/task-generator.ts` is a thin adapter over this package.

## Guarantees

| Guarantee | Requirement |
| --- | --- |
| No unseeded platform RNG, no DOM, no network, no `Date.now` | ME-002, ME-166 |
| All arithmetic is exact rationals; no floats, no epsilon, no `BigInt` | ME-020 … ME-025 |
| The same `(seed, index, settings)` always produces the same task | ME-008, ME-170 |
| Frontend and backend produce byte-identical streams (mulberry32) | ME-167 |
| No division task ever leaves a remainder | ME-055 |
| A displayed fraction is always proper and in lowest terms | ME-061 … ME-063, ME-077 |
| A decimal task is never "just a normal task" | ME-100, ME-101 |
| Both operands negative is structurally impossible | ME-111 |
| Zero enabled generators throws `MathGenError`, never returns empty | ME-016 |

## Entry points

```ts
import {
  generateTask,        // ME-008 — pure (seed, index, settings) -> Task
  generateSequence,    // the canonical 0..n-1 sequence (server revalidation)
  createTaskBatcher,   // ME-158 — the rolling 60/30/15 batch
  isAnswerCorrect,     // ME-147 — exact rational judging
  commitAnswer,        // CP-058a + ME-141 + judging, in one call
  MathGenError,
  createPrng,          // ME-167 — mulberry32
  GOLDEN_VECTORS,      // ME-178 — the shared cross-runtime fixture
} from "@croco-calc/math-engine";
```

`src/index.ts` is the full surface; the settings model (`DEFAULT_MATH_SETTINGS`,
`applyCoupling`, `cycleSetting`, `wouldBeAllOff`) is consumed by the settings bar,
and the anti-cheat surface (`checkPlausibility`, `revalidateResult`,
`checkEngineVersion`) by the backend.

## Bumping the version

ME-184: any change to **generation, mixing or judging** semantics must bump
`version` in `package.json` **and** `MATH_ENGINE_VERSION` in `src/version.ts`
**and** the backend's `COMPATIBILITY_CHECK_HEADER` value, in the same commit.
Move the old version into `PREVIOUS_MATH_ENGINE_VERSION` so the rollout window
still accepts it. Cosmetic-looking changes count — operator glyphs feed `prompt`,
which ME-174 verifies.

## Tests

```
pnpm --filter @croco-calc/math-engine test
```

`__tests__/edge-cases.spec.ts` has one named test per row of doc 01's 40-row
edge-case table; `__tests__/properties.spec.ts` runs the >= 100 000-task property
tests; `__tests__/purity.spec.ts` enforces ME-002/ME-166 over the source tree.
