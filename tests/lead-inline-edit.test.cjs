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
