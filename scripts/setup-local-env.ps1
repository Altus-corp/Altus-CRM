$ErrorActionPreference = "Stop"

$securePassword = Read-Host "crm_app password" -AsSecureString
$passwordPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
try {
    $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPtr)
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPtr)
}

if ([string]::IsNullOrEmpty($password)) { exit 1 }

$encodedPassword = [Uri]::EscapeDataString($password)
$connectionLine = "CRM_PG_URL=postgres://crm_app:$encodedPassword@127.0.0.1:5435/crm_dev"
$envPath = Join-Path (Split-Path -Parent $PSScriptRoot) ".env"
$lines = if (Test-Path -LiteralPath $envPath) { @(Get-Content -LiteralPath $envPath | ForEach-Object { $_.TrimStart([char]0xFEFF) }) } else { @() }
$kept = @($lines | Where-Object { $_ -notmatch '^\s*CRM_PG_URL\s*=' })
$output = @($kept + $connectionLine) -join [Environment]::NewLine
[System.IO.File]::WriteAllText($envPath, $output + [Environment]::NewLine, [Text.Encoding]::ASCII)
$env:CRM_PG_URL = $connectionLine.Substring("CRM_PG_URL=".Length)
@'
const { Client } = require("pg");
(async () => {
  const client = new Client({ connectionString: process.env.CRM_PG_URL });
  try { await client.connect(); await client.query("SELECT 1"); console.log("connection OK"); }
  catch (error) { console.log(`connection ERROR code=${error.code || error.name || "UNKNOWN"}`); process.exitCode = 1; }
  finally { await client.end().catch(() => {}); }
})();
'@ | node -
$password = $null
$env:CRM_PG_URL = $null
