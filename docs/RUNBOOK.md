# croco calc — operations runbook

Covers INF-145 (rollback, rotation, restore, logs), INF-037/INF-156 (the
verified cost model), INF-086/INF-086a (every CI secret and where it comes
from) and the human actions still outstanding.

**This file contains no secrets and must never contain one.**

| | |
|---|---|
| Frontend | Cloudflare Worker `croco-calc` (assets only) → `https://crococalc.com`, `https://www.crococalc.com` |
| Backend | Azure Container App `ca-croco-calc-api` in `rg-croco-calc-prod`, `westeurope` |
| Database | MongoDB Atlas, project + cluster `croco-calc`, region `EUROPE_WEST` |
| Secrets | Azure Key Vault `kv-crococalc-prod` |
| Logs | Log Analytics workspace `log-croco-calc-prod` |
| Image | `ghcr.io/lxorb/croco-calc-api`, public, pulled anonymously |

---

## 1. Cost model — verified

Every rate below was read from the Azure Retail Prices API for `westeurope` in
USD on **2026-08-02**, or from the vendor's own pricing documentation on the
same date. This section replaces the estimate in
`docs/requirements/06-infra-and-ops.md` §2 (INF-037), whose rates were recorded
from memory. `infra.yml` refuses to run `terraform apply` while this file still
contains the word the old table used to mark an unchecked row (INF-156).

The month is taken as 30 days = 2,592,000 seconds.

### Rate card

| Meter | Rate | Source |
|---|---|---|
| ACA Standard vCPU, **idle** | $0.000004 / vCPU-second | Retail Prices API, `serviceName eq 'Azure Container Apps' and armRegionName eq 'westeurope'`, 2026-08-02 |
| ACA Standard vCPU, **active** | $0.000034 / vCPU-second | same query |
| ACA Standard memory, idle **and** active | $0.000004 / GiB-second | same query |
| ACA Standard requests | $0.56 / 1M | same query |
| ACA free grants | 180,000 vCPU-s, 360,000 GiB-s, 2M requests per subscription per calendar month; health-probe requests are not billable | <https://learn.microsoft.com/en-us/azure/container-apps/billing> |
| Log Analytics ingestion | $2.99 / GB, first 5 GB/month per billing account free | Retail Prices API `serviceName eq 'Log Analytics'`; <https://azure.microsoft.com/en-us/pricing/details/monitor/> |
| Log Analytics retention | $0.13 / GB-month beyond the 31 days included | same |
| Metric alert rule | $0.30/month at 1-minute frequency, $0.15 at 5-minute, $0.10 at 10-minute; first 10 monitored metric time-series free | Retail Prices API `serviceName eq 'Azure Monitor'`; Monitor pricing page |
| Action group email | first 1,000 emails/month free | Monitor pricing page |
| Egress | first 100 GB/month free account-wide, then $0.08/GB | Retail Prices API `serviceName eq 'Bandwidth'` |
| Key Vault Standard | $0.03 / 10,000 operations, **no hourly instance charge** | Retail Prices API `serviceName eq 'Key Vault'`. The $4.85/hour "Standard Instance" meter returned by that query belongs to Azure Dedicated HSM, not to a standard vault |
| Blob storage, GPv2 Cool LRS | $0.01 / GB-month stored, $0.10 / 10,000 write operations | Retail Prices API `serviceName eq 'Storage'` |
| Atlas M0 | $0, 512 MB, up to 100 ops/s, no backups | <https://www.mongodb.com/pricing> |
| Atlas Flex | $0.011/hour ≈ $8/month at 0–100 ops/s, rising to $30/month at 400–500 ops/s | same |
| Cloudflare Workers Free, static assets | $0 — "requests to static assets are free and unlimited" and do not count against the 100,000/day Worker request allowance | <https://developers.cloudflare.com/workers/platform/pricing/> |
| Firebase Auth, Spark plan | $0 well below 50k MAU | Firebase pricing |

### Monthly total — M0 path

