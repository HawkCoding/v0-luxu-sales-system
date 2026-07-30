Set-StrictMode -Version Latest

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

function Get-TargetDbUrl {
  param([Parameter(Mandatory = $true)][string]$TargetName)

  $prefix = if ($TargetName -eq "production") { "SUPABASE_PROD" } else { "SUPABASE_DEV" }
  $url = Get-OptionalEnv -Name "$prefix`_DB_URL"
  if (-not [string]::IsNullOrWhiteSpace($url)) {
    return $url
  }

  $projectRef = Get-OptionalEnv -Name "$prefix`_PROJECT_REF"
  $password = Get-OptionalEnv -Name "$prefix`_DB_PASSWORD"
  if (-not [string]::IsNullOrWhiteSpace($projectRef) -and -not [string]::IsNullOrWhiteSpace($password)) {
    $poolerHost = Get-OptionalEnv -Name "$prefix`_POOLER_HOST"
    if ([string]::IsNullOrWhiteSpace($poolerHost)) {
      return New-SupabasePoolerDbUrl -ProjectRef $projectRef -Password $password
    }

    return New-SupabasePoolerDbUrl -ProjectRef $projectRef -Password $password -PoolerHost $poolerHost
  }

  throw "Missing database connection details for $TargetName. Set $prefix`_DB_URL, or set $prefix`_PROJECT_REF plus $prefix`_DB_PASSWORD, in your shell or .env.sync.local. Set $prefix`_POOLER_HOST too if the project is not in the default West EU pooler."
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
    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    & $executable @arguments *> $OutputPath
    $commandExitCode = $LASTEXITCODE
    $ErrorActionPreference = $previousErrorActionPreference
  } else {
    & $executable @arguments
    $commandExitCode = $LASTEXITCODE
  }

  if ($commandExitCode -ne 0) {
    throw "Command failed with exit code $commandExitCode`: $displayCommand"
  }
}
