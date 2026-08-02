terraform {
  # INF-073. Entra ID auth only — the storage account has shared-key access
  # disabled, so there is no account key to leak.
  backend "azurerm" {
    resource_group_name  = "rg-croco-calc-tfstate"
    storage_account_name = "stcrococalctfstate"
    container_name       = "tfstate"
    key                  = "prod.terraform.tfstate"
    subscription_id      = "48317e81-bf0f-4424-8f69-c8513c91c001"
    tenant_id            = "f2fb90a0-b1c1-4048-8959-038f203720ad"
    use_azuread_auth     = true
  }
}
