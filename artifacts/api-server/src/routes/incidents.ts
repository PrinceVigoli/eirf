import { Router } from "express";
import { db, incidentsTable, officersTable, incidentPersonsTable, personsTable } from "@workspace/db";
import { eq, ilike, and, gte, lte, or, desc, count, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { requireAuth, requireAdmin } from "../middlewares/requireAuth";
import { CreateIncidentBody, UpdateIncidentBody, ListIncidentsQueryParams, AddIncidentPersonBody } from "@workspace/api-zod";
import { logAction } from "../lib/logger-helper";
import { paramString } from "../lib/params";
import { isAllowedStatusTransition } from "../lib/incidentWorkflow";
import { deriveCategory } from "../lib/incidentClassification";
import { resolveSettledDate } from "../lib/settledDate";
import { validateReportedDate } from "../lib/reportedDate";
import { assertCanEditIncident } from "../lib/assertCanEditIncident";

const router = Router();

function csvCell(value: unknown): string {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

// Allowed next statuses for each current status — mirrors
// artifacts/eirf/src/lib/incident-status.ts. Previously any status could
// move to any other status in any order (e.g. archived -> open), which
// most records-management systems restrict; see B5 in the audit. Admins
// can still force an out-of-workflow transition for corrections, but it's
// logged distinctly (ADMIN_STATUS_OVERRIDE) so it stands out in the audit
// trail rather than looking like a normal transition.
function generateIncidentNumber(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `IRF-${year}${month}${day}-${rand}`;
}

function formatIncident(r: typeof incidentsTable.$inferSelect & { reportingOfficerName?: string | null; investigatingOfficerName?: string | null }) {
  return {
    ...r,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

// Self-join alias: incidents references officers twice (reportingOfficerId,
// investigatingOfficerId), so the investigating side needs its own aliased
// table to join against without colliding with the reporting-officer join.
const investigatingOfficer = alias(officersTable, "investigating_officer");

const incidentSelect = {
  id: incidentsTable.id,
  incidentNumber: incidentsTable.incidentNumber,
  date: incidentsTable.date,
  time: incidentsTable.time,
  location: incidentsTable.location,
  type: incidentsTable.type,
  description: incidentsTable.description,
  status: incidentsTable.status,
  reportingOfficerId: incidentsTable.reportingOfficerId,
  witnessStatements: incidentsTable.witnessStatements,
  evidence: incidentsTable.evidence,
  notes: incidentsTable.notes,
  dateReported: incidentsTable.dateReported,
  investigatingOfficerId: incidentsTable.investigatingOfficerId,
  investigatingOfficerName: investigatingOfficer.name,
  category: incidentsTable.category,
  settledDate: incidentsTable.settledDate,
  createdAt: incidentsTable.createdAt,
  updatedAt: incidentsTable.updatedAt,
  reportingOfficerName: officersTable.name,
};

router.get("/incidents", requireAuth, async (req, res): Promise<void> => {
  const parsed = ListIncidentsQueryParams.safeParse(req.query);
  const params = parsed.success ? parsed.data : {};
  const page = params.page ?? 1;
  const limit = params.limit ?? 20;
  const offset = (page - 1) * limit;
  const conditions = [];
  if (params.search) {
    const q = `%${params.search}%`;
    conditions.push(or(
      ilike(incidentsTable.location, q),
      ilike(incidentsTable.description, q),
      ilike(incidentsTable.incidentNumber, q),
      ilike(incidentsTable.type, q),
    ));
  }
  if (params.type) conditions.push(eq(incidentsTable.type, params.type));
  if (params.category) conditions.push(eq(incidentsTable.category, params.category as "crime" | "non_crime"));
  if (params.reportingOfficerId) conditions.push(eq(incidentsTable.reportingOfficerId, params.reportingOfficerId));
  if (params.investigatingOfficerId) conditions.push(eq(incidentsTable.investigatingOfficerId, params.investigatingOfficerId));
  if (params.status) conditions.push(eq(incidentsTable.status, params.status as "open" | "under_investigation" | "settled" | "closed" | "archived"));
  if (params.startDate) conditions.push(gte(incidentsTable.date, params.startDate));
  if (params.endDate) conditions.push(lte(incidentsTable.date, params.endDate));
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const [{ total }] = await db.select({ total: count() }).from(incidentsTable).where(where);
  const rows = await db.select(incidentSelect).from(incidentsTable)
    .leftJoin(officersTable, eq(incidentsTable.reportingOfficerId, officersTable.id))
    .leftJoin(investigatingOfficer, eq(incidentsTable.investigatingOfficerId, investigatingOfficer.id))
    .where(where)
    .orderBy(desc(incidentsTable.createdAt))
    .limit(limit)
    .offset(offset);
  res.json({ incidents: rows.map(formatIncident), total: Number(total), page, limit });
});

router.post("/incidents", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateIncidentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  // personsInvolved isn't an incidents column — pulled out here so `data`
  // (spread into the insert below) never carries it. Linking now happens
  // for real below instead of being silently dropped.
  const { personsInvolved, ...data } = parsed.data;
  const today = new Date().toISOString().slice(0, 10);

  // category is always server-derived from type — never trust a client-sent
  // value (there isn't one on this contract, but never read one either).
  const category = deriveCategory(data.type);

  if (data.dateReported !== undefined) {
    const reportedCheck = validateReportedDate(data.dateReported, data.date, today);
    if (!reportedCheck.ok) { res.status(400).json({ error: reportedCheck.error }); return; }
  }
  if (data.investigatingOfficerId !== undefined) {
    const [investigator] = await db.select({ id: officersTable.id }).from(officersTable)
      .where(eq(officersTable.id, data.investigatingOfficerId));
    if (!investigator) { res.status(400).json({ error: "Investigating officer not found" }); return; }
  }

  // De-duplicate (personId, role) pairs before touching the database — the
  // incident_persons unique index is on (incidentId, personId, role), so an
  // untouched duplicate pair in the request would otherwise 23505 on
  // insert. First occurrence wins if roleDetails differs across dupes.
  const dedupedLinks: NonNullable<typeof personsInvolved> = [];
  if (personsInvolved?.length) {
    const seen = new Set<string>();
    for (const link of personsInvolved) {
      const key = `${link.personId}:${link.role}`;
      if (seen.has(key)) continue;
      seen.add(key);
      dedupedLinks.push(link);
    }

    // Fail closed: validate every referenced person exists before writing
    // anything. Without this, an unknown personId would only surface as a
    // foreign-key error mid-transaction (or, without the transaction below,
    // could leave an incident row with no links at all).
    const personIds = Array.from(new Set(dedupedLinks.map((link) => link.personId)));
    const foundPersons = await db.select({ id: personsTable.id }).from(personsTable)
      .where(inArray(personsTable.id, personIds));
    const foundIds = new Set(foundPersons.map((p) => p.id));
    if (personIds.some((pid) => !foundIds.has(pid))) {
      res.status(400).json({ error: "Unknown personId in personsInvolved" });
      return;
    }
  }

  // incidentNumber has a `-####` random suffix, so on a busy day two
  // requests can collide. Retry with a fresh number a few times rather than
  // failing the whole request on a unique-constraint violation (Postgres
  // error code 23505). When there are persons to link, each attempt runs in
  // its own transaction so a collision — or any failure inserting the links
  // — rolls back the incident row too, instead of leaving it stranded
  // without its links.
  const MAX_ATTEMPTS = 5;
  let incident: typeof incidentsTable.$inferSelect | undefined;
  let incidentNumber = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    incidentNumber = generateIncidentNumber();
    const values = {
      ...data,
      incidentNumber,
      status: data.status ?? "open",
      reportingOfficerId: req.officer!.id,
      category,
      dateReported: data.dateReported ?? today,
      investigatingOfficerId: data.investigatingOfficerId ?? null,
      settledDate: resolveSettledDate(data.status ?? "open", null, today),
    };
    try {
      if (dedupedLinks.length > 0) {
        [incident] = await db.transaction(async (tx) => {
          const [inserted] = await tx.insert(incidentsTable).values(values).returning();
          await tx.insert(incidentPersonsTable).values(
            dedupedLinks.map((link) => ({
              incidentId: inserted.id,
              personId: link.personId,
              role: link.role,
              roleDetails: link.roleDetails ?? null,
            })),
          );
          return [inserted];
        });
      } else {
        [incident] = await db.insert(incidentsTable).values(values).returning();
      }
      break;
    } catch (err: any) {
      const isCollision = err?.code === "23505" && String(err?.constraint ?? "").includes("incident_number");
      if (!isCollision || attempt === MAX_ATTEMPTS) throw err;
    }
  }
  if (!incident) { res.status(500).json({ error: "Failed to generate a unique incident number" }); return; }
  await logAction(req.officer!.id, "CREATE_INCIDENT", `Created incident ${incidentNumber}`);
  const [row] = await db.select(incidentSelect).from(incidentsTable)
    .leftJoin(officersTable, eq(incidentsTable.reportingOfficerId, officersTable.id))
    .leftJoin(investigatingOfficer, eq(incidentsTable.investigatingOfficerId, investigatingOfficer.id))
    .where(eq(incidentsTable.id, incident.id));
  res.status(201).json(formatIncident(row));
});

router.get("/incidents/export.csv", requireAuth, async (_req, res) => {
  const rows = await db.select(incidentSelect).from(incidentsTable)
    .leftJoin(officersTable, eq(incidentsTable.reportingOfficerId, officersTable.id))
    .leftJoin(investigatingOfficer, eq(incidentsTable.investigatingOfficerId, investigatingOfficer.id))
    .orderBy(desc(incidentsTable.createdAt));
  const headers = ["Incident Number", "Date", "Time", "Location", "Type", "Status", "Reporting Officer", "Description", "Witness Statements", "Evidence Summary", "Notes"];
  const lines = rows.map((row) => [
    row.incidentNumber, row.date, row.time, row.location, row.type, row.status,
    row.reportingOfficerName, row.description, row.witnessStatements, row.evidence, row.notes,
  ].map(csvCell).join(","));
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="eirf-incidents-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(`\uFEFF${headers.map(csvCell).join(",")}\r\n${lines.join("\r\n")}`);
});

router.get("/incidents/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(paramString(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.select(incidentSelect).from(incidentsTable)
    .leftJoin(officersTable, eq(incidentsTable.reportingOfficerId, officersTable.id))
    .leftJoin(investigatingOfficer, eq(incidentsTable.investigatingOfficerId, investigatingOfficer.id))
    .where(eq(incidentsTable.id, id));
  if (!row) { res.status(404).json({ error: "Incident not found" }); return; }

  // Persons are attached on the detail view only (the list endpoint stays
  // lean, per D3) — shaped to match the generated IncidentPerson schema,
  // with the same ISO-timestamp convention as formatIncident/formatPerson.
  // innerJoin (not left) is safe here: incident_persons.person_id is
  // NOT NULL with an ON DELETE RESTRICT reference to persons, so a link row
  // always has a person.
  const personLinks = await db.select({
    id: incidentPersonsTable.id,
    incidentId: incidentPersonsTable.incidentId,
    personId: incidentPersonsTable.personId,
    role: incidentPersonsTable.role,
    roleDetails: incidentPersonsTable.roleDetails,
    createdAt: incidentPersonsTable.createdAt,
    person: personsTable,
  })
    .from(incidentPersonsTable)
    .innerJoin(personsTable, eq(incidentPersonsTable.personId, personsTable.id))
    .where(eq(incidentPersonsTable.incidentId, id));

  res.json({
    ...formatIncident(row),
    persons: personLinks.map((link) => ({
      ...link,
      createdAt: link.createdAt.toISOString(),
      person: {
        ...link.person,
        createdAt: link.person.createdAt.toISOString(),
        updatedAt: link.person.updatedAt.toISOString(),
      },
    })),
  });
});

router.patch("/incidents/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(paramString(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = UpdateIncidentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const data = parsed.data;

  // Previously any authenticated officer could edit any incident, with only
  // an audit-log entry (not a block) as a trace. Restrict edits to the
  // reporting officer or an admin, matching the "append-friendly,
  // delete-restricted" model DELETE already uses (requireAdmin below).
  const [target] = await db.select({
    reportingOfficerId: incidentsTable.reportingOfficerId,
    status: incidentsTable.status,
    date: incidentsTable.date,
  }).from(incidentsTable).where(eq(incidentsTable.id, id));
  if (!target) { res.status(404).json({ error: "Incident not found" }); return; }
  const isAdmin = req.officer!.role === "admin";
  if (!assertCanEditIncident(target, req.officer!)) {
    res.status(403).json({ error: "Only the reporting officer or an admin can edit this incident" });
    return;
  }

  // B5: don't allow an arbitrary status jump (e.g. archived -> open).
  // Non-admins are limited to the workflow graph; admins can force any
  // transition, but it's flagged and logged distinctly as an override.
  let isAdminOverride = false;
  if (data.status && data.status !== target.status) {
    const isValidTransition = isAllowedStatusTransition(target.status, data.status);
    if (!isValidTransition) {
      if (!isAdmin) {
        res.status(400).json({
          error: `Cannot change status from "${target.status}" to "${data.status}"`,
        });
        return;
      }
      isAdminOverride = true;
    }
  }

  // Computed update set, mirroring updateOfficer — replaces a blind
  // `.set(parsed.data)` so category can never be read from the client and
  // dateReported/investigatingOfficerId/settledDate get server-side
  // validation/derivation instead of being written verbatim.
  const today = new Date().toISOString().slice(0, 10);
  const updates: Record<string, unknown> = {};
  if (data.date !== undefined) updates.date = data.date;
  if (data.time !== undefined) updates.time = data.time;
  if (data.location !== undefined) updates.location = data.location;
  if (data.type !== undefined) {
    updates.type = data.type;
    updates.category = deriveCategory(data.type);
  }
  if (data.description !== undefined) updates.description = data.description;
  if (data.witnessStatements !== undefined) updates.witnessStatements = data.witnessStatements;
  if (data.evidence !== undefined) updates.evidence = data.evidence;
  if (data.notes !== undefined) updates.notes = data.notes;
  if (data.dateReported !== undefined) {
    if (data.dateReported !== null) {
      const reportedCheck = validateReportedDate(data.dateReported, data.date ?? target.date, today);
      if (!reportedCheck.ok) { res.status(400).json({ error: reportedCheck.error }); return; }
    }
    updates.dateReported = data.dateReported;
  }
  if (data.investigatingOfficerId !== undefined) {
    if (data.investigatingOfficerId !== null) {
      const [investigator] = await db.select({ id: officersTable.id }).from(officersTable)
        .where(eq(officersTable.id, data.investigatingOfficerId));
      if (!investigator) { res.status(400).json({ error: "Investigating officer not found" }); return; }
    }
    updates.investigatingOfficerId = data.investigatingOfficerId;
  }
  if (data.status !== undefined) {
    updates.status = data.status;
    // Only recompute settledDate when status actually changes — the edit
    // form resubmits the full record (including the unchanged current
    // status) on every save, and resolveSettledDate("settled", ...) always
    // returns today. Without this guard, saving any other field on an
    // already-settled incident would silently overwrite its real settle
    // date with today's date. Staying settled = settledDate unchanged.
    if (data.status !== target.status) {
      updates.settledDate = resolveSettledDate(data.status, undefined, today);
    }
  }

  await db.update(incidentsTable).set(updates).where(eq(incidentsTable.id, id));
  if (isAdminOverride) {
    await logAction(
      req.officer!.id,
      "ADMIN_STATUS_OVERRIDE",
      `Forced incident id ${id} status from "${target.status}" to "${data.status}" outside the normal workflow`,
    );
  }
  await logAction(req.officer!.id, "UPDATE_INCIDENT", `Updated incident id ${id}`);
  const [row] = await db.select(incidentSelect).from(incidentsTable)
    .leftJoin(officersTable, eq(incidentsTable.reportingOfficerId, officersTable.id))
    .leftJoin(investigatingOfficer, eq(incidentsTable.investigatingOfficerId, investigatingOfficer.id))
    .where(eq(incidentsTable.id, id));
  if (!row) { res.status(404).json({ error: "Incident not found" }); return; }
  res.json(formatIncident(row));
});

