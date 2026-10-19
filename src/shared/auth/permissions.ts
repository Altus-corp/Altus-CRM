import { useAuth } from "./auth";

export const CAPABILITIES = {
  "leads.view": ["Owner", "Admin", "Sales", "Viewer"],
  "leads.edit": ["Owner", "Admin", "Sales"],
  "leads.call": ["Owner", "Admin", "Sales"],
  "leads.permission": ["Owner", "Admin"],
  "leads.assign": ["Owner", "Admin"],
  "teams.manage": ["Owner", "Admin"],
  "leads.export": ["Owner", "Admin"],
  "leads.import": ["Owner", "Admin", "Sales"],
  "leads.delete": ["Owner", "Admin"],
  "settings.view": ["Owner", "Admin"],
  "users.manage": ["Owner", "Admin"],
  "users.reset_password": ["Owner", "Admin"],
  "nav.admin": ["Owner", "Admin"],
  "masters.view": ["Owner", "Admin"],
  "masters.edit": ["Owner", "Admin"],
  "targets.manage": ["Owner", "Admin"],
  "workspace.manage": ["Owner", "Admin"],
  "employees.manage": ["Owner", "Admin"],
  "accounts.view": ["Owner", "Admin", "Sales", "Viewer"],
  "accounts.create": ["Owner", "Admin", "Sales"],
  "accounts.edit": ["Owner", "Admin", "Sales"],
  "accounts.delete": ["Owner", "Admin"],
  "accounts.export": ["Owner", "Admin"],
  "contacts.view": ["Owner", "Admin", "Sales", "Viewer"],
  "contacts.create": ["Owner", "Admin", "Sales"],
  "contacts.edit": ["Owner", "Admin", "Sales"],
  "contacts.delete": ["Owner", "Admin"],
  "contacts.export": ["Owner", "Admin"],
} as const;

export type Capability = keyof typeof CAPABILITIES;
export type Role = "Owner" | "Admin" | "Sales" | "Viewer";

export function displayRole(role: string | undefined) {
  return role === "Super Admin" ? "Owner" : role || "Viewer";
}

export function hasCapability(role: string | undefined, capability: Capability, overrides: readonly string[] = []) {
  const normalizedRole = String(role || "").trim().toLowerCase();
  const canonicalRole = normalizedRole === "super admin" ? "Owner" : normalizedRole ? normalizedRole[0].toUpperCase() + normalizedRole.slice(1) : "";
  return (CAPABILITIES[capability] as readonly string[]).includes(canonicalRole) || overrides.includes(capability);
}

export function canManageRole(actorRole: string | undefined, targetRole: string) {
  const actor = actorRole === "Super Admin" ? "Owner" : actorRole;
  return ["Sales", "Viewer"].includes(targetRole) ? ["Owner", "Admin"].includes(actor || "") : targetRole === "Admin" ? actor === "Owner" : false;
}

export function usePermission(capability: Capability) {
  const { user } = useAuth();
  return hasCapability(user?.role, capability, user?.capability_overrides || []);
}
