import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import { count, eq } from "drizzle-orm";
import { appSettingsTable, db, evidenceFilesTable, incidentsTable, officersTable } from "@workspace/db";
import { requireAdmin } from "../middlewares/requireAuth";
import { logAction } from "../lib/logger-helper";

const router = Router();
function parseSettings(body: unknown) {
  if (!body || typeof body !== "object") return null;
  const input = body as Record<string, unknown>;
  const limits: Record<string, number> = { stationName: 120, stationShortName: 60, reportTitle: 120 };
  const result: Record<string, string> = {};
  for (const [key, max] of Object.entries(limits)) {
    if (typeof input[key] !== "string") return null;
    const value = input[key].trim();
    if (value.length < 2 || value.length > max) return null;
    result[key] = value;
  }
  return result as { stationName: string; stationShortName: string; reportTitle: string };
}

async function getSettings() {
  await db.insert(appSettingsTable).values({ id: 1 }).onConflictDoNothing();
  const [settings] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.id, 1));
  return settings;
}

async function getOrphanUploads(dataDir: string, minimumAgeDays = 7) {
  const uploadDir = path.join(dataDir, "evidence", "private", "uploads");
  if (!fs.existsSync(uploadDir)) return [];
  const referenced = new Set(
    (await db.select({ objectPath: evidenceFilesTable.objectPath }).from(evidenceFilesTable))
      .map((row) => path.basename(row.objectPath)),
  );
  const cutoff = Date.now() - minimumAgeDays * 24 * 60 * 60 * 1000;
  return fs.readdirSync(uploadDir)
    .filter((name) => !name.endsWith(".meta.json"))
    .filter((name) => !referenced.has(name))
    .map((name) => ({ name, fullPath: path.join(uploadDir, name), stat: fs.statSync(path.join(uploadDir, name)) }))
    .filter((item) => item.stat.mtimeMs < cutoff);
}

router.get("/settings/public", async (_req, res) => {
  const settings = await getSettings();
  res.json({
    stationName: settings.stationName,
    stationShortName: settings.stationShortName,
    reportTitle: settings.reportTitle,
  });
});

router.patch("/settings", requireAdmin, async (req, res): Promise<void> => {
  const parsed = parseSettings(req.body);
  if (!parsed) { res.status(400).json({ error: "Invalid station settings" }); return; }
  await getSettings();
  const [settings] = await db.update(appSettingsTable)
    .set(parsed)
    .where(eq(appSettingsTable.id, 1))
    .returning();
  await logAction(req.officer!.id, "UPDATE_SETTINGS", "Updated station identity settings");
  res.json(settings);
});

router.get("/system/status", requireAdmin, async (_req, res) => {
  const dataDir = path.resolve(process.env.EIRF_DATA_DIR || path.join(process.cwd(), "data"));
  const backupDir = path.resolve(process.env.BACKUP_DIR || path.join(dataDir, "backups"));
  fs.mkdirSync(dataDir, { recursive: true });
  const disk = fs.statfsSync(dataDir);
  const backups = fs.existsSync(backupDir)
    ? fs.readdirSync(backupDir)
      .filter((name) => name.endsWith(".dump"))
      .map((name) => ({ name, modifiedAt: fs.statSync(path.join(backupDir, name)).mtime }))
      .sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime())
    : [];
  const [[{ incidents }], [{ officers }], [{ evidence }]] = await Promise.all([
    db.select({ incidents: count() }).from(incidentsTable),
    db.select({ officers: count() }).from(officersTable),
    db.select({ evidence: count() }).from(evidenceFilesTable),
  ]);
  const orphanUploads = await getOrphanUploads(dataDir);
  res.json({
    status: "ok",
    version: process.env.npm_package_version || "0.0.0",
    database: { incidents: Number(incidents), officers: Number(officers), evidence: Number(evidence) },
    storage: {
      dataDir,
      freeBytes: disk.bavail * disk.bsize,
      totalBytes: disk.blocks * disk.bsize,
      orphanUploads: orphanUploads.length,
    },
    lastBackupAt: backups[0]?.modifiedAt.toISOString() ?? null,
    backupCount: backups.length,
  });
});

router.post("/system/cleanup-orphans", requireAdmin, async (req, res) => {
  const dataDir = path.resolve(process.env.EIRF_DATA_DIR || path.join(process.cwd(), "data"));
  const orphans = await getOrphanUploads(dataDir);
  for (const orphan of orphans) {
    fs.rmSync(orphan.fullPath, { force: true });
    fs.rmSync(`${orphan.fullPath}.meta.json`, { force: true });
  }
  await logAction(req.officer!.id, "CLEANUP_ORPHAN_UPLOADS", `Removed ${orphans.length} unreferenced uploads older than 7 days`);
  res.json({ removed: orphans.length });
});

export default router;
