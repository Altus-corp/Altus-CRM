const test = require("node:test");
const assert = require("node:assert/strict");

function links(node, result = []) {
  if (!node || typeof node !== "object") return result;
  if (node.props?.to) result.push(node);
  const children = node.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) links(child, result);
  return result;
}

function nodesOfType(node, type, result = []) {
  if (!node || typeof node !== "object") return result;
  if (node.type === type) result.push(node);
  const children = node.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) nodesOfType(child, type, result);
  return result;
}

test("Sales and Viewer topbar navigation is restricted to Leads and Reports", async () => {
  const { visibleTopbarModules } = await import("../src/shared/layout/nav-access.ts");
  const expected = ["Leads", "Reports"];
  for (const role of ["Sales", "Viewer"]) assert.deepEqual(visibleTopbarModules(false).map((item) => item.label), expected, role);
});

test("Owner and Admin topbar navigation includes all six modules", async () => {
  const { visibleTopbarModules } = await import("../src/shared/layout/nav-access.ts");
  assert.deepEqual(visibleTopbarModules(true).map((item) => item.label), ["Leads", "Marketing", "Reports", "Quote & Invoicing", "Accounts & Contacts", "Tasks & Activity"]);
});

test("loading uses the restricted topbar list and protected direct URLs redirect to Leads", async () => {
  const { topbarModuleRedirect, visibleTopbarModules } = await import("../src/shared/layout/nav-access.ts");
  assert.deepEqual(visibleTopbarModules(false).map((item) => item.label), ["Leads", "Reports"]);
  assert.equal(topbarModuleRedirect("/marketing", false), "/leads");
  assert.equal(topbarModuleRedirect("/accounts-contacts/456", false), "/leads");
  assert.equal(topbarModuleRedirect("/marketing-x", false), null);
  assert.equal(topbarModuleRedirect("/marketing", true), null);
});

test("Owner and Admin see admin groups plus the six core items, never Key Note", async () => {
  const { Navbar, NAV_ITEMS, ADMIN_NAV_GROUPS } = await import("../src/shared/layout/nav.ts");
  const expectedAdmin = ADMIN_NAV_GROUPS.flatMap((group) => group.items).map((item) => item.label);
  assert.equal(expectedAdmin.some((label) => /key note/i.test(label)), false);
  for (const role of ["Owner", "Admin"]) {
    assert.equal(links(Navbar({ showAdmin: true })).length, NAV_ITEMS.length + expectedAdmin.length, role);
    assert.equal(links(Navbar({ collapsed: true, showAdmin: true })).length, NAV_ITEMS.length + expectedAdmin.length, `collapsed ${role}`);
  }
  const adminHeaders = nodesOfType(Navbar({ showAdmin: true }), "h2");
  assert.deepEqual(adminHeaders.map((node) => {
    const child = node.props.children;
    return typeof child === "string" ? child : child.props.children;
  }), ["Admin", "WORKSPACE"]);
  assert.equal(nodesOfType(Navbar({ showAdmin: false }), "h2").length, 0);
});

test("only the first matching group item is active for an exact route and query", async () => {
  const { Navbar } = await import("../src/shared/layout/nav.ts");
  for (const currentHref of ["/reports", "/leads"]) {
    const active = links(Navbar({ showAdmin: true, currentHref })).filter((item) => item.props.className.includes("active"));
    assert.equal(active.length, 1, currentHref);
    if (currentHref === "/reports") assert.equal(active[0].props.to, "/reports");
    if (currentHref === "/leads") assert.equal(active[0].props.to, "/leads");
  }
});

test("module links retain prefix matching for nested detail routes", () => {
  const { matchPath } = require("react-router");
  assert.equal(Boolean(matchPath({ path: "/leads", end: false }, "/leads/123")), true);
  assert.equal(Boolean(matchPath({ path: "/accounts-contacts", end: false }, "/accounts-contacts/456")), true);
});
