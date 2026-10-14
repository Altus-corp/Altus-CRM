const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");

const shell = () => fs.readFileSync("src/shared/layout/app-shell.tsx", "utf8");

test("shell includes debounced keyboard search states and lead navigation", () => {
  const source = shell();
  assert.match(source, /setTimeout\(.*250/);
  assert.match(source, /ArrowDown/);
  assert.match(source, /ArrowUp/);
  assert.match(source, /event\.key === "Enter"/);
  assert.match(source, /event\.key === "Escape"/);
  assert.match(source, /\/api\/leads\?search=/);
  assert.match(source, /slice\(0, 8\)/);
  assert.match(source, /\/leads\?open=/);
  assert.match(source, /Search unavailable/);
});

test("shell keeps role-gated new lead, theme, logout, master sidebar, and admin navigation", () => {
  const source = shell();
  assert.match(source, /usePermission\("leads\.edit"\)/);
  assert.match(source, /\{canCreateLead &&/);
  assert.match(source, /navigate\("\/leads\?new=1"\)/);
  assert.match(source, /toggleTheme/);
  assert.match(source, /signOut\(logout, navigate\)/);
  assert.match(source, /"shell sidebar-shell admin-shell"/);
  assert.match(source, /<MasterSidebar currentHref=\{currentHref\} showAdmin=\{showAdminNav\}/);
  assert.match(source, /Lead Master/);
  assert.match(source, /Product Master/);
  assert.match(source, /My Master/);
  assert.doesNotMatch(source, /New Leads/);
  assert.doesNotMatch(source, /Permission to Call/);
  assert.match(source, /const isAdminRole = user\?\.role\?\.trim\(\)\.toLowerCase\(\) === "admin"/);
  assert.match(source, /hideMasterNavigation=\{isAdminRole \|\| location\.pathname\.startsWith\("\/admin\/"\)\}/);
  assert.match(source, /\{showAdmin && <div className="master-admin-navigation">\{adminNavbar\}<\/div>\}/);
  assert.match(source, /<GlobalSearch compact \/>/);
  assert.doesNotMatch(source, /className="crumb"/);
  assert.doesNotMatch(source, /showAdmin=\{false\} responsive/);
  assert.doesNotMatch(source, /className="top-navigation"/);
  assert.doesNotMatch(source, /Collapse navigation/);
});
