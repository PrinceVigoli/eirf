import { pgTable, integer, text, timestamp } from "drizzle-orm/pg-core";

export const appSettingsTable = pgTable("app_settings", {
  id: integer("id").primaryKey().default(1),
  stationName: text("station_name").notNull().default("Luna Municipal Police Station"),
  stationShortName: text("station_short_name").notNull().default("Luna Municipal Police Station"),
  reportTitle: text("report_title").notNull().default("Electronic Incident Records Form"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type AppSettings = typeof appSettingsTable.$inferSelect;
