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
