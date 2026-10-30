/* eslint-disable @typescript-eslint/no-require-imports -- Standalone Node CommonJS test harness. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { runInNewContext } = require("node:vm");
const ts = require("typescript");

function load(file, dependencies = {}) {
  const context = { exports: {}, require: (id) => {
    if (id in dependencies) return dependencies[id];
    throw new Error(`Unexpected dependency: ${id}`);
  } };
  const source = ts.transpileModule(readFileSync(join(__dirname, "../app/lib", file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  runInNewContext(source, context);
  return context.exports;
}
const dates = load("lead-event-schedule.ts");
function transitions(response) {
  return load("lead-stage-transitions.ts", {
    "server-only": {},
    "@/app/lib/lead-event-schedule": dates,
    "@/app/lib/supabase/admin": { createAdminClient: () => ({ rpc: async (name) => {
      assert.equal(name, "promote_scheduled_lead_stages");
      return response;
    } }) },
  });
}

test("event day starts at midnight India time, including month/year rollover", () => {
  assert.equal(dates.indiaToday(new Date("2026-10-30T18:29:59Z")), "2026-10-30");
  assert.equal(dates.indiaToday(new Date("2026-10-30T18:30:00Z")), "2026-10-31");
  assert.equal(dates.indiaToday(new Date("2026-10-31T18:30:00Z")), "2026-11-01");
  assert.equal(dates.indiaToday(new Date("2026-12-31T18:30:00Z")), "2027-01-01");
});

test("HTTP worker uses the atomic database result, including repeat runs with no changes", async () => {
  for (const promoted of [2, 0]) {
    const result = await transitions({ data: { ok: true, date: "2026-10-31", promoted, message: "Done" }, error: null }).promoteScheduledLeadStages();
    assert.equal(result.ok, true);
    assert.equal(result.promoted, promoted);
    assert.equal(result.date, "2026-10-31");
  }
});

test("missing migration and malformed responses report failure rather than success", async () => {
  const missing = await transitions({ data: null, error: { code: "PGRST202" } }).promoteScheduledLeadStages();
  assert.equal(missing.ok, false);
  assert.match(missing.message, /20261031_schedule_event_stage_transitions.sql/);
  const invalid = await transitions({ data: {}, error: null }).promoteScheduledLeadStages();
  assert.equal(invalid.ok, false);
});
