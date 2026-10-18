const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");

const shell = () => fs.readFileSync("src/shared/layout/app-shell.tsx", "utf8");
const shellStyles = () => fs.readFileSync("src/shared/layout/app-shell.css", "utf8");

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

test("quick-navigation chevron is rendered independently of the expanded search state", () => {
  const source = shell();
  assert.match(source, /expanded \? "navbar-search is-expanded" : "navbar-search"/);
  assert.match(source, /className="navbar-action-button topbar-module-toggle"/);
  assert.match(source, /aria-controls="topbar-module-links"/);
});

test("shell exposes exactly one responsive brand target", () => {
  const source = shell();
  const styles = shellStyles();
  assert.match(source, /className="topbar-logo sidebar-brand-logo"/);
  assert.match(source, /className="topbar-logo topbar-brand-logo"/);
  assert.match(styles, /\.master-sidebar-brand\s*\{[\s\S]*?height:\s*var\(--topbar-h\);/);
  assert.match(styles, /\.topbar-brand-logo\s*\{\s*display:\s*none;/);
  assert.match(styles, /@media \(max-width: 640px\) \{ \.topbar-brand-logo \{ display: inline-flex; \}/);
  assert.match(styles, /\.master-sidebar-brand \{ display: none; \}/);
});

test("shell keeps role-gated new lead, theme, logout, master sidebar, and admin navigation", () => {
  const source = shell();
  assert.match(source, /usePermission\("leads\.edit"\)/);
  assert.match(source, /\{canCreateLead &&/);
  assert.match(source, /LeadNavbarActionsContext/);
  assert.match(source, /openNewLead/);
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
  assert.match(source, /<GlobalSearch \/>/);
  assert.doesNotMatch(source, /className="crumb"/);
  assert.doesNotMatch(source, /showAdmin=\{false\} responsive/);
  assert.doesNotMatch(source, /className="top-navigation"/);
  assert.doesNotMatch(source, /Collapse navigation/);
});

test("account menu groups identity, account actions, and sign out without changing its controls", () => {
  const source = shell();
  const styles = shellStyles();
  assert.match(source, /account-menu-actions/);
  assert.match(source, /account-menu-signout/);
  assert.match(source, /account-menu-role/);
  assert.match(source, /Theme: \{theme === "light"/);
  assert.match(source, /signOut\(logout, navigate\)/);
  assert.match(styles, /\.account-menu-signout button:hover/);
});