| Line | Arithmetic | USD/mo |
|---|---|---|
| Container App vCPU | 0.5 vCPU × 2,592,000 s = 1,296,000 vCPU-s, less the 180,000 free grant = 1,116,000 billable × $0.000004 (idle) | **4.46** |
| Container App memory | 1 GiB × 2,592,000 s = 2,592,000 GiB-s, less the 360,000 free grant = 2,232,000 × $0.000004 | **8.93** |
| Container App requests | far below the 2M free grant; probes are not billable | 0 |
| Container Apps environment | Consumption workload profile; the plan-management fee applies only to Dedicated profiles | 0 |
| Log Analytics ingestion | expected < 5 GB/mo → free. Ceiling: the 0.2 GB/day cap = 6.2 GB, less 5 GB free = 1.2 GB × $2.99 | 0 – 3.59 |
| Log Analytics retention | 30 days, inside the 31 included | 0 |
| Metric alert rules | 2 rules at 5-minute + 1 at 1-minute = $0.60, or $0 inside the 10-time-series allowance | 0 – 0.60 |
| Action group emails | far below 1,000/mo | 0 |
| Egress | far below 100 GB/mo | 0 |
| Key Vault | well under 10,000 operations | < 0.03 |
| Storage account | state + weekly dumps, well under 1 GB Cool | ~0.02 |
| MongoDB Atlas M0 | free tier | 0 |
| Container registry | public ghcr.io image, no ACR provisioned | 0 |
| Cloudflare Workers | free plan, assets only | 0 |
| Firebase Auth | Spark | 0 |
| Budget + alerts | `azurerm_consumption_budget_subscription` | 0 |
| **Total, expected** | | **≈ 14** |
| **Total, ceiling (logs at the daily cap, alerts billed)** | | **≈ 17.6** |

### Monthly total — Flex fallback path

Add the Atlas Flex base tier: **≈ 22 – 26/mo**, up to ≈ 44 in the unlikely case
the cluster sustains 400–500 ops/s. This exceeds INF-038's "≤ $20" 60 %
headroom rule but stays under the brief's hard $50 ceiling, which INF-038's
amendment pre-approves. If it lands above $25, apply the INF-144 lever first.

### The one real cost risk: idle eligibility

The $4.46 vCPU line assumes the replica is billed at the **idle** rate. Azure
only applies that rate when *all* of the following hold, per second, per
replica: the revision has `minReplicas > 0` and is scaled to the minimum, every
container has started, the replica is processing no HTTP requests, it is using
**less than 0.01 vCPU**, and it is receiving **less than 1,000 bytes/second** of
network traffic.

croco calc's backend runs in-process cron jobs and keeps a MongoDB connection
with heartbeats, so some seconds will be billed at the active rate. The
sensitivity is large:

| Fraction of seconds billed active | vCPU line | Total, M0 path |
|---|---|---|
| 0 % | $4.46 | ≈ 14 |
| 5 % | $6.14 | ≈ 16 |
| 25 % | $12.9 | ≈ 22 |
| 100 % | $37.94 | ≈ 47 — at the ceiling |

**Therefore:** INF-144's seven-day spend check is not optional. If the run-rate
projects above $25/mo, drop the Container App to 0.25 vCPU / 0.5 GiB
(`container_cpu` / `container_memory` in `infra/terraform/prod/terraform.tfvars`).
That halves both meters — even the pathological all-active case then lands near
$20 — and 0.25/0.5 is ample for this workload.

---

## 2. GitHub secrets and variables

Set at repository level unless noted. `infra.yml`'s apply job additionally
requires a GitHub **environment** named `prod-infra` with a required reviewer —
that is where INF-079's manual approval gate actually lives. `deploy-frontend`
and `deploy-backend` use an environment named `prod`.

### Secrets

