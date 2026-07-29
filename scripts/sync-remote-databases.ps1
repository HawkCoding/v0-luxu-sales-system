param(
  [ValidateSet("compare", "push")]
  [string]$Mode = "compare",

  [ValidateSet("development", "production", "both")]
  [string]$Target = "both",

  [switch]$IncludeSeed,
  [switch]$IncludeAll,
  [switch]$SkipDiff,
  [switch]$ConfirmProduction
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
if ($PSVersionTable.PSVersion.Major -ge 7) {
  $PSNativeCommandUseErrorActionPreference = $false
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$reportRoot = Join-Path $repoRoot "tmp-db-sync"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$reportDir = Join-Path $reportRoot $timestamp

. (Join-Path $PSScriptRoot "lib/supabase-sync-common.ps1")

function Write-Section {
  param([string]$Message)
  Write-Host "`n== $Message ==" -ForegroundColor Cyan
}

function New-Dir {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) {
    New-Item -ItemType Directory -Path $Path -Force | Out-Null
  }
}

function Get-Targets {
  switch ($Target) {
    "development" { return @("development") }
    "production" { return @("production") }
    default { return @("development", "production") }
  }
}

function Compare-Target {
  param(
    [Parameter(Mandatory = $true)][string]$TargetName,
    [Parameter(Mandatory = $true)][string]$DbUrl
  )

  $targetReportDir = Join-Path $reportDir $TargetName
  New-Dir -Path $targetReportDir

  Write-Section "Comparing local to $TargetName"

  Invoke-Checked -Command @("supabase", "migration", "list", "--local") -OutputPath (Join-Path $targetReportDir "local-migrations.txt")
  Invoke-Checked -Command @("supabase", "migration", "list", "--db-url", $DbUrl) -OutputPath (Join-Path $targetReportDir "remote-migrations.txt")

  Invoke-Checked -Command @("supabase", "db", "dump", "--local", "--schema", "public", "--file", (Join-Path $targetReportDir "local-schema.sql"))
  Invoke-Checked -Command @("supabase", "db", "dump", "--db-url", $DbUrl, "--schema", "public", "--file", (Join-Path $targetReportDir "remote-schema.sql"))

  if (-not $SkipDiff) {
    Invoke-Checked -Command @("supabase", "db", "diff", "--from", $DbUrl, "--to", "local", "--schema", "public") -OutputPath (Join-Path $targetReportDir "remote-to-local-schema-diff.sql")
  }

  Invoke-Checked -Command @("supabase", "db", "push", "--db-url", $DbUrl, "--dry-run") -OutputPath (Join-Path $targetReportDir "push-dry-run.txt")

  Write-Host "Report: $targetReportDir"
}

function Push-Target {
  param(
    [Parameter(Mandatory = $true)][string]$TargetName,
    [Parameter(Mandatory = $true)][string]$DbUrl
  )

  if ($TargetName -eq "production") {
    $productionOptIn = [Environment]::GetEnvironmentVariable("ALLOW_PRODUCTION_DB_PUSH", "Process")
    if (-not $ConfirmProduction -or $productionOptIn -ne "I_UNDERSTAND_THIS_WRITES_TO_PRODUCTION") {
      throw "Production push blocked. Re-run with -ConfirmProduction and set ALLOW_PRODUCTION_DB_PUSH=I_UNDERSTAND_THIS_WRITES_TO_PRODUCTION."
    }
  }

  Write-Section "Pushing local migrations to $TargetName"

  $command = @("supabase", "db", "push", "--db-url", $DbUrl, "--yes")
  if ($IncludeAll) {
    $command += "--include-all"
  }
  if ($IncludeSeed) {
    $command += "--include-seed"
  }

  Invoke-Checked -Command $command
}

Push-Location $repoRoot
try {
  Load-EnvFile -Path (Join-Path $repoRoot ".env.sync.local")
  Load-EnvFile -Path (Join-Path $repoRoot ".env.local")

  New-Dir -Path $reportDir

  Write-Section "Supabase database sync"
  Write-Host "Mode: $Mode"
  Write-Host "Target: $Target"
  Write-Host "Reports: $reportDir"

  foreach ($targetName in Get-Targets) {
    $dbUrl = Get-TargetDbUrl -TargetName $targetName

    Compare-Target -TargetName $targetName -DbUrl $dbUrl

    if ($Mode -eq "push") {
      Push-Target -TargetName $targetName -DbUrl $dbUrl
      Compare-Target -TargetName $targetName -DbUrl $dbUrl
    }
  }

  Write-Host "`nDone." -ForegroundColor Green
} finally {
  Pop-Location
}
