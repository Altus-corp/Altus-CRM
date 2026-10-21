const test = require("node:test");
const assert = require("node:assert/strict");
const { LEAD_SORTS, leadsList, leadsCounts, leadDetail, leadView, route } = require("../server/index.cjs");

function response() {
  return {
    status: 0,
    headers: {},
    body: "",
    setHeader(name, value) { this.headers[name] = value; },
    writeHead(status, headers) { this.status = status; Object.assign(this.headers, headers); },
    end(body) { this.body = String(body || ""); },
  };
}

function getRequest(url) {
  return { method: "GET", url, headers: {}, socket: { remoteAddress: "127.0.0.1", encrypted: false } };
}

test("lead views use the planned allowlisted predicates and hide Key Note", () => {
  assert.match(leadView("pre_ps"), /is_pre_ps_done/);
  assert.match(leadView("calling_queue"), /permission/);
  assert.equal(leadView("key_note"), null);
});

test("GET leads is auth protected", async () => {
  const db = { sessionUser: async () => null, userById: async () => null };
  const res = response();
  await route(getRequest("/api/leads"), res, db);
  assert.equal(res.status, 401);
});

test("GET lead counts returns 401, 403, and numeric-only 200 responses", async () => {
  const unauthenticated = response();
  await route(getRequest("/api/leads/counts"), unauthenticated, { sessionUser: async () => null, userById: async () => null });
  assert.equal(unauthenticated.status, 401);

  const forbidden = response();
  await route(getRequest("/api/leads/counts"), forbidden, { sessionUser: async () => "u1", userById: async () => ({ id: "u1", role: "Unknown" }) });
  assert.equal(forbidden.status, 403);

  const allowed = response();
  const db = { sessionUser: async () => "u1", userById: async () => ({ id: "u1", role: "Viewer" }), query: async (sql, params) => { assert.match(sql, /COUNT\(\*\) FILTER/); assert.deepEqual(params, []); return { rows: [{ all: 8, database: 2, permission_granted: 3 }] }; } };
  await route(getRequest("/api/leads/counts"), allowed, db);
  assert.equal(allowed.status, 200);
  const body = JSON.parse(allowed.body);
  assert.equal(body.all, 8);
  assert.equal(body.database, 2);
  assert.equal(body.permission_granted, 3);
  assert.deepEqual(Object.values(body).every((value) => Number.isInteger(value) && value >= 0), true);
});

test("GET leads requires leads.view and permits a Viewer fixture", async () => {
  const forbidden = response();
  await route(getRequest("/api/leads"), forbidden, { sessionUser: async () => "u1", userById: async () => ({ id: "u1", role: "Unknown" }) });
  assert.equal(forbidden.status, 403);
  assert.deepEqual(JSON.parse(forbidden.body), { error: "You do not have permission to access this resource." });

  const allowed = response();
  const db = { sessionUser: async () => "u1", userById: async () => ({ id: "u1", role: "Viewer" }), query: async (sql) => sql.startsWith("SELECT count") ? { rows: [{ total: 0 }] } : { rows: [] } };
  await route(getRequest("/api/leads"), allowed, db);
  assert.equal(allowed.status, 200);
});

test("GET lead detail requires leads.view and permits a Viewer fixture", async () => {
  const forbidden = response();
  await route(getRequest("/api/leads/fixture-lead"), forbidden, { sessionUser: async () => "u1", userById: async () => ({ id: "u1", role: "Unknown" }) });
  assert.equal(forbidden.status, 403);

  const allowed = response();
  const db = { sessionUser: async () => "u1", userById: async () => ({ id: "u1", role: "Viewer" }), query: async (sql) => sql.startsWith("SELECT * FROM leads") ? { rows: [{ id: "fixture-lead" }] } : { rows: [] } };
  await route(getRequest("/api/leads/fixture-lead"), allowed, db);
  assert.equal(allowed.status, 200);
});

test("lead list uses parameterized filters and caps page size at 100", async () => {
  const calls = [];
  const db = { query: async (sql, params) => {
    calls.push({ sql, params });
    return sql.startsWith("SELECT count") ? { rows: [{ total: 1 }] } : { rows: [{ id: "fixture-lead" }] };
  } };
  const res = response();
  await leadsList(getRequest("/api/leads?q=fixture&stage=lead&page_size=999&sort=name&direction=asc"), res, db, new URL("http://localhost/api/leads?q=fixture&stage=lead&page_size=999&sort=name&direction=asc"));
  const body = JSON.parse(res.body);
  assert.equal(res.status, 200);
  assert.equal(body.page_size, 100);
  assert.equal(body.items.length, 1);
  assert.equal(calls.length, 3, "count, resolution-count, and primary list queries");
  assert.deepEqual(calls[0].params, ["%fixture%", "lead"]);
  assert.match(calls[2].sql, /LIMIT \$3 OFFSET \$4/);
  assert.deepEqual(calls[2].params.slice(-2), [100, 0]);
});

test("selected calling-resolution filters keep typed parameters in the resolution-count query", async () => {
  const calls = [];
  const db = { query: async (sql, params) => {
    calls.push({ sql, params });
    return sql.startsWith("SELECT count") ? { rows: [{ total: 1 }] } : { rows: [] };
  } };
  const query = "managed_filters=" + encodeURIComponent(JSON.stringify({ calling_resolution: ["Registered"] }));
  const res = response();
  await leadsList(getRequest(`/api/leads?${query}`), res, db, new URL(`http://localhost/api/leads?${query}`));
  assert.equal(res.status, 200);
  assert.equal(calls.length, 3);
  assert.match(calls[1].sql, /\$1::text IS NOT NULL/);
  assert.deepEqual(calls[1].params, ["Registered"]);
});

