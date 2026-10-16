export const TOPBAR_MODULES = [
  { id: "/leads", label: "Leads", path: "/leads" },
  { id: "/marketing", label: "Marketing", path: "/marketing" },
  { id: "/reports", label: "Reports", path: "/reports" },
  { id: "/quotes-invoicing", label: "Quote & Invoicing", path: "/quotes-invoicing" },
  { id: "/accounts-contacts", label: "Accounts & Contacts", path: "/accounts-contacts" },
  { id: "/tasks-activity", label: "Tasks & Activity", path: "/tasks-activity" },
] as const;

export const ADMIN_ONLY_MODULE_PATHS = ["/marketing", "/quotes-invoicing", "/accounts-contacts", "/tasks-activity"] as const;

export function isAdminOnlyModulePath(pathname: string) {
  return ADMIN_ONLY_MODULE_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export function canAccessTopbarModule(pathname: string, canManageNavigation: boolean) {
  return canManageNavigation || !isAdminOnlyModulePath(pathname);
}

export function topbarModuleRedirect(pathname: string, canManageNavigation: boolean) {
  return canAccessTopbarModule(pathname, canManageNavigation) ? null : "/leads";
}

export function visibleTopbarModules(canManageNavigation: boolean) {
  return TOPBAR_MODULES.filter((item) => canAccessTopbarModule(item.path, canManageNavigation));
}
