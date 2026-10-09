const test = require("node:test");
const assert = require("node:assert/strict");
const { route } = require("../server/index.cjs");

function response() { return { status: 0, headers: {}, body: "", setHeader() {}, writeHead(status, headers) { this.status = status; this.headers = headers; }, end(body) { this.body = String(body || ""); } }; }
function request(method, url, body = {}, headers = { "x-altus": "1" }) {
  const { Readable } = require("stream"); const req = Readable.from([Buffer.from(JSON.stringify(body))]);
  req.method = method; req.url = url; req.headers = headers; req.socket = { remoteAddress: "127.0.0.1", encrypted: false }; return req;
}
function dbFor(actor, query = () => ({ rows: [] })) {
  return {
    sessionUser: async () => actor?.id || null,
    userById: async () => actor,
    query,
    transaction: async (work) => work({ query }),
  };
}
const owner = { id: "owner-1", role: "Owner", email: "owner@example.invalid" };
const sales = { id: "sales-1", role: "Sales", email: "sales@example.invalid" };
const viewer = { id: "viewer-1", role: "Viewer", email: "viewer@example.invalid" };

test("accounts and contacts capabilities follow role policy", async () => {
  const deniedAccount = response(); await route(request("POST", "/api/accounts", { name: "Fixture Account" }), deniedAccount, dbFor(viewer)); assert.equal(deniedAccount.status, 403);
  const deniedExport = response(); await route(request("GET", "/api/accounts/export.csv"), deniedExport, dbFor(sales)); assert.equal(deniedExport.status, 403);
  const allowedCreate = response(); await route(request("POST", "/api/accounts", { name: "Fixture Account" }), allowedCreate, dbFor(sales)); assert.equal(allowedCreate.status, 201);
});

test("account listing returns fixture rows without customer data", async () => {
  const db = dbFor(owner, (sql) => sql.includes("count(*)") ? { rows: [{ total: 1 }] } : { rows: [{ id: "account-1", name: "Fixture Account", status: "active", contact_count: 1, lead_count: 1 }] });
  const res = response(); await route(request("GET", "/api/accounts?search=fixture"), res, db);
  assert.equal(res.status, 200); assert.equal(JSON.parse(res.body).total, 1); assert.match(res.body, /Fixture Account/);
});

test("account and contact delete endpoints archive instead of deleting", async () => {
  const accountSql = [];
  const accountDb = dbFor(owner, (sql) => { accountSql.push(sql); return sql.includes("SELECT id,status FROM accounts") ? { rows: [{ id: "account-1", status: "active" }] } : { rows: [] }; });
  const accountRes = response(); await route(request("DELETE", "/api/accounts/account-1"), accountRes, accountDb); assert.equal(accountRes.status, 200); assert.ok(accountSql.some((sql) => sql.includes("UPDATE accounts") && sql.includes("archived"))); assert.ok(!accountSql.some((sql) => sql.includes("DELETE FROM accounts")));
  const contactSql = [];
  const contactDb = dbFor(owner, (sql) => { contactSql.push(sql); return sql.includes("SELECT id,status FROM contacts") ? { rows: [{ id: "contact-1", status: "active" }] } : { rows: [] }; });
  const contactRes = response(); await route(request("DELETE", "/api/contacts/contact-1"), contactRes, contactDb); assert.equal(contactRes.status, 200);
  assert.ok(contactSql.some((sql) => sql.includes("UPDATE contacts") && sql.includes("archived"))); assert.ok(!contactSql.some((sql) => sql.includes("DELETE FROM contacts")));
});

test("lead conversion requires account/contact create access and writes the simplified links", async () => {
  const sql = [];
  const db = dbFor(sales, (query) => { sql.push(query); if (query.includes("SELECT id,source_id,name")) return { rows: [{ id: "lead-1", source_id: "source-lead-1", name: "Fixture Lead", company: "Fixture Account", email: "fixture@example.invalid", phone: "100", designation: "Contact" }] }; return { rows: [] }; });
  const res = response(); await route(request("POST", "/api/leads/lead-1/convert-account", {}), res, db);
  assert.equal(res.status, 201); assert.ok(sql.some((query) => query.includes("INSERT INTO contact_leads"))); assert.ok(!sql.some((query) => query.includes("account_leads") || query.includes("account_contacts")));
});
