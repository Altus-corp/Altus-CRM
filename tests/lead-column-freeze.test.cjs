const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

const page = fs.readFileSync("src/screens/leads/page.tsx", "utf8");
const css = fs.readFileSync("src/screens/leads/leads.css", "utf8");

function functionSource(name) {
  const start = page.indexOf(`export function ${name}`);
  assert.notEqual(start, -1, `${name} must remain a small pure helper`);
  const brace = page.indexOf("{\r\n", start) >= 0 ? page.indexOf("{\r\n", start) : page.indexOf("{\n", start);
  let depth = 0;
  for (let index = brace; index < page.length; index += 1) {
    if (page[index] === "{") depth += 1;
    if (page[index] === "}" && --depth === 0) return page.slice(start, index + 1);
  }
  throw new Error(`Could not read ${name}`);
}

function executable(source) {
  return source.replace("export ", "").replace(/: PinnedColumnPreference/g, "").replace(/: readonly string\[\]/g, "").replace(/: Record<string, number>/g, "").replace(/: "before" \| "after"/g, "").replace(/: string/g, "").replace(/: number/g, "").replace(/<string, number>/g, "");
}

function typescriptHelper(name) {
  const source = `type PinnedColumnPreference = { pinnedOrder: string[]; unpinnedOrder: string[]; preFreezePositions: Record<string, number> };\n${functionSource(name).replace("export ", "")}`;
  const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(`${output}\nreturn ${name};`)();
}

test("pinned columns render in pinnedOrder and all columns may be pinned", () => {
  const group = new Function(`${executable(functionSource("groupPinnedColumns"))}\nreturn groupPinnedColumns;`)();
  assert.deepEqual(group(["name", "email", "company"], ["company", "name"]), ["company", "name", "email"]);
  assert.deepEqual(group(["name", "email", "company"], ["name", "email", "company"]), ["name", "email", "company"]);
});

test("reordering frozen columns updates their order and sticky offsets immediately", () => {
  const move = new Function(`${executable(functionSource("moveColumnKey"))}\n${executable(functionSource("movePinnedColumnWithinGroup"))}\nreturn movePinnedColumnWithinGroup;`)();
  const offsets = new Function(`${executable(functionSource("pinnedColumnOffsets"))}\nreturn pinnedColumnOffsets;`)();
  const before = { pinnedOrder: ["name", "email"], unpinnedOrder: ["company"], preFreezePositions: {} };
  const after = move(before, "email", "name", "before");
  assert.deepEqual(after.pinnedOrder, ["email", "name"]);
  assert.deepEqual([...offsets(after.pinnedOrder, { name: 180, email: 135 }, 72)], [["email", 72], ["name", 207]]);
});

test("cross-group header drops are rejected", () => {
  const move = new Function(`${executable(functionSource("moveColumnKey"))}\n${executable(functionSource("movePinnedColumnWithinGroup"))}\nreturn movePinnedColumnWithinGroup;`)();
  const layout = { pinnedOrder: ["name"], unpinnedOrder: ["email", "company"], preFreezePositions: {} };
  assert.equal(move(layout, "name", "email", "after"), layout);
  assert.match(page, /pinnedColumnKeys\.includes\(headerDragKey\) !== pinnedColumnKeys\.includes\(targetKey\)/);
});

test("saved ordered layout is restored, default Name is only used with no preference, and stale keys are ignored", () => {
  const reconcile = typescriptHelper("reconcilePinnedColumnPreference");
  const fields = ["name", "email", "company"].map((key) => ({ key }));
  assert.deepEqual(reconcile(null, fields, ["name", "email", "company"]).pinnedOrder, ["name"]);
  const restored = reconcile({ pinnedOrder: ["company", "missing", "name"], unpinnedOrder: ["email", "missing"], preFreezePositions: { company: 1, missing: 9 } }, fields, ["name", "email", "company"]);
  assert.deepEqual(restored, { pinnedOrder: ["company", "name"], unpinnedOrder: ["email"], preFreezePositions: { company: 1 } });
  assert.deepEqual(reconcile({ pinnedOrder: [], unpinnedOrder: ["email", "name", "company"], preFreezePositions: {} }, fields, ["name", "email", "company"]).pinnedOrder, []);
  assert.match(page, /writeStoredPinnedColumns\(user\?\.id, nextPreference\)/);
});

test("freeze controls live only in the Columns picker and headers render no pin icon", () => {
  assert.match(page, /pinnedColumnKeys\.includes\(field\.key\) \? "Unfreeze" : "Freeze"/);
  assert.doesNotMatch(page, /<Pin(?:Off)?\b/);
  assert.doesNotMatch(page, /lead-column-pin/);
  assert.match(page, /selectionSticky=\{hasPinnedColumns\}/);
  assert.match(page, /LEAD_TABLE_SELECTION_COLUMN_WIDTH/);
});

test("pinned cells use opaque sticky layers, keep header drag handlers, and have a trailing divider", () => {
  assert.match(css, /\.lead-table:has\(\.lead-pinned-cell\) \.lead-table-checkbox-col, \.lead-table \.lead-pinned-cell \{ position: sticky; background: var\(--panel\); \}/);
  assert.match(css, /thead \.lead-table-checkbox-col, \.lead-table thead \.lead-pinned-cell \{ z-index: 4/);
  assert.match(css, /\.lead-table \.is-last-pinned \{ box-shadow:/);
  assert.match(css, /tbody tr:hover \.lead-table-checkbox-col/);
  assert.match(page, /draggable: true, tabIndex: 0, onDragStart:/);
  assert.doesNotMatch(css, /lead-pinned-cell[^\{]*\{[^}]*pointer-events:\s*none/);
});
