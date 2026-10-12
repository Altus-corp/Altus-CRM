const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { Readable } = require("node:stream");
const { route } = require("../server/index.cjs");

const LEAD_ID = "fixture-lead";
const CUSTOMER_MARKER = "fixture-customer-value";

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

function request(method, url, body) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  req.method = method;
  req.url = url;
  req.headers = method === "POST" || method === "PATCH" ? { "x-altus": "1" } : {};
  req.socket = { remoteAddress: "127.0.0.1", encrypted: false };
  return req;
}

function fixtureLead() {
  return {
    id: LEAD_ID,
    name: "Synthetic Lead",
    email: "fixture@example.test",
    phone: "0000000000",
    company: "Synthetic Co",
    lead_type: "DL",
    priority: "P3",
    stage: "lead",
    permission: "Yes",
    lead_status: "New",
    owner_user_id: "sales-1",
    custom_values: {},
    legacy_finance: {},
  };
}

function fixtureDb({ role = "Owner", session = true, lead = fixtureLead() } = {}) {
  const sql = [];
  const auditParams = [];
  const actor = { id: "owner-1", role, active: true, offboarded: false };
  return {
    sql,
    auditParams,
    sessionUser: async () => session ? actor.id : null,
    userById: async () => session ? actor : null,
    query: async (text, params = []) => {
      sql.push(text);
      if (text.includes("INSERT INTO audit_log")) auditParams.push(params);
      if (text.includes("FROM dropdown_definitions d JOIN dropdown_options")) return { rows: [{ id: "stage-option" }] };
      if (text.startsWith("SELECT id,permission FROM leads")) return { rows: [{ id: LEAD_ID, permission: "Yes" }] };
      if (text.includes("FROM leads WHERE (($1::text IS NOT NULL")) return { rows: [] };
      if (text.startsWith("SELECT id FROM leads")) return { rows: [{ id: LEAD_ID }] };
      if (text.startsWith("SELECT * FROM leads WHERE id=$1")) return { rows: [lead] };
      if (text.startsWith("SELECT * FROM leads WHERE id = $1")) return { rows: [lead] };
      if (text.startsWith("SELECT id,due_at FROM lead_followups")) return { rows: [{ id: "fixture-followup", due_at: "2030-01-01T10:00:00Z" }] };
      if (text.startsWith("SELECT * FROM lead_calls")) return { rows: [] };
      if (text.startsWith("SELECT * FROM lead_followups")) return { rows: [] };
      if (text.startsWith("SELECT * FROM lead_history")) return { rows: [] };
      if (text.startsWith("SELECT * FROM lead_messages")) return { rows: [] };
      if (text.startsWith("SELECT * FROM lead_products")) return { rows: [] };
      if (text.startsWith("UPDATE lead_followups") && text.includes("RETURNING id")) return { rows: [{ id: "fixture-followup" }] };
      return { rows: [] };
    },
  };
}

async function callRoute(db, method, url, body) {
  const res = response();
  await route(request(method, url, body), res, db);
  return { res, body: res.body ? JSON.parse(res.body) : null };
}

