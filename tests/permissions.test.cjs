const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const { CAPABILITIES, hasCapability } = require("../server/permissions.cjs");

test("capability map covers every role and capability", () => {
  const expected = {
    Owner: ["leads.view", "leads.edit", "leads.call", "leads.permission", "leads.assign", "leads.export", "leads.import", "settings.view", "users.manage", "users.reset_password", "nav.admin", "masters.view", "masters.edit", "targets.manage", "workspace.manage", "employees.manage", "accounts.view", "accounts.create", "accounts.edit", "accounts.delete", "accounts.export", "contacts.view", "contacts.create", "contacts.edit", "contacts.delete", "contacts.export"],
    Admin: ["leads.view", "leads.edit", "leads.call", "leads.permission", "leads.assign", "leads.export", "leads.import", "settings.view", "users.manage", "users.reset_password", "nav.admin", "masters.view", "masters.edit", "targets.manage", "workspace.manage", "employees.manage", "accounts.view", "accounts.create", "accounts.edit", "accounts.delete", "accounts.export", "contacts.view", "contacts.create", "contacts.edit", "contacts.delete", "contacts.export"],
    Sales: ["leads.view", "leads.edit", "leads.call", "leads.import", "accounts.view", "accounts.create", "accounts.edit", "contacts.view", "contacts.create", "contacts.edit"],
    Viewer: ["leads.view", "accounts.view", "contacts.view"],
  };
  for (const role of Object.keys(expected)) for (const capability of Object.keys(CAPABILITIES)) assert.equal(hasCapability(role, capability), expected[role].includes(capability), `${role}/${capability}`);
  for (const capability of Object.keys(CAPABILITIES)) assert.equal(hasCapability("Unknown", capability), false, `Unknown/${capability}`);
});

test("client and server capability maps stay mirrored", () => {
  const source = fs.readFileSync("src/shared/auth/permissions.ts", "utf8");
  const client = Object.fromEntries([...source.matchAll(/^\s*"([^\"]+)": \[([^\]]*)\],?$/gm)].map((match) => [match[1], [...match[2].matchAll(/"([^\"]+)"/g)].map((role) => role[1])]));
  assert.deepEqual(client, Object.fromEntries(Object.entries(CAPABILITIES).map(([key, roles]) => [key, [...roles]])));
});

test("bulk upload UI is capability-gated", () => {
  const source = fs.readFileSync("src/screens/leads/page.tsx", "utf8");
  const logic = fs.readFileSync("src/screens/leads/function.tsx", "utf8");
  assert.match(source, /disabled={!screen\.canImport}/);
  assert.match(source, /Bulk upload leads/);
  assert.match(source, /screen\.bulkImportLabel/);
  assert.match(logic, /Not available for your role/);
});

test("client bulk-upload capability follows lead editors", () => {
  const source = fs.readFileSync("src/shared/auth/permissions.ts", "utf8");
  const roles = [...source.matchAll(/"leads\.import": \[([^\]]+)\]/g)][0]?.[1].match(/"([^"]+)"/g)?.map((role) => role.slice(1, -1)) || [];
  assert.equal(roles.includes("Owner"), true);
  assert.equal(roles.includes("Admin"), true);
  assert.equal(roles.includes("Sales"), true);
});
