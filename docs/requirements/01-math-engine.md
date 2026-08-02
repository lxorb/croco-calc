# croco calc — Math Task Generation Requirements

Owner: math engine
Status: authoritative for stage 2 implementation
Requirement ID range: **ME-001 … ME-184** (184 requirements, sequential, no gaps). ME-179 … ME-184 were added in revision 2 of the master document (§17.1 plausibility thresholds, §17.2 engine-version/compatibility bump).

All requirements use RFC-2119 style keywords. "MUST" is binding on stage-2 implementers.
Every requirement is written to be independently testable.

Sections 19 and 20 collect the **ASSUMPTION** register and the **cross-team blockers**.

---

## 0. Grounding in the monkeytype reference

Every claim below about monkeytype's existing behaviour was read in the imported checkout at
`C:\Users\me\Projects\calc-trainer` (identical to the read-only reference checkout).

| Claim | Source path (read) |
| --- | --- |
| Word generation is driven by `generateWords()` / `getNextWord()`, which fill a `words` list up to a limit | `frontend/src/ts/test/words-generator.ts` lines 615-734, 749 |
| The RNG is unseeded — literally `const random = Math.random;` | `frontend/src/ts/test/words-generator.ts` line 39 |
| Time-mode pre-generates a batch of 100 words and extends during the test | `frontend/src/ts/test/words-generator.ts` lines 428-503 (`getLimit()`) |
| A test item ("word") is `{ text, textWithCommit, commit, display, sectionIndex }`; commit characters are `" "` and `"\n"` | `frontend/src/ts/test/test-words.ts` lines 3-13, 52-72 |
| Word pools are wrapped in a `Wordset` with `randomWord` / `shuffledWord` / `nextWord` | `frontend/src/ts/test/wordset.ts` |
| Funboxes may replace word generation entirely via a `getWord(wordset, wordIndex)` hook | `frontend/src/ts/test/funbox/funbox-functions.ts` lines 33, 176-186, 247-250 |
| Correctness is judged per character against the target word; commit advances the word | `frontend/src/ts/input/helpers/validation.ts` lines 12-30, 41-80 |
| A leading separator on empty input does **not** skip a word under `strictSpace` / non-normal difficulty | `frontend/src/ts/input/helpers/validation.ts` lines 58-66 |
| Default `stopOnError` is one of `"off" \| "word" \| "letter"`; incorrect words still advance when `"off"` | `packages/schemas/src/configs.ts` line 92; `frontend/src/ts/input/helpers/validation.ts` lines 70-77 |
| `quickEnd` finishes early only when `stopOnError === "off"` | `frontend/src/ts/input/helpers/fail-or-finish.ts` lines 98-110 |
| Difficulty enum is `normal \| expert \| master` | `packages/schemas/src/shared.ts` lines 6-7 |
| Config is a single flat zod object (`punctuation`, `numbers`, `time`, `mode`, `difficulty`, …) | `packages/schemas/src/configs.ts` lines 395-445; `TimeConfigSchema` line 358 |
| Results carry `wpm`, `rawWpm`, `charStats`, `acc`, `consistency`, `chartData`, plus an anti-cheat `hash` | `packages/schemas/src/results.ts` lines 62-98, 124-154 |
| Server recomputes `objectHash(result minus hash)` and rejects on mismatch; also rejects duplicate hashes | `backend/src/api/controllers/result.ts` lines 219-238, 408-429 |
| Server rejects `acc < 75` for non-opt-out users; schema floors accuracy at 50 | `backend/src/api/controllers/result.ts` lines 215-217; `packages/schemas/src/results.ts` line 74 |
| Server rejects impossible/duplicate funbox combinations — precedent for validating impossible settings combinations | `backend/src/api/controllers/result.ts` lines 240-246 |
| `randomIntFromRange(min, max)` is inclusive on both ends and uses `Math.random` | `packages/util/src/numbers.ts` lines 85-96 |
| Large per-key arrays are replaced by the literal `"toolong"` when they would bloat the payload | `packages/schemas/src/results.ts` lines 143-144; `frontend/src/ts/test/test-logic.ts` lines 1106-1108 |
| Monorepo package naming convention is `@monkeytype/<name>` under `packages/*` | `packages/*/package.json`, `pnpm-workspace.yaml` |

**Key consequence:** monkeytype has **no seeded RNG anywhere** (`grep -rn "seed" frontend/src/ts/test frontend/src/ts/utils packages/util/src` returns nothing). Deterministic generation therefore has to be introduced by croco calc from scratch — see section 17.

---

## 1. Scope and terminology

- **ME-001** The math engine MUST be implemented as a standalone workspace package at `packages/math-engine`, named `@crococalc/math-engine`, following the existing convention of `packages/*` being consumed by both `frontend` and `backend` (`pnpm-workspace.yaml`, `packages/*/package.json`).
- **ME-002** The math engine MUST be pure: no DOM access, no network access, no `Date.now()`, no `Math.random()`. All randomness MUST come from an injected PRNG instance (section 17).
- **ME-003** A **Task** is the croco calc analogue of monkeytype's `Word` (`frontend/src/ts/test/test-words.ts` lines 3-11). A Task MUST be a value object exposing at minimum: `index`, `kind`, `prompt` (display string), `answer` (exact rational, section 3), `answerDisplay` (canonical answer string), and `operands` (structured, for replay/debug).
- **ME-004** A **task kind** is one of exactly: `add`, `mul`, `div`, `fracAdd`, `fracMul`, `decimal`. There MUST be no other kinds.
- **ME-005** An **operand** is one signed number: an integer, a decimal, or a proper fraction. A fraction counts as **one** operand (this is load-bearing for negatives, ME-152).
- **ME-006** The **settings snapshot** is the frozen set of the 8 settings-bar values at the moment the test starts. Generation MUST depend only on the snapshot, never on live config, so that mid-test config changes cannot alter already-scheduled tasks.
- **ME-007** Changing any of settings 1-7 while a test is in progress MUST restart the test (monkeytype restarts on config change that affects word generation; same behaviour required here).
- **ME-008** The math engine MUST expose exactly one generation entry point of the shape `generateTask(seed, index, settings) -> Task`, plus a batching helper. `generateTask` MUST be a **pure function** — same inputs always produce the identical Task (see ME-170).

---

## 2. Settings model, values and defaults

- **ME-009** The math engine MUST consume settings via the following exact keys and string-literal values (these are the canonical config keys for the whole app):

| Key | Values (cycle order, left to right, wrapping) | Settings-bar label per state | Default |
| --- | --- | --- | --- |
| `addition` | `"off"` → `"100"` → `"1000"` | `+100` (struck) / `+100` / `+1000` | `"1000"` |
| `multiplication` | `"off"` → `"12"` → `"20"` → `"100"` | `12x12` (struck) / `12x12` / `20x20` / `100x100` | `"100"` |
| `division` | `"off"` → `"tables"` → `"free"` | `/` (struck) / `144/12` / `xxx/xx` | `"free"` |
| `fractionAddition` | `"off"` → `"12"` → `"99"` | `+1/12` (struck) / `+1/12` / `+1/xx` | `"99"` |
| `fractionMultiplication` | `"off"` → `"on"` | `*x/y` (struck) / `*x/y` | `"on"` |
| `decimals` | `"off"` → `"on"` | `4.2` (struck) / `4.2` | `"on"` |
| `negatives` | `"off"` → `"on"` | `-` (struck) / `-` | `"on"` |
| `time` | `1` → `2` → `4` → `8` | `1` / `2` / `4` / `8` (minutes) | `8` |

- **ME-010** Each control MUST cycle forward on click, wrapping from the last state back to the first, exactly as monkeytype's time control cycles 1→2→4→8 per the brief.
- **ME-011** The default settings above MUST be the shipped defaults for a new/anonymous user and MUST be what "reset settings" restores.
- **ME-012** The settings MUST be validated by a zod schema in `packages/schemas` in the same style as `ConfigSchema` (`packages/schemas/src/configs.ts` lines 395-445), so backend and frontend share one definition.
- **ME-013** `time` MUST be expressed in **minutes** in the settings and converted to seconds (`time * 60`) only at the test-timer boundary. Monkeytype's `TimeConfigSchema` is a nonnegative integer of seconds (`packages/schemas/src/configs.ts` line 358); croco calc MUST persist minutes and MUST NOT reuse monkeytype's second-based values.
- **ME-014** A **task-producing control** is one of `addition`, `multiplication`, `division`, `fractionAddition`, `fractionMultiplication`. `decimals` and `negatives` are **modifiers** and `time` is neither.
- **ME-015** At least one task-producing control MUST be non-`"off"` at all times. When exactly one task-producing control is non-`"off"`, that control's `"off"` state MUST be **skipped** in its click cycle (e.g. with only `addition` enabled, clicking cycles `"100"` → `"1000"` → `"100"` → …). This mirrors monkeytype's refusal of impossible configurations (`backend/src/api/controllers/result.ts` lines 240-246).
- **ME-016** The engine MUST throw a typed `MathGenError` (analogous to `WordGenError`, imported at `frontend/src/ts/test/words-generator.ts` line 25 and thrown at lines 438, 511, 718) if asked to generate with zero enabled task-producing controls. It MUST NOT silently return an empty list.

