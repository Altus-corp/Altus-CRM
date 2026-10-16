const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

const source = fs.readFileSync("src/shared/call-resolution-validity.ts", "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const sandboxModule = { exports: {} }; vm.runInNewContext(compiled, { exports: sandboxModule.exports, module: sandboxModule });
const client = sandboxModule.exports;

function serverRule(value, productCodes, active) { return value != null && value !== "" && productCodes.some((code) => (active[code] || []).some((label) => label === String(value))); }

test("client call-resolution validity mirrors the server rule", () => {
  const products = [{ code: "ALPHA", label: "Alpha" }, { code: "BETA", label: "Beta plan" }];
  const active = { ALPHA: ["Registered", "Follow up"], BETA: ["Verbal Yes"] };
  for (const [proposed, value, expected] of [["", "Registered", false], ["Alpha", "Registered", true], ["alpha", "Follow up", true], ["ALPHA; Beta plan", "Verbal Yes", true], ["Alpha, BETA", "Wrong Number", false], ["Alpha", "Inactive", false]]) {
    const codes = client.proposedProductCodes(proposed, products);
    assert.equal(client.resolutionAllowedForProducts(value, codes, active), expected);
    assert.equal(client.resolutionAllowedForProducts(value, codes, active), serverRule(value, codes, active));
  }
});
