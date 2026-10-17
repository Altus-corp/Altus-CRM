const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const page = fs.readFileSync("src/screens/leads/page.tsx", "utf8");
const server = fs.readFileSync("server/index.cjs", "utf8");
const importer = fs.readFileSync("server/lead-import.cjs", "utf8");

test("new and edit forms use only active admin definitions outside fixed core fields", () => {
  assert.match(page, /const FIXED_LEAD_FORM_KEYS = new Set\(\["name", "phone", "lead_type", "permission"\]\)/);
  assert.match(page, /leadFields\.filter\(\(field\) => field\.active && !FIXED_LEAD_FORM_KEYS\.has\(field\.key\)\)/);
  assert.match(page, /field\.type === "dropdown"/);
  assert.match(page, /\(field\.options \|\| \[\]\)\.map/);
});

test("details require both active and Show details, and dates use yyyy-MM-dd", () => {
  assert.match(page, /field\.active && field\.detail_visible && !FIXED_LEAD_FORM_KEYS\.has\(field\.key\)/);
  assert.match(page, /function displayConfiguredLeadValue/);
  assert.match(page, /return text\.slice\(0, 10\)/);
});

test("lead create and update use active-field validation with clear errors", () => {
  assert.match(server, /LeadFields\.mergeActiveLeadValues\(fields\.custom_values, body\.lead_fields/);
  assert.match(server, /error: error\.message \|\| "Invalid lead field\."/);
});

test("inline editing and bulk import accept only active configured fields", () => {
  assert.match(server, /find\(\(field\) => field\.key === requested && field\.active\)/);
  assert.match(importer, /const activeLeadFields = \(reference\.leadFields \|\| \[\]\)\.filter\(\(field\) => field\.active !== false\)/);
  assert.match(importer, /LeadFields\.normalizeValues\([^\n]+activeLeadFields\)/);
});
