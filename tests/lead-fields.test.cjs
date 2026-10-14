const test = require("node:test");
const assert = require("node:assert/strict");
const LeadFields = require("../server/lead-fields.cjs");
const { analyzeUpload } = require("../server/lead-import.cjs");

function db() { return { query: async (sql) => sql.includes("workspace_settings") ? { rows: [] } : { rows: [] } }; }

test("default lead fields cover the requested acquisition and introducer data", () => {
  const keys = new Set(LeadFields.DEFAULT_FIELDS.map((field) => field.key));
  for (const key of ["lead_acquisition_date", "business_category", "nature_of_business", "proposed_solution", "invite_sent_by_introducer", "introducer_feedback", "introducer_name", "employee_name", "association_network_name", "chapter_name", "extra_notes", "calling_remarks", "intro_video_sent", "email_sent", "whatsapp_message_sent"]) assert.ok(keys.has(key), key);
});

test("import maps Brevo-style and requested field headers into safe lead custom values", async () => {
  const file = Buffer.from("Lead No,First Name,Last Name,Email ID,Cell No,Lead Acquisition Date,Invite Sent by Introducer,Introducer Name,Extra Notes\nBREVO-001,Sample,Person,sample@example.test,9000000000,2026-10-13,Yes,Sample Introducer,Sample note\n");
  const result = await analyzeUpload(file, "brevo-export.csv", db());
  assert.equal(result.errors.length, 0);
  assert.equal(result.valid[0].values.name, "Sample Person");
  assert.equal(result.valid[0].values.email, "sample@example.test");
  assert.deepEqual(result.valid[0].values.custom_fields, { lead_acquisition_date: "2026-10-13", invite_sent_by_introducer: true, introducer_name: "Sample Introducer", extra_notes: "Sample note" });
});

test("hidden or inactive definitions do not erase a lead's saved values", () => {
  const fields = LeadFields.normalizeDefinitions([{ key: "extra_notes", label: "Extra Notes", type: "text", active: false, detail_visible: false }]);
  const merged = LeadFields.mergeLeadValues({ lead_fields: { extra_notes: "Existing note" } }, {}, fields);
  assert.equal(merged.lead_fields.extra_notes, "Existing note");
});
