const test = require("node:test");
const assert = require("node:assert/strict");
const { Readable } = require("stream");
const { route } = require("../server/index.cjs");
const { assertSelectableOption } = require("../server/dropdowns.cjs");

function response() { return { status: 0, headers: {}, body: "", setHeader(name, value) { this.headers[name] = value; }, writeHead(status, headers) { this.status = status; this.headers = { ...this.headers, ...headers }; }, end(body) { this.body = String(body || ""); } }; }
function request(method, url, body = {}, headers = { "x-altus": "1" }) { const req = Readable.from([Buffer.from(JSON.stringify(body))]); req.method = method; req.url = url; req.headers = headers; req.socket = { remoteAddress: "127.0.0.1", encrypted: false }; return req; }
const owner = { id: "owner-1", name: "Owner", email: "owner@example.invalid", role: "Owner", active: true, offboarded: false };
const admin = { id: "admin-1", name: "Admin", email: "admin@example.invalid", role: "Admin", active: true, offboarded: false };
const sales = { id: "sales-1", name: "Sales", email: "sales@example.invalid", role: "Sales", active: true, offboarded: false };
const viewer = { id: "viewer-1", name: "Viewer", email: "viewer@example.invalid", role: "Viewer", active: true, offboarded: false };

function dbFor(actor, definitions = [], options = []) {
  const sql = [];
  const db = { sql, sessionUser: async () => actor.id, userById: async () => actor, query: async (text, params = []) => {
    sql.push({ text, params });
    if (text.startsWith("INSERT INTO dropdown_options") && options.some((row) => row.dropdown_id === params[1] && row.value === params[3])) throw Object.assign(new Error("duplicate"), { code: "23505" });
    if (text.includes("FROM dropdown_definitions") && text.includes("WHERE id=$1")) return { rows: definitions.filter((row) => row.id === params[0]) };
    if (text.includes("FROM dropdown_definitions")) return { rows: definitions.filter((row) => text.includes("is_active=true") ? row.is_active && row.is_visible : true) };
    if (text.includes("FROM dropdown_options") && text.includes("WHERE id=$1")) return { rows: options.filter((row) => row.id === params[0]) };
    if (text.includes("FROM dropdown_options") && text.includes("ORDER BY sort_order,id")) return { rows: options };
    if (text.includes("FROM dropdown_options")) return { rows: options.filter((row) => text.includes("is_active=true") ? row.is_active : true) };
    if (text.startsWith("SELECT id FROM dropdown_options")) return { rows: options };
    if (text.includes("RETURNING")) return { rows: [{ id: "fixture-id" }] };
    return { rows: [] };
  }, transaction: async (work) => work({ query: async (text, params = []) => { sql.push({ text, params, transaction: true }); if (text.startsWith("SELECT id FROM dropdown_options")) return { rows: options }; return { rows: [] }; } }) };
  return db;
}

const managed = { id: "dd-lead-type", key: "lead_type", label: "Lead type", source_type: "managed", required: true, default_value: "DL", is_visible: true, is_active: true, sort_order: 1 };
const locked = { id: "dd-permission", key: "permission", label: "Permission", source_type: "system_locked", required: true, default_value: "Pending", is_visible: true, is_active: true, sort_order: 2 };
const roleDropdown = { id: "dd-role", key: "role", label: "Role", source_type: "system_locked", required: true, default_value: "Sales", is_visible: true, is_active: true, sort_order: 3 };
const apiBacked = { id: "dd-assignee", key: "assignee", label: "Assignee", source_type: "api_backed", required: false, default_value: null, is_visible: true, is_active: true, sort_order: 4 };
const options = [{ id: "o-1", dropdown_id: managed.id, label: "DL", value: "DL", semantic_key: null, sort_order: 10, is_active: true }, { id: "o-2", dropdown_id: managed.id, label: "L", value: "L", semantic_key: null, sort_order: 20, is_active: true }];

test("non-admin reads only visible definitions and active options", async () => {
  const hidden = { ...managed, is_visible: false };
  const inactive = { ...options[1], is_active: false };
  const db = dbFor(sales, [managed, hidden], [options[0], inactive]);
  const res = response(); await route(request("GET", "/api/dropdowns"), res, db);
  assert.equal(res.status, 200); assert.deepEqual(JSON.parse(res.body).dropdowns, [{ ...managed, options: [{ ...options[0] }] }]);
});

