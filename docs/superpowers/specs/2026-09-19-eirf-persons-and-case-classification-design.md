# e-IRF — Persons Registry & Case Enhancements — Design Spec

- **Date:** 2026-09-19
- **Status:** Approved design shape (pending spec review)
- **Author:** Prince Vigoli (with Claude + architecture/logic/UI-UX design agents)

## 1. Context & intent

**e-IRF** (Electronic Incident Report Form) is a local-first police incident-management
web app. It runs entirely offline-capable against a **PostgreSQL 17 database in Docker**
(`compose.yaml`), with a contract-first pipeline:

```
Drizzle schema (lib/db) → hand-written SQL migration → openapi.yaml
  → pnpm --filter @workspace/api-spec run codegen (Orval)
  → server routes (artifacts/api-server) → frontend (artifacts/eirf)
```

Enums are enforced end-to-end (the "U4/B4 audit" discipline). Server request validation
uses **Orval-generated Zod** (`@workspace/api-zod`), whose export names derive from each
`openapi.yaml` `operationId` — so **a field is only server-validated after it is added to
`openapi.yaml` and codegen has run.** Migrations are hand-written `*.sql` files in
`lib/db/migrations`, discovered lexicographically and run **one transaction per file**
(`lib/db/migrate.mjs`), tracked in `eirf_schema_migrations`.

**Infra note (decided):** There is **no Supabase** in this repository and there never was;
Docker Postgres is already the setup. No infra change is in scope — this spec confirms the
existing Docker + Drizzle Postgres setup and focuses entirely on the new features.

### Current data model (before this work)
- `officers` — id, name, badgeNumber (unique), rank, role (admin|officer), username (unique), passwordHash, sessionVersion, createdAt
- `incidents` — id, incidentNumber (unique), date (text), time (text), location, type (enum: Crime|Accident|Dispute|Missing Person|Other), description, status (enum: open|under_investigation|closed|archived), reportingOfficerId → officers, witnessStatements (text), evidence (text), notes (text), createdAt/updatedAt (timestamptz)
- `evidence_files`, `system_logs`, `app_settings`

## 2. Goals

1. **Date Reported** — capture when a report was *filed*, distinct from when the incident *occurred*.
2. **Investigator on a case** — assign an investigating officer, distinct from the reporting officer.
3. **Settled investigation** — a new `settled` case status with a settled date.
4. **Crime vs Non-Crime** — a `category` derived from the existing incident type, surfaced as grouped selection, filtering, and (optionally) a dashboard split.
5. **Persons involved** — a normalized `persons` registry (bio data) linked to incidents with a role (victim / complainant / suspect / witness).
6. **Suspect search** — a top-level **Persons** section in the sidebar with a search bar and role filter.
7. **Save** — all of the above persisted to Postgres through the existing contract-first pipeline.

## 3. Non-goals (YAGNI)

- **No person photo/mugshot** in v1 (bio data is text-only). Deferred.
- **No incident type enum change.** The 5 existing types stay; Crime/Non-Crime is a *derived* grouping.
- **No offline cross-entity create-then-link.** Linking is only for already-persisted persons/incidents (see §8).
- **No person-record snapshotting.** A person is a shared record; editing bio affects all linked incidents (see §6.5).
- **No infra/Supabase/Replit work.** (Confirm existing Docker Postgres only.)

## 4. Approved decisions (from brainstorming) + reconciliations

