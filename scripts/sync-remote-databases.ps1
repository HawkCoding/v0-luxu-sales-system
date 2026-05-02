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

function Get-RequiredEnv {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$TargetName
  )

  $value = [Environment]::GetEnvironmentVariable($Name, "Process")
  if ([string]::IsNullOrWhiteSpace($value)) {
    throw "Missing $Name for $TargetName. Set it in your shell or in .env.sync.local. Use the Supabase direct Postgres connection string, percent-encoded if needed."
  }
  return $value
}

function Invoke-Checked {
  param(
    [Parameter(Mandatory = $true)][string[]]$Command,
    [string]$OutputPath
  )

  $displayCommand = ($Command | ForEach-Object {
    if ($_ -like "postgresql://*" -or $_ -like "postgres://*") {
      "<db-url-redacted>"
    } else {
      $_
    }
  }) -join " "

  Write-Host $displayCommand -ForegroundColor DarkGray

  $executable = $Command[0]
  $arguments = @()
  if ($Command.Count -gt 1) {
    $arguments = $Command[1..($Command.Count - 1)]
  }

  if ($OutputPath) {
    & $executable @arguments *> $OutputPath
  } else {
    & $executable @arguments
  }

  if ($LASTEXITCODE -ne 0) {
    throw "Command failed with exit code $LASTEXITCODE`: $displayCommand"
  }
}

function Get-Targets {
  switch ($Target) {
    "development" { return @("development") }
    "production" { return @("production") }
    default { return @("development", "production") }
  }
}

function Get-DbUrlEnvName {
  param([string]$TargetName)
  if ($TargetName -eq "production") {
    return "SUPABASE_PROD_DB_URL"
  }
  return "SUPABASE_DEV_DB_URL"
}

function Compare-Target {
  param(
    [Parameter(Mandatory = $true)][string]$TargetName,
    [Parameter(Mandatory = $true)][string]$DbUrl
  )

  $targetReportDir = Join-Path $reportDir $TargetName
  New-Dir -Path $targetReportDir

  Write-Section "Comparing local to $TargetName"

  Invoke-Checked -Command @("npx", "supabase", "migration", "list", "--local") -OutputPath (Join-Path $targetReportDir "local-migrations.txt")
  Invoke-Checked -Command @("npx", "supabase", "migration", "list", "--db-url", $DbUrl) -OutputPath (Join-Path $targetReportDir "remote-migrations.txt")

  Invoke-Checked -Command @("npx", "supabase", "db", "dump", "--local", "--schema", "public", "--file", (Join-Path $targetReportDir "local-schema.sql"))
  Invoke-Checked -Command @("npx", "supabase", "db", "dump", "--db-url", $DbUrl, "--schema", "public", "--file", (Join-Path $targetReportDir "remote-schema.sql"))

  if (-not $SkipDiff) {
    Invoke-Checked -Command @("npx", "supabase", "db", "diff", "--from", $DbUrl, "--to", "local", "--schema", "public", "--output", (Join-Path $targetReportDir "remote-to-local-schema-diff.sql"))
  }

  Invoke-Checked -Command @("npx", "supabase", "db", "push", "--db-url", $DbUrl, "--dry-run") -OutputPath (Join-Path $targetReportDir "push-dry-run.txt")

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

  $command = @("npx", "supabase", "db", "push", "--db-url", $DbUrl, "--yes")
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
    $envName = Get-DbUrlEnvName -TargetName $targetName
    $dbUrl = Get-RequiredEnv -Name $envName -TargetName $targetName

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
