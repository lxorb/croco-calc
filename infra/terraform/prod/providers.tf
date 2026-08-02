terraform {
  # INF-074. Installed Terraform is v1.14.8.
  required_version = "~> 1.14"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.65"
    }
    mongodbatlas = {
      source  = "mongodb/mongodbatlas"
      version = "~> 2.15"
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
}

# Credentials come from MONGODB_ATLAS_PUBLIC_KEY / MONGODB_ATLAS_PRIVATE_KEY in
# the environment (INF-076, INF-086) — never from a committed file.
provider "mongodbatlas" {}

provider "random" {}
