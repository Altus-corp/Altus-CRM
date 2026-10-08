$ErrorActionPreference = "Stop"

# Data is included from these tables. Sensitive tables remain schema-only.
$IncludedTables = @(
  "t_altus.ops", "t_altus.snapshots", "t_altus.contacts", "t_altus.contact_labels", "t_altus.contact_calls",
  "t_altus.plans", "t_altus.coupons", "t_altus.company_profile", "t_altus.subscription_settings", "t_altus.subscription_events",
  "altus_registry.ops", "altus_registry.tenants", "altus_registry.platform_users", "altus_registry.platform_assignments",
  "altus_registry.departments", "altus_registry.subscriptions", "altus_registry.due"
)

# Data is excluded from these tables: password hashes, sessions, login attempts,
# identity material, secrets, key/value token state, and invite tokens.
$ExcludedDataTables = @(
  "t_altus.credentials", "t_altus.sessions", "t_altus.login_attempts", "t_altus.secrets", "t_altus.kv",
  "altus_registry.credentials", "altus_registry.sessions", "altus_registry.login_attempts", "altus_registry.secrets",
  "altus_registry.kv", "altus_registry.identity", "altus_registry.platform_invites"
)

$sourceUrlFile = "A:\office\Workflow\Altus-CRM\altus-data\postgres.url"
$outputDirectory = "A:\office\Teant\import"
$outputFile = Join-Path $outputDirectory "altus-admin-refresh.dump"

try {
  $connectionString = (Get-Content -LiteralPath $sourceUrlFile -Raw).Trim()
  if ([string]::IsNullOrWhiteSpace($connectionString)) { throw "missing source connection" }
  New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null

  $arguments = @(
    "--format=custom", "--no-owner", "--no-privileges", "--file=$outputFile",
    "--schema=t_altus", "--schema=altus_registry"
  )
  foreach ($table in $ExcludedDataTables) { $arguments += "--exclude-table-data=$table" }
  $arguments += $connectionString

  & pg_dump @arguments 2>$null
  if ($LASTEXITCODE -ne 0) { throw "dump failed" }
  Write-Output "dump written"
} catch {
  Write-Output "dump failed"
  exit 1
}
