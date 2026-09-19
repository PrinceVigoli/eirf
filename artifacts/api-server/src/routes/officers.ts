import { Router } from "express";
import bcryptjs from "bcryptjs";
import { db, officersTable } from "@workspace/db";
import { eq, count, sql } from "drizzle-orm";
import { requireAdmin, requireAuth } from "../middlewares/requireAuth";
import { CreateOfficerBody, UpdateOfficerBody } from "@workspace/api-zod";
import { logAction } from "../lib/logger-helper";
import { paramString } from "../lib/params";

const router = Router();

// True if `officerId` is currently an admin and is the only one left — used
// to block actions (role change, delete) that would leave the system with
// zero admins and no in-app way to reach Officers/Logs again.
async function isLastAdmin(officerId: number): Promise<boolean> {
  const [target] = await db.select({ role: officersTable.role })
    .from(officersTable).where(eq(officersTable.id, officerId));
  if (!target || target.role !== "admin") return false;
  const [{ adminCount }] = await db.select({ adminCount: count() })
    .from(officersTable).where(eq(officersTable.role, "admin"));
  return Number(adminCount) <= 1;
}

function formatOfficer(o: typeof officersTable.$inferSelect) {
  return {
    id: o.id,
    name: o.name,
    badgeNumber: o.badgeNumber,
    rank: o.rank,
    role: o.role,
    username: o.username,
    createdAt: o.createdAt.toISOString(),
  };
}

// Readable by all authenticated users (e.g. the investigating-officer picker),
// unlike the admin-only /officers list below. Must stay before /officers/:id
// so "roster" isn't captured as an :id param. Projection excludes
// username/passwordHash/role/etc — only picker-safe fields.
router.get("/officers/roster", requireAuth, async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      id: officersTable.id,
      name: officersTable.name,
      rank: officersTable.rank,
      badgeNumber: officersTable.badgeNumber,
    })
    .from(officersTable)
    .orderBy(officersTable.name);
  res.json(rows);
});

router.get("/officers", requireAdmin, async (req, res): Promise<void> => {
  const rows = await db.select().from(officersTable).orderBy(officersTable.name);
  res.json(rows.map(formatOfficer));
});

router.post("/officers", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateOfficerBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { password, ...rest } = parsed.data;
  if (password.length < 8) { res.status(400).json({ error: "Password must be at least 8 characters" }); return; }
  const passwordHash = await bcryptjs.hash(password, 10);
  const [officer] = await db.insert(officersTable).values({ ...rest, passwordHash }).returning();
  await logAction(req.officer!.id, "CREATE_OFFICER", `Created officer account for ${officer.name}`);
  res.status(201).json(formatOfficer(officer));
});

router.get("/officers/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(paramString(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [officer] = await db.select().from(officersTable).where(eq(officersTable.id, id));
  if (!officer) { res.status(404).json({ error: "Officer not found" }); return; }
  res.json(formatOfficer(officer));
});

router.patch("/officers/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(paramString(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = UpdateOfficerBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const updates: Record<string, unknown> = {};
  const data = parsed.data;
  if (data.role !== undefined && data.role !== "admin" && await isLastAdmin(id)) {
    res.status(400).json({ error: "Cannot remove admin role from the last remaining admin" });
    return;
  }
  if (data.name !== undefined) updates.name = data.name;
  if (data.badgeNumber !== undefined) updates.badgeNumber = data.badgeNumber;
  if (data.rank !== undefined) updates.rank = data.rank;
  if (data.role !== undefined) updates.role = data.role;
  if (data.username !== undefined) updates.username = data.username;
  if (data.password) {
    if (data.password.length < 8) { res.status(400).json({ error: "Password must be at least 8 characters" }); return; }
    updates.passwordHash = await bcryptjs.hash(data.password, 10);
    updates.sessionVersion = sql`${officersTable.sessionVersion} + 1`;
  }
  if (Object.keys(updates).length === 0) { res.status(400).json({ error: "No fields to update" }); return; }
  await db.update(officersTable).set(updates).where(eq(officersTable.id, id));
  await logAction(req.officer!.id, "UPDATE_OFFICER", `Updated officer id ${id}`);
  const [updated] = await db.select().from(officersTable).where(eq(officersTable.id, id));
  if (!updated) { res.status(404).json({ error: "Officer not found" }); return; }
  res.json(formatOfficer(updated));
});

router.delete("/officers/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(paramString(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  if (id === req.officer!.id) { res.status(400).json({ error: "Cannot delete your own account" }); return; }
  if (await isLastAdmin(id)) {
    res.status(400).json({ error: "Cannot delete the last remaining admin" });
    return;
  }
  const [existing] = await db.select({ name: officersTable.name }).from(officersTable).where(eq(officersTable.id, id));
  if (!existing) { res.status(404).json({ error: "Officer not found" }); return; }
  await db.delete(officersTable).where(eq(officersTable.id, id));
  await logAction(req.officer!.id, "DELETE_OFFICER", `Deleted officer ${existing.name}`);
  res.json({ message: "Officer deleted" });
});

export default router;
