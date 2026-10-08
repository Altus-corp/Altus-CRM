"use strict";

const CAPABILITIES = Object.freeze({
  "leads.view": Object.freeze(["Owner", "Admin", "Sales", "Viewer"]),
  "leads.edit": Object.freeze(["Owner", "Admin", "Sales"]),
  "leads.assign": Object.freeze(["Owner", "Admin"]),
  "leads.export": Object.freeze(["Owner", "Admin"]),
  "settings.view": Object.freeze(["Owner", "Admin"]),
  "users.manage": Object.freeze(["Owner", "Admin"]),
  "users.reset_password": Object.freeze(["Owner"]),
  "nav.admin": Object.freeze(["Owner", "Admin"]),
  "masters.view": Object.freeze(["Owner", "Admin"]),
  "masters.edit": Object.freeze(["Owner", "Admin"]),
  "targets.manage": Object.freeze(["Owner", "Admin"]),
  "workspace.manage": Object.freeze(["Owner", "Admin"]),
  "employees.manage": Object.freeze(["Owner", "Admin"]),
});

function hasCapability(role, capability) {
  return Boolean(CAPABILITIES[capability]?.includes(role === "Super Admin" ? "Owner" : role));
}

function requireCapability(capability, user) {
  return hasCapability(user?.role, capability);
}

function canManageRole(actorRole, targetRole) {
  const actor = actorRole === "Super Admin" ? "Owner" : actorRole;
  return ["Sales", "Viewer"].includes(targetRole) ? ["Owner", "Admin"].includes(actor) : targetRole === "Admin" ? actor === "Owner" : false;
}

module.exports = { CAPABILITIES, hasCapability, requireCapability, canManageRole };
