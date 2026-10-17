const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { Readable } = require("node:stream");
const { route } = require("../server/index.cjs");

function response() {
  return { status: 0, body: "", headers: {}, setHeader(name, value) { this.headers[name] = value; }, writeHead(status, headers) { this.status = status; Object.assign(this.headers, headers); }, end(body) { this.body = String(body || ""); } };
}

function request(method, url, body) {
  const req = Readable.from([Buffer.from(JSON.stringify(body || {}))]);
  req.method = method;
  req.url = url;
  req.headers = { "x-altus": "1" };
  req.socket = { remoteAddress: "127.0.0.1", encrypted: false };
  return req;
}

async function callRoute(db, method, url, body) {
  const res = response();
  await route(request(method, url, body), res, db);
  return { res, body: res.body ? JSON.parse(res.body) : null };
}

function noteDb({ active = true } = {}) {
  const sql = [];
  return {
    sql,
    sessionUser: async () => "owner-1",
    userById: async () => ({ id: "owner-1", role: "Owner", active: true, offboarded: false }),
    query: async (text, params = []) => {
      sql.push({ text, params });
      if (text.startsWith("SELECT id FROM leads")) return { rows: [{ id: "lead-1" }] };
      if (text.includes("FROM dropdown_definitions d JOIN dropdown_options o") && text.includes("o.id=$2")) return { rows: active ? [{ id: "type-phone", value: "phone_call", label: "Phone call" }] : [] };
      return { rows: [] };
    },
  };
}

test("logged activity saves the explicit current form payload with an active option id", async () => {
  const db = noteDb();
  const result = await callRoute(db, "POST", "/api/leads/lead-1/notes", { body: "Shown in the form", activity_type_option_id: "type-phone" });
  assert.equal(result.res.status, 201);
  const insert = db.sql.find(({ text }) => text.startsWith("INSERT INTO lead_notes"));
  assert.ok(insert);
  assert.deepEqual(insert.params.slice(1), ["lead-1", "Shown in the form", "owner-1", "type-phone", "Phone call"]);

  const page = fs.readFileSync("src/screens/leads/page.tsx", "utf8");
  assert.match(page, /screen\.addActivity\("note", \{ body: activityDetailsText\.trim\(\), activity_type_option_id: selectedActivityType\.id \}\)/);
  assert.doesNotMatch(page, /body: `\[\$\{activityType\}\]/);
});

test("logged activity rejects an inactive or deleted activity type option", async () => {
  const db = noteDb({ active: false });
  const result = await callRoute(db, "POST", "/api/leads/lead-1/notes", { body: "Cannot save", activity_type_option_id: "retired-type" });
  assert.equal(result.res.status, 400);
  assert.equal(result.body.error, "The selected activity type is inactive or unavailable.");
  assert.equal(db.sql.some(({ text }) => text.startsWith("INSERT INTO lead_notes")), false);
});

test("lead detail resolves names in one batch and preserves a deleted activity type snapshot", async () => {
  let userQueries = 0;
  const db = {
    sessionUser: async () => "owner-1",
    userById: async () => ({ id: "owner-1", role: "Owner", active: true, offboarded: false }),
    query: async (text) => {
      if (text.startsWith("UPDATE leads SET last_opened_at")) return { rows: [] };
      if (text.startsWith("SELECT * FROM leads WHERE id =")) return { rows: [{ id: "lead-1", name: "Lead", owner_user_id: "owner-2", custom_values: {}, legacy_finance: {} }] };
      if (text.startsWith("SELECT * FROM lead_calls")) return { rows: [] };
      if (text.startsWith("SELECT * FROM lead_followups")) return { rows: [] };
      if (text.startsWith("SELECT * FROM lead_history")) return { rows: [{ id: "history-1", actor_id: "owner-1", to_value: "retired-user", action: "lead.owner_changed" }] };
      if (text.startsWith("SELECT * FROM lead_messages")) return { rows: [] };
      if (text.startsWith("SELECT n.*,COALESCE")) return { rows: [{ id: "note-1", created_by: "owner-1", activity_type_option_id: "deleted-option", activity_type_label: "Former activity type", activity_type_display_label: "Former activity type" }] };
      if (text.startsWith("SELECT * FROM lead_products")) return { rows: [] };
      if (text.startsWith("SELECT id,name FROM users")) { userQueries += 1; return { rows: [{ id: "owner-1", name: "Ada" }, { id: "owner-2", name: "Grace" }] }; }
      return { rows: [] };
    },
  };
  const result = await callRoute(db, "GET", "/api/leads/lead-1");
  assert.equal(result.res.status, 200);
  assert.equal(userQueries, 1);
  assert.equal(result.body.lead.owner_name, "Grace");
  assert.equal(result.body.history[0].to_name, "retired-user");
  assert.equal(result.body.notes[0].author_name, "Ada");
  assert.equal(result.body.notes[0].activity_type_display_label, "Former activity type");
});

test("activity type migration is idempotent and does not backfill legacy note bodies", () => {
  const source = fs.readFileSync("migrations/027_lead_activity_types.sql", "utf8");
  assert.match(source, /ADD COLUMN IF NOT EXISTS activity_type_option_id TEXT/);
  assert.match(source, /ADD COLUMN IF NOT EXISTS activity_type_label TEXT/);
  assert.match(source, /'activity_type', 'Activity type', 'managed'/);
  assert.match(source, /ON CONFLICT \(dropdown_id, value\) DO NOTHING/);
  assert.doesNotMatch(source, /UPDATE lead_notes/i);
});
