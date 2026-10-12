const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { eligibleUsers, matchesRule, nextUser, assignLeadRoundRobin } = require("../server/lead-assignment.cjs");

const users = [
  { id: "u-1", name: "One", role: "Sales", active: true, offboarded: false, employee_active: true, team: "alpha" },
  { id: "u-2", name: "Two", role: "Sales", active: true, offboarded: false, employee_active: true, team: "alpha" },
  { id: "u-3", name: "Three", role: "Viewer", active: true, offboarded: false, employee_active: true, team: "alpha" },
  { id: "u-4", name: "Four", role: "Sales", active: false, offboarded: false, employee_active: true, team: "alpha" },
];

test("rule conditions and eligible pool filters are deterministic", () => {
  assert.equal(matchesRule({ team: "alpha", lead_type: "DL" }, { conditions: { team: "alpha", lead_type: "DL" } }), true);
  assert.equal(matchesRule({ team: "beta", lead_type: "DL" }, { conditions: { team: "alpha" } }), false);
  assert.deepEqual(eligibleUsers(users, { actions: { roles: ["Sales"], team: "alpha" } }).map((user) => user.id), ["u-1", "u-2"]);
  assert.deepEqual(eligibleUsers(users, { actions: { pool: ["u-2", "u-3"] } }).map((user) => user.id), ["u-2", "u-3"]);
  assert.deepEqual(eligibleUsers(users, { actions: { user_ids: ["u-3"] } }).map((user) => user.id), ["u-3"]);
});

test("rotation chooses the next user and wraps around", () => {
  assert.equal(nextUser(users.slice(0, 2), null).id, "u-1");
  assert.equal(nextUser(users.slice(0, 2), "u-1").id, "u-2");
  assert.equal(nextUser(users.slice(0, 2), "u-2").id, "u-1");
  assert.equal(nextUser(users.slice(0, 2), "missing").id, "u-1");
});

function assignmentDb({ rules, users: pool, pointer = null }) {
  const sql = [];
  let currentPointer = pointer;
  return {
    sql,
    get pointer() { return currentPointer; },
    async query(text, params = []) {
      sql.push({ text, params });
      if (text.includes("FROM assignment_rules WHERE enabled")) return { rows: rules.map((rule) => ({ ...rule, last_assigned_user_id: currentPointer })) };
      if (text.includes("FROM assignment_rules WHERE id=$1 FOR UPDATE")) return { rows: [{ ...rules[0], last_assigned_user_id: currentPointer }] };
      if (text.includes("FROM users u LEFT JOIN employee_profiles")) return { rows: pool };
      if (text.startsWith("UPDATE assignment_rules")) { currentPointer = params[1]; return { rows: [] }; }
      return { rows: [] };
    },
  };
}

test("assignment persists owner, pointer, and history in the transaction", async () => {
  const db = assignmentDb({ rules: [{ id: "rule-1", name: "Sales pool", priority: 1, conditions: { team: "alpha" }, actions: { roles: ["Sales"], team: "alpha" } }], users });
  const result = await assignLeadRoundRobin(db, { leadId: "lead-1", lead: { team: "alpha", lead_type: "DL", owner_user_id: null }, actorId: "actor-1" });
  assert.equal(result.ownerId, "u-1");
  assert.equal(db.pointer, "u-1");
  assert.ok(db.sql.some(({ text }) => text.includes("FOR UPDATE")));
  assert.ok(db.sql.some(({ text }) => text.includes("UPDATE leads SET owner_user_id")));
  assert.ok(db.sql.some(({ text }) => text.includes("INSERT INTO lead_history")));
});

test("explicit owners are not round-robined and empty or missing pools are recorded", async () => {
  const explicit = assignmentDb({ rules: [], users });
  assert.deepEqual(await assignLeadRoundRobin(explicit, { leadId: "lead-1", lead: { owner_user_id: "u-9" }, actorId: "actor-1" }), { assigned: false, reason: "explicit_owner" });
  const empty = assignmentDb({ rules: [{ id: "rule-1", name: "Empty", conditions: {}, actions: { roles: ["Admin"] } }], users });
  assert.equal((await assignLeadRoundRobin(empty, { leadId: "lead-2", lead: {}, actorId: "actor-1" })).reason, "empty_pool");
  assert.ok(empty.sql.some(({ text }) => text.includes("INSERT INTO lead_history")));
});

test("round-robin migration and source wiring are present", () => {
  const migration = fs.readFileSync("migrations/010_lead_round_robin.sql", "utf8");
  const server = fs.readFileSync("server/index.cjs", "utf8");
  const importer = fs.readFileSync("server/lead-import.cjs", "utf8");
  const assignment = fs.readFileSync("server/lead-assignment.cjs", "utf8");
  const settings = fs.readFileSync("src/screens/settings/page.tsx", "utf8");
  assert.match(migration, /last_assigned_user_id/);
  assert.match(migration, /employee_profiles.*team/);
  assert.match(server, /assignLeadRoundRobin/);
  assert.match(assignment, /FOR UPDATE/);
  assert.match(importer, /assignLeadRoundRobin/);
  assert.match(importer, /team: text\(values\.team\)/);
  assert.match(settings, /employeeDraft\.team/);
  assert.match(settings, /<th>Team<\/th>/);
  assert.match(settings, /employee\.team/);
});
