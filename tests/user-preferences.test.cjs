const test = require("node:test");
const assert = require("node:assert/strict");
const { Readable } = require("stream");
const { route, validateUserPreferenceValue } = require("../server/index.cjs");

function response() { return { status: 0, headers: {}, body: "", setHeader() {}, writeHead(status, headers) { this.status = status; this.headers = headers; }, end(body) { this.body = String(body || ""); } }; }
function request(method, url, body) { const req = Readable.from([Buffer.from(JSON.stringify(body || {}))]); req.method = method; req.url = url; req.headers = { "x-altus": "1" }; req.socket = { remoteAddress: "127.0.0.1", encrypted: false }; return req; }

test("user preference values require ordered unique string keys and cap the length", () => {
  assert.deepEqual(validateUserPreferenceValue(["leadNo", "name"]).value, ["leadNo", "name"]);
  assert.match(validateUserPreferenceValue(["name", "name"]).error, /duplicate/);
  assert.match(validateUserPreferenceValue(["name", 4]).error, /string/);
  assert.match(validateUserPreferenceValue(Array.from({ length: 101 }, (_, index) => `key${index}`)).error, /100/);
});

test("user preference endpoint scopes save, read and delete to the session user", async () => {
  const rows = new Map();
  let sessionUser = "user-a";
  const db = {
    sessionUser: async () => sessionUser,
    userById: async (id) => ({ id, role: "Sales", active: true, offboarded: false }),
    query: async (sql, params = []) => {
      if (sql.includes("capability FROM user_capability_overrides")) return { rows: [] };
      const [userId, key, value] = params;
      const storageKey = `${userId}:${key}`;
      if (sql.startsWith("SELECT value")) return { rows: rows.has(storageKey) ? [{ value: rows.get(storageKey) }] : [] };
      if (sql.startsWith("INSERT INTO user_preferences")) { rows.set(storageKey, JSON.parse(value)); return { rows: [] }; }
      if (sql.startsWith("DELETE FROM user_preferences")) { rows.delete(storageKey); return { rows: [] }; }
      return { rows: [] };
    },
  };
  const saved = response();
  await route(request("POST", "/api/user-preferences/leads.columns.v1", { value: ["leadNo", "name", "company"] }), saved, db);
  assert.equal(saved.status, 200);
  assert.deepEqual(rows.get("user-a:leads.columns.v1"), ["leadNo", "name", "company"]);

  sessionUser = "user-b";
  const otherRead = response();
  await route(request("GET", "/api/user-preferences/leads.columns.v1"), otherRead, db);
  assert.deepEqual(JSON.parse(otherRead.body), { value: null });

  sessionUser = "user-a";
  const read = response();
  await route(request("GET", "/api/user-preferences/leads.columns.v1"), read, db);
  assert.deepEqual(JSON.parse(read.body).value, ["leadNo", "name", "company"]);
  const removed = response();
  await route(request("DELETE", "/api/user-preferences/leads.columns.v1"), removed, db);
  assert.equal(removed.status, 200);
  assert.equal(rows.has("user-a:leads.columns.v1"), false);
  assert.equal(rows.has("user-b:leads.columns.v1"), false);
});

test("user preference endpoint rejects invalid values before writing", async () => {
  let writes = 0;
  const db = { sessionUser: async () => "user-a", userById: async (id) => ({ id, role: "Sales", active: true, offboarded: false }), query: async (sql) => { if (sql.includes("capability FROM")) return { rows: [] }; writes += Number(sql.startsWith("INSERT INTO user_preferences")); return { rows: [] }; } };
  for (const value of [["name", "name"], ["bad key"], ["name", 2], Array.from({ length: 101 }, (_, index) => `key${index}`)]) {
    const res = response();
    await route(request("POST", "/api/user-preferences/leads.columns.v1", { value }), res, db);
    assert.equal(res.status, 400);
  }
  assert.equal(writes, 0);
});
