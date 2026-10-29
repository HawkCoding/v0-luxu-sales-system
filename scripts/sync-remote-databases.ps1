param(
  [ValidateSet("compare", "push")]
  [string]$Mode = "compare",

  [ValidateSet("development", "production", "both")]
  [string]$Target = "both",

  [switch]$IncludeSeed,
  # No-op, kept so older callers still bind: pushes always use --include-all.
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

  # --include-all so a migration dated before the remote's latest one is listed
  # as pending instead of aborting the dry run.
  Invoke-Checked -Command @("supabase", "db", "push", "--db-url", $DbUrl, "--dry-run", "--include-all") -OutputPath (Join-Path $targetReportDir "push-dry-run.txt")

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

  # Always --include-all: a branch merged after a newer migration already landed
  # leaves older-dated files unapplied, and plain `db push` refuses those.
  $command = @("supabase", "db", "push", "--db-url", $DbUrl, "--yes", "--include-all")
  if ($IncludeSeed) {
    $command += "--include-seed"
  }

  Invoke-Checked -Command $command

  Write-Section "Migration history on $TargetName after push"
  Invoke-Checked -Command @("supabase", "migration", "list", "--db-url", $DbUrl)
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

    # Push mode skips the schema compare: it dumps the local database, which
    # needs a running local stack (absent in CI). Run `pnpm db:status` after.
    if ($Mode -eq "push") {
      Push-Target -TargetName $targetName -DbUrl $dbUrl
    } else {
      Compare-Target -TargetName $targetName -DbUrl $dbUrl
    }
  }

  Write-Host "`nDone." -ForegroundColor Green
} finally {
  Pop-Location
}