// Incremental link/unlink for the edit form's persons panel — unlike POST
// /incidents (create-time linking, D3), each call here adds or removes a
// single (incidentId, personId, role) row against an already-existing
// incident, so it needs its own existence/permission/conflict handling
// rather than reusing the transactional create path.
router.post("/incidents/:id/persons", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(paramString(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [incident] = await db.select({
    reportingOfficerId: incidentsTable.reportingOfficerId,
  }).from(incidentsTable).where(eq(incidentsTable.id, id));
  if (!incident) { res.status(404).json({ error: "Incident not found" }); return; }

  const parsed = AddIncidentPersonBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const data = parsed.data;

  // personId lives in the body, not the URL, so it can only be checked once
  // the body has been parsed — this puts the 400 (malformed body) ahead of
  // the 404 (unknown person) in practice, unlike the incident-exists check
  // above, which the URL's :id makes possible before any parsing.
  const [person] = await db.select().from(personsTable).where(eq(personsTable.id, data.personId));
  if (!person) { res.status(404).json({ error: "Person not found" }); return; }

  if (!assertCanEditIncident(incident, req.officer!)) {
    res.status(403).json({ error: "Only the reporting officer or an admin can edit this incident" });
    return;
  }

  let link: typeof incidentPersonsTable.$inferSelect;
  try {
    [link] = await db.insert(incidentPersonsTable).values({
      incidentId: id,
      personId: data.personId,
      role: data.role,
      roleDetails: data.roleDetails ?? null,
    }).returning();
  } catch (err: any) {
    // 23505 = unique_violation on incident_persons_incident_person_role_unique
    // (incidentId, personId, role) — this person is already linked in that role.
    if (err?.code === "23505") {
      res.status(409).json({ error: "Person already linked with that role" });
      return;
    }
    throw err;
  }

  await logAction(
    req.officer!.id,
    "LINK_PERSON_TO_INCIDENT",
    `Linked person id ${data.personId} to incident id ${id} as ${data.role}`,
  );

  // Same embedded shape GET /incidents/:id uses for its `persons` array
  // (matches the generated AddIncidentPersonResponse/IncidentPerson schema).
  res.status(201).json({
    ...link,
    createdAt: link.createdAt.toISOString(),
    person: {
      ...person,
      createdAt: person.createdAt.toISOString(),
      updatedAt: person.updatedAt.toISOString(),
    },
  });
});

router.delete("/incidents/:id/persons/:linkId", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(paramString(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const linkId = parseInt(paramString(req.params.linkId), 10);
  if (isNaN(linkId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [incident] = await db.select({
    reportingOfficerId: incidentsTable.reportingOfficerId,
  }).from(incidentsTable).where(eq(incidentsTable.id, id));
  if (!incident) { res.status(404).json({ error: "Incident not found" }); return; }

  if (!assertCanEditIncident(incident, req.officer!)) {
    res.status(403).json({ error: "Only the reporting officer or an admin can edit this incident" });
    return;
  }

  // Scoped to incidentId so a linkId that belongs to a different incident
  // can't be used to unlink a person here — delete+returning also tells us
  // in one query whether a matching row existed at all, for the 404 below.
  const [deleted] = await db.delete(incidentPersonsTable)
    .where(and(eq(incidentPersonsTable.id, linkId), eq(incidentPersonsTable.incidentId, id)))
    .returning({ personId: incidentPersonsTable.personId });
  if (!deleted) { res.status(404).json({ error: "Person link not found" }); return; }

  await logAction(
    req.officer!.id,
    "UNLINK_PERSON_FROM_INCIDENT",
    `Unlinked person id ${deleted.personId} from incident id ${id}`,
  );
  res.json({ message: "Person unlinked from incident" });
});

router.delete("/incidents/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(paramString(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [existing] = await db.select({ incidentNumber: incidentsTable.incidentNumber }).from(incidentsTable).where(eq(incidentsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Incident not found" }); return; }
  await db.delete(incidentsTable).where(eq(incidentsTable.id, id));
  await logAction(req.officer!.id, "DELETE_INCIDENT", `Deleted incident ${existing.incidentNumber}`);
  res.json({ message: "Incident deleted" });
});

export default router;
