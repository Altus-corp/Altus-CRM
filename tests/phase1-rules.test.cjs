const test = require("node:test");
const assert = require("node:assert/strict");
const { effectiveTarget, actualCounts } = require("../server/target-rules.cjs");

test("target override precedence is day, week, quarter, default", () => {
  assert.deepEqual(effectiveTarget({ day_override: 10, week_override: 8, quarter_override: 6, total_target: 4 }), { target: 10, excluded: false, source: "day" });
  assert.deepEqual(effectiveTarget({ week_override: 8, quarter_override: 6, total_target: 4 }), { target: 8, excluded: false, source: "week" });
  assert.deepEqual(effectiveTarget({ quarter_override: 6, total_target: 4 }), { target: 6, excluded: false, source: "quarter" });
  assert.deepEqual(effectiveTarget({ total_target: 4 }), { target: 4, excluded: false, source: "default" });
});

test("absent days are excluded from target and actual counts", () => {
  assert.deepEqual(effectiveTarget({ total_target: 20, absent: true }), { target: 0, excluded: true, source: "absent" });
  assert.equal(actualCounts([{ actual: 3 }, { actual: 4, absent: true }, { actual: 2 }]), 5);
});
