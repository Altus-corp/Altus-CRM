const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

test("Dropdown Management is routed and exposes managed versus read-only controls", () => {
  const page = fs.readFileSync("src/screens/admin/dropdown-management.tsx", "utf8");
  const main = fs.readFileSync("src/main.tsx", "utf8");
  const nav = fs.readFileSync("src/shared/layout/nav.ts", "utf8");
  assert.match(main, /\/admin\/dropdowns/);
  assert.match(nav, /Dropdown Management/);
  assert.match(page, /source_type === "managed"/);
  assert.match(page, /Read-only/);
  assert.match(page, /Option values must be unique/);
  assert.match(page, /Option label and value are required/);
  assert.match(page, /<code>\{option\.value\}<\/code>/);
  assert.match(page, /window\.confirm/);
  assert.match(page, /options\/reorder/);
  assert.match(page, /dropdown-source-filter/);
  assert.match(page, /sourceFilter/);
  assert.match(page, /Dropdown definitions/);
  assert.match(page, /dropdown-advanced-settings/);
  assert.match(page, /Advanced settings/);
  assert.match(page, /Try a different search or filter/);
});
