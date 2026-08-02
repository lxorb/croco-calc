# croco calc

Mental arithmetic trainer. Built by adapting monkeytype's codebase in place — this repo keeps
monkeytype's full git history and much of its design system, theme catalogue, config machinery and
build tooling. It is **not** a typing trainer any more.

## The spec is authoritative

`docs/REQUIREMENTS.md` is the authoritative specification. Read the sections relevant to your task
**in full** before writing code. Requirement IDs (`ME-`, `SB-`, `CP-`, `AC-`, `INV-`, `INF-`) are
binding.

- `docs/requirements/01-math-engine.md` — `ME-` — task generation, judging, determinism
- `docs/requirements/02-settings-bar.md` — `SB-` — the 8 settings-bar controls, config domains
- `docs/requirements/03-pages-core.md` — `CP-` — test page, results page, shell, modals
- `docs/requirements/04-pages-account.md` — `AC-` — account, profile, leaderboard, XP
- `docs/requirements/05-monkeytype-inventory.md` — `INV-` — keep/adapt/delete per inherited file
- `docs/requirements/06-infra-and-ops.md` — `INF-` — hosting, CI/CD, secrets, observability

`REQUIREMENTS.md` §2 is a contradiction register and its rulings **override** the six source
documents. §6 defines exclusive file ownership per work package — do not edit files another package
owns.

## Stack — do not change it

SolidJS + Vite, TanStack Solid (Query / Form / Table), ts-rest + zod contracts, SCSS + Tailwind,
Express + MongoDB, pnpm + turbo monorepo. **React was explicitly rejected.** Node 24, pnpm 10.28.1.

Workspace packages are scoped `@croco-calc/*`: `frontend`, `backend`, `packages/{math-engine,
schemas,contracts,util,oxlint-config,typescript-config,tsup-config}`.

> **Repo state after wave 1 (WP-01).** The lines below describe the **target** state. Some of it does
> not exist yet, so check before you rely on it:
> - `packages/math-engine` is **not created yet** — WP-02 delivers it.
> - `Icon.tsx` does **not exist yet** and FontAwesome is **not deleted yet** — WP-04 delivers both.
>   Until then `frontend/src/ts/components/common/Fa.tsx`, `fa-` classes and the
>   `@fortawesome/fontawesome-free` dependency are all still present and still in use.
> - `frontend/` and `backend/` do **not** typecheck. WP-01 deleted packages and modules whose
>   importers are owned by WP-05..WP-12; repointing them is those packages' work. `packages/` is
>   green and must stay that way. Do not "fix" a dangling import by re-adding a deleted file — §6.2
>   says that is a sequencing bug to raise, not to resolve locally.

## What this project is not

Typing concepts are **cut**, not adapted: languages, quotes, wordlists, keyboard layouts/keymaps,
funbox, WPM and per-character stats, zen mode, punctuation. See doc 05 for the exact ruling per
module. Do not reintroduce them, and do not use typing vocabulary in user-facing strings — the
words `word`, `character`, `wpm`, `typing`, `monkey`, `quote` and `keyboard layout` are forbidden in
`frontend/src` (CP-178, amended by C42; `password` is exempt).

The unit of work is a **task** (one arithmetic problem), not a word. The headline metric is
**`score`** (correct − wrong), never `net`. Speed is **tpm** (tasks per minute).

## Conventions

- Be concise. Match monkeytype's existing idioms, file layout and naming — you are adapting, not
  rewriting.
- New components are `.tsx` (SolidJS). Some legacy vanilla-JS/DOM code remains; the migration is
  partial and ongoing.
- Styling: Tailwind CSS via the `class` property and the `cn` utility. Do not use `classlist`. Only
  the colours defined in the Tailwind config are available.
- Icons: use the `Icon` component (`frontend/src/ts/components/common/Icon.tsx`), which renders
  `tabler:*` and `ph:*` from a build-time bundle. FontAwesome is to be deleted — no `fa-` classes, no
  `@fortawesome` imports, no `Fa` component. *(WP-04 delivers this; neither is true yet — see the
  repo-state note above. Write new code against `Icon`, do not add new `Fa` usages.)*
- Never use `Math.random` in `packages/math-engine`; generation is seeded and deterministic.
  *(WP-02 creates that package.)*

## Commands

```
pnpm install
pnpm build            # turbo run build          (-be / -fe / -pkg variants)
pnpm lint             # turbo run lint           (-be / -fe / -pkg variants)
pnpm ts-check         # turbo run ts-check       (-be / -fe / -pkg variants)
pnpm test             # turbo run test integration-test
pnpm lint-styles      # stylelint
pnpm format-check     # oxfmt --check
pnpm knip
```

- Single test file: `pnpm vitest run path/to/test.ts`
- When running oxc lint, always pass `--format agent`.
- For typechecking prefer `pnpm oxlint --type-aware --type-check` over `tsc`.

## Commit rules — non-negotiable

- All lowercase, single line, **at most 5 words**, no body, no trailers.
- **Never** add a `Co-Authored-By:` trailer, and never mention Claude, Claude Code or AI authorship
  anywhere in a commit message. Commits are authored by the maintainer alone.
- Conventional-commit prefixes (`feat:`, `fix:`, …) are **not** used. monkeytype's historic commits
  keep their original messages; new commits follow the rule above.
- Commit in small logical commits. Do not push unless asked.

## Secrets

`frontend/src/ts/constants/firebase-config.ts` and `backend/src/credentials/serviceAccountKey.json`
hold real credentials and are gitignored. Keep them that way — never commit them. The production
frontend build generates `firebase-config-live.ts` from `FIREBASE_*` env vars in CI; that file is
never committed.

Production domain is **crococalc.com**. Contact address is contact@crococalc.com.

## Working style

Do not weaken or delete tests to make something pass. Verify your own work by running the relevant
build / typecheck / test command and reading the real output before claiming it passes.

In plan mode, ask clarifying questions before writing up a plan, and end with a concise list of any
unresolved questions.
