const test = require("node:test");
const assert = require("node:assert/strict");
const { Readable } = require("node:stream");
const { route, activityList, addLeadNote, addLeadCall, addLeadFollowup, rescheduleLeadFollowup } = require("../server/index.cjs");

function response() { return { status: 0, headers: {}, body: "", setHeader(name, value) { this.headers[name] = value; }, writeHead(status, headers) { this.status = status; Object.assign(this.headers, headers); }, end(body) { this.body = String(body || ""); } }; }
function request(method, url, body) { const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]); req.method = method; req.url = url; req.headers = body === undefined ? {} : { "x-altus": "1" }; req.socket = { remoteAddress: "127.0.0.1", encrypted: false }; return req; }

test("activity lists use bounded pagination for every section", async () => {
  for (const kind of ["history", "calls", "followups", "messages", "notes"]) {
    const res = response(); const db = { query: async (sql) => sql.includes("count") ? { rows: [{ total: 2 }] } : { rows: [{ id: `fixture-${kind}` }] } };
    await activityList(res, db, "fixture-lead", kind, new URL(`http://localhost/api/leads/fixture-lead/activity/${kind}?page=2&page_size=999`));
    const body = JSON.parse(res.body); assert.equal(res.status, 200); assert.equal(body.page_size, 50); assert.equal(body.items.length, 1); assert.equal(body.total, 2);
  }
});

test("Viewer cannot add activity", async () => {
  const res = response(); const db = { sessionUser: async () => "viewer-1", userById: async () => ({ id: "viewer-1", role: "Viewer" }) };
  await route(request("POST", "/api/leads/fixture-lead/notes", { body: "fixture" }), res, db);
  assert.equal(res.status, 403);
});

test("activity add endpoints validate and write fixture rows", async () => {
  const queries = []; const db = { query: async (sql, params) => { queries.push({ sql, params }); if (sql.startsWith("SELECT id FROM leads") || sql.startsWith("SELECT id,permission FROM leads")) return { rows: [{ id: "fixture-lead", permission: "Yes" }] }; return { rows: [] }; } };
  const actor = { id: "user-1" };
  let res = response(); await addLeadNote(request("POST", "/", { body: "fixture note" }), res, db, actor, "fixture-lead"); assert.equal(res.status, 201);
  res = response(); await addLeadCall(request("POST", "/", { duration_seconds: -1 }), res, db, actor, "fixture-lead"); assert.equal(res.status, 400);
  res = response(); await addLeadCall(request("POST", "/", { duration_seconds: 30, note: "fixture call" }), res, db, actor, "fixture-lead"); assert.equal(res.status, 201);
  res = response(); await addLeadFollowup(request("POST", "/", { due_at: "not-a-date" }), res, db, actor, "fixture-lead"); assert.equal(res.status, 400);
  res = response(); await addLeadFollowup(request("POST", "/", { due_at: "2030-01-01T10:00:00Z" }), res, db, actor, "fixture-lead"); assert.equal(res.status, 201);
  assert.ok(queries.some((item) => item.sql.includes("lead_notes"))); assert.ok(queries.some((item) => item.sql.includes("duration_seconds"))); assert.ok(queries.some((item) => item.sql.includes("created_by")));
  const followupColumnUpdate = queries.find((item) => item.sql.startsWith("UPDATE leads SET next_follow_up_at"));
  assert.deepEqual(followupColumnUpdate?.params, ["fixture-lead", null]);
});

test("follow-up creation stores the next due timestamp on the matching lead", async () => {
  const dueByLead = new Map([["lead-a", "2030-01-01T10:00:00.000Z"], ["lead-b", "2030-01-02T11:30:00.000Z"]]);
  const updates = [];
  const db = { query: async (sql, params = []) => {
    if (sql.startsWith("SELECT id FROM leads")) return { rows: [{ id: params[0] }] };
    if (sql.startsWith("SELECT due_at FROM lead_followups")) return { rows: [{ due_at: dueByLead.get(params[0]) }] };
    if (sql.startsWith("UPDATE leads SET next_follow_up_at")) updates.push(params);
    return { rows: [] };
  } };
  const actor = { id: "user-1" };
  for (const [leadId, dueAt] of dueByLead) {
    const res = response();
    await addLeadFollowup(request("POST", "/", { due_at: dueAt, note: "Synthetic follow-up" }), res, db, actor, leadId);
    assert.equal(res.status, 201);
  }
  assert.deepEqual(updates, [["lead-a", "2030-01-01T10:00:00.000Z"], ["lead-b", "2030-01-02T11:30:00.000Z"]]);
});

test("reschedule writes an immutable follow-up event and refreshes the lead's next follow-up", async () => {
  const sql = []; const db = { query: async (text) => { sql.push(text); if (text.startsWith("SELECT id,due_at")) return { rows: [{ id: "followup-1", due_at: "2030-01-01T10:00:00Z" }] }; if (text.startsWith("SELECT due_at FROM lead_followups")) return { rows: [{ due_at: "2030-01-02T10:00:00Z" }] }; return { rows: [] }; } };
  const res = response(); await rescheduleLeadFollowup(request("POST", "/", { due_at: "2030-01-02T10:00:00Z" }), res, db, { id: "user-1" }, "fixture-lead", "followup-1");
  assert.equal(res.status, 200); assert.ok(sql.some((item) => item.includes("lead_followup_events"))); assert.ok(sql.some((item) => item.includes("UPDATE lead_followups"))); assert.ok(sql.some((item) => item.startsWith("UPDATE leads SET next_follow_up_at")));
});
