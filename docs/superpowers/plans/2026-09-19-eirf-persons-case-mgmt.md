# e-IRF Persons Registry & Case Enhancements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add report date, an assigned investigator, a `settled` case status, a derived Crime/Non-Crime classification, and a normalized Persons registry (victim/complainant/suspect/witness) with suspect search to the e-IRF app.

**Architecture:** Follow the existing contract-first pipeline — Drizzle schema → hand-written SQL migration → `openapi.yaml` → Orval codegen (`@workspace/api-zod` + `@workspace/api-client-react`) → Express routes → React frontend. New persons live in a normalized `persons` table joined to `incidents` through `incident_persons` (role per link). `category` is derived server-side from `type` (never client-set). `settled` obeys the invariant `status === "settled" ⇔ settledDate not null`.

**Tech Stack:** pnpm workspaces, Node 24, TypeScript 5.9, Express 5, PostgreSQL 17 (Docker) + Drizzle ORM, Zod (Orval-generated), React 19 + Vite + Wouter + TanStack Query + Tailwind 4 + shadcn-style UI. Server tests: `node:test`. No frontend test runner (typecheck + build + browser).

**Spec:** `docs/superpowers/specs/2026-09-19-eirf-persons-and-case-classification-design.md` (read it alongside this plan).

## Global Constraints

