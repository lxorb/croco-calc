# Contributing

### **Table of Contents**

- [Getting Started](#getting-started)
- [How to Contribute](#how-to-contribute)
- [Standards and Guidelines](#standards-and-guidelines)
  - [Commit and Pull Request Naming](#commit-and-pull-request-naming)
  - [Theme Guidelines](#theme-guidelines)
- [Questions](#questions)

## Getting Started

croco calc is written in TypeScript, SCSS and HTML. The frontend is a SolidJS + Vite single-page
app styled with SCSS and Tailwind. The backend is Node with Express and stores data in MongoDB.
Firebase handles authentication. Shared zod schemas and ts-rest contracts live in `packages/`, and
the arithmetic task generator lives in `packages/math-engine`. We use Oxc (oxfmt and oxlint) to
format and lint, and Vitest for tests.

The repository is a pnpm + turbo monorepo. See [CONTRIBUTING_ADVANCED.md](/docs/CONTRIBUTING_ADVANCED.md)
for how to set up a local development environment.

Before making non-trivial changes, read [REQUIREMENTS.md](/docs/REQUIREMENTS.md) — it is the
authoritative specification for the project, and its requirement IDs are binding.

## How to Contribute

1. Fork the repository and create a branch.
2. Set up a development environment following [CONTRIBUTING_ADVANCED.md](/docs/CONTRIBUTING_ADVANCED.md).
3. Make your change, keeping it focused — one concern per pull request.
4. Run `pnpm lint`, `pnpm ts-check` and `pnpm test` before opening the pull request.
5. Open a pull request describing what changed and why. Include screenshots for anything visual.

## Standards and Guidelines

### Commit and Pull Request Naming

croco calc does **not** use Conventional Commits. Commit messages are:

- a single line, with no body and no trailers,
- all lowercase,
- at most **5 words**.

For example: `fix leaderboard rank display`.

A `commit-msg` git hook enforces this. Never add a `Co-Authored-By:` trailer or any other
self-attribution — commits are authored by their author alone.

Pull request titles should follow the same style, but may be a little more descriptive where that
genuinely helps a reviewer.

### Theme Guidelines

Before submitting a theme make sure:

- your theme is unique and isn't visually similar to one we already have,
- the text colour is either black or white (or very close to those colours),
- your theme has been added to the theme list and its `textColor` property is the theme's main
  colour,
- your theme is clear and readable with both `flip test colors` and `colorful mode` enabled and
  disabled.

If you want to contribute themes but don't know how, see [THEMES.md](/docs/THEMES.md).

## Questions

If you have any questions, comments or problems, open a
[GitHub issue](https://github.com/lxorb/croco-calc/issues) or email
[contact@crococalc.com](mailto:contact@crococalc.com).
