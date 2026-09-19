# One-command first-run setup for a fresh Windows machine.
#
#   1. Install the prerequisites first (see the checks below).
#   2. git clone https://github.com/PrinceVigoli/eirf.git
#   3. cd eirf
#   4. .\setup.ps1
#
# This installs dependencies, starts PostgreSQL (Docker), applies migrations,
# launches the API + frontend, and optionally creates the first administrator.
# Safe to re-run: it reuses the existing .env.local, database volume, and admin.
$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot

function Assert-Command($name, $hint) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    throw "'$name' was not found. $hint"
  }
}

Write-Host "Checking prerequisites..." -ForegroundColor Cyan
Assert-Command node   "Install Node.js 22+ from https://nodejs.org and reopen PowerShell."
Assert-Command pnpm   "Install pnpm with 'npm install -g pnpm' (see https://pnpm.io/installation)."
Assert-Command docker "Install Docker Desktop from https://www.docker.com/products/docker-desktop and make sure it is running."

# Confirm the Docker engine is actually running (Docker Desktop can be installed but stopped).
docker info *> $null
if ($LASTEXITCODE -ne 0) { throw "Docker is installed but not running. Start Docker Desktop, wait for it to say 'running', then re-run .\setup.ps1." }

Write-Host "Installing dependencies (first run can take a few minutes)..." -ForegroundColor Cyan
pnpm.cmd install
if ($LASTEXITCODE -ne 0) { throw "pnpm install failed." }

# dev.ps1 creates .env.local (if missing), starts Postgres, applies migrations,
# and launches the API + frontend. Dot-sourced so DATABASE_URL etc. carry over
# into this session for the admin-creation step below.
Write-Host "Starting database and application..." -ForegroundColor Cyan
. (Join-Path $PSScriptRoot "dev.ps1")

Write-Host ""
$makeAdmin = Read-Host "Create an administrator account now? (y/n)"
if ($makeAdmin -eq "y") {
  $env:ADMIN_USERNAME = Read-Host "Admin username"
  $securePassword = Read-Host "Admin password (hidden)" -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
  try {
    $env:ADMIN_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
  pnpm.cmd --filter @workspace/db run admin:create
  $env:ADMIN_PASSWORD = $null
  if ($LASTEXITCODE -ne 0) {
    Write-Host "admin:create did not complete (an administrator may already exist). You can sign in with the existing account." -ForegroundColor Yellow
  }
}

Write-Host ""
Write-Host "Setup complete. Two PowerShell windows (API on :5000, web on :5173) are starting." -ForegroundColor Green
Write-Host "Open http://localhost:5173 once both windows are ready." -ForegroundColor Green
