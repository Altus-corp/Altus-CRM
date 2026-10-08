const test = require("node:test");
const assert = require("node:assert/strict");
const { route } = require("../server/index.cjs");

function response() { return { status: 0, headers: {}, body: "", setHeader() {}, writeHead(status, headers) { this.status = status; this.headers = headers; }, end(body) { this.body = String(body || ""); } }; }
function request(method, url, body = {}) { const { Readable } = require("stream"); const req = Readable.from([Buffer.from(JSON.stringify(body))]); req.method = method; req.url = url; req.headers = { "x-altus": "1" }; req.socket = { remoteAddress: "127.0.0.1", encrypted: false }; return req; }
function dbFor(actor, target = actor) { const sql = []; return { sql, sessionUser: async () => actor.id, userById: async (id) => id === actor.id ? actor : target, userByEmail: async () => null, throttleBlocked: async () => null, throttleClear: async () => {}, query: async (text) => { sql.push(text); return { rows: text.includes("workspace_settings WHERE") ? [{ value: 4 }] : [] }; } }; }
const owner = { id: "owner-1", name: "Owner", email: "owner@example.invalid", role: "Owner", active: true, offboarded: false };
const admin = { id: "admin-1", name: "Admin", email: "admin@example.invalid", role: "Admin", active: true, offboarded: false };
const sales = { id: "sales-1", name: "Sales", email: "sales@example.invalid", role: "Sales", active: true, offboarded: false };

test("master create/update/disable persists flags and is role protected", async () => {
  for (const actor of [sales, { ...sales, role: "Viewer" }]) { const forbidden = response(); await route(request("POST", "/api/masters", { master_type: "resolution", label: "No answer", is_no_answer: true }), forbidden, dbFor(actor)); assert.equal(forbidden.status, 403); }
  for (const actor of [admin, owner]) { const db = dbFor(actor); const created = response(); await route(request("POST", "/api/masters", { master_type: "resolution", label: "No answer", is_no_answer: true, is_connected: false }), created, db); assert.equal(created.status, 201); assert.ok(db.sql.some((sql) => sql.includes("is_no_answer"))); }
  const db = dbFor(admin); const created = response(); await route(request("POST", "/api/masters", { master_type: "resolution", label: "No answer", is_no_answer: true, is_connected: false }), created, db); assert.equal(created.status, 201); assert.ok(db.sql.some((sql) => sql.includes("is_no_answer")));
  const updated = response(); await route(request("POST", "/api/masters/master-1", { master_type: "resolution", label: "Disabled", active: false, is_final: true }), updated, db); assert.equal(updated.status, 200); assert.ok(db.sql.filter((sql) => sql.includes("audit_log")).length >= 2);
});

test("target upsert and workspace setting update are audited", async () => {
  const db = dbFor(admin); const target = response(); await route(request("POST", "/api/targets", { user_id: sales.id, total_target: 12, week_override: 20, quarter_override: 18, absent: false }), target, db); assert.equal(target.status, 201); assert.ok(db.sql.some((sql) => sql.includes("INSERT INTO user_targets")));
  const setting = response(); await route(request("POST", "/api/workspace-settings", { setting_key: "back_to_back_no_answer_threshold", value: 5 }), setting, db); assert.equal(setting.status, 200); assert.ok(db.sql.some((sql) => sql.includes("audit_log")));
});

test("employee offboard rolls back all work on failure", async () => {
  const db = dbFor(admin, sales); const operations = []; db.query = async (text) => { operations.push(text); if (text.includes("DELETE FROM credentials")) throw new Error("rollback fixture"); return { rows: [] }; };
  const res = response(); await route(request("POST", "/api/employees/sales-1/offboard", {}), res, db); assert.equal(res.status, 500); assert.ok(operations.includes("BEGIN")); assert.ok(operations.includes("ROLLBACK")); assert.ok(!operations.includes("COMMIT"));
});
