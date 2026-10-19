import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./shared/auth/auth";
import { RequireAuth } from "./shared/auth/require-auth";
import { RequireCapability } from "./shared/auth/require-capability";
import { AppShell } from "./shared/layout/app-shell";
import { LoginPage } from "./screens/login/page";
import { SettingsPage } from "./screens/settings/page";
import { AccountPage } from "./screens/account/page";
import { LeadsPage } from "./screens/leads/page";
import { ProductMasterPage } from "./screens/product-master/page";
import { MarketingPage } from "./screens/marketing/page";
import { ReportsPage } from "./screens/reports/page";
import { QuotesInvoicingPage } from "./screens/quotes-invoicing/page";
import { AccountsContactsPage } from "./screens/accounts-contacts/page";
import { TasksActivityPage } from "./screens/tasks-activity/page";
import { usePermission } from "./shared/auth/permissions";
import { topbarModuleRedirect } from "./shared/layout/nav-access";
import { AdminPage } from "./screens/admin/page";
import { ChangePasswordPage } from "./screens/change-password/page";
import { ForgotPasswordPage, ResetPasswordPage } from "./screens/password-reset/page";
import "./shared/theme/tokens.css";

const adminScreen = (screen: import("./screens/admin/function").AdminScreenKey) => <RequireCapability capability="nav.admin"><AdminPage screen={screen} /></RequireCapability>;
function hasAllLeadsAccess(role: string | undefined) { return ["owner", "admin", "super admin"].includes(String(role || "").trim().toLowerCase()); }
function LeadsRoute() { const { user } = useAuth(); const location = useLocation(); return hasAllLeadsAccess(user?.role) ? <LeadsPage /> : <Navigate to={`/lead-master${location.search}`} replace />; }
function DefaultRoute() { const { user } = useAuth(); return <Navigate to={hasAllLeadsAccess(user?.role) ? "/leads" : "/lead-master"} replace />; }
function RequireTopbarModuleAccess({ children }: { children: React.ReactNode }) { const { loading } = useAuth(); const location = useLocation(); const canManageNavigation = usePermission("nav.admin"); if (loading) return null; const redirect = topbarModuleRedirect(location.pathname, canManageNavigation); return redirect ? <Navigate to={redirect} replace /> : <>{children}</>; }
const protectedScreen = (screen: React.ReactNode) => <RequireTopbarModuleAccess>{screen}</RequireTopbarModuleAccess>;
function App() { return <AuthProvider><Routes><Route path="/login" element={<LoginPage />} /><Route path="/forgot-password" element={<ForgotPasswordPage />} /><Route path="/reset-password" element={<ResetPasswordPage />} /><Route path="/change-password" element={<RequireAuth><ChangePasswordPage /></RequireAuth>} /><Route element={<RequireAuth><AppShell /></RequireAuth>}><Route path="/leads" element={<LeadsRoute />} /><Route path="/lead-master" element={<LeadsPage forcedWorkQueue="lead_master" />} /><Route path="/product-master" element={<ProductMasterPage />} /><Route path="/marketing/*" element={protectedScreen(<MarketingPage />)} /><Route path="/reports" element={<ReportsPage />} /><Route path="/quotes-invoicing/*" element={protectedScreen(<QuotesInvoicingPage />)} /><Route path="/accounts-contacts/*" element={protectedScreen(<AccountsContactsPage />)} /><Route path="/tasks-activity/*" element={protectedScreen(<TasksActivityPage />)} /><Route path="/settings" element={<SettingsPage />} /><Route path="/account" element={<AccountPage />} /><Route path="/admin/dashboard" element={adminScreen("dashboard")} /><Route path="/admin/assignment" element={adminScreen("assignment")} /><Route path="/admin/panel" element={adminScreen("panel")} /><Route path="/admin/users" element={adminScreen("user-management")} /><Route path="/admin/templates" element={adminScreen("templates")} /><Route path="/admin/import-export" element={adminScreen("import-export")} /><Route path="/admin/integrations" element={adminScreen("integrations")} /><Route path="/admin/audit" element={adminScreen("audit")} /><Route path="/admin/dropdowns" element={adminScreen("dropdown-management")} /><Route path="/admin/process-flow" element={adminScreen("process-flow")} /><Route path="/admin/database-status" element={adminScreen("database-status")} /><Route path="*" element={<DefaultRoute />} /></Route></Routes></AuthProvider>; }
ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><BrowserRouter><App /></BrowserRouter></React.StrictMode>);
