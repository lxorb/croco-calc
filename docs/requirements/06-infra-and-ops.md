# 06 — Infrastructure, Auth and Ops Requirements

**Owner:** infra/auth/ops workstream
**Product:** croco calc (monkeytype fork, SolidJS + Vite frontend, Express + MongoDB backend, pnpm + turbo monorepo)
**Status:** requirements only — no code, no provisioning, no commits performed by this document.

All requirements use MUST / MUST NOT / SHOULD / MAY per RFC 2119 intent. Every requirement is numbered
`INF-nnn` (INF-001 … INF-156, plus the lettered INF-058a and INF-086a added in revision 2 of the master document) and is written to be verifiable by a later stage. Claims about monkeytype behaviour cite the file
they were read from, relative to the reference checkout
`C:\Users\me\AppData\Local\Temp\claude\C--Users-me-Projects-calc-trainer\2ed5ffdc-09db-4833-a58e-c5b7bd58be53\scratchpad\monkeytype-ref`
(identical tree to `C:\Users\me\Projects\calc-trainer`).

---

## 0. Scope and cross-workstream decisions

- **INF-001** This document is the single source of truth for: frontend hosting (Cloudflare Workers), backend
  hosting (Azure + Terraform), database, caching/queues, Firebase Auth provisioning, app icon generation,
  the GitHub repository, CI/CD, secrets handling, observability and cost control. Anything else (test page
  behaviour, settings bar, maths generation, page layouts) is out of scope here.
- **INF-002** Two cross-cutting decisions made in this document affect the backend workstream and MUST be
  reflected in the backend requirements before implementation starts:
  1. **Redis and BullMQ are removed from croco calc** (see §4).
  2. **The Firebase service account is supplied as an environment variable, not as a file on disk** (see §7),
     which requires a change to `backend/src/init/firebase-admin.ts`.
- **INF-003** There MUST be exactly one deployed environment for v1, named `prod`. No staging/preview
  environment is provisioned. Local development uses `pnpm dev` against a local MongoDB container
  (`backend/docker/compose.db-only.yml`, adapted to drop Redis).
- **INF-004** Total recurring cloud spend MUST stay below USD 50/month. This is a hard ceiling from the brief.
  A subscription budget with alerts MUST enforce visibility of it (INF-143).

### Naming and region conventions

- **INF-005** All Azure resources MUST be created in a single region. The region MUST be `westeurope`.
- **INF-006** Azure resource names MUST be exactly:

  | Purpose | Name |
  |---|---|
  | Resource group (app) | `rg-croco-calc-prod` |
  | Resource group (TF state) | `rg-croco-calc-tfstate` |
  | Storage account (TF state + DB backups) | `stcrococalctfstate` |
  | Container Apps environment | `cae-croco-calc-prod` |
  | Container App (API) | `ca-croco-calc-api` |
  | Log Analytics workspace | `log-croco-calc-prod` |
  | Key Vault | `kv-crococalc-prod` |
  | User-assigned identity (API runtime) | `id-croco-calc-api` |
  | User-assigned identity (CI/CD) | `id-croco-calc-cicd` |
  | Subscription budget | `budget-croco-calc-monthly` |

- **INF-007** Every Azure resource MUST carry the tags `project = "croco-calc"`, `env = "prod"`,
  `managed_by = "terraform"`. A later stage MUST be able to verify this with
  `az resource list --tag project=croco-calc`.
- **INF-008** The Cloudflare Worker MUST be named `croco-calc`. The GitHub repository MUST be
  `lxorb/croco-calc`. The container image MUST be `ghcr.io/lxorb/croco-calc-api`.
- **INF-009** Known account identifiers, to be used literally:
  - Cloudflare account id `b0e98c15b1f905a394ecd6a849e8e99f` (account "Emil Vinu")
  - Azure subscription id `48317e81-bf0f-4424-8f69-c8513c91c001`
  - Azure tenant id `f2fb90a0-b1c1-4048-8959-038f203720ad` (verified via `az account show`)
  - GitHub account `lxorb` (verified via `gh auth status`: scopes `repo`, `workflow`, `delete_repo`,
    `read:org`, `gist`)
  - Notification/contact email `me@emilvinu.de`

---

## 1. Frontend hosting — Cloudflare Workers static assets

### Build output

- **INF-010** The frontend build MUST continue to emit to `frontend/dist`. This is the effective output of
  `frontend/vite.config.ts` (`root: "src"`, `build.outDir: "../dist"`) and is confirmed by
  `docker/frontend/Dockerfile` line 23 (`COPY --from=builder /app/frontend/dist ...`).
- **INF-011** The Cloudflare deployment MUST serve the *whole* `frontend/dist` directory, including the
  secondary HTML entry points declared in `frontend/vite.config.ts` (`rolldownOptions.input`):
  `index.html`, `email-handler.html`, `privacy-policy.html`, `security-policy.html`, `terms-of-service.html`,
  `404.html`. Any of these that croco calc keeps MUST remain reachable; any that are deleted MUST also be
  removed from `rolldownOptions.input` so the build does not fail.
- **INF-012** The frontend production build MUST be reproducible from CI with only environment variables as
  input. Required build-time env vars, all read by `frontend/vite.config.ts` /
  `frontend/vite-plugins/env-config.ts`:
  - `BACKEND_URL` — MUST be set to the Azure Container App FQDN (see INF-047). If unset, the build silently
    falls back to `https://api.monkeytype.com` (`vite-plugins/env-config.ts` line 41) — this is a hard
    failure condition for croco calc.
  - `RECAPTCHA_SITE_KEY` — MUST be set; `vite.config.ts` line 335 throws when it is missing in production.
  - `FIREBASE_*` values used to generate the firebase config module (see INF-090).
- **INF-013** A CI/build guard MUST fail the frontend build if `BACKEND_URL` is unset, empty, or contains
  `monkeytype.com`. This is testable: run the build with `BACKEND_URL` unset and assert a non-zero exit code.

### Wrangler configuration

- **INF-014** The repo MUST contain `frontend/wrangler.jsonc` (JSONC, not TOML — chosen for comment support
  and schema validation) configuring an **assets-only Worker**: no `main` entry, no Worker script.
- **INF-015** `frontend/wrangler.jsonc` MUST contain at minimum:
  - `"name": "croco-calc"`
  - `"account_id": "b0e98c15b1f905a394ecd6a849e8e99f"`
  - `"compatibility_date"` pinned to a fixed date string (not a moving value)
  - `"workers_dev": true`
  - `"assets": { "directory": "./dist", "not_found_handling": "single-page-application", "html_handling": "auto-trailing-slash" }`
  - `"observability": { "enabled": true }`
- **INF-016** `not_found_handling` MUST be `"single-page-application"`. Rationale: monkeytype's Firebase
  hosting config (`frontend/firebase.json` lines 5–14) rewrites `/test`, `/settings`, `/account`, `/about`,
  `/login`, `/profile`, `/friends`, `/account-settings`, `/leaderboards` and `/verify` (plus sub-paths) to
  `/index.html`; SPA fallback reproduces this for all client routes without maintaining a route list.
- **INF-017** `html_handling` MUST be `"auto-trailing-slash"` to reproduce monkeytype's
  `cleanUrls: true` + `trailingSlash: false` behaviour (`frontend/firebase.json` lines 15–16), i.e.
  `/privacy-policy` MUST serve `privacy-policy.html`.
- **INF-018** Verification: after deploy, `GET /leaderboards` MUST return HTTP 200 with the SPA shell,
  `GET /privacy-policy` MUST return HTTP 200 (if that page is kept), and `GET /js/<hashed>.js` MUST return
  the hashed asset with a long-lived cache header.

### Cache and security headers

- **INF-019** A `_headers` file MUST be committed at `frontend/static/_headers` so that Vite's `publicDir`
  copy places it at the root of `frontend/dist` (publicDir is `../static`, `frontend/vite.config.ts` line 369).
- **INF-020** The `_headers` rules MUST reproduce the caching policy of `frontend/firebase.json` lines 28–99,
  adapted to croco calc's hashed output paths (`js/[name].[hash].js`, `css/…`, `images/…`,
  `webfonts/[name]-[hash].*` — `frontend/vite.config.ts` lines 218–243):

  | Path pattern | `Cache-Control` |
  |---|---|
  | `/js/*` | `public, max-age=31536000, immutable` |
  | `/css/*` | `public, max-age=31536000, immutable` |
  | `/webfonts/*` | `public, max-age=31536000, immutable` |
  | `/images/*` | `public, max-age=31536000` |
  | `/sounds/*` | `public, max-age=31536000` |
  | `/themes/*` | `public, max-age=3600` |
  | `/index.html`, `/`, `/version.json`, `/sw.js`, `/service-worker.js`, `/manifest.json` | `no-cache, no-store, must-revalidate` |
  | `/*` (catch-all default) | `no-cache, no-store, must-revalidate` |

- **INF-021** The `_headers` file MUST additionally apply to `/*`:
  `X-Frame-Options: DENY`, `Content-Security-Policy: frame-ancestors 'none'`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`.
  The first two mirror `frontend/firebase.json` lines 22–25.
- **INF-022** A later stage MUST verify header application with
  `curl -sI https://croco-calc.<subdomain>.workers.dev/` and
  `curl -sI https://croco-calc.<subdomain>.workers.dev/js/<hashed>.js` and assert the values above.
  **ASSUMPTION:** Cloudflare Workers static assets honours `_headers` (the same mechanism as Pages). If the
  verification in this requirement fails, the fallback MUST be to add a minimal Worker script with an
  `assets` binding that sets the headers in `fetch()`, and `wrangler.jsonc` gains `"main"` — the cache policy
  itself is non-negotiable.

