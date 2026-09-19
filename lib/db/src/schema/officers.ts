import { pgTable, text, serial, timestamp, pgEnum, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const roleEnum = pgEnum("role", ["admin", "officer"]);

export const officersTable = pgTable("officers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  badgeNumber: text("badge_number").notNull().unique(),
  rank: text("rank").notNull(),
  role: roleEnum("role").notNull().default("officer"),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  sessionVersion: integer("session_version").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertOfficerSchema = createInsertSchema(officersTable).omit({ id: true, createdAt: true });
export type InsertOfficer = z.infer<typeof insertOfficerSchema>;
export type Officer = typeof officersTable.$inferSelect;
