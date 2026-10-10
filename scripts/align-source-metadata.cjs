"use strict";

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const load = require("../server/load-env.cjs");
const { assertSupabaseWriteAllowed, auditScriptRun } = require("../server/write-guard.cjs");
load();

function sourceUrl() {
  const source = fs.readFileSync(path.resolve(__dirname, "..", ".env"), "utf8");
  const line = source.split(/\r?\n/).find((value) => value.trim().startsWith("CRM_PG_URL="));
  return line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}
function ssl(url) { const host = new URL(url).hostname; return host.endsWith(".supabase.co") || host.endsWith(".pooler.supabase.com") ? { rejectUnauthorized: false } : undefined; }
async function connect(url) { const client = new Client({ connectionString: url, ...(ssl(url) ? { ssl: ssl(url) } : {}) }); await client.connect(); return client; }
function quote(value) { return `"${String(value).replace(/"/g, '""')}"`; }

(async () => {
  const source = await connect(sourceUrl());
  assertSupabaseWriteAllowed(load.databaseConnectionString(), "align-source-metadata");
  const target = await connect(load.databaseConnectionString());
  await auditScriptRun(target, "align-source-metadata");
  const report = {};
  await target.query("BEGIN");
  try {
    const runs = (await source.query("SELECT id,source_tenant,source_snapshot_seq,source_checksum,counts FROM import_runs")).rows;
    const runValues = [];
    for (const row of runs) runValues.push(row.id, row.source_tenant || "altus", row.source_snapshot_seq, row.source_checksum, JSON.stringify(row.counts || {}));
    if (runs.length) {
      const placeholders = runs.map((_, index) => `($${index * 5 + 1}::text,$${index * 5 + 2}::text,$${index * 5 + 3}::bigint,$${index * 5 + 4}::text,$${index * 5 + 5}::jsonb)`).join(",");
      const result = await target.query(`UPDATE import_runs AS t SET source_tenant=v.source_tenant,source_snapshot_seq=v.source_snapshot_seq,source_checksum=v.source_checksum,counts=v.counts FROM (VALUES ${placeholders}) AS v(id,source_tenant,source_snapshot_seq,source_checksum,counts) WHERE t.id=v.id`, runValues);
      report.import_runs = result.rowCount || 0;
    }
    for (const table of ["leads", "lead_calls", "lead_followups", "lead_history", "lead_messages"]) {
      const rows = (await source.query(`SELECT id,imported_at FROM ${quote(table)}`)).rows;
      const params = []; const placeholders = rows.map((row, index) => { params.push(row.id, row.imported_at); return `($${index * 2 + 1}::text,$${index * 2 + 2}::timestamptz)`; }).join(",");
      if (!rows.length) { report[table] = 0; continue; }
      const result = await target.query(`UPDATE ${quote(table)} AS t SET imported_at=v.imported_at FROM (VALUES ${placeholders}) AS v(id,imported_at) WHERE t.id=v.id`, params);
      report[table] = result.rowCount || 0;
    }
    await target.query("COMMIT");
  } catch (error) { await target.query("ROLLBACK").catch(() => {}); throw error; }
  finally { await source.end().catch(() => {}); await target.end().catch(() => {}); }
  console.log(JSON.stringify(report));
})().catch(error => { console.error(`METADATA_ALIGNMENT_FAILED ${String(error.code || error.name || "UNKNOWN")}`); process.exitCode = 1; });
