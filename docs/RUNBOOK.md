# croco calc — operations runbook

Covers INF-145 (rollback, rotation, restore, logs), INF-037/INF-156 (the
verified cost model), INF-086/INF-086a (every CI secret and where it comes
from) and the human actions still outstanding.

**This file contains no secrets and must never contain one.**

| | |
|---|---|
| Frontend | Cloudflare Worker `croco-calc` (assets only) → `https://crococalc.com`, `https://www.crococalc.com` |
| Backend | Azure Container App `ca-croco-calc-api` in `rg-croco-calc-prod`, `westeurope` |
| Database | **Azure DocumentDB** (Azure Cosmos DB for MongoDB **vCore**) cluster `mongo-croco-calc-prod`, tier **M10**, `westeurope`, in `rg-croco-calc-prod` |
| Secrets | Azure Key Vault `kv-crococalc-prod` |
| Logs | Log Analytics workspace `log-croco-calc-prod` |
| Image | `ghcr.io/lxorb/croco-calc-api`, public, pulled anonymously |

---

## 1. Cost model — verified

Every rate below was read from the Azure Retail Prices API for `westeurope` in
USD on **2026-08-02**, or from the vendor's own pricing documentation on the
same date. Each query is reproducible, e.g.

```bash
curl -s "https://prices.azure.com/api/retail/prices?currencyCode='USD'&\$filter=serviceName%20eq%20'Azure%20Container%20Apps'%20and%20armRegionName%20eq%20'westeurope'"
```

> ### ✅ INF-156 is CLEARED (2026-08-02)
>
> INF-156 gates `terraform apply` on the **INF-037** table in
> `docs/requirements/06-infra-and-ops.md`. That table has now been filled in:
> every row carries a checked citation and **no row still carries the italic
> `UNVERIFIED` cell marker**, so `.github/workflows/infra.yml`'s
> `Assert the INF-037 cost table is verified` step passes.
>
> Two things were fixed while clearing it:
> * the two rows that were arithmetically wrong against the real rates were
>   corrected — vCPU read `~3.4` where the arithmetic gives **4.46**, memory read
>   `~6.7` where it gives **8.93**;
> * the gate's grep was made **precise**. It used to match the bare word
>   `UNVERIFIED` anywhere in the file, which meant INF-156's own prose (which has
>   to name the marker it forbids) kept the gate shut for ever. It now matches
>   the italic marker inside a table row only. The negative control still fires.
>
> The gate MUST be re-opened — rows reset to the italic marker — if the SKU mix
> changes.

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
| Azure DocumentDB **M10** compute (1 burstable vCore / 2 GiB) | **$0.0249 / hour** ≈ $18.18/month at 730 h | Retail Prices API, `productName eq 'Azure DocumentDB'` + `armRegionName eq 'westeurope'`, sku `Burstable 1 vCore`, 2026-08-02 |
| Azure DocumentDB M20 / M25 (2 burstable vCore) | $0.0996 / hour ≈ $72.71/month — **over budget**, do not select without re-approval | same query, sku `Burstable 2 vCore` |
| Azure DocumentDB general-purpose storage | **$0.137 / GB-month** (32 GiB ≈ $4.38) | same query, meter `General Purpose Storage Data Stored` |
| Azure DocumentDB backup | included at no charge up to 35 days retention; $0.103/GB-month LRS beyond that | <https://azure.microsoft.com/en-us/pricing/details/documentdb/>; Retail API meter `Backup LRS Data Stored` |
| Azure DocumentDB **free tier** | $0 compute, $0 storage, 32 GiB — but **not offered in `westeurope`** (nearest is `northeurope`), and no backup/restore, no HA, no diagnostic logging, one per subscription | <https://learn.microsoft.com/en-us/azure/documentdb/free-tier> |
| Cloudflare Workers Free, static assets | $0 — "requests to static assets are free and unlimited" and do not count against the 100,000/day Worker request allowance | <https://developers.cloudflare.com/workers/platform/pricing/> |
| Firebase Auth, Spark plan | $0 well below 50k MAU | Firebase pricing |

