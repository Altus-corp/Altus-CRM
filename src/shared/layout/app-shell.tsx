import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Navbar, NAV_ITEMS } from "./nav";
import { useLeadNavCounts, useNavGroupState } from "./function";
import { useAuth } from "../auth/auth";
import { displayRole, usePermission } from "../auth/permissions";
import { signOut } from "../auth/sign-out";
import { api } from "../api/client";
import { getTheme, setTheme } from "../theme/theme";
import { Bell, BarChart3, Building2, CheckSquare, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Diamond, FileText, ListTodo, Maximize2, Megaphone, Moon, MoreHorizontal, PanelLeft, Plus, Search, Square, Sun, Upload, Users } from "lucide-react";
import { LeadNavbarActionsContext, type LeadNavbarActions } from "./lead-navbar-actions";
import { focusFirstNavigationLink, NavbarAutoHideController, restoreNavigationFocus, shouldOpenNavigationShortcut } from "./navbar-auto-hide";
import { visibleTopbarModules } from "./nav-access";
import "./app-shell.css";

type SearchResult = { id: string; name: string; company: string | null; stage: string | null };

function getModuleIcon(path: string) {
  if (path.startsWith("/leads") || path.startsWith("/lead-master")) return <Users size={18} aria-hidden="true" />;
  if (path.startsWith("/reports")) return <BarChart3 size={18} aria-hidden="true" />;
  if (path.startsWith("/marketing")) return <Megaphone size={18} aria-hidden="true" />;
  if (path.startsWith("/quotes-invoicing")) return <FileText size={18} aria-hidden="true" />;
  if (path.startsWith("/accounts-contacts")) return <Building2 size={18} aria-hidden="true" />;
  if (path.startsWith("/tasks-activity")) return <ListTodo size={18} aria-hidden="true" />;
  return <Users size={18} aria-hidden="true" />;
}

function MasterSidebar({
  currentHref,
  showAdmin,
  adminNavbar,
  theme,
  hideMasterNavigation,
  onNavigateBack,
  onNavigateForward,
  onToggleSidebar,
}: {
  currentHref: string;
  showAdmin: boolean;
  adminNavbar: ReactNode;
  theme: "light" | "dark";
  hideMasterNavigation: boolean;
  onNavigateBack?: () => void;
  onNavigateForward?: () => void;
  onToggleSidebar?: () => void;
}) {
  const leadMasterActive = currentHref.startsWith("/lead-master");
  const productMasterActive = currentHref.startsWith("/product-master");

  const [logoError, setLogoError] = useState(false);

  return <aside className="sidebar master-sidebar">
    <div className="sidebar-top-controls">
      <div className="sidebar-history-buttons">
        <button className="sidebar-control-btn" type="button" onClick={onNavigateBack} aria-label="Go back" title="Back">
          <ChevronLeft size={16} aria-hidden="true" />
        </button>
        <button className="sidebar-control-btn" type="button" onClick={onNavigateForward} aria-label="Go forward" title="Forward">
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>
      <div className="sidebar-control-divider" aria-hidden="true" />
      <button className="sidebar-control-btn sidebar-collapse-btn topbar-sidebar-toggle" type="button" onClick={onToggleSidebar} aria-label="Toggle sidebar" title="Toggle sidebar">
        <PanelLeft size={16} aria-hidden="true" />
      </button>
    </div>
    <div className="master-sidebar-brand sidebar-brand-block">
      <Link className="topbar-logo sidebar-brand-logo" to="/lead-master" aria-label="Go to Lead Master">
        {!logoError && (
          <img
            key={theme}
            className="sidebar-brand-logo-img"
            src={theme === "dark" ? "/logo-white.webp" : "/logo.webp"}
            alt="Company logo"
            draggable={false}
            onError={() => setLogoError(true)}
          />
        )}
        <span className="brand-crm-title brand-wms-text">CRM</span>
      </Link>
    </div>
    <div className="sidebar-brand-divider" aria-hidden="true" />
    <nav className="master-navigation" aria-label="Master navigation">
      {!hideMasterNavigation && <NavLink
          to="/lead-master"
          end
          className={leadMasterActive ? "master-navigation-toggle master-navigation-parent active" : "master-navigation-toggle master-navigation-parent"}
        >
          <CheckSquare size={17} className="master-navigation-icon" aria-hidden="true" />
          <span className="master-nav-label">Lead Master</span>
          <span className="nav-count">11</span>
        </NavLink>}
      {!hideMasterNavigation && <NavLink to="/product-master" end className={productMasterActive ? "master-navigation-placeholder active" : "master-navigation-placeholder"}>
        <Square size={17} className="master-navigation-icon" aria-hidden="true" />
        <span className="master-nav-label">Product Master</span>
      </NavLink>}
      {!hideMasterNavigation && <div className="master-navigation-placeholder" aria-label="My Master is planned">
        <Diamond size={17} className="master-navigation-icon" aria-hidden="true" />
        <span className="master-nav-label">My Master</span>
        <small className="master-planned-badge">Planned</small>
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
    {!expanded && <button className={query.trim() ? "header-icon-btn navbar-action-button navbar-action-button--round is-active" : "header-icon-btn navbar-action-button navbar-action-button--round"} type="button" aria-label="Search" title="Search" onClick={() => setExpanded(true)}><Search size={18} aria-hidden="true" /></button>}
    {expanded && <><Search className="navbar-search-icon" size={18} aria-hidden="true" /><input ref={inputRef} value={query} aria-label="Search leads" placeholder="Search leads" onChange={(event) => setQuery(event.target.value)} onFocus={() => { if (query.trim().length >= 2) setOpen(true); }} onBlur={closeIfEmpty} onKeyDown={onKeyDown} />{open && <div className="search-popover" role="listbox" aria-label="Lead search results">{state === "loading" && <div className="search-state">Searching…</div>}{state === "empty" && <div className="search-state">No matching leads.</div>}{state === "error" && <div className="search-state">Search unavailable.</div>}{state === "idle" && results.map((result, index) => <button key={result.id} type="button" role="option" aria-selected={index === activeIndex} className={index === activeIndex ? "search-result active" : "search-result"} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(result)}><span className="search-result-name">{result.name}</span><span className="search-result-meta">{result.company || "No company"} · {result.stage || "Unstaged"}</span></button>)}</div>}</>}
  </div>;
}

