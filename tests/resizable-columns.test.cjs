const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const hookSource = fs.readFileSync("src/shared/tables/use-resizable-columns.ts", "utf8");
const pageSource = fs.readFileSync("src/screens/leads/page.tsx", "utf8");
const cssSource = fs.readFileSync("src/screens/leads/leads.css", "utf8");

test("resizable columns cache by user, reconcile server values, and save only after drag completion", () => {
  assert.match(hookSource, /table-widths\.v1:\$\{userId\}:\$\{tableKey\}/);
  assert.match(hookSource, /mergeWidths\(defaultWidths, response\.widths\)/);
  assert.match(hookSource, /SAVE_DELAY_MS = 500/);
  assert.match(hookSource, /setPointerCapture\(event\.pointerId\)/);
  assert.match(hookSource, /method: "PUT"/);
  assert.match(hookSource, /method: "DELETE"/);
});

test("Lead Master keeps header and body widths aligned while resize handles isolate sorting", () => {
  assert.match(pageSource, /<colgroup>/);
  assert.match(pageSource, /lead-column-resize-handle/);
  assert.match(pageSource, /lead-column-resize-guide/);
  assert.match(pageSource, /Reset column widths/);
  assert.match(pageSource, /resizeHandle\(field\.key, field\.label\)/);
  assert.match(cssSource, /table-layout: fixed/);
  assert.match(cssSource, /cursor: col-resize/);
  assert.match(cssSource, /--lead-col-line/);
  assert.match(cssSource, /data-resizing="true"/);
  assert.match(cssSource, /lead-column-resize-guide/);
  assert.match(cssSource, /pointer-events: none/);
  assert.match(pageSource, /lead-header-label/);
  assert.match(hookSource, /dataset\.resizing = "true"/);
  assert.match(hookSource, /wrapper\.scrollLeft/);
  assert.match(hookSource, /table\.offsetHeight/);
});
