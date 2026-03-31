param(
  [Parameter(Mandatory = $true)][string]$BackupRoot,
  [string]$WorkspaceTargetPath = (Join-Path ([Environment]::GetFolderPath("Desktop")) "restored-workspace"),
  [switch]$RestoreCaches,
  [switch]$RestoreWebsiteState,
  [switch]$StartSupabase,
  [switch]$RestoreDb,
  [string]$DbContainerName,
  [string]$DbUser = "postgres",
  [string]$DbName = "postgres",
  [string]$DbPassword
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
if ($PSVersionTable.PSVersion.Major -ge 7) {
  $PSNativeCommandUseErrorActionPreference = $false
}

function New-Dir {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) {
    New-Item -ItemType Directory -Path $Path -Force | Out-Null
  }
}

function Copy-Directory {
  param(
    [Parameter(Mandatory = $true)][string]$Source,
    [Parameter(Mandatory = $true)][string]$Destination
  )
  if (-not (Test-Path -LiteralPath $Source)) {
    return $false
  }
  New-Dir -Path $Destination
  $null = robocopy $Source $Destination /E /R:2 /W:2 /NFL /NDL /NJH /NJS /NP
  if ($LASTEXITCODE -ge 8) {
    throw "robocopy failed ($LASTEXITCODE) while copying '$Source' to '$Destination'."
  }
  return $true
}

function Copy-FileSafe {
  param(
    [Parameter(Mandatory = $true)][string]$Source,
    [Parameter(Mandatory = $true)][string]$Destination
  )
  if (-not (Test-Path -LiteralPath $Source)) {
    return $false
  }
  New-Dir -Path (Split-Path -Parent $Destination)
  Copy-Item -LiteralPath $Source -Destination $Destination -Force
  return $true
}

