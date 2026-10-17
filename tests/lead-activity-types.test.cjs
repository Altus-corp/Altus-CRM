const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { Readable } = require("node:stream");
const { route } = require("../server/index.cjs");

function response() { return { status: 0, body: "", headers: {}, setHeader(name, value) { this.headers[name] = value; }, writeHead(status, headers) { this.status = status; Object.assign(this.headers, headers); }, end(body) { this.body = String(body || ""); } }; }
function request(method, url, body) { const req = Readable.from([Buffer.from(JSON.stringify(body || {}))]); req.method = method; req.url = url; req.headers = { "x-altus": "1" }; req.socket = { remoteAddress: "127.0.0.1", encrypted: false }; return req; }
async function callRoute(db, method, url, body) { const res = response(); await route(request(method, url, body), res, db); return { res, body: res.body ? JSON.parse(res.body) : null }; }
const activityDefinition = { key: "activity", label: "Activity", type: "dropdown", options: ["Call", "Video Call", "Email"], active: true, detail_visible: true, order: 1 };

function activityDb({ definition = activityDefinition, failInsert = false, role = "Owner" } = {}) {
  const committed = []; const staged = [];
  const db = {
    committed,
    sessionUser: async () => "owner-1",
    userById: async () => ({ id: "owner-1", role, active: true, offboarded: false }),
    query: async (text) => {
      if (text.startsWith("SELECT id FROM leads")) return { rows: [{ id: "lead-1" }] };
      if (text.startsWith("SELECT value FROM workspace_settings")) return { rows: [{ value: definition ? [definition] : [] }] };
      if (text.startsWith("INSERT INTO lead_notes")) { committed.push(text); return { rows: [] }; }
      if (text.startsWith("INSERT INTO audit_log")) { committed.push(text); return { rows: [] }; }
      throw new Error(`Unexpected query: ${text.slice(0, 40)}`);
    },
    transaction: async (work) => {
      const tx = { query: async (text, params = []) => {
        staged.push({ text, params });
        if (text.startsWith("SELECT custom_values FROM leads")) return { rows: [{ custom_values: { lead_fields: { activity: "Email" } } }] };
        if (text.startsWith("INSERT INTO lead_notes") && failInsert) throw Object.assign(new Error("write failed"), { code: "XX000" });
        return { rows: [] };
      } };
      await work(tx);
      committed.push(...staged.map((entry) => entry.text));
    },
  };
  return db;
}

test("saving a Lead-field Activity validates case-insensitively and commits note, field, and audits together", async () => {
  const db = activityDb();
  const result = await callRoute(db, "POST", "/api/leads/lead-1/notes", { body: "Spoke to lead", activity: "call" });
  assert.equal(result.res.status, 201);
  assert.equal(db.committed.filter((text) => text.startsWith("INSERT INTO lead_notes")).length, 1);
  assert.equal(db.committed.some((text) => text.startsWith("UPDATE leads SET custom_values=jsonb_set")), true);
  assert.equal(db.committed.filter((text) => text.includes("INSERT INTO audit_log")).length, 2);
});

test("an atomic Activity failure leaves neither the note nor Activity field committed", async () => {
  const db = activityDb({ failInsert: true });
  const result = await callRoute(db, "POST", "/api/leads/lead-1/notes", { body: "Will fail", activity: "Call" });
  assert.equal(result.res.status, 500);
  assert.equal(result.body.error, "Unable to save activity.");
  assert.deepEqual(db.committed, []);
});

