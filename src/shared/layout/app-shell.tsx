import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Navbar, NAV_ITEMS } from "./nav";
import { useLeadNavCounts, useNavGroupState } from "./function";
import { useAuth } from "../auth/auth";
import { displayRole, usePermission } from "../auth/permissions";
import { signOut } from "../auth/sign-out";
import { api } from "../api/client";
import { getTheme, setTheme } from "../theme/theme";
import { Bell, ChevronDown, ChevronLeft, ChevronRight, Moon, Plus, Search, Sun, Upload } from "lucide-react";
import { LeadNavbarActionsContext, type LeadNavbarActions } from "./lead-navbar-actions";
import { focusFirstNavigationLink, restoreNavigationFocus, shouldOpenNavigationShortcut } from "./navbar-auto-hide";
import { visibleTopbarModules } from "./nav-access";
import "./app-shell.css";

type SearchResult = { id: string; name: string; company: string | null; stage: string | null };


function MasterSidebar({
  currentHref,
  showAdmin,
  adminNavbar,
  theme,
  hideMasterNavigation,
}: {
  currentHref: string;
  showAdmin: boolean;
  adminNavbar: ReactNode;
  theme: "light" | "dark";
  hideMasterNavigation: boolean;
}) {
  const leadMasterActive = currentHref.startsWith("/lead-master");
  const productMasterActive = currentHref.startsWith("/product-master");

  return <aside className="sidebar master-sidebar">
    <div className="master-sidebar-brand">
      <Link className="topbar-logo sidebar-brand-logo" to="/lead-master" aria-label="Go to Lead Master">
        <img className="brand-mark" src={theme === "dark" ? "/altus-lockup-white.webp" : "/altus-lockup.webp"} alt="" />
        <span>Altus <b>CRM</b></span>
      </Link>
    </div>
    <nav className="master-navigation" aria-label="Master navigation">
      {!hideMasterNavigation && <NavLink
          to="/lead-master"
          end
          className={leadMasterActive ? "master-navigation-toggle master-navigation-parent active" : "master-navigation-toggle master-navigation-parent"}
        >
          <span className="master-navigation-icon" aria-hidden="true">◫</span>
          <span>Lead Master</span>
        </NavLink>}
      {!hideMasterNavigation && <NavLink to="/product-master" end className={productMasterActive ? "master-navigation-placeholder active" : "master-navigation-placeholder"}>
        <span className="master-navigation-icon" aria-hidden="true">□</span>
        <span>Product Master</span>
      </NavLink>}
      {!hideMasterNavigation && <div className="master-navigation-placeholder" aria-label="My Master is planned">
        <span className="master-navigation-icon" aria-hidden="true">◇</span>
        <span>My Master</span>
        <small>Planned</small>
      </div>}
      {showAdmin && <div className="master-admin-navigation">{adminNavbar}</div>}
    </nav>
  </aside>;
}

