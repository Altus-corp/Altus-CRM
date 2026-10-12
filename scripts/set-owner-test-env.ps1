$ErrorActionPreference = "Stop"

$email = (Read-Host "Owner email").Trim()
$securePassword = Read-Host "Owner test password" -AsSecureString
$passwordPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
try {
    $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPtr)
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPtr)
}

if ([string]::IsNullOrWhiteSpace($email) -or [string]::IsNullOrEmpty($password)) { exit 1 }

$envPath = Join-Path (Split-Path -Parent $PSScriptRoot) ".env"
$lines = if (Test-Path -LiteralPath $envPath) { @(Get-Content -LiteralPath $envPath) } else { @() }
$kept = @($lines | Where-Object { $_ -notmatch '^\s*CRM_OWNER_EMAIL\s*=' -and $_ -notmatch '^\s*CRM_OWNER_PASSWORD\s*=' })
$ownerLines = @(
    "CRM_OWNER_EMAIL=$email"
    "CRM_OWNER_PASSWORD='$password'"
)
Set-Content -LiteralPath $envPath -Value @($kept + $ownerLines) -Encoding utf8
Write-Output "owner test env written"
