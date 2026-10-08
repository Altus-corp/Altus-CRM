import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../shared/api/client";

export type AdminScreenKey = "dashboard" | "call-history" | "analytics" | "assignment" | "panel" | "templates" | "import-export" | "integrations" | "audit" | "process-flow" | "reports";
type AdminValue = string | number | boolean | null;
type AdminRow = Record<string, AdminValue>;
type AdminResponse = { screen: AdminScreenKey; metrics?: AdminRow; rows?: AdminRow[]; rules?: AdminRow[]; note?: string };

export const ADMIN_SCREEN_COPY: Record<AdminScreenKey, { title: string; description: string }> = {
  dashboard: { title: "Today's Floor", description: "A live view of targets, calling activity, follow-ups, and the next work to do." },
  "call-history": { title: "Call history", description: "Review the imported call activity and its recorded outcomes." },
  analytics: { title: "Analytics", description: "See call volume and resolution mix for the workspace." },
  assignment: { title: "Assignment", description: "Review the current owner pool, unassigned work, and assignment rules." },
  panel: { title: "Admin Panel", description: "Manage the workspace members and review their access status." },
  templates: { title: "Templates", description: "Review the available communication templates and their channels." },
  "import-export": { title: "Import / Export", description: "Review the data movement workspace and its current availability." },
  integrations: { title: "Integrations", description: "Review connected integration names and enabled status." },
  audit: { title: "Audit Log", description: "Review append-only activity history for imported records." },
  "process-flow": { title: "Process Flow", description: "A compact map of the workspace lifecycle from acquisition to sale." },
  reports: { title: "Reports", description: "Review the main pipeline totals for the workspace." },
};

export function useAdminScreen(screen: AdminScreenKey) {
  const [data, setData] = useState<AdminResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [resetTarget, setResetTarget] = useState<{ id: string; name: string } | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetConfirmation, setResetConfirmation] = useState("");
  const [showResetPassword, setShowResetPassword] = useState(false);
  const copy = useMemo(() => ADMIN_SCREEN_COPY[screen], [screen]);
  const load = useCallback(async () => {
    setLoading(true); setError(false);
    try {
      setData(await api<AdminResponse>(`/api/admin/${screen}`));
    } catch {
      setData(null);
      setError(true);
    } finally { setLoading(false); }
  }, [screen]);
  useEffect(() => { void load(); }, [load]);
  function beginReset(memberId: string, memberName: string) { setResetTarget({ id: memberId, name: memberName }); setResetPassword(""); setResetConfirmation(""); setShowResetPassword(false); setError(false); }
  function cancelReset() { setResetTarget(null); setResetPassword(""); setResetConfirmation(""); setShowResetPassword(false); }
  async function submitReset(event: React.FormEvent) {
    event.preventDefault();
    if (!resetTarget || resetPassword.length < 12 || resetPassword !== resetConfirmation) return;
    setError(false);
    try { await api(`/api/users/${encodeURIComponent(resetTarget.id)}/reset-password`, { method: "POST", body: JSON.stringify({ temporary_password: resetPassword }) }); cancelReset(); }
    catch { setError(true); }
  }
  return { ...copy, data, loading, error, reload: load, resetTarget, resetPassword, resetConfirmation, showResetPassword, beginReset, cancelReset, setResetPassword, setResetConfirmation, setShowResetPassword, submitReset };
}
