/* eslint-disable @typescript-eslint/no-require-imports -- Standalone Node CommonJS test harness. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { runInNewContext } = require("node:vm");
const ts = require("typescript");

const compiled = ts.transpileModule(readFileSync(join(__dirname, "../app/lib/team-performance.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const context = { exports: {} };
runInNewContext(compiled, context);
const { summarizeTeamPerformance } = context.exports;
const now = Date.parse("2026-10-30T10:00:00Z");
const start = Date.parse("2026-10-29T18:30:00Z");
const end = Date.parse("2026-10-30T18:30:00Z");
const people = [{ id: "alice", name: "Alice", suspended: false }, { id: "bob", name: "Bob", suspended: true }];
const work = (id, leadId, owner, extra = {}) => ({ id, lead_id: leadId, assigned_to: owner, is_closed: false, is_ambassador: false, next_follow_up_at: null, product: { code: "PSO" }, stage: { name: "Pre PSO" }, resolution: null, ...extra });
const call = (owner, leadId, connected, direction = "outgoing") => ({ user_id: owner, lead_id: leadId, is_connected: connected, direction, duration_seconds: 10, called_at: "2026-10-30T09:00:00Z" });

test("counts calls separately while deduplicating leads across products and users", () => {
  const result = summarizeTeamPerformance(people,
    [call("alice", "lead1", true), call("alice", "lead1", false, "incoming"), call("alice", "former-lead", true), call("outsider", "lead1", true)],
    [work("a1", "lead1", "alice"), work("a2", "lead1", "alice"), work("b1", "lead1", "bob")], now, start, end);
  assert.equal(result.totals.calls, 3);
  assert.equal(result.totals.leads, 1);
  assert.equal(result.totals.work, 3);
  assert.equal(result.totals.connected, 2);
  assert.equal(result.totals.incoming, 1);
  const alice = result.members.find((member) => member.id === "alice");
  assert.equal(alice.connectRate, 67);
  assert.equal(alice.assignedLeads, 1);
  assert.equal(alice.leadsCalled, 2);
  assert.equal(alice.coverage, 100);
  assert.equal(result.members.find((member) => member.id === "bob").calls, 0);
  assert.equal(result.stages[0].count, 3);
});

test("separates closed Ambassador work from pending follow-ups and respects period boundaries", () => {
  const result = summarizeTeamPerformance(people, [], [
    work("a1", "l1", "alice", { next_follow_up_at: new Date(start).toISOString() }),
    work("a2", "l2", "alice", { next_follow_up_at: new Date(end).toISOString() }),
    work("a3", "l3", "alice", { next_follow_up_at: new Date(start - 1).toISOString() }),
    work("a4", "l4", "alice", { next_follow_up_at: new Date(start).toISOString(), is_closed: true, is_ambassador: true, product: { code: "AMBASSADOR" }, stage: { name: "Agreement" }, resolution: { name: "Agreement Signed / Waived" } }),
  ], now, start, end);
  assert.equal(result.totals.followUps, 1);
  assert.equal(result.totals.overdue, 2);
  assert.equal(result.totals.open, 3);
  assert.equal(result.totals.closed, 1);
  assert.equal(result.totals.ambassadors, 1);
  assert.equal(result.stages.length, 2);
  assert.equal(result.resolutions.find((item) => item.name === "Agreement Signed / Waived").count, 1);
});

test("handles teams without calls or lead assignments", () => {
  const result = summarizeTeamPerformance(people, [], [], now, start, end);
  assert.equal(result.totals.calls, 0);
  assert.equal(result.totals.leads, 0);
  assert.equal(result.members.length, 2);
  assert.equal(result.members[0].coverage, 0);
  assert.equal(result.members[0].connectRate, 0);
  assert.equal(result.stages.length, 0);
});
