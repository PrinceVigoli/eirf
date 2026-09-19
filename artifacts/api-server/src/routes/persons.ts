import { Router } from "express";
import { db, personsTable, incidentPersonsTable, incidentsTable, officersTable } from "@workspace/db";
import { eq, ilike, and, or, count, inArray, desc } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { requireAuth, requireAdmin } from "../middlewares/requireAuth";
import { CreatePersonBody, UpdatePersonBody, ListPersonsQueryParams } from "@workspace/api-zod";
import { logAction } from "../lib/logger-helper";
import { paramString } from "../lib/params";

const router = Router();

// Self-join alias so GET /persons/:id/incidents can resolve the
// investigating officer's name alongside the reporting officer's, mirroring
// the same self-join pattern in routes/incidents.ts (kept local to this
// module since that file doesn't export its own alias).
const investigatingOfficer = alias(officersTable, "investigating_officer");

function formatPerson(p: typeof personsTable.$inferSelect) {
  return {
    ...p,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

router.get("/persons", requireAuth, async (req, res): Promise<void> => {
  // Mirrors listIncidents: an invalid/unparseable query just falls back to
  // defaults rather than 400ing a list endpoint.
  const parsed = ListPersonsQueryParams.safeParse(req.query);
  const params = parsed.success ? parsed.data : {};
  const page = params.page ?? 1;
  const limit = params.limit ?? 20;
  const offset = (page - 1) * limit;

  const conditions = [];
  if (params.search) {
    const q = `%${params.search}%`;
    conditions.push(or(
      ilike(personsTable.fullName, q),
      ilike(personsTable.alias, q),
      ilike(personsTable.idNumber, q),
    ));
  }
  if (params.role) {
    // Restrict to persons with at least one incident_persons link in this
    // role, via an IN (subquery) rather than joining incident_persons
    // directly — a direct join would duplicate person rows once per
    // matching link and break the count()/pagination below.
    const personIdsWithRole = db.select({ personId: incidentPersonsTable.personId })
      .from(incidentPersonsTable)
      .where(eq(incidentPersonsTable.role, params.role));
    conditions.push(inArray(personsTable.id, personIdsWithRole));
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [{ total }] = await db.select({ total: count() }).from(personsTable).where(where);
  const rows = await db.select().from(personsTable)
    .where(where)
    .orderBy(personsTable.fullName, personsTable.id)
    .limit(limit)
    .offset(offset);
  res.json({ persons: rows.map(formatPerson), total: Number(total), page, limit });
});

router.post("/persons", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreatePersonBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [person] = await db.insert(personsTable).values(parsed.data).returning();
  await logAction(req.officer!.id, "CREATE_PERSON", `Created person ${person.fullName}`);
  res.status(201).json(formatPerson(person));
});

router.get("/persons/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(paramString(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [person] = await db.select().from(personsTable).where(eq(personsTable.id, id));
  if (!person) { res.status(404).json({ error: "Person not found" }); return; }
  res.json(formatPerson(person));
});

router.patch("/persons/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(paramString(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = UpdatePersonBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const data = parsed.data;

  // Computed partial update set, mirroring updateOfficer.
  const updates: Record<string, unknown> = {};
  if (data.fullName !== undefined) updates.fullName = data.fullName;
  if (data.alias !== undefined) updates.alias = data.alias;
  if (data.dateOfBirth !== undefined) updates.dateOfBirth = data.dateOfBirth;
  if (data.sex !== undefined) updates.sex = data.sex;
  if (data.nationality !== undefined) updates.nationality = data.nationality;
  if (data.address !== undefined) updates.address = data.address;
  if (data.contactNumber !== undefined) updates.contactNumber = data.contactNumber;
  if (data.email !== undefined) updates.email = data.email;
  if (data.idType !== undefined) updates.idType = data.idType;
  if (data.idNumber !== undefined) updates.idNumber = data.idNumber;
  if (data.occupation !== undefined) updates.occupation = data.occupation;
  if (data.physicalDescription !== undefined) updates.physicalDescription = data.physicalDescription;
  if (data.notes !== undefined) updates.notes = data.notes;
  if (Object.keys(updates).length === 0) { res.status(400).json({ error: "No fields to update" }); return; }

  await db.update(personsTable).set(updates).where(eq(personsTable.id, id));
  await logAction(req.officer!.id, "UPDATE_PERSON", `Updated person id ${id}`);
  const [updated] = await db.select().from(personsTable).where(eq(personsTable.id, id));
  if (!updated) { res.status(404).json({ error: "Person not found" }); return; }
  res.json(formatPerson(updated));
});

router.delete("/persons/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(paramString(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [existing] = await db.select({ fullName: personsTable.fullName }).from(personsTable).where(eq(personsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Person not found" }); return; }
  try {
    await db.delete(personsTable).where(eq(personsTable.id, id));
  } catch (err: any) {
    // 23503 = foreign_key_violation. incident_persons.person_id references
    // persons with ON DELETE RESTRICT, so deleting a linked person throws
    // here instead of cascading — surface it as a 409, not a 500.
    if (err?.code === "23503") {
      res.status(409).json({ error: "Person is linked to incidents; unlink them first" });
      return;
    }
    throw err;
  }
  await logAction(req.officer!.id, "DELETE_PERSON", `Deleted person ${existing.fullName}`);
  res.json({ message: "Person deleted" });
});

router.get("/persons/:id/incidents", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(paramString(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [person] = await db.select({ id: personsTable.id }).from(personsTable).where(eq(personsTable.id, id));
  if (!person) { res.status(404).json({ error: "Person not found" }); return; }

  const rows = await db.select({
    id: incidentsTable.id,
    incidentNumber: incidentsTable.incidentNumber,
    date: incidentsTable.date,
    time: incidentsTable.time,
    location: incidentsTable.location,
    type: incidentsTable.type,
    description: incidentsTable.description,
    status: incidentsTable.status,
    reportingOfficerId: incidentsTable.reportingOfficerId,
    reportingOfficerName: officersTable.name,
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
    // This person's role on each incident (not a list of all persons
    // linked to the incident) — that's what distinguishes this endpoint's
    // per-incident row from the incidents list's nested `persons` array.
    role: incidentPersonsTable.role,
    roleDetails: incidentPersonsTable.roleDetails,
  })
    .from(incidentPersonsTable)
    .innerJoin(incidentsTable, eq(incidentPersonsTable.incidentId, incidentsTable.id))
    .leftJoin(officersTable, eq(incidentsTable.reportingOfficerId, officersTable.id))
    .leftJoin(investigatingOfficer, eq(incidentsTable.investigatingOfficerId, investigatingOfficer.id))
    .where(eq(incidentPersonsTable.personId, id))
    .orderBy(desc(incidentsTable.createdAt));

  res.json(rows.map((r) => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  })));
});

export default router;
