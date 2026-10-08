import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./shared/auth/auth";
import { RequireAuth } from "./shared/auth/require-auth";
import { AppShell } from "./shared/layout/app-shell";
import { LoginPage } from "./screens/login/page";
import { SettingsPage } from "./screens/settings/page";
import { LeadsPage } from "./screens/leads/page";
import { MarketingPage } from "./screens/marketing/page";
import { ReportsPage } from "./screens/reports/page";
import { QuotesInvoicingPage } from "./screens/quotes-invoicing/page";
import { AccountsContactsPage } from "./screens/accounts-contacts/page";
import { TasksActivityPage } from "./screens/tasks-activity/page";
import "./shared/theme/tokens.css";

function App() { return <AuthProvider><Routes><Route path="/login" element={<LoginPage />} /><Route element={<RequireAuth><AppShell /></RequireAuth>}><Route path="/leads" element={<LeadsPage />} /><Route path="/marketing" element={<MarketingPage />} /><Route path="/reports" element={<ReportsPage />} /><Route path="/quotes-invoicing" element={<QuotesInvoicingPage />} /><Route path="/accounts-contacts" element={<AccountsContactsPage />} /><Route path="/tasks-activity" element={<TasksActivityPage />} /><Route path="/settings" element={<SettingsPage />} /><Route path="*" element={<Navigate to="/leads" replace />} /></Route></Routes></AuthProvider>; }
ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><BrowserRouter><App /></BrowserRouter></React.StrictMode>);
