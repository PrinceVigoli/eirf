import { pgTable, text, serial, timestamp, integer, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { officersTable } from "./officers";

export const incidentStatusEnum = pgEnum("incident_status", ["open", "under_investigation", "settled", "closed", "archived"]);
// Previously a free-form text column with only a client-side dropdown
// constraining it — anyone calling the API directly could set an
// off-list value, silently breaking the "Incidents by Type" dashboard
// chart and making that record unfindable via the UI's type filter.
// See U4/B4 in the audit. Keep this list in sync with
// artifacts/eirf/src/lib/incident-types.ts and
// lib/api-spec/openapi.yaml's IncidentType schema.
export const incidentTypeEnum = pgEnum("incident_type", ["Crime", "Non-Crime"]);
export const incidentCategoryEnum = pgEnum("incident_category", ["crime", "non_crime"]);

export const incidentsTable = pgTable("incidents", {
  id: serial("id").primaryKey(),
  incidentNumber: text("incident_number").notNull().unique(),
  date: text("date").notNull(),
  time: text("time").notNull(),
  location: text("location").notNull(),
  type: incidentTypeEnum("type").notNull(),
  description: text("description").notNull(),
  status: incidentStatusEnum("status").notNull().default("open"),
  reportingOfficerId: integer("reporting_officer_id").references(() => officersTable.id),
  witnessStatements: text("witness_statements"),
  evidence: text("evidence"),
  notes: text("notes"),
  dateReported: text("date_reported"),
  investigatingOfficerId: integer("investigating_officer_id").references(() => officersTable.id, { onDelete: "set null" }),
  category: incidentCategoryEnum("category").notNull(),
  settledDate: text("settled_date"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertIncidentSchema = createInsertSchema(incidentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertIncident = z.infer<typeof insertIncidentSchema>;
export type Incident = typeof incidentsTable.$inferSelect;
