# Non-secret prod values. INF-076: no secret may appear here. The two sensitive
# variables are supplied as environment variables only:
#
#   TF_VAR_firebase_service_account_json
#   TF_VAR_recaptcha_secret
#
# The database needs no credentials of its own any more — it is an Azure
# resource created with the same azurerm identity as everything else, which is
# what retired blocker BL-4.

location     = "westeurope"
frontend_url = "https://crococalc.com"
db_name      = "crococalc"

# Azure DocumentDB (Cosmos DB for MongoDB vCore). INF-062: the cost lever is
# these two lines. "M10" costs ~$22.56/mo all-in and keeps the database beside
# the Container App. Switching to the $0 free tier means BOTH:
#     mongodb_tier     = "Free"
#     mongodb_location = "northeurope"
# because Azure does not offer the free tier in westeurope. The free tier also
# has no backup/restore and no HA — see docs/requirements/06-infra-and-ops.md §3.
mongodb_tier       = "M10"
mongodb_location   = "westeurope"
mongodb_storage_gb = 32

# INF-144 sizing lever, applied 2026-08-03. Measured usage on the 0.5 vCPU /
# 1 GiB revision was 0.0050 vCPU and ~102 MiB, so this still leaves ~50x CPU and
# ~5x memory headroom while halving both ACA meters (-$7.9-13.0/mo).
#
# min/max replicas and the scale threshold are deliberately UNCHANGED — see
# INF-036: at the active rate two 0.25 vCPU replicas cost exactly what one
# 0.5 vCPU replica did, so scaling out is cost-neutral per unit of load, and
# max_replicas = 3 keeps the worst-case tail bounded under the ceiling.
container_cpu       = 0.25
container_memory    = "0.5Gi"
min_replicas        = 1
max_replicas        = 3
concurrent_requests = 50

alert_email        = "me@emilvinu.de"
log_daily_quota_gb = 0.2
log_retention_days = 30
# CHF, not USD — the subscription bills in CHF. USD 50 = CHF 40.4 at Azure's
# own list-price ratio (0.808); see variables.tf and INF-143.
budget_amount = 40
