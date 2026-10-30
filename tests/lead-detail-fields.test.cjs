/* eslint-disable @typescript-eslint/no-require-imports -- Standalone Node CommonJS test harness. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { runInNewContext } = require("node:vm");
const ts = require("typescript");
const context = { exports: {} };
runInNewContext(ts.transpileModule(readFileSync(join(__dirname, "../app/lib/lead-detail-fields.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, context);
const { completeLeadDetailColumns, storedDetailValue } = context.exports;

test("stored source fields appear even without configured table columns", () => {
  const columns = [{ id: "name", field_key: "lead_name", label: "Name", field_type: "text" }];
  const result = completeLeadDetailColumns({ custom_data: { altuscorp_company: "Example", altuscorp_message: "Details", altuscorp_turnover: 0 } }, columns);
  const company = result.find((column) => column.field_key === "altuscorp_company");
  assert.equal(company.label, "Altuscorp Company");
  assert.equal(company.read_only, true);
  assert.equal(result.some((column) => column.field_key === "altuscorp_message"), true);
  assert.equal(result.some((column) => column.field_key === "altuscorp_turnover"), true);
  assert.equal(result.some((column) => column.field_key === "last_name"), true);
  assert.equal(columns.length, 1);
});
test("configured fields retain their labels, editability, and unique keys", () => {
  const columns = [{ id: "company", field_key: "altuscorp_company", label: "Company Name", field_type: "text", is_visible: false }];
  const result = completeLeadDetailColumns({ custom_data: { altuscorp_company: "Example" } }, columns);
  const matches = result.filter((column) => column.field_key === "altuscorp_company");
  assert.equal(matches.length, 1);
  assert.equal(matches[0].label, "Company Name");
  assert.equal(matches[0].read_only, undefined);
});
test("structured source details and false/zero values remain readable", () => {
  assert.equal(storedDetailValue(0), "0");
  assert.equal(storedDetailValue(false), "false");
  assert.equal(storedDetailValue(null), "");
  assert.equal(storedDetailValue({ interest: "Ambassador", amount: 0 }), '{\n  "interest": "Ambassador",\n  "amount": 0\n}');
});
