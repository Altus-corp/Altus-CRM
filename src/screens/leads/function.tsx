import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../shared/api/client";

export type Lead = { id: string; source_id: string; name: string; email: string | null; company: string | null; phone: string | null; stage: string | null; permission: string | null; lead_status: string | null; owner_user_id: string | null; pso_date: string | null; next_follow_up_at: string | null; last_call_at: string | null; updated_at: string | null; is_pre_ps_done: boolean | null };
export type LeadDetailResponse = { lead: Lead & Record<string, unknown>; calls: Record<string, unknown>[]; followups: Record<string, unknown>[]; history: Record<string, unknown>[]; messages: Record<string, unknown>[] };
export type LeadsResponse = { items: Lead[]; page: number; page_size: number; total: number; sort: string; direction: string; view: string | null };
export type LeadFilters = { q: string; stage: string; permission: string; owner: string; lead_status: string; pso_date_from: string; pso_date_to: string; next_follow_up: string };
const EMPTY_FILTERS: LeadFilters = { q: "", stage: "", permission: "", owner: "", lead_status: "", pso_date_from: "", pso_date_to: "", next_follow_up: "" };
export const LEAD_VIEWS = [["", "All Leads"], ["database", "Database"], ["new_leads", "New Leads"], ["qualified", "Qualified"], ["references", "References"], ["permission_granted", "Permission"], ["permission_pending", "Permission Pending"], ["calling_queue", "Calling Queue"], ["registered", "Registered"], ["pre_pso", "Pre PSO"], ["during_pso", "During PSO"], ["attended", "Attended"], ["not_attended", "Not Attended"], ["sale_registration", "Sale / Registration"], ["pre_ps", "Pre PS"]] as const;

function formatDate(value: string | null | undefined) { return value ? new Date(value).toLocaleDateString() : "—"; }

export function useLeadsScreen() {
  const [view, setView] = useState(""); const [filters, setFilters] = useState<LeadFilters>(EMPTY_FILTERS); const [page, setPage] = useState(1);
  const [data, setData] = useState<LeadsResponse | null>(null); const [detail, setDetail] = useState<LeadDetailResponse | null>(null);
  const [loading, setLoading] = useState(true); const [detailLoading, setDetailLoading] = useState(false); const [error, setError] = useState("");
  const query = useMemo(() => { const params = new URLSearchParams({ page: String(page), page_size: "50", sort: "updated_at", direction: "desc" }); if (view) params.set("view", view); Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); }); return params.toString(); }, [filters, page, view]);
  const load = useCallback(async () => { setLoading(true); setError(""); try { setData(await api<LeadsResponse>(`/api/leads?${query}`)); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load leads."); } finally { setLoading(false); } }, [query]);
  useEffect(() => { void load(); }, [load]);
  const openDetail = useCallback(async (id: string) => { setDetailLoading(true); setError(""); try { setDetail(await api<LeadDetailResponse>(`/api/leads/${encodeURIComponent(id)}`)); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load the lead."); } finally { setDetailLoading(false); } }, []);
  function updateFilter(key: keyof LeadFilters, value: string) { setPage(1); setFilters((current) => ({ ...current, [key]: value })); }
  const totalPages = Math.max(1, Math.ceil((data?.total || 0) / (data?.page_size || 50)));
  return { data, detail, detailLoading, error, filters, loading, page, totalPages, view, views: LEAD_VIEWS, formatDate, load, openDetail, closeDetail: () => setDetail(null), chooseView: (next: string) => { setPage(1); setView(next); }, updateFilter, previousPage: () => setPage((value) => Math.max(1, value - 1)), nextPage: () => setPage((value) => Math.min(totalPages, value + 1)) };
}
