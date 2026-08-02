/**
 * One-time bootstrap (INF-072). Run manually, once, with an operator identity:
 *
 *   cd infra/terraform/bootstrap && terraform init && terraform apply
 *
 * It creates everything the `prod` root module needs before it can run:
 *   - the remote-state resource group, storage account and containers,
 *   - the application resource group (so a scoped role assignment can exist),
 *   - the CI managed identity, its GitHub OIDC federated credentials and its
 *     role assignments.
 *
 * `prod` then consumes `rg-croco-calc-prod` and the CI identity as data sources.
 */

data "azurerm_client_config" "current" {}

resource "azurerm_resource_group" "tfstate" {
  name     = "rg-croco-calc-tfstate"
  location = var.location
  tags     = var.tags
}

resource "azurerm_resource_group" "prod" {
  name     = "rg-croco-calc-prod"
  location = var.location
  tags     = var.tags
}

resource "azurerm_storage_account" "tfstate" {
  name                = "stcrococalctfstate"
  resource_group_name = azurerm_resource_group.tfstate.name
  location            = azurerm_resource_group.tfstate.location

  account_tier             = "Standard"
  account_replication_type = "LRS"
  account_kind             = "StorageV2"

  min_tls_version                  = "TLS1_2"
  https_traffic_only_enabled       = true
  allow_nested_items_to_be_public  = false
  public_network_access_enabled    = true
  shared_access_key_enabled        = false # Entra ID auth only (INF-073)
  default_to_oauth_authentication  = true
  cross_tenant_replication_enabled = false

  blob_properties {
    versioning_enabled = true

    delete_retention_policy {
      days = 30
    }

    container_delete_retention_policy {
      days = 30
    }
  }

  tags = var.tags
}

resource "azurerm_storage_container" "tfstate" {
  name                  = "tfstate"
  storage_account_id    = azurerm_storage_account.tfstate.id
  container_access_type = "private"
}

resource "azurerm_storage_container" "backups" {
  name                  = "backups"
  storage_account_id    = azurerm_storage_account.tfstate.id
  container_access_type = "private"
}

# INF-061: mongodump archives age out after 30 days so the backup container
# cannot grow without bound.
resource "azurerm_storage_management_policy" "backups" {
  storage_account_id = azurerm_storage_account.tfstate.id

  rule {
    name    = "expire-old-backups"
    enabled = true

    filters {
      prefix_match = ["${azurerm_storage_container.backups.name}/"]
      blob_types   = ["blockBlob"]
    }

    actions {
      base_blob {
        tier_to_cool_after_days_since_creation_greater_than = 0
        delete_after_days_since_modification_greater_than   = var.backup_retention_days
      }

      version {
        delete_after_days_since_creation = var.backup_retention_days
      }
    }
  }
}

# ---------------------------------------------------------------------------
# CI identity — GitHub Actions authenticates with OIDC, never a client secret
# (INF-085).
# ---------------------------------------------------------------------------

resource "azurerm_user_assigned_identity" "cicd" {
  name                = "id-croco-calc-cicd"
  resource_group_name = azurerm_resource_group.tfstate.name
  location            = azurerm_resource_group.tfstate.location
  tags                = var.tags
}

resource "azurerm_federated_identity_credential" "cicd_main" {
  name                = "github-main"
  resource_group_name = azurerm_resource_group.tfstate.name
  parent_id           = azurerm_user_assigned_identity.cicd.id
  audience            = ["api://AzureADTokenExchange"]
  issuer              = "https://token.actions.githubusercontent.com"
  subject             = "repo:${var.github_repository}:ref:refs/heads/main"
}

resource "azurerm_federated_identity_credential" "cicd_pull_request" {
  name                = "github-pull-request"
  resource_group_name = azurerm_resource_group.tfstate.name
  parent_id           = azurerm_user_assigned_identity.cicd.id
  audience            = ["api://AzureADTokenExchange"]
  issuer              = "https://token.actions.githubusercontent.com"
  subject             = "repo:${var.github_repository}:pull_request"
}

resource "azurerm_role_assignment" "cicd_prod_contributor" {
  scope                = azurerm_resource_group.prod.id
  role_definition_name = "Contributor"
  principal_id         = azurerm_user_assigned_identity.cicd.principal_id
}

# INF-077: remote state holds the Atlas connection string, so only the operator
# and the CI identity may read the tfstate container.
resource "azurerm_role_assignment" "cicd_state_blob" {
  scope                = azurerm_storage_account.tfstate.id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = azurerm_user_assigned_identity.cicd.principal_id
}

resource "azurerm_role_assignment" "operator_state_blob" {
  scope                = azurerm_storage_account.tfstate.id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = data.azurerm_client_config.current.object_id
}
