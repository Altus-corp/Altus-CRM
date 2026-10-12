const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const { route, login } = require("../server/index.cjs");

function response() { return { status: 0, headers: {}, body: "", setHeader() {}, writeHead(status, headers) { this.status = status; this.headers = headers; }, end(body) { this.body = String(body || ""); } }; }
function request(method, url, body = {}, headers = { "x-altus": "1" }) { const { Readable } = require("stream"); const req = Readable.from([Buffer.from(JSON.stringify(body))]); req.method = method; req.url = url; req.headers = headers; req.socket = { remoteAddress: "127.0.0.1", encrypted: false }; return req; }
function dbFor(actor, target = actor) { const sql = []; return { sql, sessionUser: async () => actor?.id, userById: async (id) => id === actor?.id ? actor : target, userByEmail: async () => null, throttleBlocked: async () => null, throttleClear: async () => {}, dropSession: async () => {}, query: async (text) => { sql.push(text); return { rows: [] }; } }; }
const owner = { id: "owner-1", name: "Owner", email: "owner@example.invalid", role: "Owner", active: true, offboarded: false, must_change_password: true };
const admin = { id: "admin-1", name: "Admin", email: "admin@example.invalid", role: "Admin", active: true, offboarded: false, must_change_password: false };
const member = { id: "sales-1", name: "Sales", email: "sales@example.invalid", role: "Sales", active: true, offboarded: false, must_change_password: false };

test("forced password change clears the flag and writes an audit row", async () => {
  const db = dbFor(owner); const res = response();
  await route(request("POST", "/api/change-password", { new_password: "long-enough-password", confirm_password: "long-enough-password" }), res, db);
  assert.equal(res.status, 200); assert.ok(db.sql.some((sql) => sql.includes("must_change_password = false"))); assert.ok(db.sql.some((sql) => sql.includes("audit_log")));
});

test("duplicate insert race returns 409", async () => {
  const db = dbFor(admin); db.transaction = async (work) => { const tx = { query: async () => { const error = new Error("duplicate"); error.code = "23505"; throw error; } }; return work(tx); };
  const res = response(); await route(request("POST", "/api/users", { name: "Member", email: "new@example.invalid", role: "Sales", temporary_password: "long-enough-password" }), res, db); assert.equal(res.status, 409);
});

test("offboard protects Owner and self and removes sessions", async () => {
  const ownerRes = response(); await route(request("POST", "/api/employees/owner-2/offboard", {}), ownerRes, dbFor(admin, { ...owner, id: "owner-2" })); assert.equal(ownerRes.status, 403);
  const selfRes = response(); await route(request("POST", "/api/employees/admin-1/offboard", {}), selfRes, dbFor(admin)); assert.equal(selfRes.status, 403);
  const db = dbFor(admin, member); const res = response(); await route(request("POST", "/api/employees/sales-1/offboard", {}), res, db); assert.equal(res.status, 200); assert.ok(db.sql.some((sql) => sql.includes("DELETE FROM sessions"))); assert.ok(db.sql.some((sql) => sql.includes("UPDATE leads SET owner_user_id"))); assert.ok(db.sql.some((sql) => sql.includes("audit_log")));
});

test("inactive and offboarded sessions are rejected by the session lookup", () => {
  const source = fs.readFileSync("server/db.cjs", "utf8");
  assert.match(source, /JOIN users u ON u\.id = s\.user_id/);
  assert.match(source, /!row\.active \|\| row\.offboarded/);
  assert.match(source, /DELETE FROM sessions WHERE token_hash/);
});

test("login success, failed login and logout use the shared audit writer", async () => {
  const failed = dbFor(null); failed.userByEmail = async () => ({ ...member }); failed.checkPassword = async () => false; failed.throttleFail = async () => {}; failed.throttleBlocked = async () => null; const failedRes = response(); await login(request("POST", "/api/login", { email: member.email, password: "wrong" }), failedRes, failed); assert.equal(failedRes.status, 401); assert.ok(failed.sql.some((sql) => sql.includes("audit_log")));
  const success = dbFor(null); success.userByEmail = async () => ({ ...member }); success.checkPassword = async () => true; success.createSession = async () => "session-token"; success.throttleClear = async () => {}; const successRes = response(); await login(request("POST", "/api/login", { email: member.email, password: "correct" }), successRes, success); assert.equal(successRes.status, 200); assert.ok(success.sql.some((sql) => sql.includes("audit_log")));
  const logout = dbFor(member); const logoutRes = response(); await route(request("POST", "/api/logout", {}), logoutRes, logout); assert.equal(logoutRes.status, 200); assert.ok(logout.sql.some((sql) => sql.includes("audit_log")));
});
