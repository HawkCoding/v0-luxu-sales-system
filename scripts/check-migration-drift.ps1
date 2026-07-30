param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("development", "production")]
  [string]$Target
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
if ($PSVersionTable.PSVersion.Major -ge 7) {
  $PSNativeCommandUseErrorActionPreference = $false
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
. (Join-Path $PSScriptRoot "lib/supabase-sync-common.ps1")

Push-Location $repoRoot
try {
  Load-EnvFile -Path (Join-Path $repoRoot ".env.sync.local")
  Load-EnvFile -Path (Join-Path $repoRoot ".env.local")

  $dbUrl = Get-TargetDbUrl -TargetName $Target

  Write-Host "Checking $Target migration drift..." -ForegroundColor Cyan

  $output = & supabase migration list --db-url $dbUrl 2>&1
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) {
    Write-Host ($output -join "`n")
    throw "supabase migration list failed with exit code $exitCode"
  }

  # Table rows look like: "   20260308095136 | 20260308095136 | 2026-03-08 09:51:36"
  # A row is local-only (not yet pushed to $Target) when Local is a 14-digit
  # timestamp and Remote is blank.
  $missing = @()
  foreach ($line in $output) {
    if ($line -notmatch "\|") {
      continue
    }

    $columns = $line -split "\|" | ForEach-Object { $_.Trim() }
    if ($columns.Count -lt 2) {
      continue
    }

    $localVersion = $columns[0]
    $remoteVersion = $columns[1]

    if ($localVersion -notmatch "^\d{14}$") {
      continue
    }

    if ([string]::IsNullOrWhiteSpace($remoteVersion)) {
      $missing += $localVersion
    }
  }

  if ($missing.Count -gt 0) {
    Write-Host "`n$Target is behind by $($missing.Count) migration(s):" -ForegroundColor Red
    $missing | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    $pushCommand = if ($Target -eq "production") { "pnpm db:remote:push:prod" } else { "pnpm db:remote:push:dev" }
    Write-Host "`nRun ``$pushCommand`` to apply them." -ForegroundColor Yellow
    exit 1
  }

  Write-Host "$Target is in sync with local migrations." -ForegroundColor Green
} finally {
  Pop-Location
}
