# croco calc

A mental arithmetic trainer. Pick which kinds of problems you want — addition, multiplication,
division, fractions, decimals, negatives — set a timer, and solve as many as you can. You get a
score, a speed in tasks per minute, charts, personal bests and leaderboards.

Live at **[crococalc.com](https://crococalc.com)**.

> This is a placeholder README. The full one — screenshots, badges, setup guide — is still to come.

## Attribution and licence

croco calc is a derivative of **[Monkeytype](https://github.com/monkeytypegame/monkeytype)**,
licensed GPL-3.0. It was built by adapting monkeytype's codebase in place; this repository retains
monkeytype's full git history, and its design system, theme catalogue, configuration machinery and
build tooling all originate there. Thanks to Monkeytype's authors and contributors.

croco calc is therefore also licensed under the **GNU General Public License v3.0** — see
[`LICENSE`](./LICENSE) and [`NOTICE`](./NOTICE).

Because this is GPL-3.0 software, any **hosted** modification of croco calc obligates source
availability of the *whole* combined work — the backend service and the deployed frontend included,
not just the files that were changed. That obligation is satisfied by keeping this repository
public, which is why it must stay public while a build is publicly served.

## Development

Requires Node `>=24 <25` and pnpm `10.28.1`.

```bash
pnpm install
pnpm dev              # frontend + backend
pnpm build            # -be / -fe / -pkg variants
pnpm lint
pnpm ts-check
pnpm test
```

The repository is a pnpm + turbo monorepo: `frontend` (SolidJS + Vite), `backend` (Express +
MongoDB) and shared `@croco-calc/*` packages under `packages/`.

## Documentation

- [`docs/REQUIREMENTS.md`](./docs/REQUIREMENTS.md) — the authoritative specification
- [`docs/requirements/`](./docs/requirements) — supporting detail per area
- [`docs/THEMES.md`](./docs/THEMES.md) — theme authoring
- [`docs/CONTRIBUTING.md`](./docs/CONTRIBUTING.md) — contributing
- [`docs/SECURITY.md`](./docs/SECURITY.md) — reporting a vulnerability

## Contact

contact@crococalc.com · support@crococalc.com
