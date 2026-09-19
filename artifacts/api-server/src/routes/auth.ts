import { Router } from "express";
import bcryptjs from "bcryptjs";
import { db, officersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { LoginBody, ChangePasswordBody, UpdateMyProfileBody } from "@workspace/api-zod";
import { logAction } from "../lib/logger-helper";
import { isRateLimited } from "../lib/rateLimit";

const router = Router();

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const { username, password } = parsed.data;

  const limitKey = `${req.ip}:${username.toLowerCase()}`;
  if (isRateLimited(limitKey, { windowMs: 15 * 60 * 1000, max: 10 })) {
    res.status(429).json({ error: "Too many attempts. Try again later." });
    return;
  }

  const [officer] = await db.select().from(officersTable).where(eq(officersTable.username, username));
  if (!officer) {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }
  const valid = await bcryptjs.compare(password, officer.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }
  res.cookie("officerId", `${officer.id}.${officer.sessionVersion}`, {
    signed: true,
    httpOnly: true,
    sameSite: "lax",
    // Only sent over HTTPS in production. Left off in non-production so the
    // Vite dev server (typically plain HTTP on localhost) keeps working.
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  await logAction(officer.id, "LOGIN", `Officer ${officer.name} logged in`);
  res.json({
    officer: {
      id: officer.id,
      name: officer.name,
      badgeNumber: officer.badgeNumber,
      rank: officer.rank,
      role: officer.role,
      username: officer.username,
      avatarUrl: officer.avatarUrl,
      coverUrl: officer.coverUrl,
      createdAt: officer.createdAt.toISOString(),
    },
  });
});

router.post("/auth/logout", requireAuth, async (req, res): Promise<void> => {
  if (req.officer) {
    await logAction(req.officer.id, "LOGOUT", `Officer ${req.officer.name} logged out`);
  }
  res.clearCookie("officerId");
  res.json({ message: "Logged out successfully" });
});

router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const o = req.officer!;
  res.json({
    id: o.id,
    name: o.name,
    badgeNumber: o.badgeNumber,
    rank: o.rank,
    role: o.role,
    username: o.username,
    avatarUrl: o.avatarUrl,
    coverUrl: o.coverUrl,
    createdAt: o.createdAt.toISOString(),
  });
});

router.patch("/auth/me/password", requireAuth, async (req, res): Promise<void> => {
  const parsed = ChangePasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  const { currentPassword, newPassword } = parsed.data;
  const [officer] = await db.select().from(officersTable).where(eq(officersTable.id, req.officer!.id));
  const valid = await bcryptjs.compare(currentPassword, officer.passwordHash);
  if (!valid) {
    res.status(400).json({ error: "Current password is incorrect" });
    return;
  }
  if (newPassword.length < 8) {
    res.status(400).json({ error: "New password must be at least 8 characters" });
    return;
  }
  const passwordHash = await bcryptjs.hash(newPassword, 10);
  await db.update(officersTable).set({
    passwordHash,
    sessionVersion: sql`${officersTable.sessionVersion} + 1`,
  }).where(eq(officersTable.id, req.officer!.id));
  res.clearCookie("officerId");
  await logAction(req.officer!.id, "CHANGE_PASSWORD", `Officer ${req.officer!.name} changed their password`);
  res.json({ message: "Password changed successfully. Please sign in again." });
});

// Only accept object-storage paths minted by our own upload flow
// (/objects/<id>), so a caller can't point avatar/cover at an arbitrary
// URL. null clears the photo.
const OBJECT_PATH_RE = /^\/objects\/[A-Za-z0-9._/-]+$/;

router.patch("/auth/me/profile", requireAuth, async (req, res): Promise<void> => {
  const parsed = UpdateMyProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  const { avatarUrl, coverUrl } = parsed.data;
  const updates: { avatarUrl?: string | null; coverUrl?: string | null } = {};
  if (avatarUrl !== undefined) {
    if (avatarUrl !== null && !OBJECT_PATH_RE.test(avatarUrl)) {
      res.status(400).json({ error: "Invalid avatar path" });
      return;
    }
    updates.avatarUrl = avatarUrl;
  }
  if (coverUrl !== undefined) {
    if (coverUrl !== null && !OBJECT_PATH_RE.test(coverUrl)) {
      res.status(400).json({ error: "Invalid cover path" });
      return;
    }
    updates.coverUrl = coverUrl;
  }
  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No changes provided" });
    return;
  }
  const [updated] = await db
    .update(officersTable)
    .set(updates)
    .where(eq(officersTable.id, req.officer!.id))
    .returning();
  await logAction(req.officer!.id, "UPDATE_PROFILE", `Officer ${req.officer!.name} updated their profile photos`);
  res.json({
    id: updated.id,
    name: updated.name,
    badgeNumber: updated.badgeNumber,
    rank: updated.rank,
    role: updated.role,
    username: updated.username,
    avatarUrl: updated.avatarUrl,
    coverUrl: updated.coverUrl,
    createdAt: updated.createdAt.toISOString(),
  });
});

export default router;
