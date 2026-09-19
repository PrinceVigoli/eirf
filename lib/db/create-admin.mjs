import bcryptjs from "bcryptjs";
import pg from "pg";
import { loadLocalDatabaseConfig } from "./local-config.mjs";

loadLocalDatabaseConfig();

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
});

const username = process.env.ADMIN_USERNAME;
const password = process.env.ADMIN_PASSWORD;
if (!username || !password) {
  throw new Error("ADMIN_USERNAME and ADMIN_PASSWORD must be set");
}
if (password.length < 8) {
  throw new Error("ADMIN_PASSWORD must be at least 8 characters");
}
const passwordHash = await bcryptjs.hash(password, 10);

await pool.query(
  `INSERT INTO officers (name, badge_number, rank, role, username, password_hash)
   VALUES ($1, $2, $3, $4, $5, $6)`,
  ["System Admin", "ADMIN-001", "Administrator", "admin", username, passwordHash],
);

console.log(`Created admin account for username=${username}`);
await pool.end();
