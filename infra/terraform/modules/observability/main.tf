/**
 * log-croco-calc-prod and the notification action group (INF-140, INF-141).
 *
 * The three alert rules live in the `alerts/` sub-module because they are
 * scoped to the Container App, which is created *after* this workspace — a
 * single module owning both would be a dependency cycle.
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
variable "alert_email" { type = string }
variable "daily_quota_gb" { type = number }
variable "retention_days" { type = number }

resource "azurerm_log_analytics_workspace" "this" {
  name                = "log-croco-calc-prod"
  resource_group_name = var.resource_group_name
  location            = var.location
  sku                 = "PerGB2018"
  retention_in_days   = var.retention_days
  daily_quota_gb      = var.daily_quota_gb
  tags                = var.tags
}

resource "azurerm_monitor_action_group" "this" {
  name                = "ag-croco-calc-prod"
  resource_group_name = var.resource_group_name
  short_name          = "crococalc"
  tags                = var.tags

  email_receiver {
    name                    = "operator"
    email_address           = var.alert_email
    use_common_alert_schema = true
  }
}

output "workspace_id" {
  description = "Resource id of log-croco-calc-prod."
  value       = azurerm_log_analytics_workspace.this.id
}

output "workspace_customer_id" {
  description = "Workspace (customer) GUID."
  value       = azurerm_log_analytics_workspace.this.workspace_id
}

output "action_group_id" {
  value = azurerm_monitor_action_group.this.id
}