### Monthly total — deployed default (M10, `westeurope`)

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
| **Azure DocumentDB M10 compute** | $0.0249/h × 730 h | **18.18** |
| **Azure DocumentDB storage** | 32 GiB × $0.137/GB-mo | **4.38** |
| **Azure DocumentDB backup** | ≤35 days retention, included | 0 |
| Container registry | public ghcr.io image, no ACR provisioned | 0 |
| Cloudflare Workers | free plan, assets only | 0 |
| Firebase Auth | Spark | 0 |
| Budget + alerts | `azurerm_consumption_budget_subscription` | 0 |
| **Total, expected** | | **≈ 36.6** |
| **Total, ceiling (logs at the daily cap, alerts billed)** | | **≈ 40.2** |

### Monthly total — free-tier cost lever (INF-062)

Subtracting the two database lines ($18.18 + $4.38 = $22.56) gives **≈ 14 – 17.6/mo**,
back inside INF-038's original "≤ $20" rule. Taking the lever is two lines in
`infra/terraform/prod/terraform.tfvars`:

```hcl
mongodb_tier     = "Free"
mongodb_location = "northeurope"   # the free tier is NOT offered in westeurope
```

The module rejects `Free` paired with a region Azure does not offer it in, at
plan time. **Understand what you give up before pulling it:** no backup/restore
(so `backup-db.yml`'s weekly `mongodump` becomes the *only* copy), no HA, no
diagnostic logging, one free cluster per subscription, and the database stops
being co-located with the Container App — adding cross-region latency to every
query and to every leaderboard aggregation.

### ⚠ Headroom: the deployed default breaches INF-038, deliberately

At **≈ $36.6 – 40.2/mo** the stack leaves only ~20 – 27 % headroom under the
brief's hard **$50** ceiling, where INF-038 originally asked for 60 % (≤ $20).
This is a user-accepted trade: the user asked for MongoDB on Azure "even though
this will result in some costs". It stays under the ceiling that actually binds
(INF-004), and INF-143's budget alerts still fire at 50/80/100 %.

Because headroom is thin, INF-144's seven-day spend check is **mandatory**, and
if the run-rate projects above $45/mo apply the INF-144 lever (0.25 vCPU /
0.5 GiB) immediately, or take the free-tier lever above.

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

| Fraction of seconds billed active | vCPU line | Total (M10 default) | Total (free-tier lever) |
|---|---|---|---|
| 0 % | $4.46 | ≈ 36.6 | ≈ 14 |
| 5 % | $6.14 | ≈ 38.3 | ≈ 16 |
| 25 % | $12.9 | ≈ 45 — **near the ceiling** | ≈ 22 |
| 100 % | $37.94 | ≈ 70 — **BREACHES $50** | ≈ 47 |

**Therefore:** INF-144's seven-day spend check is not optional — and on the M10
default it is the difference between $36 and a breach. If the run-rate projects
above $45/mo, drop the Container App to 0.25 vCPU / 0.5 GiB
(`container_cpu` / `container_memory` in `infra/terraform/prod/terraform.tfvars`).
That halves both meters — the pathological all-active case then lands near $43
on the M10 default and near $20 on the free-tier lever — and 0.25/0.5 is ample
for this workload.

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

### Secret scanning (INF-089)

`ci.yml`'s `secret-scan` job runs `gitleaks` (pinned to 8.30.0, tarball checked
against a committed SHA-256) over the checked-out tree on every push and pull
request, and fails the build on any finding. Run it locally the same way:

```bash
gitleaks dir --config .gitleaks.toml --redact --exit-code 1 .
```

