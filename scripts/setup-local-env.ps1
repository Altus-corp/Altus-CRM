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
$lines = if (Test-Path -LiteralPath $envPath) { @(Get-Content -LiteralPath $envPath) } else { @() }
$kept = @($lines | Where-Object { $_ -notmatch '^\s*CRM_PG_URL\s*=' })
Set-Content -LiteralPath $envPath -Value @($kept + $connectionLine) -Encoding utf8
Write-Output "env file written"
