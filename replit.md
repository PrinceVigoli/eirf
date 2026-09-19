# e-IRF — Electronic Incident Report Form

A local-first police incident-management app: officers file and investigate incident
reports, classify them as Crime / Non-Crime, track investigation status (including
Settled), assign an investigating officer, and manage the people involved in each case
(victims, complainants, suspects, witnesses) with a searchable Persons registry. Runs
entirely on a local machine against PostgreSQL in Docker — no hosted database or internet
connection required.

## Run & Operate

- `.\dev.ps1` — one-shot local launcher (Windows): creates `.env.local` with random
  secrets on first run, starts Docker PostgreSQL, applies migrations, and opens the API
  (port 5000) + frontend (port 5173). Open <http://localhost:5173>.
- First run only — create the initial admin (after `dev.ps1` has initialized the DB):
  `$env:ADMIN_USERNAME=...; $env:ADMIN_PASSWORD=...; pnpm.cmd --filter @workspace/db run admin:create`
- `pnpm run db:up` / `db:down` / `db:logs` — start / stop / tail Docker PostgreSQL
- `pnpm --filter @workspace/db run migrate` — apply versioned SQL migrations
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks + Zod from the OpenAPI spec
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- Prereqs: Node.js 22+, pnpm, Docker Desktop (Linux containers). See `EIRF-Local-Setup-Guide.md`.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 (`artifacts/api-server`)
- Frontend: React 19 + Vite + Wouter + TanStack Query + Tailwind 4 + shadcn-style UI (`artifacts/eirf`)
- DB: PostgreSQL 17 (Docker) + Drizzle ORM (`lib/db`)
- Validation: Zod, `drizzle-zod`; API codegen: Orval (from OpenAPI spec)
- Offline: service worker queues writes and replays them on reconnect

## Where things live

- **DB schema (source of truth):** `lib/db/src/schema/*.ts` — `incidents`, `officers`,
  `persons`, `incident_persons`, `evidence_files`, `system_logs`, `app_settings`.
- **Migrations:** `lib/db/migrations/*.sql` — hand-written, applied in lexicographic order
  by `lib/db/migrate.mjs` (one transaction per file, tracked in `eirf_schema_migrations`).
- **API contract (source of truth):** `lib/api-spec/openapi.yaml` → `pnpm codegen` generates
  `lib/api-zod` (server Zod) and `lib/api-client-react` (React Query hooks). Never hand-edit
  the `**/generated/**` output.
- **Server routes:** `artifacts/api-server/src/routes/*` (`incidents.ts`, `persons.ts`,
  `officers.ts`, `dashboard.ts`, …); shared logic in `artifacts/api-server/src/lib/*`.
- **Frontend:** `artifacts/eirf/src/pages/*` (incidents, persons, dashboard, …), shared libs
  in `artifacts/eirf/src/lib/*` (`incident-types.ts`, `incident-status.ts`, `person-roles.ts`),
  nav in `src/components/layout.tsx`, routes in `src/App.tsx`.
- **Design/planning docs:** `docs/superpowers/specs/` and `docs/superpowers/plans/`.

## Architecture decisions

- **Contract-first:** every data change flows schema → SQL migration → `openapi.yaml` →
  `codegen` → server routes → frontend. Enums are enforced end-to-end.
- **Local-first:** PostgreSQL runs in Docker; `dev.ps1` self-configures secrets and DB. No
  hosted services. (There is no Supabase/Replit hosting in the data path.)
- **Persons are normalized:** a shared `persons` table + `incident_persons` join (role per
  link) so a suspect is searchable across all cases and bio data is stored once. FK:
  `incident_id` CASCADE, `person_id` RESTRICT (a linked person can't be hard-deleted).
- **`category` (Crime/Non-Crime) is server-derived** from `type` (`Crime → crime`, else
  `non_crime`); never accepted from the client.
- **`settled` status invariant:** `status === "settled"` ⇔ `settledDate` is set; the server
  manages `settledDate` and recomputes it only on an actual status transition.
- Status transitions are a validated graph, mirrored in `artifacts/api-server/src/lib/incidentWorkflow.ts`
  and `artifacts/eirf/src/lib/incident-status.ts` — keep the two in sync.

## Product

- **Incidents:** number, incident date, **date reported**, time, location, **type** grouped
  under **Crime / Non-Crime**, description, **status** (open → under investigation → settled →
  closed → archived), reporting officer, **investigating officer**, evidence (narrative +
  files), notes, and **persons involved** (victim / complainant / suspect / witness).
- **Persons registry** (`/persons`): searchable directory (by name, alias, ID number) with a
  role filter; bio data (identity, contact, physical description, notes); each person shows
  the cases they're linked to.
- **Dashboard:** incident stats, by-type and by-month charts, recent incidents.

## User preferences

- Local testing only for now; portability to another Windows machine matters (hence Docker).
- Standardize AI co-author trailer as `Claude Opus 4.8` on commits.

## Gotchas

- **Run `pnpm --filter @workspace/api-spec run codegen` after any `openapi.yaml` change**, and
  commit the regenerated `lib/api-zod` + `lib/api-client-react`. Never hand-edit generated files.
- **Migrations are hand-written SQL**, one transaction per file. Adding a value to a Postgres
  enum (`ALTER TYPE … ADD VALUE`) must live in its own migration that does not *use* the new
  value in the same transaction (PG restriction).
- **Keep enum lists in sync** across the Drizzle schema, `openapi.yaml`, generated Zod, and the
  frontend companions (`incident-status.ts`, `incident-types.ts`, `person-roles.ts`).
- **Start Docker (`pnpm run db:up`) before running migrations.**
- `GET /officers` is admin-only; use `GET /officers/roster` for a roster readable by any officer.

## Pointers

- Setup: `EIRF-Local-Setup-Guide.md`. Workspace/TypeScript details: the `pnpm-workspace` skill.
