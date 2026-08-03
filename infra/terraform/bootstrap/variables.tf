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

variable "github_repository" {
  description = "owner/repo the CI federated credentials are issued to (INF-085)."
  type        = string
  default     = "lxorb/croco-calc"
}

variable "github_repository_immutable" {
  description = <<-EOT
    The same repository written with GitHub's immutable numeric ids,
    `<owner>@<owner_id>/<repo>@<repo_id>`. GitHub now issues OIDC tokens whose
    `sub` claim uses this form rather than the plain `owner/repo` one, so every
    federated credential has to be registered twice — once per form. Read the
    authoritative value from
    `gh api repos/<owner>/<repo>/actions/oidc/customization/sub` and take the
    `sub_claim_prefix` field, minus its leading `repo:`.
  EOT
  type        = string
  default     = "lxorb@101118850/croco-calc@1320770265"
}

variable "github_environments" {
  description = <<-EOT
    GitHub deployment environments whose jobs authenticate to Azure with OIDC.
    Each one needs its own federated credential because referencing an
    environment rewrites the token's `sub` claim to
    `repo:<owner>/<repo>:environment:<name>` (INF-079, INF-085, INF-130).
  EOT
  type        = list(string)
  default     = ["prod", "prod-infra"]
}

variable "alert_email" {
  description = "Address the INF-143a subscription budget notifies. Same operator as INF-141, but reached via contact_emails rather than ag-croco-calc-prod, which lives in croco calc's resource group."
  type        = string
  default     = "me@emilvinu.de"
}

variable "subscription_budget_amount" {
  description = <<-EOT
    INF-143a. Monthly ceiling for the WHOLE subscription, in its billing
    currency (CHF).

    500 is ~1.4x the July 2026 peak of CHF 358.80 and ~2.2x the June 2026 actual
    of CHF 223.21. It is deliberately well clear of the historical baseline: this
    is a runaway detector for ~11 unrelated projects, not a target. A value near
    the baseline would alert every month and be ignored — the failure mode that
    made the previous subscription-scoped budget useless.

    This has NOTHING to do with croco calc's own CHF 40 ceiling (INF-143).
  EOT
  type        = number
  default     = 500
}

variable "subscription_budget_start_date" {
  description = <<-EOT
    First day of the budget period, RFC3339, and must be the first of a month.
    Azure accepts a past start date only while it still falls inside the current
    time_grain period, so on any REPLACEMENT of the budget this must first be
    moved to the first of the current month.
  EOT
  type        = string
  default     = "2026-08-01T00:00:00Z"
}

variable "backup_retention_days" {
  description = "Days a mongodump archive is kept in the backups container (INF-061)."
  type        = number
  default     = 30
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
