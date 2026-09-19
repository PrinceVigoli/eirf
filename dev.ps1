# Local-only launcher: loads or creates persistent secrets, starts PostgreSQL,
# applies migrations/schema, and launches the API and frontend.
$ErrorActionPreference = "Stop"
$workspacePath = $PSScriptRoot
Set-Location -LiteralPath $workspacePath

function New-RandomHex([int]$byteCount) {
  $bytes = New-Object byte[] $byteCount
  $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $generator.GetBytes($bytes) } finally { $generator.Dispose() }
  return -join ($bytes | ForEach-Object { $_.ToString("x2") })
}

$envFile = Join-Path $workspacePath ".env.local"
if (Test-Path -LiteralPath $envFile) {
  foreach ($line in Get-Content -LiteralPath $envFile) {
    if ($line -match '^([A-Z0-9_]+)=(.*)$') {
      [Environment]::SetEnvironmentVariable($matches[1], $matches[2], "Process")
    }
  }
}
else {
  $env:POSTGRES_DB = "eirf"
  $env:POSTGRES_USER = "eirf"
  $env:POSTGRES_PORT = "5432"
  $env:POSTGRES_PASSWORD = New-RandomHex 24
  $env:SESSION_SECRET = New-RandomHex 48
  @(
    "POSTGRES_DB=$env:POSTGRES_DB"
    "POSTGRES_USER=$env:POSTGRES_USER"
    "POSTGRES_PORT=$env:POSTGRES_PORT"
    "POSTGRES_PASSWORD=$env:POSTGRES_PASSWORD"
    "SESSION_SECRET=$env:SESSION_SECRET"
  ) | Set-Content -LiteralPath $envFile -Encoding ASCII
}

$postgresDb = if ($env:POSTGRES_DB) { $env:POSTGRES_DB } else { "eirf" }
$postgresUser = if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { "eirf" }
$postgresPassword = $env:POSTGRES_PASSWORD
$postgresPort = if ($env:POSTGRES_PORT) { $env:POSTGRES_PORT } else { "5432" }
if (-not $postgresPassword -or -not $env:SESSION_SECRET) {
  throw ".env.local must define POSTGRES_PASSWORD and SESSION_SECRET"
}

$encodedUser = [Uri]::EscapeDataString($postgresUser)
$encodedPassword = [Uri]::EscapeDataString($postgresPassword)
$env:DATABASE_URL = "postgresql://${encodedUser}:${encodedPassword}@127.0.0.1:${postgresPort}/${postgresDb}"
$env:EIRF_DATA_DIR = Join-Path $workspacePath "data"
$env:LOCAL_OBJECT_STORAGE_DIR = Join-Path $env:EIRF_DATA_DIR "evidence"
$env:BACKUP_DIR = Join-Path $env:EIRF_DATA_DIR "backups"

docker compose up -d --wait postgres
if ($LASTEXITCODE -ne 0) { throw "PostgreSQL failed to start. Is Docker Desktop running?" }

# Works through the trusted local Unix socket and synchronizes an existing
# development volume with the randomly generated password in .env.local.
$escapedPassword = $postgresPassword.Replace("'", "''")
docker compose exec -T postgres psql -U $postgresUser -d $postgresDb -v ON_ERROR_STOP=1 -c "ALTER USER $postgresUser WITH PASSWORD '$escapedPassword';" | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Could not synchronize the local database password." }

pnpm.cmd --filter @workspace/db run migrate
if ($LASTEXITCODE -ne 0) { throw "Database schema could not be applied." }

$apiCommand = "Set-Location -LiteralPath '$workspacePath'; `$env:DATABASE_URL='$env:DATABASE_URL'; `$env:SESSION_SECRET='$env:SESSION_SECRET'; `$env:EIRF_DATA_DIR='$env:EIRF_DATA_DIR'; `$env:LOCAL_OBJECT_STORAGE_DIR='$env:LOCAL_OBJECT_STORAGE_DIR'; `$env:BACKUP_DIR='$env:BACKUP_DIR'; `$env:PORT='5000'; pnpm.cmd --filter @workspace/api-server run dev"
$frontendCommand = "Set-Location -LiteralPath '$workspacePath'; `$env:PORT='5173'; `$env:BASE_PATH='/'; pnpm.cmd --filter @workspace/eirf run dev"
$apiEncoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($apiCommand))
$frontendEncoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($frontendCommand))
Start-Process powershell -ArgumentList "-NoExit", "-EncodedCommand", $apiEncoded
Start-Process powershell -ArgumentList "-NoExit", "-EncodedCommand", $frontendEncoded

Write-Host "e-IRF is starting. Open http://localhost:5173 when both windows are ready."
