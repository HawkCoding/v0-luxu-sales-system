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

# Reads a property off a ConvertFrom-Json object without tripping StrictMode when
# the CLI omits it. Missing or null becomes "".
function Get-JsonField {
  param(
    $Object,
    [Parameter(Mandatory = $true)][string]$Name
  )

  if ($null -eq $Object) { return "" }
  if (-not ($Object.PSObject.Properties.Name -contains $Name)) { return "" }

  $value = $Object.$Name
  if ($null -eq $value) { return "" }
  return [string]$value
}

# Turns `supabase migration list` output into rows of local/remote version pairs.
# CLI 2.11x prints JSON ({"migrations":[{"local":"...","remote":"..."}]}); older
# builds printed a pipe-delimited table. Returns $null when neither shape is
# found - the caller must treat that as a failure, never as "in sync".
function Get-MigrationRows {
  param([Parameter(Mandatory = $true)][string[]]$Lines)

  foreach ($line in $Lines) {
    $trimmed = $line.Trim()
    if (-not ($trimmed.StartsWith("{") -or $trimmed.StartsWith("["))) { continue }

    try {
      $parsed = $trimmed | ConvertFrom-Json
    }
    catch {
      continue
    }

    if ($parsed -is [array]) {
      $parsed = $parsed | Select-Object -First 1
    }
    if ($null -eq $parsed) { continue }
    if (-not ($parsed.PSObject.Properties.Name -contains "migrations")) { continue }
    if ($null -eq $parsed.migrations) { continue }

    return @($parsed.migrations | ForEach-Object {
      [pscustomobject]@{
        Local  = Get-JsonField -Object $_ -Name "local"
        Remote = Get-JsonField -Object $_ -Name "remote"
      }
    })
  }

  $tableRows = @()
  $sawTable = $false
  foreach ($line in $Lines) {
    if ($line -notmatch "\|") { continue }

    $columns = $line -split "\|" | ForEach-Object { $_.Trim() }
    if ($columns.Count -lt 2) { continue }

    $sawTable = $true
    if ($columns[0] -match "^\d{14}$" -or $columns[1] -match "^\d{14}$") {
      $tableRows += [pscustomobject]@{ Local = $columns[0]; Remote = $columns[1] }
    }
  }
  if ($sawTable) { return $tableRows }

  return $null
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

  $lines = @($output | ForEach-Object { $_.ToString() })

  if ($exitCode -ne 0) {
    throw "supabase migration list failed:`n$($lines -join "`n")"
  }

  $rows = Get-MigrationRows -Lines $lines
  if ($null -eq $rows) {
    throw "Could not parse supabase migration list output - the CLI format has changed:`n$($lines -join "`n")"
  }

  $localOnly = @()
  $remoteOnly = @()

  foreach ($row in $rows) {
    if ($row.Local -match "^\d{14}$" -and [string]::IsNullOrWhiteSpace($row.Remote)) {
      $localOnly += $row.Local
    }
    elseif ($row.Remote -match "^\d{14}$" -and [string]::IsNullOrWhiteSpace($row.Local)) {
      $remoteOnly += $row.Remote
    }
  }

  return [pscustomobject]@{
    LocalOnly  = $localOnly
    RemoteOnly = $remoteOnly
  }
}

# CLI 2.11x wraps the diff in JSON - {"diff":"..."} on success, an {"_tag":"Error"}
# payload on failure. Older builds printed raw SQL. Returns the SQL, or $null when
# the CLI reported an error instead of a diff.
function ConvertTo-DiffSql {
  param([Parameter(Mandatory = $true)][AllowEmptyString()][string]$Raw)

  $trimmed = $Raw.Trim()
  if (-not $trimmed.StartsWith("{")) { return $Raw }

  try {
    $parsed = $trimmed | ConvertFrom-Json
  }
  catch {
    return $Raw
  }

  if ($parsed.PSObject.Properties.Name -contains "diff") {
    return [string]$parsed.diff
  }
  return $null
}

