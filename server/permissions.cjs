"use strict";

const CAPABILITIES = Object.freeze({
  "leads.view": Object.freeze(["Owner", "Admin", "Sales", "Viewer"]),
  "leads.edit": Object.freeze(["Owner", "Admin", "Sales"]),
  "leads.call": Object.freeze(["Owner", "Admin", "Sales"]),
  "leads.permission": Object.freeze(["Owner", "Admin"]),
  "leads.assign": Object.freeze(["Owner", "Admin"]),
  "leads.export": Object.freeze(["Owner", "Admin"]),
  "leads.import": Object.freeze(["Owner", "Admin", "Sales"]),
  "settings.view": Object.freeze(["Owner", "Admin"]),
  "users.manage": Object.freeze(["Owner", "Admin"]),
  "users.reset_password": Object.freeze(["Owner"]),
  "nav.admin": Object.freeze(["Owner", "Admin"]),
  "masters.view": Object.freeze(["Owner", "Admin"]),
  "masters.edit": Object.freeze(["Owner", "Admin"]),
  "targets.manage": Object.freeze(["Owner", "Admin"]),
  "workspace.manage": Object.freeze(["Owner", "Admin"]),
  "employees.manage": Object.freeze(["Owner", "Admin"]),
  "accounts.view": Object.freeze(["Owner", "Admin", "Sales", "Viewer"]),
  "accounts.create": Object.freeze(["Owner", "Admin", "Sales"]),
  "accounts.edit": Object.freeze(["Owner", "Admin", "Sales"]),
  "accounts.delete": Object.freeze(["Owner", "Admin"]),
  "accounts.export": Object.freeze(["Owner", "Admin"]),
  "contacts.view": Object.freeze(["Owner", "Admin", "Sales", "Viewer"]),
  "contacts.create": Object.freeze(["Owner", "Admin", "Sales"]),
  "contacts.edit": Object.freeze(["Owner", "Admin", "Sales"]),
  "contacts.delete": Object.freeze(["Owner", "Admin"]),
  "contacts.export": Object.freeze(["Owner", "Admin"]),
});

function hasCapability(role, capability) {
  const normalizedRole = String(role || "").trim().toLowerCase();
  const canonicalRole = normalizedRole === "super admin" ? "Owner" : normalizedRole ? normalizedRole[0].toUpperCase() + normalizedRole.slice(1) : "";
  return Boolean(CAPABILITIES[capability]?.includes(canonicalRole));
}

function requireCapability(capability, user) {
  return hasCapability(user?.role, capability);
}

function canManageRole(actorRole, targetRole) {
  const actor = actorRole === "Super Admin" ? "Owner" : actorRole;
  return ["Sales", "Viewer"].includes(targetRole) ? ["Owner", "Admin"].includes(actor) : targetRole === "Admin" ? actor === "Owner" : false;
}

module.exports = { CAPABILITIES, hasCapability, requireCapability, canManageRole };