A local run reports two findings CI never sees:
`backend/src/credentials/serviceAccountKey.json` and
`frontend/src/ts/constants/firebase-config.ts`. Those are real credentials, and
they are deliberately **not** allowlisted — they are gitignored (INF-088), so
they cannot reach a CI checkout, and if one ever did the scan must fail.

`.gitleaks.toml` allowlists exactly one thing: Google's published reCAPTCHA test
key pair (`6LeIxAcTAAAA…`), which is a documented public constant used by
`ci.yml` and by dev builds. INF-107 forbids it in *production* configuration;
that is enforced by `frontend/vite.config.ts`, which now refuses a production
build whose `RECAPTCHA_SITE_KEY` is empty or is that test key.

---

## 3. Deploy

| What | How |
|---|---|
| Frontend | Push to `main` touching `frontend/**` or `packages/**`, or run `deploy-frontend` manually. It builds with the real config and runs `wrangler deploy` |
| Backend | Push to `main` touching `backend/**`, `packages/**` or `docker/**`, or run `deploy-backend` manually. It pushes `ghcr.io/lxorb/croco-calc-api:<sha>` and `az containerapp update`s to that SHA |
| Infrastructure | `infra` workflow. `plan` on any PR touching `infra/**`; `apply` only via `workflow_dispatch` with `action=apply` on `main`, behind the `prod-infra` approval |

First-time order: create the two GitHub environments → `bootstrap` (manual,
local) → **push an API image** → `infra` apply → `deploy-backend` →
`deploy-frontend`.

**Why an image has to exist before the first `infra` apply (INF-043).**
`var.container_image` has no default and rejects `:latest`, because the Container
App must be pinned to an immutable SHA tag from its very first revision — the
module also carries `ignore_changes` on the image, so a bootstrap on a mutable
tag would never be corrected by Terraform. `infra.yml` passes
`TF_VAR_container_image=ghcr.io/lxorb/croco-calc-api:${{ github.sha }}`, so that
tag has to be in ghcr already. Two ways to get it there:

- run `deploy-backend` with `workflow_dispatch` on the same commit first — its
  build-and-push job succeeds on its own; only the final
  `az containerapp update` step fails, because the app does not exist yet. Then
  dispatch `infra` `apply` on that same commit; or
- build and push by hand:
  `docker build -f docker/backend/Dockerfile -t ghcr.io/lxorb/croco-calc-api:$(git rev-parse HEAD) --build-arg server_version=$(git rev-parse HEAD) . && docker push …`.

A local apply must pass the tag explicitly:
`terraform apply -var container_image=ghcr.io/lxorb/croco-calc-api:<sha>`.

**Create the environments first.** `bootstrap` issues one federated credential
per environment, and the subject string it registers has to match the one
GitHub will mint:

```bash
gh api -X PUT repos/lxorb/croco-calc/environments/prod
gh api -X PUT repos/lxorb/croco-calc/environments/prod-infra
# then add a required reviewer to prod-infra in the repo settings UI (INF-079)
```

```bash
cd infra/terraform/bootstrap
terraform init
terraform apply          # local state, run once, keep the state file
```

### Why `bootstrap` issues four federated credentials, not two

INF-085 names two subjects, `…:ref:refs/heads/main` and `…:pull_request`. Those
alone are not enough. The moment a job declares `environment:`, GitHub rewrites
the OIDC token's `sub` claim to `repo:lxorb/croco-calc:environment:<name>`, and
`azure/login` fails with **AADSTS70021: No matching federated identity record
found**. Two of our jobs do exactly that:

| Workflow | Job | `environment:` | Subject presented |
|---|---|---|---|
| `infra.yml` | `plan` | none | `repo:lxorb/croco-calc:pull_request` (PR) |
| `infra.yml` | `apply` | `prod-infra` | `repo:lxorb/croco-calc:environment:prod-infra` |
| `deploy-backend.yml` | `deploy` | `prod` | `repo:lxorb/croco-calc:environment:prod` |
| `backup-db.yml` | `backup` | none | `repo:lxorb/croco-calc:ref:refs/heads/main` |