### workers.dev subdomain and deployment

- **INF-023** The account's workers.dev subdomain MUST be claimed/enabled once (Cloudflare dashboard →
  Workers & Pages → Subdomain). This is a **human action** if not already claimed.
- **INF-024** The production frontend URL MUST be `https://croco-calc.<account-subdomain>.workers.dev`.
  **ASSUMPTION:** the exact `<account-subdomain>` is not known at requirements time; it MUST be resolved once
  (via `wrangler whoami` / first deploy output) and then recorded in `docs/requirements/` and propagated to:
  `BACKEND_URL` consumers' counterpart `FRONTEND_URL` (INF-052), Firebase authorised domains (INF-095),
  Firebase email action URL (INF-102), `og:url`/`og:image` meta in `frontend/src/html/head.html`, and
  `frontend/static/sitemap.xml` / `robots.txt`.
- **INF-025** No custom domain, no Cloudflare zone, no DNS records are to be provisioned for v1. Consequently
  monkeytype's cache-purge tooling (`packages/release/bin/purgeCfCache.sh`, which purges a zone by
  `CF_ZONE_ID`) is inapplicable and MUST be deleted (INF-125); Workers asset deployments are versioned and
  need no purge.
- **INF-026** `wrangler` MUST be pinned as a devDependency of `frontend/package.json` (exact version, no
  caret) so CI and local use the same CLI. Deployment MUST be `wrangler deploy` executed with
  `frontend/wrangler.jsonc` as config, from a working tree where `frontend/dist` has just been built.
- **INF-027** `.gitignore` MUST include `.wrangler/`, `frontend/.wrangler/`, `.dev.vars`, `**/.dev.vars`.
- **INF-028** The Cloudflare API token MUST be supplied only as the environment variable
  `CLOUDFLARE_API_TOKEN` (plus `CLOUDFLARE_ACCOUNT_ID`). Locally it MUST be read at call time from
  `C:\Users\me\agent-secrets\cloudflare.txt`. The token value MUST NOT appear in any file inside the repo, in
  any commit, in `wrangler.jsonc`, in CI logs, or in this document.
- **INF-029** The Cloudflare API token MUST have (at least) these permissions; if the existing token lacks
  them a new scoped token MUST be created: *Account → Workers Scripts → Edit*,
  *Account → Account Settings → Read*, *User → User Details → Read*. Verification:
  `wrangler whoami` succeeds and `wrangler deploy --dry-run` succeeds.
- **INF-030** `frontend/src/html/head.html` currently preconnects to `https://api.monkeytype.com` (line 2).
  This MUST be changed to the Azure Container App FQDN, and the monkeytype `og:*`/`twitter:*`/`meta name=image`
  URLs (lines referencing `https://monkeytype.com/images/mtsocial.png`) MUST be changed to croco calc URLs.
- **INF-031** monkeytype's service worker runtime caching special-cases the hostname `api.monkeytype.com`
  (`frontend/vite.config.ts` line 161). This MUST be updated to the croco calc API hostname, otherwise API
  responses would be served from the SPA's `NetworkFirst` cache.
- **INF-032** Firebase Hosting MUST be fully removed from the frontend: delete `frontend/firebase.json`,
  `frontend/.firebaserc_example`, and the `firebase-tools` devDependency in `frontend/package.json`
  (line 105). (Firebase *Auth* stays — only Hosting goes.)

---

## 2. Backend hosting — options evaluated

The backend is monkeytype's Express 5 app (`backend/src/app.ts`), Node `>=24 <25`
(`backend/package.json` engines), listening on `PORT` default 5005 (`backend/src/server.ts` line 97),
speaking to MongoDB via the official `mongodb` driver (`backend/src/init/db.ts`).

### Compute options

| Option | Fit | Est. USD/month | Verdict |
|---|---|---|---|
| **Azure Container Apps (Consumption), min 1 replica, 0.5 vCPU / 1 GiB** | Container-native, HTTPS + free FQDN included, no registry cost when pulling a public ghcr image, per-second billing with cheap "idle" rate | **~11** | **CHOSEN** |
| Azure Container Apps with `minReplicas = 0` (scale to zero) | Cheapest (~0) but breaks in-process cron jobs and adds 10–30 s cold starts | ~0–3 | Rejected, see INF-034 |
| Azure App Service Linux **B1** | Simple, Always On available, predictable | ~12.4 | Viable runner-up; rejected because ACA gives the same price with better scaling and a cleaner container story |
| Azure App Service **F1 free** | 60 CPU-min/day quota, no Always On | 0 | Rejected — cron jobs and idle keep-alive impossible |
| Azure Container Instances, 1 vCPU / 1.5 GiB always-on | No built-in HTTPS/ingress, no scaling | ~30 | Rejected — worse and dearer |
| AKS | Node pool alone exceeds budget | ~70+ | Rejected |

- **INF-033** The backend MUST run on **Azure Container Apps**, Consumption workload profile, in
  `cae-croco-calc-prod`.
- **INF-034** `minReplicas` MUST be `1` (no scale-to-zero) and `maxReplicas` MUST be `3`. Rationale, grounded:
  `backend/src/server.ts` lines 70–72 starts in-process cron jobs (`backend/src/jobs/index.ts`:
  `update-leaderboards`, `delete-old-logs`, `log-collection-sizes`, `log-queue-sizes`) which only run while a
  replica is alive; scale-to-zero would silently stop leaderboard updates.
  **Amended (gap 2):** `minReplicas = 1` is NOT what keeps those jobs correct — `maxReplicas = 3` means 2–3
  replicas each run the same in-process cron. Correctness comes from the Mongo advisory lock of
  INF-151 … INF-155 (§4.1), which is mandatory. `minReplicas = 1` is retained purely to avoid the 10–30 s
  cold start (Node boot + Mongo connect + live-configuration fetch, `server.ts` lines 28–37) on a user's
  first request. Additionally a cold start pays for
  Node boot + Mongo connect + live-configuration fetch (`backend/src/server.ts` lines 28–37) on the user's
  first request.
- **INF-035** Container resources MUST be `cpu = 0.5`, `memory = "1Gi"` (a valid ACA Consumption combination).
- **INF-036** A single HTTP scale rule MUST be configured with `concurrentRequests = 50`.

### Cost estimate (chosen stack)

- **INF-037** The following monthly estimate MUST be recorded, and **every row's `source` cell MUST be filled
  in with a checked citation (calculator URL + date, or `az` command output) before `terraform apply`** —
  the table is a gate, not a note. Every rate below is currently marked `UNVERIFIED (from memory)`; that is
  the honest state (OQ-13 / B6) and it MUST NOT be left that way. Rows added by gap 23 are marked ✚.

  | Resource | SKU / assumption | Arithmetic | Est. USD/mo | source |
  |---|---|---|---|---|
  | Container App vCPU | 1 replica × 0.5 vCPU × 2,592,000 s at the ACA Consumption **idle** rate | 1,296,000 vCPU-s **less the 180,000 vCPU-s monthly free grant** ✚ (this grant was omitted from the original estimate) | ~3.4 | *UNVERIFIED* |
  | Container App memory | 1 replica × 1 GiB × 2,592,000 s | 2,592,000 GiB-s less the 360,000 GiB-s free grant | ~6.7 | *UNVERIFIED* |
  | Container App requests | first 2 M requests/mo free; load is ~single-user | — | 0 | *UNVERIFIED* |
  | Container Apps environment | Consumption workload profile | no per-environment charge | 0 | *UNVERIFIED* |
  | Log Analytics ingestion ✚ | 0.2 GB/day cap (INF-140) = ~6 GB/mo, **less the 5 GB/mo free grant** | ~1 GB billable × pay-as-you-go GB rate | 0–3 | *UNVERIFIED* |
  | Log Analytics retention ✚ | 30 days; first 31 days included | 0 | 0 | *UNVERIFIED* |
  | Metric alert rules ✚ | INF-142 requires **three** rules; ACA/Monitor bills per rule per month | 3 × per-rule rate | ~0.30–0.90 | *UNVERIFIED* |
  | Action group emails ✚ | INF-141, e-mail action | first 1,000 emails/mo free | 0 | *UNVERIFIED* |
  | Egress / bandwidth ✚ | API responses to Cloudflare + clients; first 100 GB/mo free tier-wide | well under 100 GB at this load | 0 | *UNVERIFIED* |
  | Key Vault `kv-crococalc-prod` | Standard, <10k ops | per-10k-operations rate | <0.10 | *UNVERIFIED* |
  | Storage `stcrococalctfstate` | StorageV2 LRS, <1 GiB (state + backups, Cool tier per INF-061) | GB-month + transactions | ~0.15 | *UNVERIFIED* |
  | MongoDB (see §3) | Atlas M0 free tier — **or Atlas Flex ~$8–12 if the INF-058 probe fails** ✚ | — | 0, or 8–12 | INF-062 |
  | Container registry | `ghcr.io` public image — no ACR provisioned | — | 0 | INF-039 |
  | Cloudflare Workers | Free plan, static assets | — | 0 | *UNVERIFIED* |
  | Firebase Auth | Spark plan, well under 50k MAU | — | 0 | *UNVERIFIED* |
  | Subscription budget + alerts | `azurerm_consumption_budget_subscription` | — | 0 | — |
  | **Total, M0 path** | | | **~11–15** | |
  | **Total, Flex fallback path** ✚ | | | **~19–27** | |

