"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const columns = JSON.parse(fs.readFileSync(path.join(root, "shared", "lead-inline-columns.json"), "utf8"));
const serverSource = fs.readFileSync(path.join(root, "server", "index.cjs"), "utf8");
const pageSource = fs.readFileSync(path.join(root, "src", "screens", "leads", "page.tsx"), "utf8");
const functionSource = fs.readFileSync(path.join(root, "src", "screens", "leads", "function.tsx"), "utf8");

test("every editable frontend column is represented in the server whitelist and system fields are protected", () => {
  const whitelistSource = fs.readFileSync(path.join(root, "server", "lead-inline-fields.cjs"), "utf8");
  for (const column of columns.filter((item) => item.editable)) assert.match(whitelistSource, new RegExp(`key === \\"${column.key}\\"|key, column`));
  for (const key of ["created_at", "updated_at", "last_opened_at", "leadNo"]) assert.equal(columns.find((column) => column.key === key)?.editable, false);
  assert.match(serverSource, /This lead field is not editable/);
});

test("canonical aliases and name synchronization are defined", () => {
  const business = columns.find((column) => column.key === "businessCategory");
  const configuredBusiness = columns.find((column) => column.key === "business_category");
  const lastCalled = columns.find((column) => column.key === "lastCalledOn");
  const legacyLastCalled = columns.find((column) => column.key === "last_called_on");
  assert.equal(business.aliasOf, "business_category");
  assert.equal(configuredBusiness.storage.key, "business_category");
  assert.equal(lastCalled.storage.key, "last_call_at");
  assert.equal(legacyLastCalled.aliasOf, "lastCalledOn");
  assert.match(serverSource, /first_name=\$2,last_name=\$3/);
  assert.match(serverSource, /name = value/);
});