test("lead list rejects invalid sort and silently ignored query values", async () => {
  for (const query of [
    "sort=not_a_real_field",
    "direction=sideways",
    "view=not_a_real_view",
    "pso_date_from=not-a-date",
    "next_follow_up=tomorrow",
  ]) {
    const res = response();
    await leadsList(getRequest(`/api/leads?${query}`), res, { query: async () => { throw new Error("query should not run"); } }, new URL(`http://localhost/api/leads?${query}`));
    assert.equal(res.status, 400, query);
    assert.deepEqual(JSON.parse(res.body), { error: "Invalid leads query." });
    assert.doesNotMatch(res.body, /not_a_real_field|sideways|not_a_real_view|not-a-date|tomorrow/);
  }
});

test("lead list accepts every server sort allow-list key and keeps nulls last in both directions", async () => {
  for (const sort of Object.keys(LEAD_SORTS)) for (const direction of ["asc", "desc"]) {
    const calls = [];
    const res = response();
    await leadsList(getRequest(`/api/leads?sort=${sort}&direction=${direction}`), res, { query: async (sql, params) => { calls.push({ sql, params }); return sql.startsWith("SELECT count") ? { rows: [{ total: 0 }] } : { rows: [] }; } }, new URL(`http://localhost/api/leads?sort=${sort}&direction=${direction}`));
    assert.equal(res.status, 200, `${sort} ${direction}`);
    assert.match(calls[2].sql, new RegExp(`ORDER BY .+ ${direction.toUpperCase()} NULLS LAST, l\\.id ASC`));
  }
});

test("guarded JSON sorts turn malformed stored values into null sort keys", () => {
  assert.match(LEAD_SORTS.target_date, /CASE WHEN .+ THEN .+ ELSE NULL END/);
  assert.doesNotMatch(LEAD_SORTS.target_date, /::date/);
  assert.match(LEAD_SORTS.total_payable, /\^\[\+-\]\?\(\?:\[0-9\]/);
  assert.match(LEAD_SORTS.total_payable, /ELSE NULL END/);
  assert.match(LEAD_SORTS.zoom_link_sent, /WHEN 'false' THEN 0[\s\S]*WHEN 'true' THEN 1[\s\S]*ELSE NULL END/);
  for (const malformed of ["2026-02-31", "not-a-number", "perhaps"]) assert.doesNotMatch(malformed, /^(?:true|false|yes|no|0|1)$/i);
});

test("configured lead-field sorting validates the active definition and binds its JSON key", async () => {
  const calls = [];
  const db = { query: async (sql, params) => {
    calls.push({ sql, params });
    if (sql.startsWith("SELECT value FROM workspace_settings")) return { rows: [{ value: [{ key: "score", label: "Score", type: "number", active: true, order: 0 }] }] };
    return sql.startsWith("SELECT count") ? { rows: [{ total: 0 }] } : { rows: [] };
  } };
  const res = response();
  await leadsList(getRequest("/api/leads?sort=configured:score&direction=asc"), res, db, new URL("http://localhost/api/leads?sort=configured:score&direction=asc"));
  assert.equal(res.status, 200);
  assert.match(calls.at(-1).sql, /custom_values->'lead_fields'->>\$1/);
  assert.deepEqual(calls.at(-1).params, ["score", 50, 0]);

  const rejected = response();
  await leadsList(getRequest("/api/leads?sort=configured:not_active&direction=asc"), rejected, db, new URL("http://localhost/api/leads?sort=configured:not_active&direction=asc"));
  assert.equal(rejected.status, 400);
});

test("Key Note returns an unavailable response", async () => {
  const res = response();
  await leadsList(getRequest("/api/leads?view=key_note"), res, { query: async () => ({ rows: [] }) }, new URL("http://localhost/api/leads?view=key_note"));
  assert.equal(res.status, 400);
});

test("lead detail returns the lead and all four read-only child collections", async () => {
  const db = { query: async (sql) => {
    if (sql.startsWith("SELECT * FROM leads")) return { rows: [{ id: "fixture-lead" }] };
    return { rows: [] };
  } };
  const res = response();
  await leadDetail(getRequest("/api/leads/fixture-lead"), res, db, "fixture-lead");
  const body = JSON.parse(res.body);
  assert.equal(res.status, 200);
  assert.equal(body.lead.id, "fixture-lead");
  assert.deepEqual(Object.keys(body).sort(), ["calls", "followups", "history", "lead", "messages", "notes", "products"]);
});

test("lead detail retains all lead columns rather than the list endpoint projection", async () => {
  const db = { query: async (sql) => {
    if (sql.startsWith("SELECT * FROM leads")) return { rows: [{ id: "fixture-lead", address: "Fixture address", custom_values: { lead_fields: { custom_field: "Fixture value" } } }] };
    return { rows: [] };
  } };
  const res = response();
  await leadDetail(getRequest("/api/leads/fixture-lead"), res, db, "fixture-lead");
  const body = JSON.parse(res.body);
  assert.equal(body.lead.address, "Fixture address");
  assert.equal(body.lead.custom_values.lead_fields.custom_field, "Fixture value");
});
