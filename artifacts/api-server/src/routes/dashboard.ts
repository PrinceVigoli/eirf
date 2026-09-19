import { Router } from "express";
import { db, incidentsTable, officersTable } from "@workspace/db";
import { eq, count, gte, sql, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

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

router.get("/dashboard/stats", requireAuth, async (req, res): Promise<void> => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const startOfWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [{ total }] = await db.select({ total: count() }).from(incidentsTable);
  const [{ thisMonth }] = await db.select({ thisMonth: count() }).from(incidentsTable).where(gte(incidentsTable.date, startOfMonth));
  const [{ thisWeek }] = await db.select({ thisWeek: count() }).from(incidentsTable).where(gte(incidentsTable.date, startOfWeek));
  const [{ openCount }] = await db.select({ openCount: count() }).from(incidentsTable).where(eq(incidentsTable.status, "open"));
  const [{ closedCount }] = await db.select({ closedCount: count() }).from(incidentsTable).where(eq(incidentsTable.status, "closed"));
  const [{ underInv }] = await db.select({ underInv: count() }).from(incidentsTable).where(eq(incidentsTable.status, "under_investigation"));
  res.json({
    totalIncidents: Number(total),
    incidentsThisMonth: Number(thisMonth),
    incidentsThisWeek: Number(thisWeek),
    openIncidents: Number(openCount),
    closedIncidents: Number(closedCount),
    underInvestigation: Number(underInv),
  });
});

router.get("/dashboard/by-type", requireAuth, async (req, res): Promise<void> => {
  const rows = await db.select({ type: incidentsTable.type, count: count() })
    .from(incidentsTable)
    .groupBy(incidentsTable.type)
    .orderBy(desc(count()));
  res.json(rows.map((r) => ({ type: r.type, count: Number(r.count) })));
});

router.get("/dashboard/by-month", requireAuth, async (req, res): Promise<void> => {
  const rawResult = await db.execute(sql`
    SELECT
      to_char(date_trunc('month', TO_DATE(date, 'YYYY-MM-DD')), 'YYYY-MM') AS month,
      COUNT(*)::int AS count
    FROM incidents
    WHERE TO_DATE(date, 'YYYY-MM-DD') >= NOW() - INTERVAL '12 months'
    GROUP BY month
    ORDER BY month ASC
  `);
  const rawRows = (rawResult as any).rows ?? rawResult;
  const result = (rawRows as { month: string; count: number }[]).map((r) => ({
    month: r.month,
    count: Number(r.count),
  }));
  res.json(result);
});

router.get("/dashboard/recent", requireAuth, async (req, res): Promise<void> => {
  const rows = await db.select(incidentSelect).from(incidentsTable)
    .leftJoin(officersTable, eq(incidentsTable.reportingOfficerId, officersTable.id))
    .orderBy(desc(incidentsTable.createdAt))
    .limit(10);
  res.json(rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() })));
});

export default router;
