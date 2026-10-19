const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { leadsList } = require("../server/index.cjs");

function response() { return { status: 0, body: "", headers: {}, setHeader(name, value) { this.headers[name] = value; }, writeHead(status, headers) { this.status = status; Object.assign(this.headers, headers); }, end(body) { this.body = String(body || ""); } }; }
function request() { return { method: "GET", url: "/api/leads", headers: {}, socket: { remoteAddress: "127.0.0.1", encrypted: false } }; }

test("lead list does not query migration 027 activity columns", async () => {
  const queries = [];
  const db = { query: async (sql) => {
    queries.push(sql);
    if (sql.startsWith("SELECT count")) return { rows: [{ total: 1 }] };
    if (sql.startsWith("SELECT l.id")) return { rows: [{ id: "lead-a", source_id: "lead-a", name: "Lead", custom_values: { lead_fields: { activity: "Call" } }, legacy_finance: {} }] };
    throw new Error(`Unexpected query: ${sql.slice(0, 30)}`);
  } };
  const res = response();
  await leadsList(request(), res, db, new URL("http://localhost/api/leads"));
  const body = JSON.parse(res.body);
  assert.equal(res.status, 200);
  assert.equal(body.items[0].custom_values.lead_fields.activity, "Call");
  assert.equal(queries.some((sql) => sql.includes("activity_type_option_id") || sql.startsWith("SELECT DISTINCT ON (n.lead_id)")), false);
});

test("Activity is a single configured Lead-field column, including saved layout key activity", () => {
  const page = fs.readFileSync("src/screens/leads/page.tsx", "utf8");
  const policy = fs.readFileSync("src/screens/leads/inline-field-policy.ts", "utf8");
  assert.match(page, /const configuredFields: LeadColumn\[\] = activeConfiguredFields\.map/);
  assert.doesNotMatch(page, /displayKey: "latest_activity"/);
  assert.doesNotMatch(page, /\{ key: "activity", label: "Activity", input: "text", editable: false/);
  assert.match(policy, /BUILT_IN_TABLE_COLUMN_KEYS = \["calling_resolution"\]/);
  assert.match(page, /const allChooserFields = tableColumns/);
});