- **INF-038** The estimate MUST leave at least 60 % headroom under the $50 ceiling — i.e. total ≤ $20/mo.
  **Amended (gap 23):** on the Atlas Flex fallback path (INF-058) the total reaches ~$19–27, which can
  breach the 60 % rule. That path is nonetheless pre-approved because it stays under the brief's hard $50
  ceiling and INF-143's machine-enforced budget still applies; but taking it MUST trigger one re-check of
  this table with real citations, and the first tuning lever if it exceeds $25 is INF-144's (drop the
  Container App to 0.25 vCPU / 0.5 GiB). If any *other* component re-prices above the estimate, the stack
  MUST be re-evaluated before apply, not after.
- **INF-156 ✚ (added by the master document, gap 23)** `terraform apply` MUST NOT be run while any row of
  INF-037 still reads `UNVERIFIED`. Verification is a documented, repeatable step: record the calculator URL
  or `az` output and the date in the `source` column, commit the updated table, then apply. This is the only
  thing standing between the "<$50" claim and a number nobody has checked.
- **INF-039** An Azure Container Registry MUST NOT be provisioned. The repository is public (INF-118), so the
  image MUST be published to `ghcr.io/lxorb/croco-calc-api` with public visibility and pulled anonymously by
  the Container App. This saves the ACR Basic charge (~$5/mo).

### Container image

- **INF-040** The backend image MUST be built from a croco calc adaptation of
  `docker/backend/Dockerfile` (multi-stage: `node:24.x-alpine` builder → `pnpm deploy --legacy --filter backend --prod`
  → slim runtime, `USER node`, `EXPOSE 5005`).
- **INF-041** The runtime stage MUST NOT copy `backend/redis-scripts` (deleted, see INF-060) — line 30 of the
  reference Dockerfile MUST be removed.
- **INF-042** The image MUST NOT hardcode `ENV BYPASS_FIREBASE=true`, `ENV BYPASS_EMAILCLIENT=true` or
  `ENV BYPASS_ANTICHEAT=true`. `docker/backend/Dockerfile` lines 44–47 set all three; `BYPASS_FIREBASE=true`
  would disable authentication entirely (`backend/src/init/firebase-admin.ts` lines 19–21). croco calc's image
  MUST set only `ENV MODE=prod`. This is testable: `docker inspect` the built image and assert no `BYPASS_*`
  env entries.
- **INF-043** Image tags MUST be `:${GITHUB_SHA}` (immutable, used for the actual deploy) and `:latest`
  (convenience only). The Container App MUST always be pinned to the SHA tag, never `latest`.
- **INF-044** Image build MUST pass `--build-arg server_version=<git sha or tag>` so
  `/app/backend/dist/server.version` is populated (reference Dockerfile line 41).

### Ingress, probes, runtime configuration

- **INF-045** Ingress MUST be `external: true`, `targetPort: 5005`, `transport: auto`,
  `allowInsecure: false`.
- **INF-046** Health probes (liveness + readiness + startup) MUST target `GET /` on port 5005.
  Grounded: `backend/src/api/routes/index.ts` lines 178–186 defines `GET /` returning HTTP 200 with
  `{ message: "ok", data: { uptime, version } }`; the catch-all at lines 70–79 returns 404 for anything else,
  so `/` is the only usable probe path.
- **INF-047** The Container App's default FQDN (`https://ca-croco-calc-api.<env-hash>.westeurope.azurecontainerapps.io`)
  MUST be exported as a Terraform output named `api_base_url` and used verbatim as the frontend's
  `BACKEND_URL`. No custom domain is provisioned for v1. **ASSUMPTION:** an ugly API hostname is acceptable
  because the brief only specifies a domain for the frontend.
- **INF-048** `MAINTENANCE` MUST NOT be set on the Container App. Grounded:
  `backend/src/api/routes/index.ts` lines 150–174 makes the maintenance middleware return HTTP 503 for all
  paths except `/configuration` — including the `/` health probe — which would make ACA restart-loop the
  replica.
- **INF-049** The Container App MUST have `REDIS_URI` **unset** (see §4). Note that
  `backend/src/init/redis.ts` lines 82–88 currently *throws* in non-dev mode when `REDIS_URI` is missing; that
  code path is deleted by INF-065.
- **INF-050** Complete required runtime environment for `ca-croco-calc-api`
  (names verified by grepping `process.env[...]` across `backend/src`):

  | Variable | Source | Value / note |
  |---|---|---|
  | `MODE` | plain env | `prod` |
  | `PORT` | plain env | `5005` |
  | `DB_NAME` | plain env | `crococalc` |
  | `DB_URI` | **Key Vault secret ref** `mongodb-uri` | full SRV connection string incl. credentials |
  | `FRONTEND_URL` | plain env | the workers.dev URL (INF-024) |
  | `FIREBASE_SERVICE_ACCOUNT_JSON` | **Key Vault secret ref** `firebase-service-account` | whole service-account JSON, single line |
  | `RECAPTCHA_SECRET` | **Key Vault secret ref** `recaptcha-secret` | see §8 |
  | `LOG_FOLDER_PATH` | plain env | `/app/backend/dist/logs` (matches Dockerfile `mkdir`); files are ephemeral |
  | `LOG_FILE_MAX_SIZE` | plain env | `10485760` |
  | `STATS_USERNAME` / `STATS_PASSWORD` | Key Vault secret refs | only if the `swagger-stats` dashboard is kept; otherwise both MUST be absent and the dashboard disabled |

- **INF-051** These monkeytype env vars MUST NOT be set in prod: `BYPASS_ANTICHEAT`, `BYPASS_EMAILCLIENT`,
  `BYPASS_FIREBASE`, `MAINTENANCE`, `API_PATH_OVERRIDE`, `GITHUB_WEBHOOK_SECRET`, `REDIS_URI`,
  `DB_USERNAME`/`DB_PASSWORD`/`DB_AUTH_MECHANISM`/`DB_AUTH_SOURCE` (credentials travel inside `DB_URI`).
- **INF-052** `FRONTEND_URL` MUST equal the deployed workers.dev origin exactly (scheme + host, no trailing
  slash), because the backend uses it to build links in emails and redirects.
- **INF-053** Email (`EMAIL_HOST`/`EMAIL_PORT`/`EMAIL_USER`/`EMAIL_PASS`/`EMAIL_FROM`) MUST NOT be
  provisioned for v1. **ASSUMPTION:** all transactional email users care about (verification, password reset)
  is sent by Firebase Auth itself; monkeytype's own SMTP client
  (`backend/src/init/email-client.ts`) exists only for its own templates. The email client MUST therefore be
  removed together with the queue it depends on (INF-065), OR left initialised in a no-op state — removal is
  preferred and is the requirement.
- **INF-054** CORS: `backend/src/app.ts` line 22 uses `cors()` with default (allow-all) origin. This MUST be
  tightened to an allowlist containing only the workers.dev origin and `http://localhost:3000`
  (the Vite dev port, `frontend/vite.config.ts` line 349), keeping
  `exposedHeaders: [COMPATIBILITY_CHECK_HEADER]`.
- **INF-055** `app.set("trust proxy", 1)` (`backend/src/app.ts` line 25) MUST be kept — ACA terminates TLS in
  front of the container and rate limiting depends on the real client IP.

---

## 3. Database

### Options evaluated

- **INF-056** Evaluation, grounded in the aggregation features monkeytype actually uses:
  `backend/src/dal/leaderboards.ts` uses **`$setWindowFields`** (lines 69 and 155) and **`$merge`** (line 318);
  `backend/src/dal/connections.ts` uses `$lookup` with a sub-pipeline (line 314).

  | Option | Cost | Assessment |
  |---|---|---|
  | **MongoDB Atlas M0 (free), Azure `westeurope`** | **$0** | Real MongoDB 7/8 — `$setWindowFields`, `$merge`, pipeline `$lookup` all supported. 512 MB storage, shared CPU. **CHOSEN** |
  | Azure Cosmos DB for MongoDB **vCore**, free tier | $0 (free tier), else ~$73/mo at M10 | Stays inside Azure/Terraform-azurerm, but is a re-implementation of the wire protocol; `$setWindowFields` support is **not confirmed** and the paid tier blows the budget |
  | Azure Cosmos DB for MongoDB **RU / serverless** | ~$1–5 | Does **not** support `$setWindowFields`; the all-time leaderboard aggregation would fail. Rejected |
  | MongoDB in a container + Azure Files volume | ~$3 | No backups, no HA, operational burden. Rejected |

