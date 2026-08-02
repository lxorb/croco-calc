// INF-078. `api_base_url` is the contract with the frontend: infra.yml writes
// it back to the repository variable vars.BACKEND_URL (INF-086a) so the value
// can never drift from the deployed FQDN.

output "api_base_url" {
  description = "Origin of the deployed API. Becomes vars.BACKEND_URL and the frontend's BACKEND_URL."
  value       = module.container_app.api_base_url
}

output "container_app_fqdn" {
  description = "Bare FQDN of ca-croco-calc-api."
  value       = module.container_app.fqdn
}

output "key_vault_uri" {
  value = module.key_vault.vault_uri
}

output "log_analytics_workspace_id" {
  value = module.observability.workspace_id
}

output "mongodb_uri" {
  description = "Full Azure DocumentDB SRV URI. Also written to Key Vault as mongodb-uri."
  value       = module.mongodb.connection_string
  sensitive   = true
}

output "mongodb_tier" {
  description = "Deployed Azure DocumentDB compute tier (INF-062)."
  value       = module.mongodb.tier
}

output "mongodb_location" {
  description = "Region the database landed in. Differs from var.location only on the Free tier."
  value       = module.mongodb.location
}
