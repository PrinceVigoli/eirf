import { db, systemLogsTable } from "@workspace/db";
import { desc, sql } from "drizzle-orm";
import { calculateLogHash } from "./auditHash";

export async function logAction(officerId: number | null, action: string, details: string): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(45475246)`);
      const [latest] = await tx.select({ entryHash: systemLogsTable.entryHash })
        .from(systemLogsTable)
        .orderBy(desc(systemLogsTable.id))
        .limit(1);
      const createdAt = new Date();
      const previousHash = latest?.entryHash ?? null;
      const entryHash = calculateLogHash(previousHash, createdAt, officerId, action, details);
      await tx.insert(systemLogsTable).values({
        officerId,
        action,
        details,
        createdAt,
        previousHash,
        entryHash,
      });
    });
  } catch {
    // Never throw from logging
  }
}
