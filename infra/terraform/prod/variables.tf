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
    `az containerapp update`, so this value is only the bootstrap image, but the
    bootstrap revision is a real deployed revision and INF-043 says "always".

    Deliberately has NO default. A default of `:latest` made the very first
    apply create the app on a mutable tag, and `ignore_changes` on the image
    then stopped Terraform from ever correcting it — the app only left `:latest`
    if and when deploy-backend.yml happened to run. `infra.yml` passes
    `TF_VAR_container_image` built from the workflow's commit SHA; a local apply
    must pass `-var container_image=ghcr.io/lxorb/croco-calc-api:<sha>` for a
    SHA that has already been pushed by deploy-backend.yml (see RUNBOOK).
  EOT
  type        = string

  validation {
    condition     = can(regex("^[^:]+(:[^:]+)?/[^:]+:[^:]+$", var.container_image))
    error_message = "container_image must carry an explicit tag, e.g. ghcr.io/lxorb/croco-calc-api:<sha>."
  }

  validation {
    condition     = !endswith(var.container_image, ":latest")
    error_message = "INF-043: the Container App must be pinned to the immutable SHA tag, never :latest."
  }
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

variable "mongodb_tier" {
  description = <<-EOT
    INF-057 / INF-062 (amended by user decision): Azure DocumentDB compute tier.
    "M10" is the deployed default — ~$18.18/mo compute + ~$4.38/mo storage in
    westeurope, with <=35-day backups included.
    "Free" is the $0 lever, but Azure does not offer it in westeurope, so it
    MUST be paired with mongodb_location = "northeurope" (the module enforces
    this), and it has no backup/restore and no HA.
  EOT
  type        = string
  default     = "M10"

  validation {
    condition     = contains(["Free", "M10", "M20", "M25", "M30"], var.mongodb_tier)
    error_message = "mongodb_tier must be one of Free, M10, M20, M25, M30."
  }
}

variable "mongodb_location" {
  description = <<-EOT
    Region for the database only. Defaults to `location` (INF-005 wants one
    region for everything); the sole reason to diverge is mongodb_tier = "Free",
    which is not offered in westeurope.
  EOT
  type        = string
  default     = "westeurope"
}

variable "mongodb_storage_gb" {
  description = "Storage can only ever be increased. 32 GiB is the free-tier size and is far above croco calc's needs."
  type        = number
  default     = 32
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
  description = <<-EOT
    First day of the budget period, RFC3339. Must be the first of a month.
    2026-08-01 is the month the stack was first provisioned, so INF-143's ceiling
    is enforced from the first billable hour rather than a month later. Azure
    accepts a past start date as long as it falls inside the current time_grain
    period; the budget module pins it with `ignore_changes` because the value is
    immutable once created.
  EOT
  type        = string
  default     = "2026-08-01T00:00:00Z"
}
