"use strict";

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");
const { Client } = require("pg");
const load = require("../server/load-env.cjs");

load();

function sourceUrl() {
  const source = fs.readFileSync(path.resolve(__dirname, "..", ".env"), "utf8");
  const line = source.split(/\r?\n/).find((value) => value.trim().startsWith("CRM_PG_URL="));
  return line ? line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "") : "";
}

function ssl(url) {
  const host = new URL(url).hostname;
  return host.endsWith(".supabase.co") || host.endsWith(".pooler.supabase.com") ? { rejectUnauthorized: false } : undefined;
}

async function backup(label, url, output) {
  const client = new Client({ connectionString: url, ...(ssl(url) ? { ssl: ssl(url) } : {}) });
  await client.connect();
  const tables = (await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name")).rows.map((row) => row.table_name);
  const data = { format: 1, label, created_at: new Date().toISOString(), tables: {} };
  for (const table of tables) {
    const safe = table.replace(/"/g, '""');
    data.tables[table] = (await client.query(`SELECT * FROM "${safe}"`)).rows;
  }
  await client.end();
  const compressed = zlib.gzipSync(Buffer.from(JSON.stringify(data)));
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, compressed, { flag: "wx" });
  const verify = JSON.parse(zlib.gunzipSync(fs.readFileSync(output, { flag: "r" })).toString("utf8"));
  if (verify.format !== 1 || Object.keys(verify.tables).length !== tables.length) throw new Error(`${label} backup verification failed`);
  const manifest = { label, file: path.basename(output), sha256: crypto.createHash("sha256").update(compressed).digest("hex"), table_count: tables.length, row_counts: Object.fromEntries(tables.map((table) => [table, verify.tables[table].length])) };
  fs.writeFileSync(`${output}.manifest.json`, JSON.stringify(manifest, null, 2), { flag: "wx" });
  return manifest;
}

(async () => {
  const root = path.resolve(__dirname, "..", "backups", `crm-migration-${new Date().toISOString().replace(/[:.]/g, "-")}`);
  const source = await backup("local crm_dev", sourceUrl(), path.join(root, "local-crm-dev.json.gz"));
  const target = await backup("supabase target", load.databaseConnectionString(), path.join(root, "supabase-target.json.gz"));
  console.log(JSON.stringify({ directory: root, source, target }));
})().catch((error) => {
  console.error(`BACKUP_FAILED ${String(error.code || error.name || "UNKNOWN")}`);
  process.exitCode = 1;
});
