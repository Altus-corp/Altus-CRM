const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

function read(path) { return fs.readFileSync(path, "utf8"); }

test("converted dropdowns have no legacy lead-stages consumer or frontend option list", () => {
  const server = read("server/lead-import.cjs");
  const leads = read("src/screens/leads/function.tsx");
  assert.doesNotMatch(server, /lead-stages\.json|LEAD_STAGE_OPTIONS|LEAD_STAGES/);
  assert.doesNotMatch(leads, /DEFAULT_PAGE_SIZE_OPTIONS\s*:\s*DropdownOption\[\]\s*=\s*\[\s*\{/);
  assert.equal(fs.existsSync("src/shared/leads/stages.ts"), false, "legacy stage module should be removed");
});

test("stage semantics are stored independently of labels", () => {
  const seed = JSON.parse(read("shared/dropdown-seed.json"));
  assert.ok(seed.lead_stage.every((option) => option.semantic_key));
  assert.match(read("migrations/009_dropdown_configuration.sql"), /semantic_key/);
  assert.match(read("migrations/011_dropdown_follow_up_filter.sql"), /follow_up_filter/);
  assert.doesNotMatch(read("server/lead-import.cjs"), /won|lost|funnel/i);
});
