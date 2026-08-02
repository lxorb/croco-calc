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
}
