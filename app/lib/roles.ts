export const APP_ROLES = [
  "admin",
  "sales_executive",
  "sales_manager",
  "consultant",
  "marketing_manager",
  "marketing_executive",
] as const;

export type AppRole = (typeof APP_ROLES)[number];

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Admin",
  sales_executive: "Sales Executive",
  sales_manager: "Sales Manager",
  consultant: "Consultant",
  marketing_manager: "Marketing Manager",
  marketing_executive: "Marketing Executive",
};
