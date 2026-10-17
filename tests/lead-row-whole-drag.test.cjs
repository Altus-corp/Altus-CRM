const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const page = fs.readFileSync("src/screens/leads/page.tsx", "utf8");
const css = fs.readFileSync("src/screens/leads/leads.css", "utf8");

test("whole-row drag excludes interactive origins with closest", () => {
  assert.match(page, /function isLeadRowDragInteractiveTarget\(target: EventTarget \| null\)/);
  assert.match(page, /target\.closest\(ROW_DRAG_INTERACTIVE_SELECTOR\)/);
  assert.match(page, /input, button, a, select, textarea, \[contenteditable\], \[role='button'\], \[role='combobox'\], \[role='listbox'\], \[data-lead-row-no-drag\]/);
  assert.match(page, /if \(isLeadRowDragInteractiveTarget\(event\.target\)\) \{ event\.preventDefault\(\); return; \}/);
  assert.match(page, /data-lead-row-no-drag=\{field\.input === "dropdown" \|\| field\.input === "boolean"/);
});

test("row-level drag is edit-gated, fine-pointer-only, and resets click suppression", () => {
  assert.match(page, /const media = window\.matchMedia\("\(pointer: fine\)"\)/);
  assert.match(page, /media\.addEventListener\("change", sync\)/);
  assert.match(page, /const canRowDrag = canDrag && hasFinePointer/);
  assert.match(page, /draggable aria-busy=\{moving \|\| undefined\}/);
  assert.match(page, /const onDragStart = \(event: React\.DragEvent<HTMLElement>, _lead\?: Lead\) => \{ suppressClickRef\.current = true;/);
  assert.match(page, /const onDragEnd = \(\) => \{ endDrag\(\); window\.setTimeout\(\(\) => \{ suppressClickRef\.current = false; \}, 0\); \}/);
  assert.match(page, /const onRowPointerDown = \(\) => \{ suppressClickRef\.current = false; \}/);
  assert.match(page, /const onOpen = \(\) => \{ if \(!suppressClickRef\.current\) openLead\(\); \}/);
  assert.match(css, /tr\.is-row-draggable td:not\(\[data-lead-row-no-drag\]\) \{ cursor: grab; user-select: none;/);
});
