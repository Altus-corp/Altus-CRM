import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../shared/api/client";

export type AdminScreenKey = "dashboard" | "call-history" | "analytics" | "assignment" | "panel" | "templates" | "import-export" | "integrations" | "audit" | "process-flow" | "reports";
type AdminValue = string | number | boolean | null;
type AdminRow = Record<string, AdminValue>;
type AdminResponse = { screen: AdminScreenKey; metrics?: AdminRow; rows?: AdminRow[]; rules?: AdminRow[]; note?: string };
type LeadsFallback = { items: Array<Record<string, unknown>>; total: number };
function adminValue(value: unknown): AdminValue { if (value === null || value === undefined) return null; if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value; return String(value); }

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
      if (screen === "panel") {
        try { const members = await api<{ users: AdminRow[] }>("/api/users"); setData({ screen, rows: members.users, note: "Showing current workspace members." }); return; } catch { setData({ screen, rows: [], note: "No member data is available." }); return; }
      }
      if (["templates", "import-export", "integrations", "audit", "process-flow"].includes(screen)) {
        const notes: Record<string, string> = {
          templates: "No imported template records are available yet.",
          "import-export": "No import or export history is available yet.",
          integrations: "No integration catalog records are available yet.",
          audit: "No audit records are available yet.",
          "process-flow": "The process flow is available after the legacy process configuration is imported.",
        };
        setData({ screen, rows: [], note: notes[screen] }); return;
      }
      try {
        const fallback = await api<LeadsFallback>("/api/leads?page=1&page_size=100&sort=updated_at&direction=desc");
        const rows = fallback.items.map((lead) => ({ id: adminValue(lead.id), name: adminValue(lead.name), company: adminValue(lead.company), stage: adminValue(lead.stage), permission: adminValue(lead.permission), owner: adminValue(lead.owner_user_id), status: adminValue(lead.lead_status), updated: adminValue(lead.updated_at) }));
        setData({ screen, metrics: { total_leads: fallback.total }, rows, note: "Showing the imported lead dataset while this admin module is being connected." });
      } catch { setData(null); setError(true); }
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