`azurerm_federated_identity_credential.cicd_environments` covers the two
environment subjects; the list is the `github_environments` variable. Adding a
new environment to a workflow means adding it there too.

### Roles the CI identity holds, and why each is needed

INF-085 names three. Applying `infra/terraform/prod` needs three more, because
two of its resources sit outside what `Contributor` on one resource group can
reach:

| Role | Scope | Why |
|---|---|---|
| `Contributor` | `rg-croco-calc-prod` | INF-085 — the application resources |
| `Storage Blob Data Contributor` | `stcrococalctfstate` | INF-077 — remote state and backups |
| `Key Vault Secrets Officer` | `kv-crococalc-prod` | INF-085 — granted by the `prod` module itself |
| `Role Based Access Control Administrator` | `rg-croco-calc-prod` | `Contributor` explicitly **denies** `Microsoft.Authorization/roleAssignments/write`, but the key-vault module creates three role assignments (INF-083, INF-084). Without this, every apply fails there |
| `Cost Management Contributor` | `/subscriptions/<id>` | INF-143's budget is an `azurerm_consumption_budget_subscription` — a write at subscription scope, outside the resource group |
| `Reader` | `id-croco-calc-cicd` | `prod/main.tf` reads the identity with a data source; it lives in `rg-croco-calc-tfstate`, where CI otherwise holds only a *data-plane* storage role |

`prod/providers.tf` also sets `resource_provider_registrations = "none"`: the CI
identity deliberately has no subscription-level `*/register/action`, and INF-081
records that every provider croco calc needs is already registered.

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

### Database administrator password

The password is a `random_password` resource, so rotation is a Terraform
operation, not a portal one:

```bash
cd infra/terraform/prod
terraform apply -replace=module.mongodb.random_password.db
```

That regenerates the password, updates the cluster's administrator account and
rewrites the Key Vault secret in one pass. Then restart the app so it picks the new value up:

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

## 8. Database compatibility probe (INF-058, amended)

Azure DocumentDB is a re-implementation of the MongoDB wire protocol, not the
MongoDB server — Microsoft states **99.03 % compatibility**. The leaderboards
live in the missing fraction if it lands wrong, so the documented support is
proven on the live cluster rather than trusted:

```bash
DB_URI="$(az keyvault secret show --vault-name kv-crococalc-prod --name mongodb-uri --query value -o tsv)"   DB_NAME=crococalc node infra/scripts/db-probe.ts
```

The probe **no longer decides a tier** — the old M0-vs-Flex fork went away with
the Atlas provider. It verifies five clauses:

| Clause | Required? | Where it is load-bearing |
|---|---|---|
| (a) `$setWindowFields` + `$documentNumber` / `$denseRank` | **yes** | all-time, daily and weekly-XP leaderboards — nine call sites |
| (b) `$out`, run twice, asserting it *replaces* | **yes** | `leaderboards.ts` rebuild; this is INF-153's idempotency guarantee |
| (c) `$lookup` with `let` + sub-pipeline | **yes** | `connections.ts` friends list |
| (d) `$bucket` | **yes** | score histogram |
| (e) `$merge` | no | `dev.ts` only, behind `onlyAvailableOnDev()` |

* **Exit 0** — every required clause ran. Ship it. (Clause (e) failing alone
  still exits 0, with a warning.)
* **Exit 1** — a **required** clause was rejected. **Stop.** There is no
  pre-approved fallback tier and no pre-approved alternative engine; moving off
  Azure DocumentDB is a design change needing human sign-off.
* **Exit 2** — `DB_URI` unset. **Exit 3** — the probe could not run
  (connectivity, credentials, timeout); this is *not* a compatibility verdict.

Unlike the old version, this no longer waits on a human — the cluster is created
by the same `terraform apply` as the rest of the stack. **Status: not yet run**
(nothing is provisioned).

