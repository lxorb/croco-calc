terraform {
  # INF-074. Installed Terraform is v1.14.8.
  required_version = "~> 1.14"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.65"
    }
  }

  # INF-072: bootstrap deliberately uses LOCAL state — it is what creates the
  # remote backend everything else uses. The state file is gitignored.
}

provider "azurerm" {
  features {}
  subscription_id = var.subscription_id

  # INF-073: the state storage account sets `shared_access_key_enabled = false`,
  # so there is no account key for the provider to fall back on. Without this the
  # very first apply creates the account and then dies polling its data plane
  # with "KeyBasedAuthenticationNotPermitted", leaving the containers uncreated.
  # `backend.tf` already carries the equivalent `use_azuread_auth = true`; this is
  # the same switch for the provider's own data-plane calls.
  storage_use_azuread = true
}
