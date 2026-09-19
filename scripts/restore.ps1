param(
  [Parameter(Mandatory=$true)][string]$DatabaseBackup,
  [string]$EvidenceBackup,
  [switch]$Force
)
$ErrorActionPreference = "Stop"
if (-not $Force) { throw "Restore replaces current local data. Re-run with -Force after confirming your backup paths." }
$workspacePath = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $workspacePath
$databasePath = (Resolve-Path -LiteralPath $DatabaseBackup).Path

$envFile = Join-Path $workspacePath ".env.local"
if (Test-Path -LiteralPath $envFile) {
  foreach ($line in Get-Content -LiteralPath $envFile) {
    if ($line -match '^([A-Z0-9_]+)=(.*)$') { [Environment]::SetEnvironmentVariable($matches[1], $matches[2], "Process") }
  }
}
$postgresUser = if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { "eirf" }
$postgresDb = if ($env:POSTGRES_DB) { $env:POSTGRES_DB } else { "eirf" }

docker compose up -d --wait postgres
docker compose cp $databasePath postgres:/tmp/eirf-restore.dump
docker compose exec -T postgres pg_restore -U $postgresUser -d $postgresDb --clean --if-exists --no-owner /tmp/eirf-restore.dump
if ($LASTEXITCODE -ne 0) { throw "Database restore failed." }
docker compose exec -T postgres rm -f /tmp/eirf-restore.dump

if ($EvidenceBackup) {
  $evidencePath = (Resolve-Path -LiteralPath $EvidenceBackup).Path
  $dataDir = Join-Path $workspacePath "data"
  New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
  Expand-Archive -LiteralPath $evidencePath -DestinationPath $dataDir -Force
}
Write-Host "Restore completed. Run .\dev.ps1 to apply any newer schema changes."