> **Connection-string trap:** a vCore URI must carry **`retrywrites=false`**.
> The Node driver enables retryable writes by default and the server rejects
> them, so the Atlas-era `?retryWrites=true&w=majority` suffix fails on the first
> write. Terraform emits the correct option set
> (`?tls=true&authMechanism=SCRAM-SHA-256&retrywrites=false&maxIdleTimeMS=120000`);
> the probe warns if `DB_URI` lacks the flag.

---

## 9. Human actions still outstanding

| # | Action | Blocks |
|---|---|---|
| ~~1~~ | ~~Create a MongoDB Atlas organisation and API key pair (BL-4)~~ — **STRUCK 2026-08-02.** The user's decision to host MongoDB on Azure removed the Atlas provider. The cluster is created by the same Azure credentials as everything else, so there is **no Atlas account to create and no human action here at all** | ~~everything~~ — nothing |
| 2 | Register a reCAPTCHA v2 ("I'm not a robot") site at <https://www.google.com/recaptcha/admin> for `crococalc.com`, `www.crococalc.com` and `localhost`; set `RECAPTCHA_SITE_KEY` and `RECAPTCHA_SECRET` (BL-3) | the production frontend build |
| 3 | Generate the Firebase service-account key and set `FIREBASE_SERVICE_ACCOUNT_JSON`; set the six `FIREBASE_*` web-app values | backend token verification, sign-in |
| 4 | Set the Firebase email action URL to `https://crococalc.com/verify` (INF-102) | verification and password-reset links |
| 5 | Create the `prod` and `prod-infra` GitHub environments **before** running `bootstrap`, and put a required reviewer on `prod-infra`. `bootstrap` issues a federated credential per environment (section 3) — without both halves, `azure/login` fails with AADSTS70021 in `infra.yml`'s apply job and in `deploy-backend.yml` | INF-079's approval gate, and the backend deploying at all |
| ~~5a~~ | ~~Transcribe the verified rate card into INF-037's `source` column~~ — **DONE 2026-08-02.** INF-037 is filled in and cited, the two wrong arithmetic rows are corrected, and the `infra.yml` gate was made precise so it can actually pass. INF-156 is cleared | ~~`terraform apply`~~ — nothing |
| 6 | Create the fine-grained PAT for `GH_VARIABLES_TOKEN` (Variables: read and write on this repository) | `infra.yml` publishing `vars.BACKEND_URL` |
| 7 | Run `infra/terraform/bootstrap` once, locally, with an operator identity | everything |
| 8 | **Enable Cloudflare Email Routing** on `crococalc.com` (dashboard → Email → Email Routing is simplest; the API token lacks the scope), add `contact@` and `support@` forwarding to `me@emilvinu.de`, and **click the destination-verification link** Cloudflare mails there. The user has taken this on. The zone holds **zero DNS records** (re-verified 2026-08-02), so Cloudflare's MX/SPF land in a clean zone with nothing to conflict against. Sending needs nothing: Firebase Auth sends all user-facing mail from its own domain | `contact@crococalc.com` and `support@crococalc.com` delivering anything |
| 9 | Add `croco-calc.<account>.workers.dev` to Firebase authorised domains **only if** sign-in is to be tested on the workers.dev URL. The five custom-domain entries are already in place | workers.dev sign-in testing |
| 10 | Seven days after go-live, check actual spend and record it against section 1 (INF-144). **Now mandatory, not advisory** — the M10 default leaves only ~20–27 % headroom under the $50 ceiling, so this is the control that catches a breach | the credibility of the whole cost model |

Already done and verified (see `docs/infra-domain.md`): the `crococalc.com` zone
is active, Firebase authorised domains include `crococalc.com` and
`www.crococalc.com`, email-link sign-in is disabled, and the GitHub OAuth app
exists with the correct callback URL.
