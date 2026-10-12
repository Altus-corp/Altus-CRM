import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../../shared/api/client";
import { useAuth } from "../../shared/auth/auth";
import { displayRole, usePermission } from "../../shared/auth/permissions";
import { useDropdown, type DropdownOption } from "../../shared/dropdowns/client";

const DEFAULT_PAGE_SIZE_OPTIONS: DropdownOption[] = [];

export type Lead = { id: string; source_id: string; name: string; first_name?: string | null; last_name?: string | null; email: string | null; company: string | null; phone: string | null; stage: string | null; permission: string | null; lead_status: string | null; owner_user_id: string | null; pso_date: string | null; next_follow_up_at: string | null; last_call_at: string | null; updated_at: string | null; is_pre_ps_done: boolean | null; lead_no: string | null; lead_type: string | null; lead_source: string | null; source_system: string | null; designation: string | null; city: string | null; custom_values?: Record<string, unknown>; legacy_finance?: Record<string, unknown> };
export type LeadDetailResponse = { lead: Lead & Record<string, unknown>; calls: Record<string, unknown>[]; followups: Record<string, unknown>[]; history: Record<string, unknown>[]; messages: Record<string, unknown>[]; products: Record<string, unknown>[] };
export type ActivityKind = "history" | "calls" | "followups" | "messages" | "notes";
export type ActivityResponse = { items: Record<string, unknown>[]; page: number; page_size: number; total: number };
export type BulkImportPreview = { file_hash: string; extension: string; sheet_note: string | null; total_rows: number; valid: number; errors: number; possible_duplicates: number; duplicate_rows: Array<{ row: number; reason: string | undefined }>; ignored_columns: string[]; preview_rows: Record<string, unknown>[]; error_rows: Array<{ row: number; errors: string[] }>; can_apply: boolean };
export type BulkImportResult = { import_run_id: string; total_rows: number; created: number; skipped_duplicates: number; skipped_errors: number; errors: string[] };
export type LeadsResponse = { items: Lead[]; page: number; page_size: number; total: number; sort: string; direction: string; view: string | null };
export type LeadFilters = { q: string; stage: string; permission: string; owner: string; lead_status: string; pso_date_from: string; pso_date_to: string; next_follow_up: string };
export type QuickFilterCondition = { id: string; field: string; operator: string; value: string };
export type SavedLeadFilter = { id: string; name: string; view: string; filters: LeadFilters; conditions?: QuickFilterCondition[]; join?: "AND" | "OR"; created_at?: string; updated_at?: string };
const DATE_FILTER_FIELDS = new Set(["pso_date", "next_follow_up_at"]);
export function isQuickFilterDateField(key: string) { return DATE_FILTER_FIELDS.has(key); }
export type QuickFiltersResponse = { items: SavedLeadFilter[] };
type LeadViewKey = (typeof LEAD_VIEWS)[number][0];
type ViewGroup = { label: string; views: readonly (readonly [LeadViewKey, string])[] };
const EMPTY_FILTERS: LeadFilters = { q: "", stage: "", permission: "", owner: "", lead_status: "", pso_date_from: "", pso_date_to: "", next_follow_up: "" };
export type LeadField = { key: string; label: string };
export const VIEW_FIELDS: Record<string, readonly LeadField[]> = {
  database: [{ key: "leadNo", label: "Lead no" }, { key: "leadTypeCode", label: "Lead type" }, { key: "name", label: "Name" }, { key: "cellNo", label: "Cell no" }, { key: "email", label: "Email" }, { key: "city", label: "City" }, { key: "leadSource", label: "Lead source" }, { key: "sourceSystem", label: "Source system" }, { key: "leadAcquiredDate", label: "Acquired" }, { key: "permission", label: "Permission" }],
  new_leads: [{ key: "leadNo", label: "Lead no" }, { key: "leadTypeCode", label: "Lead type" }, { key: "name", label: "Name" }, { key: "company", label: "Company" }, { key: "cellNo", label: "Cell no" }, { key: "designation", label: "Designation" }, { key: "businessCategory", label: "Business category" }, { key: "leadSource", label: "Lead source" }, { key: "rating", label: "Rating" }, { key: "permission", label: "Permission" }, { key: "lastCalledOn", label: "Last called" }],
  permission_granted: [{ key: "leadNo", label: "Lead no" }, { key: "name", label: "Name" }, { key: "company", label: "Company" }, { key: "cellNo", label: "Cell no" }, { key: "email", label: "Email" }, { key: "designation", label: "Designation" }, { key: "businessCategory", label: "Business category" }, { key: "natureOfBusiness", label: "Nature of business" }, { key: "service", label: "Service" }, { key: "permission", label: "Permission" }, { key: "owner", label: "Owner" }],
  permission_pending: [{ key: "leadNo", label: "Lead no" }, { key: "leadAcquiredDate", label: "Acquired" }, { key: "name", label: "Name" }, { key: "company", label: "Company" }, { key: "cellNo", label: "Cell no" }, { key: "email", label: "Email" }, { key: "designation", label: "Designation" }, { key: "businessCategory", label: "Business category" }, { key: "permission", label: "Permission" }, { key: "owner", label: "Owner" }],
  calling_queue: [{ key: "leadNo", label: "Lead no" }, { key: "name", label: "Name" }, { key: "company", label: "Company" }, { key: "cellNo", label: "Cell no" }, { key: "email", label: "Email" }, { key: "designation", label: "Designation" }, { key: "leadSource", label: "Lead source" }, { key: "permission", label: "Permission" }, { key: "owner", label: "Owner" }, { key: "lastCalledOn", label: "Last called" }, { key: "callingResolution", label: "Calling resolution" }, { key: "priority", label: "Priority" }, { key: "callingRemarks", label: "Calling remarks" }],
  daily_call_chart: [{ key: "leadNo", label: "Lead no" }, { key: "name", label: "Name" }, { key: "company", label: "Company" }, { key: "cellNo", label: "Cell no" }, { key: "email", label: "Email" }, { key: "designation", label: "Designation" }, { key: "leadSource", label: "Lead source" }, { key: "permission", label: "Permission" }, { key: "owner", label: "Owner" }, { key: "lastCalledOn", label: "Last called" }, { key: "callingResolution", label: "Calling resolution" }, { key: "priority", label: "Priority" }, { key: "callingRemarks", label: "Calling remarks" }],
  registered: [{ key: "leadNo", label: "Lead no" }, { key: "psoDate", label: "PSO date" }, { key: "name", label: "Name" }, { key: "company", label: "Company" }, { key: "cellNo", label: "Cell no" }, { key: "email", label: "Email" }, { key: "city", label: "City" }, { key: "registrationTime", label: "Registration time" }, { key: "approvalStatus", label: "Approval status" }, { key: "zoomOrPhysical", label: "Zoom / physical" }, { key: "owner", label: "Owner" }],
  pre_pso: [{ key: "leadNo", label: "Lead no" }, { key: "psoDate", label: "PSO date" }, { key: "name", label: "Name" }, { key: "company", label: "Company" }, { key: "cellNo", label: "Cell no" }, { key: "email", label: "Email" }, { key: "city", label: "City" }, { key: "approvalStatus", label: "Approval status" }, { key: "confirmationCallStatus", label: "Confirmation" }, { key: "zoomLinkSent", label: "Zoom link sent" }, { key: "attendanceStatus", label: "Attendance" }, { key: "salesFollowUpBy", label: "Sales follow-up" }, { key: "salesResolution", label: "Sales resolution" }],
  during_pso: [{ key: "leadNo", label: "Lead no" }, { key: "psoDate", label: "PSO date" }, { key: "name", label: "Name" }, { key: "company", label: "Company" }, { key: "cellNo", label: "Cell no" }, { key: "city", label: "City" }, { key: "confirmationCallStatus", label: "Confirmation" }, { key: "zoomLinkSent", label: "Zoom link sent" }, { key: "attendanceStatus", label: "Attendance" }, { key: "cameraOn", label: "Camera on" }, { key: "salesFollowUpBy", label: "Sales follow-up" }, { key: "salesResolution", label: "Sales resolution" }],
  attended: [{ key: "leadNo", label: "Lead no" }, { key: "psoDate", label: "PSO date" }, { key: "name", label: "Name" }, { key: "company", label: "Company" }, { key: "cellNo", label: "Cell no" }, { key: "email", label: "Email" }, { key: "city", label: "City" }, { key: "attendanceStatus", label: "Attendance" }, { key: "cameraOn", label: "Camera on" }, { key: "photoTaken", label: "Photo taken" }, { key: "salesFollowUpBy", label: "Sales follow-up" }, { key: "salesResolution", label: "Sales resolution" }, { key: "salesNotes", label: "Sales notes" }],
  not_attended: [{ key: "leadNo", label: "Lead no" }, { key: "psoDate", label: "PSO date" }, { key: "name", label: "Name" }, { key: "company", label: "Company" }, { key: "cellNo", label: "Cell no" }, { key: "confirmationCallStatus", label: "Confirmation" }, { key: "attendanceStatus", label: "Attendance" }, { key: "leftHalfway", label: "Left halfway" }, { key: "salesFollowUpBy", label: "Sales follow-up" }, { key: "salesResolution", label: "Sales resolution" }, { key: "nextFollowUpAt", label: "Next follow-up" }, { key: "owner", label: "Owner" }],
  sale_registration: [{ key: "leadNo", label: "Lead no" }, { key: "psoDate", label: "PSO date" }, { key: "name", label: "Name" }, { key: "company", label: "Company" }, { key: "cellNo", label: "Cell no" }, { key: "attendanceStatus", label: "Attendance" }, { key: "photoTaken", label: "Photo taken" }, { key: "salesFollowUpBy", label: "Sales follow-up" }, { key: "salesResolution", label: "Sales resolution" }, { key: "totalPayable", label: "Total payable" }, { key: "amountPaid", label: "Amount paid" }, { key: "balanceReceivable", label: "Balance" }, { key: "targetDate", label: "Target date" }, { key: "salesNotes", label: "Sales notes" }],
};
export const LEAD_VIEWS = [["", "All Leads"], ["database", "Database"], ["new_leads", "New Leads"], ["qualified", "Qualified"], ["references", "References"], ["permission_granted", "Permission to Call"], ["permission_pending", "Permission Pending"], ["calling_queue", "Calling Sheet"], ["daily_call_chart", "Daily Call Chart"], ["registered", "PS Registration"], ["pre_pso", "Pre PSO"], ["during_pso", "During PSO"], ["attended", "PSO Attended"], ["not_attended", "PSO Not Attended"], ["sale_registration", "Sale / Registration"], ["pre_ps", "Pre PS"]] as const;
const viewByKey = new Map(LEAD_VIEWS.map((option) => [option[0], option]));
export const LEAD_VIEW_GROUPS: readonly ViewGroup[] = [
  { label: "Pipeline", views: (["", "database", "new_leads", "qualified", "references"] as const).map((key) => viewByKey.get(key)!) },
  { label: "Permission", views: (["permission_granted", "permission_pending", "calling_queue"] as const).map((key) => viewByKey.get(key)!) },
  { label: "Registration and PSO", views: (["registered", "pre_ps", "pre_pso", "during_pso", "attended", "not_attended", "sale_registration"] as const).map((key) => viewByKey.get(key)!) },
];
const VIEW_OPTIONS = LEAD_VIEW_GROUPS.flatMap((group) => group.views);


