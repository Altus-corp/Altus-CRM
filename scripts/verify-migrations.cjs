"use strict";

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

function connectionString() {
  const value = process.env.PHASE1_TEST_URL;
  if (!value) return null;
  let url;
  try { url = new URL(value); } catch { return null; }
  return ["127.0.0.1", "localhost"].includes(url.hostname) && url.port !== "5435" && url.pathname.replace(/^\//, "") === "phase1_test" ? value : null;
}

const migrations = fs.readdirSync(path.resolve(__dirname, "..", "migrations")).filter((file) => /^\d+_.+\.sql$/.test(file)).sort();
async function apply(client) {
  await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())");
  for (const file of migrations) {
    if ((await client.query("SELECT 1 FROM schema_migrations WHERE version=$1", [file])).rowCount) continue;
    await client.query("BEGIN");
    try { await client.query(fs.readFileSync(path.resolve(__dirname, "..", "migrations", file), "utf8")); await client.query("INSERT INTO schema_migrations(version) VALUES($1)", [file]); await client.query("COMMIT"); } catch (error) { await client.query("ROLLBACK"); throw error; }
  }
}
async function reset(client) { await client.query("DROP SCHEMA public CASCADE"); await client.query("CREATE SCHEMA public"); }
async function main() {
  const url = connectionString(); if (!url) { console.log("test guard failed"); process.exitCode = 3; return; }
  const client = new Client({ connectionString: url });
  try {
    await client.connect();
    await reset(client); await apply(client); await apply(client); console.log("fresh scenario passed");
    await reset(client); await client.query("CREATE TABLE import_runs (id TEXT PRIMARY KEY, source_tenant TEXT NOT NULL, mode TEXT NOT NULL, status TEXT NOT NULL, counts JSONB NOT NULL DEFAULT '{}'::jsonb, started_at TIMESTAMPTZ NOT NULL DEFAULT now())"); await client.query("CREATE TABLE leads (id TEXT PRIMARY KEY, source_id TEXT UNIQUE, owner_user_id TEXT)"); await client.query("CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, role TEXT NOT NULL, active BOOLEAN NOT NULL DEFAULT true, offboarded BOOLEAN NOT NULL DEFAULT false)"); await apply(client); await apply(client); console.log("existing importer scenario passed");
  } catch { console.log("migration proof failed"); process.exitCode = 1; } finally { await client.end().catch(() => {}); }
}
main().catch(() => { console.log("migration proof failed"); process.exitCode = 1; });
