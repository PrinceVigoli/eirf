import { Router } from "express";
import { db, systemLogsTable, officersTable } from "@workspace/db";
import { eq, count, desc, asc } from "drizzle-orm";
import { requireAdmin } from "../middlewares/requireAuth";
import { ListLogsQueryParams } from "@workspace/api-zod";
import { calculateLogHash } from "../lib/auditHash";

const router = Router();

router.get("/logs", requireAdmin, async (req, res): Promise<void> => {
  const parsed = ListLogsQueryParams.safeParse(req.query);
  const params = parsed.success ? parsed.data : {};
  const page = params.page ?? 1;
  const limit = params.limit ?? 30;
  const offset = (page - 1) * limit;
  const [{ total }] = await db.select({ total: count() }).from(systemLogsTable);
  const rows = await db.select({
    id: systemLogsTable.id,
    action: systemLogsTable.action,
    details: systemLogsTable.details,
    officerId: systemLogsTable.officerId,
    createdAt: systemLogsTable.createdAt,
    officerName: officersTable.name,
  }).from(systemLogsTable)
    .leftJoin(officersTable, eq(systemLogsTable.officerId, officersTable.id))
    .orderBy(desc(systemLogsTable.createdAt))
    .limit(limit)
    .offset(offset);
  res.json({
    logs: rows.map((r) => ({
      id: r.id,
      action: r.action,
      details: r.details,
      officerId: r.officerId,
      officerName: r.officerName ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
    total: Number(total),
    page,
    limit,
  });
});

router.get("/logs/integrity", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db.select().from(systemLogsTable).orderBy(asc(systemLogsTable.id));
  let previousHash: string | null = null;
  let legacyEntries = 0;

  for (const row of rows) {
    if (!row.entryHash) {
      legacyEntries += 1;
      previousHash = null;
      continue;
    }
    const expected = calculateLogHash(
      previousHash,
      row.createdAt,
      row.officerId,
      row.action,
      row.details,
    );
    if (row.previousHash !== previousHash || row.entryHash !== expected) {
      res.status(409).json({
        valid: false,
        checkedEntries: rows.length,
        legacyEntries,
        firstInvalidId: row.id,
      });
      return;
    }
    previousHash = row.entryHash;
  }

  res.json({ valid: true, checkedEntries: rows.length, legacyEntries });
});

export default router;
