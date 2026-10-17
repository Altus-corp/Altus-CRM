"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const page = fs.readFileSync(path.join(root, "src", "screens", "leads", "page.tsx"), "utf8");
const css = fs.readFileSync(path.join(root, "src", "screens", "leads", "leads.css"), "utf8");

test("new lead uses the existing form in an accessible modal without changing its submit path", () => {
  assert.match(page, /screen\.newLeadOpen && <div className="new-lead-modal-backdrop" role="presentation"><section className="new-lead-modal"[\s\S]*?role="dialog" aria-modal="true" aria-labelledby="new-lead-modal-title"/);
  assert.match(page, /<LeadForm form=\{screen\.newLeadForm\} setForm=\{screen\.setNewLeadForm\} errors=\{screen\.formErrors\} onSubmit=\{\(event\) => void screen\.createNewLead\(event\)\} onCancel=\{requestNewLeadClose\} submitLabel="Save Lead"/);
  assert.match(page, /event\.key === "Escape"[\s\S]*?requestNewLeadCloseRef\.current\(\)/);
  assert.match(page, /newLeadInitialFormRef\.current = \{ \.\.\.newLeadFormRef\.current \}/);
  assert.match(page, /newLeadUserTouchedRef\.current = true/);
  assert.match(page, /body\.style\.overflow = "hidden"[\s\S]*?body\.style\.overflow = originalOverflow/);
});

test("new lead modal keeps a scrolling body and sticky actions above navigation", () => {
  assert.match(css, /\.new-lead-modal-backdrop \{ position: fixed; z-index: 100;/);
  assert.match(css, /\.new-lead-modal \{ display: flex; width: min\(980px, 90vw\); max-height: 90vh;/);
  assert.match(css, /\.new-lead-modal \.lead-structured-form \{[\s\S]*?overflow: auto;/);
  assert.match(css, /\.new-lead-modal \.lead-form-actions \{ position: sticky;/);
});
