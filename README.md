# e-IRF — Electronic Incident Report Form

A local-first police incident-management app. Officers file and investigate incident
reports, classify them as **Crime / Non-Crime**, track investigation status (including
**Settled**), assign an **investigating officer**, and manage the **people involved** in
each case — victims, complainants, suspects, witnesses — through a searchable **Name Index**.

It runs entirely on a local machine against **PostgreSQL in Docker** — no hosted database
and no internet connection required. This setup is intended for **local testing**.

## Quick start (Windows)

**Prerequisites:** Node.js 22+, [pnpm](https://pnpm.io/), and Docker Desktop (with Linux
containers enabled and running).

**Fastest — one command:** after installing the prerequisites and cloning, run `.\setup.ps1`
from the repo root. It checks the prerequisites, installs dependencies, starts everything,
and offers to create the first administrator. The manual steps below do the same thing.

```powershell
# 1. Install dependencies (from the repo root)
pnpm.cmd install

# 2. Start PostgreSQL (Docker), apply migrations, and launch the API + frontend.
#    On first run this also generates .env.local with strong random secrets.
.\dev.ps1

# 3. First run only — create the initial administrator (in the same window):
$env:ADMIN_USERNAME = Read-Host "Admin username"
$env:ADMIN_PASSWORD = Read-Host "Admin password"
pnpm.cmd --filter @workspace/db run admin:create
```

Then open <http://localhost:5173> once the API (port 5000) and frontend windows are ready.

> `.env.local` is generated automatically and is git-ignored (it holds secrets). Postgres
> data persists in the Docker volume `eirf_postgres_data`, so `docker compose down` does not
> erase it. See **[EIRF-Local-Setup-Guide.md](EIRF-Local-Setup-Guide.md)** for backups,
> password recovery, and troubleshooting.

## Features

- **Incident records** — number, date of incident, date reported, time, location, description,
  evidence (narrative + file attachments with SHA-256 fingerprints), officer notes.
- **Crime / Non-Crime classification** — each incident is typed as **Crime** or **Non-Crime**; a
  server-derived category powers filtering and dashboards.
- **Investigation status** — open → under investigation → settled → closed → archived, with a
  settled date, enforced by a status-transition graph.
- **Investigating officer** — assign an investigator to a case (distinct from the reporting officer).
- **Officer profiles** — each officer has a profile page showing the cases they reported and are
  investigating, with a self-service avatar and cover-photo upload.
- **Name Index** — a searchable directory of everyone involved in cases (search by name,
  alias, or ID number; filter by role), with bio data and the list of cases each person is linked to.
- **Dashboard** — incident stats and charts.
- **Offline-capable** — a service worker queues writes and replays them on reconnect.

## Tech stack

pnpm workspaces · Node.js 24 · TypeScript 5.9 · Express 5 (API) · React 19 + Vite + Wouter +
TanStack Query + Tailwind 4 (frontend) · PostgreSQL 17 + Drizzle ORM · Zod validation ·
OpenAPI + Orval codegen.

## Repository layout

| Path | What |
|------|------|
| `artifacts/api-server` | Express API server |
| `artifacts/eirf` | React frontend |
| `lib/db` | Drizzle schema + SQL migrations |
| `lib/api-spec` | OpenAPI contract (source of truth) → codegen |
| `lib/api-zod`, `lib/api-client-react` | Generated Zod schemas + React Query hooks (do not hand-edit) |
| `compose.yaml`, `dev.ps1` | Docker Postgres + local launcher |
| `docs/superpowers/` | Design specs and the implementation plan |

For contributor-facing details (architecture decisions, gotchas, common commands), see
**[replit.md](replit.md)**.