- **Enum sync is mandatory.** Every status/type/role/category enum must match across: Drizzle `pgEnum`, the SQL migration, `openapi.yaml`, regenerated Zod, and the frontend companion (`incident-status.ts` etc.). Adding `settled` touches all of them.
- **Migrations are hand-written SQL** in `lib/db/migrations`, run one-transaction-per-file, lexicographically, tracked in `eirf_schema_migrations`. Use idempotent idioms: `ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, `CREATE [UNIQUE] INDEX IF NOT EXISTS`, `DO $$ BEGIN CREATE TYPE … EXCEPTION WHEN duplicate_object THEN NULL; END $$;`.
- **PostgreSQL 17.** `ALTER TYPE … ADD VALUE` runs inside a transaction but the new label **cannot be used in the same transaction** — the `settled` enum-add gets its own migration file that references nothing using `'settled'`.
- **Never hand-edit generated files** (`lib/api-zod/src/generated/**`, `lib/api-client-react/src/generated/**`). Change `openapi.yaml`, then run `pnpm --filter @workspace/api-spec run codegen`.
- **`category` is server-derived only.** Never add it to `IncidentInput`/`IncidentUpdate`. Rule: `type === "Crime" ? "crime" : "non_crime"`.
- **Dates are `text` `YYYY-MM-DD`** (matches existing `date`/`time`). `dateReported` and `settledDate` follow this.
- **Server "today"** = `new Date().toISOString().slice(0, 10)` (UTC, matching `dashboard.ts`).
- **Auth/audit patterns:** cookie `requireAuth`/`requireAdmin`; `req.officer!` identity; `logAction(officerId, ACTION, details)` after every successful mutation; `safeParse` → `400 { error }`; `paramString` + `isNaN` on numeric path params.
- **Roles:** `victim | complainant | suspect | witness`. **Status order:** `open, under_investigation, settled, closed, archived`.
- **Commit** after each task with the trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Work stays on branch `feature/persons-case-mgmt`.

## Review Focus

These are behaviors a user will hit that no *unit* test exercises (no route/DB test harness exists). Each is pinned to an explicit verification step in its owning task:
- **Client tampering with `category`** (POST/PATCH incident with `category:"crime"` on a non-crime type) → must be ignored, server derives. Owner: Task D2 (manual API verification step).
- **Deleting a person linked to any incident** → must return `409`, not a `500` from a raw PG `23503`. Owner: Task D5 (verification step).
- **Duplicate person+role link on one incident** → must return `409`, not `500` from PG `23505`. Owner: Task D4 (verification step).
- **Empty suspect search** (`GET /persons` with no `search`) → must return all persons paginated with `200`, never an error. Owner: Task D5 (verification step).
- **Off-format date** in `dateReported`/`settledDate` (e.g. `09/19/2026`) → must be rejected at validation, protecting `/dashboard/by-month`'s `TO_DATE`. Owner: Task C4 (unit test) + Task D2 (wired-in refinement verification).

---

## PHASE A — Database schema & migrations

### Task A1: Incident fields — `settled` status, `category`, `dateReported`, `investigatingOfficerId`, `settledDate`

**Files:**
- Modify: `lib/db/src/schema/incidents.ts`
- Create: `lib/db/migrations/0002_incident_status_settled.sql`
- Create: `lib/db/migrations/0003_incident_report_fields.sql`

**Interfaces:**
- Produces: `incidentStatusEnum` now includes `"settled"`; new `incidentCategoryEnum` (`"crime" | "non_crime"`); `incidentsTable` columns `dateReported: text`, `investigatingOfficerId: integer|null`, `category: "crime"|"non_crime"` (not null), `settledDate: text|null`. `Incident` type updates automatically.

- [ ] **Step 1: Ensure Docker Postgres is up**

Run: `pnpm run db:up`
Expected: postgres container healthy.

- [ ] **Step 2: Edit the schema enums and columns**

In `lib/db/src/schema/incidents.ts`, change the status enum and add the category enum:

```ts
export const incidentStatusEnum = pgEnum("incident_status", ["open", "under_investigation", "settled", "closed", "archived"]);
export const incidentCategoryEnum = pgEnum("incident_category", ["crime", "non_crime"]);
```

Add these columns to `incidentsTable` immediately after the `notes` column (before `createdAt`):

```ts
  dateReported: text("date_reported"),
  investigatingOfficerId: integer("investigating_officer_id").references(() => officersTable.id, { onDelete: "set null" }),
  category: incidentCategoryEnum("category").notNull(),
  settledDate: text("settled_date"),
```

`text` and `integer` and `officersTable` are already imported. Leave `insertIncidentSchema` as-is (it auto-omits id/createdAt/updatedAt and picks up the new columns).

- [ ] **Step 3: Write migration 0002 (enum value ONLY — isolated)**

Create `lib/db/migrations/0002_incident_status_settled.sql`:

```sql
-- Isolated on purpose: ALTER TYPE ADD VALUE commits the label, but the label
-- cannot be USED in the same transaction. migrate.mjs wraps each file in one
-- transaction, so this file must reference NOTHING that uses 'settled'.
ALTER TYPE incident_status ADD VALUE IF NOT EXISTS 'settled' BEFORE 'closed';
```

- [ ] **Step 4: Write migration 0003 (category + columns + backfill)**

Create `lib/db/migrations/0003_incident_report_fields.sql`:

```sql
DO $$ BEGIN
  CREATE TYPE incident_category AS ENUM ('crime', 'non_crime');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE incidents ADD COLUMN IF NOT EXISTS date_reported text;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS investigating_officer_id integer REFERENCES officers(id) ON DELETE SET NULL;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS settled_date text;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS category incident_category;

UPDATE incidents
   SET category = CASE WHEN type = 'Crime' THEN 'crime'::incident_category ELSE 'non_crime'::incident_category END
 WHERE category IS NULL;

UPDATE incidents SET date_reported = date WHERE date_reported IS NULL;

ALTER TABLE incidents ALTER COLUMN category SET NOT NULL;
```

- [ ] **Step 5: Apply migrations**

Run: `pnpm --filter @workspace/db run migrate`
Expected: 0002 and 0003 recorded; no errors.

- [ ] **Step 6: Verify the schema and backfill in the database**

Run:
```bash
docker compose exec -T postgres psql -U eirf -d eirf -c "\d incidents" -c "SELECT unnest(enum_range(NULL::incident_status));" -c "SELECT category, count(*) FROM incidents GROUP BY category;"
```
Expected: `incidents` shows `date_reported text`, `investigating_officer_id integer`, `settled_date text`, `category incident_category NOT NULL`; the status enum lists `open, under_investigation, settled, closed, archived`; every existing row has a non-null `category`.

- [ ] **Step 7: Typecheck the db package**

Run: `pnpm --filter @workspace/db exec tsc --noEmit -p tsconfig.json` (or `pnpm run typecheck:libs`)
Expected: passes.

- [ ] **Step 8: Commit**

```bash
git add lib/db/src/schema/incidents.ts lib/db/migrations/0002_incident_status_settled.sql lib/db/migrations/0003_incident_report_fields.sql
git commit -m "feat(db): add settled status, category, dateReported, investigator, settledDate to incidents"
```

### Task A2: `persons` and `incident_persons` schema + migration

**Files:**
- Create: `lib/db/src/schema/persons.ts`
- Create: `lib/db/src/schema/incident_persons.ts`
- Modify: `lib/db/src/schema/index.ts`
- Create: `lib/db/migrations/0004_persons.sql`

**Interfaces:**
- Produces: `personsTable`, `Person`, `insertPersonSchema`; `incidentPersonsTable`, `IncidentPerson`, `insertIncidentPersonSchema`, `personRoleEnum` (`victim|complainant|suspect|witness`).

- [ ] **Step 1: Create `persons.ts`**

```ts
import { pgTable, text, serial, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const personsTable = pgTable("persons", {
  id: serial("id").primaryKey(),
  fullName: text("full_name").notNull(),
  alias: text("alias"),
  dateOfBirth: text("date_of_birth"),
  sex: text("sex"),
  nationality: text("nationality"),
  address: text("address"),
  contactNumber: text("contact_number"),
  email: text("email"),
  idType: text("id_type"),
  idNumber: text("id_number"),
  occupation: text("occupation"),
  physicalDescription: text("physical_description"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  fullNameIdx: index("persons_full_name_idx").on(t.fullName),
  aliasIdx: index("persons_alias_idx").on(t.alias),
}));

export const insertPersonSchema = createInsertSchema(personsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPerson = z.infer<typeof insertPersonSchema>;
export type Person = typeof personsTable.$inferSelect;
```

- [ ] **Step 2: Create `incident_persons.ts`**

```ts
import { pgTable, serial, integer, text, timestamp, pgEnum, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { incidentsTable } from "./incidents";
import { personsTable } from "./persons";

export const personRoleEnum = pgEnum("person_role", ["victim", "complainant", "suspect", "witness"]);

export const incidentPersonsTable = pgTable("incident_persons", {
  id: serial("id").primaryKey(),
  incidentId: integer("incident_id").notNull().references(() => incidentsTable.id, { onDelete: "cascade" }),
  personId: integer("person_id").notNull().references(() => personsTable.id, { onDelete: "restrict" }),
  role: personRoleEnum("role").notNull(),
  roleDetails: text("role_details"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  linkUnique: uniqueIndex("incident_persons_incident_person_role_unique").on(t.incidentId, t.personId, t.role),
  incidentIdx: index("incident_persons_incident_id_idx").on(t.incidentId),
  personIdx: index("incident_persons_person_id_idx").on(t.personId),
}));

export const insertIncidentPersonSchema = createInsertSchema(incidentPersonsTable).omit({ id: true, createdAt: true });
export type InsertIncidentPerson = z.infer<typeof insertIncidentPersonSchema>;
export type IncidentPerson = typeof incidentPersonsTable.$inferSelect;
```

- [ ] **Step 3: Export from `index.ts`**

Append to `lib/db/src/schema/index.ts` (persons before the join, which imports it):

```ts
export * from "./persons";
export * from "./incident_persons";
```

- [ ] **Step 4: Write migration 0004**

Create `lib/db/migrations/0004_persons.sql`:

```sql
DO $$ BEGIN
  CREATE TYPE person_role AS ENUM ('victim', 'complainant', 'suspect', 'witness');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS persons (
  id serial PRIMARY KEY,
  full_name text NOT NULL,
  alias text,
  date_of_birth text,
  sex text,
  nationality text,
  address text,
  contact_number text,
  email text,
  id_type text,
  id_number text,
  occupation text,
  physical_description text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS persons_full_name_idx ON persons(full_name);
CREATE INDEX IF NOT EXISTS persons_alias_idx ON persons(alias);

CREATE TABLE IF NOT EXISTS incident_persons (
  id serial PRIMARY KEY,
  incident_id integer NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  person_id integer NOT NULL REFERENCES persons(id) ON DELETE RESTRICT,
  role person_role NOT NULL,
  role_details text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS incident_persons_incident_person_role_unique ON incident_persons(incident_id, person_id, role);
CREATE INDEX IF NOT EXISTS incident_persons_incident_id_idx ON incident_persons(incident_id);
CREATE INDEX IF NOT EXISTS incident_persons_person_id_idx ON incident_persons(person_id);
```

- [ ] **Step 5: Apply and verify**

Run: `pnpm --filter @workspace/db run migrate`
Then:
```bash
docker compose exec -T postgres psql -U eirf -d eirf -c "\d persons" -c "\d incident_persons"
```
Expected: both tables exist; `incident_persons` has the unique index on `(incident_id, person_id, role)`, FK `incident_id … ON DELETE CASCADE`, FK `person_id … ON DELETE RESTRICT`.

- [ ] **Step 6: Verify constraint behavior**

```bash
docker compose exec -T postgres psql -U eirf -d eirf -c "INSERT INTO persons (full_name) VALUES ('Test Person') RETURNING id;"
```
Then attempt to delete an incident that has a link (after linking) and confirm cascade; attempt to delete a linked person and confirm RESTRICT error. (These are re-verified end-to-end in D4/D5.) Clean up the test row afterward: `DELETE FROM persons WHERE full_name='Test Person';`

- [ ] **Step 7: Typecheck**

Run: `pnpm run typecheck:libs`
Expected: passes.

- [ ] **Step 8: Commit**

```bash
git add lib/db/src/schema/persons.ts lib/db/src/schema/incident_persons.ts lib/db/src/schema/index.ts lib/db/migrations/0004_persons.sql
git commit -m "feat(db): add persons and incident_persons tables"
```

---

## PHASE B — API contract + codegen

### Task B1: OpenAPI schemas & paths + regenerate

**Files:**
- Modify: `lib/api-spec/openapi.yaml`
- Regenerated: `lib/api-zod/src/generated/**`, `lib/api-client-react/src/generated/**`

**Interfaces:**
- Produces server Zod: `CreatePersonBody`, `UpdatePersonBody`, `ListPersonsQueryParams`, `AddIncidentPersonBody`, plus extended `CreateIncidentBody`/`UpdateIncidentBody`. Produces React hooks: `useListPersons`, `useGetPerson`, `useCreatePerson`, `useUpdatePerson`, `useDeletePerson`, `useGetPersonIncidents`, `useListIncidentPersons`, `useAddIncidentPerson`, `useRemoveIncidentPerson`, `useListOfficerRoster`. (Names follow the existing operationId→export convention; confirm against regenerated output.)

- [ ] **Step 1: Add `settled` to `IncidentStatus`**

In `openapi.yaml`, find the `IncidentStatus` schema and set `enum: [open, under_investigation, settled, closed, archived]`. Update its sync comment.

- [ ] **Step 2: Add new component schemas**

Under `components.schemas`, add (mirroring the style of `Incident`/`Officer`):
- `IncidentCategory`: `{ type: string, enum: [crime, non_crime] }`
- `PersonRole`: `{ type: string, enum: [victim, complainant, suspect, witness] }`
- `Person`: object, `required: [id, fullName, createdAt, updatedAt]`; `id:int`; `fullName:string`; optional nullable strings `alias, dateOfBirth, sex, nationality, address, contactNumber, email, idType, idNumber, occupation, physicalDescription, notes`; `createdAt:string`, `updatedAt:string`.
- `PersonInput`: `required: [fullName]`; `fullName:string`; the same fields as plain `string`.
- `PersonUpdate`: no required; all the same fields optional.
- `IncidentPersonInput`: `required: [personId, role]`; `personId:int`; `role: $ref PersonRole`; `roleDetails: string`.
- `IncidentPerson`: `required: [id, incidentId, personId, role, person, createdAt]`; `id:int`, `incidentId:int`, `personId:int`, `role: $ref PersonRole`, `roleDetails: [string,null]`, `person: $ref Person`, `createdAt:string`.
- `PersonIncident`: all `Incident` properties **plus** `role: $ref PersonRole` and `roleDetails: [string,null]` (copy the Incident properties; this spec does not use `allOf`).
- `PersonListResponse`: `{ persons: [Person], total:int, page:int, limit:int }` (mirror `IncidentListResponse`).
- `OfficerRosterEntry`: `required: [id, name, rank, badgeNumber]`; `id:int, name:string, rank:string, badgeNumber:string`.

- [ ] **Step 3: Extend `Incident`, `IncidentInput`, `IncidentUpdate`**

- `Incident`: add `dateReported: [string,null]`, `investigatingOfficerId: [integer,null]`, `investigatingOfficerName: [string,null]`, `settledDate: [string,null]`, `category: $ref IncidentCategory` (add `category` to `required`), and optional `persons: { type: array, items: $ref IncidentPerson }`.
- `IncidentInput`: add `dateReported: string`, `investigatingOfficerId: integer`, and optional `personsInvolved: { type: array, items: $ref IncidentPersonInput }`.
- `IncidentUpdate`: add `dateReported` and `investigatingOfficerId` (nullable). **Do not** add `category`/`settledDate`/`personsInvolved`.

- [ ] **Step 4: Add paths**

Add a top-level `tags` entry `persons`. Add:
- `/officers/roster` — `get listOfficerRoster` → `200` array of `OfficerRosterEntry`.
- `/persons` — `get listPersons` (query: `search:string`, `role: $ref PersonRole`, `page:int`, `limit:int`) → `PersonListResponse`; `post createPerson` (body `PersonInput`) → `201` `Person`.
- `/persons/{id}` — `get getPerson` → `Person`; `patch updatePerson` (body `PersonUpdate`) → `Person`; `delete deletePerson` → `MessageResponse` (+ document `409`).
- `/persons/{id}/incidents` — `get getPersonIncidents` → array of `PersonIncident`.
- `/incidents/{id}/persons` — `get listIncidentPersons` → array `IncidentPerson`; `post addIncidentPerson` (body `IncidentPersonInput`) → `201` `IncidentPerson` (mirror the `/incidents/{id}/evidence` block; `tags: [incidents]`).
- `/incidents/{id}/persons/{linkId}` — `delete removeIncidentPerson` → `MessageResponse`.

Ensure the `listIncidents` `status` query param resolves to the updated `IncidentStatus` (with `settled`). Optionally add a `category` query param (`$ref IncidentCategory`).

- [ ] **Step 5: Regenerate**

Run: `pnpm --filter @workspace/api-spec run codegen`
Expected: Orval regenerates both packages **and** `typecheck:libs` passes. If typecheck fails, fix `openapi.yaml` — do not edit generated files.

- [ ] **Step 6: Confirm generated names**

Run: `git status --short lib/api-zod lib/api-client-react` and open the regenerated `lib/api-client-react/src/generated/api.ts` to confirm the hook names above exist. Note actual export names if they differ from the assumptions.

- [ ] **Step 7: Commit**

```bash
git add lib/api-spec/openapi.yaml lib/api-zod lib/api-client-react
git commit -m "feat(api): contract for persons, incident persons, officer roster, and new incident fields"
```

---

## PHASE C — Server pure-logic helpers (TDD)

> Tests run with `node --experimental-strip-types --test src/lib/*.test.ts` (the existing `pnpm --filter @workspace/api-server run test` glob). Keep every testable helper in `artifacts/api-server/src/lib/`.

### Task C1: `deriveCategory` classification helper

**Files:**
- Create: `artifacts/api-server/src/lib/incidentClassification.ts`
- Create: `artifacts/api-server/src/lib/incidentClassification.test.ts`

**Interfaces:**
- Produces: `deriveCategory(type: string): "crime" | "non_crime"`.

- [ ] **Step 1: Write the failing test**

`incidentClassification.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveCategory } from "./incidentClassification.ts";

test("Crime maps to crime", () => {
  assert.equal(deriveCategory("Crime"), "crime");
});

test("non-crime types map to non_crime", () => {
  for (const t of ["Accident", "Dispute", "Missing Person", "Other"]) {
    assert.equal(deriveCategory(t), "non_crime");
  }
});

test("unknown type defaults to non_crime", () => {
  assert.equal(deriveCategory("Anything Else"), "non_crime");
});
```

- [ ] **Step 2: Run it, expect failure**

Run: `pnpm --filter @workspace/api-server run test`
Expected: FAIL (module/function not found).

- [ ] **Step 3: Implement**

`incidentClassification.ts`:
```ts
export type IncidentCategory = "crime" | "non_crime";

export function deriveCategory(type: string): IncidentCategory {
  return type === "Crime" ? "crime" : "non_crime";
}
```

- [ ] **Step 4: Run, expect pass**

Run: `pnpm --filter @workspace/api-server run test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/lib/incidentClassification.ts artifacts/api-server/src/lib/incidentClassification.test.ts
git commit -m "feat(api): deriveCategory helper with tests"
```

### Task C2: `settled` status transitions

**Files:**
- Modify: `artifacts/api-server/src/lib/incidentWorkflow.ts`
- Create: `artifacts/api-server/src/lib/incidentWorkflow.test.ts`

**Interfaces:**
- Consumes: existing `isAllowedStatusTransition(from, to)` / `STATUS_TRANSITIONS`.
- Produces: transition graph including `settled` per the spec.

- [ ] **Step 1: Read the current file** to learn the exact exported names and shape of `STATUS_TRANSITIONS` and `isAllowedStatusTransition`.

- [ ] **Step 2: Write the failing test**

`incidentWorkflow.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { isAllowedStatusTransition } from "./incidentWorkflow.ts";

test("open -> settled allowed", () => assert.equal(isAllowedStatusTransition("open", "settled"), true));
test("under_investigation -> settled allowed", () => assert.equal(isAllowedStatusTransition("under_investigation", "settled"), true));
test("settled -> under_investigation allowed (reopen)", () => assert.equal(isAllowedStatusTransition("settled", "under_investigation"), true));
test("settled -> closed allowed", () => assert.equal(isAllowedStatusTransition("settled", "closed"), true));
test("settled -> archived NOT allowed (must pass through closed)", () => assert.equal(isAllowedStatusTransition("settled", "archived"), false));
test("settled -> settled allowed (no-op)", () => assert.equal(isAllowedStatusTransition("settled", "settled"), true));
```

- [ ] **Step 3: Run, expect failure**

Run: `pnpm --filter @workspace/api-server run test`
Expected: FAIL on the `settled` cases.

- [ ] **Step 4: Update the graph**

In `incidentWorkflow.ts`, set the transitions (self always allowed, matching the existing shape):
```ts
open:                ["open", "under_investigation", "closed", "settled"],
under_investigation: ["under_investigation", "open", "closed", "settled"],
settled:             ["settled", "under_investigation", "closed"],
closed:              ["closed", "under_investigation", "archived"],
archived:            ["archived", "under_investigation"],
```
Preserve the existing type of the status key (add `"settled"` to any status union type in this file).

- [ ] **Step 5: Run, expect pass**

Run: `pnpm --filter @workspace/api-server run test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add artifacts/api-server/src/lib/incidentWorkflow.ts artifacts/api-server/src/lib/incidentWorkflow.test.ts
git commit -m "feat(api): add settled to incident status transition graph"
```

### Task C3: `settledDate` invariant resolver

**Files:**
- Create: `artifacts/api-server/src/lib/settledDate.ts`
- Create: `artifacts/api-server/src/lib/settledDate.test.ts`

**Interfaces:**
- Produces: `resolveSettledDate(nextStatus: string, suppliedDate: string | null | undefined, today: string): string | null` — returns a date when status is `settled` (supplied if a valid `YYYY-MM-DD`, else `today`); returns `null` for any other status.

- [ ] **Step 1: Write the failing test**

`settledDate.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveSettledDate } from "./settledDate.ts";

const TODAY = "2026-09-19";
test("settled with no supplied date -> today", () => assert.equal(resolveSettledDate("settled", undefined, TODAY), TODAY));
test("settled with valid supplied date -> supplied", () => assert.equal(resolveSettledDate("settled", "2026-09-10", TODAY), "2026-09-10"));
test("settled with invalid supplied date -> today", () => assert.equal(resolveSettledDate("settled", "09/10/2026", TODAY), TODAY));
test("closed -> null (cleared)", () => assert.equal(resolveSettledDate("closed", "2026-09-10", TODAY), null));
test("under_investigation -> null", () => assert.equal(resolveSettledDate("under_investigation", null, TODAY), null));
```

- [ ] **Step 2: Run, expect failure**

Run: `pnpm --filter @workspace/api-server run test`
Expected: FAIL.

- [ ] **Step 3: Implement**

`settledDate.ts`:
```ts
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const d = new Date(value + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function resolveSettledDate(
  nextStatus: string,
  suppliedDate: string | null | undefined,
  today: string,
): string | null {
  if (nextStatus !== "settled") return null;
  if (suppliedDate && isValidIsoDate(suppliedDate)) return suppliedDate;
  return today;
}
```

- [ ] **Step 4: Run, expect pass**

Run: `pnpm --filter @workspace/api-server run test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/lib/settledDate.ts artifacts/api-server/src/lib/settledDate.test.ts
git commit -m "feat(api): settledDate invariant resolver with tests"
```

### Task C4: Reported-date validation helper

**Files:**
- Create: `artifacts/api-server/src/lib/reportedDate.ts`
- Create: `artifacts/api-server/src/lib/reportedDate.test.ts`

**Interfaces:**
- Consumes: `isValidIsoDate` from `settledDate.ts`.
- Produces: `validateReportedDate(dateReported: string, incidentDate: string, today: string): { ok: true } | { ok: false; error: string }` — enforces format, not-future, and `>= incidentDate`.

- [ ] **Step 1: Write the failing test**

`reportedDate.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateReportedDate } from "./reportedDate.ts";

const TODAY = "2026-09-19";
test("valid same-day report", () => assert.deepEqual(validateReportedDate("2026-09-19", "2026-09-19", TODAY), { ok: true }));
test("report after incident is fine", () => assert.deepEqual(validateReportedDate("2026-09-19", "2026-09-10", TODAY), { ok: true }));
test("off-format rejected", () => assert.equal(validateReportedDate("09/19/2026", "2026-09-10", TODAY).ok, false));
test("future report rejected", () => assert.equal(validateReportedDate("2026-09-20", "2026-09-10", TODAY).ok, false));
test("report before incident rejected", () => assert.equal(validateReportedDate("2026-09-05", "2026-09-10", TODAY).ok, false));
```

- [ ] **Step 2: Run, expect failure**

Run: `pnpm --filter @workspace/api-server run test`
Expected: FAIL.

- [ ] **Step 3: Implement**

`reportedDate.ts`:
```ts
import { isValidIsoDate } from "./settledDate.ts";

export function validateReportedDate(dateReported: string, incidentDate: string, today: string):
  | { ok: true }
  | { ok: false; error: string } {
  if (!isValidIsoDate(dateReported)) return { ok: false, error: "dateReported must be a valid YYYY-MM-DD date" };
  if (dateReported > today) return { ok: false, error: "dateReported cannot be in the future" };
  if (isValidIsoDate(incidentDate) && dateReported < incidentDate) return { ok: false, error: "dateReported cannot be before the incident date" };
  return { ok: true };
}
```

- [ ] **Step 4: Run, expect pass**

Run: `pnpm --filter @workspace/api-server run test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/lib/reportedDate.ts artifacts/api-server/src/lib/reportedDate.test.ts
git commit -m "feat(api): reported-date validation helper with tests"
```

---

## PHASE D — Server routes

### Task D1: Officer roster endpoint (all authenticated users)

**Files:**
- Modify: `artifacts/api-server/src/routes/officers.ts`

**Interfaces:**
- Produces: `GET /officers/roster` (`requireAuth`) → `[{ id, name, rank, badgeNumber }]`.

- [ ] **Step 1: Read `officers.ts`** to match its Router/handler/formatting style and imports (`requireAuth` vs `requireAdmin`, `db`, `officersTable`).

- [ ] **Step 2: Add the roster route**

Add a `requireAuth` (not `requireAdmin`) handler that selects only the projection and returns an array:
```ts
router.get("/officers/roster", requireAuth, async (_req, res) => {
  const rows = await db
    .select({ id: officersTable.id, name: officersTable.name, rank: officersTable.rank, badgeNumber: officersTable.badgeNumber })
    .from(officersTable)
    .orderBy(officersTable.name);
  res.json(rows);
});
```
Place it **before** any `/officers/:id` route so `roster` is not captured as an `:id`.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @workspace/api-server run typecheck`
Expected: passes.

- [ ] **Step 4: Manual verify (server running)**

Start the stack (`.\dev.ps1` or `pnpm --filter @workspace/api-server run dev`), log in as a **non-admin** officer, then:
```bash
curl -s -b cookies.txt http://localhost:5000/api/officers/roster
```
Expected: `200` with the roster array (no `passwordHash`/`username`).

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/routes/officers.ts
git commit -m "feat(api): add non-admin GET /officers/roster"
```

### Task D2: Incidents create/update — category, dateReported, investigator, settledDate, aliased join

**Files:**
- Modify: `artifacts/api-server/src/routes/incidents.ts`

**Interfaces:**
- Consumes: `deriveCategory` (C1), `resolveSettledDate` (C3), `validateReportedDate` (C4), `isAllowedStatusTransition` (C2).
- Produces: create/update that set `category`, `dateReported`, `investigatingOfficerId`, `settledDate`; `incidentSelect` returning the new fields incl. `investigatingOfficerName`.

- [ ] **Step 1: Read `incidents.ts`** fully (POST, PATCH, `incidentSelect`, the existing single officer leftJoin, the owner-or-admin gate, `23505` handling).

- [ ] **Step 2: Add the aliased investigating-officer join to `incidentSelect`**

```ts
import { alias } from "drizzle-orm/pg-core";
const investigatingOfficer = alias(officersTable, "investigating_officer");
```
Add to the `incidentSelect` object: `investigatingOfficerId: incidentsTable.investigatingOfficerId`, `investigatingOfficerName: investigatingOfficer.name`, `dateReported: incidentsTable.dateReported`, `category: incidentsTable.category`, `settledDate: incidentsTable.settledDate`. Add `.leftJoin(investigatingOfficer, eq(incidentsTable.investigatingOfficerId, investigatingOfficer.id))` to **every** query that uses `incidentSelect`.

- [ ] **Step 3: POST /incidents — derive & default**

In the `.values({...})`, add:
```ts
category: deriveCategory(data.type),
dateReported: data.dateReported ?? new Date().toISOString().slice(0, 10),
investigatingOfficerId: data.investigatingOfficerId ?? null,
settledDate: resolveSettledDate(data.status ?? "open", null, new Date().toISOString().slice(0, 10)),
```
If `data.dateReported` is provided, validate it with `validateReportedDate(data.dateReported, data.date, today)` and return `400 { error }` on failure. If `investigatingOfficerId` provided, verify it exists (`400 "Investigating officer not found"`).

- [ ] **Step 4: PATCH /incidents/:id — computed updates**

Replace the blind `db.update(...).set(parsed.data)` with a computed `updates` object (like `updateOfficer`). Rules:
- If `type` present: `updates.category = deriveCategory(type)`.
- If `status` present (after the existing transition check): `updates.settledDate = resolveSettledDate(status, parsed.data.settledDate, today)` and `updates.status = status`.
- If `dateReported` present: validate (`400` on failure), then set.
- If `investigatingOfficerId` present: verify existence (`400`), set (allow `null` to unassign).
- Never read `category` from the client.

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @workspace/api-server run typecheck`
Expected: passes.

- [ ] **Step 6: Manual verify — category tampering & dates (Review Focus)**

With the server running and logged in:
```bash
# category tampering: send category=crime on a non-crime type -> stored non_crime
curl -s -b cookies.txt -X POST http://localhost:5000/api/incidents -H 'Content-Type: application/json' \
  -d '{"date":"2026-09-19","time":"10:00","location":"HQ","type":"Accident","description":"test description over ten chars","category":"crime"}'
# off-format dateReported -> 400
curl -s -b cookies.txt -X POST http://localhost:5000/api/incidents -H 'Content-Type: application/json' \
  -d '{"date":"2026-09-19","time":"10:00","location":"HQ","type":"Crime","description":"test description over ten chars","dateReported":"09/19/2026"}'
```
Expected: first returns an incident with `category:"non_crime"`; second returns `400`.

- [ ] **Step 7: Commit**

```bash
git add artifacts/api-server/src/routes/incidents.ts
git commit -m "feat(api): derive category, manage settledDate, add dateReported & investigator on incidents"
```

### Task D3: Persons on incident detail + transactional link-on-create

**Files:**
- Modify: `artifacts/api-server/src/routes/incidents.ts`

**Interfaces:**
- Consumes: `incidentPersonsTable`, `personsTable`.
- Produces: `GET /incidents/:id` response includes `persons: IncidentPerson[]`; `POST /incidents` inserts `personsInvolved` links in the same transaction.

- [ ] **Step 1: Attach persons to detail**

In `GET /incidents/:id`, after loading the incident, query links joined to persons for that `incidentId` and attach as `persons`. Shape each element to match the `IncidentPerson` schema (`{ id, incidentId, personId, role, roleDetails, person, createdAt }`).

- [ ] **Step 2: Transactional link-on-create**

In `POST /incidents`, if `data.personsInvolved?.length`, wrap the incident insert and the link inserts in `db.transaction(async (tx) => { ... })`. De-duplicate `(personId, role)` pairs before insert. Skip/ignore links whose `personId` does not exist (or fail the whole insert with `400` — choose fail-closed: validate all personIds exist first, else `400 "Unknown personId in personsInvolved"`).

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @workspace/api-server run typecheck`
Expected: passes.

- [ ] **Step 4: Manual verify**

Create a person (Task D5 endpoint) then POST an incident with `personsInvolved:[{personId,role:"suspect"}]`; GET the incident and confirm `persons` contains the link with the embedded person.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/routes/incidents.ts
git commit -m "feat(api): include persons in incident detail and link on create"
```

### Task D4: Incident↔person link/unlink sub-routes + edit-permission helper

**Files:**
- Create: `artifacts/api-server/src/lib/assertCanEditIncident.ts`
- Modify: `artifacts/api-server/src/routes/incidents.ts`

**Interfaces:**
- Produces: `POST /incidents/:id/persons`, `DELETE /incidents/:id/persons/:linkId`; helper `assertCanEditIncident(incident, officer): boolean` (reporting officer or admin).

- [ ] **Step 1: Extract the edit-permission helper**

Read the existing owner-or-admin check inside `PATCH /incidents/:id` and move it to `assertCanEditIncident.ts` as a pure function returning boolean; use it in `PATCH` (refactor, behavior unchanged).

- [ ] **Step 2: Add link route**

`POST /incidents/:id/persons` (`requireAuth`): validate incident exists (`404`), validate person exists (`404`), assert edit permission (`403`), parse `AddIncidentPersonBody`, insert into `incident_persons`; wrap in try/catch → on PG `23505` return `409 { error: "Person already linked with that role" }`; `logAction(officer.id, "LINK_PERSON_TO_INCIDENT", ...)`; return `201` with the created `IncidentPerson`.

- [ ] **Step 3: Add unlink route**

`DELETE /incidents/:id/persons/:linkId` (`requireAuth`): assert edit permission; delete by `incident_persons.id` scoped to `incidentId`; `logAction("UNLINK_PERSON_FROM_INCIDENT")`; return `MessageResponse`.

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @workspace/api-server run typecheck`
Expected: passes.

- [ ] **Step 5: Manual verify — duplicate link 409 (Review Focus)**

Link a person+role, then link the same person+role again to the same incident.
Expected: first `201`, second `409` (not `500`).

- [ ] **Step 6: Commit**

```bash
git add artifacts/api-server/src/lib/assertCanEditIncident.ts artifacts/api-server/src/routes/incidents.ts
git commit -m "feat(api): incident person link/unlink routes with edit-permission helper"
```

### Task D5: Persons routes (search + CRUD + linked incidents)

**Files:**
- Create: `artifacts/api-server/src/routes/persons.ts`
- Modify: `artifacts/api-server/src/routes/index.ts`

**Interfaces:**
- Consumes: `personsTable`, `incidentPersonsTable`, `incidentsTable`, generated Zod (`CreatePersonBody`, `UpdatePersonBody`, `ListPersonsQueryParams`).
- Produces: `GET/POST /persons`, `GET/PATCH/DELETE /persons/:id`, `GET /persons/:id/incidents`.

- [ ] **Step 1: Read `officers.ts` and `incidents.ts`** to mirror Router setup, `safeParse`, `paramString`+`isNaN`, `logAction`, and the `ilike`/pagination pattern from `listIncidents`.

- [ ] **Step 2: Implement `persons.ts`**

- `GET /persons` (`requireAuth`): parse `ListPersonsQueryParams`; build `where`: if `search`, `or(ilike(fullName,'%s%'), ilike(alias,'%s%'), ilike(idNumber,'%s%'))`; if `role`, restrict to persons with a matching `incident_persons.role` (use a subquery / `inArray` on person ids from the join). Paginate (`page` default 1, `limit` default 20, `offset=(page-1)*limit`), `orderBy(fullName, id)`; return `{ persons, total, page, limit }`.
- `POST /persons` (`requireAuth`): insert; `logAction("CREATE_PERSON")`; `201`.
- `GET /persons/:id` (`requireAuth`).
- `PATCH /persons/:id` (`requireAuth`): partial `updates`; `logAction("UPDATE_PERSON")`.
- `DELETE /persons/:id` (`requireAdmin`): try/catch → PG `23503` → `409 { error: "Person is linked to incidents; unlink them first" }`.
- `GET /persons/:id/incidents` (`requireAuth`): join `incident_persons` → `incidents`, return incidents with `role`/`roleDetails`.

Add a `formatPerson()` helper that ISO-formats timestamps (mirror `formatIncident`).

- [ ] **Step 3: Register the router**

In `routes/index.ts`: `import persons from "./persons";` and `router.use(persons);`.

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @workspace/api-server run typecheck`
Expected: passes.

- [ ] **Step 5: Manual verify — empty search & delete-linked (Review Focus)**

```bash
curl -s -b cookies.txt "http://localhost:5000/api/persons"          # empty search -> all, 200
curl -s -b cookies.txt "http://localhost:5000/api/persons?role=suspect"
# link a person to an incident (D4), then:
curl -s -b cookies.txt -X DELETE http://localhost:5000/api/persons/<linkedId>   # -> 409, not 500
```
Expected: empty search returns `{persons,total,page,limit}` with `200`; deleting a linked person returns `409`.

- [ ] **Step 6: Commit**

```bash
git add artifacts/api-server/src/routes/persons.ts artifacts/api-server/src/routes/index.ts
git commit -m "feat(api): persons routes (search, CRUD, linked incidents)"
```

### Task D6: Dashboard — shared select, settled count, category counts

**Files:**
- Modify: `artifacts/api-server/src/routes/dashboard.ts`
- Modify: `lib/api-spec/openapi.yaml` (+ codegen) if adding `settledIncidents`/by-category

**Interfaces:**
- Produces: dashboard `incidentSelect` includes new columns; `DashboardStats` gains `settledIncidents`; optional `GET /dashboard/by-category`.

- [ ] **Step 1: Sync the duplicated `incidentSelect`**

Update `dashboard.ts`'s `incidentSelect` to include `dateReported`, `investigatingOfficerId`, `investigatingOfficerName` (aliased join), `category`, `settledDate` — matching Task D2. (Recommended: extract a shared `incidentSelect` builder into `artifacts/api-server/src/lib/` and import in both routes.)

- [ ] **Step 2: Add settled to stats**

Add `settledIncidents` to the `/dashboard/stats` aggregate and to the `DashboardStats` openapi schema; run `pnpm --filter @workspace/api-spec run codegen`.

- [ ] **Step 3 (optional): `GET /dashboard/by-category`** returning `[{category,count}]` for both buckets.

- [ ] **Step 4: Typecheck + verify**

Run: `pnpm --filter @workspace/api-server run typecheck` and hit `/api/dashboard/stats` (expect `settledIncidents`).

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/routes/dashboard.ts lib/api-spec/openapi.yaml lib/api-zod lib/api-client-react
git commit -m "feat(api): dashboard includes new incident fields and settled count"
```

---

## PHASE E — Frontend shared libraries

### Task E1: Person roles SSOT

**Files:**
- Create: `artifacts/eirf/src/lib/person-roles.ts`

**Interfaces:**
- Produces: `PERSON_ROLES`, `PersonRole` type, `roleLabel(role)`, `roleBadgeVariant(role)`.

- [ ] **Step 1: Implement**

```ts
export const PERSON_ROLES = ["victim", "complainant", "suspect", "witness"] as const;
export type PersonRole = (typeof PERSON_ROLES)[number];

export function roleLabel(role: PersonRole): string {
  return { victim: "Victim", complainant: "Complainant", suspect: "Suspect", witness: "Witness" }[role];
}
export function roleBadgeVariant(role: PersonRole): "default" | "secondary" | "destructive" | "outline" {
  return { suspect: "destructive", victim: "default", complainant: "secondary", witness: "outline" }[role] as any;
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @workspace/eirf run typecheck`
Expected: passes.

- [ ] **Step 3: Commit** `git commit -m "feat(web): person roles SSOT"`

### Task E2: Incident type grouping + `categoryForType`

**Files:**
- Modify: `artifacts/eirf/src/lib/incident-types.ts`

**Interfaces:**
- Consumes: existing `INCIDENT_TYPES`.
- Produces: `INCIDENT_TYPE_GROUPS: { label: string; types: IncidentType[] }[]`, `categoryForType(type): "crime" | "non_crime"`.

- [ ] **Step 1: Implement (keep the existing `INCIDENT_TYPES` unchanged)**

```ts
export const INCIDENT_TYPE_GROUPS = [
  { label: "Crime", types: ["Crime"] as IncidentType[] },
  { label: "Non-Crime", types: ["Accident", "Dispute", "Missing Person", "Other"] as IncidentType[] },
];
export function categoryForType(type: IncidentType): "crime" | "non_crime" {
  return type === "Crime" ? "crime" : "non_crime";
}
```

- [ ] **Step 2: Typecheck** `pnpm --filter @workspace/eirf run typecheck`

- [ ] **Step 3: Commit** `git commit -m "feat(web): crime/non-crime type grouping helper"`

### Task E3: `settled` status + centralized status label/color

**Files:**
- Modify: `artifacts/eirf/src/lib/incident-status.ts`
- Modify: `artifacts/eirf/src/pages/incidents/index.tsx`, `artifacts/eirf/src/pages/incidents/detail.tsx`, `artifacts/eirf/src/pages/dashboard.tsx`

**Interfaces:**
- Produces: `ALL_STATUSES`/`STATUS_TRANSITIONS` include `settled`; centralized `getStatusLabel(status)` and `getStatusColor(status)` exported from `incident-status.ts`.

- [ ] **Step 1: Read `incident-status.ts`** and the three consumers to capture the current label/color maps.

- [ ] **Step 2: Add `settled`** to `ALL_STATUSES` and `STATUS_TRANSITIONS` (mirror the server graph from C2). Add `settled` to the label map ("Settled") and color map (choose a distinct token, e.g. an emerald/teal class consistent with the palette).

- [ ] **Step 3: Centralize** `getStatusLabel`/`getStatusColor` into `incident-status.ts`; replace the duplicated copies in `index.tsx`, `detail.tsx`, `dashboard.tsx` with imports.

- [ ] **Step 4: Typecheck + build** `pnpm --filter @workspace/eirf run typecheck && pnpm --filter @workspace/eirf run build`

- [ ] **Step 5: Commit** `git commit -m "feat(web): add settled status and centralize status label/color"`

---

## PHASE F — Frontend Persons module

### Task F1: Routing + sidebar entry

**Files:**
- Modify: `artifacts/eirf/src/components/layout.tsx`
- Modify: `artifacts/eirf/src/App.tsx`

- [ ] **Step 1: Sidebar** — import `UserSearch` from `lucide-react`; add `{ href: "/persons", label: "Persons", icon: UserSearch }` to the base `navItems` array (after "New Incident", before the admin spread).

- [ ] **Step 2: Routes** — import the four persons pages (created in F2–F4; use temporary placeholder components returning `null` if implementing routing first) and add inside `ProtectedApp`'s `<Switch>` after the incidents block, param order specific-first:
```tsx
<Route path="/persons/new" component={NewPerson} />
<Route path="/persons/:id/edit" component={EditPerson} />
<Route path="/persons/:id" component={PersonDetail} />
<Route path="/persons" component={PersonList} />
```

- [ ] **Step 3: Typecheck** (will pass once F2–F4 exist; if routing first, stub the imports).

- [ ] **Step 4: Commit** `git commit -m "feat(web): persons routes and sidebar entry"`

### Task F2: Persons registry page

**Files:**
- Create: `artifacts/eirf/src/pages/persons/index.tsx`

**Interfaces:**
- Consumes: `useListPersons` (from `@workspace/api-client-react`), `useDebouncedValue`, `roleBadgeVariant`/`roleLabel`.

- [ ] **Step 1: Implement** mirroring `pages/incidents/index.tsx`: header + "Add Person" (`Link /persons/new`); filter card with debounced search `Input` (placeholder "Search persons by name, alias, or ID number…") and a role filter rendered with `Tabs` as a segmented control (values `all/victim/complainant/suspect/witness`); results `Table` (columns Name w/ initial avatar, Alias, Roles badges, DOB via `date-fns`, Cases count, View action); loading skeleton rows; filtered-empty row; **`isError`** destructive card; pagination footer (reuse incidents footer). Pass `search`, `role` (omit when `all`), `page`, `limit` to `useListPersons`.

- [ ] **Step 2: Typecheck + build** `pnpm --filter @workspace/eirf run typecheck && pnpm --filter @workspace/eirf run build`

- [ ] **Step 3: Browser verify** — via the run skill: open `/persons`, confirm search + role tabs + table render; empty state shows.

- [ ] **Step 4: Commit** `git commit -m "feat(web): persons registry page with suspect search"`

### Task F3: Person create/edit forms

**Files:**
- Create: `artifacts/eirf/src/pages/persons/new.tsx`
- Create: `artifacts/eirf/src/pages/persons/edit.tsx`

**Interfaces:**
- Consumes: `useCreatePerson`, `useGetPerson`, `useUpdatePerson`.

- [ ] **Step 1: Implement `new.tsx`** with `react-hook-form` + `zodResolver`, `max-w-2xl`, four `Card` sections (Identity: fullName* + alias, DOB, sex Select, nationality, idType Select, idNumber, occupation; Contact: address, contactNumber, email; Physical Description: textarea; Notes: textarea). Zod: `fullName` min 2 required; `email` `.email()` only when non-empty; others optional. On submit → `useCreatePerson` → toast + navigate to `/persons/:id`.

- [ ] **Step 2: Implement `edit.tsx`** — load with `useGetPerson`, prefill, submit via `useUpdatePerson`; carry the `beforeunload`/`confirmDiscard` dirty-guard from `incidents/edit.tsx`.

- [ ] **Step 3: Typecheck + build**, then browser verify create + edit round-trip (the record persists — the "Save" requirement).

- [ ] **Step 4: Commit** `git commit -m "feat(web): person create and edit forms"`

### Task F4: Person detail page

**Files:**
- Create: `artifacts/eirf/src/pages/persons/detail.tsx`

**Interfaces:**
- Consumes: `useGetPerson`, `useGetPersonIncidents`.

- [ ] **Step 1: Implement** mirroring `incidents/detail.tsx`: header (back, name, alias subtitle, Edit button), `grid md:grid-cols-3` — left bio cards, right rail quick facts (DOB + computed age, sex, nationality, ID, role summary), and a **Linked Cases** card from `useGetPersonIncidents` (role `Badge` + `font-mono` incidentNumber + type/date → `Link /incidents/:id`), empty state "Not linked to any cases yet."

- [ ] **Step 2: Typecheck + build**, then browser verify.

- [ ] **Step 3: Commit** `git commit -m "feat(web): person detail with linked cases"`

---

## PHASE G — Frontend incident enhancements

### Task G1: Persons-involved shared components

**Files:**
- Create: `artifacts/eirf/src/components/person-combobox.tsx`
- Create: `artifacts/eirf/src/components/add-person-dialog.tsx`
- Create: `artifacts/eirf/src/components/persons-involved-field.tsx`

**Interfaces:**
- Consumes: `useListPersons`, `useCreatePerson`, `Command`/`Popover`/`Dialog`/`Select` UI.
- Produces: `PersonsInvolvedField` managing `value: { personId, name, alias, role }[]` with `onChange`; `PersonCombobox` (`onSelect(person)`); `AddPersonDialog` (`onCreated(person)`).

- [ ] **Step 1: `person-combobox.tsx`** — a `Popover` + `Command` searching via `useListPersons` (debounced input); `CommandItem`s per match; `CommandEmpty` exposes an "＋ Add a new person" action (calls an `onAddNew` prop).

- [ ] **Step 2: `add-person-dialog.tsx`** — `Dialog` with a condensed person form (fullName* + alias, sex, DOB, contactNumber, idType/idNumber); on save → `useCreatePerson` → `onCreated(person)`; guard for offline (toast "Adding a new person requires a connection").

- [ ] **Step 3: `persons-involved-field.tsx`** — composes the combobox + dialog; renders added parties in the evidence-list row style with an inline role `Select` (from `PERSON_ROLES`) and an `X` remove button; exposes `value`/`onChange`.

- [ ] **Step 4: Typecheck + build**

- [ ] **Step 5: Commit** `git commit -m "feat(web): reusable persons-involved field components"`

### Task G2: New incident form additions

**Files:**
- Modify: `artifacts/eirf/src/pages/incidents/new.tsx`

- [ ] **Step 1: Extend the zod schema** — add `dateReported` (default today, required), `investigatingOfficerId` (number|null, optional), `settledDate` (optional) with a `.superRefine` requiring it when `status === "settled"`. Add `"settled"` to the status enum in the form schema.

- [ ] **Step 2: Restructure Core Details** per the spec: Grid A (Date of Incident, Time, **Date Reported**), Grid B (**grouped Type Select** using `SelectGroup`/`SelectLabel` driven by `INCIDENT_TYPE_GROUPS`, **Investigating Officer** Select from `useListOfficerRoster` with an "— Unassigned —" sentinel), Grid C (Status incl. `settled`, conditional **Settled Date** shown when `status === "settled"`).

- [ ] **Step 3: Add the Persons Involved `Card`** between Core Details and Supplemental Information using `PersonsInvolvedField`; keep the existing Witness Statements textarea. On submit, include `personsInvolved: value.map(v => ({ personId: v.personId, role: v.role }))` in the create payload.

- [ ] **Step 4: Typecheck + build**, then browser verify filing a report with all new fields + a linked existing suspect; confirm it saves and the detail shows them.

- [ ] **Step 5: Commit** `git commit -m "feat(web): new incident form — reported date, investigator, settled, persons"`

### Task G3: Edit incident form additions

**Files:**
- Modify: `artifacts/eirf/src/pages/incidents/edit.tsx`

- [ ] **Step 1: Mirror G2's field additions** (dateReported, grouped type, investigator, settled + conditional settled date). Keep the existing admin-override status affordance.

- [ ] **Step 2: Persons Involved on edit** — load existing links via `useListIncidentPersons`; add via `useAddIncidentPerson`, remove via `useRemoveIncidentPerson` (incident already persisted — no embedded payload).

- [ ] **Step 3: Typecheck + build**, then browser verify editing all fields and adding/removing a party.

- [ ] **Step 4: Commit** `git commit -m "feat(web): edit incident form — new fields and person linking"`

### Task G4: Incident detail additions

**Files:**
- Modify: `artifacts/eirf/src/pages/incidents/detail.tsx`

- [ ] **Step 1: Right rail** — add a **Category badge** (`categoryForType`/`incident.category`; Crime=destructive, Non-Crime=outline), **Date Reported** row, **Investigating Officer** row, and a **Settled** row shown only when `status === "settled"`.

- [ ] **Step 2: Persons Involved card** — render `incident.persons` grouped by role (Suspects first, then Victims, Complainants, Witnesses), each a `Link /persons/:id`; keep visible in print (no `print:hidden`). Empty → "No persons linked."

- [ ] **Step 3: Typecheck + build**, then browser verify.

- [ ] **Step 4: Commit** `git commit -m "feat(web): incident detail shows new fields and persons"`

### Task G5: Incident list — settled filter + category

**Files:**
- Modify: `artifacts/eirf/src/pages/incidents/index.tsx`

- [ ] **Step 1:** Add `settled` to the status filter options. Optionally add a Category (Crime/Non-Crime) filter mapping to the `category` query param, and a category badge column.

- [ ] **Step 2: Typecheck + build**, browser verify filtering by settled.

- [ ] **Step 3: Commit** `git commit -m "feat(web): incident list settled/category filtering"`

### Task G6: Dashboard — Crime vs Non-Crime + settled tile

**Files:**
- Modify: `artifacts/eirf/src/pages/dashboard.tsx`

- [ ] **Step 1:** Derive a Crime vs Non-Crime split client-side from existing `typeData` via `categoryForType` and render a small donut using the already-imported `PieChart`/`Pie`/`Cell`/`Legend`. If `settledIncidents` was added (D6), add a stat tile.

- [ ] **Step 2: Typecheck + build**, browser verify.

- [ ] **Step 3: Commit** `git commit -m "feat(web): dashboard crime vs non-crime split and settled tile"`

---

## PHASE H — Finalize

### Task H1: Full verification + code review

- [ ] **Step 1: Full typecheck & build**

Run: `pnpm run typecheck && pnpm run build`
Expected: both pass.

- [ ] **Step 2: Server unit tests**

Run: `pnpm --filter @workspace/api-server run test`
Expected: all `node:test` suites pass.

- [ ] **Step 3: End-to-end smoke** — via the run skill: file a Crime and a Non-Crime incident (each with reported date, an investigator, and linked persons of each role); set one to Settled and confirm the settled date; search suspects; open a person and see linked cases; confirm the dashboard split.

- [ ] **Step 4: Code review** — invoke a fresh code-review pass over the branch (the code-reviewer agent). Address findings.

- [ ] **Step 5: Update `replit.md`** "Where things live" / "Product" sections to mention the persons registry and case classification.

- [ ] **Step 6: Final commit** of any review fixes and docs.
