import bcryptjs from "bcryptjs";
import pg from "pg";
import { loadLocalDatabaseConfig } from "./local-config.mjs";

loadLocalDatabaseConfig();

const { Pool } = pg;
const username = process.env.RESET_USERNAME;
const password = process.env.RESET_PASSWORD;
if (!process.env.DATABASE_URL || !username || !password) {
  throw new Error("DATABASE_URL, RESET_USERNAME, and RESET_PASSWORD must be set");
}
if (password.length < 8) throw new Error("RESET_PASSWORD must be at least 8 characters");

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });
const passwordHash = await bcryptjs.hash(password, 10);
const result = await pool.query(
  `UPDATE officers
   SET password_hash = $1, session_version = session_version + 1
   WHERE username = $2`,
  [passwordHash, username],
);
await pool.end();
if (result.rowCount !== 1) throw new Error(`Officer username not found: ${username}`);
console.log(`Password reset and existing sessions revoked for username=${username}`);