| Name | Used by | Where the value comes from |
|---|---|---|
| `AZURE_CLIENT_ID` | deploy-backend, infra, backup-db | `terraform output cicd_client_id` from `infra/terraform/bootstrap` |
| `AZURE_TENANT_ID` | same | `f2fb90a0-b1c1-4048-8959-038f203720ad` (INF-009) |
| `AZURE_SUBSCRIPTION_ID` | same | `48317e81-bf0f-4424-8f69-c8513c91c001` (INF-009) |
| `CLOUDFLARE_API_TOKEN` | deploy-frontend | `C:\Users\me\agent-secrets\cloudflare.txt`. Needs Account → Workers Scripts → Edit, Account → Account Settings → Read, User → User Details → Read (INF-029) |
| `CLOUDFLARE_ACCOUNT_ID` | deploy-frontend | `b0e98c15b1f905a394ecd6a849e8e99f` |
| `MONGODB_ATLAS_PUBLIC_KEY` | infra | Atlas organisation API key — **blocked on BL-4** |
| `MONGODB_ATLAS_PRIVATE_KEY` | infra | same |
| `MONGODB_ATLAS_ORG_ID` | infra (`TF_VAR_atlas_org_id`) | Atlas organisation id — **blocked on BL-4**. Not in INF-086's list; the Terraform needs it |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | infra (`TF_VAR_firebase_service_account_json`) | Firebase console → Project settings → Service accounts → Generate new private key, minified to one line. Terraform writes it to Key Vault as `firebase-service-account`. Not in INF-086's list; INF-097 requires it |
| `RECAPTCHA_SITE_KEY` | deploy-frontend | reCAPTCHA v2 admin console — **blocked on BL-3** |
| `RECAPTCHA_SECRET` | infra (`TF_VAR_recaptcha_secret`) | same console; Terraform writes it to Key Vault as `recaptcha-secret` |
| `FIREBASE_APIKEY` | deploy-frontend | Firebase web-app config (project `croco-calc`) |
| `FIREBASE_AUTHDOMAIN` | deploy-frontend | `croco-calc.firebaseapp.com` |
| `FIREBASE_PROJECTID` | deploy-frontend | `croco-calc` |
| `FIREBASE_STORAGEBUCKET` | deploy-frontend | Firebase web-app config |
| `FIREBASE_MESSAGINGSENDERID` | deploy-frontend | `993399579889` |
| `FIREBASE_APPID` | deploy-frontend | Firebase web-app config |
| `GH_VARIABLES_TOKEN` | infra | Fine-grained PAT on this repository with **Variables: read and write**. `GITHUB_TOKEN` cannot write repository variables, and INF-086a requires `infra.yml` to publish `vars.BACKEND_URL` |

The six `FIREBASE_*` web-app values are not individually secret — they ship in
the bundle — but they are stored as secrets so a missing one fails the workflow
loudly rather than baking an empty auth config into a deploy (INF-101).

### Variables

| Name | Written by | Consumed by |
|---|---|---|
| `BACKEND_URL` | `infra.yml`, from `terraform output -raw api_base_url` (INF-086a) | `deploy-frontend.yml` (the build), `deploy-backend.yml` (the smoke check). Also the value to put in the backend's CORS allowlist and the frontend's preconnect |

### INF-086a decision — the backup credential source

`backup-db.yml` reads `mongodb-uri` **from Key Vault** using the CI managed
identity. There is deliberately **no `DB_URI` repository secret**: one copy of
the credential, rotated in one place, and the CI identity already holds
Key Vault Secrets Officer on the vault.

---

## 3. Deploy

| What | How |
|---|---|
| Frontend | Push to `main` touching `frontend/**` or `packages/**`, or run `deploy-frontend` manually. It builds with the real config and runs `wrangler deploy` |
| Backend | Push to `main` touching `backend/**`, `packages/**` or `docker/**`, or run `deploy-backend` manually. It pushes `ghcr.io/lxorb/croco-calc-api:<sha>` and `az containerapp update`s to that SHA |
| Infrastructure | `infra` workflow. `plan` on any PR touching `infra/**`; `apply` only via `workflow_dispatch` with `action=apply` on `main`, behind the `prod-infra` approval |

First-time order: `bootstrap` (manual, local) → `infra` apply → `deploy-backend`
→ `deploy-frontend`.

```bash
cd infra/terraform/bootstrap
terraform init
terraform apply          # local state, run once, keep the state file
```

---

## 4. Rollback

### Backend

```bash
az containerapp revision list -n ca-croco-calc-api -g rg-croco-calc-prod -o table
az containerapp revision activate -n ca-croco-calc-api -g rg-croco-calc-prod --revision <previous-revision>
```

Or redeploy a known-good image directly:

```bash
az containerapp update -n ca-croco-calc-api -g rg-croco-calc-prod \
  --image ghcr.io/lxorb/croco-calc-api:<previous-sha>
```

Terraform will not fight this: the container-app module has
`ignore_changes = [template[0].container[0].image]`.

### Frontend

Worker asset deploys are versioned, so there is nothing to purge.

```bash
cd frontend
pnpm exec wrangler deployments list
pnpm exec wrangler rollback [<version-id>]
```

If a rollback is not enough, check out the last good commit and re-run the
`deploy-frontend` workflow.

---

## 5. Rotation

### Cloudflare API token

1. Cloudflare dashboard → My Profile → API Tokens → create a replacement with
   Account → Workers Scripts → Edit, Account → Account Settings → Read,
   User → User Details → Read.
2. Verify: `CLOUDFLARE_API_TOKEN=<new> pnpm --filter @croco-calc/frontend exec wrangler whoami`.
3. Update the `CLOUDFLARE_API_TOKEN` repository secret and the local
   `C:\Users\me\agent-secrets\cloudflare.txt`.
4. Re-run `deploy-frontend`, then revoke the old token.

### Atlas database password

The password is a `random_password` resource, so rotation is a Terraform
operation, not a portal one:

```bash
cd infra/terraform/prod
terraform apply -replace=module.mongodb_atlas.random_password.db
```

That regenerates the password, updates the Atlas user and rewrites the Key Vault
secret in one pass. Then restart the app so it picks the new value up:

```bash
az containerapp revision restart -n ca-croco-calc-api -g rg-croco-calc-prod \
  --revision "$(az containerapp show -n ca-croco-calc-api -g rg-croco-calc-prod --query properties.latestRevisionName -o tsv)"
```

### Firebase service account

1. Firebase console → Project settings → Service accounts → Generate new private
   key. Do not delete the old key yet.
2. Minify the JSON to a single line and update the
   `FIREBASE_SERVICE_ACCOUNT_JSON` repository secret.
3. Run `infra` with `action=apply`; Terraform rewrites the
   `firebase-service-account` Key Vault secret.
4. Restart the revision as above, confirm an authenticated request still
   returns 200, then delete the old key in the Google Cloud console.

### reCAPTCHA secret

Same shape: update `RECAPTCHA_SECRET`, apply `infra`, restart the revision.

---

## 6. Restore a backup

Archives live in the `backups` container of `stcrococalctfstate`, named
`crococalc-<ISO8601>.archive.gz`, and are deleted after 30 days by a storage
lifecycle rule.

```bash
az storage blob list --account-name stcrococalctfstate --container-name backups \
  --auth-mode login -o table

az storage blob download --account-name stcrococalctfstate --container-name backups \
  --auth-mode login --name crococalc-<stamp>.archive.gz --file restore.archive.gz

DB_URI=$(az keyvault secret show --vault-name kv-crococalc-prod --name mongodb-uri --query value -o tsv)

# Rehearse against a scratch database first. Never --drop straight into crococalc.
mongorestore --uri="$DB_URI" --archive=restore.archive.gz --gzip \
  --nsFrom='crococalc.*' --nsTo='crococalc_restore.*'
```

Once the restored copy looks right, either point `DB_NAME` at it or repeat with
`--nsTo='crococalc.*' --drop` during an announced outage.

---

## 7. Logs and metrics

```bash
# live tail
az containerapp logs show -n ca-croco-calc-api -g rg-croco-calc-prod --follow

# system (platform) events rather than app stdout
az containerapp logs show -n ca-croco-calc-api -g rg-croco-calc-prod --type system

# revisions and replicas
az containerapp revision list -n ca-croco-calc-api -g rg-croco-calc-prod -o table
az containerapp replica list  -n ca-croco-calc-api -g rg-croco-calc-prod -o table
```

Log Analytics keeps 30 days with a 0.2 GB/day ingestion cap. If the cap is hit,
ingestion stops until the next UTC day — logs are dropped, not billed. Raise
`log_daily_quota_gb` only with the cost table above in mind.

