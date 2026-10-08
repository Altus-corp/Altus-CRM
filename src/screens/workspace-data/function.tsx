import { useCallback, useEffect, useState } from "react";
import { api } from "../../shared/api/client";

export type WorkspaceRow = { id: string; name: string | null; company: string | null; stage: string | null; permission: string | null; owner_user_id: string | null; lead_status: string | null; updated_at: string | null };
type Response = { items: WorkspaceRow[]; total: number };

export function useWorkspaceData(view?: string) {
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setError(false);
    try { setData(await api<Response>(`/api/leads?page=1&page_size=100&sort=updated_at&direction=desc${view ? `&view=${encodeURIComponent(view)}` : ""}`)); } catch { setError(true); }
    finally { setLoading(false); }
  }, [view]);
  useEffect(() => { void load(); }, [load]);
  return { data, loading, error, reload: load };
}