### Leaderboard eligibility

- **ME-017** A run MUST be flagged `defaultSettings: true` if and only if `addition === "1000"`, `multiplication === "100"`, `division === "free"`, `fractionAddition === "99"`, `fractionMultiplication === "on"`, `decimals === "on"`, `negatives === "on"`. `time` MUST be **excluded** from this equality check.
- **ME-018** A run MUST be leaderboard-eligible if and only if `defaultSettings === true` **and** `time ∈ {4, 8}`. This encodes the brief's "only runs made with the DEFAULT settings count" plus "time options are ONLY 4 and 8".
- **ME-019** `defaultSettings` MUST be computed on the **server** from the submitted settings snapshot, never trusted from a client flag.

---

## 3. Core numeric invariants

- **ME-020** All internal arithmetic in the math engine MUST be exact. Values MUST be represented as a reduced rational `{ n: integer, d: positive integer }` (or an equivalent integer-mantissa/decimal-exponent pair). Binary floating point MUST NOT be used for any generated value, any expected answer, or any correctness comparison.
- **ME-021** Rationale for ME-020, and a required regression test: `0.1 + 0.2 !== 0.3` in IEEE-754. Frontend and backend must agree bit-for-bit for server-side revalidation (section 17), which floating point cannot guarantee across engines.
- **ME-022** All engine-internal integers MUST remain within JavaScript's safe integer range. The engine MUST NOT use `BigInt`. Proof obligation, which MUST be covered by a test: the largest magnitudes reachable are — operand ≤ 1000, product ≤ 10 000, fraction denominator ≤ 10 000, fraction numerator ≤ 9 801, decimal mantissa ≤ 10 000, decimal denominator ≤ 10^6. With the input caps of ME-133 the largest comparison intermediate is 10^7 × 10^7 = 10^14 < 2^53 ≈ 9.007 × 10^15.
- **ME-023** For task kinds `add`, `mul`, `div` and `decimal`, the exact answer MUST always be a **terminating** decimal. The engine MUST NEVER emit such a task whose exact answer is a repeating decimal. (This is guaranteed by ME-055 remainder-freeness plus the power-of-ten scaling of ME-103/ME-104/ME-105; it MUST be asserted by a property test over ≥ 100 000 generated tasks.)
- **ME-024** For task kinds `fracAdd` and `fracMul`, the exact answer MAY be a non-terminating decimal (e.g. `1/3`) and MUST be judged as a rational, never as a rounded decimal.
- **ME-025** Rounding MUST NOT be applied anywhere in generation or judging. There MUST be no epsilon tolerance in correctness comparison.
- **ME-026** Division by zero MUST be structurally impossible in generation: every generated divisor and every generated denominator has magnitude ≥ 2 (ME-043, ME-046, ME-048, ME-059, ME-075). Negation never produces zero (ME-116).

---

## 4. Setting 1 — Normal addition

- **ME-027** `addition === "off"`: the engine MUST NOT emit `add` tasks and MUST NOT use addition as a decimal base (ME-108).
- **ME-028** `addition === "100"`: the operand pair `(a, b)` MUST be drawn **uniformly at random from the set** `S100 = { (a, b) ∈ ℤ² : a ≥ 2, b ≥ 2, 11 ≤ a + b ≤ 100 }`.
- **ME-029** `addition === "1000"`: the operand pair `(a, b)` MUST be drawn **uniformly at random from the set** `S1000 = { (a, b) ∈ ℤ² : a ≥ 10, b ≥ 10, 101 ≤ a + b ≤ 1000 }`.
- **ME-030** "Uniform over the set" in ME-028/ME-029 MUST be implemented either by rejection sampling (draw `a`, `b` independently from their allowed single-operand ranges, reject and redraw while the constraint fails, hard cap 200 attempts) or by uniform indexing into the enumerated pair set. Both MUST yield the same distribution; a chi-squared test over the pair set MUST pass.
- **ME-031** Derived bounds that MUST hold and MUST be asserted in tests: for `"100"`, `2 ≤ a, b ≤ 98` and `11 ≤ a + b ≤ 100`. For `"1000"`, `10 ≤ a, b ≤ 990` and `101 ≤ a + b ≤ 1000`.
- **ME-032** The exact answer of an `add` task MUST be `a + b` before negation (ME-109 ff.).
- **ME-033** There MUST be no dedicated subtraction setting. Subtraction is produced exclusively by the negatives modifier: `a + (-b)`. Implementers MUST NOT add a subtraction task kind.
- **ME-034** Operand order MUST NOT be re-randomised after drawing; `(a, b)` is emitted in draw order (addition is commutative, so this only affects display).

**ASSUMPTION A1** — see section 19: `+100` / `+1000` are read as the German didactic *Zahlenraum bis 100 / bis 1000* (the whole task including the result stays inside the range), not "each operand may be up to 100/1000".

**ASSUMPTION A2** — the floors (`a+b ≥ 11` for `"100"`, `a+b ≥ 101` and operands `≥ 10` for `"1000"`) are added by this spec so the two states occupy **disjoint difficulty bands**. Without a floor, `"+1000"` would frequently emit `3 + 4` and be indistinguishable from `"+100"`.

---

## 5. Setting 2 — Multiplication

- **ME-035** `multiplication === "off"`: the engine MUST NOT emit `mul` tasks, MUST NOT use multiplication as a decimal base, and MUST force `fractionMultiplication` to `"off"` (ME-084).
- **ME-036** Let `N` be `12`, `20` or `100` for states `"12"`, `"20"`, `"100"` respectively.
- **ME-037** Both factors `a` and `b` MUST be drawn **independently and uniformly** from the inclusive integer range `[2, N]`.
- **ME-038** `0` and `1` MUST be excluded as factors (they make the task trivial and, for `1`, would make the "×" nature invisible).
- **ME-039** The exact answer of a `mul` task MUST be `a × b` before negation. Derived answer bounds that MUST be asserted: `"12"` → `[4, 144]`; `"20"` → `[4, 400]`; `"100"` → `[4, 10000]`.
- **ME-040** Squares (`a === b`) MUST be permitted.
- **ME-041** The value of `N` MUST also be the bound consumed by fraction multiplication (ME-074).

---

## 6. Setting 3 — Division

### 6.1 State `"tables"` (label `144/12`)

- **ME-042** State `"tables"` MUST generate divisions drawn entirely from the 1×1 … 12×12 times tables (Einmaleins), so that the quotient is always an integer.
- **ME-043** Algorithm: draw the divisor `d` uniformly from `[2, 12]`; draw the quotient `q` uniformly from `[2, 12]`; set the dividend `n = d × q`. Emit prompt `n ÷ d`, exact answer `q`.
- **ME-044** Derived bounds that MUST be asserted: `4 ≤ n ≤ 144`, `2 ≤ d ≤ 12`, `2 ≤ q ≤ 12`. The maximum dividend `144` and maximum divisor `12` exactly match the control's own label `144/12`.
- **ME-045** The `"tables"` range MUST be **fixed at 1…12** and MUST NOT vary with the `multiplication` setting.
  Justification: the control's label is the literal string `144/12`. The brief requires every control to be "ALWAYS identifiable as to which option it belongs to"; a control labelled `144/12` that silently generated `400 ÷ 20` would break that contract. This is deliberately the **opposite** of fraction multiplication (ME-074), whose label `*x/y` carries no numbers precisely *because* the brief says its bounds follow the multiplication setting.
- **ME-046** `1` and `0` MUST be excluded as divisor and as quotient (`n ÷ 1` and `n ÷ n` are trivial; `0` is undefined/degenerate).

### 6.2 State `"free"` (label `xxx/xx`)

