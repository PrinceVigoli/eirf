import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function loadLocalDatabaseConfig() {
  if (process.env.DATABASE_URL) return;
  const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const envFile = path.join(workspaceRoot, ".env.local");
  if (!fs.existsSync(envFile)) return;
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
  const user = process.env.POSTGRES_USER || "eirf";
  const password = process.env.POSTGRES_PASSWORD;
  const port = process.env.POSTGRES_PORT || "5432";
  const database = process.env.POSTGRES_DB || "eirf";
  if (password) {
    process.env.DATABASE_URL = `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@127.0.0.1:${port}/${database}`;
  }
}