test("frontend editor supports cancel, optimistic response update, and rollback state", () => {
  assert.match(pageSource, /event\.key === "Escape"/);
  assert.match(pageSource, /setState\("saving"\)/);
  assert.match(pageSource, /setState\("error"\)/);
  assert.match(functionSource, /setData\(\(current\)/);
});

test("navbar new-lead action opens the full form through the URL and close clears it", () => {
  assert.match(pageSource, /openNewLead: \(\) => navigate\("\/leads\?new=1"\)/);
  assert.match(pageSource, /\{screen\.newLeadOpen && <div className="lead-edit-form-host">[\s\S]*?<LeadForm form=\{screen\.newLeadForm\}[\s\S]*?onCancel=\{screen\.closeNewLead\}/);
  assert.match(functionSource, /function closeNewLead\(\) \{ const next = new URLSearchParams\(searchParams\); next\.delete\("new"\); setSearchParams\(next\); \}/);
  assert.match(functionSource, /closeNewLead\(\); await load\(true\);/);
});

test("sortable lead headers use accessible Lucide icons and cycle server sort state", () => {
  assert.match(pageSource, /import \{ ChevronsUpDown, ChevronDown, ChevronUp \} from "lucide-react"/);
  assert.match(pageSource, /function SortableLeadHeader[\s\S]*?aria-sort=\{direction === "asc" \? "ascending" : direction === "desc" \? "descending" : "none"\}/);
  assert.match(pageSource, /<SortIcon size=\{14\} strokeWidth=\{2\} aria-hidden="true" \/>/);
  assert.match(pageSource, /<SortableLeadHeader label="Status" sortKey="lead_status"/);
  assert.match(functionSource, /function changeSort\(nextSort: string\) \{ setPage\(1\); if \(sortBy !== nextSort\) \{ setSortBy\(nextSort\); setSortDir\("asc"\); return; \} if \(sortDir === "asc"\) \{ setSortDir\("desc"\); return; \} setSortBy\(null\); setSortDir\(null\); \}/);
  assert.match(functionSource, /sort: sortBy \|\| "updated_at", direction: sortDir \|\| "desc"/);
});

test("every server-sortable lead header has the shared icon path and the checkbox stays plain", () => {
  for (const key of ["leadNo", "leadTypeCode", "cellNo", "email", "lead_acquisition_date", "calling_resolution", "created_at", "sourceSystem", "owner", "totalPayable", "targetDate"]) assert.match(pageSource, new RegExp(`${key}: "`));
  assert.match(pageSource, /configuredFieldsByKey\.has\(field\.key\) \? `configured:\$\{field\.key\}` : LEAD_SORT_KEYS\[field\.key\]/);
  assert.match(pageSource, /function LeadTableHeader[\s\S]*?<th className="lead-table-checkbox-col" scope="col"><label className="lead-table-checkbox-label">\{selectAll\}<\/label><\/th>\{fields\.map/);
});

test("lead row selection control stays before the drag grip in the fixed first column", () => {
  assert.match(pageSource, /const LEAD_TABLE_SELECTION_COLUMN_WIDTH = 72;/);
  assert.match(pageSource, /leadTableWidth = LEAD_TABLE_SELECTION_COLUMN_WIDTH/);
  assert.match(pageSource, /<label className="lead-row-select-control"><input type="checkbox" className="lead-table-checkbox"[\s\S]*?<button type="button" className="lead-row-drag-grip"/);
  assert.match(pageSource, /<td className="lead-table-checkbox-col" onClick=\{\(event\) => \{ event\.stopPropagation\(\); \}\}/);
});


test("migration adds last-opened columns and idempotent dropdown seeds", () => {
  const migration = fs.readFileSync(path.join(root, "migrations", "018_lead_last_opened_and_inline_dropdowns.sql"), "utf8");
  assert.match(migration, /ADD COLUMN IF NOT EXISTS last_opened_at/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS last_opened_by/);
  assert.match(migration, /ON CONFLICT \(key\) DO NOTHING/);
  assert.match(migration, /ON CONFLICT \(dropdown_id,value\) DO NOTHING/);
});

test("picker includes first and last name without auto-showing hidden additions", () => {
  const first = columns.find((column) => column.key === "first_name");
  const last = columns.find((column) => column.key === "last_name");
  assert.equal(first.hidden, true);
  assert.equal(last.hidden, true);
  assert.match(pageSource, /const defaultColumnKeys = baseFields\.map/);
  assert.match(pageSource, /LEAD_COLUMNS\.filter\(\(field\) => !field\.aliasOf\)/);
});

test("header column moves use the visible-only order helper", () => {
  const source = pageSource.match(/export function moveColumnKey[\s\S]*?\n}/)?.[0];
  assert.ok(source, "moveColumnKey should be a small pure helper");
  const executable = source.replace("export ", "").replace(/: readonly string\[\]/g, "").replace(/: string/g, "").replace(/: "before" \| "after"/g, "");
  const moveColumnKey = new Function(`${executable}\nreturn moveColumnKey;`)();
  const order = ["a", "b", "c", "d", "e"];
  assert.deepEqual(moveColumnKey(order, "e", "a", "before"), ["e", "a", "b", "c", "d"]);
  assert.deepEqual(moveColumnKey(order, "d", "b", "before"), ["a", "d", "b", "c", "e"]);
  assert.deepEqual(moveColumnKey(order, "d", "b", "after"), ["a", "b", "d", "c", "e"]);
  assert.deepEqual(moveColumnKey(order, "b", "d", "after"), ["a", "c", "d", "b", "e"]);
  assert.deepEqual(moveColumnKey(order, "b", "d", "before"), ["a", "c", "b", "d", "e"]);
  assert.deepEqual(moveColumnKey(order, "c", "c", "before"), order);
  assert.deepEqual(moveColumnKey(order, "c", "b", "after"), order);
});

test("table header reorder shares Columns persistence and preserves sort interaction", () => {
  assert.match(pageSource, /function saveColumnOrder\(order: string\[\]\)[\s\S]*?setVisibleColumnKeys\(next\)[\s\S]*?setPendingColumnKeys\(next\)[\s\S]*?\/api\/user-preferences/);
  assert.match(pageSource, /handleHeaderDragOver[\s\S]*?event\.preventDefault\(\)[\s\S]*?setHeaderDropTarget\(\{ key: targetKey, side \}\)/);
  assert.match(pageSource, /handleHeaderDrop[\s\S]*?headerDropTarget\?\.key === targetKey[\s\S]*?moveVisibleColumn\(sourceKey, dropTarget\.key, dropTarget\.side\)/);
  assert.match(pageSource, /function moveVisibleColumn[\s\S]*?next\.every\([\s\S]*?return false;[\s\S]*?saveColumnOrder\(next\)/);
  assert.match(pageSource, /suppressHeaderSortClickRef\.current = true/);
  assert.match(pageSource, /onSort = \(key: string\) => \{ if \(suppressHeaderSortClickRef\.current\)/);
  assert.match(pageSource, /lead-table-checkbox-col[\s\S]*?<\/th>\{fields\.map/);
});

test("header keyboard reorder and reset remain available", () => {
  assert.match(pageSource, /event\.altKey[\s\S]*?ArrowLeft[\s\S]*?event\.preventDefault\(\)/);
  assert.match(pageSource, /moveVisibleColumn\(key, targetKey, event\.key === "ArrowLeft" \? "before" : "after", true\)/);
  assert.match(pageSource, /tabIndex: 0/);
  assert.match(pageSource, /columnOrderAnnouncement/);
  assert.match(pageSource, /function resetColumnSelection\(\)[\s\S]*?setVisibleColumnKeys\(defaults\)[\s\S]*?method: "DELETE"/);
});

test("Alt+Left and Alt+Right use one-place visible column moves", () => {
  const source = pageSource.match(/export function moveColumnKey[\s\S]*?\n}/)?.[0];
  const executable = source.replace("export ", "").replace(/: readonly string\[\]/g, "").replace(/: string/g, "").replace(/: "before" \| "after"/g, "");
  const moveColumnKey = new Function(`${executable}\nreturn moveColumnKey;`)();
  const order = ["a", "b", "c"];
  assert.deepEqual(moveColumnKey(order, "b", "a", "before"), ["b", "a", "c"]);
  assert.deepEqual(moveColumnKey(order, "b", "c", "after"), ["a", "c", "b"]);
});