- **ME-047** State `"free"` MUST generate divisions with a 3-digit dividend, a divisor of at most 2 digits, and never a remainder.
- **ME-048** Algorithm (this exact two-stage procedure is normative):
  1. Draw the divisor `d` uniformly from `[2, 99]`.
  2. Compute `qMin = max(2, ceil(100 / d))` and `qMax = floor(999 / d)`.
  3. Draw the quotient `q` uniformly from `[qMin, qMax]`.
  4. Set the dividend `n = d × q`.
- **ME-049** ME-048 guarantees integrality by construction (the dividend is *built* from divisor × quotient) and guarantees `100 ≤ n ≤ 999`. Implementers MUST NOT instead draw a dividend and test for divisibility.
- **ME-050** The interval `[qMin, qMax]` MUST be proven non-empty for every `d ∈ [2, 99]` by test: worst cases are `d = 2 → [50, 499]` and `d = 99 → [2, 10]`.
- **ME-051** Derived bounds that MUST be asserted: `100 ≤ n ≤ 999`, `2 ≤ d ≤ 99`, `2 ≤ q ≤ 499`.
- **ME-052** The dividend MUST be 3-digit (`≥ 100`). A 2-digit dividend would collapse this state into the `"tables"` band and make the label `xxx/xx` false.
- **ME-053** Single-digit divisors (`d ∈ [2, 9]`) MUST be permitted. "max 2-digit" in the brief is an upper bound, not an exact width, and tasks like `738 ÷ 9 = 82` are valuable. This is recorded as **ASSUMPTION A3**.
- **ME-054** ME-048 is deliberately **not** uniform over the set of valid `(d, q)` pairs (uniform-over-pairs would make tiny divisors dominate). The two-stage distribution is normative and MUST be what tests assert.
- **ME-055** Every generated `div` task, in both states, MUST satisfy `n mod d === 0`. This MUST be asserted by a property test over ≥ 100 000 tasks.

---

## 7. Setting 4 — Fraction addition

- **ME-056** Let `D` be the configured maximum common denominator: `D = 12` for state `"12"` (label `+1/12`), `D = 99` for state `"99"` (label `+1/xx`, "two-digit").
- **ME-057** The engine MUST choose two fractions `n1/d1` and `n2/d2` such that `lcm(d1, d2) ≤ D`. `lcm(d1, d2)` is exactly "the denominator the two fractions must be brought onto", which is what the brief says the setting bounds.
- **ME-058** Denominator selection: `(d1, d2)` MUST be drawn uniformly from the set `P(D) = { (d1, d2) ∈ ℤ² : 2 ≤ d1, d2 ≤ D, d1 ≠ d2, lcm(d1, d2) ≤ D }`. This set is small (≤ 98² candidates) and MUST be precomputed once per `D` at module load.
- **ME-059** Both denominators MUST be `≥ 2`. A denominator of `1` is forbidden because it would force the numerator to `0` (numerator must be `< ` denominator and `≥ 1`).
- **ME-060** `d1 ≠ d2` MUST hold. If the denominators were equal there would be nothing to "bring onto a common denominator", which is the entire exercise the setting names. Recorded as **ASSUMPTION A4**.
- **ME-061** Numerator selection: `n1` MUST be drawn uniformly from `{ x ∈ [1, d1 - 1] : gcd(x, d1) = 1 }`, and `n2` likewise for `d2`.
- **ME-062** Numerators MUST satisfy `1 ≤ n < d` (strictly smaller than the denominator, per the brief; and `≥ 1` so no zero fraction is displayed). Only **proper** fractions are ever displayed.
- **ME-063** Both displayed fractions MUST be in lowest terms (`gcd(n, d) = 1`, enforced by ME-061).
  Justification: (a) if `2/4` could be displayed, its *effective* denominator is `2`, so `lcm` of the displayed denominators would overstate the real work and the setting's bound would become ill-defined; (b) an unreduced input fraction reads as a mistake in a math trainer.
- **ME-064** The exact answer MUST be `n1/d1 + n2/d2` computed as an exact rational and stored **in fully reduced form** with a positive denominator.
- **ME-065** The exact answer MAY be improper (`> 1`), e.g. `3/4 + 5/6 = 19/12`. Improper results MUST be permitted, MUST NOT be re-drawn, and MUST NOT be converted to a mixed number.
- **ME-066** The exact answer MAY be an integer (e.g. `1/6 + 5/6 = 1`). Integer results MUST be permitted.
- **ME-067** Derived bounds that MUST be asserted: for `D = 12`, the reduced answer denominator is `≤ 12` and the answer value is `< 2`; for `D = 99`, the reduced answer denominator is `≤ 99` and the answer value is `< 2`.

### 7.1 Answer format for fraction results — recommendation

- **ME-068** **RECOMMENDED AND NORMATIVE:** an answer to a fraction task MUST be accepted if and only if its **exact rational value** equals the exact answer. Reduced and unreduced forms MUST both be accepted (`1/2`, `2/4`, `50/100` are all correct for `1/2`).
  Justification: the exercise the setting trains is *finding the common denominator and adding the numerators*. The natural output of that work is the **unreduced** `19/12`-style fraction. Forcing reduction would bolt a second, unrelated skill onto every task and would mark a correct sum wrong, which is hostile in a speed trainer.
- **ME-069** When the exact answer is an integer, a bare integer MUST be accepted (`1` for `1/6 + 5/6`), as MUST any equal fraction (`2/2`, `12/12`).
- **ME-070** A decimal answer MUST be accepted when it is **exactly** equal (`0.5` for `1/2`). It MUST be rejected when merely close (`0.333` for `1/3`), per ME-025.
- **ME-071** **Mixed numbers (e.g. `1 7/12`) MUST NOT be accepted.**
  Justification: monkeytype commits the current item on the space character (`frontend/src/ts/test/test-words.ts` lines 13, 52-60 — commit chars are `" "` and `"\n"`). A space inside an answer is structurally impossible without rewriting the input model. Value-equality judging (ME-068) already gives the learner every non-space form they could want, so nothing is lost.
- **ME-072** The `answerDisplay` shown in the results/history for a fraction task MUST be the **fully reduced** `p/q` form (or a bare integer if the denominator reduces to 1), so learners always see the canonical form even though they are not forced to type it.

---

## 8. Setting 5 — Fraction multiplication and its coupling

- **ME-073** `fractionMultiplication` has exactly two states: `"off"` and `"on"` (label `*x/y`).
- **ME-074** Bounds MUST follow the `multiplication` setting's max size `N` (12, 20 or 100), per the brief.
- **ME-075** Both denominators MUST be drawn independently and uniformly from `[2, N]`. Unlike fraction addition, `d1 === d2` MUST be permitted (no common denominator is needed for multiplication).
- **ME-076** Both numerators MUST be drawn per ME-061 (uniform over the coprime residues in `[1, d - 1]`), so both displayed fractions are proper and reduced.
- **ME-077** The `numerator < denominator` invariant applies here too. Recorded as **ASSUMPTION A5**: the brief states it under setting 4, but it is read as a global invariant on how croco calc displays fractions.
- **ME-078** The exact answer MUST be `(n1 × n2) / (d1 × d2)` computed exactly and stored fully reduced.
- **ME-079** Derived bounds that MUST be asserted: unreduced denominator `≤ N²` (max `10 000` at `N = 100`), unreduced numerator `≤ (N-1)²` (max `9 801`). The answer is always a proper fraction in `(0, 1)` before negation, and is never an integer and never zero.
- **ME-080** Note for reviewers (non-normative): the coupling in the brief is coherent precisely because computing `n1·n2` and `d1·d2` **is** a multiplication of the size configured by setting 2. This confirms the reading in ME-074.
- **ME-081** Answer format and judging for `fracMul` MUST be identical to fraction addition (ME-068 … ME-072).

### 8.1 Coupling rules (normative, exhaustive)

- **ME-082** Setting `fractionMultiplication` to `"on"` while `multiplication === "off"` MUST atomically set `multiplication` to a non-`"off"` state in the same user action.
- **ME-083** The state chosen by ME-082 MUST be `"12"`. Recorded as **ASSUMPTION A6** — the brief does not say which state. `"12"` is chosen because a forced-on control should land in its gentlest state and the user can cycle it up. Implementers MUST NOT implement a "remember last non-off value" behaviour in v1 (hidden state harms testability and result reproducibility).
- **ME-084** Setting `multiplication` to `"off"` MUST atomically set `fractionMultiplication` to `"off"` in the same user action.
- **ME-085** Cycling `multiplication` between two non-`"off"` states (e.g. `"12"` → `"20"`) MUST leave `fractionMultiplication` untouched; only the bound `N` changes.
- **ME-086** Cycling `multiplication` from `"100"` to `"off"` triggers ME-084. Continuing to cycle `multiplication` from `"off"` to `"12"` MUST **NOT** re-enable `fractionMultiplication`. There is no memory of the previous coupling.
- **ME-087** Setting `fractionMultiplication` to `"off"` MUST NOT change `multiplication`.
- **ME-088** ME-082/ME-084 MUST be implemented as a single transactional config update that emits one config-change event, so ME-007 (restart on change) fires exactly once.
- **ME-089** ME-015 (last-control guard) MUST be evaluated **after** the coupling in ME-084 is applied. Consequence: `multiplication` cannot be switched off if `fractionMultiplication` is the only other enabled producer, because switching it off would leave zero producers.

