const test = require("node:test");
const assert = require("node:assert/strict");

test("admin screens have explicit dataset mappings", () => {
  const source = require("fs").readFileSync("src/screens/admin/function.tsx", "utf8");
  for (const name of ["panel", "templates", "import-export", "integrations", "audit", "process-flow"]) assert.match(source, new RegExp(`"${name}"`));
  assert.doesNotMatch(source, /\/api\/leads\?page=1/);
  assert.match(source, /setData\(null\)/);
  assert.match(source, /setError\(true\)/);
});
