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

# The two credentials above cover the `ref:`/`pull_request` subjects INF-085
# names verbatim. They are NOT sufficient on their own: the moment a job
# declares `environment:`, GitHub swaps the OIDC `sub` claim from the `ref:`
# form to `repo:<owner>/<repo>:environment:<name>`, and azure/login fails with
# AADSTS70021 ("no matching federated identity record"). INF-079 requires the
# apply job to sit behind a manual-approval environment, and INF-130's deploy
# job uses one too, so both subjects must be registered as well.
#
#   infra.yml          apply  -> environment: prod-infra
#   deploy-backend.yml deploy -> environment: prod
resource "azurerm_federated_identity_credential" "cicd_environments" {
  for_each = toset(var.github_environments)

  name                = "github-env-${each.value}"
  resource_group_name = azurerm_resource_group.tfstate.name
  parent_id           = azurerm_user_assigned_identity.cicd.id
  audience            = ["api://AzureADTokenExchange"]
  issuer              = "https://token.actions.githubusercontent.com"
  subject             = "repo:${var.github_repository}:environment:${each.value}"
}

# The three credentials above register the `repo:<owner>/<repo>:…` subject form.
# That form alone is no longer enough. GitHub has moved the OIDC `sub` claim to
# an immutable variant that embeds the numeric owner and repository ids:
#
#   repo:lxorb@101118850/croco-calc@1320770265:environment:prod
#
# and it is issued regardless of `use_immutable_subject` reading false — the
# authoritative field is `sub_claim_prefix` on
# `GET /repos/<owner>/<repo>/actions/oidc/customization/sub`. A credential
# registered only against the plain form fails with AADSTS700213, which is what
# broke the first three deploy-backend runs. Renaming the repository or transfer-
# ring it changes the plain form but not this one, so both are kept: Entra ID
# matches the token against every credential on the identity, and the first hit
# wins.
resource "azurerm_federated_identity_credential" "cicd_main_immutable" {
  name                = "github-main-immutable"
  resource_group_name = azurerm_resource_group.tfstate.name
  parent_id           = azurerm_user_assigned_identity.cicd.id
  audience            = ["api://AzureADTokenExchange"]
  issuer              = "https://token.actions.githubusercontent.com"
  subject             = "repo:${var.github_repository_immutable}:ref:refs/heads/main"
}

resource "azurerm_federated_identity_credential" "cicd_pull_request_immutable" {
  name                = "github-pull-request-immutable"
  resource_group_name = azurerm_resource_group.tfstate.name
  parent_id           = azurerm_user_assigned_identity.cicd.id
  audience            = ["api://AzureADTokenExchange"]
  issuer              = "https://token.actions.githubusercontent.com"
  subject             = "repo:${var.github_repository_immutable}:pull_request"
}

resource "azurerm_federated_identity_credential" "cicd_environments_immutable" {
  for_each = toset(var.github_environments)

  name                = "github-env-${each.value}-immutable"
  resource_group_name = azurerm_resource_group.tfstate.name
  parent_id           = azurerm_user_assigned_identity.cicd.id
  audience            = ["api://AzureADTokenExchange"]
  issuer              = "https://token.actions.githubusercontent.com"
  subject             = "repo:${var.github_repository_immutable}:environment:${each.value}"
}

resource "azurerm_role_assignment" "cicd_prod_contributor" {
  scope                = azurerm_resource_group.prod.id
  role_definition_name = "Contributor"
  principal_id         = azurerm_user_assigned_identity.cicd.principal_id
}

# Contributor explicitly denies Microsoft.Authorization/roleAssignments/write,
# but the prod root module creates three of them on the Key Vault (INF-083,
# INF-084, INF-085). Without this grant `terraform apply` from CI fails on the
# vault module and INF-080's idempotency criterion is unreachable.
#
# "Role Based Access Control Administrator" is the least-privilege built-in that
# carries roleAssignments write — narrower than "User Access Administrator",
# which would also hand CI Microsoft.Authorization/*/write.
resource "azurerm_role_assignment" "cicd_prod_rbac_admin" {
  scope                = azurerm_resource_group.prod.id
  role_definition_name = "Role Based Access Control Administrator"
  principal_id         = azurerm_user_assigned_identity.cicd.principal_id
}

