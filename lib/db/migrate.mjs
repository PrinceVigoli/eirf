import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { loadLocalDatabaseConfig } from "./local-config.mjs";

loadLocalDatabaseConfig();

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must be set");
const migrationDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: false });
await pool.query(`CREATE TABLE IF NOT EXISTS eirf_schema_migrations (
  name text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
)`);

const files = fs.readdirSync(migrationDir).filter((name) => name.endsWith(".sql")).sort();
for (const name of files) {
  const existing = await pool.query("SELECT 1 FROM eirf_schema_migrations WHERE name = $1", [name]);
  if (existing.rowCount) continue;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(fs.readFileSync(path.join(migrationDir, name), "utf8"));
    await client.query("INSERT INTO eirf_schema_migrations (name) VALUES ($1)", [name]);
    await client.query("COMMIT");
    console.log(`Applied migration ${name}`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
await pool.end();
console.log("Database migrations are current");
