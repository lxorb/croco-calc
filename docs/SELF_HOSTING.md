# croco calc Self Hosting

<!-- TOC ignore:true -->

## Table of contents

<!-- TOC -->

- [croco calc Self Hosting](#croco-calc-self-hosting)
  - [Table of contents](#table-of-contents)
  - [Prerequisites](#prerequisites)
  - [Quickstart](#quickstart)
    - [Hosting over the network (HTTPS)](#hosting-over-the-network-https)
  - [Account System](#account-system)
    - [Setup Firebase](#setup-firebase)
    - [Update backend configuration](#update-backend-configuration)
    - [Setup Recaptcha](#setup-recaptcha)
  - [Daily leaderboards](#daily-leaderboards)
  - [Configuration files](#configuration-files)
    - [env file](#env-file)
    - [serviceAccountKey.json](#serviceaccountkeyjson)
    - [backend-configuration.json](#backend-configurationjson)
  - [How croco calc itself is deployed](#how-croco-calc-itself-is-deployed)

<!-- /TOC -->

## Prerequisites

- You need `docker` and the `docker-compose-plugin` installed. Follow the
  [docker documentation](https://docs.docker.com/compose/install/) for how to do this.

## Quickstart

- Create a new directory (e.g. `croco-calc`) and navigate into it.
- Download the [docker-compose.yml](https://github.com/lxorb/croco-calc/tree/main/docker/docker-compose.yml) file.
- Create an `.env` file — you can copy the content from
  [example.env](https://github.com/lxorb/croco-calc/tree/main/docker/example.env).
- Download [backend-configuration.json](https://github.com/lxorb/croco-calc/tree/main/docker/backend-configuration.json).
- Run `docker compose up -d`.
- Once the command exits successfully you can access [http://localhost:8080](http://localhost:8080).

The stack is MongoDB plus the backend API. croco calc does **not** use Redis.

### Hosting over the network (HTTPS)

If you plan to access your self-hosted croco calc instance over a local network or the internet
(not via `localhost`), **you must serve it over HTTPS**. Modern browsers restrict key web features,
such as `crypto.randomUUID`, to secure contexts. Accessing the site over plain HTTP on a network
will cause the frontend to crash with errors like
`Uncaught TypeError: crypto.randomUUID is not a function`.

To solve this, place a reverse proxy (Nginx, Caddy or Traefik) in front of your containers to
handle HTTPS/TLS termination.

## Account System

Accounts are optional. Without Firebase configured, the trainer works but nobody can sign up, and
results are not persisted to a profile.

### Setup Firebase

1. Create a [Firebase project](https://console.firebase.google.com/u/0/). Google Analytics is not
   required.
2. Under `Build > Authentication > Sign-in method`, enable the providers you want. croco calc
   supports Email/Password, Google and GitHub.
3. Under `Project Settings > Service accounts`, generate a new private key and save it as
   `serviceAccountKey.json` next to your compose file.
4. Under `Project Settings > General > Your apps`, create a web app and copy its config into the
   frontend's `firebase-config.ts` (see [CONTRIBUTING_ADVANCED.md](./CONTRIBUTING_ADVANCED.md)).
5. Add the hostname you serve from to Firebase's authorised domains list.

### Update backend configuration

In `backend-configuration.json`, set `users.signUp` to `true` to allow registration.

### Setup Recaptcha

Sign-up and a few other endpoints are protected by reCAPTCHA v2.

1. Register a site in the [reCAPTCHA admin console](https://www.google.com/recaptcha/admin) and add
   your hostname.
2. Put the **site key** in the frontend build environment as `RECAPTCHA_SITE_KEY`.
3. Put the **secret key** in the backend `.env` as `RECAPTCHA_SECRET`.

> [!NOTE]
> croco calc does not send transactional email. Password resets and email verification are handled
> by Firebase directly, so there is no SMTP configuration to set up.

## Daily leaderboards

Daily leaderboards are computed by a scheduled job in the backend against MongoDB. Enable them via
the `leaderboards` block in `backend-configuration.json`. Because croco calc only has timed tests,
the leaderboard is keyed on the test duration (`1`, `2`, `4` or `8` minutes) and on the default
settings combination — results recorded with non-default arithmetic settings do not enter the
leaderboard.

## Configuration files

### env file

All settings are described in the
[example.env](https://github.com/lxorb/croco-calc/tree/main/docker/example.env) file.

### serviceAccountKey.json

Contains your Firebase service account credentials. Only needed if you want to allow users to sign
up. Never commit this file.

### backend-configuration.json

Configuration of the backend. Check the default configuration in
`backend/src/constants/base-configuration.ts` for possible values.

> [!NOTE]
> Configuration changes are applied only on container startup. You must restart the container for
> your updates to take effect.

## How croco calc itself is deployed

The public instance at [crococalc.com](https://crococalc.com) does not use this compose stack. The
frontend is a static bundle served by Cloudflare Workers, and the backend runs as a container on
Azure Container Apps against a managed MongoDB, provisioned with Terraform under `infra/`.

That deployment, its secrets and its operational procedures are documented in
[RUNBOOK.md](./RUNBOOK.md).