const WIRED_ACTIONS = [
  { name: "add note", method: "POST", path: `/api/leads/${LEAD_ID}/notes`, capabilityRole: "Viewer", valid: { body: CUSTOMER_MARKER }, invalid: { body: "" }, table: "lead_notes" },
  { name: "add call", method: "POST", path: `/api/leads/${LEAD_ID}/calls`, capabilityRole: "Viewer", valid: { duration_seconds: 30, note: CUSTOMER_MARKER, resolution: "Connected" }, invalid: { duration_seconds: -1 }, table: "lead_calls" },
  { name: "create follow-up", method: "POST", path: `/api/leads/${LEAD_ID}/followups`, capabilityRole: "Viewer", valid: { due_at: "2030-01-01T10:00:00Z", note: CUSTOMER_MARKER }, invalid: { due_at: "not-a-date" }, table: "lead_followups" },
  { name: "reschedule follow-up", method: "POST", path: `/api/leads/${LEAD_ID}/followups/fixture-followup/reschedule`, capabilityRole: "Viewer", valid: { due_at: "2030-01-02T10:00:00Z" }, invalid: { due_at: "not-a-date" }, table: "lead_followup_events" },
  { name: "complete follow-up", method: "POST", path: `/api/leads/${LEAD_ID}/followups/fixture-followup/complete`, capabilityRole: "Viewer", valid: {}, invalid: null, table: "lead_followups" },
  { name: "edit lead", method: "PATCH", path: `/api/leads/${LEAD_ID}`, capabilityRole: "Viewer", valid: { name: CUSTOMER_MARKER, lead_type: "DL" }, invalid: { name: "", lead_type: "DL" }, table: "UPDATE leads" },
];

test("wired drawer writes reject unauthenticated and unauthorized requests", async () => {
  for (const action of WIRED_ACTIONS) {
    const unauthenticated = await callRoute(fixtureDb({ session: false }), action.method, action.path, action.valid);
    assert.equal(unauthenticated.res.status, 401, action.name);
    const unauthorized = await callRoute(fixtureDb({ role: action.capabilityRole }), action.method, action.path, action.valid);
    assert.equal(unauthorized.res.status, 403, action.name);
  }
});

test("wired drawer writes reject invalid fixture data and succeed against expected tables", async () => {
  for (const action of WIRED_ACTIONS) {
    if (action.invalid) {
      const invalidDb = fixtureDb();
      const invalid = await callRoute(invalidDb, action.method, action.path, action.invalid);
      assert.equal(invalid.res.status, 400, action.name);
      assert.equal(invalidDb.sql.some((text) => text.includes(`INSERT INTO ${action.table}`) || text.includes(action.table)), false, action.name);
    }
    const db = fixtureDb();
    const result = await callRoute(db, action.method, action.path, action.valid);
    assert.ok([200, 201].includes(result.res.status), `${action.name}: ${result.res.status} ${result.res.body}`);
    assert.equal(db.sql.some((text) => text.includes(action.table)), true, action.name);
    assert.equal(db.sql.some((text) => text.includes("INSERT INTO audit_log")), true, action.name);
    for (const params of db.auditParams) assert.equal(params.some((value) => String(value || "").includes(CUSTOMER_MARKER)), false, action.name);
  }
});

test("load detail is session and capability protected and reads drawer tables", async () => {
  const path = `/api/leads/${LEAD_ID}`;
  assert.equal((await callRoute(fixtureDb({ session: false }), "GET", path)).res.status, 401);
  assert.equal((await callRoute(fixtureDb({ role: "Unknown" }), "GET", path)).res.status, 403);
  const db = fixtureDb();
  const loaded = await callRoute(db, "GET", path);
  assert.equal(loaded.res.status, 200);
  assert.equal(loaded.body.lead.id, LEAD_ID);
  for (const table of ["lead_calls", "lead_followups", "lead_history", "lead_messages", "lead_products"]) {
    assert.equal(db.sql.some((text) => text.includes(table)), true, table);
  }
});

test("primary timeline renders persisted assignment history instead of a hard-coded assignment", () => {
  const source = fs.readFileSync("src/screens/leads/page.tsx", "utf8");
  const knownDemoStrings = [
    "Follow-up scheduled",
    "Latest activity",
    "WhatsApp message sent",
    "Call activity marked",
    "Aarav Mehta",
    "Nikhil Shah",
    "Productivity Shastra",
    "Score 42",
  ];
  for (const value of knownDemoStrings) assert.match(source, new RegExp(value.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")), value);
  assert.doesNotMatch(source, /Lead round-robined to \{ownerName\}/);
  assert.match(source, /assignmentHistory\.map/);
});

