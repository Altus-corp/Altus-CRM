import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Navbar, NAV_ITEMS } from "./nav";
import { useLeadNavCounts, useNavGroupState } from "./function";
import { useAuth } from "../auth/auth";
import { displayRole, usePermission } from "../auth/permissions";
import { signOut } from "../auth/sign-out";
import { api } from "../api/client";
import { getTheme, setTheme } from "../theme/theme";
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
  const leadMasterActive = currentHref.startsWith("/leads");

  return <aside className="sidebar master-sidebar">
    <div className="master-sidebar-brand">
      <Link className="topbar-logo" to="/leads" aria-label="Go to Leads">
        <img className="brand-mark" src={theme === "dark" ? "/altus-lockup-white.webp" : "/altus-lockup.webp"} alt="" />
        <span>Altus <b>CRM</b></span>
      </Link>
    </div>
    <nav className="master-navigation" aria-label="Master navigation">
      {!hideMasterNavigation && <NavLink
          to="/leads"
          end
          className={leadMasterActive ? "master-navigation-toggle master-navigation-parent active" : "master-navigation-toggle master-navigation-parent"}
        >
          <span className="master-navigation-icon" aria-hidden="true">◫</span>
          <span>Lead Master</span>
        </NavLink>}
      {!hideMasterNavigation && <div className="master-navigation-placeholder" aria-label="Product Master is planned">
        <span className="master-navigation-icon" aria-hidden="true">□</span>
        <span>Product Master</span>
        <small>Planned</small>
      </div>}
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
  const roleLabel = displayRole(user?.role);
  const accountName = user?.name && user.name !== roleLabel ? user.name : "";
  const userInitial = user?.name ? user.name.trim().charAt(0).toUpperCase() : (user?.email ? user.email.trim().charAt(0).toUpperCase() : "U");
  return <div className="account-menu-wrap" ref={menuRef}>
    <button ref={buttonRef} className="account-menu-button avatar-menu-button" type="button" aria-haspopup="menu" aria-expanded={open} aria-label="Account menu" title={user?.name || roleLabel} onClick={() => open ? closeMenu() : openMenu()} onKeyDown={buttonKeyDown}>
      <span className="user-avatar-badge">{userInitial}</span>
    </button>
    {open && <div className="account-menu" role="menu" aria-label="Account menu"><div className="account-menu-identity"><strong>{user?.name || roleLabel}</strong><span>{user?.email || ""}</span><span className="role-badge">{roleLabel}</span></div><button ref={(element) => { itemRefs.current[0] = element; }} role="menuitem" type="button" onClick={goAccount} onKeyDown={(event) => itemKeyDown(event, 0)}>Account</button><button ref={(element) => { itemRefs.current[1] = element; }} role="menuitem" type="button" onClick={onToggleTheme} onKeyDown={(event) => itemKeyDown(event, 1)}>Theme: {theme === "light" ? "Light" : "Dark"}</button><button ref={(element) => { itemRefs.current[2] = element; }} role="menuitem" type="button" onClick={handleSignOut} onKeyDown={(event) => itemKeyDown(event, 2)}>Sign out</button></div>}
  </div>;
}

