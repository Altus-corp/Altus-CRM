const test = require("node:test");
const assert = require("node:assert/strict");
const { route } = require("../server/index.cjs");

function response() { return { status: 0, headers: {}, body: "", setHeader() {}, writeHead(status, headers) { this.status = status; this.headers = headers; }, end(body) { this.body = String(body || ""); } }; }
function request(method, url, body = {}) { const { Readable } = require("stream"); const req = Readable.from([Buffer.from(JSON.stringify(body))]); req.method = method; req.url = url; req.headers = { "x-altus": "1" }; req.socket = { remoteAddress: "127.0.0.1", encrypted: false }; return req; }
function dbFor(actor, queryRows = {}) { const sql = []; return { sql, sessionUser: async () => actor.id, userById: async () => actor, throttleBlocked: async () => null, throttleClear: async () => {}, query: async (text) => { sql.push(text); for (const [needle, rows] of Object.entries(queryRows)) if (text.includes(needle)) return { rows }; return { rows: [] }; } }; }
const owner = { id: "owner-1", name: "Owner", email: "owner@example.invalid", role: "Owner", active: true, offboarded: false };
const admin = { id: "admin-1", name: "Admin", email: "admin@example.invalid", role: "Admin", active: true, offboarded: false };
const sales = { id: "sales-1", name: "Sales", email: "sales@example.invalid", role: "Sales", active: true, offboarded: false };

test("lead create enforces strict types, derived priority and permission capability", async () => {
  for (const [lead_type, priority] of [["DL", "P3"], ["L", "P3"], ["QDL", "P3"], ["QL", "P2"], ["R", "P1"]]) {
    const db = dbFor(owner); const res = response(); await route(request("POST", "/api/leads", { name: "Lead", email: `${lead_type}@example.invalid`, lead_type }), res, db); assert.equal(res.status, 201); assert.ok(db.sql.some((sql) => sql.includes("INSERT INTO leads") && sql.includes("lead_type"))); assert.equal(priority, { DL: "P3", L: "P3", QDL: "P3", QL: "P2", R: "P1" }[lead_type]);
  }
  const bad = response(); await route(request("POST", "/api/leads", { name: "Lead", lead_type: "INVALID" }), bad, dbFor(owner)); assert.equal(bad.status, 400);
  const denied = response(); await route(request("POST", "/api/leads", { name: "Lead", lead_type: "DL", permission: "Yes" }), denied, dbFor(sales)); assert.equal(denied.status, 403);
});

test("duplicate phone/email rejects unless explicit merge", async () => {
  const duplicateDb = dbFor(owner, { "SELECT id FROM leads": [{ id: "existing-lead" }] }); const rejected = response(); await route(request("POST", "/api/leads", { name: "Lead", phone: "same", lead_type: "DL" }), rejected, duplicateDb); assert.equal(rejected.status, 409);
  const merged = response(); await route(request("POST", "/api/leads", { name: "Merged", phone: "same", lead_type: "QL", duplicate_action: "merge" }), merged, duplicateDb); assert.equal(merged.status, 200); assert.equal(JSON.parse(merged.body).merged, true); assert.ok(duplicateDb.sql.some((sql) => sql.includes("lead.merged") || sql.includes("audit_log")));
});

test("stage, Permission To Call and products are permission checked and audited", async () => {
  const denied = response(); await route(request("POST", "/api/leads/lead-1/permission", { permission: "Yes" }), denied, dbFor(sales)); assert.equal(denied.status, 403);
  const db = dbFor(admin, { "SELECT permission FROM leads": [{ permission: "Pending" }] }); const permission = response(); await route(request("POST", "/api/leads/lead-1/permission", { permission: "Yes" }), permission, db); assert.equal(permission.status, 200); assert.ok(db.sql.some((sql) => sql.includes("audit_log")));
  const stageDb = dbFor(sales, { "SELECT stage FROM leads": [{ stage: "lead" }] }); const stage = response(); await route(request("POST", "/api/leads/lead-1/stage", { stage: "qualified" }), stage, stageDb); assert.equal(stage.status, 200);
  const products = response(); await route(request("POST", "/api/leads/lead-1/products", { products: [{ product_code: "Keynote", stage: "lead" }, { product_code: "PSO", stage: "registered" }] }), products, stageDb); assert.equal(products.status, 200); assert.ok(stageDb.sql.some((sql) => sql.includes("lead_products")));
});
