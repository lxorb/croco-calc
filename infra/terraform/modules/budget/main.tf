/**
 * budget-croco-calc-monthly (INF-143) — the machine-enforced form of the
 * brief's hard $50/month ceiling.
 *
 * SCOPE (corrected 2026-08-03): this budget is scoped to the **resource group**
 * `rg-croco-calc-prod`, not to the subscription. It was originally an
 * `azurerm_consumption_budget_subscription`, which measured every resource in
 * the subscription — the user runs ~11 unrelated projects in the same one, so
 * the budget was reporting their spend, not croco calc's. That is what produced
 * the "forecasted to reach CHF 331.27" alert on 2026-08-03 while croco calc had
 * accrued nothing at all. A resource-group budget is the only scope at which
 * INF-143's "< $50/month **for croco calc**" is a measurable statement.
 *
 * CURRENCY: `amount` is denominated in the subscription's billing currency,
 * which is **CHF** (`az consumption budget list` reports currentSpend in CHF).
 * It is NOT USD. See INF-143 in docs/requirements/06-infra-and-ops.md for the
 * conversion of the brief's USD 50 ceiling into the CHF figure passed here.
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

variable "resource_group_id" {
  description = "Full resource id of the resource group the budget measures."
  type        = string
}

variable "amount" {
  description = "Monthly ceiling in the subscription's billing currency (CHF)."
  type        = number
}

variable "start_date" { type = string }
variable "contact_email" { type = string }

resource "azurerm_consumption_budget_resource_group" "this" {
  name              = "budget-croco-calc-monthly"
  resource_group_id = var.resource_group_id

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
    #
    # `ignore_changes` only protects *updates*. If this resource is ever
    # replaced (as it was on 2026-08-03, when the subscription-scoped resource
    # type was swapped for this one), Azure re-validates the literal value:
    # for time_grain = "Monthly" a past start_date is accepted only while it
    # still falls inside the current month. So on any replacement,
    # `budget_start_date` must first be moved to the first of the current month.
    ignore_changes = [time_period[0].start_date]
  }
}

output "budget_id" {
  value = azurerm_consumption_budget_resource_group.this.id
}
