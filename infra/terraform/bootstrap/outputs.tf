output "tfstate_resource_group_name" {
  description = "Resource group holding the remote state (backend.tf)."
  value       = azurerm_resource_group.tfstate.name
}

output "tfstate_storage_account_name" {
  description = "Storage account holding the remote state and DB backups."
  value       = azurerm_storage_account.tfstate.name
}

output "prod_resource_group_name" {
  description = "Application resource group the prod root module deploys into."
  value       = azurerm_resource_group.prod.name
}

output "cicd_client_id" {
  description = "Value for the GitHub secret AZURE_CLIENT_ID (INF-086)."
  value       = azurerm_user_assigned_identity.cicd.client_id
}

output "cicd_principal_id" {
  description = "Object id of id-croco-calc-cicd; prod grants it Key Vault Secrets Officer."
  value       = azurerm_user_assigned_identity.cicd.principal_id
}
