import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { officersTable } from "./officers";
import { incidentsTable } from "./incidents";

export const evidenceFilesTable = pgTable("evidence_files", {
  id: serial("id").primaryKey(),
  incidentId: integer("incident_id").notNull().references(() => incidentsTable.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  objectPath: text("object_path").notNull().unique(),
  contentType: text("content_type").notNull(),
  fileSize: integer("file_size"),
  sha256: text("sha256"),
  uploadedById: integer("uploaded_by_id").references(() => officersTable.id),
  removedById: integer("removed_by_id").references(() => officersTable.id),
  removedAt: timestamp("removed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type EvidenceFile = typeof evidenceFilesTable.$inferSelect;
