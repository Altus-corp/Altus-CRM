const test = require("node:test");
const assert = require("node:assert/strict");
const { CAPABILITIES, hasCapability } = require("../server/permissions.cjs");

test("capability map covers every role and capability", () => {
  const expected = {
    Owner: ["leads.view", "leads.edit", "leads.assign", "leads.export", "settings.view", "users.manage", "users.reset_password", "nav.admin", "masters.view", "masters.edit", "targets.manage", "workspace.manage", "employees.manage"],
    Admin: ["leads.view", "leads.edit", "leads.assign", "leads.export", "settings.view", "users.manage", "nav.admin", "masters.view", "masters.edit", "targets.manage", "workspace.manage", "employees.manage"],
    Sales: ["leads.view", "leads.edit"],
    Viewer: ["leads.view"],
  };
  for (const role of Object.keys(expected)) for (const capability of Object.keys(CAPABILITIES)) assert.equal(hasCapability(role, capability), expected[role].includes(capability), `${role}/${capability}`);
  for (const capability of Object.keys(CAPABILITIES)) assert.equal(hasCapability("Unknown", capability), false, `Unknown/${capability}`);
});
