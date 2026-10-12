const test = require("node:test");
const assert = require("node:assert/strict");
const { createConnection, receiveLead } = require("../server/integrations.cjs");

function response() { return { status: 0, headers: {}, body: "", writeHead(status, headers) { this.status = status; this.headers = headers; }, end(body) { this.body = String(body || ""); } }; }
function request(body = {}, headers = {}) { const chunks = [Buffer.from(JSON.stringify(body))]; return { headers, socket: { remoteAddress: "127.0.0.1" }, on(event, callback) { if (event === "data") callback(chunks[0]); if (event === "end") callback(); } }; }

test("integration creation returns a one-time secret without storing it in plaintext", async () => {
  const sql = [];
  const db = { query: async (text, params) => { sql.push({ text, params }); return { rows: [] }; } };
  const res = response();
  await createConnection(request({ name: "Website", provider: "Website form" }), res, db, { id: "admin-1" });
  const body = JSON.parse(res.body);
  assert.equal(res.status, 201);
  assert.ok(body.secret);
  assert.match(body.integration.webhook_url, /\/api\/integrations\/integration-/);
  const insert = sql.find(({ text }) => text.includes("INSERT INTO integration_connections"));
  assert.match(insert.params[3], /^[a-f0-9]{64}$/);
  assert.notEqual(insert.params[3], body.secret);
});

test("integration webhook rejects invalid credentials before reading lead data", async () => {
  let reads = 0;
  const db = { query: async (text) => { if (text.includes("FROM integration_connections")) return { rows: [{ id: "integration-1", enabled: true, secret_hash: "a".repeat(64), field_mapping: {} }] }; throw new Error("unexpected query"); } };
  const req = request({ name: "Blocked" }, { "x-integration-secret": "wrong" });
  req.on = (event, callback) => { if (event === "data") { reads += 1; callback(Buffer.from("{}")); } if (event === "end") callback(); };
  const res = response();
  await receiveLead(req, res, db, "integration-1");
  assert.equal(res.status, 401);
  assert.equal(reads, 0);
});
