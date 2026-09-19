import { Router } from "express";
import { db, evidenceFilesTable, incidentsTable, officersTable } from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { AddEvidenceFileBody } from "@workspace/api-zod";
import { logAction } from "../lib/logger-helper";
import { paramString } from "../lib/params";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";
import { hashReadable } from "../lib/evidenceHash";

const router = Router();
const objectStorageService = new ObjectStorageService();

async function canManageIncidentEvidence(incidentId: number, officerId: number, role: string) {
  const [incident] = await db
    .select({ reportingOfficerId: incidentsTable.reportingOfficerId })
    .from(incidentsTable)
    .where(eq(incidentsTable.id, incidentId));
  if (!incident) return { exists: false, allowed: false };
  return {
    exists: true,
    allowed: role === "admin" || incident.reportingOfficerId === officerId,
  };
}

type FormattableEvidence = Omit<typeof evidenceFilesTable.$inferSelect, "removedById" | "removedAt"> &
  Partial<Pick<typeof evidenceFilesTable.$inferSelect, "removedById" | "removedAt">> &
  { uploadedByName?: string | null };

function formatFile(r: FormattableEvidence) {
  return {
    id: r.id,
    incidentId: r.incidentId,
    fileName: r.fileName,
    objectPath: r.objectPath,
    contentType: r.contentType,
    fileSize: r.fileSize ?? null,
    sha256: r.sha256 ?? null,
    uploadedById: r.uploadedById ?? null,
    uploadedByName: r.uploadedByName ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}

router.get("/incidents/:id/evidence", requireAuth, async (req, res): Promise<void> => {
  const incidentId = parseInt(paramString(req.params.id), 10);
  if (isNaN(incidentId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const rows = await db
    .select({
      id: evidenceFilesTable.id,
      incidentId: evidenceFilesTable.incidentId,
      fileName: evidenceFilesTable.fileName,
      objectPath: evidenceFilesTable.objectPath,
      contentType: evidenceFilesTable.contentType,
      fileSize: evidenceFilesTable.fileSize,
      sha256: evidenceFilesTable.sha256,
      uploadedById: evidenceFilesTable.uploadedById,
      createdAt: evidenceFilesTable.createdAt,
      uploadedByName: officersTable.name,
    })
    .from(evidenceFilesTable)
    .leftJoin(officersTable, eq(evidenceFilesTable.uploadedById, officersTable.id))
    .where(and(
      eq(evidenceFilesTable.incidentId, incidentId),
      isNull(evidenceFilesTable.removedAt),
    ));

  res.json(rows.map(formatFile));
});

router.post("/incidents/:id/evidence", requireAuth, async (req, res): Promise<void> => {
  const incidentId = parseInt(paramString(req.params.id), 10);
  if (isNaN(incidentId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const access = await canManageIncidentEvidence(incidentId, req.officer!.id, req.officer!.role);
  if (!access.exists) { res.status(404).json({ error: "Incident not found" }); return; }
  if (!access.allowed) {
    res.status(403).json({ error: "Only the reporting officer or an admin can add evidence" });
    return;
  }

  const parsed = AddEvidenceFileBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  // `objectPath`, `contentType`, and `fileSize` in the request body are just
  // the client's claims about what it uploaded — nothing stops a caller
  // from registering an evidence record for a path that was never actually
  // uploaded, or lying about the file's type/size in the audit trail.
  // Confirm the object is real, and derive contentType/fileSize from GCS's
  // own metadata rather than the request body.
  let objectFile;
  try {
    objectFile = await objectStorageService.getObjectEntityFile(parsed.data.objectPath);
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(400).json({ error: "objectPath does not refer to an uploaded file" });
      return;
    }
    throw error;
  }

  // Each uploaded object should back exactly one evidence record — without
  // this, the same objectPath could be attached to multiple incidents (or
  // the same incident twice), producing duplicate/misleading entries in the
  // audit trail for a single upload.
  const [alreadyAttached] = await db
    .select({ id: evidenceFilesTable.id })
    .from(evidenceFilesTable)
    .where(eq(evidenceFilesTable.objectPath, parsed.data.objectPath));
  if (alreadyAttached) {
    res.status(409).json({ error: "This file has already been attached as evidence" });
    return;
  }

  const [objectMetadata] = await objectFile.getMetadata();
  const sha256 = await hashReadable(objectFile.createReadStream());
  const contentType =
    (objectMetadata.contentType as string | undefined) ||
    parsed.data.contentType ||
    "application/octet-stream";
  const fileSize =
    objectMetadata.size != null ? Number(objectMetadata.size) : (parsed.data.fileSize ?? null);

  let file: typeof evidenceFilesTable.$inferSelect;
  try {
    [file] = await db
      .insert(evidenceFilesTable)
      .values({
        incidentId,
        fileName: parsed.data.fileName,
        objectPath: parsed.data.objectPath,
        contentType,
        fileSize,
        sha256,
        uploadedById: req.officer!.id,
      })
      .returning();
  } catch (error: any) {
    if (error?.code === "23505") {
      res.status(409).json({ error: "This file has already been attached as evidence" });
      return;
    }
    throw error;
  }

  await logAction(req.officer!.id, "ADD_EVIDENCE", `Added evidence file "${parsed.data.fileName}" to incident ${incidentId}`);

  res.status(201).json(formatFile({ ...file, uploadedByName: req.officer!.name }));
});

router.delete("/incidents/:id/evidence/:fileId", requireAuth, async (req, res): Promise<void> => {
  const incidentId = parseInt(paramString(req.params.id), 10);
  const fileId = parseInt(paramString(req.params.fileId), 10);
  if (isNaN(incidentId) || isNaN(fileId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const access = await canManageIncidentEvidence(incidentId, req.officer!.id, req.officer!.role);
  if (!access.exists) { res.status(404).json({ error: "Incident not found" }); return; }
  if (!access.allowed) {
    res.status(403).json({ error: "Only the reporting officer or an admin can remove evidence" });
    return;
  }

  const [existing] = await db
    .select({ fileName: evidenceFilesTable.fileName })
    .from(evidenceFilesTable)
    .where(and(eq(evidenceFilesTable.id, fileId), eq(evidenceFilesTable.incidentId, incidentId)));

  if (!existing) { res.status(404).json({ error: "Evidence file not found" }); return; }

  await db.update(evidenceFilesTable).set({
    removedAt: new Date(),
    removedById: req.officer!.id,
  }).where(eq(evidenceFilesTable.id, fileId));
  await logAction(req.officer!.id, "DELETE_EVIDENCE", `Removed evidence file "${existing.fileName}" from incident ${incidentId}`);

  res.json({ message: "Evidence record removed; the retained source object was not destroyed" });
});

router.get("/incidents/:id/evidence-manifest", requireAuth, async (req, res): Promise<void> => {
  const incidentId = parseInt(paramString(req.params.id), 10);
  if (isNaN(incidentId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const rows = await db.select({
    fileName: evidenceFilesTable.fileName,
    contentType: evidenceFilesTable.contentType,
    fileSize: evidenceFilesTable.fileSize,
    sha256: evidenceFilesTable.sha256,
    uploadedById: evidenceFilesTable.uploadedById,
    createdAt: evidenceFilesTable.createdAt,
    removedAt: evidenceFilesTable.removedAt,
  }).from(evidenceFilesTable).where(eq(evidenceFilesTable.incidentId, incidentId));

  res.setHeader("Content-Disposition", `attachment; filename="evidence-manifest-${incidentId}.json"`);
  res.json({
    incidentId,
    generatedAt: new Date().toISOString(),
    files: rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      removedAt: row.removedAt?.toISOString() ?? null,
    })),
  });
});

export default router;
