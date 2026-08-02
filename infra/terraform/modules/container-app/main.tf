/**
 * cae-croco-calc-prod + ca-croco-calc-api (INF-033 … INF-050).
 *
 * Consumption workload profile, external ingress on 5005, probes on `GET /`
 * (the only path the Express router answers outside the catch-all 404), and a
 * single HTTP scale rule. Secrets are Key Vault references bound to the
 * user-assigned identity — no secret value appears in the template.
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

variable "log_analytics_workspace_id" { type = string }
variable "identity_id" { type = string }

variable "image" { type = string }
variable "cpu" { type = number }
variable "memory" { type = string }
variable "min_replicas" { type = number }
variable "max_replicas" { type = number }
variable "concurrent_requests" { type = number }

variable "frontend_url" { type = string }
variable "db_name" { type = string }

variable "key_vault_secret_ids" {
  description = "Versionless Key Vault secret ids: mongodb_uri, firebase_service_account, recaptcha_secret."
  type        = map(string)
}

locals {
  target_port = 5005
}

resource "azurerm_container_app_environment" "this" {
  name                       = "cae-croco-calc-prod"
  resource_group_name        = var.resource_group_name
  location                   = var.location
  log_analytics_workspace_id = var.log_analytics_workspace_id
  tags                       = var.tags
}

resource "azurerm_container_app" "api" {
  name                         = "ca-croco-calc-api"
  resource_group_name          = var.resource_group_name
  container_app_environment_id = azurerm_container_app_environment.this.id
  revision_mode                = "Single"
  tags                         = var.tags

  identity {
    type         = "UserAssigned"
    identity_ids = [var.identity_id]
  }

  # INF-084: values are Key Vault references, resolved by the managed identity.
  secret {
    name                = "mongodb-uri"
    key_vault_secret_id = var.key_vault_secret_ids["mongodb_uri"]
    identity            = var.identity_id
  }

  secret {
    name                = "firebase-service-account"
    key_vault_secret_id = var.key_vault_secret_ids["firebase_service_account"]
    identity            = var.identity_id
  }

  secret {
    name                = "recaptcha-secret"
    key_vault_secret_id = var.key_vault_secret_ids["recaptcha_secret"]
    identity            = var.identity_id
  }

  # INF-045
  ingress {
    external_enabled           = true
    target_port                = local.target_port
    transport                  = "auto"
    allow_insecure_connections = false

    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }

  template {
    min_replicas = var.min_replicas
    max_replicas = var.max_replicas

    # INF-036
    http_scale_rule {
      name                = "http-concurrency"
      concurrent_requests = tostring(var.concurrent_requests)
    }

    container {
      name   = "api"
      image  = var.image
      cpu    = var.cpu
      memory = var.memory

      # INF-050. MAINTENANCE is deliberately absent (INF-048): the maintenance
      # middleware 503s every path except /configuration, including the health
      # probe, which would make ACA restart-loop the replica. REDIS_URI is
      # deliberately absent (INF-049), as is every BYPASS_* (INF-051).
      env {
        name  = "MODE"
        value = "prod"
      }
      env {
        name  = "PORT"
        value = tostring(local.target_port)
      }
      env {
        name  = "DB_NAME"
        value = var.db_name
      }
      env {
        name  = "FRONTEND_URL"
        value = var.frontend_url
      }
      env {
        name  = "LOG_FOLDER_PATH"
        value = "/app/backend/dist/logs"
      }
      env {
        name  = "LOG_FILE_MAX_SIZE"
        value = "10485760"
      }
      env {
        name        = "DB_URI"
        secret_name = "mongodb-uri"
      }
      env {
        name        = "FIREBASE_SERVICE_ACCOUNT_JSON"
        secret_name = "firebase-service-account"
      }
      env {
        name        = "RECAPTCHA_SECRET"
        secret_name = "recaptcha-secret"
      }

      # INF-046: `GET /` is the only usable probe path — the router's catch-all
      # 404s everything else.
      liveness_probe {
        transport               = "HTTP"
        port                    = local.target_port
        path                    = "/"
        initial_delay           = 20
        interval_seconds        = 30
        timeout                 = 5
        failure_count_threshold = 3
      }

      readiness_probe {
        transport               = "HTTP"
        port                    = local.target_port
        path                    = "/"
        interval_seconds        = 10
        timeout                 = 5
        failure_count_threshold = 3
        success_count_threshold = 1
      }

      startup_probe {
        transport               = "HTTP"
        port                    = local.target_port
        path                    = "/"
        interval_seconds        = 10
        timeout                 = 5
        failure_count_threshold = 30
      }
    }
  }

  lifecycle {
    # deploy-backend.yml rolls the image forward with `az containerapp update`,
    # so Terraform must not drag it back to var.image on the next apply. This is
    # what keeps INF-080's "No changes." true after a deploy.
    ignore_changes = [template[0].container[0].image]
  }
}

output "fqdn" {
  value = azurerm_container_app.api.ingress[0].fqdn
}

output "api_base_url" {
  value = "https://${azurerm_container_app.api.ingress[0].fqdn}"
}

output "container_app_id" {
  value = azurerm_container_app.api.id
}

output "environment_id" {
  value = azurerm_container_app_environment.this.id
}
