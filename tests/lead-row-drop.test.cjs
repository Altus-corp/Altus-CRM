const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const page = fs.readFileSync("src/screens/leads/page.tsx", "utf8");
const logic = fs.readFileSync("src/screens/leads/function.tsx", "utf8");

test("valid row drops use the existing Calling Resolution PATCH path", () => {
  assert.match(page, /onDrop=\{\(event\) => \{ void dropOnCallingResolution\(event, option\.value, option\.label\); \}\}/);
  assert.match(logic, /body: JSON\.stringify\(\{ field: "calling_resolution", value \}\)/);
});

test("same-value row drops are skipped before sending updates", () => {
  assert.match(logic, /planResolutionDrop\(leads, value\)/);
  assert.match(logic, /if \(!moveIds\.length\) \{/);
});

test("rejected row changes retain each server reason", () => {
  assert.match(logic, /failures\.push\(cause instanceof Error \? cause\.message/);
  assert.match(logic, /resolutionMoveSummary\(moved, failures\)/);
});

test("mixed row-drop batches group partial failures in their summary", () => {
  assert.match(logic, /const grouped = new Map<string, number>\(\)/);
  assert.match(logic, /\$\{count\} lead\$\{count === 1 \? "" : "s"\}: \$\{reason\}/);
});

test("dragging a selected row keeps the selection while an unselected row stands alone", () => {
  assert.match(logic, /selectedIds\.includes\(leadId\) \? \[\.\.\.new Set\(selectedIds\)\] : \[leadId\]/);
  assert.match(page, /leadIdsForResolutionDrop\(lead\.id, selectedIds\)/);
});

test("row drops are edit-gated, sequential, capped, and refresh after rejected updates", () => {
  assert.match(page, /canDrag=\{screen\.canEdit\}/);
  assert.match(page, /if \(!canDropOnResolution\(value\)\) return;/);
  assert.match(logic, /LEAD_ROW_DROP_LIMIT = 50/);
  assert.match(logic, /for \(const id of moveIds\) \{[\s\S]*?await api\(`\/api\/leads/);
  assert.match(logic, /failures\.push\(cause instanceof Error \? cause\.message/);
  assert.match(logic, /finally \{\s*try \{ await load\(true\);/);
});