# Splits the diff into whole statements, so a 40-line function body counts as one
# change and not 40. Statement boundaries are semicolons found outside a
# dollar-quoted block - function bodies contain both blank lines and semicolons,
# so neither alone is a reliable delimiter. Comment-only blocks and known
# platform noise are dropped here.
function Split-DiffStatements {
  param([Parameter(Mandatory = $true)][AllowEmptyString()][string]$Sql)

  $statements = @()
  $current = @()
  $quoteTag = $null

  foreach ($rawLine in ($Sql -split "`r?`n")) {
    $line = $rawLine.TrimEnd()
    $trimmed = $line.Trim()

    if (-not $quoteTag) {
      if (-not $trimmed) { continue }
      if ($trimmed.StartsWith("--")) { continue }
    }

    $current += $line

    foreach ($match in [regex]::Matches($line, '\$[A-Za-z_]*\$')) {
      if (-not $quoteTag) { $quoteTag = $match.Value }
      elseif ($match.Value -eq $quoteTag) { $quoteTag = $null }
    }

    if (-not $quoteTag -and $trimmed.EndsWith(";")) {
      $statements += (($current -join "`n").Trim())
      $current = @()
    }
  }

  if ($current.Count -gt 0) {
    $statements += (($current -join "`n").Trim())
  }

  return @($statements | Where-Object {
    if (-not $_) { return $false }
    # Diff preamble, not schema.
    if ($_ -eq "SET check_function_bodies = false;") { return $false }
    # `ensure_rls` is a platform-managed event trigger that exists on hosted
    # Supabase projects but never locally. It always shows up and is not drift.
    if ($_ -eq "DROP EVENT TRIGGER ensure_rls;") { return $false }
    return $true
  })
}

# Groups drift statements by leading keyword, so the report names what kind of
# objects differ instead of only how many lines differ.
function Get-DriftSummary {
  param([Parameter(Mandatory = $true)][string[]]$Statements)

  $kinds = @(
    "CREATE OR REPLACE FUNCTION", "CREATE FUNCTION", "DROP FUNCTION",
    "CREATE OR REPLACE VIEW", "CREATE VIEW", "DROP VIEW",
    "CREATE UNIQUE INDEX", "CREATE INDEX", "DROP INDEX",
    "CREATE TABLE", "DROP TABLE", "ALTER TABLE",
    "CREATE POLICY", "DROP POLICY",
    "CREATE TRIGGER", "DROP TRIGGER",
    "CREATE TYPE", "DROP TYPE",
    "GRANT", "REVOKE"
  )

  $counts = [ordered]@{}
  foreach ($statement in $Statements) {
    $upper = $statement.ToUpperInvariant()
    $match = $kinds |
      Where-Object { $upper.StartsWith($_) } |
      Sort-Object -Property Length -Descending |
      Select-Object -First 1

    $key = if ($match) { $match } else { "other" }
    if ($counts.Contains($key)) { $counts[$key] = $counts[$key] + 1 } else { $counts[$key] = 1 }
  }

  return @($counts.GetEnumerator() |
    Sort-Object -Property Value -Descending |
    ForEach-Object { "$($_.Value) x $($_.Key)" })
}

# psql is not on PATH on a typical Windows dev box, but the local Supabase stack
# ships one. Deep mode already requires that stack, so borrow its client.
function Get-LocalDbContainer {
  $previous = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $names = & docker ps --filter "name=supabase_db_" --format "{{.Names}}" 2>&1
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = $previous

  if ($exitCode -ne 0) { return $null }
  return (@($names |
    Where-Object { $_ -isnot [System.Management.Automation.ErrorRecord] } |
    ForEach-Object { $_.ToString().Trim() } |
    Where-Object { $_ }) | Select-Object -First 1)
}

# Runs a read-only query against local (no DbUrl) or a remote (DbUrl) database.
# Returns $null if the query could not be run at all, so callers can tell
# "no rows" apart from "no psql".
function Invoke-DbQuery {
  param(
    [Parameter(Mandatory = $true)][string]$Container,
    [Parameter(Mandatory = $true)][string]$Sql,
    [string]$DbUrl
  )

  # Assign inside the branches, not from an `if` expression: a single-element
  # array returned that way unwraps to a string, and splatting a string does not
  # pass it to psql as one argument.
  $connection = @("-U", "postgres", "-d", "postgres")
  if ($DbUrl) {
    $connection = @($DbUrl)
  }

  # Same stderr handling as Get-MigrationGap: PS 5.1 turns native stderr into
  # ErrorRecords, so merge the streams and drop the error objects by hand.
  $previous = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $output = & docker exec $Container psql @connection -t -A -c $Sql 2>&1
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = $previous

  if ($exitCode -ne 0) { return $null }
  return @($output |
    Where-Object { $_ -isnot [System.Management.Automation.ErrorRecord] } |
    ForEach-Object { $_.ToString().Trim() } |
    Where-Object { $_ })
}

