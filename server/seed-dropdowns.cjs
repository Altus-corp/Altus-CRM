"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Client } = require("pg");
const { guardedDatabaseUrl, reportFailure } = require("./load-env.cjs");
const { auditScriptRun, isSupabaseUrl } = require("./write-guard.cjs");

const seed = JSON.parse(fs.readFileSync(path.resolve(__dirname, "..", "shared", "dropdown-seed.json"), "utf8"));

async function main() {
  const guarded = guardedDatabaseUrl();
  if (!guarded.ok) { reportFailure("dropdown seed", { code: guarded.code }, guarded.reason, guarded.target); process.exitCode = 3; return; }
  if (isSupabaseUrl(guarded.value) && process.env.ALLOW_SUPABASE_WRITE !== "1") { reportFailure("dropdown seed", { code: "SUPABASE_WRITE_BLOCKED" }, "Set ALLOW_SUPABASE_WRITE=1 for this process.", guarded.target); process.exitCode = 3; return; }
  const client = new Client({ connectionString: guarded.value });
  try {
    await client.connect();
    await auditScriptRun(client, "seed-dropdowns");
    await client.query("BEGIN");
    for (const [key, options] of Object.entries(seed)) {
      const definition = await client.query("SELECT id,source_type FROM dropdown_definitions WHERE key=$1", [key]);
      if (!definition.rows[0]) throw new Error(`Missing dropdown definition: ${key}`);
      if (!["managed", "system_locked"].includes(definition.rows[0].source_type)) throw new Error(`Cannot seed API-backed dropdown: ${key}`);
      for (const option of options) {
        const id = `dropdown-option-seed-${key}-${option.value}`.replace(/[^a-zA-Z0-9_-]/g, "-");
        await client.query("INSERT INTO dropdown_options(id,dropdown_id,label,value,semantic_key,sort_order,is_active,updated_at) VALUES($1,$2,$3,$4,$5,$6,true,now()) ON CONFLICT(dropdown_id,value) DO UPDATE SET label=EXCLUDED.label,semantic_key=EXCLUDED.semantic_key,sort_order=EXCLUDED.sort_order,is_active=true,updated_at=now()", [id, definition.rows[0].id, option.label, option.value, option.semantic_key || null, option.sort_order]);
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    reportFailure("dropdown seed", error, "Check the local migration target and seed data.", guarded.target);
    process.exitCode = 1;
  } finally { await client.end().catch(() => {}); }
}

if (require.main === module) main().catch((error) => { reportFailure("dropdown seed", error, "Check the local migration target and seed data."); process.exitCode = 1; });
module.exports = { main, seed };
