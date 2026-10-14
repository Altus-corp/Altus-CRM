import React from "react";
import { NavLink } from "react-router-dom";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

export const NAV_ITEMS = [
  ["/leads", "Leads"],
  ["/marketing", "Marketing"],
  ["/reports", "Reports"],
  ["/quotes-invoicing", "Quote & Invoicing"],
  ["/accounts-contacts", "Accounts & Contacts"],
  ["/tasks-activity", "Tasks & Activity"],
] as const;

const CORE_NAV_MENUS: Record<string, readonly { to: string; label: string }[]> = {
  "/leads": [
    { to: "/leads", label: "All Leads" },
    { to: "/leads?view=new_leads", label: "New Leads" },
    { to: "/leads?view=qualified", label: "Qualified Leads" },
    { to: "/leads?view=permission_granted", label: "Permission to Call" },
    { to: "/leads?view=calling_queue", label: "Calling Sheet" },
    { to: "/leads?view=daily_call_chart", label: "Daily Call Chart" },
    { to: "/leads?view=pre_pso", label: "Pre PSO" },
    { to: "/leads?view=during_pso", label: "During PSO" },
    { to: "/leads?view=attended", label: "PSO Attended" },
    { to: "/leads?view=registered", label: "PS Registration" },
    { to: "/leads?view=pre_ps", label: "Pre PS" },
    { to: "/leads?view=not_attended", label: "PSO Not Attended" },
    { to: "/leads?new=1", label: "Add New Lead" },
  ],
  "/marketing": [
    { to: "/marketing", label: "Marketing Overview" },
    { to: "/marketing?view=campaigns", label: "Campaigns" },
    { to: "/marketing?view=audiences", label: "Audiences" },
    { to: "/marketing?view=templates", label: "Templates" },
  ],
  "/reports": [
    { to: "/reports", label: "Reports Overview" },
    { to: "/reports?view=leads", label: "Lead Reports" },
    { to: "/reports?view=conversion", label: "Conversion Reports" },
    { to: "/reports?view=activity", label: "Activity Reports" },
  ],
  "/quotes-invoicing": [
    { to: "/quotes-invoicing", label: "Quotes Overview" },
    { to: "/quotes-invoicing?view=quotes", label: "Quotes" },
    { to: "/quotes-invoicing?view=invoices", label: "Invoices" },
    { to: "/quotes-invoicing?view=payments", label: "Payments" },
  ],
  "/accounts-contacts": [
    { to: "/accounts-contacts", label: "Accounts Overview" },
    { to: "/accounts-contacts?view=accounts", label: "Accounts" },
    { to: "/accounts-contacts?view=contacts", label: "Contacts" },
  ],
  "/tasks-activity": [
    { to: "/tasks-activity", label: "Tasks Overview" },
    { to: "/tasks-activity?view=tasks", label: "Tasks" },
    { to: "/tasks-activity?view=activity", label: "Activity" },
    { to: "/tasks-activity?view=completed", label: "Completed" },
  ],
};

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
      { to: "/admin/dropdowns", label: "Dropdown Management", placeholder: true },
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

