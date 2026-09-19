import { Request, Response, NextFunction } from "express";
import { db, officersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

declare global {
  namespace Express {
    interface Request {
      officer?: {
        id: number;
        name: string;
        badgeNumber: string;
        rank: string;
        role: "admin" | "officer";
        username: string;
        createdAt: Date;
      };
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const officerId = req.signedCookies?.officerId;
  if (!officerId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const match = /^(\d+)\.(\d+)$/.exec(officerId);
  if (!match) {
    res.status(401).json({ error: "Invalid session" });
    return;
  }
  const id = Number(match[1]);
  const sessionVersion = Number(match[2]);
  const [officer] = await db.select().from(officersTable).where(eq(officersTable.id, id));
  if (!officer || officer.sessionVersion !== sessionVersion) {
    res.clearCookie("officerId");
    res.status(401).json({ error: "Session expired" });
    return;
  }
  req.officer = {
    id: officer.id,
    name: officer.name,
    badgeNumber: officer.badgeNumber,
    rank: officer.rank,
    role: officer.role,
    username: officer.username,
    createdAt: officer.createdAt,
  };
  next();
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  await requireAuth(req, res, () => {
    if (req.officer?.role !== "admin") {
      res.status(403).json({ error: "Admin access required" });
      return;
    }
    next();
  });
}
