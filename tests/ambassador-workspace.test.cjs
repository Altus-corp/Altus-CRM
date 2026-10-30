/* eslint-disable @typescript-eslint/no-require-imports -- Standalone Node CommonJS test harness. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { runInNewContext } = require("node:vm");
const ts = require("typescript");

function load(file, dependencies = {}) {
  const context = { exports: {}, require: (id) => {
    if (id in dependencies) return dependencies[id];
    throw new Error(`Unexpected dependency ${id}`);
  } };
  runInNewContext(ts.transpileModule(readFileSync(join(__dirname, "../app/lib", file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, context);
  return context.exports;
}
const roles = load("roles.ts");
const { getDashboardNavigation } = load("navigation.ts", { "@/app/lib/roles": roles });

test("Ambassador accounts get exactly Dashboard and Leads", () => {
  const navigation = getDashboardNavigation(["ambassador"]);
  assert.equal(navigation.length, 2);
  assert.equal(navigation[0].label, "Dashboard");
  assert.equal(navigation[0].href, "/dashboard");
  assert.equal(navigation[1].label, "Leads");
  assert.equal(navigation[1].href, "/dashboard/leads");
  assert.equal(roles.APP_ROLES.includes("ambassador"), true);
});
test("Ambassador workspace takes precedence over a sales role", () => {
  assert.equal(roles.isAmbassadorWorkspace(["sales_executive", "ambassador"]), true);
  assert.equal(getDashboardNavigation(["sales_executive", "ambassador"]).length, 2);
});
test("admin accounts retain admin navigation when also assigned Ambassador", () => {
  assert.equal(roles.isAmbassadorWorkspace(["admin", "ambassador"]), false);
  assert.equal(getDashboardNavigation(["admin", "ambassador"]).some((item) => item.href === "/dashboard/users"), true);
});
test("existing sales and manager navigation remains available", () => {
  assert.equal(roles.isAmbassadorWorkspace(["sales_manager"]), false);
  assert.equal(getDashboardNavigation(["sales_manager"]).some((item) => item.href === "/dashboard/sales-manager"), true);
  assert.equal(getDashboardNavigation(["sales_executive"]).some((item) => item.href === "/dashboard/products"), true);
});