---

## 9. Setting 6 — Decimals

Decimals is a **modifier that produces its own task kind**. Recorded as **ASSUMPTION A7**: the brief's phrase "when a decimal task appears" is read as decimal tasks forming their own population in the mix (a sixth selectable kind), rather than every add/mul/div task having a chance to be decimalised.

- **ME-090** `decimals === "off"`: the `decimal` kind MUST NOT be selectable.
- **ME-091** `decimals === "on"`: a `decimal` task MUST first pick a **base kind** uniformly at random from the *currently enabled* subset of `{ add, mul, div }`.
- **ME-092** If none of `addition`, `multiplication`, `division` is enabled, the `decimal` kind MUST be treated as **not enabled** for mixing purposes (it is inert), regardless of `decimals === "on"`.
- **ME-093** Decimals MUST NOT be applied to `fracAdd` or `fracMul` tasks. The brief scopes it to "types 1-3".
- **ME-094** The base task MUST be generated by the *unmodified* generator for that kind, using that kind's currently configured state (so a decimal division uses `"tables"` or `"free"` exactly as configured).

### 9.1 The decimal-point shift

- **ME-095** For an operand with integer value `A` and decimal digit count `k = number of digits in |A|` (trailing zeros count: `A = 100` has `k = 3`), the **shift** `s` is the number of digits moved to the right of the decimal point. The shifted operand value is exactly `A / 10^s`.
- **ME-096** `s = 0` means "point after the last digit" — i.e. no decimal point at all, operand unchanged. `s = k` means "point before the first digit" — i.e. `0.d1d2…dk`. Intermediate `s` places the point inside the digit string.
- **ME-097** `s` MUST be an integer in `[0, k]`.
- **ME-098** The pair `(sA, sB)` MUST be drawn **uniformly from `[0, kA] × [0, kB] \ {(0, 0)}`** — i.e. both-shifts-zero is forbidden, exactly as the brief requires.
- **ME-099** **The `(0,0)` prohibition is evaluated on the chosen shift values, NOT on the rendered operand strings.** A shift may legitimately produce an operand that renders without a decimal point (e.g. `A = 100`, `sA = 2` renders `1`). The brief's own worked example depends on this: `100 ÷ 4` with `sA = 2, sB = 0` renders as `1 / 4` — neither operand shows a point.
- **ME-100** In addition to ME-098, the task MUST NOT be degenerate: it MUST NOT be the case that **all three** of (rendered operand A, rendered operand B, exact answer) are integers.
  Justification and **ASSUMPTION A8**: the brief's stated rule is `(sA, sB) ≠ (0, 0)`, but it states the *reason* as "otherwise it would just be a normal task". `(sA, sB) ≠ (0,0)` is necessary but not sufficient — e.g. `A = 100, sA = 2` and `B = 4, sB = 0` under **multiplication** renders `1 × 4 = 4`, which is literally a normal task. The brief explicitly blesses `1 / 4 = 0.25` because *the result* carries the point, so the correct generalisation is "a decimal point must appear somewhere in the task or its answer".
- **ME-101** ME-100 MUST be enforced by resampling `(sA, sB)` under ME-098, capped at 20 attempts. If the cap is exhausted, the engine MUST set `sA = kA`, which is **provably** non-degenerate: for a `kA`-digit `A`, `10^(kA-1) ≤ A < 10^kA`, so `A / 10^kA ∈ [0.1, 1)` and can never be an integer. This proves ME-100 is always satisfiable and gives a terminating algorithm.
- **ME-102** The exact answer of a decimal task MUST be computed from the exact rationals `A/10^sA` and `B/10^sB`, never from parsed floats.

### 9.2 Interaction with each base kind

- **ME-103** **Addition:** answer `= A/10^sA + B/10^sB`. Sums of finite decimals are always finite decimals, so ME-023 holds. Number of fractional digits in the answer `≤ max(sA, sB) ≤ 3` (max operand under `"1000"` is 990 → `k ≤ 3`).
- **ME-104** **Multiplication:** answer `= (A × B) / 10^(sA + sB)`. Always finite. Fractional digits `≤ sA + sB ≤ 6` (max operand 100 → `k ≤ 3` each).
- **ME-105** **Division:** answer `= (A / B) × 10^(sB - sA) = q × 10^(sB - sA)` where `q = A / B` is the integral base quotient. Always finite. Fractional digits `= max(0, sA - sB) ≤ 3`.
- **ME-106** ME-105 is the formal encoding of the brief's example: base task `100 ÷ 4 = 25`; `kA = 3, kB = 1`; choose `sA = 2, sB = 0`; rendered task `1 ÷ 4`; answer `25 × 10^(0-2) = 0.25`. This exact case MUST be a golden test vector (see section 18).
- **ME-107** ME-105 also shows why division decimals are safe: because the base division is remainder-free (ME-055), *every* shift of it is a power-of-ten scaling of an integer and therefore terminating. Implementers MUST NOT relax ME-055 "because decimals are allowed anyway".
- **ME-108** Note (non-normative but MUST be surfaced to the product owner): ME-104 permits answers with up to 6 fractional digits at `multiplication === "100"`, e.g. `0.087 × 0.094 = 0.008178`. This is faithful to the brief and MUST be implemented as specified; it is flagged in section 20 as a possible future tuning point, not a defect.

---

## 10. Setting 7 — Negative numbers

- **ME-109** `negatives === "off"`: every operand of every task MUST be positive.
- **ME-110** `negatives === "on"`: for each task, the engine MUST (a) choose one operand index `i` uniformly from `{0, 1}`, then (b) with probability exactly `0.5`, negate operand `i`. Both draws MUST come from the seeded PRNG.
- **ME-111** Consequently: `P(task has exactly one negative operand) = 0.5`; `P(task has two negative operands) = 0`. **Both operands negative is structurally impossible.** This is the direct reading of the brief's "for exactly one of its numbers, a 50% chance to be negative". (The alternative reading — each operand independently 50% — is rejected because the brief says "exactly one".)
- **ME-112** Negation applies to **every** task kind, including `fracAdd`, `fracMul` and `decimal`.
- **ME-113** For a fraction operand, "one number" means **the whole fraction**. The sign applies to the fraction's value. The numerator and denominator MUST NOT be signed independently; the denominator MUST always stay positive internally.
- **ME-114** For a decimal operand, "one number" means the shifted decimal value. Sign is applied **after** the decimal shift.
- **ME-115** Pipeline order MUST be exactly: (1) generate base integer/fraction operands → (2) apply decimal shift (decimal kind only) → (3) apply negation. This order is normative because it fixes the PRNG draw sequence and therefore reproducibility (ME-160).
- **ME-116** The magnitude constraints of settings 1-5 (ME-028 … ME-079) apply to the operands **before** negation, i.e. to their absolute values. The resulting answer MAY fall outside the setting's nominal band (e.g. `"+100"` can yield `-96`). This MUST NOT be treated as a violation.
- **ME-117** For a `div` task, negating the **divisor** MUST be permitted. The divisor magnitude is `≥ 2` so no division by zero can arise.
- **ME-118** The exact answer MUST be recomputed after negation, and MAY be negative or zero.

---

## 11. Setting 8 — Time

