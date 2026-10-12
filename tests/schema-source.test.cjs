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

test("dropdown migration has source types, immutable values, ordering, and master backfill", () => {
  const source = fs.readFileSync("migrations/009_dropdown_configuration.sql", "utf8");
  assert.match(source, /CREATE TABLE IF NOT EXISTS dropdown_definitions/);
  assert.match(source, /source_type TEXT NOT NULL DEFAULT 'managed'/);
  assert.match(source, /CHECK \(source_type IN \('managed', 'system_locked', 'api_backed'\)\)/);
  assert.match(source, /CREATE TABLE IF NOT EXISTS dropdown_options/);
  assert.match(source, /prevent_dropdown_option_value_change/);
  assert.match(source, /UNIQUE \(dropdown_id, value\)/);
  assert.match(source, /FROM master_values mv/);
  assert.match(source, /semantic_key/);
  assert.match(source, /ON CONFLICT \(dropdown_id, value\) DO NOTHING/);
  assert.doesNotMatch(source, /ON CONFLICT \(dropdown_id, value\) DO UPDATE/);
});

test("accounts migration keeps the simplified link model", () => {
  const source = fs.readFileSync("migrations/004_accounts_contacts.sql", "utf8");
  assert.match(source, /CREATE TABLE IF NOT EXISTS accounts/);
  assert.match(source, /CREATE TABLE IF NOT EXISTS contacts/);
  assert.match(source, /account_id TEXT REFERENCES accounts/);
  assert.match(source, /CREATE TABLE IF NOT EXISTS contact_leads/);
  assert.doesNotMatch(source, /account_leads|account_contacts/);
  assert.match(source, /status TEXT NOT NULL DEFAULT 'active'/);
});