test("Admin and Owner can create options, other roles cannot", async () => {
  for (const actor of [admin, owner]) { const db = dbFor(actor, [managed]); const res = response(); await route(request("POST", `/api/dropdowns/${managed.id}/options`, { label: "QDL", value: "QDL" }), res, db); assert.equal(res.status, 201); assert.ok(db.sql.some((entry) => String(entry.text).includes("INSERT INTO dropdown_options"))); assert.ok(db.sql.some((entry) => String(entry.text).includes("audit_log"))); }
  for (const actor of [sales, viewer]) { const forbidden = response(); await route(request("POST", `/api/dropdowns/${managed.id}/options`, { label: "QDL", value: "QDL" }), forbidden, dbFor(actor, [managed])); assert.equal(forbidden.status, 403); }
});

test("dropdown writes retain the global x-altus protection", async () => {
  const res = response(); await route(request("POST", "/api/dropdowns", { key: "new_key", label: "New key" }, {}), res, dbFor(admin)); assert.equal(res.status, 403);
});

test("system_locked dropdown rejects option writes", async () => {
  for (const [definition, option] of [[locked, { ...options[0], dropdown_id: locked.id }], [roleDropdown, { ...options[0], dropdown_id: roleDropdown.id }]]) {
    for (const [path, body] of [
      [`/api/dropdowns/${definition.id}/options`, { label: "Maybe", value: "Maybe" }],
      [`/api/dropdowns/${definition.id}/options/${option.id}`, { label: "Changed" }],
      [`/api/dropdowns/${definition.id}/options/${option.id}/deactivate`, {}],
      [`/api/dropdowns/${definition.id}/options/reorder`, { option_ids: [option.id] }],
    ]) { const res = response(); await route(request("POST", path, body), res, dbFor(admin, [definition], [option])); assert.equal(res.status, 403, `${definition.key} ${path}`); }
  }
});

test("api_backed dropdowns reject option add, edit, deactivate, and reorder", async () => {
  const option = { ...options[0], dropdown_id: apiBacked.id };
  for (const [path, body] of [
    [`/api/dropdowns/${apiBacked.id}/options`, { label: "Maybe", value: "Maybe" }],
    [`/api/dropdowns/${apiBacked.id}/options/${option.id}`, { label: "Changed" }],
    [`/api/dropdowns/${apiBacked.id}/options/${option.id}/deactivate`, {}],
    [`/api/dropdowns/${apiBacked.id}/options/reorder`, { option_ids: [option.id] }],
  ]) { const res = response(); await route(request("POST", path, body), res, dbFor(admin, [apiBacked], [option])); assert.equal(res.status, 403, path); }
});

test("duplicate values and value changes are rejected", async () => {
  const duplicate = response(); await route(request("POST", `/api/dropdowns/${managed.id}/options`, { label: "DL again", value: "DL" }), duplicate, dbFor(admin, [managed], options)); assert.equal(duplicate.status, 409);
  const changed = response(); await route(request("POST", `/api/dropdowns/${managed.id}/options/${options[0].id}`, { label: "Changed", value: "OTHER" }), changed, dbFor(admin, [managed], options)); assert.equal(changed.status, 400);
});

test("reorder validates the complete set and writes in one transaction", async () => {
  const db = dbFor(admin, [managed], options); const res = response(); await route(request("POST", `/api/dropdowns/${managed.id}/options/reorder`, { option_ids: ["o-2", "o-1"] }), res, db); assert.equal(res.status, 200); assert.equal(db.sql.filter((entry) => entry.transaction).length >= 3, true);
  const invalid = response(); await route(request("POST", `/api/dropdowns/${managed.id}/options/reorder`, { option_ids: ["o-1", "o-1"] }), invalid, db); assert.equal(invalid.status, 400);
});

test("new selections require active options while stored inactive values remain representable", async () => {
  const db = { query: async (text, params) => ({ rows: params[1] === "DL" ? [{ id: "o-1", value: "DL", label: "DL", semantic_key: null }] : [] }) };
  assert.equal((await assertSelectableOption(db, "lead_type", "DL")).value, "DL");
  await assert.rejects(() => assertSelectableOption(db, "lead_type", "OLD"), /inactive or unavailable/);
});
