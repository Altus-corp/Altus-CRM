const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

function compile(source, filename) {
  return ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true }, fileName: filename }).outputText;
}

test("DropdownSelect renders sorted active options, preserves inactive values, applies defaults, and enforces required", () => {
  const temp = fs.mkdtempSync(path.join(process.cwd(), ".dropdown-component-test-"));
  try {
    const clientSource = fs.readFileSync("src/shared/dropdowns/client.ts", "utf8").replace('import { api } from "../api/client";', 'const { api } = require("./api");');
    const componentSource = fs.readFileSync("src/shared/dropdowns/component.tsx", "utf8");
    fs.writeFileSync(path.join(temp, "package.json"), '{"type":"commonjs"}');
    fs.writeFileSync(path.join(temp, "api.js"), "exports.api = async () => ({ dropdowns: [] });\n");
    fs.writeFileSync(path.join(temp, "client.js"), compile(clientSource, "client.ts"));
    fs.writeFileSync(path.join(temp, "component.js"), compile(componentSource, "component.tsx"));
    const client = require(path.join(temp, "client.js"));
    client.primeDropdownCache([{ id: "dd-status", key: "status", label: "Status", source_type: "managed", required: true, default_value: "first", is_visible: true, is_active: true, sort_order: 1, options: [
      { id: "o-2", dropdown_id: "dd-status", label: "Second", value: "second", semantic_key: null, sort_order: 20, is_active: true },
      { id: "o-1", dropdown_id: "dd-status", label: "First", value: "first", semantic_key: null, sort_order: 10, is_active: true },
      { id: "o-old", dropdown_id: "dd-status", label: "Old", value: "old", semantic_key: null, sort_order: 30, is_active: false },
    ] }]);
    const { DropdownSelect } = require(path.join(temp, "component.js"));
    const defaultMarkup = renderToStaticMarkup(React.createElement(DropdownSelect, { dropdownKey: "status", onValueChange: () => undefined }));
    assert.match(defaultMarkup, /required/);
    assert.match(defaultMarkup, /data-dropdown-default="first"/);
    assert.ok(defaultMarkup.indexOf("First") < defaultMarkup.indexOf("Second"));
    assert.doesNotMatch(defaultMarkup, />Old<\/option>/);
    const inactiveMarkup = renderToStaticMarkup(React.createElement(DropdownSelect, { dropdownKey: "status", value: "old", onValueChange: () => undefined }));
    assert.match(inactiveMarkup, /Old \(inactive\)/);
    assert.match(inactiveMarkup, /disabled=""/);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});

test("DropdownSelect renders a loading state and disables submission while options are unavailable", () => {
  const temp = fs.mkdtempSync(path.join(process.cwd(), ".dropdown-loading-test-"));
  try {
    const clientSource = fs.readFileSync("src/shared/dropdowns/client.ts", "utf8").replace('import { api } from "../api/client";', 'const { api } = require("./api");');
    const componentSource = fs.readFileSync("src/shared/dropdowns/component.tsx", "utf8");
    fs.writeFileSync(path.join(temp, "package.json"), '{"type":"commonjs"}');
    fs.writeFileSync(path.join(temp, "api.js"), "exports.api = () => new Promise(() => {});\n");
    fs.writeFileSync(path.join(temp, "client.js"), compile(clientSource, "client.ts"));
    fs.writeFileSync(path.join(temp, "component.js"), compile(componentSource, "component.tsx"));
    const { DropdownSelect } = require(path.join(temp, "component.js"));
    const markup = renderToStaticMarkup(React.createElement("form", { onSubmit: () => undefined }, React.createElement(DropdownSelect, { dropdownKey: "unloaded", required: true, value: "", onValueChange: () => undefined })));
    assert.match(markup, /Loading options/);
    assert.match(markup, /disabled=""/);
    assert.match(markup, /aria-busy="true"/);
    const leadsSource = fs.readFileSync("src/screens/leads/function.tsx", "utf8");
    const settingsSource = fs.readFileSync("src/screens/settings/function.tsx", "utf8");
    assert.match(leadsSource, /Lead options are still loading or unavailable/);
    assert.match(settingsSource, /Role options are still loading or unavailable/);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});
