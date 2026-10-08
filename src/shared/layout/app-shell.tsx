import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Navbar, NAV_ITEMS } from "./nav.js";
import { useAuth } from "../auth/auth";
import "./app-shell.css";

export function AppShell() {
  const location = useLocation();
  const { user } = useAuth();
  const current = NAV_ITEMS.find(([to]) => location.pathname.startsWith(to))?.[1] || "Settings";
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">Altus <span>CRM</span></div>
        <Navbar />
      </aside>
      <main className="main"><header className="topbar"><div className="crumb"><span>Altus CRM</span><b>{current}</b></div><NavLink className="account-link" to="/settings">{user?.name || "Account"}</NavLink></header><section className="content"><Outlet /></section></main>
    </div>
  );
}

export { NAV_ITEMS };
