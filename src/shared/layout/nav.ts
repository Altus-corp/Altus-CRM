import React from "react";
import { NavLink } from "react-router-dom";

export const NAV_ITEMS = [
  ["/leads", "Leads"],
  ["/marketing", "Marketing"],
  ["/reports", "Reports"],
  ["/quotes-invoicing", "Quote & Invoicing"],
  ["/accounts-contacts", "Accounts & Contacts"],
  ["/tasks-activity", "Tasks & Activity"],
] as const;

export type ExtendedNavItem = {
  to: string;
  label: string;
  countKey?: string;
  navNo?: string;
  placeholder?: boolean;
};

export type ExtendedNavGroup = {
  label: string;
  items: readonly ExtendedNavItem[];
  collapsible?: boolean;
};

export const ADMIN_NAV_GROUPS = [
  {
    label: "Admin",
    collapsible: true,
    items: [
      { to: "/leads?view=new_leads", label: "Leads", countKey: "new_leads" },
      { to: "/admin/assignment", label: "Assignment", placeholder: true },
      { to: "/reports", label: "Reports" },
      { to: "/admin/panel", label: "Admin Panel", placeholder: true },
      { to: "/admin/templates", label: "Templates", placeholder: true },
      { to: "/admin/import-export", label: "Import / Export", placeholder: true },
      { to: "/admin/integrations", label: "Integrations", placeholder: true },
      { to: "/admin/audit", label: "Audit Log", placeholder: true },
      { to: "/admin/process-flow", label: "Process Flow", placeholder: true },
    ],
  },
] as const satisfies readonly ExtendedNavGroup[];

export const CORE_NAV_GROUP = { label: "WORKSPACE", items: NAV_ITEMS.map(([to, label]) => ({ to, label })) } as const;
export const ADMIN_NAV_ITEMS: ExtendedNavItem[] = ADMIN_NAV_GROUPS.reduce<ExtendedNavItem[]>((items, group) => items.concat(Array.from(group.items as readonly ExtendedNavItem[])), []);

export function navLabelForHref(href: string) {
  return [...ADMIN_NAV_ITEMS, ...NAV_ITEMS.map(([to, label]) => ({ to, label }))].find((item) => item.to === href)?.label;
}

function normalizeHref(href: string) {
  const [path, query = ""] = href.split("?");
  return `${path}?${query}`;
}

function activeHref(currentHref: string | undefined, item: ExtendedNavItem, claimed: Set<string>) {
  const target = normalizeHref(item.to);
  if (!currentHref || normalizeHref(currentHref) !== target || claimed.has(target)) return false;
  claimed.add(target);
  return true;
}

function navLink(
  item: ExtendedNavItem,
  collapsed: boolean,
  counts: Record<string, number | null>,
  countsLoading: boolean,
  active: boolean,
) {
  const badge = item.countKey && (counts[item.countKey] != null || countsLoading)
    ? React.createElement("span", { className: "nav-count" }, counts[item.countKey] ?? "…")
    : null;
  const children = [
    React.createElement("span", { className: "nav-label" }, collapsed ? item.label.charAt(0) : item.label),
    !collapsed && badge,
  ].filter(Boolean);
  return React.createElement(
    NavLink,
    {
      key: item.to,
      to: item.to,
      end: item.to === "/leads",
      title: collapsed ? item.label : undefined,
      "aria-label": item.label,
      className: active ? "nav-link active" : "nav-link",
    },
    children,
  );
}

export function Navbar({
  collapsed = false,
  showAdmin = false,
  counts = {},
  countsLoading = false,
  currentHref,
  collapsedGroups = {},
  toggleNavGroup = () => undefined,
}: {
  collapsed?: boolean;
  showAdmin?: boolean;
  counts?: Record<string, number | null>;
  countsLoading?: boolean;
  currentHref?: string;
  collapsedGroups?: Record<string, boolean>;
  toggleNavGroup?: (label: string) => void;
} = {}) {
  const claimed = new Set<string>();
  const adminGroups = showAdmin
    ? React.createElement(
        "div",
        { className: "nav-admin-groups", key: "admin-groups" },
        ADMIN_NAV_GROUPS.map((group) =>
          React.createElement("section", { className: "nav-group", key: group.label },
            !collapsed && group.label && React.createElement("h2", { className: "nav-group-label" },
              React.createElement("button", {
                type: "button",
                className: "nav-group-toggle",
                "aria-expanded": !collapsedGroups[group.label],
                "aria-controls": `nav-group-${group.label.replace(/\s+/g, "-").toLowerCase()}`,
                onClick: () => toggleNavGroup(group.label),
              }, group.label),
            ),
            (!group.collapsible || !collapsedGroups[group.label] || collapsed) && React.createElement("div", {
              id: `nav-group-${group.label.replace(/\s+/g, "-").toLowerCase()}`,
              className: "nav-group-items",
            }, ...group.items.map((item) => navLink(item, collapsed, counts, countsLoading, activeHref(currentHref, item, claimed)))),
          ),
        ),
      )
    : null;

  return React.createElement(
    "nav",
    { className: collapsed ? "navbar-collapsed" : "", "aria-label": "Primary navigation" },
    adminGroups,
    showAdmin && React.createElement("div", { className: "nav-workspace-divider", key: "workspace-divider" }),
    React.createElement(
      "section",
      { className: "nav-core-group", key: "core" },
      showAdmin && !collapsed && React.createElement("h2", { className: "nav-group-label" }, "WORKSPACE"),
      ...NAV_ITEMS.map(([to, label]) => navLink({ to, label }, collapsed, counts, countsLoading, activeHref(currentHref, { to, label }, claimed))),
    ),
  );
}