function AccountMenu({ theme, onToggleTheme }: { theme: "light" | "dark"; onToggleTheme: () => void }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuItems = ["account", "theme", "logout"];
  useEffect(() => { setOpen(false); }, [location.pathname]);
  useEffect(() => { if (!open) return; const closeOnOutside = (event: MouseEvent) => { if (!menuRef.current?.contains(event.target as Node)) setOpen(false); }; document.addEventListener("mousedown", closeOnOutside); return () => document.removeEventListener("mousedown", closeOnOutside); }, [open]);
  useEffect(() => { if (open) requestAnimationFrame(() => itemRefs.current[0]?.focus()); }, [open]);
  function closeMenu(restoreFocus = false) { setOpen(false); if (restoreFocus) requestAnimationFrame(() => buttonRef.current?.focus()); }
  function openMenu() { setOpen(true); }
  function buttonKeyDown(event: KeyboardEvent<HTMLButtonElement>) { if (["Enter", " ", "ArrowDown"].includes(event.key)) { event.preventDefault(); openMenu(); } }
  function itemKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) { if (["ArrowDown", "ArrowRight"].includes(event.key)) { event.preventDefault(); itemRefs.current[(index + 1) % menuItems.length]?.focus(); } else if (["ArrowUp", "ArrowLeft"].includes(event.key)) { event.preventDefault(); itemRefs.current[(index - 1 + menuItems.length) % menuItems.length]?.focus(); } else if (event.key === "Escape") { event.preventDefault(); closeMenu(true); } }
  function goAccount() { closeMenu(); navigate("/account"); }
  function handleSignOut() { closeMenu(); void signOut(logout, navigate); }
  const roleLabel = user?.role_label || displayRole(user?.role);
  const accountName = user?.name && user.name !== roleLabel ? user.name : "";
  const userInitials = useMemo(() => {
    if (user?.name) {
      const parts = user.name.trim().split(/\s+/);
      if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
      return parts[0].slice(0, 2).toUpperCase();
    }
    if (user?.email) return user.email.slice(0, 2).toUpperCase();
    return "OP";
  }, [user?.name, user?.email]);
  return <div className="account-menu-wrap" ref={menuRef}>
    <button ref={buttonRef} className="account-menu-button avatar-menu-button" type="button" aria-haspopup="menu" aria-expanded={open} aria-label="Account menu" title={user?.name || roleLabel} onClick={() => open ? closeMenu() : openMenu()} onKeyDown={buttonKeyDown}>
      <span className="user-avatar-badge">{userInitials}</span>
      <ChevronDown size={14} className="avatar-menu-caret" aria-hidden="true" />
    </button>
    {open && <div className="account-menu" role="menu" aria-label="Account menu"><div className="account-menu-identity"><strong>{user?.name || roleLabel}</strong><span>{user?.email || ""}</span>{user?.name !== roleLabel && <span className="account-menu-role">{roleLabel}</span>}</div><div className="account-menu-actions"><button ref={(element) => { itemRefs.current[0] = element; }} role="menuitem" type="button" onClick={goAccount} onKeyDown={(event) => itemKeyDown(event, 0)}>Account</button><button ref={(element) => { itemRefs.current[1] = element; }} role="menuitem" type="button" onClick={onToggleTheme} onKeyDown={(event) => itemKeyDown(event, 1)}>Theme: {theme === "light" ? "Light" : "Dark"}</button></div><div className="account-menu-signout"><button ref={(element) => { itemRefs.current[2] = element; }} role="menuitem" type="button" onClick={handleSignOut} onKeyDown={(event) => itemKeyDown(event, 2)}>Sign out</button></div></div>}
  </div>;
}

