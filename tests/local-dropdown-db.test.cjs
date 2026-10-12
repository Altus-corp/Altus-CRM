const test = require("node:test");
const assert = require("node:assert/strict");
const { openDb } = require("../server/db.cjs");
const { analyzeUpload } = require("../server/lead-import.cjs");

const target = String(process.env.CRM_PG_URL || "");
const enabled = process.env.RUN_LOCAL_DROPDOWN_DB_TEST === "1";
const localTarget = (() => { try { const url = new URL(target); return url.hostname === "127.0.0.1" && url.port === "5435" && url.pathname === "/crm_dev"; } catch { return false; } })();

test("local DB: an admin-added lead_type is accepted by import", { skip: !enabled || !localTarget }, async () => {
  const db = await openDb(target);
  const value = `LOCAL_TEST_${Date.now()}`;
  const id = `dropdown-option-local-${Date.now()}`;
  try {
    const definition = (await db.query("SELECT id FROM dropdown_definitions WHERE key='lead_type' AND source_type='managed'", [])).rows[0];
    assert.ok(definition, "lead_type managed definition must exist");
    await db.query("INSERT INTO dropdown_options(id,dropdown_id,label,value,sort_order,is_active) VALUES($1,$2,$3,$4,9999,true)", [id, definition.id, "Local test type", value]);
    const analysis = await analyzeUpload(Buffer.from(`name,lead_type,stage\nLocal import,${value},qualified\n`), "local-lead-type.csv", db);
    assert.deepEqual(analysis.errors, [], JSON.stringify(analysis.errors));
    assert.equal(analysis.valid[0].values.lead_type, value);
  } finally {
    await db.query("DELETE FROM dropdown_options WHERE id=$1", [id]);
    await db.close();
  }
});
