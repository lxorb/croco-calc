/**
 * kv-crococalc-prod — the only place runtime secrets live (INF-082, INF-083).
 *
 * RBAC authorisation, soft delete and purge protection are all on. The exact
 * secret set is fixed: mongodb-uri, firebase-service-account, recaptcha-secret.
 * The swagger-stats dashboard is not deployed, so stats-username/stats-password
 * are deliberately absent (INF-050, INF-147).
 */

terraform {
  required_version = "~> 1.14"
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.65"
    }
  }
}

variable "resource_group_name" { type = string }
variable "location" { type = string }
variable "tags" { type = map(string) }
variable "tenant_id" { type = string }

variable "api_identity_principal_id" {
  description = "id-croco-calc-api — gets Key Vault Secrets User (INF-084)."
  type        = string
}

variable "cicd_principal_id" {
  description = "id-croco-calc-cicd — gets Key Vault Secrets Officer (INF-085)."
  type        = string
}

variable "operator_principal_id" {
  description = "The identity running terraform apply; needs Secrets Officer to write the secrets."
  type        = string
}

variable "mongodb_uri" {
  type      = string
  sensitive = true
}

variable "firebase_service_account_json" {
  type      = string
  sensitive = true
}

variable "recaptcha_secret" {
  type      = string
  sensitive = true
}

resource "azurerm_key_vault" "this" {
  name                = "kv-crococalc-prod"
  resource_group_name = var.resource_group_name
  location            = var.location
  tenant_id           = var.tenant_id
  sku_name            = "standard"

  rbac_authorization_enabled = true
  purge_protection_enabled   = true
  soft_delete_retention_days = 90

  public_network_access_enabled = true

  network_acls {
    default_action = "Allow"
    bypass         = "AzureServices"
  }

  tags = var.tags
}

# The operator and the CI identity are the *same* principal whenever the apply
# runs from infra.yml, and Azure rejects a second (scope, role, principal)
# triple with RoleAssignmentExists — which would break INF-080's idempotency
# criterion. Collapsing both into one keyed resource makes the duplicate
# disappear at plan time instead. Both ids are known at plan time (one is
# azurerm_client_config, the other a data source), so they are legal for_each
# keys.
locals {
  secrets_officer_principal_ids = toset(compact([
    var.operator_principal_id,
    var.cicd_principal_id,
  ]))
}

resource "azurerm_role_assignment" "secrets_officer" {
  for_each = local.secrets_officer_principal_ids

  scope                = azurerm_key_vault.this.id
  role_definition_name = "Key Vault Secrets Officer"
  principal_id         = each.value
}

resource "azurerm_role_assignment" "api_secrets_user" {
  scope                = azurerm_key_vault.this.id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = var.api_identity_principal_id
}

# RBAC propagation is eventually consistent; without the explicit dependency the
# first apply races the role assignment and fails writing the secrets.
resource "azurerm_key_vault_secret" "mongodb_uri" {
  name         = "mongodb-uri"
  value        = var.mongodb_uri
  key_vault_id = azurerm_key_vault.this.id
  content_type = "text/plain"

  depends_on = [azurerm_role_assignment.secrets_officer]
}

resource "azurerm_key_vault_secret" "firebase_service_account" {
  name         = "firebase-service-account"
  value        = var.firebase_service_account_json
  key_vault_id = azurerm_key_vault.this.id
  content_type = "application/json"

  depends_on = [azurerm_role_assignment.secrets_officer]
}

resource "azurerm_key_vault_secret" "recaptcha_secret" {
  name         = "recaptcha-secret"
  value        = var.recaptcha_secret
  key_vault_id = azurerm_key_vault.this.id
  content_type = "text/plain"

  depends_on = [azurerm_role_assignment.secrets_officer]
}

output "vault_id" {
  value = azurerm_key_vault.this.id
}

output "vault_uri" {
  value = azurerm_key_vault.this.vault_uri
}

output "secret_ids" {
  description = "Versionless secret ids the Container App binds to."
  value = {
    mongodb_uri              = azurerm_key_vault_secret.mongodb_uri.versionless_id
    firebase_service_account = azurerm_key_vault_secret.firebase_service_account.versionless_id
    recaptcha_secret         = azurerm_key_vault_secret.recaptcha_secret.versionless_id
  }
}

output "secrets_user_role_assignment_id" {
  description = "So the container app can depend on the grant existing before it reads a secret."
  value       = azurerm_role_assignment.api_secrets_user.id
}
