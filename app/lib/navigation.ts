import type { AppRole } from "@/app/lib/roles";

export type DashboardNavItem = {
  label: string;
  href: string;
  roles?: AppRole[];
};

const commonNavigation: DashboardNavItem[] = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Leads", href: "/dashboard/leads" },
];

const roleNavigation: DashboardNavItem[] = [
  { label: "Admin overview", href: "/dashboard/admin", roles: ["admin"] },
  { label: "Users", href: "/dashboard/users", roles: ["admin"] },
  { label: "Roles & permissions", href: "/dashboard/roles", roles: ["admin"] },
  { label: "Lead configuration", href: "/dashboard/lead-settings", roles: ["admin"] },
  { label: "Settings", href: "/dashboard/settings", roles: ["admin"] },

  { label: "Sales overview", href: "/dashboard/sales-manager", roles: ["sales_manager"] },
  { label: "Deals", href: "/dashboard/deals", roles: ["sales_manager"] },
  { label: "Products", href: "/dashboard/products", roles: ["sales_executive"] },
  { label: "Sales team", href: "/dashboard/sales-team", roles: ["sales_manager"] },
  { label: "Sales reports", href: "/dashboard/sales-reports", roles: ["sales_manager"] },
  { label: "My sales workspace", href: "/dashboard/sales-executive", roles: ["sales_executive"] },
  { label: "Upcoming follow-ups", href: "/dashboard/upcoming-follow-ups", roles: ["sales_executive"] },

  { label: "My clients", href: "/dashboard/consultant", roles: ["consultant"] },
  { label: "Appointments", href: "/dashboard/appointments", roles: ["consultant"] },

  { label: "Marketing overview", href: "/dashboard/marketing-manager", roles: ["marketing_manager"] },
  { label: "Campaigns", href: "/dashboard/campaigns", roles: ["marketing_manager", "marketing_executive"] },
  { label: "Marketing team", href: "/dashboard/marketing-team", roles: ["marketing_manager"] },
  { label: "Marketing reports", href: "/dashboard/marketing-reports", roles: ["marketing_manager"] },
  { label: "My marketing workspace", href: "/dashboard/marketing-executive", roles: ["marketing_executive"] },

  {
    label: "My tasks",
    href: "/dashboard/tasks",
    roles: ["sales_executive", "consultant", "marketing_executive"],
  },
];

export function getDashboardNavigation(roles: AppRole[]) {
  return [
    ...commonNavigation,
    ...roleNavigation.filter((item) =>
      item.roles?.some((role) => roles.includes(role)),
    ),
  ];
}
