# e-IRF local setup

The application uses PostgreSQL in Docker and is designed to run locally
without a hosted database or internet connection.

## Prerequisites

- Node.js 22 or newer
- pnpm
- Docker Desktop with Linux containers enabled

Install dependencies from the repository root:

```powershell
pnpm.cmd install
```

## First run

Start PostgreSQL, apply versioned migrations, and launch both applications:

```powershell
.\dev.ps1
```

PostgreSQL is exposed only on `127.0.0.1:5432`. Its data is retained in the
Docker volume `eirf_postgres_data`, so `docker compose down` does not erase it.

On a new database, create the first administrator from the same PowerShell
window after `dev.ps1` has initialized the database:

```powershell
$env:ADMIN_USERNAME = Read-Host "Admin username"
$env:ADMIN_PASSWORD = Read-Host "Admin password"
pnpm.cmd --filter @workspace/db run admin:create
```

The password must contain at least 8 characters. Open
<http://localhost:5173> after the API and frontend windows are ready.

## Database commands

```powershell
# Start PostgreSQL and wait until it is healthy
pnpm.cmd run db:up

# Apply versioned schema migrations (dev.ps1 does this automatically)
pnpm.cmd --filter @workspace/db run migrate

# Follow database logs
pnpm.cmd run db:logs

# Stop containers without deleting database data
pnpm.cmd run db:down
```

To use a different local password or port, set `POSTGRES_PASSWORD` or
`POSTGRES_PORT` before running `dev.ps1`. The script constructs the matching
`DATABASE_URL` automatically.

## Backups

The Docker volume persists data but is not a backup. Create a portable dump:

```powershell
docker compose exec -T postgres pg_dump -U eirf -d eirf -Fc --file=/tmp/eirf.dump
docker compose cp postgres:/tmp/eirf.dump .\eirf.dump
```

Keep dumps outside the repository because they contain sensitive incident
records.

Schedule a daily backup at 2:00 AM (run PowerShell as Administrator if Task
Scheduler requires it):

```powershell
pnpm.cmd run backup:schedule
```

Restore a database and optional evidence archive only after confirming the
paths; restore replaces current local data:

```powershell
.\scripts\restore.ps1 -DatabaseBackup .\data\backups\eirf-YYYYMMDD-HHMMSS.dump -EvidenceBackup .\data\backups\eirf-evidence-YYYYMMDD-HHMMSS.zip -Force
```

## Password recovery

```powershell
$env:RESET_USERNAME = Read-Host "Officer username"
$env:RESET_PASSWORD = Read-Host "New password"
pnpm.cmd --filter @workspace/db run admin:reset-password
```

The reset increments the account's session version, revoking existing login
cookies. Station name and report branding can be changed by an administrator
from **System & Recovery** in the application.

## Troubleshooting

- `DATABASE_URL must be set`: run `dev.ps1` once so `.env.local` is created.
- `port is already allocated`: set a free port, for example
  `$env:POSTGRES_PORT="5433"`, before running `dev.ps1`.
- container does not start: open Docker Desktop and wait for the engine to be
  ready, then run `docker compose up -d --wait postgres`.
- login returns 401 on a fresh database: create the initial administrator with
  `admin:create` as shown above.
