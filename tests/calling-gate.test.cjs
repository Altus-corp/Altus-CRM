const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { Readable } = require("node:stream");
const { route } = require("../server/index.cjs");

const permissions = ["Yes", "No", "", "Pending"];
const roles = ["Owner", "Admin", "Sales", "Viewer"];

function response() { return { status: 0, headers: {}, body: "", setHeader() {}, writeHead(status, headers) { this.status = status; this.headers = headers; }, end(body) { this.body = String(body || ""); } }; }
function request(body) { const req = Readable.from([Buffer.from(JSON.stringify(body))]); req.method = "POST"; req.url = "/api/leads/fixture-lead/calls"; req.headers = { "x-altus": "1" }; req.socket = { remoteAddress: "127.0.0.1", encrypted: false }; return req; }
function fixtureDb(actor, permission) {
  const sql = [];
  return {
    sql,
    sessionUser: async () => actor.id,
    userById: async () => actor,
    query: async (text) => { sql.push(text); if (text.startsWith("SELECT id,permission FROM leads")) return { rows: [{ id: "fixture-lead", permission }] }; return { rows: [] }; },
  };
}

test("call gate covers every permission state and role without database access", async () => {
  for (const role of roles) for (const permission of permissions) {
    const actor = { id: `${role.toLowerCase()}-1`, role, active: true, offboarded: false };
    const db = fixtureDb(actor, permission); const res = response();
    await route(request({ note: "fixture call" }), res, db);
    const allowed = role !== "Viewer" && permission === "Yes";
    assert.equal(res.status, allowed ? 201 : 403, `${role}/${permission || "blank"}`);
    if (!allowed) assert.equal(JSON.parse(res.body).error, role === "Viewer" ? "You do not have permission to log calls." : "Permission to Call is required before logging a call.");
    assert.equal(db.sql.some((sql) => sql.includes("INSERT INTO lead_calls")), allowed);
  }
});

test("call gate is enforced by the direct endpoint path, independently of UI state", async () => {
  const db = fixtureDb({ id: "admin-1", role: "Admin" }, "Pending"); const res = response();
  await route(request({ note: "bypass fixture" }), res, db);
  assert.equal(res.status, 403);
  assert.equal(JSON.parse(res.body).error, "Permission to Call is required before logging a call.");
  assert.equal(db.sql.some((sql) => sql.includes("INSERT INTO lead_calls")), false);
});

test("Log call UI is disabled when the server gate cannot allow it", () => {
  const source = fs.readFileSync("src/screens/leads/page.tsx", "utf8");
  const logic = fs.readFileSync("src/screens/leads/function.tsx", "utf8");
  assert.match(source, /disabled={!screen\.canLogCall}/);
  assert.match(source, /screen\.callDisabledReason/);
  assert.match(logic, /detail\?\.lead\.permission === "Yes"/);
  assert.match(logic, /Permission to Call is required\./);
});