- **ME-119** `time ∈ {1, 2, 4, 8}` minutes. The math engine does not use `time` for generation; it only records it in the settings snapshot.
- **ME-120** Task generation MUST be unbounded in count — the test ends on the timer, never on running out of tasks (monkeytype's time mode behaves identically: `getLimit()` returns a rolling batch of 100, `frontend/src/ts/test/words-generator.ts` lines 428-461).

---

## 12. Task mixing when several modes are enabled

- **ME-121** The set of **enabled kinds** MUST be computed as: `add` if `addition !== "off"`; `mul` if `multiplication !== "off"`; `div` if `division !== "off"`; `fracAdd` if `fractionAddition !== "off"`; `fracMul` if `fractionMultiplication !== "off"`; `decimal` if `decimals === "on"` **and** at least one of `add`/`mul`/`div` is enabled (ME-092).
- **ME-122** The kind of task `i` MUST be drawn **uniformly at random** from the enabled-kinds set, independently for each `i`.
  Justification: every setting in the bar is one equal control with no weight affordance; any weighting would be hidden config the user cannot see or change. With the default settings all six kinds are enabled and each occurs with probability `1/6`.
- **ME-123** The enabled-kinds set MUST be enumerated in a **fixed canonical order** (`add`, `mul`, `div`, `fracAdd`, `fracMul`, `decimal`) before the uniform draw, so that the same seed produces the same sequence on frontend and backend.
- **ME-124** Implementers MUST NOT add weighting, adaptive difficulty, spaced repetition, or "practise your weak spots" behaviour in v1. (Monkeytype's `weak-spot.ts` / `practise-words.ts` equivalents are out of scope.)
- **ME-125** The engine MUST NOT emit two consecutive tasks with an **identical prompt string**. On collision it MUST regenerate task `i` (advancing the per-task PRNG sub-stream, ME-170/ME-172), capped at 10 attempts; after 10 attempts the duplicate MUST be accepted rather than looping.
- **ME-126** Consecutive tasks of the same *kind* MUST be permitted (no anti-streak rule beyond ME-125).

---

## 13. Prompt and answer rendering

- **ME-127** Operator glyphs MUST be: addition `+` (U+002B), multiplication `×` (U+00D7), division `÷` (U+00F7).
- **ME-128** Division prompts MUST use `÷`, not `/`. Recorded as **ASSUMPTION A9**: the brief writes divisions as `144/12`. `/` is reserved as the **fraction separator** in both prompts and answers (`5/6`), so reusing it as the division operator would make `3/4 ÷ ...` ambiguous. The settings-bar *label* MUST remain the literal `144/12` / `xxx/xx` as the brief specifies; only the task prompt uses `÷`.
- **ME-129** A prompt MUST be rendered as `<operandA> <operator> <operandB> =` with single spaces, and the typed answer MUST appear immediately after the `=`. This mirrors monkeytype's "the item you type is the item on screen" flow (`frontend/src/ts/test/test-words.ts` line 9, `display`).
- **ME-130** Fractions MUST be rendered **inline** as `n/d` with no spaces around the `/`. Stacked/vertical fractions MUST NOT be used: they would break the single-line, wrapping word-row layout that the test page inherits from monkeytype.
- **ME-131** A negative operand MUST be rendered:
  - bare with a leading minus when it is the **first** operand: `-12 + 5 =`, `-3/4 × 1/2 =`;
  - wrapped in parentheses when it is the **second** operand: `12 + (-5) =`, `4.2 × (-0.5) =`, `1/2 + (-3/4) =`.
  A negative second operand MUST NOT be rendered by rewriting the operator (`12 - 5`), because that would hide the negative-number training the setting exists for.
- **ME-132** Decimal values MUST be canonicalised for display: strip trailing zeros after the point; strip a trailing bare point; always render a leading `0` before the point (`0.25`, never `.25`); never use a thousands separator.
- **ME-133** The decimal separator in **display** MUST be `.` (U+002E). Recorded as **ASSUMPTION A10** — the brief writes `4.2` and `0.25` with a period, despite the user's German locale.
- **ME-134** `answerDisplay` MUST be: a bare integer string for integral answers; a canonical decimal string (ME-132) for `decimal`-kind answers that are non-integral; a reduced `p/q` for `fracAdd`/`fracMul` answers; with a leading `-` for negative values. Negative zero MUST render as `0`.
- **ME-135** The **exact answer MUST NOT be present anywhere in the DOM** — not as text, not as a `data-` attribute, not as an `aria-label`. Only prompts may be rendered. (Answers live in JS memory only; this matches the exposure monkeytype already accepts for upcoming words, but must not be made worse.)
- **ME-136** The first task MUST be generated before the test starts but MUST be visually blurred until the first keystroke, per the brief. The math engine MUST expose the prompt normally; the blur is a UI-layer obligation. Cross-reference for the test-page requirements owner.

---

## 14. Answer input and correctness judging

- **ME-137** The answer input MUST accept only these characters: digits `0`-`9`, `-`, `/`, `.`, `,`. All other printable characters MUST be silently ignored (not inserted, no error state).
- **ME-138** `,` MUST be normalised to `.` on input. Justification: German keyboard numpads emit `,` as the decimal key, and the user's locale is German. Both `4,2` and `4.2` MUST therefore be accepted.
- **ME-139** Unicode minus variants `−` (U+2212), `–` (U+2013) and `—` (U+2014) MUST be normalised to ASCII `-` (U+002D).
- **ME-140** `Space` and `Enter` MUST both commit the current answer, matching monkeytype's commit characters `" "` and `"\n"` (`frontend/src/ts/test/test-words.ts` lines 13, 52-60).
- **ME-141** Committing an **empty or whitespace-only** input MUST be a no-op: it MUST NOT advance, MUST NOT count as correct, and MUST NOT count as wrong. This mirrors monkeytype's rule that a leading separator on an empty input does not skip the item (`frontend/src/ts/input/helpers/validation.ts` lines 58-66) and prevents a stray space from burning a task.
- **ME-142** `Backspace` MUST delete within the current answer only. Returning to a **previously committed** task MUST be impossible. Monkeytype's `freedomMode` (`packages/schemas/src/configs.ts` line 427) MUST NOT be ported: a committed task is already scored.
- **ME-143** The input grammar for a committed answer is exactly one of:
  - `INT` := `-?` `DIGIT{1,7}`
  - `DEC` := `-?` `DIGIT{1,7}` `.` `DIGIT{1,7}`  (a leading `0` before `.` is required; `-?.5` and `-?5.` are invalid)
  - `FRAC` := `-?` `DIGIT{1,7}` `/` `DIGIT{1,7}`
  Anything else — including two `/`, two `.`, a `/` combined with a `.`, an internal `-`, a trailing operator, or a component longer than 7 digits — MUST be judged **incorrect**. It MUST NOT throw and MUST NOT be silently discarded.
- **ME-144** The 7-digit-per-component cap in ME-143 is normative and exists to keep exact comparison inside `Number.MAX_SAFE_INTEGER` (ME-022): cross-multiplication of two 7-digit components is `≤ 10^14 < 2^53`. The longest *legitimate* answer has 5 digits per component (`9801/10000`), so the cap has ample headroom.
- **ME-145** A committed answer MUST be parsed to an exact rational: `INT n` → `n/1`; `DEC a.b` with `|b| = f` digits → `(ab as integer)/10^f`; `FRAC p/q` → `p/q`.
- **ME-146** A parsed answer with denominator `0` (e.g. `3/0`) MUST be judged **incorrect**. It MUST NOT throw, produce `Infinity`, or produce `NaN`.
- **ME-147** Correctness MUST be decided by exact rational equality: with the expected answer stored reduced as `pE/qE` (`qE > 0`) and the parsed answer as `pU/qU` (normalised to `qU > 0`), the answer is correct iff `pU × qE === pE × qU`. String comparison MUST NOT be used.
- **ME-148** Consequence of ME-147 that MUST be tested: **any** representation of the correct value is accepted, across formats. `1/4`, `2/8`, `0.25` and `0,25` are all correct for an expected `0.25`. `0.5` is correct for an expected `1/2`. `0.333` is **incorrect** for an expected `1/3`.
- **ME-149** `-0`, `0`, `0/5` and `0.0` MUST all be judged equal to `0`.
- **ME-150** Leading zeros in components MUST be accepted (`007` = `7`).
- **ME-151** The answer input MUST be capped at 16 characters total; further keystrokes MUST be ignored.
- **ME-152** **Per-character validation and per-character colouring MUST NOT be performed.** The input MUST show no correct/incorrect feedback until commit.
  Justification: monkeytype colours each character as you type (`frontend/src/ts/input/helpers/validation.ts` `isCharCorrect`), but doing so here would leak the answer digit-by-digit and let a user brute-force the first digit, then the second, etc. Judging is a single event at commit time.
- **ME-153** The task MUST NOT auto-advance when the typed value happens to equal the answer. Auto-advance would tell the user their answer is right before they commit — the same information leak as ME-152, and it would make monkeytype's `quickEnd` (`frontend/src/ts/input/helpers/fail-or-finish.ts` lines 98-110) an anti-cheat hole. `quickEnd` MUST NOT be ported.

---

## 15. Test flow and wrong-answer behaviour

- **ME-154** **RECOMMENDATION, NORMATIVE:** on commit of a wrong answer, the task MUST be marked wrong, MUST be rendered in the error colour (monkeytype's incorrect-word treatment), and the test MUST **advance to the next task**. There MUST be no retry, no blocking, and no penalty time.
  Justification, three-fold:
  1. It matches monkeytype's default `stopOnError: "off"`, where an incorrect word still commits and advances (`frontend/src/ts/input/helpers/validation.ts` lines 70-77).
  2. The brief's headline results metric is `correct − wrong`. If wrong answers blocked or retried, `wrong` could never accumulate and the metric would be undefined.
  3. In a fixed-time test, blocking on one hard task would let a single item consume the entire run and would destroy the "tasks per minute" metric.
- **ME-155** A `stopOnError`-equivalent setting MUST NOT be added to the settings bar; the brief fixes it at 8 controls.
- **ME-156** A correct answer MUST be rendered in the correct/normal colour and MUST advance to the next task.
- **ME-157** A task that is partially answered when the timer expires MUST be discarded: it counts neither correct nor wrong, and its keystrokes MUST NOT contribute to the tasks-per-minute numerator.
- **ME-158** Tasks MUST be pre-generated in a rolling batch. Initial batch size MUST be 60; the engine MUST extend by 30 whenever fewer than 15 unconsumed tasks remain. (Monkeytype uses a rolling batch of 100 for time mode — `frontend/src/ts/test/words-generator.ts` lines 433, 459-461 — so a rolling batch is the established pattern; 60/30/15 is sized for croco calc's much slower per-item pace.)
- **ME-159** Each committed task MUST append a record to the **task log**: `{ i, kind, prompt, expected (canonical string), given (raw normalised string), correct (boolean), tStart (ms from test start), tEnd (ms from test start) }`.

---

## 16. Result metrics owned by the math engine

- **ME-160** `correct` MUST be the count of task-log entries with `correct === true`; `wrong` the count with `correct === false`.
- **ME-161** The **main results metric** MUST be `score = correct − wrong`. It MAY be negative and MUST be displayed as an integer (with a leading `−` when negative — U+2212, per C33). *(Amended by master C40: the field is named `score` everywhere, matching CP-101 and AC-003. The name `net` used by earlier drafts of this document is struck; no `net` identifier may appear in any package.)*
- **ME-162** `accuracy` MUST be `correct / (correct + wrong) × 100`, rounded to two decimals using the existing `roundTo2` helper (`packages/util/src/numbers.ts` line 20). When `correct + wrong === 0`, accuracy MUST be reported as `0`.
- **ME-163** `tasksPerMinute` MUST be `(correct + wrong) / (testDurationSeconds / 60)`, rounded to two decimals. It counts **responses**, per the brief ("how many responses you made per minute"), so wrong answers count.
- **ME-164** The engine MUST NOT compute or report WPM, raw WPM, `charStats`, or `keyConsistency`. Those monkeytype fields (`packages/schemas/src/results.ts` lines 70-98) are meaningless here and MUST be removed from the croco calc result schema rather than filled with placeholder values.
- **ME-165** `consistency` MUST be retained but redefined as the coefficient-of-variation-based consistency over **per-task response times** (`tEnd - tStart` from ME-159), reusing monkeytype's `kogasa` transform (`packages/util/src/numbers.ts` line 80) so the results page and charts keep working unchanged.

---

## 17. Determinism, seeding and anti-cheat

**Finding:** monkeytype's generator is explicitly unseeded — `const random = Math.random;` at `frontend/src/ts/test/words-generator.ts` line 39 — and a repository-wide grep for `seed` across `frontend/src/ts/test`, `frontend/src/ts/utils` and `packages/util/src` returns no matches. Deterministic generation is therefore **new work** for croco calc and is a hard prerequisite for leaderboard integrity.

- **ME-166** The engine MUST use a seeded PRNG. `Math.random` MUST NOT appear anywhere in `packages/math-engine`; this MUST be enforced by a lint rule.
- **ME-167** The PRNG MUST be **mulberry32**, specified exactly as follows so that frontend and backend produce byte-identical streams. Given a `uint32` state, one step is (all operations on 32-bit integers, `Math.imul` for multiplication, `>>>` for unsigned shift):
  ```
  state = (state + 0x6D2B79F5) | 0
  t     = state
  t     = imul(t ^ (t >>> 15), t | 1)
  t    ^= t + imul(t ^ (t >>> 7), t | 61)
  out   = ((t ^ (t >>> 14)) >>> 0) / 4294967296     // in [0, 1)
  ```
  Implementers MUST NOT substitute another PRNG; the constants are part of the contract.
- **ME-168** Uniform integer draws MUST be `min + floor(out × (max - min + 1))`, inclusive on both ends, matching the semantics of `randomIntFromRange` (`packages/util/src/numbers.ts` lines 85-96) but sourced from ME-167.
- **ME-169** Each test MUST have a **test seed**: a `uint32` generated at test start from `crypto.getRandomValues`. It MUST be recorded in the result payload.
- **ME-170** Task `i` MUST be generated from a **derived per-task seed** `taskSeed = mulberry32Step(testSeed ^ imul(i + 1, 0x9E3779B1))`, so that `generateTask(seed, i, settings)` is a pure function of `(testSeed, i, settings)` and does **not** depend on how many tasks were generated before it, on user timing, or on regeneration retries.
- **ME-171** ME-170 makes the whole task sequence recomputable from `(testSeed, settingsSnapshot)` alone. This is the central anti-cheat primitive.
- **ME-172** Retry loops (ME-030 rejection sampling, ME-101 shift resampling, ME-125 duplicate-prompt regeneration) MUST draw from the task's own PRNG sub-stream and MUST NOT reseed. The number of retries is therefore itself deterministic.
- **ME-173** The result payload MUST include: `mathSeed` (uint32), `mathSettings` (the full 8-key snapshot), `taskLog` (ME-159), plus the fields the existing pipeline already requires.
- **ME-174** The backend MUST revalidate every submitted result by regenerating tasks `0 … n-1` from `(mathSeed, mathSettings)` and asserting, for every entry: the regenerated prompt equals the logged `prompt`, the regenerated exact answer equals the logged `expected`, and re-judging the logged `given` against the regenerated answer reproduces the logged `correct` flag. Any mismatch MUST reject the result, in the same manner as the existing hash mismatch (`backend/src/api/controllers/result.ts` lines 219-238).
- **ME-175** The existing `objectHash` anti-cheat and duplicate-hash check (`backend/src/api/controllers/result.ts` lines 219-238, 408-429) MUST be retained on top of ME-174, not replaced by it.
- **ME-176** `taskLog` MUST be replaced by the literal string `"toolong"` when it exceeds 1000 entries, following the existing precedent for `keyDuration` / `keySpacing` (`packages/schemas/src/results.ts` lines 143-144; `frontend/src/ts/test/test-logic.ts` lines 1106-1108). When `"toolong"`, ME-174 MUST fall back to verifying a deterministic sample of 50 task indices.
- **ME-177** Server-side revalidation MUST run against the **same** `@crococalc/math-engine` package version the client used. The result payload MUST therefore include the engine's semantic version, and the server MUST reject results generated by an engine version it cannot reproduce.
- **ME-178** The math engine MUST ship a golden-vector fixture file (section 18) that both the frontend and backend test suites execute, guaranteeing cross-runtime agreement.

### 17.1 Plausibility thresholds (added by the master document, gap 8)

These are the concrete numbers behind INV-148's "tasks-per-minute ceiling, minimum inter-answer interval,
`testDuration` vs `timestamp` agreement". Without them the check is neither implementable nor verifiable.
All five constants MUST be exported from `packages/math-engine/src/plausibility.ts` as named constants, and
every threshold MUST be **logged with the offending value** when it fires — never silently dropped.

- **ME-179** `MAX_PLAUSIBLE_TPM = 120`. A result whose `tasksPerMinute` (ME-163) exceeds 120 MUST be rejected
  by the backend. Justification: the cheapest possible task under any enabled setting is a 2-operand
  `+100` addition whose answer is 1–3 digits; commit requires reading the prompt, typing up to 3 digits and
  pressing a commit key. 120 tpm is a sustained 0.5 s per task over the whole run (60–480 s), which is
  already above any demonstrated human rate for arithmetic and leaves ≥ 2× headroom over the fastest
  plausible real user (~50–60 tpm on `+100` only). Test: a synthetic log at 60 tpm passes, one at 121 tpm is
  rejected.
- **ME-180** `MIN_INTER_ANSWER_MS = 150` and `MAX_SUBTHRESHOLD_FRACTION = 0.05`. Let `Δᵢ = tEndᵢ − tEndᵢ₋₁`
  over the committed task log (with `tEnd₋₁ = 0`). A result MUST be rejected when **more than 5 %** of the
  `Δᵢ` are below 150 ms **and** at least 2 such intervals exist. A result MUST NOT be rejected for a single
  sub-threshold interval — double-commit and key-repeat produce isolated ones. Justification: 150 ms is
  below documented simple-reaction-plus-keystroke floors, so a *pattern* of them is machine input; the 5 %
  band and the 2-interval minimum are the false-positive guard demanded by the BL-5 lesson.
- **ME-181** `MAX_MEDIAN_INTERVAL_FLOOR_MS = 300`. A result with ≥ 10 committed tasks whose **median** `Δᵢ`
  is below 300 ms MUST be rejected. This catches a uniformly fast forged log that ME-180's 5 % band lets
  through. Below 10 committed tasks the check MUST NOT run (the median is not meaningful).
- **ME-182** `MAX_DURATION_DRIFT_MS = 2000`. Three agreements MUST hold or the result is rejected:
  (a) `testDuration === mathSettings.time * 60` exactly (croco calc has only fixed-duration tests, so there
  is no legitimate drift here at all); (b) the last logged `tEnd` MUST satisfy
  `tEnd_last ≤ testDuration * 1000 + MAX_DURATION_DRIFT_MS`, and the first logged `tStart ≥ 0`;
  (c) the submitted `timestamp` MUST lie in `[serverNow − (testDuration * 1000) − 300 000,  serverNow + 60 000]`
  — i.e. no result from the future beyond one minute of clock skew, and none claiming to have finished more
  than five minutes before it was submitted.
- **ME-183** Every threshold in ME-179 … ME-182 MUST have (a) a rejecting test with a forged log and (b) a
  **passing** test with a legitimate fast run (`tpm = 60`, all `Δᵢ ≥ 400 ms`, `testDuration = 480`,
  `timestamp = serverNow − 1000`). The plausibility layer MUST NOT read `acc` in any form: BL-5 exists
  because an accuracy floor silently deleted genuine runs, and a math trainer's accuracy carries no
  cheat signal.

### 17.2 Engine version and client compatibility (added by the master document, gap 26c)

- **ME-184** ME-177 rejects results produced by an engine version the server cannot reproduce. Because the
  SPA is cached, users can hold a stale bundle across a deploy, so ME-177 alone silently breaks result
  saving. Therefore: any change that bumps the `@croco-calc/math-engine` **generation, mixing or judging**
  semantics MUST, in the same commit, bump the value returned to the `COMPATIBILITY_CHECK_HEADER`
  (`backend/src/middlewares/compatibilityCheck.ts`, kept by INV-138) so that a client on the old engine is
  told to reload **before** it can finish a test whose result would be rejected. A CI check MUST fail when
  `packages/math-engine/package.json`'s version changes without the compatibility constant changing.
  The server MUST accept exactly two engine versions during a rollout window — `current` and `current − 1` —
  and MUST reject anything older with a distinct error code so the client can show "please reload" rather
  than "result invalid".

---

## 18. Edge cases (explicit, exhaustive)

Each row MUST have a dedicated test.

| # | Edge case | Required behaviour | Req |
| --- | --- | --- | --- |
| E1 | Division by zero in generation | Impossible: all divisors and denominators have magnitude `≥ 2` | ME-026 |
| E2 | User enters `3/0` | Judged incorrect; no throw, no `Infinity`, no `NaN` | ME-146 |
| E3 | Denominator of `1` in a displayed fraction | Never generated (would force numerator `0`) | ME-059 |
| E4 | User answers with denominator `1` (`3/1`) | Accepted if the value matches | ME-068 |
| E5 | Both operands negative | Structurally impossible | ME-111 |
| E6 | Answer is exactly `0` (e.g. `50 + (-50)`) | Permitted; `0`, `-0`, `0.0`, `0/5` all accepted; displays as `0` | ME-149, ME-134 |
| E7 | Decimal shift yields an integer-looking operand (`100`, `sA = 2` → `1`) | Permitted — this is the brief's own `1 / 4` example | ME-099 |
| E8 | Both shifts zero | Forbidden; resample | ME-098 |
| E9 | Shifts non-zero but the whole task is integral (`1 × 4 = 4`) | Forbidden; resample, fallback `sA = kA` | ME-100, ME-101 |
| E10 | Decimals on, all of settings 1-3 off | `decimal` kind inert; not offered to the mixer | ME-092 |
| E11 | All task-producing controls would be off | Prevented in the UI by skipping the last control's `"off"` state; engine throws if it still happens | ME-015, ME-016 |
| E12 | `fractionMultiplication` on while `multiplication` off | `multiplication` forced to `"12"` in the same action | ME-082, ME-083 |
| E13 | `multiplication` cycled to `"off"` | `fractionMultiplication` forced to `"off"` | ME-084 |
| E14 | `multiplication` cycled `"off"` → `"12"` afterwards | `fractionMultiplication` stays off | ME-086 |
| E15 | `multiplication` is the only other producer besides `fractionMultiplication` | Cannot be switched off | ME-089 |
| E16 | Fraction addition with identical denominators | Never generated | ME-060 |
| E17 | Fraction addition result is improper (`19/12`) | Permitted; not converted to a mixed number | ME-065 |
| E18 | Fraction addition result is an integer (`1/6 + 5/6`) | Permitted; bare `1` accepted | ME-066, ME-069 |
| E19 | Fraction result answered as a mixed number (`1 7/12`) | Rejected (space is the commit char) | ME-071 |
| E20 | Fraction result answered unreduced (`38/24` for `19/12`) | Accepted | ME-068 |
| E21 | Non-terminating fraction answered as a decimal (`0.333` for `1/3`) | Incorrect — no tolerance | ME-025, ME-070 |
| E22 | `d = 2` in a fraction | Only coprime numerator is `1`; distribution is degenerate but valid | ME-061 |
| E23 | Answer component longer than 7 digits | Judged incorrect | ME-143, ME-144 |
| E24 | Input longer than 16 characters | Extra keystrokes ignored | ME-151 |
| E25 | Committing an empty input | No-op — no advance, no score change | ME-141 |
| E26 | Input containing a letter or `+` | Keystroke silently ignored | ME-137 |
| E27 | Malformed committed input (`5/`, `.`, `-`, `1.2.3`, `1/2/3`) | Judged incorrect; no throw | ME-143 |
| E28 | German numpad comma (`4,2`) | Normalised to `4.2` and accepted | ME-138 |
| E29 | Unicode minus (`−5`) | Normalised to `-5` | ME-139 |
| E30 | Two consecutive identical prompts | Regenerated (up to 10 attempts) | ME-125 |
| E31 | Timer expires mid-answer | Task discarded; scores unaffected | ME-157 |
| E32 | Test with zero committed tasks | `score = 0`, `acc = 0`, `tpm = 0`; no division by zero. (Per CP-109 such a run is invalid and is not saved; per C6 the *displayed* values are `-`.) | ME-160, ME-162, ME-163, C40 |
| E33 | `xxx/xx` boundary dividends `100` and `999` | Both reachable (`100 = 2 × 50`, `999 = 27 × 37`) | ME-051 |
| E34 | `100x100` boundary product `100 × 100 = 10000` | Permitted | ME-039 |
| E35 | `144/12` boundary `144 ÷ 12 = 12` and minimum `4 ÷ 2 = 2` | Both permitted | ME-044 |
| E36 | `+1000` boundary sum exactly `1000` | Permitted | ME-031 |
| E37 | Negating a divisor (`144 ÷ (-12)`) | Permitted; answer `-12` | ME-117 |
| E38 | Negating a fraction | Sign on the whole fraction, rendered `-3/4`; denominator stays positive internally | ME-113 |
| E39 | Config changed mid-test | Test restarts | ME-007 |
| E40 | Result submitted with a task log that does not match `(seed, settings)` | Rejected by the server | ME-174 |

### Golden test vectors (MUST be in the shared fixture, ME-178)

| Task kind | Prompt | Exact answer | `answerDisplay` | Note |
| --- | --- | --- | --- | --- |
| `decimal`/div | `1 ÷ 4 =` | `1/4` | `0.25` | The brief's own example; base `100 ÷ 4 = 25`, `sA = 2`, `sB = 0` |
| `decimal`/mul | `0.087 × 0.094 =` | `8178/1000000` | `0.008178` | 6 fractional digits, the ME-104 worst case |
| `decimal`/add | `4.5 + 7 =` | `23/2` | `11.5` | `sA = 1`, `sB = 0` |
| `fracAdd` | `3/4 + 5/6 =` | `19/12` | `19/12` | Improper result; `38/24` also accepted |
| `fracAdd` | `1/6 + 5/6 =` | `1/1` | `1` | Integer result; `1`, `6/6`, `1/1` all accepted |
| `fracMul` | `3/4 × 2/5 =` | `3/10` | `3/10` | `6/20` also accepted |
| `div`/tables | `144 ÷ 12 =` | `12/1` | `12` | Upper bound of the `144/12` state |
| `div`/free | `738 ÷ 9 =` | `82/1` | `82` | Single-digit divisor is legal (ME-053) |
| `add`/negatives | `-12 + 5 =` | `-7/1` | `-7` | First operand negative → bare leading minus |
| `mul`/negatives | `7 × (-8) =` | `-56/1` | `-56` | Second operand negative → parentheses |

---

## 19. ASSUMPTION register

Each assumption states the ambiguity, the chosen reading, and why.

- **A1 (ME-028/ME-029) — meaning of `+100` / `+1000`.** *Ambiguity:* does the number bound each operand or the whole task? *Chosen:* it bounds the task — both operands and the sum stay inside the range. *Why:* the brief is a translation from German, where "+100" is the standard didactic *Zahlenraum bis 100*. *Alternative if rejected:* operands drawn from `[2, 100]` / `[2, 1000]` independently, sum up to 200 / 2000 — a one-line change to ME-028/ME-029.

- **A2 (ME-031) — lower bounds per state.** *Ambiguity:* the brief gives no floor. *Chosen:* `"100"` requires `a + b ≥ 11`; `"1000"` requires operands `≥ 10` and `a + b ≥ 101`. *Why:* without a floor the two states overlap almost completely and `+1000` would routinely emit `3 + 4`.

- **A3 (ME-053) — "max 2-digit divisor".** *Ambiguity:* does `xx` mean *exactly* two digits or *at most* two? *Chosen:* at most two (`d ∈ [2, 99]`), while the dividend is required to be exactly three digits. *Why:* "max" in the brief is explicitly an upper bound, and single-digit divisors give useful variety; the dividend floor is what sets the difficulty band.

- **A4 (ME-060) — distinct denominators in fraction addition.** *Ambiguity:* not addressed by the brief. *Chosen:* `d1 ≠ d2` is required. *Why:* the setting is defined as "the maximum denominator the two fractions must be **brought onto**"; equal denominators make that concept vacuous.

- **A5 (ME-077) — proper fractions in fraction multiplication.** *Ambiguity:* the brief states `numerator < denominator` only under setting 4. *Chosen:* global invariant, applies to setting 5 too. *Why:* consistency of presentation, and improper fractions would make "max numerator" ambiguous.

- **A6 (ME-083) — which multiplication state is forced on.** *Ambiguity:* the brief says multiplication "switches ON" but not to which state. *Chosen:* `"12"`. *Why:* a force-enabled control should land in its gentlest state; the user can cycle up. Deterministic and testable, unlike "remember the last value".

- **A7 (ME-090 ff.) — decimals as a kind vs a modifier.** *Ambiguity:* "when a decimal task appears it is randomly one of types 1-3" could mean a distinct population or a per-task chance. *Chosen:* a distinct sixth kind, uniformly mixed. *Why:* "a decimal task" names a category of task; and it keeps the mixer a single uniform draw (ME-122).

- **A8 (ME-100) — the "not just a normal task" constraint.** *Ambiguity:* the brief's literal rule `(sA, sB) ≠ (0, 0)` does not achieve its own stated goal. *Chosen:* strengthen it to "operand A, operand B and the answer must not all be integers". *Why:* the literal rule still permits `1 × 4 = 4`, which is exactly "just a normal task"; the strengthened rule keeps the brief's blessed `1 / 4 = 0.25`.

- **A9 (ME-128) — division operator glyph.** *Ambiguity:* the brief writes `144/12`. *Chosen:* `÷` in task prompts, `/` reserved for fractions, `144/12` kept as the settings-bar label. *Why:* `/` cannot mean both "divide" and "fraction bar" in the same task line.

- **A10 (ME-133) — decimal separator.** *Ambiguity:* German locale vs the brief's own `4.2` / `0.25`. *Chosen:* `.` for display, `,` **also accepted** on input. *Why:* follow the brief for display, accommodate the German numpad on input.

- **A11 (ME-091) — decimal base kind selection when some of settings 1-3 are off.** *Ambiguity:* "randomly one of types 1-3" does not say whether disabled types are included. *Chosen:* uniform over the **enabled** subset only. *Why:* generating a multiplication task while multiplication is switched off would contradict the control.

- **A13 (ME-091 / ME-107) — the brief's decimals self-contradiction, RESOLVED (master C39; SB-105 deferred it here).** *Ambiguity:* the brief says a decimal task "is randomly one of types 1-3 (addition / multiplication / division)" and then says "Effectively we base ourselves on the division tasks". These cannot both be literal restrictions. *Chosen:* the **first sentence is normative** — the base kind is drawn uniformly over the enabled subset of `{add, mul, div}` (ME-091). The "based on division" sentence is read as the brief's **explanation of why decimal shifting is safe**, not as a restriction on the base kind: it is the same argument ME-107 makes, namely that a remainder-free division stays terminating under any power-of-ten shift (`1 / 4 = 0.25` because `100 / 4 = 25`). *Why:* reading it as a restriction would make settings 1 and 2 dead whenever decimals is on, contradicting both the eight-control design and ME-092; and the brief's own worked example is offered as a justification ("is fine because"), not as a rule. Implementers MUST NOT restrict decimal tasks to division.

- **A12 (ME-045) — whether `144/12` follows the multiplication setting.** *Ambiguity:* the assignment explicitly asks. *Chosen:* it does **not**; the range is fixed at 1…12. *Why:* the control's numeric label would otherwise lie. See ME-045 for the full argument.

---

## 20. Cross-team notes and blockers

- **B1 — BLOCKER for the backend owner.** `backend/src/api/controllers/result.ts` lines 215-217 rejects any result with `acc < 75` for users who have not opted out of leaderboards, and `packages/schemas/src/results.ts` line 74 floors `acc` at `50` in the schema itself. A math trainer legitimately produces 40-70% accuracy on hard mixes. **Both constraints MUST be removed or lowered to `0`** or croco calc will silently drop a large share of genuine results. This cannot be fixed in the math engine.

- **B2 — for the results-page owner.** `wpm`, `rawWpm`, `charStats`, `keyConsistency`, `keyDuration`, `keySpacing` and `burstHeatmap` are meaningless for croco calc (ME-164). The result schema, the personal-best documents, the XP calculation and the charts all key off `wpm` today; the replacement metric is `score = correct − wrong` (ME-161, master C40), with `tasksPerMinute` (ME-163) as the secondary. Somebody must own that schema migration — the math engine only supplies the numbers.

- **B3 — for the settings-bar owner.** ME-015 (skip the `"off"` state of the last enabled producer), ME-082/ME-084 (transactional multiplication ↔ fraction-multiplication coupling) and ME-088 (single config-change event) are settings-bar obligations, not engine obligations. The engine will throw (ME-016) if the bar lets an all-off state through.

- **B4 — for the leaderboard owner.** ME-017/ME-018/ME-019 define leaderboard eligibility. Note specifically that `time` is **excluded** from the default-settings equality check, because the brief allows both 4 and 8 minute leaderboards while the default time is 8.

- **B5 — for the test-page owner.** ME-135 (answers never in the DOM), ME-136 (first task blurred until start), ME-152 (no per-character colouring) and ME-153 (no auto-advance / no `quickEnd`) are UI obligations derived from anti-cheat reasoning. They deliberately diverge from monkeytype's live per-character feedback and must not be "fixed back".

- **B6 — non-blocking, for the product owner.** ME-104 permits multiplication-decimal answers with up to 6 fractional digits (`0.087 × 0.094 = 0.008178`) at the default `100x100` setting. This is faithful to the brief and is specified as-is, but it is by far the hardest thing the trainer can produce. If it proves unpleasant in testing, the cheapest fix is a cap on `sA + sB` — a single-line change to ME-098.

- **B7 — for whoever wires up the shared package.** ME-177 requires the engine's semantic version in the result payload and a server-side reject for unreproducible versions. That implies the engine version must be bumped on **any** change to generation, mixing, or judging — including changes that look cosmetic (operator glyphs feed `prompt`, which ME-174 verifies).
