const test = require("node:test");
const assert = require("node:assert/strict");
const { Readable } = require("stream");
const { leadsList, quickFilterCreate, quickFiltersList, quickFilterUpdate, quickFilterDelete } = require("../server/index.cjs");

function response() { return { status: 0, headers: {}, body: "", setHeader() {}, writeHead(status, headers) { this.status = status; this.headers = headers; }, end(body) { this.body = String(body || ""); } }; }
function request(method, url, body = {}) { const req = Readable.from([Buffer.from(JSON.stringify(body))]); req.method = method; req.url = url; req.headers = { "x-altus": "1" }; req.socket = { remoteAddress: "127.0.0.1", encrypted: false }; return req; }
const actor = { id: "owner-1", role: "Owner" };

test("quick filter CRUD persists only the current owner's validated shape", async () => {
  const calls = [];
  const created = { id: "quick-1", name: "Qualified India", view_key: "", filters: {}, conditions: [{ field: "city", operator: "equals", value: "Pune" }], join_operator: "AND" };
  const db = { query: async (sql, params) => { calls.push({ sql, params }); if (sql.startsWith("INSERT")) return { rows: [created] }; if (sql.startsWith("SELECT id,name")) return { rows: [created] }; if (sql.startsWith("UPDATE")) return { rows: [{ ...created, name: "Qualified Pune" }] }; if (sql.startsWith("DELETE")) return { rows: [{ id: "quick-1" }] }; return { rows: [] }; } };
  const create = response(); await quickFilterCreate(request("POST", "/api/lead-quick-filters", { name: "Qualified India", conditions: created.conditions, join: "AND", filters: {} }), create, db, actor);
  assert.equal(create.status, 201); assert.equal(JSON.parse(create.body).item.name, "Qualified India");
  const list = response(); await quickFiltersList(list, db, actor); assert.equal(list.status, 200); assert.equal(JSON.parse(list.body).items[0].id, "quick-1"); assert.deepEqual(calls[1].params, [actor.id]);
  const update = response(); await quickFilterUpdate(request("PATCH", "/api/lead-quick-filters/quick-1", { name: "Qualified Pune", conditions: [{ field: "city", operator: "equals", value: "Pune" }] }), update, db, actor); assert.equal(update.status, 200); assert.equal(JSON.parse(update.body).item.name, "Qualified Pune");
  const remove = response(); await quickFilterDelete(remove, db, actor, "quick-1"); assert.equal(remove.status, 200); assert.deepEqual(JSON.parse(remove.body), { id: "quick-1" });
  assert.match(calls[0].sql, /owner_user_id/); assert.ok(calls.every(({ params }) => !params?.includes("DROP TABLE")));
});

test("quick filter validation rejects unsafe or incomplete conditions", async () => {
  const db = { query: async () => { throw new Error("query should not run"); } };
  for (const body of [{ name: "Missing value", conditions: [{ field: "name", operator: "contains", value: "" }] }, { name: "Unsafe", conditions: [{ field: "name; DROP TABLE leads", operator: "equals", value: "x" }] }, { name: "Bad comparison", conditions: [{ field: "name", operator: "gt", value: "x" }] }]) {
    const res = response(); await quickFilterCreate(request("POST", "/api/lead-quick-filters", body), res, db, actor); assert.equal(res.status, 400);
  }
});

test("advanced lead filtering remains parameterized and preserves pagination totals", async () => {
  const calls = [];
  const url = new URL("http://localhost/api/leads?advanced=%7B%22conditions%22%3A%5B%7B%22field%22%3A%22city%22%2C%22operator%22%3A%22equals%22%2C%22value%22%3A%22Pune%22%7D%2C%7B%22field%22%3A%22stage%22%2C%22operator%22%3A%22equals%22%2C%22value%22%3A%22lead%22%7D%5D%2C%22join%22%3A%22AND%22%7D&page=2&page_size=2");
  const db = { query: async (sql, params) => { calls.push({ sql, params }); return sql.startsWith("SELECT count") ? { rows: [{ total: 5 }] } : { rows: [{ id: "lead-3" }] }; } };
  const res = response(); await leadsList(request("GET", url.pathname + url.search), res, db, url); const body = JSON.parse(res.body);
  assert.equal(res.status, 200); assert.equal(body.total, 5); assert.equal(body.page, 2); assert.equal(body.page_size, 2); assert.deepEqual(calls[0].params, ["Pune", "lead"]); assert.match(calls[0].sql, /l\.city = \$1/); assert.match(calls[0].sql, /l\.stage = \$2/); assert.match(calls[1].sql, /LIMIT \$3 OFFSET \$4/); assert.deepEqual(calls[1].params.slice(-2), [2, 2]);
});
