/**
 * The three INF-142 alert rules. Separate from the parent module only because
 * they are scoped to the Container App, which depends on the workspace the
 * parent creates.
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
variable "tags" { type = map(string) }
variable "container_app_id" { type = string }
variable "action_group_id" { type = string }

variable "http_5xx_threshold" {
  description = <<-EOT
    INF-142(b) asks for "5xx rate > 5 % over 15 minutes". An Azure metric alert
    evaluates one series against a scalar; it cannot divide two series, so a
    literal percentage is not expressible without a Log Analytics query, and
    Container Apps ingress access logs are not sent to the workspace. This rule
    therefore fires on the 5xx *count* over the same 15-minute window. At croco
    calc's load (single-digit requests per minute) 10 server errors in 15
    minutes is far past the 5 % line. Revisit if traffic grows.
  EOT
  type        = number
  default     = 10
}

# INF-142(a): a replica restart loop.
resource "azurerm_monitor_metric_alert" "restarts" {
  name                = "alert-croco-calc-replica-restarts"
  resource_group_name = var.resource_group_name
  scopes              = [var.container_app_id]
  description         = "Container App replicas restarted more than 3 times in 15 minutes."
  severity            = 2
  frequency           = "PT5M"
  window_size         = "PT15M"
  tags                = var.tags

  criteria {
    metric_namespace = "Microsoft.App/containerApps"
    metric_name      = "RestartCount"
    aggregation      = "Maximum"
    operator         = "GreaterThan"
    threshold        = 3
  }

  action {
    action_group_id = var.action_group_id
  }
}

# INF-142(b): server errors.
resource "azurerm_monitor_metric_alert" "http_5xx" {
  name                = "alert-croco-calc-http-5xx"
  resource_group_name = var.resource_group_name
  scopes              = [var.container_app_id]
  description         = "Container App returned an elevated number of 5xx responses over 15 minutes."
  severity            = 1
  frequency           = "PT5M"
  window_size         = "PT15M"
  tags                = var.tags

  criteria {
    metric_namespace = "Microsoft.App/containerApps"
    metric_name      = "Requests"
    aggregation      = "Total"
    operator         = "GreaterThan"
    threshold        = var.http_5xx_threshold

    dimension {
      name     = "statusCodeCategory"
      operator = "Include"
      values   = ["5xx"]
    }
  }

  action {
    action_group_id = var.action_group_id
  }
}

# INF-142(c): no healthy replica for 5 minutes — the app is down.
resource "azurerm_monitor_metric_alert" "no_replicas" {
  name                = "alert-croco-calc-no-replicas"
  resource_group_name = var.resource_group_name
  scopes              = [var.container_app_id]
  description         = "Container App reported zero running replicas for 5 minutes."
  severity            = 0
  frequency           = "PT1M"
  window_size         = "PT5M"
  tags                = var.tags

  criteria {
    metric_namespace = "Microsoft.App/containerApps"
    metric_name      = "Replicas"
    aggregation      = "Average"
    operator         = "LessThanOrEqual"
    threshold        = 0
  }

  action {
    action_group_id = var.action_group_id
  }
}

output "alert_ids" {
  value = [
    azurerm_monitor_metric_alert.restarts.id,
    azurerm_monitor_metric_alert.http_5xx.id,
    azurerm_monitor_metric_alert.no_replicas.id,
  ]
}
