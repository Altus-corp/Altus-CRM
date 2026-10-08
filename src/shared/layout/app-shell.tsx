import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Navbar, NAV_ITEMS, navLabelForHref } from "./nav";
import { useLeadNavCounts, useNavGroupState } from "./function";
import { useAuth } from "../auth/auth";
import { displayRole, usePermission } from "../auth/permissions";
import { signOut } from "../auth/sign-out";
import { api } from "../api/client";
import { getTheme, setTheme } from "../theme/theme";
import "./app-shell.css";

type SearchResult = { id: string; name: string; company: string | null; stage: string | null };

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
  return <div className="account-menu-wrap" ref={menuRef}>
    <button ref={buttonRef} className="account-menu-button" type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => open ? closeMenu() : openMenu()} onKeyDown={buttonKeyDown}>{accountName && <span>{accountName}</span>}<span className="role-badge">{roleLabel}</span><span className="account-menu-chevron" aria-hidden="true">⌄</span></button>
    {open && <div className="account-menu" role="menu" aria-label="Account menu"><div className="account-menu-identity"><strong>{user?.name || roleLabel}</strong><span>{user?.email || ""}</span></div><button ref={(element) => { itemRefs.current[0] = element; }} role="menuitem" type="button" onClick={goAccount} onKeyDown={(event) => itemKeyDown(event, 0)}>Account</button><button ref={(element) => { itemRefs.current[1] = element; }} role="menuitem" type="button" onClick={onToggleTheme} onKeyDown={(event) => itemKeyDown(event, 1)}>Theme: {theme === "light" ? "Light" : "Dark"}</button><button ref={(element) => { itemRefs.current[2] = element; }} role="menuitem" type="button" onClick={handleSignOut} onKeyDown={(event) => itemKeyDown(event, 2)}>Sign out</button></div>}
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
  const [activeIndex, setActiveIndex] = useState(-1);
  useEffect(() => { const closeOnOutside = (event: MouseEvent) => { if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false); }; document.addEventListener("mousedown", closeOnOutside); return () => document.removeEventListener("mousedown", closeOnOutside); }, []);
  useEffect(() => { const value = query.trim(); if (value.length < 2) { setResults([]); setState("idle"); setOpen(false); return; } setOpen(true); setState("loading"); setActiveIndex(-1); const timer = window.setTimeout(() => { void api<{ items: SearchResult[] }>(`/api/leads?search=${encodeURIComponent(value)}`).then((response) => { const next = response.items.slice(0, 8); setResults(next); setState(next.length ? "idle" : "empty"); }).catch(() => { setResults([]); setState("error"); }); }, 250); return () => window.clearTimeout(timer); }, [query]);
  function choose(result: SearchResult) { setOpen(false); setQuery(""); navigate(`/leads?open=${encodeURIComponent(result.id)}`); }
  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) { if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); setActiveIndex((value) => Math.min(value + 1, results.length - 1)); } else if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((value) => Math.max(value - 1, 0)); } else if (event.key === "Enter" && activeIndex >= 0 && results[activeIndex]) { event.preventDefault(); choose(results[activeIndex]); } else if (event.key === "Escape") { event.preventDefault(); setOpen(false); inputRef.current?.focus(); } }
  return <div className="global-search" ref={wrapperRef}><span className="global-search-icon" aria-hidden="true">⌕</span><input ref={inputRef} value={query} aria-label="Search leads" placeholder="Search any record - name, company, phone, remark..." onChange={(event) => setQuery(event.target.value)} onFocus={() => { if (query.trim().length >= 2) setOpen(true); }} onKeyDown={onKeyDown} />{open && <div className="search-popover" role="listbox" aria-label="Lead search results">{state === "loading" && <div className="search-state">Searching…</div>}{state === "empty" && <div className="search-state">No matching leads.</div>}{state === "error" && <div className="search-state">Search unavailable.</div>}{state === "idle" && results.map((result, index) => <button key={result.id} type="button" role="option" aria-selected={index === activeIndex} className={index === activeIndex ? "search-result active" : "search-result"} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(result)}><span className="search-result-name">{result.name}</span><span className="search-result-meta">{result.company || "No company"} · {result.stage || "Unstaged"}</span></button>)}</div>}</div>;
}

function readCollapsed() { try { return window.localStorage.getItem("altus.crm.sidebar-collapsed") === "1"; } catch { return false; } }
function writeCollapsed(value: boolean) { try { window.localStorage.setItem("altus.crm.sidebar-collapsed", value ? "1" : "0"); } catch {} }
function userInitials(name: string | undefined) { return String(name || "A").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "A"; }

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const canCreateLead = usePermission("leads.edit");
  const showAdminNav = usePermission("nav.admin");
  const { counts, loading: countsLoading } = useLeadNavCounts();
  const { collapsedGroups, toggleNavGroup } = useNavGroupState();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [theme, setCurrentTheme] = useState(getTheme);
  const currentHref = `${location.pathname}${location.search}`;
  const current = navLabelForHref(currentHref) || (location.pathname.startsWith("/account") ? "Account" : "Settings");
  function toggleCollapsed() { setCollapsed((value) => { const next = !value; writeCollapsed(next); return next; }); }
  function toggleTheme() { const next = theme === "light" ? "dark" : "light"; setTheme(next); setCurrentTheme(next); }
  return <div className={collapsed ? "shell sidebar-is-collapsed" : "shell"}><aside className="sidebar"><div className="sidebar-head"><div className="workspace"><strong>Altus CRM</strong><span>Sales workspace</span></div><button className="collapse-button" type="button" onClick={toggleCollapsed} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>{collapsed ? "›" : "‹"}</button></div><Navbar collapsed={collapsed} showAdmin={showAdminNav} currentHref={currentHref} counts={counts} countsLoading={countsLoading} collapsedGroups={collapsedGroups} toggleNavGroup={toggleNavGroup} /><div className="sidebar-user"><div className="avatar" aria-hidden="true">{userInitials(user?.name)}</div><div className="sidebar-user-copy"><strong>{user?.name || "Account"}</strong><span>{displayRole(user?.role)}</span></div><button className="logout-icon" type="button" title="Sign out" aria-label="Sign out" onClick={() => void signOut(logout, navigate)}>↪</button></div></aside><main className="main"><header className="topbar"><Link className="topbar-logo" to="/leads" aria-label="Go to dashboard"><span className="logo-mark">A</span><span>Altus <b>CRM</b></span></Link><div className="crumb"><span>Altus /</span><b>{current}</b></div><GlobalSearch /><div className="top-actions">{canCreateLead && <button className="top-action-button" type="button" disabled title="Coming soon">＋ New lead</button>}<button className="top-action-icon" type="button" onClick={toggleTheme} aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`} title={`Switch to ${theme === "light" ? "dark" : "light"} theme`}>{theme === "light" ? "☾" : "☀"}</button><AccountMenu theme={theme} onToggleTheme={toggleTheme} /></div></header><section className="content"><Outlet /></section></main></div>;
}

export { NAV_ITEMS };
