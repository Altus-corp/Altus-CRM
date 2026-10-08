const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");

test("importer does not own application table definitions", () => {
  const source = fs.readFileSync("server/import-altus.cjs", "utf8");
  for (const table of ["users", "leads", "lead_calls", "lead_followups", "lead_history", "lead_messages", "admin_templates", "master_values", "workspace_settings"]) {
    assert.doesNotMatch(source, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`), table);
  }
  assert.match(fs.readFileSync("migrations/001_phase0_foundation.sql", "utf8"), /CREATE TABLE IF NOT EXISTS leads/);
});
