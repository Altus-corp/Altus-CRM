"use strict";

const { guardedDatabaseUrl, reportFailure, databaseTarget } = require("../server/load-env.cjs");
require("../server/load-env.cjs")();

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

async function main() {
  const guarded = guardedDatabaseUrl();
  if (!guarded.ok) { reportFailure("migration", { code: guarded.code }, guarded.reason, guarded.target); process.exitCode = 3; return; }
  const host = guarded.url.hostname;
  const ssl = host.endsWith(".supabase.co") || host.endsWith(".pooler.supabase.com") ? { rejectUnauthorized: false } : undefined;
  const client = new Client({ connectionString: guarded.value, ...(ssl ? { ssl } : {}) });
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
    const applied = await client.query("SELECT version FROM schema_migrations ORDER BY version");
    console.log(`migrations applied: ${applied.rows.map((row) => row.version).join(", ")}`);
  } catch (error) { reportFailure("migration", error, "Check PostgreSQL availability and credentials.", guarded.target); process.exitCode = 1; } finally { await client.end().catch(() => {}); }
}

main().catch((error) => { reportFailure("migration", error, "Check the migration files and PostgreSQL permissions.", databaseTarget()); process.exitCode = 1; });