| # | Decision |
|---|----------|
| D1 | **Infra:** confirm existing Docker + Drizzle Postgres; nothing to remove. |
| D2 | **Crime/Non-Crime:** do **not** change the `incident_type` enum. Add a **derived** `category` enum column: `Crime → crime`; `Accident/Dispute/Missing Person/Other → non_crime`. Server-derived, single source of truth; client-supplied `category` is ignored. |
| D3 | **Settled:** add `settled` value to `incident_status` + a `settledDate` field. |
| D4 | **Persons:** normalized `persons` table + `incident_persons` join with role; top-level "Persons" sidebar section with role tabs + suspect search. |
| D5 | **Roles:** `victim | complainant | suspect | witness`. |
| D6 | **Photo:** deferred (text bio only). |
| R1 | **(Reconciliation)** `settledDate` and `dateReported` are **`text` `YYYY-MM-DD`**, consistent with the existing `date` column and `<input type="date">`. (Overrides the architecture agent's `timestamptz` suggestion.) |
| R2 | **(Reconciliation)** Canonical status graph = logic agent's minimal graph (below). `settledDate` is **cleared** when a case leaves `settled` (preserves the invariant). |
| R3 | **(New requirement found)** Add a non-admin **`GET /officers/roster`** endpoint (projection: id, name, rank, badgeNumber) so the investigating-officer picker works for all authenticated users — `GET /officers` is admin-only. |
| R4 | **(Consistency follow-ons)** Add `settled` to dashboard stats + list status filter; centralize the duplicated `incidentSelect` and the `getStatusLabel`/`getStatusColor` helpers. |

## 5. Data model

### 5.1 New: `lib/db/src/schema/persons.ts`
`persons` — `id` (serial pk); `fullName` **notNull**; nullable text: `alias`, `dateOfBirth`
(`YYYY-MM-DD`), `sex`, `nationality`, `address`, `contactNumber`, `email`, `idType`,
`idNumber`, `occupation`, `physicalDescription`, `notes`; `createdAt`/`updatedAt`
(timestamptz, `$onUpdate`). Indexes: `persons_full_name_idx`, `persons_alias_idx`.
Export `insertPersonSchema`, `Person` type.

### 5.2 New: `lib/db/src/schema/incident_persons.ts`
`personRoleEnum` = `["victim","complainant","suspect","witness"]`.
`incident_persons` — `id` (serial pk); `incidentId` → incidents **ON DELETE CASCADE**;
`personId` → persons **ON DELETE RESTRICT**; `role` (personRoleEnum, notNull); `roleDetails`
(text, nullable); `createdAt`. **Unique index** on `(incidentId, personId, role)`; btree
indexes on `incidentId` and `personId`.

**FK rationale:** deleting an *incident* drops its links (mirrors `evidence_files`); a
*person* is a shared identity and cannot be hard-deleted while linked (forces explicit
unlink; mirrors the `reporting_officer_id` "delete-restricted" posture).

### 5.3 Edit: `lib/db/src/schema/incidents.ts`
- `incidentStatusEnum` → `["open","under_investigation","settled","closed","archived"]` (insert `settled` before `closed`).
- New `incidentCategoryEnum` = `["crime","non_crime"]`.
- New columns: `dateReported` (text, `YYYY-MM-DD`), `investigatingOfficerId` (integer → officers, **ON DELETE SET NULL**), `category` (incidentCategoryEnum, **notNull**, server-derived/backfilled), `settledDate` (text, `YYYY-MM-DD`, nullable).

### 5.4 Edit: `lib/db/src/schema/index.ts`
Export `./persons` then `./incident_persons` (order matters — the join imports persons).

### 5.5 Migrations (hand-written SQL; idempotent idioms `IF NOT EXISTS` / `DO $$…EXCEPTION WHEN duplicate_object`)

**`0002_incident_status_settled.sql` — enum value ONLY (isolated on purpose).**
PG 17 allows `ALTER TYPE … ADD VALUE` inside a transaction, but the new label **cannot be
used in the same transaction**. `migrate.mjs` wraps each file in one transaction, so this
file must contain nothing that references `'settled'`:
```sql
ALTER TYPE incident_status ADD VALUE IF NOT EXISTS 'settled' BEFORE 'closed';
```
`BEFORE 'closed'` keeps `enumsortorder` aligned with the drizzle declaration (avoids a phantom drizzle-kit push diff).

**`0003_incident_report_fields.sql` — category + new incident columns + backfill.**
Create `incident_category` (freshly-created type, so its values are usable in this same tx);
`ADD COLUMN IF NOT EXISTS` for `date_reported text`, `investigating_officer_id integer
REFERENCES officers(id) ON DELETE SET NULL`, `settled_date text`, `category
incident_category`; backfill `category = CASE WHEN type='Crime' THEN 'crime' ELSE
'non_crime' END`; backfill `date_reported = date`; then `ALTER COLUMN category SET NOT NULL`.

**`0004_persons.sql` — persons + join + indexes.**
Create `person_role` enum; `persons` table; `incident_persons` table with the CASCADE/RESTRICT
FKs; the unique index on `(incident_id, person_id, role)`; the btree indexes.

*(Optional, not v1:* `pg_trgm` GIN indexes on `full_name`/`alias` if leading-wildcard search perf matters.)*

## 6. Server logic & business rules

### 6.1 Category derivation (single source of truth)
```
deriveCategory(type) = type === "Crime" ? "crime" : "non_crime"
```
- **POST /incidents:** always set `category = deriveCategory(data.type)` in the insert.
- **PATCH /incidents:** if `type` present, set `category = deriveCategory(type)` in the same update object.
- **Client-supplied `category` is stripped, never persisted** (do not add it to `IncidentInput`/`IncidentUpdate`; the non-strict generated Zod drops unknown keys, the established pattern used for `reportingOfficerId`).
- `PATCH` must stop doing `db.update().set(parsed.data)` and build a computed `updates` object (mirroring `updateOfficer`) — this is the structural prerequisite for both category and settledDate enforcement.

### 6.2 Status graph & `settledDate` invariant
Update **both** `artifacts/api-server/src/lib/incidentWorkflow.ts` and
`artifacts/eirf/src/lib/incident-status.ts` (hand-kept mirrors) to this graph
(self-transitions always allowed):

| From | Allowed next |
|------|--------------|
| open | under_investigation, closed, settled |
| under_investigation | open, closed, settled |
| settled | under_investigation, closed |
| closed | under_investigation, archived |
| archived | under_investigation |

**Invariant:** `status === "settled"` **iff** `settledDate` is not null. Enforced on every write:
- Entering `settled`: `settledDate =` client value if a valid non-future `YYYY-MM-DD` ≥ incident `date`, else **today** (server, `new Date().toISOString().slice(0,10)`, UTC — same computation as `dashboard.ts`).
- Leaving `settled` (→ under_investigation or → closed): `settledDate = null`.
- Staying `settled` while editing other fields: unchanged unless a new valid date is supplied.
- `settledDate` is **not required** in the request body (server fills it).
- Admin overrides (`ADMIN_STATUS_OVERRIDE`) still apply the invariant.
- Reopening always lands in `under_investigation` (no direct `closed→open`/`archived→open` for non-admins).

### 6.3 Investigating officer
- Nullable, **client-settable** (part of `IncidentInput`/`IncidentUpdate`; contrast `reportingOfficerId`, which is server-set to the creator).
- May equal the reporting officer (no "must differ" rule). Always optional for all statuses.
- If provided, validate existence → `400 "Investigating officer not found"` (don't surface a raw `23503`).
- Returned as `investigatingOfficerName` via an **aliased** second self-join on `officers` (`alias()` from `drizzle-orm/pg-core`) — joining `officers` twice without aliasing silently breaks.

### 6.4 Persons — search & endpoints (`routes/persons.ts`, mirroring `officers.ts`/`incidents.ts`)
- `GET /persons` (`requireAuth`) — `search` over `fullName, alias, idNumber` via `ILIKE '%q%'` (`OR`); optional `role` filter (persons with ≥1 link of that role); pagination `page`/`limit` (default 1/20); order `fullName ASC, id ASC`; response `{ persons, total, page, limit }`. Empty query → all persons, paginated (200, never an error).
- `POST /persons` (`requireAuth`) → 201; `logAction("CREATE_PERSON")`.
- `GET /persons/:id` (`requireAuth`).
- `PATCH /persons/:id` (`requireAuth`) — partial `updates` object; `logAction("UPDATE_PERSON")`.
- `DELETE /persons/:id` (`requireAdmin`) — catch PG `23503` → `409 "Person is linked to incidents; unlink them first"`. Zero-link persons delete cleanly.
- `GET /persons/:id/incidents` (`requireAuth`) — join to incidents; include the person's `role`/`roleDetails`.
- Register in `routes/index.ts`.

### 6.5 Persons — identity & lifecycle
- **Soft dedup only.** No unique constraint on name; allow duplicates; surface likely matches during search (strongest signal `idNumber`, then name/alias) — never auto-merge, never block. `idNumber` is **not** unique (often null/variant).
- **Deleting a linked person → blocked (RESTRICT → 409),** regardless of linked-case status.
- **Deleting an incident → its `incident_persons` rows cascade;** `persons` records remain.
- **Editing a person's bio is a shared-record edit** — it retroactively updates every linked incident's view of that person. Logged via `UPDATE_PERSON`.
- Uniqueness only on `(incidentId, personId, role)` → a person may hold multiple roles in one incident and appear across many incidents.

### 6.6 Incident ↔ person linking
- **Create (POST /incidents):** `IncidentInput` accepts an optional `personsInvolved: [{personId, role, roleDetails?}]`. The server inserts the incident **and** its links in one transaction — this makes offline queueing atomic for *already-persisted* persons (the incident id is assigned server-side at replay; the link personIds already exist). Duplicate `(person, role)` within the payload is de-duplicated/ignored.
- **Edit:** links are managed through the dedicated sub-routes below (the incident already exists); `IncidentUpdate` does **not** carry `personsInvolved`.

Sub-routes on `incidents.ts`, mirroring `/evidence`:
- `POST /incidents/:id/persons` — owner-or-admin gate (reuse the `PATCH` check; factor into `assertCanEditIncident` helper); parse `AddIncidentPersonBody`; validate incident & person exist (`404` otherwise); insert; catch `23505` on the unique index → `409 "Person already linked with that role"`; `logAction("LINK_PERSON_TO_INCIDENT")`; 201.
- `DELETE /incidents/:id/persons/:linkId` — same gate; delete by link id; `logAction("UNLINK_PERSON_FROM_INCIDENT")`.
- `GET /incidents/:id` — attach `persons: IncidentPerson[]` (join to `persons`). `GET /incidents` (list) stays lean — no persons attached.

### 6.7 Validation
- Person `fullName` required (non-empty trimmed); all other bio optional/nullable; `email` `.email()` only when non-empty.
- All date fields (`dateReported`, `settledDate`, `dateOfBirth`): must match `^\d{4}-\d{2}-\d{2}$` **and** be a real calendar date (Zod refine parsing back to a Date), closing the current bare-`string()` gap that protects `/dashboard/by-month`'s `TO_DATE`.
- `dateReported`: **notNull with server default = today**; must be ≤ today and ≥ incident `date` (string compare works because ISO). (The ≥-incident-date rule may be downgraded to a warning if the product prefers leniency — flagged in §12.)
- Link body: `personId` + `role` required; existence-checked; duplicate role → 409.

### 6.8 Auth / audit
Follow existing patterns: cookie-based `requireAuth`/`requireAdmin`; `req.officer!` identity;
`logAction(officerId, ACTION, details)` (hash-chained) after every successful mutation;
`safeParse` → 400; `paramString` + `isNaN` on numeric path params.

### 6.9 Officer roster (R3)
`GET /officers/roster` (`requireAuth`) → `[{ id, name, rank, badgeNumber }]` (no username/hash).
Powers the investigating-officer picker for non-admin users. Generated hook `useListOfficerRoster`.

## 7. API contract (`lib/api-spec/openapi.yaml`) → codegen

- **Edit `IncidentStatus`** enum → add `settled`.
- **New schemas:** `IncidentCategory`, `PersonRole`, `Person`, `PersonInput`, `PersonUpdate`, `IncidentPerson`, `IncidentPersonInput`, `PersonIncident` (Incident fields + `role` + `roleDetails`, returned by `getPersonIncidents`), `PersonListResponse`, `OfficerRosterEntry`.
- **Edit `Incident`:** add `dateReported`, `investigatingOfficerId`, `investigatingOfficerName`, `settledDate`, `category` (add `category` to `required`), and optional `persons: [IncidentPerson]` (populated only by `GET /incidents/{id}`).
- **Edit `IncidentInput`:** add `dateReported`, `investigatingOfficerId` (client-supplied), and optional `personsInvolved: [IncidentPersonInput]` (transactional link-on-create, §6.6). **Edit `IncidentUpdate`:** add `dateReported`, `investigatingOfficerId` only. **Neither** carries `category`/`settledDate`/`investigatingOfficerName`.
- **New paths:** `/persons` (`listPersons`, `createPerson`), `/persons/{id}` (`getPerson`, `updatePerson`, `deletePerson`), `/persons/{id}/incidents` (`getPersonIncidents`), `/incidents/{id}/persons` (`listIncidentPersons`, `addIncidentPerson`), `/incidents/{id}/persons/{linkId}` (`removeIncidentPerson`), `/officers/roster` (`listOfficerRoster`). New top-level tag `persons`.
- **Edit `ListIncidentsQueryParams`:** ensure `status` accepts `settled`; fix the inline union cast at `incidents.ts` accordingly. Optionally add a `category` filter param.
- **Then run** `pnpm --filter @workspace/api-spec run codegen`. `lib/api-zod/**` and `lib/api-client-react/**` are `clean: true` → fully regenerated; never hand-edit.

## 8. Offline / service worker (`artifacts/eirf/public/sw.js`)
**No SW code change required.** Non-GET `/api/*` requests are queued to IndexedDB and replayed
FIFO; `POST /api/persons` and `POST /api/incidents/{id}/persons` match automatically and are
not under the force-blocked `/api/auth/` prefix. Read cache covers new `GET /persons*`.

**v1 limitation (documented, not fixed):** the queue replays opaque requests with no
client-generated id. A person **created offline** has no server id until replay, so linking
that person (or linking to an incident created offline) in the same offline session would
reference an unknown id and land in `REJECTED_STORE` — consistent with the pre-existing
evidence-file limitation. **UI stance:** only allow linking **already-persisted**
persons/incidents; adding a brand-new person inline requires connectivity (guard with the
same "requires a connection" toast used for attachments).

## 9. Frontend / UX (`artifacts/eirf`)

### 9.1 Sidebar (`components/layout.tsx`)
Add `{ href: "/persons", label: "Persons", icon: UserSearch }` in the **base** navItems array
(after "New Incident", before the admin spread) — visible to all authenticated users. Import
`UserSearch` from lucide. Active-highlight and mobile nav work unchanged.

### 9.2 Persons registry (`/persons` → `pages/persons/index.tsx`)
Mirror `incidents/index.tsx`. Header + "Add Person" CTA. Filter card: debounced search
(`useDebouncedValue`, 350ms; placeholder "Search persons by name, alias, or ID number…") +
**role filter as `Tabs` used as a segmented control** (`all/victim/complainant/suspect/witness`,
`TabsList`+`TabsTrigger`, no `TabsContent`). Results `Table`: Name (initial avatar) · Alias ·
Roles (aggregated role `Badge`s) · DOB · Cases (count) · View action. Rows clickable to
`/persons/:id`. Loading skeleton rows; filtered-empty row; true zero-state via `Empty*`
primitives; **add an `isError` branch** (destructive card) that the existing list pages lack.
Pagination footer reused from incidents.

### 9.3 Person forms + detail (`pages/persons/{new,edit,detail}.tsx`)
`react-hook-form` + `zodResolver`, `max-w-2xl`, four `Card` sections: **Identity** (fullName* ,
alias, DOB, sex, nationality, idType, idNumber, occupation) · **Contact** (address,
contactNumber, email) · **Physical Description** (textarea) · **Notes** (textarea). Only
`fullName` required (`" *"` suffix). `edit.tsx` carries the `beforeunload`/`confirmDiscard`
dirty-guard pattern. Detail page mirrors `incidents/detail.tsx`: bio cards + right-rail quick
facts (DOB + computed age, sex, nationality, ID) + **Linked Cases** list (role `Badge` +
`font-mono` incidentNumber + type/date, linking to `/incidents/:id`).

### 9.4 Incident form (`pages/incidents/{new,edit}.tsx`)
Restructure Core Details: **Grid A** (`md:grid-cols-3`) Date of Incident* · Time* · **Date
Reported*** (default today). **Grid B** Incident Type* (grouped) · **Investigating Officer**.
**Grid C** Status · **Settled Date** (conditional). Then Location*/Description* unchanged.
- **Grouped Type Select:** use native `SelectGroup`+`SelectLabel` (already exported by
  `ui/select.tsx`): group "Crime" (Crime) and "Non-Crime" (Accident, Dispute, Missing Person,
  Other). Drive from a new `INCIDENT_TYPE_GROUPS` + `categoryForType()` in `lib/incident-types.ts`.
  No separate category control (category is a pure function of type).
- **Investigating Officer:** `Controller` `Select` writing `investigatingOfficerId`, populated
  from `useListOfficerRoster` (R3), with an "— Unassigned —" sentinel (Radix forbids empty
  string values → reuse the existing sentinel trick).
- **Settled:** add `settled` to the status `Select`; `form.watch("status")`; render a required
  "Settled Date" `<input type="date">` only when `status === "settled"` (Zod `.superRefine`).
- **Persons Involved** — a new `Card` between Core Details and Supplemental Information (the
  free-text **Witness Statements** textarea stays untouched). `Popover`+`Command` combobox to
  find existing persons; `CommandEmpty` doubles as "＋ Add a new person" opening a `Dialog` with
  a condensed person form (`useCreatePerson`); added parties held in component state
  (`{personId, name, alias, role}[]`) with an inline role `Select` and remove button.
  **new.tsx** sends `personsInvolved: [{personId, role}]` in the create payload so it queues
  atomically offline (§6.6); **edit.tsx** adds/removes links via the `POST`/`DELETE
  /incidents/:id/persons` sub-routes. Brand-new inline person requires connectivity. Extract shared components
  `person-combobox.tsx`, `add-person-dialog.tsx`, `persons-involved-field.tsx` (reused by new & edit).

### 9.5 Incident detail (`pages/incidents/detail.tsx`)
Right rail: **Category badge** (Crime=destructive, Non-Crime=outline); **Date Reported** row;
**Investigating Officer** row; **Settled** row (only when settled). Left column: new **Persons
Involved** card grouped by role (Suspects first, then Victims, Complainants, Witnesses), each a
`Link` to `/persons/:id`; keep visible in print. Centralize `getStatusLabel`/`getStatusColor`
into `lib/incident-status.ts` (currently duplicated in index/detail/dashboard) and add `settled`.

### 9.6 Dashboard (`pages/dashboard.tsx`)
By-type chart unchanged. Add a small **Crime vs Non-Crime** donut derived **client-side** from
existing `typeData` via `categoryForType()` (no new endpoint) using the already-imported
`PieChart`/`Pie`/`Cell`/`Legend`. If `settledIncidents` is added to `DashboardStats` (R4), add a
stat tile.

### 9.7 Routing (`App.tsx`)
Inside `ProtectedApp`'s `<Switch>` after the incidents block (not admin-gated):
`/persons/new`, `/persons/:id/edit`, `/persons/:id`, `/persons` (specific-before-param order).

### 9.8 New shared frontend lib
`lib/person-roles.ts` — `PERSON_ROLES`, `roleLabel()`, `roleBadgeVariant()` (suspect=destructive,
victim=default, complainant=secondary, witness=outline). Extend `lib/incident-types.ts`
(grouping + `categoryForType`) and `lib/incident-status.ts` (add `settled`; centralized helpers).

## 10. Cross-cutting risks & required consistency follow-ons
1. **`settled` must be added to every mirror:** `incidentStatusEnum`, `openapi.yaml IncidentStatus`, generated Zod, `incident-status.ts ALL_STATUSES`, both status graphs, and the `getStatusLabel`/`getStatusColor` maps in 3 files.
2. **`incidentSelect` is duplicated** in `incidents.ts` and `dashboard.ts` — both must gain the new columns and the aliased investigating-officer join, or `/dashboard/recent` omits the new fields. Extract a shared select.
3. **Aliased second self-join** on officers is mandatory (`alias()`), else queries break silently.
4. **Enum ordering** — use `ADD VALUE … BEFORE 'closed'` to avoid a phantom drizzle-kit diff.
5. **`ListIncidentsQueryParams.status`** inline cast must include `settled`, or it's unfilterable.
6. **`category` NOT NULL + server-derived** — migration backfill and `deriveCategory` must apply the identical rule; do not introduce a DB `GENERATED` column (conflicts with the server-SSOT decision).
7. **Dashboard stats** don't count `settled` — add `settledIncidents` (R4) so settled cases aren't invisible in the tiles.
8. **Codegen ordering** — routes referencing `CreatePersonBody` etc. won't typecheck until codegen runs; sequence accordingly.

## 11. Edge-case handling (canonical)

| Scenario | Handling |
|---|---|
| `status=settled` with no `settledDate` | Accept; server sets today. |
| `settledDate` sent with `status ≠ settled` | Force null (invariant wins); no error. |
| `settled → closed` / `settled → under_investigation` | Allowed; clear `settledDate`. |
| Client posts `category` | Stripped; server derives from type. |
| `type` changed on PATCH | `category` recomputed same update. |
| Same person+role linked twice to one incident | Unique violation → 409. |
| Same person, different role, same incident | Allowed. |
| Link to nonexistent incident/person | 404 (checked before insert). |
| Empty search query | All persons, paginated, 200. |
| Delete person linked to any case | 409 (RESTRICT). |
| Delete person with zero links | Allowed. |
| Investigator = reporting officer | Allowed. |
| Bad `investigatingOfficerId` | 400 "Investigating officer not found". |
| Reopen closed/archived case | → under_investigation (admin may force others; logged). |
| Delete incident with linked persons | Links cascade; persons remain. |
| Edit shared person's bio | Propagates to all linked incidents; logged. |
| Offline create-person-then-link | Unsupported in v1; UI links only persisted ids. |
| Future `dateReported` or earlier than incident date | 400 (string compare). |
| Off-format date in any date field | 400 (regex + calendar validity). |

## 12. Open decisions flagged for the user (safe defaults chosen)
- **O1:** `dateReported ≥ incident date` enforced as a hard `400` (default). Could be a soft warning.
- **O2:** `investigatingOfficerId` FK = **ON DELETE SET NULL** (assignment is mutable). Could be RESTRICT for uniformity with reporting officer.
- **O3:** Client-supplied out-of-list `category` is **silently stripped** (matches existing convention). Could be a hard 400 instead.
- **O4:** `settledIncidents` added to dashboard stats (R4) — recommended for consistency; confirm inclusion.

## 13. Testing strategy (TDD)
Per project discipline, write failing tests first where harness exists:
- **DB/migration:** applying 0002–0004 on a fresh db; category backfill correctness; enum value present; unique/FK constraints (duplicate link → error; delete linked person → error; delete incident → links gone).
- **Server routes:** persons CRUD + search (ILIKE, role filter, empty query, pagination, ordering); category derivation on create/update; settled invariant (set/clear); status-transition enforcement incl. `settled`; investigating-officer validation & aliased-name return; link/unlink (owner/admin gate, 404s, 409 duplicate); roster endpoint auth + projection.
- **Frontend:** where component test setup exists — grouped type select, conditional settled-date, persons-involved add/remove, registry search/role filter, routing.
- Full `pnpm run typecheck` and `pnpm run build` must pass; run `pnpm --filter @workspace/api-spec run codegen` and commit generated output.

## 14. File-by-file change list

**DB (`lib/db`):** NEW `src/schema/persons.ts`, `src/schema/incident_persons.ts`, `migrations/0002_incident_status_settled.sql`, `0003_incident_report_fields.sql`, `0004_persons.sql`; EDIT `src/schema/incidents.ts`, `src/schema/index.ts`.

**Contract (`lib/api-spec`):** EDIT `openapi.yaml`; then codegen → regenerated `lib/api-zod/src/generated/**` + `lib/api-client-react/src/generated/**` (commit, don't hand-edit).

**API server (`artifacts/api-server/src`):** NEW `routes/persons.ts`, `lib/assertCanEditIncident.ts`; EDIT `routes/index.ts`, `routes/incidents.ts`, `routes/officers.ts` (roster), `routes/dashboard.ts`, `lib/incidentWorkflow.ts`.

**Frontend (`artifacts/eirf/src`):** NEW `pages/persons/{index,new,detail,edit}.tsx`, `components/{person-combobox,add-person-dialog,persons-involved-field}.tsx`, `lib/person-roles.ts`; EDIT `components/layout.tsx`, `App.tsx`, `pages/incidents/{new,edit,detail,index}.tsx`, `pages/dashboard.tsx`, `lib/incident-types.ts`, `lib/incident-status.ts`.

## 15. Implementation sequence
1. DB schema + migrations (0002–0004); run migrate; verify.
2. `openapi.yaml` edits → `codegen` → typecheck libs.
3. Server: roster, persons routes, incidents edits (category/dates/investigator/settled/links), dashboard, workflow graph, helper; server tests.
4. Frontend: shared libs + hooks, sidebar/routing, persons pages, incident-form additions, detail/dashboard; component tests.
5. Full typecheck + build; **code-reviewer agent** pass; fix; finalize.
