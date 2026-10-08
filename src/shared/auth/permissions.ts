import { useAuth } from "./auth";

export const CAPABILITIES = {
  "leads.view": ["Owner", "Admin", "Sales", "Viewer"],
  "leads.edit": ["Owner", "Admin", "Sales"],
  "leads.assign": ["Owner", "Admin"],
  "leads.export": ["Owner", "Admin"],
  "settings.view": ["Owner", "Admin"],
  "users.manage": ["Owner", "Admin"],
  "users.reset_password": ["Owner"],
  "nav.admin": ["Owner", "Admin"],
  "masters.view": ["Owner", "Admin"],
  "masters.edit": ["Owner", "Admin"],
  "targets.manage": ["Owner", "Admin"],
  "workspace.manage": ["Owner", "Admin"],
  "employees.manage": ["Owner", "Admin"],
} as const;

export type Capability = keyof typeof CAPABILITIES;
export type Role = "Owner" | "Admin" | "Sales" | "Viewer";

export function displayRole(role: string | undefined) {
  return role === "Super Admin" ? "Owner" : role || "Viewer";
}

export function hasCapability(role: string | undefined, capability: Capability) {
  return (CAPABILITIES[capability] as readonly string[]).includes(role === "Super Admin" ? "Owner" : role || "");
}

export function canManageRole(actorRole: string | undefined, targetRole: string) {
  const actor = actorRole === "Super Admin" ? "Owner" : actorRole;
  return ["Sales", "Viewer"].includes(targetRole) ? ["Owner", "Admin"].includes(actor || "") : targetRole === "Admin" ? actor === "Owner" : false;
}

export function usePermission(capability: Capability) {
  const { user } = useAuth();
  return hasCapability(user?.role, capability);
}
