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

test("structured lead edit persists core and form custom fields for the selected lead", async () => {
  const sql = [];
  const lead = { ...fixtureLead(), first_name: "Old", last_name: "Lead", designation: "Old role", custom_values: { lead_fields: { extra_notes: "Old note" } }, legacy_finance: {} };
  const db = {
    sessionUser: async () => "owner-1",
    userById: async () => ({ id: "owner-1", role: "Owner", active: true, offboarded: false }),
    query: async (text, params = []) => {
      sql.push({ text, params });
      if (text.startsWith("SELECT * FROM leads WHERE id=$1")) return { rows: [lead] };
      if (text.includes("FROM dropdown_definitions d JOIN dropdown_options")) return { rows: [{ id: "stage-option" }] };
      if (text.includes("FROM workspace_settings")) return { rows: [{ value: [
        { key: "extra_notes", label: "Extra Notes", type: "text" },
        { key: "calling_remarks", label: "Calling Remarks", type: "textarea" },
        { key: "intro_video_sent", label: "Intro video", type: "boolean" },
        { key: "email_sent", label: "Email sent", type: "boolean" },
        { key: "whatsapp_message_sent", label: "WhatsApp sent", type: "boolean" },
      ] }] };
      if (text.includes("SELECT id FROM leads WHERE (($1::text IS NOT NULL")) return { rows: [] };
      return { rows: [] };
    },
  };
  const result = await callRoute(db, "PATCH", `/api/leads/${LEAD_ID}`, {
    name: "Updated Lead", first_name: "Updated", last_name: "Lead", email: "updated@example.test", phone: "0000000000", company: "Updated Co", designation: "Updated role", team: "Sales", lead_type: "DL", permission: "Yes", lead_status: "New",
    lead_fields: { calling_remarks: "Updated remarks", intro_video_sent: "Yes", email_sent: "No", whatsapp_message_sent: "Yes", extra_notes: "Updated note" },
  });
  assert.equal(result.res.status, 200);
  const update = sql.find((entry) => entry.text.startsWith("UPDATE leads SET"));
  assert.ok(update);
  assert.equal(update.params[0], LEAD_ID);
  assert.equal(update.params[7], "Updated role");
  assert.deepEqual(update.params[16].lead_fields, { extra_notes: "Updated note", calling_remarks: "Updated remarks", intro_video_sent: true, email_sent: false, whatsapp_message_sent: true });
});

test("editing only the phone preserves existing required lead values", async () => {
  const sql = [];
  const db = {
    sessionUser: async () => "owner-1",
    userById: async () => ({ id: "owner-1", role: "Owner", active: true, offboarded: false }),
    query: async (text, params = []) => {
      sql.push({ text, params });
      if (text.startsWith("SELECT * FROM leads WHERE id=$1")) return { rows: [fixtureLead()] };
      if (text.includes("SELECT id FROM leads WHERE (($1::text IS NOT NULL")) return { rows: [] };
      return { rows: [] };
    },
  };
  const result = await callRoute(db, "PATCH", `/api/leads/${LEAD_ID}`, { phone: "9999999999", lead_type: "", stage: "", permission: "", lead_fields: {} });
  assert.equal(result.res.status, 200);
  const update = sql.find((entry) => entry.text.startsWith("UPDATE leads SET"));
  assert.ok(update);
  assert.equal(update.params[1], "Synthetic Lead");
  assert.equal(update.params[5], "9999999999");
  assert.equal(update.params[9], "DL");
  assert.equal(update.params[11], "lead");
  assert.equal(update.params[12], "Yes");
});

test("phone-only edit also repairs legacy rows with empty dropdown fields", async () => {
  const sql = [];
  const db = {
    sessionUser: async () => "owner-1",
    userById: async () => ({ id: "owner-1", role: "Owner", active: true, offboarded: false }),
    query: async (text, params = []) => {
      sql.push({ text, params });
      if (text.startsWith("SELECT * FROM leads WHERE id=$1")) return { rows: [{ ...fixtureLead(), lead_type: null, stage: null, permission: null }] };
      if (text.includes("SELECT id FROM leads WHERE (($1::text IS NOT NULL")) return { rows: [] };
      return { rows: [] };
    },
  };
  const result = await callRoute(db, "PATCH", `/api/leads/${LEAD_ID}`, { phone: "9999999999", lead_type: "", stage: "", permission: "", lead_fields: {} });
  assert.equal(result.res.status, 200);
  assert.equal(sql.some((entry) => entry.text.startsWith("UPDATE leads SET")), true);
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
  assert.match(source, /const SHOW_DEMO_TIMELINE = false/);
  assert.doesNotMatch(source, /Lead round-robined to \{ownerName\}/);
  assert.match(source, /assignmentHistory\.map/);
});

test("lead edit form normalizes object-backed date values before rendering date inputs", () => {
  const source = fs.readFileSync("src/screens/leads/function.tsx", "utf8");
  assert.match(source, /function formScalar\(value: unknown\)/);
  assert.match(source, /FORM_DATE_FIELDS/);
  assert.match(source, /Object\.keys\(EMPTY_LEAD_FORM\)\.map\(\(key\) => \[key, formValue/);
  assert.doesNotMatch(source, /Object\.keys\(EMPTY_LEAD_FORM\)\.map\(\(key\) => \[key, String\(/);
});

