import { pgTable, serial, integer, text, timestamp, pgEnum, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { incidentsTable } from "./incidents";
import { personsTable } from "./persons";

export const personRoleEnum = pgEnum("person_role", ["victim", "complainant", "suspect", "witness"]);

export const incidentPersonsTable = pgTable("incident_persons", {
  id: serial("id").primaryKey(),
  incidentId: integer("incident_id").notNull().references(() => incidentsTable.id, { onDelete: "cascade" }),
  personId: integer("person_id").notNull().references(() => personsTable.id, { onDelete: "restrict" }),
  role: personRoleEnum("role").notNull(),
  roleDetails: text("role_details"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  linkUnique: uniqueIndex("incident_persons_incident_person_role_unique").on(t.incidentId, t.personId, t.role),
  incidentIdx: index("incident_persons_incident_id_idx").on(t.incidentId),
  personIdx: index("incident_persons_person_id_idx").on(t.personId),
}));

export const insertIncidentPersonSchema = createInsertSchema(incidentPersonsTable).omit({ id: true, createdAt: true });
export type InsertIncidentPerson = z.infer<typeof insertIncidentPersonSchema>;
export type IncidentPerson = typeof incidentPersonsTable.$inferSelect;
