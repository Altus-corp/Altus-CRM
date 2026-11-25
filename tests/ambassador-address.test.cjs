const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

const source = fs.readFileSync("app/lib/lead-address-fields.ts", "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const context = { exports: {} };
vm.runInNewContext(compiled, context);
const parse = context.exports.addressFromAmbassadorSummary;

test("reads available Ambassador address fields without confusing the two address lines", () => {
  const result = parse("Address: Full address\nAddress line 1: Building A\nAddress line 2: Main Street\nCity: Pune\nState: Maharashtra\nPostal code: 411001\nLandmark: Park");
  assert.equal(result.address_line_1, "Building A");
  assert.equal(result.address_line_2, "Main Street");
  assert.equal(result.city, "Pune");
  assert.equal(result.state, "Maharashtra");
  assert.equal(result.pincode, "411001");
  assert.equal(result.nearby_landmark, "Park");
});

test("uses the general address when the API has no address line 1", () => {
  const result = parse("Address: 10 Main Street\nEmail: person@example.com");
  assert.equal(result.address_line_1, "10 Main Street");
  assert.equal(result.address_line_2, "");
  assert.equal(result.city, "");
});
