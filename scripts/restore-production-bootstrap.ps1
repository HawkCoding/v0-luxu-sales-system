param(
  [switch]$PreflightOnly,
  [switch]$SkipPreflight
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
if ($PSVersionTable.PSVersion.Major -ge 7) {
  $PSNativeCommandUseErrorActionPreference = $false
}

$requiredOptIn = "I_UNDERSTAND_THIS_WRITES_TO_PRODUCTION"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$preflightSql = Join-Path $repoRoot "scripts\production-bootstrap-preflight.sql"
$restoreSql = Join-Path $repoRoot "scripts\production-bootstrap-restore-cli.sql"

function Load-EnvFile {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    return
  }

  $lines = Get-Content -LiteralPath $Path
  foreach ($line in $lines) {
    $trimmed = $line.Trim()
    if ([string]::IsNullOrWhiteSpace($trimmed) -or $trimmed.StartsWith("#")) {
      continue
    }
    if ($trimmed -notmatch "^[A-Za-z_][A-Za-z0-9_]*=") {
      continue
    }

    $parts = $trimmed.Split("=", 2)
    $name = $parts[0].Trim()
    $value = $parts[1].Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }

    if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name, "Process"))) {
      [Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
  }
}

function Get-OptionalEnv {
  param([Parameter(Mandatory = $true)][string]$Name)

  $value = [Environment]::GetEnvironmentVariable($Name, "Process")
  if ([string]::IsNullOrWhiteSpace($value)) {
    return $null
  }
  return $value
}

function New-SupabasePoolerDbUrl {
  param(
    [Parameter(Mandatory = $true)][string]$ProjectRef,
    [Parameter(Mandatory = $true)][string]$Password,
    [string]$PoolerHost = "aws-1-eu-west-1.pooler.supabase.com"
  )

  $encodedPassword = [System.Uri]::EscapeDataString($Password)
  return "postgresql://postgres.$ProjectRef`:$encodedPassword@$PoolerHost`:5432/postgres"
}

function Get-ProductionDbUrl {
  $url = Get-OptionalEnv -Name "SUPABASE_PROD_DB_URL"
  if (-not [string]::IsNullOrWhiteSpace($url)) {
    return $url
  }

  $projectRef = Get-OptionalEnv -Name "SUPABASE_PROD_PROJECT_REF"
  $password = Get-OptionalEnv -Name "SUPABASE_PROD_DB_PASSWORD"
  if (-not [string]::IsNullOrWhiteSpace($projectRef) -and -not [string]::IsNullOrWhiteSpace($password)) {
    $poolerHost = Get-OptionalEnv -Name "SUPABASE_PROD_POOLER_HOST"
    if ([string]::IsNullOrWhiteSpace($poolerHost)) {
      return New-SupabasePoolerDbUrl -ProjectRef $projectRef -Password $password
    }

    return New-SupabasePoolerDbUrl -ProjectRef $projectRef -Password $password -PoolerHost $poolerHost
  }

  throw "Missing production database connection details. Set SUPABASE_PROD_DB_URL, or SUPABASE_PROD_PROJECT_REF plus SUPABASE_PROD_DB_PASSWORD, in .env.sync.local."
}

function Invoke-SupabaseSqlFile {
  param(
    [Parameter(Mandatory = $true)][string]$DbUrl,
    [Parameter(Mandatory = $true)][string]$SqlFile,
    [Parameter(Mandatory = $true)][string]$Label
  )

  Write-Host "`n== $Label ==" -ForegroundColor Cyan
  Write-Host "npx supabase db query --db-url <db-url-redacted> --file $SqlFile --output table" -ForegroundColor DarkGray
  & npx supabase db query --db-url $DbUrl --file $SqlFile --output table
  if ($LASTEXITCODE -ne 0) {
    throw "$Label failed with exit code $LASTEXITCODE."
  }
}

Push-Location $repoRoot
try {
  Load-EnvFile -Path (Join-Path $repoRoot ".env.sync.local")

  if (-not $PreflightOnly) {
    $optIn = [Environment]::GetEnvironmentVariable("ALLOW_PRODUCTION_BOOTSTRAP_RESTORE", "Process")
    if ($optIn -ne $requiredOptIn) {
      throw "Production bootstrap restore blocked. Set ALLOW_PRODUCTION_BOOTSTRAP_RESTORE=$requiredOptIn."
    }
  }

  $dbUrl = Get-ProductionDbUrl

  if (-not $SkipPreflight) {
    Invoke-SupabaseSqlFile -DbUrl $dbUrl -SqlFile $preflightSql -Label "Production bootstrap preflight"
  }

  if (-not $PreflightOnly) {
    Invoke-SupabaseSqlFile -DbUrl $dbUrl -SqlFile $restoreSql -Label "Production bootstrap restore"
  }

  Write-Host "`nDone." -ForegroundColor Green
} finally {
  Pop-Location
}
