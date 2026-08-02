variable "subscription_id" {
  description = "Azure subscription id (INF-009)."
  type        = string
  default     = "48317e81-bf0f-4424-8f69-c8513c91c001"
}

variable "location" {
  description = "Azure region for every resource (INF-005)."
  type        = string
  default     = "westeurope"
}

variable "tags" {
  description = "Tags applied to every resource (INF-007)."
  type        = map(string)
  default = {
    project    = "croco-calc"
    env        = "prod"
    managed_by = "terraform"
  }
}

# --- container image ------------------------------------------------------

variable "container_image" {
  description = <<-EOT
    Fully qualified image reference, always pinned to an immutable SHA tag —
    never `:latest` (INF-043). deploy-backend.yml rolls the app forward with
    `az containerapp update`, so this value is only the bootstrap image.
  EOT
  type        = string
  default     = "ghcr.io/lxorb/croco-calc-api:latest"
}

variable "container_cpu" {
  description = "vCPU per replica (INF-035). INF-144's tuning lever drops this to 0.25."
  type        = number
  default     = 0.5
}

variable "container_memory" {
  description = "Memory per replica (INF-035). Must pair with container_cpu as a valid ACA combination."
  type        = string
  default     = "1Gi"
}

variable "min_replicas" {
  description = "INF-034: 1, to avoid a 10-30 s cold start. Job correctness comes from the INF-151 advisory lock, not from this."
  type        = number
  default     = 1
}

variable "max_replicas" {
  description = "INF-036."
  type        = number
  default     = 3
}

variable "concurrent_requests" {
  description = "HTTP scale rule threshold (INF-036)."
  type        = number
  default     = 50
}

# --- application configuration -------------------------------------------

variable "frontend_url" {
  description = "Production frontend origin, no trailing slash (INF-052; D1 supersedes the workers.dev URL)."
  type        = string
  default     = "https://crococalc.com"
}

variable "db_name" {
  description = "Mongo database name (INF-050)."
  type        = string
  default     = "crococalc"
}

# --- database -------------------------------------------------------------

variable "atlas_org_id" {
  description = "MongoDB Atlas organisation id. BLOCKER BL-4: no Atlas org exists yet."
  type        = string
}

variable "mongodb_tier" {
  description = <<-EOT
    INF-057 / INF-058 / INF-062: the whole M0-vs-Flex decision is this one
    variable. Leave it at "M0" unless `infra/scripts/db-probe.ts` fails, in
    which case set it to "FLEX" (no other option is pre-approved) and update the
    cost table before applying (INF-058a).
  EOT
  type        = string
  default     = "M0"

  validation {
    condition     = contains(["M0", "FLEX"], var.mongodb_tier)
    error_message = "mongodb_tier must be \"M0\" or \"FLEX\" — INF-058 pre-approves no third option."
  }
}

variable "atlas_region" {
  description = "Atlas' name for Azure westeurope (INF-057)."
  type        = string
  default     = "EUROPE_WEST"
}

# --- secrets (TF_VAR_* only, never a committed tfvars — INF-076) ----------

variable "firebase_service_account_json" {
  description = "Whole Firebase service-account JSON, single line (INF-097)."
  type        = string
  sensitive   = true
}

variable "recaptcha_secret" {
  description = "reCAPTCHA v2 secret key (INF-107)."
  type        = string
  sensitive   = true
}

# --- observability --------------------------------------------------------

variable "alert_email" {
  description = "Address the Azure Monitor action group notifies (INF-141)."
  type        = string
  default     = "me@emilvinu.de"
}

variable "log_daily_quota_gb" {
  description = "Log Analytics daily ingestion cap so a log storm cannot breach the budget (INF-140)."
  type        = number
  default     = 0.2
}

variable "log_retention_days" {
  description = "INF-140. 30 is within the 31 days included at no cost."
  type        = number
  default     = 30
}

variable "budget_amount" {
  description = "Monthly subscription budget in USD (INF-143). This is the brief's hard ceiling."
  type        = number
  default     = 50
}

variable "budget_start_date" {
  description = "First day of the budget period, RFC3339. Must be the first of a month and not in the past when first applied."
  type        = string
  default     = "2026-09-01T00:00:00Z"
}