function HeaderMoreMenu({
  theme,
  onToggleTheme,
  onToggleFullscreen,
}: {
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onToggleFullscreen: () => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnOutside = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutside);
    return () => document.removeEventListener("mousedown", closeOnOutside);
  }, [open]);

  return (
    <div className="header-more-wrap" ref={menuRef}>
      <button
        className="header-icon-btn navbar-action-button navbar-action-button--round header-more-btn"
        type="button"
        aria-label="More options"
        title="More options"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <MoreHorizontal size={18} aria-hidden="true" />
      </button>
      {open && (
        <div className="header-more-popover" role="menu">
          <button
            type="button"
            role="menuitem"
            className="header-more-item"
            onClick={() => {
              onToggleFullscreen();
              setOpen(false);
            }}
          >
            <Maximize2 size={16} aria-hidden="true" />
            <span>Toggle Fullscreen</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="header-more-item"
            onClick={() => {
              onToggleTheme();
              setOpen(false);
            }}
          >
            {theme === "light" ? <Moon size={16} aria-hidden="true" /> : <Sun size={16} aria-hidden="true" />}
            <span>{theme === "light" ? "Dark Mode" : "Light Mode"}</span>
          </button>
        </div>
      )}
    </div>
  );
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [topbarViewMode, setTopbarViewMode] = useState<"doer" | "initiator">("doer");
  const notificationCount = 12;
  const notificationBadge = notificationCount > 99 ? "9+" : notificationCount > 0 ? String(notificationCount) : null;
  const [leadNavbarActions, setLeadNavbarActions] = useState<LeadNavbarActions | null>(null);
  const [topbarModulesOpen, setTopbarModulesOpen] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null); const topbarRef = useRef<HTMLElement>(null);
  const openNavigationRef = useRef<HTMLButtonElement>(null); const firstNavigationLinkRef = useRef<HTMLAnchorElement>(null); const topbarNavigationRef = useRef<HTMLElement>(null); const previousNavigationFocusRef = useRef<HTMLElement | null>(null);
  const navigationAutoHideRef = useRef<NavbarAutoHideController | null>(null);
  if (!navigationAutoHideRef.current) navigationAutoHideRef.current = new NavbarAutoHideController(setTopbarModulesOpen);
  const navigationAutoHide = navigationAutoHideRef.current;
  function openKeyboardNavigation(origin?: HTMLElement | null) { previousNavigationFocusRef.current = origin || document.activeElement as HTMLElement | null; navigationAutoHide.open(); requestAnimationFrame(() => focusFirstNavigationLink(firstNavigationLinkRef.current)); }
  const canImportLeads = usePermission("leads.import");
  const isLeadsScreen = ["/leads", "/lead-master"].includes(location.pathname);
  const homeHref = showAdminNav ? "/leads" : "/lead-master";
  const currentHref = `${location.pathname}${location.search}`;
  const topbarModules = visibleTopbarModules(authLoading ? false : showAdminNav);
  const currentScreenTitle = useMemo(() => {
    const p = location.pathname;
    if (p.startsWith("/leads") || p.startsWith("/lead-master")) return "Leads";
    if (p.startsWith("/tasks-activity")) return "Tasks & Activity";
    if (p.startsWith("/reports")) return "Reports";
    if (p.startsWith("/marketing")) return "Marketing";
    if (p.startsWith("/quotes-invoicing")) return "Quote & Invoicing";
    if (p.startsWith("/accounts-contacts")) return "Accounts & Contacts";
    if (p.startsWith("/admin")) return "Admin";
    if (p.startsWith("/settings")) return "Settings";
    if (p.startsWith("/account")) return "Account";
    return "Leads";
  }, [location.pathname]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => undefined);
    } else {
      document.exitFullscreen().catch(() => undefined);
    }
  };

  useEffect(() => { navigationAutoHide.close(); }, [location.pathname, navigationAutoHide]);
  useEffect(() => {
    if (!topbarModulesOpen) return;
    const closeOnEscape = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") { navigationAutoHide.close(); restoreNavigationFocus(previousNavigationFocusRef.current, document.body); } else if (shouldOpenNavigationShortcut(event)) { event.preventDefault(); openKeyboardNavigation(); } };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [topbarModulesOpen, navigationAutoHide]);
  useEffect(() => {
    const closeOnTouchOutside = (event: PointerEvent) => {
      if (event.pointerType === "mouse") return;
      const target = event.target as Node | null;
      if (target && (topbarNavigationRef.current?.contains(target) || openNavigationRef.current?.contains(target))) return;
      navigationAutoHide.schedule();
    };
    document.addEventListener("pointerdown", closeOnTouchOutside);
    return () => { document.removeEventListener("pointerdown", closeOnTouchOutside); navigationAutoHide.dispose(); };
  }, [navigationAutoHide]);
  function toggleTheme() { const next = theme === "light" ? "dark" : "light"; setTheme(next); setCurrentTheme(next); }
  const adminNavbar = <Navbar collapsed={false} showAdmin={showAdminNav} showAssignment={canManageAssignment} showTeams={canManageTeams} includeCore={false} currentHref={currentHref} counts={counts} countsLoading={countsLoading} collapsedGroups={collapsedGroups} toggleNavGroup={toggleNavGroup} />;
  return <LeadNavbarActionsContext.Provider value={setLeadNavbarActions}><div ref={shellRef} className={`${showAssignmentNav ? "shell sidebar-shell admin-shell" : "shell sidebar-shell"}${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>
    {/* Row 1: Top Navbar */}
    <div
      className={`app-top-navbar-container ${topbarModulesOpen ? "is-visible" : "is-hidden"}`}
      onMouseEnter={() => navigationAutoHide.enter()}
      onMouseLeave={() => navigationAutoHide.leave()}
    >
      <header
        ref={topbarNavigationRef}
        id="topbar-module-links"
        className="app-top-navbar"
        aria-label="Quick navigation"
        aria-hidden={!topbarModulesOpen}
        inert={!topbarModulesOpen}
        onFocusCapture={() => navigationAutoHide.setFocusHeld(true)}
        onBlurCapture={() => requestAnimationFrame(() => {
          if (!topbarNavigationRef.current?.contains(document.activeElement)) navigationAutoHide.setFocusHeld(false);
        })}
      >
        <div className="top-navbar-brand-section">
          <Link className="topbar-logo topbar-brand-logo" to={homeHref} aria-label="Go to dashboard">
            <img
              className="top-navbar-logo-img brand-mark"
              src={theme === "dark" ? "/logo-white.webp" : "/logo.webp"}
              alt="Company logo"
              draggable={false}
            />
          </Link>
        </div>
        <nav className="top-navbar-modules" aria-label="Modules navigation">
          {topbarModules.map((module, index) => (
            <NavLink
              ref={index === 0 ? firstNavigationLinkRef : undefined}
              key={module.id}
              to={module.path}
              className={({ isActive }) => `top-navbar-item ${isActive ? "active" : ""}`}
              aria-label={module.label}
              title={module.label}
              onFocus={() => navigationAutoHide.setFocusHeld(true)}
              onClick={() => navigationAutoHide.navigationSelected()}
            >
              {getModuleIcon(module.path)}
              <span>{module.label}</span>
            </NavLink>
          ))}
        </nav>
      </header>
    </div>

    {/* Reveal tab and hover zone */}
    <div
      className="topbar-nav-hover-zone"
      aria-hidden="true"
      onMouseEnter={() => navigationAutoHide.enter()}
      onMouseLeave={() => navigationAutoHide.leave()}
    />
    <button
      ref={openNavigationRef}
      className="navbar-action-button topbar-module-toggle topbar-nav-reveal-tab"
      type="button"
      aria-label={topbarModulesOpen ? "Hide quick navigation" : "Show quick navigation"}
      aria-expanded={topbarModulesOpen}
      aria-controls="topbar-module-links"
      onMouseEnter={() => navigationAutoHide.enter()}
      onMouseLeave={() => navigationAutoHide.leave()}
      onClick={() => {
        if (topbarModulesOpen) navigationAutoHide.close();
        else { navigationAutoHide.open(); navigationAutoHide.schedule(); }
      }}
    >
      {topbarModulesOpen ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
    </button>
    <button ref={openNavigationRef} className="open-navigation-shortcut" type="button" onClick={() => openKeyboardNavigation(openNavigationRef.current)}>Open navigation</button>

    {/* Row 2: [Sidebar | Main Content] */}
    <div className="shell-body">
      <MasterSidebar currentHref={currentHref} showAdmin={showAdminNav}
        adminNavbar={adminNavbar}
        theme={theme}
        hideMasterNavigation={isAdminRole || location.pathname.startsWith("/admin/")}
        onNavigateBack={() => navigate(-1)}
        onNavigateForward={() => navigate(1)}
        onToggleSidebar={() => setSidebarCollapsed((c) => !c)}
      />
      <main className="main">
        <header ref={topbarRef} className="topbar page-main-header topbar-ref-design">
          <div className="page-header-left">
            <div className="topbar-breadcrumb">
              <Link to={homeHref} className="topbar-breadcrumb-brand">CRM</Link>
              <span className="topbar-breadcrumb-arrow" aria-hidden="true">▶</span>
              <span className="topbar-breadcrumb-title">{currentScreenTitle}</span>
            </div>
          </div>
          <div className="topbar-right">
            <div className="topbar-view-mode" aria-label="View selection">
              <span className="topbar-view-label">View</span>
              <div className="topbar-view-pill">
                <button type="button" className={topbarViewMode === "doer" ? "is-active" : ""} onClick={() => setTopbarViewMode("doer")}>Doer</button>
                <button type="button" className={topbarViewMode === "initiator" ? "is-active" : ""} onClick={() => setTopbarViewMode("initiator")}>Initiator</button>
              </div>
            </div>
            {isLeadsScreen && <GlobalSearch />}
            {isLeadsScreen && (
              <button
                className="header-icon-btn navbar-action-button navbar-action-button--round topbar-export-btn"
                type="button"
                disabled={!canImportLeads || !leadNavbarActions}
                onClick={() => leadNavbarActions?.openBulkUpload()}
                aria-label="Bulk upload leads"
                title="Bulk upload leads"
              >
                <Upload size={18} aria-hidden="true" />
              </button>
            )}
            {canCreateLead && (
              <button
                className="header-icon-btn navbar-action-button navbar-action-button--round topbar-add-btn"
                type="button"
                disabled={!leadNavbarActions}
                onClick={() => leadNavbarActions?.openNewLead()}
                aria-label="Add new lead"
                title="Add new lead"
              >
                <Plus size={18} strokeWidth={2.5} aria-hidden="true" />
              </button>
            )}
            <button
              className="header-icon-btn navbar-action-button navbar-action-button--round topbar-fullscreen-btn header-desktop-only"
              type="button"
              onClick={toggleFullscreen}
              aria-label="Toggle fullscreen"
              title="Fullscreen"
            >
              <Maximize2 size={18} aria-hidden="true" />
            </button>
            <button
              className="header-icon-btn navbar-action-button navbar-action-button--round top-action-icon topbar-theme-btn header-desktop-only"
              type="button"
              onClick={toggleTheme}
              aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
              title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
            >
              {theme === "light" ? <Moon size={18} aria-hidden="true" /> : <Sun size={18} aria-hidden="true" />}
            </button>
            <HeaderMoreMenu theme={theme} onToggleTheme={toggleTheme} onToggleFullscreen={toggleFullscreen} />
            <button
              className="header-icon-btn navbar-action-button navbar-action-button--round topbar-notification-btn"
              type="button"
              aria-label="Notifications"
              title="Notifications"
            >
              <Bell size={18} aria-hidden="true" />
              {notificationBadge && <span className="topbar-notification-badge">{notificationBadge}</span>}
            </button>
            <AccountMenu theme={theme} onToggleTheme={toggleTheme} />
          </div>
        </header>
        <section className="content"><Outlet /></section>
      </main>
    </div>
  </div></LeadNavbarActionsContext.Provider>;
}

export { NAV_ITEMS };
