const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");

test("admin navigation uses the capability gate and includes the dashboard route", () => {
  const source = fs.readFileSync("src/main.tsx", "utf8");
  assert.match(source, /RequireCapability capability="nav\.admin"/);
  const placeholder = fs.readFileSync("src/screens/placeholder/page.tsx", "utf8");
  assert.match(placeholder, /Coming soon/);
  assert.match(placeholder, /placeholder-empty/);
  assert.match(source, /path="\/admin\/dashboard"/);
  assert.doesNotMatch(source, /Key Note/);
});

test("Leads accepts valid view query keys and falls back for invalid keys", () => {
  const source = fs.readFileSync("src/screens/leads/function.tsx", "utf8");
  assert.match(source, /searchParams\.get\("view"\)/);
  assert.match(source, /LEAD_VIEWS\.some/);
  assert.match(source, /setView\(LEAD_VIEWS\.some/);
});
