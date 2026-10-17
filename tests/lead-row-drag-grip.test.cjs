const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const source = fs.readFileSync("src/screens/leads/page.tsx", "utf8");

test("Lead Master row and grip are permission gated and carry selected lead ids", () => {
  assert.match(source, /canDrag=\{screen\.canEdit\}/);
  assert.match(source, /const canRowDrag = canDrag && hasFinePointer/);
  assert.match(source, /if \(canRowDrag\) return <tr[^>]*draggable/);
  assert.match(source, /aria-label="Drag to change call resolution"/);
  assert.match(source, /dataTransfer\.setData\("application\/x-lead-ids", JSON\.stringify\(ids\)\)/);
  assert.match(source, /leadIdsForResolutionDrop\(lead\.id, selectedIds\)/);
});
