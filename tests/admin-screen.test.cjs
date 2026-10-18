const test = require("node:test");
const assert = require("node:assert/strict");

test("admin screens have explicit dataset mappings", () => {
  const source = require("fs").readFileSync("src/screens/admin/function.tsx", "utf8");
  for (const name of ["panel", "templates", "import-export", "integrations", "audit", "process-flow"]) assert.match(source, new RegExp(`"${name}"`));
  assert.doesNotMatch(source, /\/api\/leads\?page=1/);
  assert.match(source, /setData\(null\)/);
  assert.match(source, /setError\(true\)/);
});

test("admin dashboard has a route, summary, follow-ups, and workspace shortcuts", () => {
  const main = require("fs").readFileSync("src/main.tsx", "utf8");
  const nav = require("fs").readFileSync("src/shared/layout/nav.ts", "utf8");
  const page = require("fs").readFileSync("src/screens/admin/page.tsx", "utf8");
  const logic = require("fs").readFileSync("src/screens/admin/function.tsx", "utf8");
  assert.match(main, /\/admin\/dashboard/);
  assert.match(nav, /label: "Dashboard"/);
  assert.match(page, /Workspace snapshot/);
  assert.match(page, /Next follow-ups/);
  assert.match(page, /Admin workspace/);
  assert.match(logic, /\/api\/admin\/\$\{screen\}/);
});

test("admin routes share headers, record framing, and contextual empty states", () => {
  const page = require("fs").readFileSync("src/screens/admin/page.tsx", "utf8");
  const css = require("fs").readFileSync("src/screens/admin/admin.css", "utf8");
  assert.match(page, /function AdminPageHeader/);
  assert.match(page, /function AdminEmptyState/);
  assert.match(page, /ADMIN_EMPTY_COPY/);
  assert.match(page, /Workspace records/);
  assert.match(css, /\.admin-data-card/);
  assert.match(css, /\.admin-heading-actions/);
});

test("specialized admin managers retain their endpoints while exposing phase-two interaction framing", () => {
  const users = require("fs").readFileSync("src/screens/admin/user-management.tsx", "utf8");
  const products = require("fs").readFileSync("src/screens/admin/product-stage-manager.tsx", "utf8");
  const assignment = require("fs").readFileSync("src/screens/admin/assignment-rule-manager.tsx", "utf8");
  const integrations = require("fs").readFileSync("src/screens/admin/integration-manager.tsx", "utf8");
  const dropdowns = require("fs").readFileSync("src/screens/admin/dropdown-management.tsx", "utf8");
  const css = require("fs").readFileSync("src/screens/admin/admin.css", "utf8");
  assert.match(users, /user-management-summary/);
  assert.match(products, /product-option-manager/);
  assert.match(assignment, /management-assignment/);
  assert.match(integrations, /management-integrations/);
  assert.match(dropdowns, /management-dropdowns/);
  assert.match(css, /\.user-management-summary/);
  assert.match(css, /\.management-dropdowns/);
  assert.match(users, /\/api\/users/);
  assert.match(products, /\/api\/products/);
});

test("read-only admin pages use their existing data with dedicated information layouts", () => {
  const page = require("fs").readFileSync("src/screens/admin/page.tsx", "utf8");
  const css = require("fs").readFileSync("src/screens/admin/admin.css", "utf8");
  assert.match(page, /function AdminInformation/);
  for (const screen of ["templates", "audit", "process-flow", "database-status"]) assert.match(page, new RegExp(`screen === "${screen}"`));
  assert.match(page, /Available templates/);
  assert.match(page, /Recent activity/);
  assert.match(page, /Lifecycle steps/);
  assert.match(page, /Connection details/);
  assert.match(css, /\.admin-process-flow/);
  assert.match(css, /\.admin-information-card/);
});

test("Admin Panel groups existing workspace controls under a configuration overview", () => {
  const page = require("fs").readFileSync("src/screens/admin/page.tsx", "utf8");
  const css = require("fs").readFileSync("src/screens/admin/admin.css", "utf8");
  assert.match(page, /function AdminPanelOverview/);
  assert.match(page, /People & access/);
  assert.match(page, /Catalog & workflow/);
  assert.match(page, /Lead configuration/);
  assert.match(page, /admin-panel-page/);
  assert.match(css, /\.admin-panel-overview/);
  assert.match(css, /\.admin-panel-page/);
  assert.match(page, /Product catalog/);
  assert.match(page, /LeadFieldManager/);
});

test("member management keeps role and access editing in one dialog", () => {
  const page = require("fs").readFileSync("src/screens/admin/page.tsx", "utf8");
  const css = require("fs").readFileSync("src/screens/admin/admin.css", "utf8");
  assert.match(page, /function MemberAccessDialog/);
  assert.match(page, /admin-member-role-editor/);
  assert.match(page, /submitMemberRole/);
  assert.doesNotMatch(page, /admin-role-quick-edit/);
  assert.match(css, /\.admin-member-role-editor/);
  assert.doesNotMatch(css, /\.admin-role-quick-edit/);
});

test("admin panel renders and refreshes the complete department list", () => {
  const page = require("fs").readFileSync("src/screens/admin/page.tsx", "utf8");
  const logic = require("fs").readFileSync("src/screens/admin/function.tsx", "utf8");
  assert.match(page, /Departments/);
  assert.match(page, /view\.departments\.map/);
  assert.match(page, /departmentError/);
  assert.match(logic, /\/api\/departments/);
  assert.match(logic, /await loadDepartments\(\)/);
});

test("admin import-export exposes the authorized bulk lead uploader", () => {
  const source = require("fs").readFileSync("src/screens/admin/page.tsx", "utf8");
  const leadsSource = require("fs").readFileSync("src/screens/leads/function.tsx", "utf8");
  assert.match(source, /screen === "import-export"/);
  assert.match(source, /leads\.import/);
  assert.match(source, /\/leads\?import=1/);
  assert.match(leadsSource, /searchParams\.get\("import"\) === "1"/);
});
