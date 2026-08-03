/**
 * croco calc production infrastructure (INF-070 … INF-081).
 *
 * Applied by `.github/workflows/infra.yml` on workflow_dispatch only — never
 * automatically on push (INF-079). `bootstrap/` must have been applied first;
 * it owns the state storage, the application resource group and the CI
 * identity, all of which are read here as data sources.
 */

data "azurerm_client_config" "current" {}

data "azurerm_resource_group" "prod" {
  name = "rg-croco-calc-prod"
}

data "azurerm_user_assigned_identity" "cicd" {
  name                = "id-croco-calc-cicd"
  resource_group_name = "rg-croco-calc-tfstate"
}

# Runtime identity of the API. Created here (not in a module) because both the
# key-vault and container-app modules need it.
resource "azurerm_user_assigned_identity" "api" {
  name                = "id-croco-calc-api"
  resource_group_name = data.azurerm_resource_group.prod.name
  location            = var.location
  tags                = var.tags
}

module "observability" {
  source = "../modules/observability"

  resource_group_name = data.azurerm_resource_group.prod.name
  location            = var.location
  tags                = var.tags
  alert_email         = var.alert_email
  daily_quota_gb      = var.log_daily_quota_gb
  retention_days      = var.log_retention_days
}

module "alerts" {
  source = "../modules/observability/alerts"

  resource_group_name = data.azurerm_resource_group.prod.name
  tags                = var.tags
  container_app_id    = module.container_app.container_app_id
  action_group_id     = module.observability.action_group_id
}

module "mongodb" {
  source = "../modules/mongodb"

  resource_group_name = data.azurerm_resource_group.prod.name
  location            = var.mongodb_location
  tags                = var.tags

  tier               = var.mongodb_tier
  storage_size_in_gb = var.mongodb_storage_gb
  db_name            = var.db_name
}

module "key_vault" {
  source = "../modules/key-vault"

  resource_group_name = data.azurerm_resource_group.prod.name
  location            = var.location
  tags                = var.tags
  tenant_id           = data.azurerm_client_config.current.tenant_id

  api_identity_principal_id = azurerm_user_assigned_identity.api.principal_id
  cicd_principal_id         = data.azurerm_user_assigned_identity.cicd.principal_id
  operator_principal_id     = data.azurerm_client_config.current.object_id

  mongodb_uri                   = module.mongodb.connection_string
  firebase_service_account_json = var.firebase_service_account_json
  recaptcha_secret              = var.recaptcha_secret
}

module "container_app" {
  source = "../modules/container-app"

  resource_group_name = data.azurerm_resource_group.prod.name
  location            = var.location
  tags                = var.tags

  log_analytics_workspace_id = module.observability.workspace_id
  identity_id                = azurerm_user_assigned_identity.api.id

  image               = var.container_image
  cpu                 = var.container_cpu
  memory              = var.container_memory
  min_replicas        = var.min_replicas
  max_replicas        = var.max_replicas
  concurrent_requests = var.concurrent_requests

  frontend_url = var.frontend_url
  db_name      = var.db_name

  key_vault_secret_ids = module.key_vault.secret_ids

  # The app cannot start before its identity is allowed to read the vault.
  depends_on = [module.key_vault]
}

module "budget" {
  source = "../modules/budget"

  # INF-143 measures croco calc, so the budget is scoped to croco calc's
  # resource group — not to the subscription, which also holds ~11 unrelated
  # projects whose spend used to be counted against this ceiling.
  resource_group_id = data.azurerm_resource_group.prod.id
  amount            = var.budget_amount
  start_date        = var.budget_start_date
  contact_email     = var.alert_email
}