- **INF-057** The database MUST be **MongoDB Atlas M0 (free tier)**, cluster name `croco-calc`, cloud provider
  `AZURE`, region `EUROPE_WEST` (Atlas' name for Azure `westeurope`), so it is co-located with the Container
  App. **ASSUMPTION:** the brief said "Backend on Azure, provisioned with Terraform" but explicitly listed
  "Mongo Atlas free tier" as a candidate; Atlas is provisioned by Terraform too (provider `mongodb/mongodbatlas`),
  so the Terraform requirement holds even though the DB itself is not an Azure resource. Flagged as a
  deliberate deviation.
- **INF-058** Before `terraform apply`, a compatibility probe MUST be run against the chosen cluster: a script
  committed at `infra/scripts/db-probe.ts` that executes (a) a `$setWindowFields` rank pipeline, (b) a
  `$merge` into a temp collection, (c) a `$lookup` with a sub-pipeline, and exits non-zero on any failure.
  It MUST print which of the three failed. **This is a decision requirement with a named outcome, not an
  open-ended "revisit" (gap 14):**
  * **Probe passes** → Atlas **M0** is the database, as INF-057 states. No further action.
  * **Probe fails on any clause** → the database MUST become **Atlas Flex** in the same Atlas project,
    region `EUROPE_WEST`, via the one-line Terraform tier variable INF-062 already requires. No other
    option may be selected: INF-056 has already rejected Cosmos RU/serverless (no `$setWindowFields`),
    Cosmos vCore (unconfirmed support, $73/mo at M10) and self-hosted Mongo (no backups, operational
    burden), so re-opening the evaluation would only re-derive the same answer. `$merge` in particular is
    a documented restriction area on Atlas free/shared tiers, which makes clause (b) the most likely
    failure and makes this fallback the expected path rather than a remote contingency.
  * The Flex fallback costs ~$8–12/mo, is already priced in INF-062, and keeps the total (INF-037) at
    ~$19–26/mo — still inside INF-038's 60 % headroom rule. It therefore requires no re-approval.
  * The probe **cannot be run until BL-4 clears** (no Atlas org exists yet). Until then the Terraform code
    MUST be written so the tier is a variable with default `M0`, and `terraform apply` MUST NOT be run.
- **INF-058a** If the Flex fallback is taken, INF-037's cost table MUST be updated with the actual Flex line
  item **before** `terraform apply`, and INF-038 re-checked. If Flex also fails the probe, that is a hard
  stop requiring human sign-off — no third option is pre-approved.
- **INF-059** Atlas network access MUST allow the Container App's egress. **ASSUMPTION:** ACA Consumption in
  a non-VNet environment has no stable outbound IP, so the Atlas project IP access list MUST be `0.0.0.0/0`
  with security carried entirely by SCRAM credentials + TLS. If a stable egress IP is later required, the
  Container Apps environment MUST be moved into a VNet with a NAT gateway — which costs ~$32/mo and would
  breach the headroom rule (INF-038), so it is explicitly out of scope for v1.
- **INF-060** A single Atlas database user MUST be created with `readWrite` on database `crococalc` only
  (no `atlasAdmin`). Its password MUST be generated by Terraform (`random_password`, length ≥ 32) and stored
  only in Key Vault as `mongodb-uri`.
- **INF-061** Atlas M0 has no automated backups. A scheduled GitHub Actions workflow MUST run weekly,
  `mongodump` the `crococalc` database, and upload the archive to the `backups` container of
  `stcrococalctfstate` (Cool tier) using the CI managed identity. A storage lifecycle rule MUST delete
  backups older than 30 days.
- **INF-062** The upgrade path if 512 MB is exceeded MUST be documented: move to Atlas Flex (~$8–12/mo), which
  still fits the ceiling. A Terraform variable MUST make the tier a one-line change.

---

## 4. Caching / queues — Redis decision

- **INF-063** **Redis MUST be removed from croco calc.** Neither Azure Cache for Redis, Azure Managed Redis,
  nor a self-hosted Redis container is to be provisioned. Rationale:
  - Azure Cache for Redis Basic C0 costs ~$16/mo — over a third of the entire budget for a single-user-scale
    app.
  - Redis is used in exactly three places (verified by grepping `redis` across `backend/src`):
    `backend/src/utils/daily-leaderboards.ts` (sorted sets + Lua scripts in `backend/redis-scripts/`),
    `backend/src/services/weekly-xp-leaderboard.ts` (same pattern), and BullMQ queues/workers
    (`backend/src/queues/*`, `backend/src/workers/*`).
  - Rate limiting does **not** need Redis: `backend/src/middlewares/rate-limit.ts` line 3 uses
    `RateLimiterMemory` and `express-rate-limit`'s default in-memory store. With `maxReplicas = 3` limits are
    per-replica, which is acceptable at this load.
- **INF-064** The daily leaderboard and the weekly XP leaderboard MUST be re-implemented on MongoDB:
  a `dailyLeaderboards` collection and a `weeklyXpLeaderboards` collection, each keyed by
  `{ timestamp, modeKey, uid }` with a compound index on `{ timestamp, modeKey, score: -1 }` and a TTL index
  for expiry. Ranking MUST use `$setWindowFields` `$denseRank`/`$rank`, the same technique already used for
  the all-time leaderboard in `backend/src/dal/leaderboards.ts` lines 69 and 155.
- **INF-065** `backend/redis-scripts/` (`add-result.lua`, `add-result-increment.lua`, `get-rank.lua`,
  `get-results.lua`, `purge-results.lua`), `backend/src/init/redis.ts`, `backend/src/queues/` and
  `backend/src/workers/` MUST be deleted, together with the `ioredis`, `@types/ioredis` and `bullmq`
  dependencies in `backend/package.json`.
- **INF-066** The scheduled work that BullMQ's `later-queue` performed
  (`daily-leaderboard-results` and `weekly-xp-leaderboard-results`, see
  `backend/src/queues/later-queue.ts` lines 13–28) MUST be moved into the existing `cron`-based job runner
  (`backend/src/jobs/index.ts`, started at `backend/src/server.ts` lines 70–72): a daily job just after
  UTC midnight and a weekly job just after the week rollover.
- **INF-067** `backend/src/queues/george-queue.ts` (Discord integration) MUST be deleted — Discord is on the
  deferred list (§13).
- **INF-068** The boot sequence in `backend/src/server.ts` lines 42–68 (redis connect, queue init, worker
  init) MUST be removed; `docker/docker-compose.yml`, `backend/docker/compose.yml` and
  `backend/docker/compose.db-only.yml` MUST drop their `redis` service, `redis-data` volume and
  `REDIS_URI` env; `backend/example.env` MUST drop `DOCKER_REDIS_PORT` and `REDIS_URI`.
- **INF-069** Verification: `grep -ri "redis\|bullmq" backend/ docker/ infra/` MUST return no matches other
  than in changelog/history files, and the backend MUST boot successfully with no `REDIS_URI` in the
  environment.

### 4.1 Job single-execution (added by the master document, gap 2 — BLOCKER fix)

Removing BullMQ removed the only thing that guaranteed a single consumer. INF-034 keeps `minReplicas = 1`
*because* the cron jobs live in-process, but INF-036 lets ACA scale to `maxReplicas = 3` on 50 concurrent
requests — and INF-066 has just moved the daily-leaderboard rollover and the weekly-XP rollover into that
same in-process runner. At 2–3 replicas `update-leaderboards`, the daily rollover and the weekly rollover
would each fire two or three times concurrently, double-awarding XP and corrupting rank snapshots. There is
no leader election anywhere in the design. Therefore:

- **INF-151** **Every** job in `backend/src/jobs/**` MUST acquire a **MongoDB-backed advisory lock** before
  doing any work and MUST no-op if it cannot. The lock MUST be a document in a dedicated collection
  `jobLocks` with a **unique index on `{ jobName: 1, periodKey: 1 }`**, where `periodKey` is the
  deterministic identifier of the occurrence being processed (e.g. `2026-08-02` for the daily rollover,
  `2026-W31` for the weekly-XP rollover, and the floor of the run time to the job's interval for
  `update-leaderboards` and `delete-old-logs`). Acquisition is a single `insertOne`; a duplicate-key error
  means another replica owns this occurrence and the job MUST return immediately without logging an error.
  The document MUST carry `{ acquiredAt, replicaId, state: "running"|"done"|"failed", heartbeatAt }`, and a
  **TTL index on `acquiredAt`** MUST expire lock documents after 24 h so the collection cannot grow without
  bound.
- **INF-152** A lock whose `state` is still `"running"` and whose `heartbeatAt` is older than **10 minutes**
  MUST be treated as stale and MUST be reclaimable by a `findOneAndUpdate` that atomically re-stamps
  `replicaId`/`acquiredAt`. This is the crash-recovery path: without it, one replica dying mid-job would
  block that occurrence forever. Jobs longer than one minute MUST refresh `heartbeatAt`.
- **INF-153** **Idempotency is required in addition to the lock**, not instead of it. Each rollover job MUST
  be written so that running it twice over the same `periodKey` produces the same database state (upserts
  keyed on `{ timestamp, modeKey, uid }` per INF-064, no blind `$inc` on user documents). The lock prevents
  concurrency; idempotency prevents damage from the retry the lock cannot prevent.
- **INF-154** Acceptance, both required: (a) an integration test starts **three** job runners against one
  testcontainers Mongo, fires the same job in all three simultaneously, and asserts exactly one performed
  work and the resulting collection state equals the single-runner state; (b) the same job is then run a
  second time over the same `periodKey` and the collection state is byte-identical (INF-153).
- **INF-155** With INF-151 … INF-154 in place, `minReplicas = 1` is no longer load-bearing for job
  correctness (it remains load-bearing for cold starts, INF-034) and `maxReplicas = 3` (INF-036) is safe.
  Neither value changes; the rationale in INF-034 MUST be amended to cite this section rather than implying
  that single-replica operation is what keeps the jobs correct.

---

## 5. Terraform

- **INF-070** All Azure and Atlas infrastructure MUST be defined in Terraform under `infra/terraform/`.
  Manual portal changes are forbidden; drift MUST be fixed by editing Terraform, not the portal.
- **INF-071** Directory layout MUST be exactly:

  ```
  infra/terraform/
    bootstrap/            # one-time: rg-croco-calc-tfstate + stcrococalctfstate (local state)
      main.tf providers.tf variables.tf outputs.tf
    prod/                 # the root module that is applied by CI
      backend.tf providers.tf main.tf variables.tf outputs.tf terraform.tfvars
    modules/
      container-app/      # cae-*, ca-*, id-croco-calc-api, ingress, probes, scale rules
      mongodb-atlas/      # project, M0 cluster, db user, ip access list
      key-vault/          # kv-*, access policies / RBAC, secret placeholders
      observability/      # log analytics workspace, alerts, action group
      budget/             # azurerm_consumption_budget_subscription
  ```

- **INF-072** `infra/terraform/bootstrap/` MUST create `rg-croco-calc-tfstate` and the storage account
  `stcrococalctfstate` (StorageV2, LRS, `min_tls_version = "TLS1_2"`,
  `allow_nested_items_to_be_public = false`, `public_network_access_enabled = true` but shared-key access
  disabled, blob versioning on, blob soft-delete 30 days) with containers `tfstate` and `backups`.
  It MUST use **local state**, and that local state file MUST be gitignored. Bootstrap is run once, manually.
- **INF-073** `infra/terraform/prod/backend.tf` MUST configure the `azurerm` remote backend with
  `resource_group_name = "rg-croco-calc-tfstate"`, `storage_account_name = "stcrococalctfstate"`,
  `container_name = "tfstate"`, `key = "prod.terraform.tfstate"`, `use_azuread_auth = true` (no storage
  account keys), and the subscription id from INF-009.
- **INF-074** Provider versions MUST be pinned with `~>` at the minor level in `required_providers`
  (`azurerm`, `mongodbatlas`, `random`), and `required_version` MUST be `"~> 1.14"` (installed Terraform is
  v1.14.8, verified with `terraform version`).
- **INF-075** `.terraform.lock.hcl` MUST be committed. `.terraform/`, `*.tfstate`, `*.tfstate.backup`,
  `*.tfvars` containing secrets, and `crash.log` MUST be gitignored.
- **INF-076** No secret value may appear in any `.tf` or committed `.tfvars` file. Secrets MUST enter
  Terraform only through `TF_VAR_*` environment variables, and every such variable MUST be declared
  `sensitive = true`.
- **INF-077** Because remote state will contain the Atlas connection string and generated password, access to
  the `tfstate` container MUST be restricted to the operator's own Azure identity and `id-croco-calc-cicd`
  via the `Storage Blob Data Contributor` role. No SAS tokens, no anonymous access.
- **INF-078** The `prod` root module MUST expose these outputs: `api_base_url`, `container_app_fqdn`,
  `key_vault_uri`, `log_analytics_workspace_id`, and `mongodb_uri` (marked `sensitive`).
- **INF-079** `terraform plan` MUST be runnable by CI on pull requests with read-only credentials and MUST
  post/attach the plan; `terraform apply` MUST only run from a `workflow_dispatch` on `main` with manual
  approval — never automatically on push.
- **INF-080** Every module MUST be idempotent: a second consecutive `terraform apply` with no code change
  MUST report `No changes.` This is the acceptance test for the Terraform stage.
- **INF-081** All Azure resource providers required are already registered on the subscription
  (verified: `Microsoft.App`, `Microsoft.DocumentDB`, `Microsoft.KeyVault`, `Microsoft.OperationalInsights`,
  `Microsoft.ContainerRegistry` all `Registered`). No registration step is needed.

---

## 6. Secrets and configuration strategy

- **INF-082** Secrets MUST live in exactly three places, and nowhere else:
  1. **Azure Key Vault `kv-crococalc-prod`** — runtime secrets consumed by the backend.
  2. **GitHub Actions repository secrets** — credentials CI needs to authenticate to Azure/Cloudflare and to
     build the frontend.
  3. **`C:\Users\me\agent-secrets\*.txt`** — local operator credentials, read at call time only.
- **INF-083** Key Vault secrets MUST be exactly: `mongodb-uri`, `firebase-service-account`,
  `recaptcha-secret`, and (only if the stats dashboard is kept) `stats-username`, `stats-password`.
  RBAC authorisation MUST be used (`enable_rbac_authorization = true`), soft-delete on, purge protection on.
- **INF-084** The Container App MUST read these via Key Vault secret references bound to the
  **user-assigned managed identity** `id-croco-calc-api`, which MUST hold the `Key Vault Secrets User` role on
  the vault. Secret *values* MUST NOT be written into the Container App template as literals.
- **INF-085** GitHub Actions MUST authenticate to Azure via **OIDC federated credentials** — no client secret,
  no `AZURE_CREDENTIALS` JSON blob. `id-croco-calc-cicd` MUST have federated credentials for
  `repo:lxorb/croco-calc:ref:refs/heads/main` and `repo:lxorb/croco-calc:pull_request`, and the roles
  `Contributor` on `rg-croco-calc-prod`, `Storage Blob Data Contributor` on `stcrococalctfstate`,
  `Key Vault Secrets Officer` on `kv-crococalc-prod`.
- **INF-086** Required GitHub Actions repository **secrets** (names are normative):
  `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `CLOUDFLARE_API_TOKEN`,
  `CLOUDFLARE_ACCOUNT_ID`, `MONGODB_ATLAS_PUBLIC_KEY`, `MONGODB_ATLAS_PRIVATE_KEY`,
  `RECAPTCHA_SITE_KEY`, `FIREBASE_APIKEY`, `FIREBASE_AUTHDOMAIN`, `FIREBASE_PROJECTID`,
  `FIREBASE_STORAGEBUCKET`, `FIREBASE_MESSAGINGSENDERID`, `FIREBASE_APPID`.
  (The `FIREBASE_*` naming mirrors `docker/example.env` lines 23–28 so the existing convention is kept.)
- **INF-086a (added by the master document, gap 13)** Two values that INF-012/INF-013/INF-061/INF-129 make
  hard requirements had **no defined source** and MUST be added:
  | name | kind | source | consumed by |
  |---|---|---|---|
  | `BACKEND_URL` | repository **variable** (`vars.BACKEND_URL`, not a secret — it is a public hostname) | the Terraform output `api_base_url` (INF-047), written back by `infra.yml` after apply | `deploy-frontend.yml` (INF-129), the INF-013 build guard, INF-030's preconnect, INF-031's service-worker hostname, INF-054's CORS allowlist |
  | `DB_URI` | repository **secret** | the same connection string Terraform writes to Key Vault `mongodb-uri` (INF-060) | the weekly `backup-db.yml` `mongodump` workflow (INF-061) |
  `infra.yml` MUST set `vars.BACKEND_URL` via `gh variable set` from the Terraform output as its final step,
  so the value can never drift from the deployed FQDN. `backup-db.yml` MAY instead read `mongodb-uri`
  directly from Key Vault using the CI managed identity (INF-085), in which case `DB_URI` is not needed as a
  secret — **one of the two mechanisms MUST be chosen and written down in `docs/RUNBOOK.md`**; leaving both
  unspecified is what this requirement exists to prevent.
- **INF-087** A `.env.example` at repo root and `backend/example.env` MUST be updated to list every variable
  with placeholder values and MUST contain no real credentials. `docker/example.env`'s reCAPTCHA test keys
  (lines 14–15) MUST NOT be carried into production configuration.
- **INF-088** `.gitignore` MUST keep the existing protections and add the new ones:
  `frontend/src/ts/constants/firebase-config.ts`, `frontend/src/ts/constants/firebase-config-live.ts`
  (already present at `.gitignore` lines 86–87), `backend/src/credentials/*.json`, `infra/**/*.tfvars`,
  `infra/**/.terraform/`, `infra/**/*.tfstate*`.
- **INF-089** A pre-push / CI secret scan MUST run (e.g. `gitleaks`) and MUST fail on any detected
  credential. Verification: planting a fake `AIza...`-shaped string in a scratch commit makes the check fail.

---

## 7. Auth — Firebase

croco calc keeps monkeytype's Firebase Auth integration unchanged in shape:
`frontend/src/ts/firebase.ts` initialises the app from `./constants/firebase-config`;
`frontend/src/ts/auth.tsx` lines 66–81 declares exactly three auth methods — `password`, `github`
(`GithubAuthProvider`), `google` (`GoogleAuthProvider`); the backend verifies ID tokens through
`firebase-admin` (`backend/src/init/firebase-admin.ts`, `backend/src/utils/auth.ts`).

- **INF-090** **All three sign-in methods are in v1 scope**: email/password, Google, GitHub. They are
  explicitly NOT deferred (this reverses the original deferred list).
- **INF-091** A dedicated Firebase project MUST be created, project id `croco-calc` (or the closest available
  variant), on the **Spark** plan. Firebase Auth's free quota (50k MAU) is far above expected load, so no
  billing account is required. **HUMAN ACTION** — cannot be automated without Google credentials.
- **INF-092** A **Web App** MUST be registered inside that project (Firebase console → Project settings →
  General → Your apps → Web). Firebase Hosting MUST NOT be enabled for it. **HUMAN ACTION.**
  The resulting config supplies the six values the frontend needs.
- **INF-093** Sign-in providers to enable in Firebase console → Authentication → Sign-in method:
  1. **Email/Password** — enable; email link (passwordless) MUST stay disabled. **HUMAN ACTION.**
  2. **Google** — enable; a project support email MUST be selected. Firebase auto-creates the underlying
     Google OAuth client. **HUMAN ACTION.**
  3. **GitHub** — enable; requires the client id/secret from INF-094. **HUMAN ACTION.**
- **INF-094** A **GitHub OAuth App** MUST be created at `https://github.com/settings/developers`
  (Settings → Developer settings → OAuth Apps → New OAuth App) with:
  - Application name: `croco calc`
  - Homepage URL: the workers.dev URL (INF-024)
  - Authorization callback URL: `https://<firebase-project-id>.firebaseapp.com/__/auth/handler`

  Its Client ID and Client Secret are then pasted into the Firebase GitHub provider.
  **HUMAN ACTION — cannot be automated:** the GitHub REST API has no endpoint for creating OAuth Apps
  (only GitHub *Apps* have a manifest flow), and the local `gh` token's scopes
  (`repo`, `workflow`, `delete_repo`, `read:org`, `gist`) do not cover developer settings anyway.
- **INF-095** Firebase → Authentication → Settings → **Authorized domains** MUST contain
  `croco-calc.<account-subdomain>.workers.dev`, `localhost`, and the two default
  `*.firebaseapp.com` / `*.web.app` entries. Sign-in popups fail without this. **HUMAN ACTION.**
- **INF-096** A **service account private key** MUST be generated (Firebase console → Project settings →
  Service accounts → Generate new private key) for backend ID-token verification. **HUMAN ACTION.**
- **INF-097** The service-account JSON MUST NOT be committed and MUST NOT be shipped inside the container
  image. It MUST be stored as the Key Vault secret `firebase-service-account` and injected as the env var
  `FIREBASE_SERVICE_ACCOUNT_JSON`.
- **INF-098** `backend/src/init/firebase-admin.ts` MUST be modified accordingly: today it reads
  `path.join(__dirname, "../../src/credentials/serviceAccountKey.json")` (lines 8–11) and calls
  `admin.credential.cert(SERVICE_ACCOUNT_PATH)` (line 30). It MUST instead prefer
  `FIREBASE_SERVICE_ACCOUNT_JSON` (parsed and passed to `admin.credential.cert(...)`), falling back to the
  file path for local development only. In `MODE=prod` with neither present it MUST throw and the process
  MUST exit non-zero (the `BYPASS_FIREBASE` escape hatch at line 19 MUST be removed).
- **INF-099** Exact config values each side needs:

  | Consumer | Values | Delivery mechanism |
  |---|---|---|
  | Frontend | `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId` (`databaseURL` MAY be omitted/empty — Realtime Database is unused) | generated into `frontend/src/ts/constants/firebase-config.ts` **and** `firebase-config-live.ts` at build time from `FIREBASE_*` env vars |
  | Backend | whole service-account JSON (`project_id`, `client_email`, `private_key`) | Key Vault → `FIREBASE_SERVICE_ACCOUNT_JSON` |

- **INF-100** The build-time generation of the two firebase config modules MUST mirror the mechanism in
  `docker/frontend/Dockerfile` lines 12–13 (which copies a `firebase-config-live.ts` into both locations).
  Rationale for needing *both*: `frontend/vite.config.ts` lines 357–366 aliases
  `/constants/firebase-config` → `/constants/firebase-config-live` in production builds only.
- **INF-101** CI's lint/build job MAY stub the config exactly as monkeytype does
  (`.github/workflows/monkey-ci.yml` line 248:
  `mv ./firebase-config-example.ts ./firebase-config.ts && cp ./firebase-config.ts ./firebase-config-live.ts`).
  The **deploy** workflow MUST NOT use the stub and MUST fail if any `FIREBASE_*` secret is missing or empty.
- **INF-102** Firebase email templates: the action URL for verification/reset MUST be set to
  `https://croco-calc.<account-subdomain>.workers.dev/verify`, matching monkeytype's dedicated
  `/verify` rewrite (`frontend/firebase.json` lines 10–13) and its `email-handler.html` entry point
  (`frontend/vite.config.ts` line 211). **HUMAN ACTION.**
- **INF-103** **BLOCKER — flagged explicitly:** no Firebase credentials exist locally. `C:\Users\me\agent-secrets\`
  contains `cloudflare.txt` and `openai.txt` but no Firebase key or service account (verified by listing the
  directory). Until INF-091 to INF-096 are performed by a human:
  - the production frontend build cannot produce a working auth config,
  - the backend cannot verify ID tokens,
  - GitHub and Google sign-in cannot be tested end-to-end.

  Implementation stages MUST therefore treat auth as *code-complete but unverified*, use the stub config for
  CI, and MUST NOT mark the auth work "done" until a real sign-in with each of the three providers succeeds
  against the deployed stack.
- **INF-104** Acceptance test for auth (to be run once credentials exist): on the deployed workers.dev site,
  (a) register with email/password and receive a verification email, (b) sign in with Google, (c) sign in with
  GitHub, (d) call an authenticated backend endpoint and receive 200, (e) sign out. All five MUST pass.

---

## 8. reCAPTCHA

- **INF-105** reCAPTCHA MUST be kept — it is load-bearing for the build and for several flows:
  `frontend/vite.config.ts` line 335 hard-fails a production build without `RECAPTCHA_SITE_KEY`, and it is
  used by `Register.tsx`, `ForgotPasswordModal.tsx`, `UserReportModal.tsx`, `RegisterCaptchaModal.tsx`
  (verified by grep under `frontend/src`) and validated server-side by `backend/src/utils/captcha.ts`.
- **INF-106** A **reCAPTCHA v2 ("I'm not a robot") site** MUST be registered at
  `https://www.google.com/recaptcha/admin` with domains `croco-calc.<account-subdomain>.workers.dev` and
  `localhost`. **HUMAN ACTION.** Cost: $0.
- **INF-107** The site key MUST become the GH secret `RECAPTCHA_SITE_KEY` (build-time, public) and the secret
  key MUST become the Key Vault secret `recaptcha-secret` (runtime, private). monkeytype's public test keys
  (`backend/example.env` line 11, `docker/example.env` lines 14–15) MUST NOT be used in production.

---

## 9. App icon — OpenAI image API

### Generation

- **INF-108** The croco calc icon MUST be generated with the OpenAI image API:
  `POST https://api.openai.com/v1/images/generations`, model `gpt-image-1`, `size: "1024x1024"`,
  `background: "transparent"`, `quality: "high"`, `n: 1` (generate several candidates and pick one).
- **INF-109** The API key MUST be read at call time from `C:\Users\me\agent-secrets\openai.txt` into the env
  var `OPENAI_API_KEY`. It MUST NOT be written into the repo, a script literal, or a commit.
- **INF-110** The generation script MUST live at `scripts/generate-icon.ts`, MUST take the prompt from a
  committed text file, and MUST write raw output to a gitignored scratch directory — only the curated,
  post-processed assets get committed.
- **INF-111** The prompt MUST direct the model toward a mark that is stylistically a sibling of monkeytype's
  logo, which (read from `frontend/src/ts/components/layout/header/Logo.tsx` lines 25–43) is a single-colour
  inline SVG, `viewBox="-680 -1030 300 180"` (5:3), drawn as glyph shapes enclosed by a **rounded-rectangle
  outline**, filled with `currentColor` and coloured by the theme (`fill-[currentColor] text-main`).
  The prompt MUST specify, in substance:

  > A minimalist flat vector app icon: a stylised crocodile head in profile, enclosed by a thick rounded-rectangle
  > outline frame. Single solid colour on a fully transparent background, no gradients, no shading, no outline
  > strokes of a second colour, no text, no background shape fill. Even, chunky line weights; large simple
  > forms; generous internal padding; strictly centred; geometric and friendly; must stay legible when scaled
  > down to 16×16 pixels. Style reference: modern monoline logo marks with rounded corners.

- **INF-112** The chosen raster output MUST be converted into a hand-cleaned **SVG** master
  (`frontend/static/images/logo/croco-mark.svg`) with a single `<path>`/`<g>`, no embedded raster, no inline
  `fill` other than `currentColor`, and a viewBox with a 5:3 aspect ratio so it drops into the existing header
  layout. Monochrome is mandatory: the mark MUST inherit the theme colour exactly as monkeytype's does.
- **INF-113** The header logo MUST be implemented by replacing the SVG paths inside
  `frontend/src/ts/components/layout/header/Logo.tsx` with the croco mark, keeping the surrounding classes
  (`h-full fill-[currentColor] text-main transition-colors`, `text-sub` on focus), and replacing the wordmark
  text `monkeytype` (line 62) with `croco calc`, the subtext `monkey see` (line 54) with a croco-calc
  equivalent, and `aria-label="Monkeytype Home"` (line 14) with `"croco calc Home"`.

### Output asset matrix

- **INF-114** Every asset below MUST be produced and committed. Paths mirror monkeytype's existing layout
  (verified by listing `frontend/static/images/favicon/` and `frontend/static/images/icons/`), so nothing
  else has to be re-pathed:

  | Asset | Size / format | Path | Notes |
  |---|---|---|---|
  | Master mark | SVG, 5:3 | `frontend/static/images/logo/croco-mark.svg` | `currentColor`, source of truth |
  | Favicon (multi-res) | ICO, 16 + 32 + 48 | `frontend/static/images/favicon/favicon.ico` | referenced by `head.html` |
  | Favicon PNG | 16×16 | `frontend/static/images/favicon/favicon-16x16.png` | |
  | Favicon PNG | 32×32 | `frontend/static/images/favicon/favicon-32x32.png` | |
  | Favicon SVG | square, 1:1 | `frontend/static/images/favicon/favicon.svg` | monochrome |
  | Apple touch icon | 180×180 PNG | `frontend/static/images/favicon/apple-touch-icon.png` | opaque background, no transparency |
  | Android/PWA icon | 192×192 PNG | `frontend/static/images/favicon/android-chrome-192x192.png` | |
  | Android/PWA icon | 512×512 PNG | `frontend/static/images/favicon/android-chrome-512x512.png` | |
  | Safari pinned tab | SVG, solid black | `frontend/static/images/favicon/safari-pinned-tab.svg` | single path |
  | MS tiles | 70×70, 150×150, 310×150, 310×310 PNG | `frontend/static/images/favicon/mstile-*.png` | |
  | Browser config | XML | `frontend/static/images/favicon/browserconfig.xml` | tile colour updated |
  | PWA icon (any) | 512×512 PNG | `frontend/static/images/icons/general_icon_x512.png` | name fixed by `vite.config.ts` line 141 |
  | PWA icon (maskable) | 512×512 PNG | `frontend/static/images/icons/maskable_icon_x512.png` | ≥20 % safe-area padding, name fixed by `vite.config.ts` line 134 |
  | Social / OG image | 1200×630 PNG | `frontend/static/images/crococalcsocial.png` | replaces `mtsocial.png` |

- **INF-115** monkeytype-branded images MUST be deleted, not merely left unreferenced:
  `frontend/static/images/monkey/`, `mtfulllogo.png`, `mt-icon-512.png`, `mtsocial.png`, `monkeymeme.jpg`,
  `githubbanner2.png`, `plushiebanner.png`, `merch2.png`, `merch3.png`, `merch4.png`, `fav.png`.
  (The merch images are additionally moot because the support modal drops the merch button.)
- **INF-116** The PWA manifest block in `frontend/vite.config.ts` lines 128–151 MUST be updated:
  `short_name` and `name` → `"croco calc"`, and `background_color` / `theme_color` set to croco calc's default
  theme background. The two icon `src` paths stay as-is (INF-114 keeps the filenames).
- **INF-117** `frontend/src/html/head.html` MUST be updated wholesale: `<title>`, `meta name="description"`,
  `meta name="keywords"`, `meta name="author"`, `og:title`/`og:url`/`og:image`/`og:description`,
  `twitter:title`/`twitter:image`, `msapplication-TileColor`, and the fallback theme CSS variables
  (`--bg-color`, `--main-color`, …) MUST all reflect croco calc. Verification: `grep -ri "monkeytype" frontend/src/html/`
  returns nothing.

---

## 10. Repository and CI/CD

### Repository creation

- **INF-118** The GitHub repository MUST be created as **`lxorb/croco-calc`, public, and NOT a fork**. It MUST
  be created with the `gh` CLI (`gh repo create lxorb/croco-calc --public --source . --remote origin --push`
  or equivalent). `gh repo fork` MUST NOT be used, and the repo's `fork` field MUST be `false`
  (verify: `gh api repos/lxorb/croco-calc --jq .fork` → `false`).
- **INF-119** monkeytype's git history MUST be preserved. The working repo at `C:\Users\me\Projects\calc-trainer`
  already carries it (verified: `git log` shows monkeytype commits, current branch `master`, no remotes).
  Verification after push: `git rev-list --count HEAD` on the remote default branch matches the local count.
- **INF-120** The default branch MUST be `main` and it MUST be the **only** branch. monkeytype's branch is
  `master` (verified via `git branch -a`), so it MUST be renamed (`git branch -m master main`) and the remote
  default set accordingly. **ASSUMPTION:** the brief says "base on its main branch" while monkeytype actually
  uses `master`; renaming satisfies both readings. Any other branch (local or remote) MUST be deleted.
- **INF-121** The repository MUST retain the GPL-3.0 `LICENSE` file unchanged and the `"license": "GPL-3.0"`
  fields in `package.json`, `frontend/package.json` and `backend/package.json`. croco calc is a derivative
  work of GPL-3.0 software and a public repo makes this non-optional. Attribution to monkeytype MUST be kept
  in the about/credits page.
- **INF-122** Repository settings: issues enabled, wiki disabled, projects disabled, "Allow merge commits"
  as preferred, and **branch protection is NOT required** for a single-maintainer repo (v1). Secret scanning
  and push protection MUST be enabled (free for public repos).

### Files inherited from monkeytype that MUST be deleted

- **INF-123** These GitHub workflows MUST be deleted from `.github/workflows/`:
  `monkey-ci.yml` (replaced by `ci.yml`), `claude.yml`, `check-todo.yml`, `ci-failure-comment.yml`,
  `fix-formatting.yml`, `labeler.yml`, `publish-docker-images.yml` (replaced by `deploy-backend.yml`),
  `semantic-pr-title.yml`, `stale-pr.yml`, `update-labels.yml`, `write-labels.yml`.
  After this, `.github/workflows/` MUST contain only the files from INF-126.
- **INF-124** These `.github` files MUST also be deleted: `FUNDING.yml` (monkeytype's sponsors),
  `ISSUE_TEMPLATE/`, `pull_request_template.md`, `labeler.yml`, `copilot-instructions.md`,
  `dependabot.yml`.
- **INF-125** `packages/release/` MUST be deleted in full (`bin/deployBackend.sh`, `bin/purgeCfCache.sh`,
  `src/index.js`, `example.env`) — it deploys to Firebase Hosting (`src/index.js` line 198:
  `firebase deploy -P live --only hosting`) and purges a Cloudflare zone, neither of which applies.
  The eleven `release*`/`hotfix*` scripts in the root `package.json` (lines 40–49) and the
  `@monkeytype/release` devDependency MUST be removed with it.

### CI/CD workflows

- **INF-126** `.github/workflows/` MUST contain exactly these five workflows:

  | File | Trigger | Job |
  |---|---|---|
  | `ci.yml` | `pull_request` + `push` to `main` | lint, ts-check, build, test for backend / frontend / packages |
  | `deploy-frontend.yml` | `push` to `main` (paths: `frontend/**`, `packages/**`) + `workflow_dispatch` | build SPA with real env, `wrangler deploy` |
  | `deploy-backend.yml` | `push` to `main` (paths: `backend/**`, `packages/**`, `docker/**`) + `workflow_dispatch` | build + push image to ghcr, update Container App to the new SHA tag |
  | `infra.yml` | `pull_request` (paths: `infra/**`) → `terraform plan`; `workflow_dispatch` → `terraform apply` | Terraform |
  | `backup-db.yml` | `schedule` weekly + `workflow_dispatch` | `mongodump` → Azure Storage `backups` container |

- **INF-127** `ci.yml` MUST be adapted from `.github/workflows/monkey-ci.yml`, keeping its pnpm-store caching
  strategy (`pnpm/action-setup` + `actions/cache` keyed on `hashFiles('pnpm-lock.yaml')`, lines 82–100) and
  its `dorny/paths-filter` change detection, but:
  - branch `master` → `main` (lines 13, 16, 410),
  - the "Check Anti-cheat" gate (lines 58–60) MUST be deleted,
  - the `ci-assets` job's language/quote asset validation (lines 347–357) MUST be deleted or replaced,
    since croco calc has no word lists or quotes,
  - the `on-failure` PR-comment job (lines 406–422) MUST be deleted (its partner workflow is deleted by
    INF-123),
  - the firebase stub step (line 248) MUST be kept.
- **INF-128** `ci.yml` MUST pin `NODE_VERSION` to a `24.x` release and `PNPM_VERSION` to the value in the root
  `package.json` `packageManager` field (currently `pnpm@10.28.1`). CI and `package.json` MUST NOT drift.
- **INF-129** `deploy-frontend.yml` MUST: check out, install, generate the firebase config modules from the
  `FIREBASE_*` secrets, run `pnpm build-fe` with `BACKEND_URL` and `RECAPTCHA_SITE_KEY` set, then deploy with
  `cloudflare/wrangler-action` (or a pinned `wrangler deploy`) using `CLOUDFLARE_API_TOKEN` and
  `CLOUDFLARE_ACCOUNT_ID`. It MUST fail if `frontend/dist/index.html` does not exist after the build.
- **INF-130** `deploy-backend.yml` MUST: build the image with `docker/build-push-action`, tag it
  `ghcr.io/lxorb/croco-calc-api:${{ github.sha }}` and `:latest`, push using the built-in `GITHUB_TOKEN`
  (`packages: write` permission), then `azure/login` via OIDC and
  `az containerapp update -n ca-croco-calc-api -g rg-croco-calc-prod --image ghcr.io/lxorb/croco-calc-api:${{ github.sha }}`.
- **INF-131** `deploy-backend.yml` MUST end with a smoke check: poll `GET <api_base_url>/` until it returns
  HTTP 200 with `"message":"ok"` (max 2 minutes) and fail the workflow otherwise. On failure the workflow
  MUST print the command to roll back to the previous revision
  (`az containerapp revision activate`).
- **INF-132** Every workflow MUST declare least-privilege `permissions:` at the top
  (`contents: read` by default; `id-token: write` only where OIDC is used; `packages: write` only in
  `deploy-backend.yml`). Third-party actions MUST be pinned to a tag or SHA, never to a moving branch.
- **INF-133** No workflow may echo a secret. Verification: `grep -rn "secrets\." .github/workflows | grep -i "echo\|run:.*\$\{\{ *secrets"` finds
  no direct interpolation into a `run:` string other than into `env:` blocks.

### Commit conventions

- **INF-134** Commit messages MUST be all lowercase and at most 5 words, on a single line, with no body and
  no trailers.
- **INF-135** Commits MUST NOT contain any `Co-Authored-By:` trailer, nor any other mention of Claude,
  Claude Code, or AI authorship, anywhere in the message. Verification:
  `git log --format=%B | grep -i "claude\|co-authored-by"` returns nothing.
- **INF-136** monkeytype's conventional-commit enforcement MUST be replaced, because it is incompatible with
  the above: `commitlint.config.cjs` requires a `type:` prefix from a fixed enum and allows headers up to 100
  chars. `commitlint.config.cjs`, the `@commitlint/*` devDependencies and the
  `conventional-changelog` devDependency MUST be removed, and the husky `commit-msg` hook MUST instead
  enforce the regex/word-count rule from INF-134 plus the ban from INF-135.
  **ASSUMPTION:** the user's "at most 5 words, all lowercase" convention overrides monkeytype's conventional
  commits; monkeytype's *historic* commits keep their original messages untouched.
- **INF-137** The existing husky `pre-commit` (lint-staged: `oxfmt`, `oxlint`, `stylelint`) MUST be kept.

### Repo metadata

- **INF-138** Root `README.md`, `CLAUDE.md`, `AGENTS.md`, `monkeytype.code-workspace`, `docs/CONTRIBUTING*.md`,
  `docs/SELF_HOSTING.md`, `docs/LANGUAGES.md`, `docs/QUOTES.md`, `docs/FONTS.md`, `docs/LAYOUTS.md` MUST be
  reviewed: anything monkeytype-specific and inapplicable MUST be deleted; the rest rewritten for croco calc.
  The GitHub README itself is **deferred** (§13), so a one-paragraph placeholder README is sufficient for v1.
- **INF-139** `frontend/static/robots.txt`, `frontend/static/sitemap.xml`, `frontend/static/.well-known/`,
  `frontend/static/contributors.json` and `frontend/static/supporters.json` MUST be updated to croco calc or
  removed. A stale `sitemap.xml` pointing at monkeytype.com MUST NOT ship.

---

## 11. Observability, cost control, ops

- **INF-140** `log-croco-calc-prod` MUST be the Container Apps environment's log destination, with 30-day
  retention and a daily ingestion cap of 0.2 GB so a log storm cannot breach the budget.
- **INF-141** An Azure Monitor action group MUST be created that emails `me@emilvinu.de`.
- **INF-142** Alert rules MUST exist for: (a) Container App replica restart count > 3 in 15 minutes,
  (b) HTTP 5xx rate > 5 % over 15 minutes, (c) the app reporting zero healthy replicas for 5 minutes.
- **INF-143** An `azurerm_consumption_budget_subscription` named `budget-croco-calc-monthly` MUST be created
  with `amount = 50`, `time_grain = "Monthly"`, and notifications at 50 %, 80 % and 100 % of *actual* spend
  plus 100 % of *forecast* spend, all emailing `me@emilvinu.de`. This is the machine-enforced form of the
  brief's hard ceiling.
- **INF-144** Seven days after go-live, actual spend MUST be checked (`az consumption usage list` or Cost
  Analysis) and the real figure recorded next to the estimate in INF-037. If the run-rate projects above $25/mo,
  the stack MUST be re-tuned (first lever: drop `ca-croco-calc-api` to 0.25 vCPU / 0.5 GiB).
- **INF-145** A short runbook MUST be committed at `docs/RUNBOOK.md` covering: how to roll back the backend
  (activate the previous ACA revision), how to roll back the frontend (`wrangler rollback` / redeploy a prior
  version), how to rotate the Cloudflare token, the Atlas password and the Firebase service account, how to
  restore a `mongodump` backup, and how to read logs
  (`az containerapp logs show -n ca-croco-calc-api -g rg-croco-calc-prod --follow`).
- **INF-146** Sentry MUST NOT be provisioned for v1. It is optional in the build already
  (`frontend/vite.config.ts` line 331: enabled only when `SENTRY` is set), so the plugin and the
  `@sentry/*` dependencies SHOULD be removed to shrink the bundle; if kept, `SENTRY` MUST remain unset.
- **INF-147** Prometheus metrics (`prom-client`, `backend/src/utils/prometheus.ts`) and the `swagger-stats`
  dashboard have no scraper in this architecture. They SHOULD be removed; if kept, the stats dashboard MUST
  be protected by `STATS_USERNAME`/`STATS_PASSWORD` from Key Vault and MUST NOT be publicly reachable
  unauthenticated.

---

## 12. End-to-end acceptance for this workstream

- **INF-148** The infra workstream is complete only when all of the following pass in one sitting:
  1. `terraform apply` in `infra/terraform/prod` is idempotent (INF-080).
  2. `curl -s <api_base_url>/` returns HTTP 200 with `"message":"ok"` and a non-zero `uptime`.
  3. `https://croco-calc.<subdomain>.workers.dev/` loads the SPA; `/leaderboards` also returns 200.
  4. Response headers on `/` and on a hashed asset match INF-020 / INF-021.
  5. The SPA successfully calls the backend (no CORS error in the console) — verifying INF-012 and INF-054.
  6. All three sign-in providers work (INF-104) — *blocked on INF-103*.
  7. `az consumption budget list` shows `budget-croco-calc-monthly` at $50.
  8. `gh api repos/lxorb/croco-calc --jq '.fork, .private, .default_branch'` → `false`, `false`, `main`.
  9. `git branch -r` shows exactly one remote branch.
  10. `grep -ri "redis\|bullmq\|monkeytype\.com\|firebase.json" backend/ frontend/src/ infra/` returns no
      live references.

---

## 13. Deferred TODO list (recorded, NOT to be built now)

- **INF-149** The following are explicitly **out of v1 scope** and MUST NOT be built, provisioned or wired up.
  They are recorded here so a later stage can pick them up:
  1. **Discord integration** — implies deleting `backend/src/queues/george-queue.ts` and
     `backend/src/utils/discord.ts` now (INF-067) rather than carrying dead code.
  2. **GitHub README** — a full project README with screenshots/badges. v1 ships a placeholder (INF-138).
  3. **ko-fi.com** setup.
  4. **patreon.com** setup.
  5. **Ads functionality** — the ad slots present in `frontend/src/index.html`
     (`#ad-vertical-left`, `#ad-vertical-right`, `#ad-footer`, `#ad-footer-small-wrapper`) MUST be removed
     from the markup for v1, not just hidden.
- **INF-150** **Google sign-in and GitHub sign-in were originally on the deferred list and have been moved
  OUT of it and INTO v1 scope.** See INF-090 to INF-104. Any later stage that finds them listed as deferred
  elsewhere MUST treat this document as authoritative.

---

## 14. Ambiguities, assumptions and blockers — consolidated register

| # | Item | Reading chosen |
|---|---|---|
| A1 | Brief says "base on its **main** branch"; monkeytype's branch is `master` | ASSUMPTION: rename `master` → `main`, keep all history (INF-120, INF-119) |
| A2 | "Backend on Azure, provisioned with Terraform" vs. the brief also offering "Mongo Atlas free tier" as a DB candidate | ASSUMPTION: compute + all supporting resources on Azure; the database is Atlas M0, still Terraform-managed via the `mongodbatlas` provider (INF-057) |
| A3 | Redis was never explicitly discussed in the brief | Decision: removed entirely; leaderboards move to MongoDB, queues to cron (§4). Saves ~$16/mo. Flagged to the backend workstream (INF-002) |
| A4 | Exact workers.dev subdomain unknown | ASSUMPTION: resolve once at first deploy, then propagate to five places (INF-024) |
| A5 | Azure region not specified | ASSUMPTION: `westeurope` (INF-005) |
| A6 | Backend hostname/domain not specified | ASSUMPTION: default `*.azurecontainerapps.io` FQDN, no custom domain (INF-047) |
| A7 | Whether transactional email is needed | ASSUMPTION: no SMTP; Firebase Auth sends verification/reset mail (INF-053) |
| A8 | Whether reCAPTCHA survives the fork | Decision: keep — the production build hard-fails without a site key (INF-105) |
| A9 | Commit convention vs. inherited commitlint | ASSUMPTION: user convention wins; commitlint replaced by a 5-word lowercase hook (INF-136) |
| A10 | Atlas egress restriction | ASSUMPTION: `0.0.0.0/0` + SCRAM/TLS, because a NAT gateway for a stable egress IP would cost ~$32/mo (INF-059) |
| **B1** | **BLOCKER: no Firebase credentials locally** (`C:\Users\me\agent-secrets\` has only `cloudflare.txt` and `openai.txt`) | Auth is code-complete but unverifiable until a human performs INF-091 – INF-096 and INF-102 |
| **B2** | **BLOCKER: GitHub OAuth App cannot be automated** — no REST API for creating OAuth Apps, and the local `gh` token lacks developer-settings scope | Human action, INF-094 |
| **B3** | **BLOCKER: reCAPTCHA v2 keys do not exist** — the production frontend build cannot succeed without a site key | Human action, INF-106 |
| **B4** | **BLOCKER: MongoDB Atlas account/API keys do not exist** — Terraform cannot create the cluster without an Atlas org and programmatic API key pair | Human action; then GH secrets `MONGODB_ATLAS_PUBLIC_KEY` / `MONGODB_ATLAS_PRIVATE_KEY` (INF-086) |
| **B5** | Cloudflare `_headers` support on Workers static assets is assumed, not verified | Verify per INF-022; documented fallback is a minimal Worker script |
| **B6** | Azure per-second ACA rates used in INF-037 are from memory | MUST be re-verified against the Azure pricing calculator before apply (INF-037) |