function formatDate(value: string | null | undefined) { return value ? new Date(value).toLocaleDateString() : "—"; }

export function useLeadsScreen() {
  const { user } = useAuth();
  const leadTypeDropdown = useDropdown("lead_type");
  const stageDropdown = useDropdown("lead_stage");
  const permissionDropdown = useDropdown("permission");
  const joinDropdown = useDropdown("filter_join_operator");
  const filterFieldDropdown = useDropdown("filter_field");
  const filterOperatorDropdown = useDropdown("filter_operator");
  const pageSizeDropdown = useDropdown("page_size");
  const relatedActivityDropdown = useDropdown("related_activity");
  const noteVisibilityDropdown = useDropdown("note_visibility");
  const notifyBeforeDropdown = useDropdown("notify_before");
  const canChangePermission = usePermission("leads.permission");
  const canCall = usePermission("leads.call");
  const canImport = usePermission("leads.import");
  const canAssign = usePermission("leads.assign");
  const bulkImportLabel = canImport ? "Bulk upload leads" : `Not available for your role (${displayRole(user?.role)})`;
  const canConvertAccount = usePermission("accounts.create") && usePermission("contacts.create");
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedView = searchParams.get("view") || "";
  const initialView = LEAD_VIEWS.some(([key]) => key === requestedView) ? requestedView : "";
  const [view, setView] = useState(initialView); const [filters, setFilters] = useState<LeadFilters>(EMPTY_FILTERS); const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState<number | "all">(50);
  const [advancedConditions, setAdvancedConditions] = useState<QuickFilterCondition[]>([]); const [draftConditions, setDraftConditions] = useState<QuickFilterCondition[]>([]); const [advancedJoin, setAdvancedJoin] = useState<"AND" | "OR">("AND"); const [draftJoin, setDraftJoin] = useState<"AND" | "OR">("AND");
  const [savedFilters, setSavedFilters] = useState<SavedLeadFilter[]>([]); const [quickFilterLoading, setQuickFilterLoading] = useState(true); const [advancedOpen, setAdvancedOpen] = useState(false); const [editingQuickFilter, setEditingQuickFilter] = useState<string | null>(null); const [toast, setToast] = useState("");
  const [data, setData] = useState<LeadsResponse | null>(null); const [detail, setDetail] = useState<LeadDetailResponse | null>(null);
  const [activityKind, setActivityKind] = useState<ActivityKind | null>(null); const [activityItems, setActivityItems] = useState<Record<string, unknown>[]>([]); const [activityPage, setActivityPage] = useState(1); const [activityTotal, setActivityTotal] = useState(0); const [activityLoading, setActivityLoading] = useState(false); const [activityError, setActivityError] = useState(""); const [activityForm, setActivityForm] = useState({ body: "", happened_at: "", duration_seconds: "", resolution: "", due_at: "", note: "" });
  const [viewCounts, setViewCounts] = useState<Record<string, number | null>>(() => Object.fromEntries(LEAD_VIEWS.map(([key]) => [key, null])));
  const [viewMenuOpen, setViewMenuOpen] = useState(false); const [activeViewIndex, setActiveViewIndex] = useState(0);
  const [loading, setLoading] = useState(true); const [detailLoading, setDetailLoading] = useState(false); const [error, setError] = useState("");
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false); const [bulkFile, setBulkFile] = useState<File | null>(null); const [bulkPreview, setBulkPreview] = useState<BulkImportPreview | null>(null); const [bulkResult, setBulkResult] = useState<BulkImportResult | null>(null); const [bulkLoading, setBulkLoading] = useState(false); const [bulkError, setBulkError] = useState(""); const [bulkAllowDuplicates, setBulkAllowDuplicates] = useState(false);
  const [newLeadForm, setNewLeadForm] = useState({ name: "", email: "", phone: "", company: "", team: "", lead_type: "", permission: "", products: "" });
  const [editing, setEditing] = useState(false); const [editForm, setEditForm] = useState({ name: "", email: "", phone: "", company: "", lead_type: "" });
  const [userOptions, setUserOptions] = useState<DropdownOption[]>([]);
  useEffect(() => { void api<{ options: Array<{ id: string; name: string }> }>("/api/user-options").then((response) => setUserOptions((response.options || []).map((option, index) => ({ id: option.id, dropdown_id: "api-users", label: option.name, value: option.id, semantic_key: null, sort_order: index, is_active: true })))).catch(() => setUserOptions([])); }, []);
  useEffect(() => { setNewLeadForm((current) => ({ ...current, lead_type: current.lead_type || leadTypeDropdown.defaultValue, permission: current.permission || permissionDropdown.defaultValue })); }, [leadTypeDropdown.defaultValue, permissionDropdown.defaultValue]);
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [selectAllView, setSelectAllView] = useState(false);
  const toggleSelectLead = useCallback((id: string, visibleIds: string[] = []) => {
    if (selectAllView) {
      setSelectAllView(false);
      setSelectedLeadIds(visibleIds.filter((item) => item !== id));
      return;
    }
    setSelectedLeadIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }, [selectAllView]);
  const toggleSelectAll = useCallback((visibleIds: string[]) => {
    if (selectAllView) {
      setSelectAllView(false);
      setSelectedLeadIds([]);
      return;
    }
    setSelectAllView(true);
    setSelectedLeadIds(visibleIds);
  }, [selectAllView]);
  const clearSelection = useCallback(() => {
    setSelectAllView(false);
    setSelectedLeadIds([]);
  }, []);
  useEffect(() => {
    setSelectedLeadIds([]);
    setSelectAllView(false);
  }, [view, filters]);
  const viewMenuRef = useRef<HTMLDivElement>(null); const viewButtonRef = useRef<HTMLButtonElement>(null); const viewOptionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const queryParams = useMemo(() => { const params = new URLSearchParams({ sort: "updated_at", direction: "desc" }); Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); }); if (advancedConditions.length) params.set("advanced", JSON.stringify({ conditions: advancedConditions.map(({ id: _id, ...condition }) => condition), join: advancedJoin })); return params; }, [advancedConditions, advancedJoin, filters]);
  const query = useMemo(() => { const params = new URLSearchParams(queryParams); params.set("page", String(page)); params.set("page_size", String(pageSize)); if (view) params.set("view", view); return params.toString(); }, [page, pageSize, queryParams, view]);
  const countQueries = useMemo(() => LEAD_VIEWS.map(([key]) => { const params = new URLSearchParams(queryParams); params.set("page", "1"); params.set("page_size", "1"); if (key) params.set("view", key); return [key, params.toString()] as const; }), [queryParams]);
  const load = useCallback(async () => { setLoading(true); setError(""); try { const [nextData, ...countResponses] = await Promise.all([api<LeadsResponse>(`/api/leads?${query}`), ...countQueries.map(([, countQuery]) => api<LeadsResponse>(`/api/leads?${countQuery}`))]); setData(nextData); setViewCounts(Object.fromEntries(countQueries.map(([key], index) => [key, countResponses[index].total]))); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load leads."); } finally { setLoading(false); } }, [countQueries, query]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setView(LEAD_VIEWS.some(([key]) => key === requestedView) ? requestedView : ""); setPage(1); }, [requestedView]);
  useEffect(() => { if (!viewMenuOpen) return; const closeOnOutside = (event: MouseEvent) => { if (!viewMenuRef.current?.contains(event.target as Node)) setViewMenuOpen(false); }; document.addEventListener("mousedown", closeOnOutside); return () => document.removeEventListener("mousedown", closeOnOutside); }, [viewMenuOpen]);
  useEffect(() => { if (viewMenuOpen) requestAnimationFrame(() => viewOptionRefs.current[activeViewIndex]?.focus()); }, [activeViewIndex, viewMenuOpen]);
  useEffect(() => { let live = true; void api<QuickFiltersResponse>("/api/lead-quick-filters").then((response) => { if (live) setSavedFilters(response.items || []); }).catch((cause) => { if (live) setError(cause instanceof Error ? cause.message : "Unable to load quick filters."); }).finally(() => { if (live) setQuickFilterLoading(false); }); return () => { live = false; }; }, []);
  function showToast(message: string) { setToast(message); window.setTimeout(() => setToast((current) => current === message ? "" : current), 2600); }
  const openDetail = useCallback(async (id: string) => { setDetailLoading(true); setError(""); try { const response = await api<LeadDetailResponse>(`/api/leads/${encodeURIComponent(id)}`); setDetail(response); setEditForm({ name: response.lead.name || "", email: response.lead.email || "", phone: response.lead.phone || "", company: response.lead.company || "", lead_type: response.lead.lead_type || "" }); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load the lead."); } finally { setDetailLoading(false); } }, []);
  const loadActivity = useCallback(async (kind: ActivityKind, nextPage = 1) => { if (!detail) return; setActivityKind(kind); setActivityPage(nextPage); setActivityLoading(true); setActivityError(""); try { const response = await api<ActivityResponse>(`/api/leads/${encodeURIComponent(detail.lead.id)}/activity/${kind}?page=${nextPage}&page_size=50`); setActivityItems(response.items || []); setActivityTotal(response.total || 0); } catch (cause) { setActivityError(cause instanceof Error ? cause.message : "Unable to load activity."); } finally { setActivityLoading(false); } }, [detail]);
  const refreshActivity = useCallback(async () => { if (activityKind) await loadActivity(activityKind, activityPage); await load(); if (detail) await openDetail(detail.lead.id); }, [activityKind, activityPage, detail, load, loadActivity, openDetail]);
  async function addActivity(kind: "note" | "call" | "followup") { if (!detail) return false; const path = kind === "note" ? "notes" : kind === "call" ? "calls" : "followups"; const payload = kind === "note" ? { body: activityForm.body } : kind === "call" ? { happened_at: activityForm.happened_at || undefined, duration_seconds: activityForm.duration_seconds === "" ? undefined : Number(activityForm.duration_seconds), resolution: activityForm.resolution, note: activityForm.note } : { due_at: activityForm.due_at, note: activityForm.note }; try { await api(`/api/leads/${encodeURIComponent(detail.lead.id)}/${path}`, { method: "POST", body: JSON.stringify(payload) }); setActivityForm({ body: "", happened_at: "", duration_seconds: "", resolution: "", due_at: "", note: "" }); await refreshActivity(); return true; } catch (cause) { setActivityError(cause instanceof Error ? cause.message : "Unable to save activity."); return false; } }
  async function rescheduleActivity(followupId: string, dueAt: string) { if (!detail) return false; try { await api(`/api/leads/${encodeURIComponent(detail.lead.id)}/followups/${encodeURIComponent(followupId)}/reschedule`, { method: "POST", body: JSON.stringify({ due_at: dueAt }) }); await refreshActivity(); return true; } catch (cause) { setActivityError(cause instanceof Error ? cause.message : "Unable to reschedule follow-up."); return false; } }
  useEffect(() => { const id = searchParams.get("open"); if (id) void openDetail(id); }, [openDetail, searchParams]);
  useEffect(() => { if (searchParams.get("import") === "1" && canImport) setBulkUploadOpen(true); }, [canImport, searchParams]);
  function updateFilter(key: keyof LeadFilters, value: string) { setPage(1); setFilters((current) => ({ ...current, [key]: value })); }
  function changePageSize(value: string) { if (value === "all") { setPageSize("all"); setPage(1); return; } if (!pageSizeDropdown.options.some((option) => option.value === value)) return; setPageSize(Number(value)); setPage(1); }
  function clearFilters() { setPage(1); setView(""); setFilters({ ...EMPTY_FILTERS }); setAdvancedConditions([]); setAdvancedJoin("AND"); }
  function newCondition(): QuickFilterCondition { return { id: `condition-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, field: filterFieldDropdown.defaultValue || filterFieldDropdown.options[0]?.value || "", operator: filterOperatorDropdown.defaultValue || filterOperatorDropdown.options[0]?.value || "", value: "" }; }
  function openAdvancedFilter(saved?: SavedLeadFilter) { setEditingQuickFilter(saved?.id || null); setDraftConditions(saved?.conditions ? saved.conditions.map((condition) => ({ ...condition, id: condition.id || `condition-${Date.now()}` })) : advancedConditions.length ? advancedConditions.map((condition) => ({ ...condition })) : [newCondition()]); setDraftJoin(saved?.join || advancedJoin); setAdvancedOpen(true); }
  function applyAdvancedFilter() { if (!draftConditions.length || draftConditions.some((condition) => !condition.field || !condition.operator || (!["is_empty", "is_not_empty"].includes(condition.operator) && !condition.value.trim()))) { setError("Complete each advanced filter condition before applying."); return; } setPage(1); setAdvancedConditions(draftConditions.map((condition) => ({ ...condition }))); setAdvancedJoin(draftJoin); showToast("Advanced filter applied"); }
  function updateCondition(id: string, patch: Partial<QuickFilterCondition>) { setDraftConditions((current) => current.map((condition) => condition.id === id ? { ...condition, ...patch } : condition)); }
  function addCondition() { setDraftConditions((current) => [...current, newCondition()]); }
  function removeCondition(id: string) { setDraftConditions((current) => current.filter((condition) => condition.id !== id)); }
  async function saveSavedFilter(name: string) {
    const trimmedName = name.trim(); if (!trimmedName || !advancedConditions.length) return false;
    const payload = { name: trimmedName, view, filters, conditions: advancedConditions.map(({ id: _id, ...condition }) => condition), join: advancedJoin };
    try {
      const response = await api<{ item: SavedLeadFilter }>(editingQuickFilter ? `/api/lead-quick-filters/${encodeURIComponent(editingQuickFilter)}` : "/api/lead-quick-filters", { method: editingQuickFilter ? "PATCH" : "POST", body: JSON.stringify(payload) });
      setSavedFilters((current) => editingQuickFilter ? current.map((item) => item.id === editingQuickFilter ? response.item : item) : [response.item, ...current.filter((item) => item.id !== response.item.id)]); setEditingQuickFilter(null); showToast("Quick filter saved"); return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save quick filter."); return false; }
  }
  function applySavedFilter(saved: SavedLeadFilter) {
    setPage(1);
    setView(saved.view || "");
    setFilters({ ...EMPTY_FILTERS, ...(saved.filters || {}) }); setAdvancedConditions((saved.conditions || []).map((condition) => ({ ...condition, id: condition.id || `condition-${Date.now()}` }))); setAdvancedJoin(saved.join || "AND");
    const next = new URLSearchParams(searchParams);
    if (saved.view) next.set("view", saved.view); else next.delete("view");
    setSearchParams(next);
  }
  async function deleteSavedFilter(id: string) { try { await api(`/api/lead-quick-filters/${encodeURIComponent(id)}`, { method: "DELETE" }); setSavedFilters((current) => current.filter((item) => item.id !== id)); if (editingQuickFilter === id) setEditingQuickFilter(null); showToast("Quick filter deleted"); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to delete quick filter."); } }
  function closeNewLead() { const next = new URLSearchParams(searchParams); next.delete("new"); setSearchParams(next); }
  async function createNewLead(event: React.FormEvent) { event.preventDefault(); setError(""); if (!newLeadForm.lead_type || !newLeadForm.permission || !leadTypeDropdown.options.length || !permissionDropdown.options.length) { setError("Lead options are still loading or unavailable. Choose valid values before saving."); return; } try { await api("/api/leads", { method: "POST", body: JSON.stringify({ ...newLeadForm, team: newLeadForm.team.trim(), products: newLeadForm.products.split(",").map((product_code) => ({ product_code: product_code.trim() })).filter((product) => product.product_code) }) }); setNewLeadForm({ name: "", email: "", phone: "", company: "", team: "", lead_type: leadTypeDropdown.defaultValue, permission: permissionDropdown.defaultValue, products: "" }); closeNewLead(); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save lead."); } }
  async function saveLeadEdit(event: React.FormEvent) { event.preventDefault(); if (!detail) return; try { await api(`/api/leads/${encodeURIComponent(detail.lead.id)}`, { method: "PATCH", body: JSON.stringify(editForm) }); setEditing(false); await openDetail(detail.lead.id); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save lead."); } }
  async function updateStage(stage: string) { if (!detail) return; try { await api(`/api/leads/${encodeURIComponent(detail.lead.id)}/stage`, { method: "POST", body: JSON.stringify({ stage }) }); await openDetail(detail.lead.id); await load(); } catch { setError("Unable to change lead stage."); } }
  async function updatePermission(permission: string) { if (!detail) return; try { await api(`/api/leads/${encodeURIComponent(detail.lead.id)}/permission`, { method: "POST", body: JSON.stringify({ permission }) }); await openDetail(detail.lead.id); await load(); } catch { setError("Unable to change permission."); } }
  async function reassignByRoundRobin() { if (!detail) return; try { await api(`/api/leads/${encodeURIComponent(detail.lead.id)}/round-robin`, { method: "POST", body: JSON.stringify({}) }); await openDetail(detail.lead.id); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to reassign lead."); } }
  async function convertLead() { if (!detail) return; try { await api(`/api/leads/${encodeURIComponent(detail.lead.id)}/convert-account`, { method: "POST", body: JSON.stringify({}) }); setError("Lead converted to an account and contact."); await openDetail(detail.lead.id); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to convert lead."); } }
  function openBulkUpload() { setBulkUploadOpen(true); setBulkError(""); setBulkResult(null); }
  function closeBulkUpload() { if (!bulkLoading) { setBulkUploadOpen(false); setBulkFile(null); setBulkPreview(null); setBulkResult(null); setBulkError(""); } }
  async function downloadBulkTemplate(format: "xlsx" | "csv" = "xlsx") { const response = await fetch(`/api/leads/import/template?format=${format}`, { credentials: "same-origin" }); if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error || "Unable to download the sample file."); } const blob = await response.blob(); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `altus-leads-sample.${format}`; link.click(); URL.revokeObjectURL(link.href); }
  async function uploadRequest(path: string, file: File, hash?: string) { const headers: Record<string, string> = { "Content-Type": "application/octet-stream", "X-Altus": "1", "X-Altus-Filename": file.name, ...(bulkAllowDuplicates ? { "X-Altus-Allow-Duplicates": "1" } : {}) }; if (hash) headers["X-Altus-File-Hash"] = hash; const response = await fetch(path, { method: "POST", credentials: "same-origin", headers, body: await file.arrayBuffer() }); const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error || "Request failed."); return body; }
  async function previewBulkUpload(file: File) { setBulkFile(file); setBulkPreview(null); setBulkResult(null); setBulkError(""); setBulkLoading(true); try { setBulkPreview(await uploadRequest("/api/leads/import/preview", file)); } catch (cause) { setBulkError(cause instanceof Error ? cause.message : "Unable to preview the file."); } finally { setBulkLoading(false); } }
  async function applyBulkUpload() { if (!bulkFile || !bulkPreview) return; setBulkLoading(true); setBulkError(""); try { setBulkResult(await uploadRequest("/api/leads/import/apply", bulkFile, bulkPreview.file_hash)); await load(); } catch (cause) { setBulkError(cause instanceof Error ? cause.message : "Unable to apply the file."); } finally { setBulkLoading(false); } }
  function openViewMenu() { setActiveViewIndex(Math.max(0, VIEW_OPTIONS.findIndex(([key]) => key === view))); setViewMenuOpen(true); }
  function closeViewMenu(restoreFocus = false) { setViewMenuOpen(false); if (restoreFocus) requestAnimationFrame(() => viewButtonRef.current?.focus()); }
  function chooseView(next: string) { setPage(1); setView(next); closeViewMenu(true); }
  function handleViewButtonKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) { if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown") { event.preventDefault(); openViewMenu(); } }
  function handleViewOptionKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) { if (event.key === "ArrowDown" || event.key === "ArrowRight") { event.preventDefault(); setActiveViewIndex((index + 1) % VIEW_OPTIONS.length); } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") { event.preventDefault(); setActiveViewIndex((index - 1 + VIEW_OPTIONS.length) % VIEW_OPTIONS.length); } else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); chooseView(VIEW_OPTIONS[index][0]); } else if (event.key === "Escape") { event.preventDefault(); closeViewMenu(true); } }
  const totalPages = pageSize === "all" ? 1 : Math.max(1, Math.ceil((data?.total || 0) / (data?.page_size || 50)));
  const currentViewLabel = viewByKey.get(view as LeadViewKey)?.[1] || "All Leads";
  const filtersActive = !!view || Object.values(filters).some(Boolean) || advancedConditions.length > 0;
  const canLogCall = canCall && detail?.lead.permission === "Yes";
  const callDisabledReason = !canCall ? "Your role cannot log calls." : "Permission to Call is required.";
  return { data, detail, detailLoading, error, filters, filtersActive, loading, page, pageSize, totalPages, view, viewCounts, viewGroups: LEAD_VIEW_GROUPS, viewOptions: VIEW_OPTIONS, currentViewLabel, viewMenuOpen, activeViewIndex, viewMenuRef, viewButtonRef, viewOptionRefs, savedFilters, quickFilterLoading, advancedConditions, advancedJoin, advancedOpen, editingQuickFilter, toast, draftConditions, draftJoin, newLeadOpen: searchParams.get("new") === "1", newLeadForm, setNewLeadForm, editing, editForm, setEditing, setEditForm, canChangePermission, canCall, canLogCall, callDisabledReason, canConvertAccount, canImport, canAssign, bulkImportLabel, formatDate, load, openDetail, closeDetail: () => { setDetail(null); setActivityKind(null); }, closeNewLead, createNewLead, saveLeadEdit, updateStage, updatePermission, reassignByRoundRobin, convertLead, chooseView, openViewMenu, closeViewMenu, handleViewButtonKeyDown, handleViewOptionKeyDown, updateFilter, clearFilters, changePageSize, saveSavedFilter, applySavedFilter, deleteSavedFilter, openAdvancedFilter, applyAdvancedFilter, updateCondition, addCondition, removeCondition, setAdvancedOpen, setDraftJoin, previousPage: () => setPage((value) => Math.max(1, value - 1)), nextPage: () => setPage((value) => Math.min(totalPages, value + 1)), activityKind, activityItems, activityPage, activityTotal, activityLoading, activityError, activityForm, setActivityForm, loadActivity, closeActivity: () => { setActivityKind(null); setActivityItems([]); }, addActivity, rescheduleActivity, bulkUploadOpen, bulkFile, bulkPreview, bulkResult, bulkLoading, bulkError, bulkAllowDuplicates, setBulkAllowDuplicates, openBulkUpload, closeBulkUpload, downloadBulkTemplate, previewBulkUpload, applyBulkUpload, selectedLeadIds, selectAllView, setSelectAllView, toggleSelectLead, toggleSelectAll, clearSelection, userOptions, dropdownOptions: { leadType: leadTypeDropdown.options, stage: stageDropdown.options, permission: permissionDropdown.options, join: joinDropdown.options, filterField: filterFieldDropdown.options, filterOperator: filterOperatorDropdown.options, pageSize: pageSizeDropdown.options.length ? pageSizeDropdown.options : DEFAULT_PAGE_SIZE_OPTIONS, relatedActivity: relatedActivityDropdown.options, noteVisibility: noteVisibilityDropdown.options, notifyBefore: notifyBeforeDropdown.options }, dropdownDefaults: { leadType: leadTypeDropdown.defaultValue, permission: permissionDropdown.defaultValue } };
}

export function fieldValue(lead: Lead, key: string) {
  const direct: Record<string, unknown> = { leadNo: lead.lead_no, leadTypeCode: lead.lead_type, name: lead.name, firstName: lead.first_name, first_name: lead.first_name, lastName: lead.last_name, last_name: lead.last_name, company: lead.company, cellNo: lead.phone, email: lead.email, designation: lead.designation, city: lead.city, leadSource: lead.lead_source, sourceSystem: lead.source_system, permission: lead.permission, psoDate: lead.pso_date, lastCalledOn: lead.last_call_at, nextFollowUpAt: lead.next_follow_up_at, owner: lead.owner_user_id, isPrePsDone: lead.is_pre_ps_done };
  if (direct[key] !== undefined) return key === "leadTypeCode" ? ({ DL: "Direct Lead", L: "Lead", QDL: "Qualified Direct Lead", QL: "Qualified Lead", R: "Referral" } as Record<string, string>)[String(direct[key])] || direct[key] : direct[key];
  return lead.custom_values?.[key] ?? lead.legacy_finance?.[key] ?? null;
}
