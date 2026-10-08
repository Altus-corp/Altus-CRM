$ErrorActionPreference = "Stop"

$dumpFile = "A:\office\Teant\import\altus-admin-refresh.dump"
$connectionString = $env:CRM_IMPORT_PG_URL
$databaseName = "crm_import"
$countTables = @(
  "t_altus.ops", "t_altus.snapshots", "t_altus.contacts", "t_altus.contact_labels", "t_altus.contact_calls",
  "t_altus.plans", "t_altus.coupons", "t_altus.company_profile", "t_altus.subscription_settings", "t_altus.subscription_events",
  "altus_registry.ops", "altus_registry.tenants", "altus_registry.platform_users", "altus_registry.platform_assignments",
  "altus_registry.departments", "altus_registry.subscriptions", "altus_registry.due"
)

try {
  if ([string]::IsNullOrWhiteSpace($connectionString) -or -not (Test-Path -LiteralPath $dumpFile)) { throw "missing input" }
  $uri = [Uri]::new($connectionString)
  if (@("127.0.0.1", "localhost") -notcontains $uri.Host -or $uri.Port -ne 5435 -or $uri.AbsolutePath.Trim("/") -ne $databaseName) { throw "guard failed" }

  $adminBuilder = [UriBuilder]::new($uri)
  $adminBuilder.Path = "/postgres"
  $adminConnectionString = $adminBuilder.Uri.AbsoluteUri

  & psql $adminConnectionString --set=ON_ERROR_STOP=1 --command="DROP DATABASE IF EXISTS $databaseName WITH (FORCE);" 2>$null
  if ($LASTEXITCODE -ne 0) { throw "drop failed" }
  & psql $adminConnectionString --set=ON_ERROR_STOP=1 --command="CREATE DATABASE $databaseName;" 2>$null
  if ($LASTEXITCODE -ne 0) { throw "create failed" }
  & pg_restore --dbname=$connectionString --no-owner --no-privileges --exit-on-error $dumpFile 2>$null
  if ($LASTEXITCODE -ne 0) { throw "restore failed" }

  foreach ($table in $countTables) {
    $parts = $table.Split(".")
    $schema = $parts[0].Replace("'", "''")
    $name = $parts[1].Replace("'", "''")
    $existsQuery = "SELECT count(*) FROM information_schema.tables WHERE table_schema='$schema' AND table_name='$name';"
    $exists = (& psql $connectionString --no-align --tuples-only --quiet --set=ON_ERROR_STOP=1 --command=$existsQuery 2>$null | Select-Object -First 1).ToString().Trim()
    if ($LASTEXITCODE -ne 0) { throw "table check failed" }
    if ($exists -eq "1") {
      $countQuery = "SELECT count(*)::bigint FROM `"$schema`".`"$name`";"
      $count = (& psql $connectionString --no-align --tuples-only --quiet --set=ON_ERROR_STOP=1 --command=$countQuery 2>$null | Select-Object -First 1).ToString().Trim()
    } else {
      $count = "0"
    }
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($count)) { throw "count failed" }
    Write-Output "${table}: $count"
  }
} catch {
  Write-Output "restore failed"
  exit 1
}
