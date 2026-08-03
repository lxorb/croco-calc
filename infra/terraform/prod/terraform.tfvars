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

container_cpu       = 0.5
container_memory    = "1Gi"
min_replicas        = 1
max_replicas        = 3
concurrent_requests = 50

alert_email        = "me@emilvinu.de"
log_daily_quota_gb = 0.2
log_retention_days = 30
# CHF, not USD — the subscription bills in CHF. USD 50 = CHF 40.4 at Azure's
# own list-price ratio (0.808); see variables.tf and INF-143.
budget_amount = 40
