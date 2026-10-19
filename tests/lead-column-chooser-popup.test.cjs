const test = require("node:test");
const assert = require("node:assert/strict");

test("column chooser closes only for outside clicks and escape, never during an active drag", async () => {
  const { isColumnChooserEscape, shouldCloseColumnChooser } = await import("../src/screens/leads/column-chooser-popup.ts");
  const inside = {};
  const outside = {};
  const dialog = { contains: (target) => target === inside };
  const trigger = { contains: () => false };

  assert.equal(shouldCloseColumnChooser(outside, dialog, trigger, false), true, "outside click closes");
  assert.equal(shouldCloseColumnChooser(inside, dialog, trigger, false), false, "inside click stays open");
  assert.equal(shouldCloseColumnChooser(outside, dialog, trigger, true), false, "drag in progress stays open");
  assert.equal(isColumnChooserEscape("Escape"), true, "Escape closes");
  assert.equal(isColumnChooserEscape("Enter"), false);
});