Alerts email `me@emilvinu.de` via the action group `ag-croco-calc-prod`:
replica restarts > 3 in 15 minutes, an elevated 5xx count over 15 minutes, and
zero replicas for 5 minutes.

> The 5xx rule fires on a **count**, not the 5 % ratio INF-142(b) asks for. An
> Azure metric alert compares one series to a scalar and cannot divide two
> series, and Container Apps ingress access logs are not sent to the workspace,
> so the ratio is not expressible without a log query over data we do not have.
> The threshold (`http_5xx_threshold`, default 10 per 15 minutes) is far past
> 5 % at croco calc's load. Revisit if traffic grows.

### Spend

```bash
az consumption budget list --query "[?name=='budget-croco-calc-monthly']"
az consumption usage list --start-date <YYYY-MM-DD> --end-date <YYYY-MM-DD> -o table
```

INF-144: do this seven days after go-live and record the real figure against
section 1.

---

## 8. Database tier decision (INF-058)

Before the first `terraform apply`, run the compatibility probe against the
cluster:

```bash
DB_URI="<atlas srv uri>" DB_NAME=crococalc node infra/scripts/db-probe.ts
```

* **Exit 0** — all three of `$setWindowFields`, `$merge` and sub-pipeline
  `$lookup` work. Atlas M0 stays; nothing to change.
* **Exit 1** — set `mongodb_tier = "FLEX"` in
  `infra/terraform/prod/terraform.tfvars`, update section 1's total to the Flex
  path, commit, then apply (INF-058a). `$merge` is a documented restriction area
  on Atlas free and shared tiers, so this is the expected outcome rather than a
  remote contingency.
* If **Flex also fails**, stop. No third option is pre-approved; this needs
  human sign-off.

The probe cannot run until BL-4 clears. **Status: not yet run.**

---

## 9. Human actions still outstanding

| # | Action | Blocks |
|---|---|---|
| 1 | Create a MongoDB Atlas organisation, then an organisation API key pair with the **Project Owner** role, and set `MONGODB_ATLAS_PUBLIC_KEY`, `MONGODB_ATLAS_PRIVATE_KEY`, `MONGODB_ATLAS_ORG_ID` (BL-4) | `terraform apply`, the INF-058 probe, the backend, everything downstream |
| 2 | Register a reCAPTCHA v2 ("I'm not a robot") site at <https://www.google.com/recaptcha/admin> for `crococalc.com`, `www.crococalc.com` and `localhost`; set `RECAPTCHA_SITE_KEY` and `RECAPTCHA_SECRET` (BL-3) | the production frontend build |
| 3 | Generate the Firebase service-account key and set `FIREBASE_SERVICE_ACCOUNT_JSON`; set the six `FIREBASE_*` web-app values | backend token verification, sign-in |
| 4 | Set the Firebase email action URL to `https://crococalc.com/verify` (INF-102) | verification and password-reset links |
| 5 | Create the `prod` and `prod-infra` GitHub environments; put a required reviewer on `prod-infra` | INF-079's approval gate |
| 6 | Create the fine-grained PAT for `GH_VARIABLES_TOKEN` (Variables: read and write on this repository) | `infra.yml` publishing `vars.BACKEND_URL` |
| 7 | Run `infra/terraform/bootstrap` once, locally, with an operator identity | everything |
| 8 | Grant the Cloudflare API token **Account → Email Routing Addresses → Edit** and **Zone → Email Routing Rules → Edit**, enable Email Routing on `crococalc.com`, and click the destination-verification link Cloudflare mails to `me@emilvinu.de` | `contact@crococalc.com` and `support@crococalc.com` delivering anything |
| 9 | Add `croco-calc.<account>.workers.dev` to Firebase authorised domains **only if** sign-in is to be tested on the workers.dev URL. The five custom-domain entries are already in place | workers.dev sign-in testing |
| 10 | Seven days after go-live, check actual spend and record it against section 1 (INF-144) | nothing, but it is the safety net on the cost model |

Already done and verified (see `docs/infra-domain.md`): the `crococalc.com` zone
is active, Firebase authorised domains include `crococalc.com` and
`www.crococalc.com`, email-link sign-in is disabled, and the GitHub OAuth app
exists with the correct callback URL.