function GlobalSearch() {
  const navigate = useNavigate();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "empty" | "error">("idle");
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  useEffect(() => { const closeOnOutside = (event: MouseEvent) => { if (!wrapperRef.current?.contains(event.target as Node)) { setOpen(false); if (!query.trim()) setExpanded(false); } }; document.addEventListener("mousedown", closeOnOutside); return () => document.removeEventListener("mousedown", closeOnOutside); }, [query]);
  useEffect(() => { if (expanded) requestAnimationFrame(() => inputRef.current?.focus()); }, [expanded]);
  useEffect(() => { const value = query.trim(); if (value.length < 2) { setResults([]); setState("idle"); setOpen(false); return; } setOpen(true); setState("loading"); setActiveIndex(-1); const timer = window.setTimeout(() => { void api<{ items: SearchResult[] }>(`/api/leads?search=${encodeURIComponent(value)}`).then((response) => { const next = response.items.slice(0, 8); setResults(next); setState(next.length ? "idle" : "empty"); }).catch(() => { setResults([]); setState("error"); }); }, 250); return () => window.clearTimeout(timer); }, [query]);
  function choose(result: SearchResult) { setOpen(false); setQuery(""); setExpanded(false); navigate(`/leads?open=${encodeURIComponent(result.id)}`); }
  function closeIfEmpty() { if (!query.trim()) { setOpen(false); setExpanded(false); } }
  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) { if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); setActiveIndex((value) => Math.min(value + 1, results.length - 1)); } else if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((value) => Math.max(value - 1, 0)); } else if (event.key === "Enter" && activeIndex >= 0 && results[activeIndex]) { event.preventDefault(); choose(results[activeIndex]); } else if (event.key === "Escape") { event.preventDefault(); setOpen(false); closeIfEmpty(); } }
  return <div className={expanded ? "navbar-search is-expanded" : "navbar-search"} ref={wrapperRef} role="search" aria-label="Search leads">
    {!expanded && <button className={query.trim() ? "navbar-action-button navbar-action-button--round is-active" : "navbar-action-button navbar-action-button--round"} type="button" aria-label="Search" title="Search" onClick={() => setExpanded(true)}><Search size={18} aria-hidden="true" /></button>}
    {expanded && <><Search className="navbar-search-icon" size={16} aria-hidden="true" /><input ref={inputRef} value={query} aria-label="Search leads" placeholder="Search leads" onChange={(event) => setQuery(event.target.value)} onFocus={() => { if (query.trim().length >= 2) setOpen(true); }} onBlur={closeIfEmpty} onKeyDown={onKeyDown} />{open && <div className="search-popover" role="listbox" aria-label="Lead search results">{state === "loading" && <div className="search-state">Searching…</div>}{state === "empty" && <div className="search-state">No matching leads.</div>}{state === "error" && <div className="search-state">Search unavailable.</div>}{state === "idle" && results.map((result, index) => <button key={result.id} type="button" role="option" aria-selected={index === activeIndex} className={index === activeIndex ? "search-result active" : "search-result"} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(result)}><span className="search-result-name">{result.name}</span><span className="search-result-meta">{result.company || "No company"} · {result.stage || "Unstaged"}</span></button>)}</div>}</>}
  </div>;
}

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, loading: authLoading } = useAuth();
  const canCreateLead = usePermission("leads.edit");
  const showAdminNav = usePermission("nav.admin");
  const canManageAssignment = usePermission("leads.assign");
  const canManageTeams = usePermission("teams.manage");
  const showAssignmentNav = showAdminNav || canManageAssignment || canManageTeams;
  const isAdminRole = user?.role?.trim().toLowerCase() === "admin";
  const { counts, loading: countsLoading } = useLeadNavCounts(showAdminNav);
  const { collapsedGroups, toggleNavGroup } = useNavGroupState();
  const [theme, setCurrentTheme] = useState(getTheme);
  const [leadNavbarActions, setLeadNavbarActions] = useState<LeadNavbarActions | null>(null);
  const [topbarModulesOpen, setTopbarModulesOpen] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null); const topbarRef = useRef<HTMLElement>(null);
  const openNavigationRef = useRef<HTMLButtonElement>(null); const firstNavigationLinkRef = useRef<HTMLAnchorElement>(null); const previousNavigationFocusRef = useRef<HTMLElement | null>(null);
  function openKeyboardNavigation(origin?: HTMLElement | null) { previousNavigationFocusRef.current = origin || document.activeElement as HTMLElement | null; setTopbarModulesOpen(true); requestAnimationFrame(() => focusFirstNavigationLink(firstNavigationLinkRef.current)); }
  const canImportLeads = usePermission("leads.import");
  const isLeadsScreen = ["/leads", "/lead-master"].includes(location.pathname);
  const homeHref = showAdminNav ? "/leads" : "/lead-master";
  const currentHref = `${location.pathname}${location.search}`;
  const topbarModules = visibleTopbarModules(authLoading ? false : showAdminNav);
  useEffect(() => { setTopbarModulesOpen(false); }, [location.pathname]);
  useEffect(() => {
    if (!topbarModulesOpen) return;
    const closeOnEscape = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") { setTopbarModulesOpen(false); restoreNavigationFocus(previousNavigationFocusRef.current, document.body); } else if (shouldOpenNavigationShortcut(event)) { event.preventDefault(); openKeyboardNavigation(); } };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [topbarModulesOpen]);
  function toggleTheme() { const next = theme === "light" ? "dark" : "light"; setTheme(next); setCurrentTheme(next); }
  const adminNavbar = <Navbar collapsed={false} showAdmin={showAdminNav} showAssignment={canManageAssignment} showTeams={canManageTeams} includeCore={false} currentHref={currentHref} counts={counts} countsLoading={countsLoading} collapsedGroups={collapsedGroups} toggleNavGroup={toggleNavGroup} />;
  return <LeadNavbarActionsContext.Provider value={setLeadNavbarActions}><div ref={shellRef} className={showAssignmentNav ? "shell sidebar-shell admin-shell" : "shell sidebar-shell"}>
    <button ref={openNavigationRef} className="open-navigation-shortcut" type="button" onClick={() => openKeyboardNavigation(openNavigationRef.current)}>Open navigation</button>
    <MasterSidebar currentHref={currentHref} showAdmin={showAssignmentNav} adminNavbar={adminNavbar} theme={theme} hideMasterNavigation={isAdminRole} />
    <main className="main">
      <header ref={topbarRef} className="topbar topbar-without-navigation">
        <Link className="topbar-logo topbar-brand-logo" to={homeHref} aria-label="Go to dashboard"><img className="brand-mark" src={theme === "dark" ? "/altus-lockup-white.webp" : "/altus-lockup.webp"} alt="" /><span>Altus <b>CRM</b></span></Link>
        <nav id="topbar-module-links" className={topbarModulesOpen ? "topbar-module-links is-open" : "topbar-module-links"} aria-label="Quick navigation">{topbarModules.map((module, index) => <NavLink ref={index === 0 ? firstNavigationLinkRef : undefined} key={module.id} to={module.path} aria-label={module.label} title={module.label} onClick={() => setTopbarModulesOpen(false)}><span>{module.label}</span></NavLink>)}</nav>
        <div className="topbar-right">
          <div className="top-actions">
            <button className="navbar-action-button topbar-module-toggle" type="button" aria-label={topbarModulesOpen ? "Hide quick navigation" : "Show quick navigation"} aria-expanded={topbarModulesOpen} aria-controls="topbar-module-links" onClick={() => setTopbarModulesOpen((open) => !open)}>{topbarModulesOpen ? <ChevronLeft size={18} aria-hidden="true" /> : <ChevronRight size={18} aria-hidden="true" />}</button>
            {isLeadsScreen && <div className="navbar-lead-actions"><GlobalSearch /><button className="navbar-action-button navbar-action-button--round" type="button" disabled={!canImportLeads || !leadNavbarActions} onClick={() => leadNavbarActions?.openBulkUpload()} aria-label="Bulk upload leads" title="Bulk upload leads"><Upload size={18} aria-hidden="true" /></button>{canCreateLead && <button className="navbar-action-button navbar-action-button--round" type="button" disabled={!leadNavbarActions} onClick={() => leadNavbarActions?.openNewLead()} aria-label="Add new lead" title="Add new lead"><Plus size={18} strokeWidth={2.5} aria-hidden="true" /></button>}</div>}
            <button className="navbar-action-button navbar-action-button--round top-action-icon" type="button" onClick={toggleTheme} aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`} title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}>{theme === "light" ? <Moon size={18} aria-hidden="true" /> : <Sun size={18} aria-hidden="true" />}</button>
            <button className="navbar-action-button navbar-action-button--round topbar-notification-btn" type="button" aria-label="Notifications" title="Notifications"><Bell size={18} aria-hidden="true" /></button>
            <AccountMenu theme={theme} onToggleTheme={toggleTheme} />
          </div>
        </div>
      </header>
      <section className="content"><Outlet /></section>
    </main>
  </div></LeadNavbarActionsContext.Provider>;
}

export { NAV_ITEMS };
