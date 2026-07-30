param(
  [ValidateSet("development", "production", "both")]
  [string]$Target = "both",

  # Also run a real schema diff (remote vs local DB). Slower, needs local Supabase up.
  [switch]$Deep,

  # Keep the tmp-db-sync report directory even when everything is clean.
  [switch]$KeepReport
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
if ($PSVersionTable.PSVersion.Major -ge 7) {
  $PSNativeCommandUseErrorActionPreference = $false
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
. (Join-Path $PSScriptRoot "lib/supabase-sync-common.ps1")

$reportRoot = Join-Path $repoRoot "tmp-db-sync"
$reportDir = Join-Path $reportRoot ("status-" + (Get-Date -Format "yyyyMMdd-HHmmss"))

function Get-Targets {
  switch ($Target) {
    "development" { return @("development") }
    "production" { return @("production") }
    default { return @("development", "production") }
  }
}

function Test-LocalDbRunning {
  $previous = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $null = & supabase status 2>&1
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = $previous
  return ($exitCode -eq 0)
}

# Parses `supabase migration list` output into local-only / remote-only version lists.
function Get-MigrationGap {
  param([Parameter(Mandatory = $true)][string]$DbUrl)

  # PS 5.1 turns native stderr into ErrorRecords, which $ErrorActionPreference =
  # "Stop" would throw on even for a successful command. Relax it for the call.
  $previous = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $output = & supabase migration list --db-url $DbUrl 2>&1
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = $previous

  if ($exitCode -ne 0) {
    throw "supabase migration list failed:`n$($output -join "`n")"
  }

  $localOnly = @()
  $remoteOnly = @()

  foreach ($line in $output) {
    if ($line -notmatch "\|") { continue }

    $columns = $line -split "\|" | ForEach-Object { $_.Trim() }
    if ($columns.Count -lt 2) { continue }

    $localVersion = $columns[0]
    $remoteVersion = $columns[1]

    if ($localVersion -match "^\d{14}$" -and [string]::IsNullOrWhiteSpace($remoteVersion)) {
      $localOnly += $localVersion
    }
    elseif ($remoteVersion -match "^\d{14}$" -and [string]::IsNullOrWhiteSpace($localVersion)) {
      $remoteOnly += $remoteVersion
    }
  }

  return [pscustomobject]@{
    LocalOnly  = $localOnly
    RemoteOnly = $remoteOnly
  }
}

# Diffs the remote schema against the local database. Returns the drift SQL file
# path when the remote has changes local does not (typically dashboard edits).
function Get-SchemaDrift {
  param(
    [Parameter(Mandatory = $true)][string]$TargetName,
    [Parameter(Mandatory = $true)][string]$DbUrl
  )

  $targetDir = Join-Path $reportDir $TargetName
  if (-not (Test-Path -LiteralPath $targetDir)) {
    New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
  }

  $driftFile = Join-Path $targetDir "remote-to-local.sql"
  $logFile = Join-Path $targetDir "diff.log"

  # Keep stderr out of the .sql file - the CLI writes progress and upgrade
  # notices there, and merging them would corrupt the diff.
  $previous = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  & supabase db diff --from $DbUrl --to local --schema public 1> $driftFile 2> $logFile
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = $previous

  if ($exitCode -ne 0) {
    throw "supabase db diff failed for $TargetName. See $logFile"
  }

  $sqlLines = @()
  if (Test-Path -LiteralPath $driftFile) {
    $sqlLines = @(Get-Content -LiteralPath $driftFile | Where-Object {
      $trimmed = $_.Trim()
      if (-not $trimmed) { return $false }
      if ($trimmed.StartsWith("--")) { return $false }
      # Diff preamble, not schema.
      if ($trimmed -eq "SET check_function_bodies = false;") { return $false }
      # `ensure_rls` is a platform-managed event trigger that exists on hosted
      # Supabase projects but never locally. It always shows up and is not drift.
      if ($trimmed -eq "DROP EVENT TRIGGER ensure_rls;") { return $false }
      return $true
    })
  }

  if ($sqlLines.Count -eq 0) {
    return $null
  }
  return [pscustomobject]@{
    File  = $driftFile
    Lines = $sqlLines.Count
  }
}

function Write-Status {
  param(
    [string]$Label,
    [string]$State,
    [string]$Colour
  )
  Write-Host ("  {0,-11}: " -f $Label) -NoNewline
  Write-Host $State -ForegroundColor $Colour
}

Push-Location $repoRoot
try {
  Load-EnvFile -Path (Join-Path $repoRoot ".env.sync.local")
  Load-EnvFile -Path (Join-Path $repoRoot ".env.local")

  $localUp = $false
  if ($Deep) {
    $localUp = Test-LocalDbRunning
  }

  $problems = @()
  $wroteReport = $false

  foreach ($targetName in Get-Targets) {
    Write-Host "`n== $targetName ==" -ForegroundColor Cyan

    $dbUrl = Get-TargetDbUrl -TargetName $targetName
    $gap = Get-MigrationGap -DbUrl $dbUrl

    if ($gap.LocalOnly.Count -eq 0 -and $gap.RemoteOnly.Count -eq 0) {
      Write-Status -Label "migrations" -State "in sync" -Colour Green
    }
    if ($gap.LocalOnly.Count -gt 0) {
      Write-Status -Label "migrations" -State "BEHIND by $($gap.LocalOnly.Count) (not applied to $targetName)" -Colour Red
      $gap.LocalOnly | ForEach-Object { Write-Host "               - $_" -ForegroundColor DarkGray }
      $problems += "$targetName is behind by $($gap.LocalOnly.Count) migration(s)"
    }
    if ($gap.RemoteOnly.Count -gt 0) {
      Write-Status -Label "migrations" -State "AHEAD by $($gap.RemoteOnly.Count) (applied remotely, no local file)" -Colour Red
      $gap.RemoteOnly | ForEach-Object { Write-Host "               - $_" -ForegroundColor DarkGray }
      $problems += "$targetName has $($gap.RemoteOnly.Count) migration(s) with no local file"
    }

    if (-not $Deep) {
      Write-Status -Label "schema" -State "not checked (pass -Deep)" -Colour DarkGray
      continue
    }
    if (-not $localUp) {
      Write-Status -Label "schema" -State "SKIPPED (local Supabase not running - run pnpm db:start)" -Colour Yellow
      continue
    }

    $drift = Get-SchemaDrift -TargetName $targetName -DbUrl $dbUrl
    $wroteReport = $true
    if ($null -eq $drift) {
      Write-Status -Label "schema" -State "clean" -Colour Green
    }
    else {
      Write-Status -Label "schema" -State "DRIFT ($($drift.Lines) lines of SQL)" -Colour Red
      Write-Host "               $($drift.File)" -ForegroundColor DarkGray
      $problems += "$targetName schema differs from local (likely a dashboard edit)"
    }
  }

  Write-Host ""
  if ($problems.Count -eq 0) {
    Write-Host "All checked databases are in sync." -ForegroundColor Green
    if ($wroteReport -and -not $KeepReport -and (Test-Path -LiteralPath $reportDir)) {
      Remove-Item -LiteralPath $reportDir -Recurse -Force
    }
    exit 0
  }

  Write-Host "Out of sync:" -ForegroundColor Red
  $problems | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
  Write-Host "`nFixes:" -ForegroundColor Yellow
  Write-Host "  behind          -> pnpm db:remote:push:dev  /  pnpm db:remote:push:prod" -ForegroundColor Yellow
  Write-Host "  ahead or drift  -> pnpm db:pull, review the generated migration, commit it" -ForegroundColor Yellow
  exit 1
}
finally {
  Pop-Location
}
