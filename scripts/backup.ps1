param([string]$Destination)
$ErrorActionPreference = "Stop"
$workspacePath = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $workspacePath

$envFile = Join-Path $workspacePath ".env.local"
if (Test-Path -LiteralPath $envFile) {
  foreach ($line in Get-Content -LiteralPath $envFile) {
    if ($line -match '^([A-Z0-9_]+)=(.*)$') { [Environment]::SetEnvironmentVariable($matches[1], $matches[2], "Process") }
  }
}
$postgresUser = if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { "eirf" }
$postgresDb = if ($env:POSTGRES_DB) { $env:POSTGRES_DB } else { "eirf" }

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = if ($Destination) { $Destination } else { Join-Path $workspacePath "data\backups" }
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
$databaseFile = Join-Path $backupDir "eirf-$timestamp.dump"
$evidenceFile = Join-Path $backupDir "eirf-evidence-$timestamp.zip"
$containerFile = "/tmp/eirf-$timestamp.dump"

docker compose up -d --wait postgres
if ($LASTEXITCODE -ne 0) { throw "PostgreSQL container could not be started for backup." }
docker compose exec -T postgres pg_dump -U $postgresUser -d $postgresDb -Fc --file=$containerFile
if ($LASTEXITCODE -ne 0) { throw "Database backup failed." }
docker compose cp "postgres:$containerFile" $databaseFile
if ($LASTEXITCODE -ne 0) { throw "Could not copy database backup from the container." }
docker compose exec -T postgres rm -f $containerFile

$evidenceDir = Join-Path $workspacePath "data\evidence"
if (Test-Path -LiteralPath $evidenceDir) {
  Compress-Archive -LiteralPath $evidenceDir -DestinationPath $evidenceFile -CompressionLevel Optimal
}

Write-Host "Database backup: $databaseFile"
if (Test-Path -LiteralPath $evidenceFile) { Write-Host "Evidence backup: $evidenceFile" }