# Cost Management Contributor at /subscriptions/<id>. Historically this existed
# because INF-143's budget was an azurerm_consumption_budget_SUBSCRIPTION; since
# the 2026-08-03 rescope that budget is resource-group-scoped and CI's
# Contributor on rg-croco-calc-prod already covers Microsoft.Consumption/* there.
# The grant is retained deliberately: it is the least-privilege built-in for cost
# APIs, it grants no access to any other resource, and INF-144's spend check
# queries Microsoft.CostManagement, which is not covered by the RG role.
resource "azurerm_role_assignment" "cicd_cost_management" {
  scope                = "/subscriptions/${var.subscription_id}"
  role_definition_name = "Cost Management Contributor"
  principal_id         = azurerm_user_assigned_identity.cicd.principal_id
}

# prod/main.tf reads `id-croco-calc-cicd` with a data source, and that identity
# lives in rg-croco-calc-tfstate where CI otherwise holds only the *data-plane*
# Storage Blob Data Contributor role. Without an ARM read the data source 403s
# before any resource is touched.
# ---------------------------------------------------------------------------
# INF-143a — subscription-wide cost guard.
#
# This budget is NOT croco calc's. INF-143's budget-croco-calc-monthly measures
# rg-croco-calc-prod alone; nothing else watched the other ~11 projects in this
# subscription, whose own run rate (June 2026 CHF 223.21, July 2026 CHF 358.80)
# dwarfs croco calc's.
#
# WHY IT LIVES IN bootstrap/ AND NOT IN prod/:
# prod/ is the stack that gets torn down when croco calc is decommissioned. A
# `terraform destroy` there would take the user's ONLY subscription-wide cost
# guard with it — a resource that protects spend having nothing to do with this
# project. bootstrap/ is the right home because it is already where this repo
# keeps subscription-scope concerns (see cicd_cost_management above) and because
# it is applied once, by hand, by the operator — not by CI on every dispatch.
#
# `prevent_destroy` is the belt-and-braces: even `terraform destroy` in this
# directory must fail loudly rather than silently unguard the subscription. To
# remove it deliberately, delete this block (or lift the flag) in a commit.
#
# NOTIFICATIONS: routed to contact_emails directly, NOT to ag-croco-calc-prod.
# That action group lives inside rg-croco-calc-prod and would be destroyed along
# with croco calc, leaving this budget alive but mute. Decoupling is the point.
#
# NO FORECASTED NOTIFICATION — deliberate. A Forecasted threshold on the old
# subscription-scoped budget is exactly what produced the false "forecasted to
# reach CHF 331.27" alarm on 2026-08-03. Actual-cost only, at 80 % and 100 %.
resource "azurerm_consumption_budget_subscription" "total" {
  name            = "budget-azure-subscription-total"
  subscription_id = "/subscriptions/${var.subscription_id}"

  amount     = var.subscription_budget_amount
  time_grain = "Monthly"

  time_period {
    start_date = var.subscription_budget_start_date
  }

  notification {
    enabled        = true
    threshold      = 80
    operator       = "GreaterThan"
    threshold_type = "Actual"
    contact_emails = [var.alert_email]
  }

  notification {
    enabled        = true
    threshold      = 100
    operator       = "GreaterThanOrEqualTo"
    threshold_type = "Actual"
    contact_emails = [var.alert_email]
  }

  lifecycle {
    prevent_destroy = true

    # Same immutability trap as the croco calc budget: start_date may not be in
    # the past at create time, but Azure freezes it afterwards. Without this,
    # every apply from the next month onwards would show a permanent diff.
    ignore_changes = [time_period[0].start_date]
  }
}

resource "azurerm_role_assignment" "cicd_self_reader" {
  scope                = azurerm_user_assigned_identity.cicd.id
  role_definition_name = "Reader"
  principal_id         = azurerm_user_assigned_identity.cicd.principal_id
}

# INF-077: remote state holds the database connection string and its generated
# password, so only the operator and the CI identity may read the tfstate
# container.
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
