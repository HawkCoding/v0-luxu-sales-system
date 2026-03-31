param(
  [string]$OutputBasePath = (Join-Path ([Environment]::GetFolderPath("Desktop")) "Cursor-Migrations"),
  [switch]$IncludeDockerImages,
  [switch]$IncludeVolumeSnapshots,
  [switch]$SkipCaches,
  [switch]$SkipDbDump
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
if ($PSVersionTable.PSVersion.Major -ge 7) {
  $PSNativeCommandUseErrorActionPreference = $false
}

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

  $destParent = Split-Path -Parent $Destination
  New-Dir -Path $destParent
  Copy-Item -LiteralPath $Source -Destination $Destination -Force
  return $true
}

function Command-Exists {
  param([Parameter(Mandatory = $true)][string]$Name)
  return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Parse-SupabaseEnvLines {
  param([string[]]$Lines)
  $map = @{}
  foreach ($line in $Lines) {
    if ([string]::IsNullOrWhiteSpace($line)) {
      continue
    }
    if ($line -notmatch "=") {
      continue
    }
    $parts = $line.Split("=", 2)
    if ($parts.Count -ne 2) {
      continue
    }
    $key = $parts[0].Trim()
    $value = $parts[1].Trim()
    if ([string]::IsNullOrWhiteSpace($key)) {
      continue
    }
    $map[$key] = $value
  }
  return $map
}

function Get-DirectorySizeBytes {
  param([Parameter(Mandatory = $true)][string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) {
    return 0L
  }
  $measure = Get-ChildItem -LiteralPath $Path -Recurse -Force -File -ErrorAction SilentlyContinue |
    Measure-Object -Property Length -Sum
  if ($null -eq $measure.Sum) {
    return 0L
  }
  return [int64]$measure.Sum
}

function Save-VolumeSnapshot {
  param(
    [Parameter(Mandatory = $true)][string]$VolumeName,
    [Parameter(Mandatory = $true)][string]$DestinationFile
  )
  $safe = $VolumeName -replace "[^a-zA-Z0-9\-_\.]", "_"
  $tmpName = "$safe.tmp.tgz"
  $destinationDir = Split-Path -Parent $DestinationFile
  $tmpDestination = Join-Path $destinationDir $tmpName

  if (Test-Path -LiteralPath $tmpDestination) {
    Remove-Item -LiteralPath $tmpDestination -Force
  }

  $mountTo = ($destinationDir -replace "\\", "/")
  $null = docker run --rm -v "${VolumeName}:/from:ro" -v "${mountTo}:/to" alpine sh -c "cd /from && tar -czf /to/$tmpName ."
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to snapshot docker volume '$VolumeName'."
  }

  Move-Item -LiteralPath $tmpDestination -Destination $DestinationFile -Force
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupRoot = Join-Path $OutputBasePath "Cursor-Migration-$timestamp"
$backupDir = Join-Path $backupRoot "backup"
$manifestPath = Join-Path $backupRoot "manifest.json"
$manifestTextPath = Join-Path $backupRoot "manifest-summary.txt"

New-Dir -Path $backupRoot
New-Dir -Path $backupDir

$manifest = [ordered]@{
  createdAt = (Get-Date).ToString("o")
  machine = $env:COMPUTERNAME
  user = $env:USERNAME
  repoRoot = "$repoRoot"
  sections = [ordered]@{}
  docker = [ordered]@{
    dockerAvailable = $false
    composeAvailable = $false
    dockerVersion = $null
    composeVersion = $null
    containers = @()
    volumes = @()
    dbDump = [ordered]@{
      attempted = $false
      success = $false
      dbContainer = $null
      dumpFile = $null
      error = $null
      metadata = [ordered]@{
        dbUser = $null
        dbName = $null
        source = $null
      }
    }
    volumeSnapshots = @()
    imageExports = @()
  }
}

Write-Section "Creating backup package"
Write-Host "Output: $backupRoot"

Write-Section "Copying workspace"
$workspaceDest = Join-Path $backupDir "workspace"
$workspaceCopied = Copy-Directory -Source "$repoRoot" -Destination $workspaceDest
$manifest.sections.workspace = [ordered]@{
  source = "$repoRoot"
  destination = $workspaceDest
  copied = $workspaceCopied
}

Write-Section "Copying Cursor and local tool settings"
$cursorUserSource = Join-Path $env:APPDATA "Cursor\User"
$cursorUserDest = Join-Path $backupDir "cursor-user"
$manifest.sections.cursorUser = [ordered]@{
  source = $cursorUserSource
  destination = $cursorUserDest
  copied = (Copy-Directory -Source $cursorUserSource -Destination $cursorUserDest)
}

$shellDest = Join-Path $backupDir "shell"
New-Dir -Path $shellDest
$profilePaths = @(
  $PROFILE.CurrentUserCurrentHost,
  $PROFILE.CurrentUserAllHosts
) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Unique

$copiedProfiles = @()
foreach ($profilePath in $profilePaths) {
  $fileName = [IO.Path]::GetFileName($profilePath)
  if ([string]::IsNullOrWhiteSpace($fileName)) {
    $fileName = "Microsoft.PowerShell_profile.ps1"
  }
  $destination = Join-Path $shellDest $fileName
  if (Copy-FileSafe -Source $profilePath -Destination $destination) {
    $copiedProfiles += [ordered]@{ source = $profilePath; destination = $destination }
  }
}
$manifest.sections.powershellProfiles = [ordered]@{
  copied = $copiedProfiles
}

$terminalDest = Join-Path $backupDir "terminal"
New-Dir -Path $terminalDest
$terminalCandidates = @(
  (Join-Path $env:LOCALAPPDATA "Packages\Microsoft.WindowsTerminal_8wekyb3d8bbwe\LocalState\settings.json"),
  (Join-Path $env:LOCALAPPDATA "Packages\Microsoft.WindowsTerminalPreview_8wekyb3d8bbwe\LocalState\settings.json")
)
$copiedTerminal = @()
foreach ($candidate in $terminalCandidates) {
  $leaf = Split-Path -Leaf (Split-Path -Parent $candidate)
  $destination = Join-Path $terminalDest "$leaf-settings.json"
  if (Copy-FileSafe -Source $candidate -Destination $destination) {
    $copiedTerminal += [ordered]@{ source = $candidate; destination = $destination }
  }
}
$manifest.sections.windowsTerminal = [ordered]@{
  copied = $copiedTerminal
}

if (-not $SkipCaches) {
  Write-Section "Copying caches and local machine state"
  $cacheDest = Join-Path $backupDir "caches"
  New-Dir -Path $cacheDest
  $cacheSources = @(
    (Join-Path $env:APPDATA "Cursor\Cache"),
    (Join-Path $env:APPDATA "Cursor\CachedData"),
    (Join-Path $env:APPDATA "Cursor\GPUCache"),
    (Join-Path $env:USERPROFILE ".cursor"),
    (Join-Path $env:USERPROFILE ".pnpm-store"),
    (Join-Path $env:USERPROFILE ".npm")
  )
  $cacheResults = @()
  foreach ($source in $cacheSources) {
    $folderName = ($source -replace "[:\\]", "_").Trim("_")
    $destination = Join-Path $cacheDest $folderName
    $copied = Copy-Directory -Source $source -Destination $destination
    $cacheResults += [ordered]@{
      source = $source
      destination = $destination
      copied = $copied
    }
  }
  $manifest.sections.caches = $cacheResults
}

Write-Section "Discovering compose files"
$composePatterns = @("docker-compose*.yml", "docker-compose*.yaml", "compose.yml", "compose.yaml")
$composeFiles = @()
foreach ($pattern in $composePatterns) {
  $composeFiles += Get-ChildItem -Path $repoRoot -Recurse -File -Filter $pattern -ErrorAction SilentlyContinue
}
$composeFiles = $composeFiles | Sort-Object FullName -Unique
$manifest.sections.composeFiles = $composeFiles | ForEach-Object { $_.FullName }

Write-Section "Collecting docker context"
if (Command-Exists -Name "docker") {
  $manifest.docker.dockerAvailable = $true
  $dockerVersion = (docker --version) 2>$null
  $manifest.docker.dockerVersion = $dockerVersion

  $composeVersion = (docker compose version) 2>$null
  if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($composeVersion)) {
    $manifest.docker.composeAvailable = $true
    $manifest.docker.composeVersion = $composeVersion
  }

  $dockerStateDir = Join-Path $backupDir "docker-state"
  New-Dir -Path $dockerStateDir

  $containersRaw = docker ps -a --format "{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}"
  $containers = @()
  foreach ($line in $containersRaw) {
    if ([string]::IsNullOrWhiteSpace($line)) {
      continue
    }
    $parts = $line.Split("|")
    if ($parts.Count -lt 4) {
      continue
    }
    $containers += [ordered]@{
      id = $parts[0]
      name = $parts[1]
      image = $parts[2]
      status = $parts[3]
    }
  }
  $manifest.docker.containers = $containers
  $containers | ConvertTo-Json -Depth 8 | Out-File -LiteralPath (Join-Path $dockerStateDir "containers.json") -Encoding utf8

  $volumesRaw = docker volume ls --format "{{.Name}}"
  $volumes = @($volumesRaw | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Sort-Object -Unique)
  $manifest.docker.volumes = $volumes
  $volumes | Out-File -LiteralPath (Join-Path $dockerStateDir "volumes.txt") -Encoding utf8

  $supabaseEnv = @{}
  if (Command-Exists -Name "npx") {
    $supabaseStatus = cmd /c "npx supabase status -o env 2>nul"
    if ($LASTEXITCODE -eq 0) {
      $supabaseEnv = Parse-SupabaseEnvLines -Lines $supabaseStatus
      $supabaseStatus | Out-File -LiteralPath (Join-Path $dockerStateDir "supabase-status-env.txt") -Encoding utf8
    }
  }

  $manifest.docker.dbDump.attempted = -not $SkipDbDump
  if (-not $SkipDbDump) {
    Write-Section "Creating database dump"
    $dbDumpDir = Join-Path $backupDir "db-dump"
    New-Dir -Path $dbDumpDir
    $dbDumpFile = Join-Path $dbDumpDir "postgres.sql"
    $schemaDumpFile = Join-Path $dbDumpDir "schema.sql"
    $dataDumpFile = Join-Path $dbDumpDir "data.sql"

    $dbContainer = $null
    $priorityContainers = $containers | Where-Object {
      $_.name -match "supabase.*db|postgres|_db_" -or $_.image -match "postgres"
    }
    if ($priorityContainers.Count -gt 0) {
      $dbContainer = $priorityContainers[0].name
    }

    $dbUser = "postgres"
    $dbName = "postgres"
    $dbPassword = $null
    $dbSource = "defaults"

    if ($supabaseEnv.ContainsKey("POSTGRES_USER")) {
      $dbUser = $supabaseEnv["POSTGRES_USER"]
      $dbSource = "supabase status"
    }
    if ($supabaseEnv.ContainsKey("POSTGRES_DB")) {
      $dbName = $supabaseEnv["POSTGRES_DB"]
      $dbSource = "supabase status"
    }
    if ($supabaseEnv.ContainsKey("POSTGRES_PASSWORD")) {
      $dbPassword = $supabaseEnv["POSTGRES_PASSWORD"]
      $dbSource = "supabase status"
    }

    $supabaseDumpSucceeded = $false
    if (Command-Exists -Name "npx") {
      Push-Location $repoRoot
      try {
        $null = npx supabase db dump --local -f $schemaDumpFile
        $schemaDumpOk = ($LASTEXITCODE -eq 0 -and (Test-Path -LiteralPath $schemaDumpFile))
        $null = npx supabase db dump --local --data-only -f $dataDumpFile
        $dataDumpOk = ($LASTEXITCODE -eq 0 -and (Test-Path -LiteralPath $dataDumpFile))
        if ($schemaDumpOk -and $dataDumpOk) {
          $supabaseDumpSucceeded = $true
          $manifest.docker.dbDump.success = $true
          $manifest.docker.dbDump.dbContainer = $dbContainer
          $manifest.docker.dbDump.dumpFile = $schemaDumpFile
          $manifest.docker.dbDump.metadata.dbUser = "postgres"
          $manifest.docker.dbDump.metadata.dbName = "postgres"
          $manifest.docker.dbDump.metadata.source = "supabase-cli"
        }
      } catch {
        $manifest.docker.dbDump.error = $_.Exception.Message
      } finally {
        Pop-Location
      }
    }

    if ($dbContainer -and -not $supabaseDumpSucceeded) {
      try {
        $candidateUsers = @()
        if ($supabaseEnv.ContainsKey("POSTGRES_USER")) {
          $candidateUsers += [string]$supabaseEnv["POSTGRES_USER"]
        }
        $candidateUsers += @("postgres", "supabase_admin", "supabase")
        $candidateUsers = $candidateUsers | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Unique

        $candidateDbNames = @()
        if ($supabaseEnv.ContainsKey("POSTGRES_DB")) {
          $candidateDbNames += [string]$supabaseEnv["POSTGRES_DB"]
        }
        $candidateDbNames += @("postgres")
        $candidateDbNames = $candidateDbNames | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Unique

        $errorFile = Join-Path $dbDumpDir "db-dump-error.log"
        $dumpSuccess = $false
        $lastDumpError = $null

        foreach ($candidateUser in $candidateUsers) {
          foreach ($candidateDbName in $candidateDbNames) {
            if (Test-Path -LiteralPath $dbDumpFile) {
              Remove-Item -LiteralPath $dbDumpFile -Force
            }

            if ($dbPassword) {
              $null = docker exec -e "PGPASSWORD=$dbPassword" $dbContainer pg_dump -U $candidateUser -d $candidateDbName --no-owner --no-privileges --format=plain 1> $dbDumpFile 2> $errorFile
            } else {
              $null = docker exec $dbContainer pg_dump -U $candidateUser -d $candidateDbName --no-owner --no-privileges --format=plain 1> $dbDumpFile 2> $errorFile
            }

            if ($LASTEXITCODE -eq 0 -and (Test-Path -LiteralPath $dbDumpFile) -and (Get-Item -LiteralPath $dbDumpFile).Length -gt 0) {
              $dbUser = $candidateUser
              $dbName = $candidateDbName
              $dumpSuccess = $true
              break
            }

            if (Test-Path -LiteralPath $errorFile) {
              $lastDumpError = (Get-Content -LiteralPath $errorFile -Raw)
            }
          }

          if ($dumpSuccess) {
            break
          }
        }

        if (-not $dumpSuccess) {
          throw "Failed all db dump attempts for container '$dbContainer'. Last error: $lastDumpError"
        }

        $manifest.docker.dbDump.success = $true
        $manifest.docker.dbDump.dbContainer = $dbContainer
        $manifest.docker.dbDump.dumpFile = $dbDumpFile
        $manifest.docker.dbDump.metadata.dbUser = $dbUser
        $manifest.docker.dbDump.metadata.dbName = $dbName
        $manifest.docker.dbDump.metadata.source = $dbSource
      } catch {
        $manifest.docker.dbDump.error = $_.Exception.Message
      }
    } elseif (-not $supabaseDumpSucceeded) {
      $manifest.docker.dbDump.error = "No running postgres-like container was discovered."
    }
  }

  Write-Section "Capturing runtime mount metadata"
  $websiteStateDir = Join-Path $backupDir "website-state"
  New-Dir -Path $websiteStateDir
  $runtimeMappings = @()

  foreach ($container in $containers) {
    try {
      $inspect = docker inspect $container.name | ConvertFrom-Json
      if (-not $inspect -or $inspect.Count -lt 1) {
        continue
      }
      foreach ($mount in $inspect[0].Mounts) {
        if ($mount.Type -ne "bind") {
          continue
        }
        $sourcePath = [string]$mount.Source
        if ([string]::IsNullOrWhiteSpace($sourcePath)) {
          continue
        }
        if (-not (Test-Path -LiteralPath $sourcePath)) {
          continue
        }
        $containerFolder = ($container.name -replace "[^a-zA-Z0-9\-_\.]", "_")
        $mountFolder = ($mount.Destination -replace "[^a-zA-Z0-9\-_\.]", "_")
        $destination = Join-Path (Join-Path $websiteStateDir $containerFolder) $mountFolder
        $copied = Copy-Directory -Source $sourcePath -Destination $destination
        $runtimeMappings += [ordered]@{
          container = $container.name
          source = $sourcePath
          destination = [string]$mount.Destination
          backupPath = $destination
          copied = $copied
        }
      }
    } catch {
      # Best-effort metadata collection.
      continue
    }
  }
  $runtimeMappings | ConvertTo-Json -Depth 10 | Out-File -LiteralPath (Join-Path $websiteStateDir "runtime-bind-mappings.json") -Encoding utf8
  $manifest.sections.websiteState = $runtimeMappings

  if ($IncludeVolumeSnapshots) {
    Write-Section "Creating docker volume snapshots"
    $volumeSnapshotDir = Join-Path $backupDir "docker-state\volume-snapshots"
    New-Dir -Path $volumeSnapshotDir
    foreach ($volumeName in $volumes) {
      $safeVolume = ($volumeName -replace "[^a-zA-Z0-9\-_\.]", "_")
      $snapshotFile = Join-Path $volumeSnapshotDir "$safeVolume.tgz"
      try {
        Save-VolumeSnapshot -VolumeName $volumeName -DestinationFile $snapshotFile
        $manifest.docker.volumeSnapshots += [ordered]@{
          volume = $volumeName
          file = $snapshotFile
          success = $true
        }
      } catch {
        $manifest.docker.volumeSnapshots += [ordered]@{
          volume = $volumeName
          file = $snapshotFile
          success = $false
          error = $_.Exception.Message
        }
      }
    }
  }

  if ($IncludeDockerImages) {
    Write-Section "Exporting docker images"
    $imageDir = Join-Path $backupDir "docker-images"
    New-Dir -Path $imageDir
    $imageNames = docker images --format "{{.Repository}}:{{.Tag}}" |
      Where-Object { $_ -ne "<none>:<none>" } |
      Sort-Object -Unique

    foreach ($imageName in $imageNames) {
      $safeImageName = ($imageName -replace "[^a-zA-Z0-9\-_\.]", "_")
      $imageTar = Join-Path $imageDir "$safeImageName.tar"
      try {
        $null = docker image save -o $imageTar $imageName
        if ($LASTEXITCODE -ne 0) {
          throw "docker image save exited with code $LASTEXITCODE."
        }
        $manifest.docker.imageExports += [ordered]@{
          image = $imageName
          file = $imageTar
          success = $true
        }
      } catch {
        $manifest.docker.imageExports += [ordered]@{
          image = $imageName
          file = $imageTar
          success = $false
          error = $_.Exception.Message
        }
      }
    }
  }
}

$manifest.finishedAt = (Get-Date).ToString("o")
$manifest.totalBytes = Get-DirectorySizeBytes -Path $backupRoot

$manifest | ConvertTo-Json -Depth 15 | Out-File -LiteralPath $manifestPath -Encoding utf8

$summary = @(
  "Backup completed",
  "Path: $backupRoot",
  "Total size (bytes): $($manifest.totalBytes)",
  "Docker available: $($manifest.docker.dockerAvailable)",
  "DB dump success: $($manifest.docker.dbDump.success)",
  "Manifest: $manifestPath"
)
$summary | Out-File -LiteralPath $manifestTextPath -Encoding utf8
$summary | ForEach-Object { Write-Host $_ }