function CoreNavItem({ item, active, onSelect }: { item: ExtendedNavItem; active: boolean; onSelect?: () => void }) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const menuItemRefs = useRef<Array<HTMLAnchorElement | null>>([]);

  useEffect(() => {
    if (!dropdownOpen) return undefined;
    const closeOutside = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setDropdownOpen(false);
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setDropdownOpen(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    requestAnimationFrame(() => menuItemRefs.current[0]?.focus());
    return () => {
      document.removeEventListener("mousedown", closeOutside);
      document.removeEventListener("keydown", closeEscape);
    };
  }, [dropdownOpen]);

  const menuItems = CORE_NAV_MENUS[item.to] ?? [{ to: item.to, label: item.label }];
  const menuId = `${item.to.slice(1).replace(/[^a-z0-9]+/gi, "-")}-nav-menu`;
  /* const legacyLeadsMenu = [
    { to: "/leads", label: "All Leads" },
    { to: "/leads?view=new_leads", label: "New Leads" },
    { to: "/leads?view=qualified", label: "Qualified Leads" },
    { to: "/leads?view=permission_granted", label: "Permission to Call" },
    { to: "/leads?view=calling_queue", label: "Calling Sheet" },
    { to: "/leads?view=daily_call_chart", label: "Daily Call Chart" },
    { to: "/leads?view=pre_pso", label: "Pre PSO" },
    { to: "/leads?view=during_pso", label: "During PSO" },
    { to: "/leads?view=attended", label: "PSO Attended" },
    { to: "/leads?view=registered", label: "PS Registration" },
    { to: "/leads?view=pre_ps", label: "Pre PS" },
    { to: "/leads?view=not_attended", label: "PSO Not Attended" },
    { to: "/leads?new=1", label: "＋ Add New Lead" },
  ];

  */

  const unifiedLeadLink = React.createElement(
    NavLink,
    {
      to: item.to,
      end: true,
      "aria-label": item.label,
      className: active ? "nav-link core-nav-link active" : "nav-link core-nav-link",
      onClick: onSelect,
    },
    React.createElement("span", { className: "nav-label" }, item.label),
    React.createElement(
      "button",
      {
        ref: toggleRef,
        type: "button",
        className: dropdownOpen ? "core-dropdown-toggle open" : "core-dropdown-toggle",
        "aria-label": `Toggle ${item.label} dropdown menu`,
        "aria-haspopup": "menu",
        "aria-expanded": dropdownOpen,
        "aria-controls": menuId,
        onClick: (event: React.MouseEvent) => {
          event.preventDefault();
          event.stopPropagation();
          setDropdownOpen((value) => !value);
        },
        onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => {
          if (["Enter", " ", "ArrowDown"].includes(event.key)) {
            event.preventDefault();
            event.stopPropagation();
            setDropdownOpen(true);
          }
        },
      },
      React.createElement(
        "svg",
        {
          className: "core-chevron-icon",
          viewBox: "0 0 12 12",
          width: "10",
          height: "10",
          fill: "none",
          stroke: "currentColor",
          strokeWidth: "2",
          strokeLinecap: "round",
          strokeLinejoin: "round",
        },
        React.createElement("path", { d: "M2.5 4.5L6 8L9.5 4.5" })
      )
    )
  );

  return React.createElement(
    "div",
    { ref: wrapRef, className: "core-nav-wrap" },
    unifiedLeadLink,
    dropdownOpen &&
      React.createElement(
        "div",
        {
          id: menuId,
          className: "core-dropdown-menu",
          role: "menu",
          "aria-label": `${item.label} dropdown menu`,
        },
        ...menuItems.map((menuItem, index) =>
          React.createElement(
            NavLink,
            {
              key: menuItem.to,
              ref: (element) => {
                menuItemRefs.current[index] = element;
              },
              to: menuItem.to,
              role: "menuitem",
              className: menuItem.to.includes("new=1") ? "core-dropdown-item core-action-item" : "core-dropdown-item",
              onClick: () => setDropdownOpen(false),
              onKeyDown: (event: React.KeyboardEvent<HTMLAnchorElement>) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  menuItemRefs.current[(index + 1) % menuItems.length]?.focus();
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  menuItemRefs.current[(index - 1 + menuItems.length) % menuItems.length]?.focus();
                }
                if (event.key === "Home") {
                  event.preventDefault();
                  menuItemRefs.current[0]?.focus();
                }
                if (event.key === "End") {
                  event.preventDefault();
                  menuItemRefs.current[menuItems.length - 1]?.focus();
                }
              },
            },
            menuItem.label
          )
        )
      )
  );
}


