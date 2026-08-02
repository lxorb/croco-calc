terraform {
  # INF-074. Installed Terraform is v1.14.8.
  required_version = "~> 1.14"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.65"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.9"
    }
  }
}

provider "azurerm" {
  features {
    key_vault {
      # INF-083: purge protection is on, so a destroyed vault must be recovered,
      # never purged out from under a running deployment.
      purge_soft_delete_on_destroy    = false
      recover_soft_deleted_key_vaults = true
    }
    resource_group {
      prevent_deletion_if_contains_resources = true
    }
  }
  subscription_id = var.subscription_id

  # INF-081 records that every required provider is already registered, and
  # INF-085 scopes the CI identity to rg-croco-calc-prod — it deliberately holds
  # no subscription-level */register/action. Leaving the default registration
  # behaviour on would make every CI plan fail before it read a single resource.
  resource_provider_registrations = "none"
}

# The database is an ordinary Azure resource now (Microsoft.DocumentDB/
# mongoClusters), so it needs no provider or credentials of its own. Dropping
# the `mongodbatlas` provider is what retires blocker BL-4.
provider "random" {}
