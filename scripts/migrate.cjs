"use strict";

require("../server/load-env.cjs")();

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

function guardedUrl() {
  const value = process.env.CRM_PG_URL;
  if (!value) return null;
  let url;
  try { url = new URL(value); } catch { return null; }
  return ["127.0.0.1", "localhost"].includes(url.hostname) && url.port === "5435" && url.pathname.replace(/^\//, "") === "crm_dev" ? value : null;
}

async function main() {
  const connectionString = guardedUrl();
  if (!connectionString) { console.log("guard failed"); process.exitCode = 3; return; }
  const client = new Client({ connectionString });
  try {
    await client.connect();
    await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())");
    const files = fs.readdirSync(path.resolve(__dirname, "..", "migrations")).filter((file) => /^\d+_.+\.sql$/.test(file)).sort();
    for (const file of files) {
      const applied = await client.query("SELECT 1 FROM schema_migrations WHERE version = $1", [file]);
      if (applied.rowCount) continue;
      await client.query("BEGIN");
      try { await client.query(fs.readFileSync(path.resolve(__dirname, "..", "migrations", file), "utf8")); await client.query("INSERT INTO schema_migrations(version) VALUES ($1)", [file]); await client.query("COMMIT"); } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error; }
    }
    console.log("migrations applied");
  } catch { console.log("migration failed"); process.exitCode = 1; } finally { await client.end().catch(() => {}); }
}

main().catch(() => { console.log("migration failed"); process.exitCode = 1; });
