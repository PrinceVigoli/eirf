import { pgTable, text, serial, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const personsTable = pgTable("persons", {
  id: serial("id").primaryKey(),
  fullName: text("full_name").notNull(),
  lastName: text("last_name"),
  middleName: text("middle_name"),
  firstName: text("first_name"),
  region: text("region"),
  province: text("province"),
  cityMunicipality: text("city_municipality"),
  barangay: text("barangay"),
  dialect: text("dialect"),
  tribe: text("tribe"),
  alias: text("alias"),
  dateOfBirth: text("date_of_birth"),
  sex: text("sex"),
  nationality: text("nationality"),
  address: text("address"),
  contactNumber: text("contact_number"),
  email: text("email"),
  idType: text("id_type"),
  idNumber: text("id_number"),
  occupation: text("occupation"),
  physicalDescription: text("physical_description"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  fullNameIdx: index("persons_full_name_idx").on(t.fullName),
  aliasIdx: index("persons_alias_idx").on(t.alias),
}));

export const insertPersonSchema = createInsertSchema(personsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPerson = z.infer<typeof insertPersonSchema>;
export type Person = typeof personsTable.$inferSelect;
