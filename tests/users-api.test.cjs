const test = require("node:test");
const assert = require("node:assert/strict");
const { route } = require("../server/index.cjs");

function response() { return { status: 0, headers: {}, body: "", setHeader() {}, writeHead(status, headers) { this.status = status; this.headers = headers; }, end(body) { this.body = String(body || ""); } }; }
function request(method, url, body, headers = { "x-altus": "1" }) {
  const { Readable } = require("stream"); const req = Readable.from([Buffer.from(JSON.stringify(body || {}))]);
  req.method = method; req.url = url; req.headers = headers; req.socket = { remoteAddress: "127.0.0.1", encrypted: false }; return req;
}
function dbFor(actor, overrides = {}) {
  return {
    sessionUser: async () => actor && actor.id,
    userById: async (id) => actor && id === actor.id ? actor : overrides.target || null,
    userByEmail: async () => overrides.existing || null,
    throttleBlocked: async () => null,
    throttleClear: async () => {},
    query: async () => ({ rows: [] }),
  };
}
const admin = { id: "admin-1", name: "Admin", email: "admin@example.invalid", role: "Admin", active: true, offboarded: false };
const owner = { id: "owner-1", name: "Owner", email: "owner@example.invalid", role: "Owner", active: true, offboarded: false };

test("users endpoints cover 401, 403, 409 and 201 without credential fields", async () => {
  const unauthenticated = response(); await route(request("GET", "/api/users"), unauthenticated, { sessionUser: async () => null, userById: async () => null }); assert.equal(unauthenticated.status, 401);
  const forbidden = response(); await route(request("GET", "/api/users"), forbidden, dbFor({ ...admin, role: "Sales" })); assert.equal(forbidden.status, 403);
  const duplicate = response(); await route(request("POST", "/api/users", { name: "Member", email: "member@example.invalid", role: "Sales", temporary_password: "long-enough-password" }), duplicate, dbFor(admin, { existing: { id: "existing" } })); assert.equal(duplicate.status, 409); assert.equal(JSON.parse(duplicate.body).error, "User already exists.");
  const created = response(); await route(request("POST", "/api/users", { name: "Member", email: "member@example.invalid", role: "Admin", temporary_password: "long-enough-password" }), created, dbFor(owner)); assert.equal(created.status, 201); assert.doesNotMatch(created.body, /hash|salt|password/i);
  const customId = response(); await route(request("POST", "/api/users", { user_id: "001", name: "Numbered Member", email: "numbered@example.invalid", department: "Sales", role: "Sales", temporary_password: "long-enough-password" }), customId, dbFor(admin)); assert.equal(customId.status, 201); assert.match(customId.body, /001/);
  const invalidId = response(); await route(request("POST", "/api/users", { user_id: "bad id", name: "Invalid", email: "invalid@example.invalid", role: "Sales", temporary_password: "long-enough-password" }), invalidId, dbFor(admin)); assert.equal(invalidId.status, 400);
});

test("Admin cannot create Admin or Owner", async () => {
  for (const role of ["Admin", "Owner"]) {
    const res = response(); await route(request("POST", "/api/users", { name: "Member", email: "member@example.invalid", role, temporary_password: "long-enough-password" }), res, dbFor(admin)); assert.equal(res.status, 403, role);
  }
});

test("Admin can create and list departments", async () => {
  const sql = [];
  const db = dbFor(admin);
  db.query = async (text, params) => {
    sql.push({ text, params });
    if (text.startsWith("SELECT id,name FROM departments")) return { rows: [{ id: "department-it", name: "IT" }] };
    return { rows: [] };
  };
  const created = response();
  await route(request("POST", "/api/departments", { name: "IT" }), created, db);
  assert.equal(created.status, 201);
  assert.equal(JSON.parse(created.body).name, "IT");
  assert.ok(sql.some(({ text }) => text.startsWith("INSERT INTO departments")));
  assert.ok(sql.some(({ text }) => text.includes("audit_log")));

  const listed = response();
  await route(request("GET", "/api/departments", {}), listed, db);
  assert.equal(listed.status, 200);
  assert.deepEqual(JSON.parse(listed.body).departments, [{ id: "department-it", name: "IT" }]);
});

test("only Owner can reset member passwords", async () => {
  const adminReset = response();
  await route(request("POST", "/api/users/member-1/reset-password", { temporary_password: "long-enough-password" }), adminReset, dbFor(admin, { target: { id: "member-1", role: "Sales" } }));
  assert.equal(adminReset.status, 403);
  const ownerReset = response();
  await route(request("POST", "/api/users/member-1/reset-password", { temporary_password: "long-enough-password" }), ownerReset, dbFor(owner, { target: { id: "member-1", role: "Sales" } }));
  assert.equal(ownerReset.status, 200);
});

test("users list redacts credential fields and deactivation protects Owner and self", async () => {
  const list = response(); const db = dbFor(owner, { target: owner }); db.query = async () => ({ rows: [{ id: "member-1", name: "Member", email: "member@example.invalid", role: "Sales", active: true, hash: "hidden", salt: "hidden" }] }); await route(request("GET", "/api/users"), list, db); assert.equal(list.status, 200); assert.doesNotMatch(list.body, /hash|salt|password/i);
  const ownerBlocked = response(); await route(request("POST", "/api/users/owner-2/deactivate", {}), ownerBlocked, dbFor(admin, { target: { ...owner, id: "owner-2" } })); assert.equal(ownerBlocked.status, 403);
  const selfBlocked = response(); await route(request("POST", "/api/users/admin-1/deactivate", {}), selfBlocked, dbFor(admin, { target: admin })); assert.equal(selfBlocked.status, 403);
});
