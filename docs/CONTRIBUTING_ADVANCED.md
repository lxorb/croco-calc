# Contributing - Advanced

## **Table of Contents**

- [Contributing - Advanced](#contributing---advanced)
  - [**Table of Contents**](#table-of-contents)
  - [Prerequisites](#prerequisites)
    - [Git](#git)
    - [NodeJS and PNPM](#nodejs-and-pnpm)
    - [Docker (Recommended but Optional)](#docker-recommended-but-optional)
    - [Firebase (optional)](#firebase-optional)
    - [Config file](#config-file)
    - [Database (optional if running frontend only)](#database-optional-if-running-frontend-only)
  - [Building and Running croco calc](#building-and-running-croco-calc)
    - [Dependencies (if running manually)](#dependencies-if-running-manually)
    - [Both Frontend and Backend](#both-frontend-and-backend)
    - [Backend only](#backend-only)
    - [Frontend only](#frontend-only)
  - [Standards and Guidelines](#standards-and-guidelines)
  - [Questions](#questions)

## Prerequisites

This guide covers setting up a local environment so you can test your changes or take screenshots
of them. You will need a text editor, Git, and NodeJS `24.11.0`. There are additional requirements
depending on what you're working on — Firebase for authentication, and MongoDB (plus optionally
Docker) for the backend.

### Git

> [!WARNING]
> **If you are on Windows, run `git config --global core.autocrlf false` before cloning this repo to prevent CRLF errors.**

croco calc uses Git for version control. If you are not comfortable on the command line, a GUI
client such as [Sourcetree](https://www.sourcetreeapp.com/) or
[GitHub Desktop](https://desktop.github.com/) will cover everything you need. Both can install Git
for you.

### NodeJS and PNPM

The project uses Node `24.11.0`. The supported range is `>=24 <25`.

If you use `nvm` (on Windows, [nvm-windows](https://github.com/coreybutler/nvm-windows)) you can run
`nvm install` and `nvm use` to pick up the version in `.nvmrc`. Otherwise download it from the
[NodeJS website](https://nodejs.org/en/).

For package management we use `pnpm`, not `npm` or `yarn`. Install it with
`npm i -g pnpm@10.28.1`.

> [!NOTE]
> The backend depends on `bcrypt`, a native module. On platforms without a prebuilt binary
> (for example Windows on ARM64) `pnpm install` will try to compile it and needs a working C++
> toolchain. If you only intend to work on the frontend you can use `pnpm install --ignore-scripts`.

### Docker (Recommended but Optional)

Docker can run the database, the frontend and the backend for you. It avoids OS-specific problems
but is more resource-intensive. Download it from the
[Docker website](https://www.docker.com/get-started/#h_installation).

### Firebase (optional)

The account system will not let you create an account without a Firebase project. Skip this if you
don't need it — you can always set it up later.

1. Create a Firebase account if you haven't already.
2. [Create a new Firebase project.](https://console.firebase.google.com/u/0/)
   - The project name doesn't matter. Google Analytics is not necessary.
3. Enable Firebase Authentication:
   - In the Firebase console, go to `Build > Authentication > Sign-in method`
   - Click `Email/Password`, enable it, and save
   - Click `Google`, add a support email, and save

### Config file

Within `frontend/src/ts/constants`, duplicate `firebase-config-example.ts` and rename the copy to
`firebase-config.ts`. This file is gitignored — never commit it.

- If you skipped the Firebase step, leave the fields blank.
- Otherwise:
  1. Navigate to `Project Settings > General > Your apps`
  2. If there are no apps in your project, create a new web app
  3. In the `SDK setup and configuration` section, select `npm`
  4. The Firebase config will be visible below
  5. Paste the config into `firebase-config.ts`
  6. Ensure there is an `export` statement before `const firebaseConfig`

If you want to access the frontend from other machines on your network, create `frontend/.env` with:

```
BACKEND_URL="http://<Your IP>:5005"
```

### Database (optional if running frontend only)

Follow these steps if you want to work on anything involving the database or account system.
Otherwise you can skip this section.

1. Inside the backend folder, copy `example.env` to `.env` in the same directory.
   - The backend Docker scripts read port bindings from this file. If `27017` or `5005` are already
     in use on your machine, update `DOCKER_DB_PORT` and `DOCKER_SERVER_PORT` before starting Docker.

2. Set up the database server:

| Manual                                                                                                                                                  | Docker (recommended)                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <ol><li>Install [MongoDB Community Edition](https://docs.mongodb.com/manual/administration/install-community/)</li><li>Make sure it is running</li></ol> | <ol><li>Install [Docker](http://www.docker.io/gettingstarted/#h_installation) on your machine</li><li>Run `npm run docker-db-only` from the `./backend` directory</li></ol> |

3. (Optional) Install [MongoDB Compass](https://www.mongodb.com/try/download/compass) to inspect the
   database visually. To connect, enter `mongodb://localhost:27017` in the connection string box and
   press connect. The croco calc database is created and shown once the server has started.

> [!NOTE]
> croco calc does not use Redis. Daily leaderboards and background jobs run against MongoDB.

## Building and Running croco calc

Just like the database, you can run the frontend and backend manually or with Docker.

### Dependencies (if running manually)

Run `pnpm i` in the project root to install all dependencies.

### Both Frontend and Backend

```
pnpm dev
```

### Backend only

| Manual        | Docker                         |
| ------------- | ------------------------------ |
| `pnpm dev-be` | `cd backend && npm run docker` |

### Frontend only

| Manual        | Docker                          |
| ------------- | ------------------------------- |
| `pnpm dev-fe` | `cd frontend && npm run docker` |

By default these commands start a local development website on
[port 3000](http://localhost:3000) and a local development server on
[port 5005](http://localhost:5005). They rebuild automatically when you change anything under
`src/`. Use <kbd>Ctrl+C</kbd> to stop them.

> [!NOTE]
> Rebuilding is not instantaneous and depends on your machine, so be patient for changes to appear.

If you are on a UNIX system and get a spawn error, run the command with `sudo`.

## Standards and Guidelines

Formatting and linting are enforced by [Oxc (oxfmt and oxlint)](https://github.com/oxc-project/oxc),
which runs automatically on every commit via a pre-commit hook. A commit-msg hook enforces the
commit message convention.

Useful commands:

```
pnpm lint          # oxlint
pnpm ts-check      # typecheck
pnpm test          # vitest
pnpm lint-styles   # stylelint
pnpm format-check  # oxfmt --check
```

For commit message rules and theme guidelines see [CONTRIBUTING.md](./CONTRIBUTING.md). The
authoritative specification for the project is [REQUIREMENTS.md](./REQUIREMENTS.md).

## Questions

If you have any questions, comments or problems, open a
[GitHub issue](https://github.com/lxorb/croco-calc/issues) or email
[contact@crococalc.com](mailto:contact@crococalc.com).