# Maps each public function name to a hash of its body with CR bytes stripped.
function Get-FunctionBodyHashes {
  param(
    [Parameter(Mandatory = $true)][string]$Container,
    [string]$DbUrl
  )

  # A migration file checked out with CRLF stores CR bytes inside prosrc. The
  # same file applied elsewhere with LF does not, and pg-delta then reports the
  # function as changed even though the code is identical. Strip CR before
  # hashing so only real body changes count.
  $sql = "select p.proname || '|' || md5(replace(p.prosrc, chr(13), '')) " +
         "from pg_proc p join pg_namespace n on n.oid = p.pronamespace " +
         "where n.nspname = 'public' and p.prokind = 'f' order by 1;"

  $rows = Invoke-DbQuery -Container $Container -Sql $sql -DbUrl $DbUrl
  if ($null -eq $rows) { return $null }

  $hashes = @{}
  foreach ($row in $rows) {
    $parts = $row.Split("|", 2)
    if ($parts.Count -lt 2) { continue }

    $name = $parts[0]
    if ($hashes.ContainsKey($name)) {
      # Overloads: fold every signature into one value so a change to any of
      # them still counts as a mismatch.
      $hashes[$name] = "$($hashes[$name])+$($parts[1])"
    }
    else {
      $hashes[$name] = $parts[1]
    }
  }
  return $hashes
}

# Function names whose bodies are identical on both sides once CR is stripped.
# Returns an empty set when the comparison cannot be made, which keeps the
# reported drift pessimistic rather than silently clean.
function Get-LineEndingOnlyFunctions {
  param([Parameter(Mandatory = $true)][string]$DbUrl)

  $container = Get-LocalDbContainer
  if (-not $container) { return @() }

  $localHashes = Get-FunctionBodyHashes -Container $container
  $remoteHashes = Get-FunctionBodyHashes -Container $container -DbUrl $DbUrl
  if ($null -eq $localHashes -or $null -eq $remoteHashes) { return @() }

  $matching = @()
  foreach ($name in $localHashes.Keys) {
    if (-not $remoteHashes.ContainsKey($name)) { continue }
    if ($localHashes[$name] -eq $remoteHashes[$name]) { $matching += $name }
  }
  return $matching
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
  $rawFile = Join-Path $targetDir "diff-raw.json"
  $logFile = Join-Path $targetDir "diff.log"
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)

  # The diff engine intermittently fails on a cold connection to the local stack
  # ("timeout exceeded when trying to connect"). One retry clears it.
  $sql = $null
  foreach ($attempt in 1..2) {
    # Keep stderr out of the captured payload - the CLI writes progress and
    # upgrade notices there, and merging them would corrupt the diff.
    $previous = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $stdout = & supabase db diff --from $DbUrl --to local --schema public 2> $logFile
    $exitCode = $LASTEXITCODE
    $ErrorActionPreference = $previous

    $raw = (@($stdout | ForEach-Object { $_.ToString() })) -join "`n"
    [System.IO.File]::WriteAllText($rawFile, $raw, $utf8NoBom)

    if ($exitCode -eq 0) {
      $sql = ConvertTo-DiffSql -Raw $raw
      if ($null -ne $sql) { break }
    }

    if ($attempt -eq 2) {
      throw "supabase db diff failed for $TargetName. See $rawFile and $logFile"
    }
  }

  [System.IO.File]::WriteAllText($driftFile, $sql, $utf8NoBom)

  $statements = Split-DiffStatements -Sql $sql
  if ($statements.Count -eq 0) {
    return $null
  }

  $identicalFunctions = Get-LineEndingOnlyFunctions -DbUrl $DbUrl
  $lineEndingNoise = 0
  $realStatements = @()

  foreach ($statement in $statements) {
    if ($statement -match "^CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+public\.([A-Za-z0-9_]+)" -and
        $identicalFunctions -contains $matches[2]) {
      $lineEndingNoise++
      continue
    }
    $realStatements += $statement
  }

  if ($realStatements.Count -eq 0) {
    return $null
  }
  return [pscustomobject]@{
    File            = $driftFile
    Statements      = $realStatements.Count
    Summary         = Get-DriftSummary -Statements $realStatements
    LineEndingNoise = $lineEndingNoise
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
      Write-Status -Label "schema" -State "DRIFT ($($drift.Statements) statement(s))" -Colour Red
      $drift.Summary | ForEach-Object { Write-Host "               $_" -ForegroundColor DarkGray }
      if ($drift.LineEndingNoise -gt 0) {
        Write-Host "               ($($drift.LineEndingNoise) function(s) ignored - CRLF-only body difference)" -ForegroundColor DarkGray
      }
      Write-Host "               $($drift.File)" -ForegroundColor DarkGray

      if ($gap.LocalOnly.Count -gt 0) {
        # Unapplied migrations explain the schema gap on their own. Chasing it as
        # a dashboard edit before pushing them would be a wild goose chase.
        Write-Host "               (expected while behind - push the migrations, then re-check)" -ForegroundColor DarkGray
        $problems += "$targetName schema differs from local (accounted for by the $($gap.LocalOnly.Count) unapplied migration(s))"
      }
      else {
        $problems += "$targetName schema differs from local (likely a dashboard edit)"
      }
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