function GlobalSearch({ compact = false }: { compact?: boolean }) {
  const navigate = useNavigate();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "empty" | "error">("idle");
  const [open, setOpen] = useState(false);
  const [compactOpen, setCompactOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  useEffect(() => { const closeOnOutside = (event: MouseEvent) => { if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false); }; document.addEventListener("mousedown", closeOnOutside); return () => document.removeEventListener("mousedown", closeOnOutside); }, []);
  useEffect(() => { if (compactOpen) requestAnimationFrame(() => inputRef.current?.focus()); }, [compactOpen]);
  useEffect(() => { const value = query.trim(); if (value.length < 2) { setResults([]); setState("idle"); setOpen(false); return; } setOpen(true); setState("loading"); setActiveIndex(-1); const timer = window.setTimeout(() => { void api<{ items: SearchResult[] }>(`/api/leads?search=${encodeURIComponent(value)}`).then((response) => { const next = response.items.slice(0, 8); setResults(next); setState(next.length ? "idle" : "empty"); }).catch(() => { setResults([]); setState("error"); }); }, 250); return () => window.clearTimeout(timer); }, [query]);
  function choose(result: SearchResult) { setOpen(false); setQuery(""); setCompactOpen(false); navigate(`/leads?open=${encodeURIComponent(result.id)}`); }
  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) { if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); setActiveIndex((value) => Math.min(value + 1, results.length - 1)); } else if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((value) => Math.max(value - 1, 0)); } else if (event.key === "Enter" && activeIndex >= 0 && results[activeIndex]) { event.preventDefault(); choose(results[activeIndex]); } else if (event.key === "Escape") { event.preventDefault(); setOpen(false); if (compact && !query) setCompactOpen(false); else inputRef.current?.focus(); } }
  const searchField = <><span className="global-search-icon" aria-hidden="true">⌕</span><input ref={inputRef} value={query} aria-label="Search leads" placeholder="Search any record - name, company, phone, remark..." onChange={(event) => setQuery(event.target.value)} onFocus={() => { if (query.trim().length >= 2) setOpen(true); }} onKeyDown={onKeyDown} />{open && <div className="search-popover" role="listbox" aria-label="Lead search results">{state === "loading" && <div className="search-state">Searching…</div>}{state === "empty" && <div className="search-state">No matching leads.</div>}{state === "error" && <div className="search-state">Search unavailable.</div>}{state === "idle" && results.map((result, index) => <button key={result.id} type="button" role="option" aria-selected={index === activeIndex} className={index === activeIndex ? "search-result active" : "search-result"} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(result)}><span className="search-result-name">{result.name}</span><span className="search-result-meta">{result.company || "No company"} · {result.stage || "Unstaged"}</span></button>)}</div>}</>;
  return <div className={compact ? "global-search compact-search" : "global-search"} ref={wrapperRef}>{compact && !compactOpen ? <button className="search-trigger" type="button" aria-label="Open global search" title="Open global search" onClick={() => setCompactOpen(true)}>⌕</button> : searchField}</div>;
}

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const canCreateLead = usePermission("leads.edit");
  const showAdminNav = usePermission("nav.admin");
  const isAdminRole = user?.role?.trim().toLowerCase() === "admin";
  const { counts, loading: countsLoading } = useLeadNavCounts(showAdminNav);
  const { collapsedGroups, toggleNavGroup } = useNavGroupState();
  const [theme, setCurrentTheme] = useState(getTheme);
  const currentHref = `${location.pathname}${location.search}`;
  function toggleTheme() { const next = theme === "light" ? "dark" : "light"; setTheme(next); setCurrentTheme(next); }
  const adminNavbar = <Navbar collapsed={false} showAdmin={showAdminNav} includeCore={false} currentHref={currentHref} counts={counts} countsLoading={countsLoading} collapsedGroups={collapsedGroups} toggleNavGroup={toggleNavGroup} />;
  return <div className={showAdminNav ? "shell sidebar-shell admin-shell" : "shell sidebar-shell"}>
    <MasterSidebar currentHref={currentHref} showAdmin={showAdminNav} adminNavbar={adminNavbar} theme={theme} hideMasterNavigation={isAdminRole || location.pathname.startsWith("/admin/")} />
    <main className="main">
      <header className="topbar topbar-without-navigation">
        <Link className="topbar-logo" to="/leads" aria-label="Go to dashboard"><img className="brand-mark" src={theme === "dark" ? "/altus-lockup-white.webp" : "/altus-lockup.webp"} alt="" /><span>Altus <b>CRM</b></span></Link>
        <div className="topbar-right">
          <div className="top-actions">
            <GlobalSearch compact />
            {canCreateLead && <button className="top-action-button" type="button" onClick={() => navigate("/leads?new=1")}>＋ New lead</button>}
            <button className="top-action-icon" type="button" onClick={toggleTheme} aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`} title={`Switch to ${theme === "light" ? "dark" : "light"} theme`}>{theme === "light" ? "☾" : "☀"}</button>
            <AccountMenu theme={theme} onToggleTheme={toggleTheme} />
          </div>
        </div>
      </header>
      <section className="content"><Outlet /></section>
    </main>
  </div>;
}

export { NAV_ITEMS };