function ResponsiveCoreNav({ currentHref }: { currentHref?: string }) {
  const navRef = useRef<HTMLElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const moreItemRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const [visibleCount, setVisibleCount] = useState<number>(NAV_ITEMS.length);
  const [moreOpen, setMoreOpen] = useState(false);
  const items = NAV_ITEMS.map(([to, label]) => ({ to, label }));
  const activeIndex = items.findIndex((item) => normalizeHref(currentHref || "") === normalizeHref(item.to));
  const hiddenItems = items.slice(visibleCount);
  const hasActiveHiddenItem = activeIndex >= visibleCount && activeIndex >= 0;

  useLayoutEffect(() => {
    const nav = navRef.current;
    const measure = measureRef.current;
    if (!nav || !measure) return undefined;
    const recalculate = () => {
      const topbarNav = nav.closest("nav") || nav.parentElement;
      const available = (topbarNav?.clientWidth || nav.clientWidth) - 16;
      const links = Array.from(measure.querySelectorAll<HTMLElement>("[data-nav-measure]"));
      const widths = links.map((link) => link.getBoundingClientRect().width);
      const moreWidth = measure.querySelector<HTMLElement>("[data-more-measure]")?.getBoundingClientRect().width || 86;
      const styles = getComputedStyle(nav);
      const gap = Number.parseFloat(styles.columnGap || styles.gap || "4") || 4;
      let used = 0;
      let count = items.length;
      for (let index = 0; index < widths.length; index += 1) {
        const next = used + widths[index] + (index ? gap : 0);
        const allFit = index === widths.length - 1 && next <= available;
        const withMore = next + gap + moreWidth <= available;
        if (!allFit && !withMore) { count = index; break; }
        used = next;
      }
      setVisibleCount((value) => value === count ? value : count);
    };
    const recalculateAfterLayout = () => window.requestAnimationFrame(recalculate);
    recalculateAfterLayout();
    if (document.fonts?.ready) void document.fonts.ready.then(recalculate);
    const observer = new ResizeObserver(recalculate);
    observer.observe(nav);
    observer.observe(measure);
    window.addEventListener("resize", recalculateAfterLayout);
    return () => { observer.disconnect(); window.removeEventListener("resize", recalculateAfterLayout); };
  }, [items.length]);

  useEffect(() => {
    if (!moreOpen) return undefined;
    const closeOutside = (event: MouseEvent) => { if (!navRef.current?.contains(event.target as Node)) setMoreOpen(false); };
    const closeEscape = (event: KeyboardEvent) => { if (event.key === "Escape") { setMoreOpen(false); moreRef.current?.focus(); } };
    document.addEventListener("mousedown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    requestAnimationFrame(() => moreItemRefs.current[0]?.focus());
    return () => { document.removeEventListener("mousedown", closeOutside); document.removeEventListener("keydown", closeEscape); };
  }, [moreOpen]);

  function handleMoreKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (["Enter", " ", "ArrowDown"].includes(event.key)) { event.preventDefault(); setMoreOpen(true); }
  }
  function handleMoreItemKeyDown(event: React.KeyboardEvent<HTMLAnchorElement>, index: number) {
    if (event.key === "ArrowDown") { event.preventDefault(); moreItemRefs.current[(index + 1) % hiddenItems.length]?.focus(); }
    if (event.key === "ArrowUp") { event.preventDefault(); moreItemRefs.current[(index - 1 + hiddenItems.length) % hiddenItems.length]?.focus(); }
  }

  return React.createElement(
    React.Fragment,
    null,
    React.createElement(
      "div",
      { className: "nav-pill-container" },
      React.createElement(
        "section",
        { className: "nav-core-group responsive-nav-group", ref: navRef },
        ...items.slice(0, visibleCount).map((item) => React.createElement(CoreNavItem, { key: item.to, item, active: activeIndex === items.indexOf(item) })),
        hiddenItems.length > 0 && React.createElement(
          "div",
          { className: "more-nav-wrap" },
          React.createElement("button", { ref: moreRef, type: "button", className: hasActiveHiddenItem ? "more-nav-trigger active" : "more-nav-trigger", "aria-haspopup": "menu", "aria-expanded": moreOpen, onClick: () => setMoreOpen((value) => !value), onKeyDown: handleMoreKeyDown }, "More ", React.createElement("span", { "aria-hidden": "true" }, "⌄")),
          moreOpen && React.createElement("div", { className: "more-nav-menu", role: "menu", "aria-label": "More modules" }, ...hiddenItems.map((item, index) => React.createElement(NavLink, { key: item.to, ref: (element) => { moreItemRefs.current[index] = element; }, to: item.to, end: item.to === "/leads", role: "menuitem", className: activeIndex === items.indexOf(item) ? "more-nav-item active" : "more-nav-item", onClick: () => setMoreOpen(false), onKeyDown: (event) => handleMoreItemKeyDown(event, index) }, item.label))),
        ),
      ),
    ),
    React.createElement("div", { ref: measureRef, className: "nav-measure", "aria-hidden": "true" }, ...items.map((item) => React.createElement("span", { key: item.to, "data-nav-measure": true }, item.label)), React.createElement("span", { "data-more-measure": true }, "More ", "⌄")),
  );
}

export function Navbar({
  collapsed = false,
  showAdmin = false,
  includeCore = true,
  responsive = false,
  counts = {},
  countsLoading = false,
  currentHref,
  collapsedGroups = {},
  toggleNavGroup = () => undefined,
}: {
  collapsed?: boolean;
  showAdmin?: boolean;
  includeCore?: boolean;
  responsive?: boolean;
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
    includeCore && (responsive
      ? React.createElement(ResponsiveCoreNav, { key: "core", currentHref })
      : React.createElement(
          "section",
          { className: "nav-core-group", key: "core" },
          showAdmin && !collapsed && React.createElement("h2", { className: "nav-group-label" }, "WORKSPACE"),
          ...NAV_ITEMS.map(([to, label]) => navLink({ to, label }, collapsed, counts, countsLoading, activeHref(currentHref, { to, label }, claimed))),
        )),
  );
}