function Command-Exists {
  param([Parameter(Mandatory = $true)][string]$Name)
  return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

$backupRootResolved = Resolve-Path $BackupRoot
$backupDir = Join-Path $backupRootResolved "backup"
$manifestPath = Join-Path $backupRootResolved "manifest.json"

if (-not (Test-Path -LiteralPath $backupDir)) {
  throw "Backup folder is missing expected 'backup' directory: $backupDir"
}

$manifest = $null
if (Test-Path -LiteralPath $manifestPath) {
  $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
}

Write-Host "Restoring from: $backupRootResolved" -ForegroundColor Cyan

# Workspace
$workspaceSource = Join-Path $backupDir "workspace"
if (Copy-Directory -Source $workspaceSource -Destination $WorkspaceTargetPath) {
  Write-Host "Workspace restored to: $WorkspaceTargetPath"
}

# Cursor settings
$cursorUserSource = Join-Path $backupDir "cursor-user"
$cursorUserTarget = Join-Path $env:APPDATA "Cursor\User"
if (Copy-Directory -Source $cursorUserSource -Destination $cursorUserTarget) {
  Write-Host "Cursor settings restored to: $cursorUserTarget"
}

# PowerShell profile
$shellSource = Join-Path $backupDir "shell"
if (Test-Path -LiteralPath $shellSource) {
  $profileCandidates = Get-ChildItem -LiteralPath $shellSource -File -ErrorAction SilentlyContinue
  foreach ($profileFile in $profileCandidates) {
    $targetProfilePath = Join-Path (Split-Path -Parent $PROFILE.CurrentUserCurrentHost) $profileFile.Name
    $null = Copy-FileSafe -Source $profileFile.FullName -Destination $targetProfilePath
    Write-Host "PowerShell profile restored: $targetProfilePath"
  }
}

# Windows Terminal
$terminalSource = Join-Path $backupDir "terminal"
if (Test-Path -LiteralPath $terminalSource) {
  $terminalFiles = Get-ChildItem -LiteralPath $terminalSource -File -ErrorAction SilentlyContinue
  foreach ($file in $terminalFiles) {
    if ($file.Name -like "*Microsoft.WindowsTerminal*") {
      $target = Join-Path $env:LOCALAPPDATA "Packages\Microsoft.WindowsTerminal_8wekyb3d8bbwe\LocalState\settings.json"
      $null = Copy-FileSafe -Source $file.FullName -Destination $target
      Write-Host "Windows Terminal settings restored: $target"
    }
    if ($file.Name -like "*Microsoft.WindowsTerminalPreview*") {
      $target = Join-Path $env:LOCALAPPDATA "Packages\Microsoft.WindowsTerminalPreview_8wekyb3d8bbwe\LocalState\settings.json"
      $null = Copy-FileSafe -Source $file.FullName -Destination $target
      Write-Host "Windows Terminal Preview settings restored: $target"
    }
  }
}

if ($RestoreCaches) {
  $cacheSource = Join-Path $backupDir "caches"
  if (Test-Path -LiteralPath $cacheSource) {
    $cacheRestoreRoot = Join-Path $env:USERPROFILE "restored-caches"
    $null = Copy-Directory -Source $cacheSource -Destination $cacheRestoreRoot
    Write-Host "Caches restored into staging folder: $cacheRestoreRoot"
  }
}

if ($RestoreWebsiteState) {
  $websiteStateSource = Join-Path $backupDir "website-state"
  if (Test-Path -LiteralPath $websiteStateSource) {
    $websiteStateTarget = Join-Path $WorkspaceTargetPath "_restored-website-state"
    $null = Copy-Directory -Source $websiteStateSource -Destination $websiteStateTarget
    Write-Host "Website runtime state restored into: $websiteStateTarget"
    Write-Host "Review runtime-bind-mappings.json and remap bind mounts if host paths changed."
  }
}

if ($StartSupabase) {
  if (-not (Command-Exists -Name "npx")) {
    throw "npx not found; cannot start local Supabase."
  }
  if (-not (Test-Path -LiteralPath (Join-Path $WorkspaceTargetPath "package.json"))) {
    throw "Workspace target does not look like repo root: $WorkspaceTargetPath"
  }
  Push-Location $WorkspaceTargetPath
  try {
    $null = npx supabase start
    if ($LASTEXITCODE -ne 0) {
      throw "Failed to start Supabase local stack."
    }
    Write-Host "Supabase local stack started."
  } finally {
    Pop-Location
  }
}

if ($RestoreDb) {
  if (-not (Command-Exists -Name "docker")) {
    throw "docker not found; cannot restore database."
  }

  $dumpCandidates = @(
    (Join-Path $backupDir "db-dump\schema.sql"),
    (Join-Path $backupDir "db-dump\data.sql"),
    (Join-Path $backupDir "db-dump\postgres.sql")
  )
  $availableDumps = @($dumpCandidates | Where-Object { Test-Path -LiteralPath $_ })
  if ($availableDumps.Count -eq 0) {
    throw "No database dump files were found in '$backupDir\db-dump'."
  }

  $containerToUse = $DbContainerName
  if ([string]::IsNullOrWhiteSpace($containerToUse) -and $manifest -and $manifest.docker -and $manifest.docker.dbDump) {
    $containerToUse = [string]$manifest.docker.dbDump.dbContainer
  }
  if ([string]::IsNullOrWhiteSpace($containerToUse)) {
    $guess = docker ps --format "{{.Names}}|{{.Image}}" |
      Where-Object { $_ -match "supabase.*db|postgres|_db_" } |
      Select-Object -First 1
    if ($guess) {
      $containerToUse = $guess.Split("|")[0]
    }
  }
  if ([string]::IsNullOrWhiteSpace($containerToUse)) {
    throw "Could not determine DB container name. Pass -DbContainerName."
  }

  if ($manifest -and $manifest.docker -and $manifest.docker.dbDump -and $manifest.docker.dbDump.metadata) {
    if ($manifest.docker.dbDump.metadata.dbUser) {
      $DbUser = [string]$manifest.docker.dbDump.metadata.dbUser
    }
    if ($manifest.docker.dbDump.metadata.dbName) {
      $DbName = [string]$manifest.docker.dbDump.metadata.dbName
    }
  }

  foreach ($dumpFile in $availableDumps) {
    $remoteDumpPath = "/tmp/restore-$([IO.Path]::GetFileName($dumpFile))"
    $null = docker cp $dumpFile "${containerToUse}:$remoteDumpPath"
    if ($LASTEXITCODE -ne 0) {
      throw "Failed to copy SQL dump into container '$containerToUse': $dumpFile"
    }

    if ([string]::IsNullOrWhiteSpace($DbPassword)) {
      $null = docker exec $containerToUse psql -U $DbUser -d $DbName -f $remoteDumpPath
    } else {
      $null = docker exec -e "PGPASSWORD=$DbPassword" $containerToUse psql -U $DbUser -d $DbName -f $remoteDumpPath
    }
    if ($LASTEXITCODE -ne 0) {
      throw "Database restore failed for dump '$dumpFile' in container '$containerToUse'."
    }
  }

  Write-Host "Database restored into '$containerToUse' ($DbName)."
}

Write-Host "`nRestore completed." -ForegroundColor Green
