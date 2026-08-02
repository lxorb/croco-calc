# Non-secret prod values. INF-076: no secret may appear here. The three
# sensitive variables are supplied as environment variables only:
#
#   TF_VAR_atlas_org_id                    (BL-4 — no Atlas org exists yet)
#   TF_VAR_firebase_service_account_json
#   TF_VAR_recaptcha_secret
#
# plus MONGODB_ATLAS_PUBLIC_KEY / MONGODB_ATLAS_PRIVATE_KEY for the provider.

location     = "westeurope"
frontend_url = "https://crococalc.com"
db_name      = "crococalc"

# INF-058: flip to "FLEX" only if infra/scripts/db-probe.ts fails, and update
# the cost table in docs/RUNBOOK.md before applying (INF-058a).
mongodb_tier = "M0"
atlas_region = "EUROPE_WEST"

container_cpu       = 0.5
container_memory    = "1Gi"
min_replicas        = 1
max_replicas        = 3
concurrent_requests = 50

alert_email        = "me@emilvinu.de"
log_daily_quota_gb = 0.2
log_retention_days = 30
budget_amount      = 50
