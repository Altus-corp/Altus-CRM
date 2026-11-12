import { isAmbassadorWorkspace, type AppRole } from "@/app/lib/roles";

export type DashboardNavItem = {
  label: string;
  href: string;
  roles?: AppRole[];
  children?: { label: string; href: string }[];
};

const commonNavigation: DashboardNavItem[] = [
  { label: "Dashboard", href: "/dashboard" },
];

const roleNavigation: DashboardNavItem[] = [
  // Keep the primary CRM workflow in one consistent order for every role.
  { label: "Reports", href: "/dashboard/reports", roles: ["admin"] },
  {
    label: "Leads",
    href: "/dashboard/leads",
    children: [
      { label: "Leads Master", href: "/dashboard/leads" },
      { label: "Team Leads", href: "/dashboard/leads?team=1" },
    ],
  },
  {
    label: "Do Not Call",
    href: "/dashboard/dnd-master",
    roles: ["admin", "sales_manager", "sales_executive", "consultant"],
    children: [
      { label: "Do Not Call Master", href: "/dashboard/dnd-master" },
      { label: "Old Graduate", href: "/dashboard/old-graduate-master" },
      { label: "Abandoned", href: "/dashboard/dnd-master?type=abandoned" },
    ],
  },
  { label: "Products", href: "/dashboard/products", roles: ["admin", "sales_executive", "sales_manager"] },
  { label: "My Ambassador", href: "/dashboard/my-ambassador", roles: ["sales_executive"] },
  {
    label: "Ambassador",
    href: "/dashboard/my-ambassador",
    roles: ["admin", "sales_manager"],
    children: [
      { label: "All Ambassadors", href: "/dashboard/my-ambassador" },
      { label: "Pre Sales", href: "/dashboard/my-ambassador?stage=pre-sales" },
      { label: "Onboarding Ambassador", href: "/dashboard/my-ambassador?stage=onboarding-ambassador" },
      { label: "Senior Ambassadors", href: "/dashboard/senior-ambassadors" },
    ],
  },
  { label: "Admin overview", href: "/dashboard/admin", roles: ["admin"] },
  { label: "Users", href: "/dashboard/users", roles: ["admin"] },
  { label: "Team", href: "/dashboard/team", roles: ["admin"] },
  { label: "Roles & permissions", href: "/dashboard/roles", roles: ["admin"] },
  { label: "Lead configuration", href: "/dashboard/lead-settings", roles: ["admin"] },

  // Role-specific tools follow the common CRM workflow above.
  { label: "Deals", href: "/dashboard/deals", roles: ["sales_manager"] },
  { label: "My Team", href: "/dashboard/sales-team", roles: ["sales_manager"] },
  { label: "Sales reports", href: "/dashboard/sales-reports", roles: ["sales_manager"] },
  { label: "Upcoming follow-ups", href: "/dashboard/upcoming-follow-ups", roles: ["sales_executive"] },

  { label: "My clients", href: "/dashboard/consultant", roles: ["consultant"] },
  { label: "Appointments", href: "/dashboard/appointments", roles: ["consultant"] },

  { label: "Marketing overview", href: "/dashboard/marketing-manager", roles: ["marketing_manager"] },
  { label: "Campaigns", href: "/dashboard/campaigns", roles: ["marketing_manager", "marketing_executive"] },
  { label: "Marketing team", href: "/dashboard/marketing-team", roles: ["marketing_manager"] },
  { label: "Marketing reports", href: "/dashboard/marketing-reports", roles: ["marketing_manager"] },
  { label: "My marketing workspace", href: "/dashboard/marketing-executive", roles: ["marketing_executive"] },

  { label: "My tasks", href: "/dashboard/tasks", roles: ["consultant", "marketing_executive"] },
];

export function getDashboardNavigation(roles: AppRole[]) {
  if (isAmbassadorWorkspace(roles)) return [
    { label: "Dashboard", href: "/dashboard" },
    { label: "Leads", href: "/dashboard/leads" },
    { label: "Do Not Call", href: "/dashboard/dnd-master" },
    {
      label: "My Ambassador",
      href: "/dashboard/senior-ambassadors",
      children: [
        { label: "My Ambassadors", href: "/dashboard/senior-ambassadors" },
        { label: "Ambassador Leads", href: "/dashboard/ambassador-leads" },
      ],
    },
  ];
  return [
    ...commonNavigation,
    ...roleNavigation.filter((item) =>
      !item.roles || item.roles.some((role) => roles.includes(role)),
    ),
  ].map((item) =>
    item.href === "/dashboard/my-ambassador" && item.label === "Ambassador" && !roles.includes("admin")
      ? {
          ...item,
          children: item.children?.filter(
            (child) => child.href !== "/dashboard/senior-ambassadors",
          ),
        }
      : item,
  );
}