test("Activity field rejects unavailable definitions and permission is still required", async () => {
  for (const [definition, message] of [[null, /Activity options aren't set up/], [{ ...activityDefinition, active: false }, /inactive/], [{ ...activityDefinition, type: "text" }, /must be a dropdown/], [{ ...activityDefinition, options: [] }, /has no options/] ]) {
    const result = await callRoute(activityDb({ definition }), "POST", "/api/leads/lead-1/notes", { body: "No save", activity: "Call" });
    assert.equal(result.res.status, 400);
    assert.match(result.body.error, message);
  }
  const denied = await callRoute(activityDb({ role: "Viewer" }), "POST", "/api/leads/lead-1/notes", { body: "No access", activity: "Call" });
  assert.equal(denied.res.status, 403);
});

test("plain Notes-tab saves keep their legacy payload and do not require Activity", async () => {
  const db = activityDb();
  const result = await callRoute(db, "POST", "/api/leads/lead-1/notes", { body: "Plain note" });
  assert.equal(result.res.status, 201);
  assert.equal(db.committed.some((text) => text.startsWith("INSERT INTO lead_notes")), true);
  assert.equal(db.committed.some((text) => text.startsWith("UPDATE leads SET custom_values")), false);
});

test("the retired activity_type_option_id request format is rejected without saving", async () => {
  const db = activityDb();
  const result = await callRoute(db, "POST", "/api/leads/lead-1/notes", { body: "Old client", activity_type_option_id: "old-option" });
  assert.equal(result.res.status, 400);
  assert.equal(result.body.error, "This request format is no longer supported. Reload the page.");
  assert.deepEqual(db.committed, []);
});

test("Activity picker reads only the active Activity Lead field and exposes every unavailable state", () => {
  const page = fs.readFileSync("src/screens/leads/page.tsx", "utf8");
  const screen = fs.readFileSync("src/screens/leads/function.tsx", "utf8");
  assert.match(page, /screen\.leadFields\.find\(\(field\) => field\.key === "activity"\)/);
  assert.match(page, /activityField\?\.options/);
  for (const message of ["Loading activity options...", "Couldn't load activity options. Try again.", "Activity options aren't set up.", "The Activity lead field is inactive.", "The Activity lead field must be a dropdown.", "The Activity lead field has no options.", "No matching activity types."]) assert.match(page, new RegExp(message.replace(/[.?]/g, "\\$&")));
  assert.match(page, /const activitySaveDisabled = !activityDetailsText\.trim\(\) \|\| !selectedActivityType \|\| !!activitySetupMessage/);
  assert.match(page, /activity: selectedActivityType\.label/);
  assert.match(screen, /leadFieldsLoading, leadFieldsError/);
});

test("Log activity passes the currently shown type and details explicitly", () => {
  const page = fs.readFileSync("src/screens/leads/page.tsx", "utf8");
  const screen = fs.readFileSync("src/screens/leads/function.tsx", "utf8");
  assert.match(page, /screen\.addActivity\("note", \{ body: activityDetailsText\.trim\(\), activity: selectedActivityType\.label \}\)/);
  assert.match(screen, /const payload = kind === "note" \? \(explicitNote \|\| \{ body: activityForm\.body \}\)/);
});

test("Activity picker clears a type that is no longer an active option", () => {
  const page = fs.readFileSync("src/screens/leads/page.tsx", "utf8");
  assert.match(page, /const selectionIsActive = activityTypes\.some\(\(item\) => item\.id === activityTypeOptionId\)/);
  assert.match(page, /if \(activityTypeOptionId && !selectionIsActive\) setActivityTypeOptionId\(""\)/);
});

test("lead detail resolves display names in one batch and falls back to a missing user id", async () => {
  let userQueries = 0;
  const noteQueries = [];
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
      if (text.startsWith("SELECT n.id,n.lead_id,n.body,n.note_type,n.call_id,n.created_by,n.created_at FROM lead_notes")) { noteQueries.push(text); return { rows: [] }; }
      if (text.startsWith("SELECT * FROM lead_products")) return { rows: [] };
      if (text.startsWith("SELECT id,name FROM users")) { userQueries += 1; return { rows: [{ id: "owner-1", name: "Ada" }, { id: "owner-2", name: "Grace" }] }; }
      throw new Error(`Unexpected query: ${text.slice(0, 40)}`);
    },
  };
  const result = await callRoute(db, "GET", "/api/leads/lead-1");
  assert.equal(result.res.status, 200);
  assert.equal(userQueries, 1);
  assert.equal(result.body.lead.owner_name, "Grace");
  assert.equal(result.body.history[0].actor_name, "Ada");
  assert.equal(result.body.history[0].to_name, "retired-user");
  assert.equal(noteQueries.length, 1);
  assert.equal(noteQueries[0].includes("activity_type_"), false);
});
