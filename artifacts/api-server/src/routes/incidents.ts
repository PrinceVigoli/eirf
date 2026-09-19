import { Router } from "express";
import { db, incidentsTable, officersTable } from "@workspace/db";
import { eq, ilike, and, gte, lte, or, desc, count } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/requireAuth";
import { CreateIncidentBody, UpdateIncidentBody, ListIncidentsQueryParams } from "@workspace/api-zod";
import { logAction } from "../lib/logger-helper";
import { paramString } from "../lib/params";
import { isAllowedStatusTransition } from "../lib/incidentWorkflow";

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

function formatIncident(r: typeof incidentsTable.$inferSelect & { reportingOfficerName?: string | null }) {
  return {
    ...r,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

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
  if (params.status) conditions.push(eq(incidentsTable.status, params.status as "open" | "under_investigation" | "closed" | "archived"));
  if (params.startDate) conditions.push(gte(incidentsTable.date, params.startDate));
  if (params.endDate) conditions.push(lte(incidentsTable.date, params.endDate));
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const [{ total }] = await db.select({ total: count() }).from(incidentsTable).where(where);
  const rows = await db.select(incidentSelect).from(incidentsTable)
    .leftJoin(officersTable, eq(incidentsTable.reportingOfficerId, officersTable.id))
    .where(where)
    .orderBy(desc(incidentsTable.createdAt))
    .limit(limit)
    .offset(offset);
  res.json({ incidents: rows.map(formatIncident), total: Number(total), page, limit });
});

router.post("/incidents", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateIncidentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const data = parsed.data;

  // incidentNumber has a `-####` random suffix, so on a busy day two
  // requests can collide. Retry with a fresh number a few times rather than
  // failing the whole request on a unique-constraint violation (Postgres
  // error code 23505).
  const MAX_ATTEMPTS = 5;
  let incident: typeof incidentsTable.$inferSelect | undefined;
  let incidentNumber = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    incidentNumber = generateIncidentNumber();
    try {
      [incident] = await db.insert(incidentsTable).values({
        ...data,
        incidentNumber,
        status: data.status ?? "open",
        reportingOfficerId: req.officer!.id,
      }).returning();
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
    .where(eq(incidentsTable.id, incident.id));
  res.status(201).json(formatIncident(row));
});

router.get("/incidents/export.csv", requireAuth, async (_req, res) => {
  const rows = await db.select(incidentSelect).from(incidentsTable)
    .leftJoin(officersTable, eq(incidentsTable.reportingOfficerId, officersTable.id))
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
    .where(eq(incidentsTable.id, id));
  if (!row) { res.status(404).json({ error: "Incident not found" }); return; }
  res.json(formatIncident(row));
});

router.patch("/incidents/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(paramString(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = UpdateIncidentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  // Previously any authenticated officer could edit any incident, with only
  // an audit-log entry (not a block) as a trace. Restrict edits to the
  // reporting officer or an admin, matching the "append-friendly,
  // delete-restricted" model DELETE already uses (requireAdmin below).
  const [target] = await db.select({ reportingOfficerId: incidentsTable.reportingOfficerId, status: incidentsTable.status })
    .from(incidentsTable).where(eq(incidentsTable.id, id));
  if (!target) { res.status(404).json({ error: "Incident not found" }); return; }
  const isOwner = target.reportingOfficerId === req.officer!.id;
  const isAdmin = req.officer!.role === "admin";
  if (!isOwner && !isAdmin) {
    res.status(403).json({ error: "Only the reporting officer or an admin can edit this incident" });
    return;
  }

  // B5: don't allow an arbitrary status jump (e.g. archived -> open).
  // Non-admins are limited to the workflow graph; admins can force any
  // transition, but it's flagged and logged distinctly as an override.
  let isAdminOverride = false;
  if (parsed.data.status && parsed.data.status !== target.status) {
    const isValidTransition = isAllowedStatusTransition(target.status, parsed.data.status);
    if (!isValidTransition) {
      if (!isAdmin) {
        res.status(400).json({
          error: `Cannot change status from "${target.status}" to "${parsed.data.status}"`,
        });
        return;
      }
      isAdminOverride = true;
    }
  }

  await db.update(incidentsTable).set(parsed.data).where(eq(incidentsTable.id, id));
  if (isAdminOverride) {
    await logAction(
      req.officer!.id,
      "ADMIN_STATUS_OVERRIDE",
      `Forced incident id ${id} status from "${target.status}" to "${parsed.data.status}" outside the normal workflow`,
    );
  }
  await logAction(req.officer!.id, "UPDATE_INCIDENT", `Updated incident id ${id}`);
  const [row] = await db.select(incidentSelect).from(incidentsTable)
    .leftJoin(officersTable, eq(incidentsTable.reportingOfficerId, officersTable.id))
    .where(eq(incidentsTable.id, id));
  if (!row) { res.status(404).json({ error: "Incident not found" }); return; }
  res.json(formatIncident(row));
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
