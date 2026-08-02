/**
 * budget-croco-calc-monthly (INF-143) — the machine-enforced form of the
 * brief's hard $50/month ceiling.
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

variable "subscription_id" { type = string }
variable "amount" { type = number }
variable "start_date" { type = string }
variable "contact_email" { type = string }

resource "azurerm_consumption_budget_subscription" "this" {
  name            = "budget-croco-calc-monthly"
  subscription_id = "/subscriptions/${var.subscription_id}"

  amount     = var.amount
  time_grain = "Monthly"

  time_period {
    start_date = var.start_date
  }

  notification {
    enabled        = true
    threshold      = 50
    operator       = "GreaterThan"
    threshold_type = "Actual"
    contact_emails = [var.contact_email]
  }

  notification {
    enabled        = true
    threshold      = 80
    operator       = "GreaterThan"
    threshold_type = "Actual"
    contact_emails = [var.contact_email]
  }

  notification {
    enabled        = true
    threshold      = 100
    operator       = "GreaterThanOrEqualTo"
    threshold_type = "Actual"
    contact_emails = [var.contact_email]
  }

  notification {
    enabled        = true
    threshold      = 100
    operator       = "GreaterThanOrEqualTo"
    threshold_type = "Forecasted"
    contact_emails = [var.contact_email]
  }

  lifecycle {
    # A budget's start_date must not be in the past, but it is immutable once
    # created — without this, every apply after the first month would fail.
    ignore_changes = [time_period[0].start_date]
  }
}

output "budget_id" {
  value = azurerm_consumption_budget_subscription.this.id
}
