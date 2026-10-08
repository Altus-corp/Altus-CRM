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

test("Sales and Viewer see only six core items in both themes and collapsed mode", async () => {
  const { Navbar, NAV_ITEMS } = await import("../src/shared/layout/nav.ts");
  const expected = ["Leads", "Marketing", "Reports", "Quote & Invoicing", "Accounts & Contacts", "Tasks & Activity"];
  for (const role of ["Sales", "Viewer"]) for (const theme of ["light", "dark"]) {
    const expanded = links(Navbar({ showAdmin: false }));
    assert.equal(expanded.length, 6, `${role}/${theme}`);
    assert.deepEqual(expanded.map((item) => item.props["aria-label"]), expected, `${role}/${theme}`);
    const collapsed = links(Navbar({ collapsed: true, showAdmin: false }));
    assert.equal(collapsed.length, 6, `collapsed ${role}/${theme}`);
    assert.deepEqual(collapsed.map((item) => item.props["aria-label"]), expected, `collapsed ${role}/${theme}`);
  }
  assert.equal(NAV_ITEMS.length, 6);
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
