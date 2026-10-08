const test = require("node:test");
const assert = require("node:assert/strict");
const { leadsList, leadDetail, leadView, route } = require("../server/index.cjs");

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
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].params, ["%fixture%", "lead"]);
  assert.match(calls[1].sql, /LIMIT \$3 OFFSET \$4/);
  assert.deepEqual(calls[1].params.slice(-2), [100, 0]);
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
  assert.deepEqual(Object.keys(body).sort(), ["calls", "followups", "history", "lead", "messages"]);
});
