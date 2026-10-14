import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../../shared/api/client";
import { useAuth } from "../../shared/auth/auth";
import { displayRole, usePermission } from "../../shared/auth/permissions";
import { useDropdown, type DropdownOption } from "../../shared/dropdowns/client";
import leadColumnConfig from "../../../shared/lead-inline-columns.json";
import { resolveLeadValue } from "../../shared/lead-field-resolver";

const DEFAULT_PAGE_SIZE_OPTIONS: DropdownOption[] = [];
export const LEAD_STATUS_OPTIONS = ["", "Pending", "New", "Contacted", "Qualified", "Converted", "Lost"] as const;

export type Lead = { id: string; source_id: string; name: string; first_name?: string | null; last_name?: string | null; email: string | null; company: string | null; phone: string | null; stage: string | null; permission: string | null; lead_status: string | null; owner_user_id: string | null; pso_date: string | null; next_follow_up_at: string | null; last_call_at: string | null; updated_at: string | null; is_pre_ps_done: boolean | null; lead_no: string | null; lead_type: string | null; lead_source: string | null; source_system: string | null; designation: string | null; city: string | null; custom_values?: Record<string, unknown>; legacy_finance?: Record<string, unknown>; lead_acquisition_date?: string | null; business_category?: string | null; nature_of_business?: string | null; proposed_solution?: string | null; invite_sent_by_introducer?: string | null; invite_date_sent?: string | null; introducer_call_done?: string | null; introducer_call_date?: string | null; introducer_feedback?: string | null; introducer_name?: string | null; employee_name?: string | null; association_network_name?: string | null; chapter_name?: string | null; last_called_on?: string | null; calling_resolution?: string | null; next_call_on?: string | null; calling_remarks?: string | null; intro_video_sent?: string | null; email_sent?: string | null; whatsapp_message_sent?: string | null; extra_notes?: string | null; created_at?: string | null; last_opened_at?: string | null };
export type LeadFormState = { lead_no: string; lead_acquisition_date: string; first_name: string; last_name: string; name: string; company: string; phone: string; email: string; designation: string; business_category: string; nature_of_business: string; proposed_solution: string; invite_sent_by_introducer: string; invite_date_sent: string; introducer_call_done: string; introducer_call_date: string; introducer_feedback: string; introducer_name: string; employee_name: string; association_network_name: string; chapter_name: string; last_called_on: string; calling_resolution: string; next_call_on: string; calling_remarks: string; intro_video_sent: string; email_sent: string; whatsapp_message_sent: string; extra_notes: string; team: string; lead_type: string; permission: string; product: string; lead_status: string };
export const EMPTY_LEAD_FORM: LeadFormState = { lead_no: "", lead_acquisition_date: "", first_name: "", last_name: "", name: "", company: "", phone: "", email: "", designation: "", business_category: "", nature_of_business: "", proposed_solution: "", invite_sent_by_introducer: "No", invite_date_sent: "", introducer_call_done: "No", introducer_call_date: "", introducer_feedback: "", introducer_name: "", employee_name: "", association_network_name: "", chapter_name: "", last_called_on: "", calling_resolution: "", next_call_on: "", calling_remarks: "", intro_video_sent: "No", email_sent: "No", whatsapp_message_sent: "No", extra_notes: "", team: "", lead_type: "", permission: "", product: "", lead_status: "" };
export type ConfiguredLeadField = { key: string; label: string; type: "text" | "textarea" | "number" | "date" | "email" | "phone" | "url" | "boolean"; active: boolean; detail_visible: boolean; order: number };
export type LeadDetailResponse = { lead: Lead & Record<string, unknown>; calls: Record<string, unknown>[]; followups: Record<string, unknown>[]; history: Record<string, unknown>[]; messages: Record<string, unknown>[]; products: Record<string, unknown>[] };
export type ActivityKind = "history" | "calls" | "followups" | "messages" | "notes";
export type ActivityResponse = { items: Record<string, unknown>[]; page: number; page_size: number; total: number };
export type BulkImportPreview = { file_hash: string; extension: string; sheet_note: string | null; total_rows: number; valid: number; errors: number; possible_duplicates: number; duplicate_rows: Array<{ row: number; reason: string | undefined }>; ignored_columns: string[]; preview_rows: Record<string, unknown>[]; error_rows: Array<{ row: number; errors: string[] }>; can_apply: boolean };
export type BulkImportResult = { import_run_id: string; upload_id: string; total_rows: number; created: number; new_leads_created: number; existing_leads_updated: number; fields_filled: number; call_log_rows_added: number; call_log_rows_filled: number; call_log_rows_skipped_duplicates: number; conflicts_needing_review: number; unchanged_leads: number; skipped_duplicates: number; skipped_errors: number; errors: string[] };
export type LeadsResponse = { items: Lead[]; page: number; page_size: number; total: number; sort: string; direction: string; view: string | null };
export type LeadFilters = { q: string; stage: string; permission: string; owner: string; lead_status: string; pso_date_from: string; pso_date_to: string; next_follow_up: string };
export type QuickFilterCondition = { id: string; field: string; operator: string; value: string };
export type SavedLeadFilter = { id: string; name: string; view: string; filters: LeadFilters; conditions?: QuickFilterCondition[]; join?: "AND" | "OR"; created_at?: string; updated_at?: string };
const LEADS_CACHE_TTL_MS = 15_000;
const VIEW_COUNTS_CACHE_TTL_MS = 30_000;
const leadsCache = new Map<string, { data: LeadsResponse; savedAt: number }>();
const leadsInFlight = new Map<string, Promise<LeadsResponse>>();
const viewCountsCache = new Map<string, { total: number; savedAt: number }>();
const viewCountsInFlight = new Map<string, Promise<LeadsResponse>>();

function cachedLeadsRequest(query: string, force = false) {
  const cached = leadsCache.get(query);
  if (!force && cached && Date.now() - cached.savedAt < LEADS_CACHE_TTL_MS) return Promise.resolve(cached.data);
  const pending = leadsInFlight.get(query);
  if (pending) return pending;
  const request = api<LeadsResponse>(`/api/leads?${query}`).then((data) => {
    leadsCache.set(query, { data, savedAt: Date.now() });
    leadsInFlight.delete(query);
    return data;
  }).catch((error) => {
    leadsInFlight.delete(query);
    throw error;
  });
  leadsInFlight.set(query, request);
  return request;
}

function cachedViewCountRequest(query: string) {
  const cached = viewCountsCache.get(query);
  if (cached && Date.now() - cached.savedAt < VIEW_COUNTS_CACHE_TTL_MS) return Promise.resolve(cached.total);
  const pending = viewCountsInFlight.get(query);
  if (pending) return pending.then((response) => response.total);
  const request = api<LeadsResponse>(`/api/leads?${query}`).then((response) => {
    viewCountsCache.set(query, { total: response.total, savedAt: Date.now() });
    viewCountsInFlight.delete(query);
    return response;
  }).catch((error) => {
    viewCountsInFlight.delete(query);
    throw error;
  });
  viewCountsInFlight.set(query, request);
  return request.then((response) => response.total);
}

const DATE_FILTER_FIELDS = new Set(["pso_date", "next_follow_up_at", "lead_acquisition_date", "invite_date_sent", "introducer_call_date", "last_called_on", "next_call_on", "created_at", "updated_at", "last_opened_at"]);
export function isQuickFilterDateField(key: string) { return DATE_FILTER_FIELDS.has(key); }
export type QuickFiltersResponse = { items: SavedLeadFilter[] };
type LeadViewKey = (typeof LEAD_VIEWS)[number][0];
type ViewGroup = { label: string; views: readonly (readonly [LeadViewKey, string])[] };
const EMPTY_FILTERS: LeadFilters = { q: "", stage: "", permission: "", owner: "", lead_status: "", pso_date_from: "", pso_date_to: "", next_follow_up: "" };
export type LeadColumn = { key: string; label: string; input: "text" | "textarea" | "phone" | "email" | "dropdown" | "boolean" | "date" | "datetime"; editable: boolean; required?: boolean; dropdown?: string; aliasOf?: string; hidden?: boolean; system?: boolean; storage: { kind: "column" | "custom"; key: string } };
export type LeadField = { key: string; label: string };
export const LEAD_COLUMNS = leadColumnConfig as LeadColumn[];
export const EDITABLE_LEAD_COLUMN_KEYS = new Set(LEAD_COLUMNS.filter((column) => column.editable).map((column) => column.key));
export const ADDITIONAL_LEAD_FIELDS: readonly LeadField[] = [
  { key: "lead_acquisition_date", label: "Lead acquisition date" }, { key: "business_category", label: "Business category" }, { key: "nature_of_business", label: "Nature of business" }, { key: "proposed_solution", label: "Proposed solution" },
  { key: "invite_sent_by_introducer", label: "Invite sent by introducer" }, { key: "invite_date_sent", label: "Invite date sent" }, { key: "introducer_call_done", label: "Introducer call done" }, { key: "introducer_call_date", label: "Introducer call date" }, { key: "introducer_feedback", label: "Introducer feedback" }, { key: "introducer_name", label: "Introducer name" }, { key: "employee_name", label: "Employee name" }, { key: "association_network_name", label: "Association / network name" }, { key: "chapter_name", label: "Chapter name" },
  { key: "last_called_on", label: "Last called on" }, { key: "calling_resolution", label: "Calling resolution" }, { key: "next_call_on", label: "Next call on" }, { key: "calling_remarks", label: "Calling remarks" }, { key: "intro_video_sent", label: "2 mins intro video sent" }, { key: "email_sent", label: "Email sent" }, { key: "whatsapp_message_sent", label: "Msg sent on WhatsApp" }, { key: "extra_notes", label: "Extra notes" },
];
export const SYSTEM_LEAD_FIELDS: readonly LeadField[] = [{ key: "created_at", label: "Created on" }, { key: "updated_at", label: "Last modified on" }, { key: "last_opened_at", label: "Last opened on" }];
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
  const businessCategoryDropdown = useDropdown("business_category");
  const callingResolutionDropdown = useDropdown("calling_resolution");
  const ratingDropdown = useDropdown("rating");
  const leadSourceDropdown = useDropdown("lead_source");
  const joinDropdown = useDropdown("filter_join_operator");
  const filterFieldDropdown = useDropdown("filter_field");
  const filterOperatorDropdown = useDropdown("filter_operator");
  const pageSizeDropdown = useDropdown("page_size");
  const relatedActivityDropdown = useDropdown("related_activity");
  const noteVisibilityDropdown = useDropdown("note_visibility");
  const notifyBeforeDropdown = useDropdown("notify_before");
  const canChangePermission = usePermission("leads.permission");
  const canEdit = usePermission("leads.edit");
  const canCall = usePermission("leads.call");
  const canImport = usePermission("leads.import");
  const canAssign = usePermission("leads.assign");
  const canDelete = usePermission("leads.delete");
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
  const [leadFields, setLeadFields] = useState<ConfiguredLeadField[]>([]);
  const [newLeadForm, setNewLeadForm] = useState<LeadFormState>(EMPTY_LEAD_FORM);
  const [products, setProducts] = useState<Array<{ id: string; code: string; label: string }>>([]);
  useEffect(() => { let live = true; void api<{ products: Array<{ id: string; code: string; label: string }> }>("/api/products").then((response) => { if (live) setProducts(response.products || []); }).catch(() => { if (live) setProducts([]); }); return () => { live = false; }; }, []);
  useEffect(() => { let live = true; void api<{ fields: ConfiguredLeadField[] }>("/api/lead-fields").then((response) => { if (live) setLeadFields(response.fields || []); }).catch(() => { if (live) setLeadFields([]); }); return () => { live = false; }; }, []);
  const [editing, setEditing] = useState(false); const [editForm, setEditForm] = useState<LeadFormState>(EMPTY_LEAD_FORM);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);
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
  const load = useCallback(async (force = false) => { setLoading(true); setError(""); try { const [nextData, ...countResponses] = await Promise.all([cachedLeadsRequest(query, force), ...countQueries.map(([, countQuery]) => cachedViewCountRequest(countQuery))]); setData(nextData); setViewCounts(Object.fromEntries(countQueries.map(([key], index) => [key, countResponses[index]]))); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load leads."); } finally { setLoading(false); } }, [countQueries, query]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setView(LEAD_VIEWS.some(([key]) => key === requestedView) ? requestedView : ""); setPage(1); }, [requestedView]);
  useEffect(() => { if (!viewMenuOpen) return; const closeOnOutside = (event: MouseEvent) => { if (!viewMenuRef.current?.contains(event.target as Node)) setViewMenuOpen(false); }; document.addEventListener("mousedown", closeOnOutside); return () => document.removeEventListener("mousedown", closeOnOutside); }, [viewMenuOpen]);
  useEffect(() => { if (viewMenuOpen) requestAnimationFrame(() => viewOptionRefs.current[activeViewIndex]?.focus()); }, [activeViewIndex, viewMenuOpen]);
  useEffect(() => { let live = true; void api<QuickFiltersResponse>("/api/lead-quick-filters").then((response) => { if (live) setSavedFilters(response.items || []); }).catch((cause) => { if (live) setError(cause instanceof Error ? cause.message : "Unable to load quick filters."); }).finally(() => { if (live) setQuickFilterLoading(false); }); return () => { live = false; }; }, []);
  function showToast(message: string) { setToast(message); window.setTimeout(() => setToast((current) => current === message ? "" : current), 2600); }
  const openDetail = useCallback(async (id: string) => { setDetailLoading(true); setError(""); try { const response = await api<LeadDetailResponse>(`/api/leads/${encodeURIComponent(id)}`); setDetail(response); setEditForm((current) => ({ ...current, ...Object.fromEntries(Object.keys(EMPTY_LEAD_FORM).map((key) => [key, String((response.lead as Record<string, unknown>)[key] ?? "")])), name: response.lead.name || "", email: response.lead.email || "", phone: response.lead.phone || "", company: response.lead.company || "", lead_type: response.lead.lead_type || "", permission: response.lead.permission || "" })); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load the lead."); } finally { setDetailLoading(false); } }, []);
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
  function validateLeadForm(form: LeadFormState) { const next: Record<string, string> = {}; if (!form.first_name.trim() && !form.name.trim()) next.first_name = "First name is required."; if (!form.phone.trim()) next.phone = "Cell No is required."; else if (!/^[+\d][\d\s().-]{6,}$/.test(form.phone.trim())) next.phone = "Enter a valid phone number."; if (form.email && !/^\S+@\S+\.\S+$/.test(form.email.trim())) next.email = "Enter a valid email address."; setFormErrors(next); return Object.keys(next).length === 0; }
  async function createNewLead(event: React.FormEvent) { event.preventDefault(); setError(""); if (!validateLeadForm(newLeadForm)) return; if (!newLeadForm.lead_type || !newLeadForm.permission || !leadTypeDropdown.options.length || !permissionDropdown.options.length) { setError("Lead options are still loading or unavailable. Choose valid values before saving."); return; } try { const { product, ...lead } = newLeadForm; await api("/api/leads", { method: "POST", body: JSON.stringify({ ...lead, name: lead.name || `${lead.first_name} ${lead.last_name}`.trim(), team: lead.team.trim(), products: product ? [{ product_code: product }] : [] }) }); setNewLeadForm({ ...EMPTY_LEAD_FORM, lead_type: leadTypeDropdown.defaultValue, permission: permissionDropdown.defaultValue }); setFormErrors({}); closeNewLead(); await load(true); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save lead."); } }
  async function saveLeadEdit(event: React.FormEvent) { event.preventDefault(); if (!detail || !validateLeadForm(editForm)) return; try { await api(`/api/leads/${encodeURIComponent(detail.lead.id)}`, { method: "PATCH", body: JSON.stringify({ ...editForm, name: editForm.name || `${editForm.first_name} ${editForm.last_name}`.trim() }) }); setEditing(false); await openDetail(detail.lead.id); await load(true); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save lead."); } }
  async function updateLeadStatus(id: string, lead_status: string) { setStatusUpdatingId(id); setError(""); try { await api(`/api/leads/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ lead_status }) }); await load(true); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to change lead status."); } finally { setStatusUpdatingId(null); } }
  async function updateLeadField(id: string, field: string, value: unknown) {
    const column = LEAD_COLUMNS.find((candidate) => candidate.key === field);
    if (!column?.editable) throw new Error("This column is read-only.");
    const response = await api<{ lead: Lead }>(`/api/leads/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ field, value }) });
    setData((current) => current ? { ...current, items: current.items.map((item) => item.id === id ? { ...item, ...response.lead } : item) } : current);
    setDetail((current) => current?.lead.id === id ? { ...current, lead: { ...current.lead, ...response.lead } } : current);
    return response.lead;
  }
  async function updateStage(stage: string) { if (!detail) return; try { await api(`/api/leads/${encodeURIComponent(detail.lead.id)}/stage`, { method: "POST", body: JSON.stringify({ stage }) }); await openDetail(detail.lead.id); await load(true); } catch { setError("Unable to change lead stage."); } }
  async function updatePermission(permission: string) { if (!detail) return; try { await api(`/api/leads/${encodeURIComponent(detail.lead.id)}/permission`, { method: "POST", body: JSON.stringify({ permission }) }); await openDetail(detail.lead.id); await load(true); } catch { setError("Unable to change permission."); } }
  async function reassignByRoundRobin() { if (!detail) return; try { await api(`/api/leads/${encodeURIComponent(detail.lead.id)}/round-robin`, { method: "POST", body: JSON.stringify({}) }); await openDetail(detail.lead.id); await load(true); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to reassign lead."); } }
  async function convertLead() { if (!detail) return; try { await api(`/api/leads/${encodeURIComponent(detail.lead.id)}/convert-account`, { method: "POST", body: JSON.stringify({}) }); setError("Lead converted to an account and contact."); await openDetail(detail.lead.id); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to convert lead."); } }
  async function archiveLeads(ids: string[]) { try { const result = await api<{ archived: number }>("/api/leads/bulk-archive", { method: "POST", body: JSON.stringify({ ids }) }); clearSelection(); setDetail(null); showToast(`${result.archived} lead${result.archived === 1 ? "" : "s"} archived`); await load(true); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to archive leads."); } }
  async function permanentlyDeleteLeads(ids: string[]) { try { const result = await api<{ deleted: number }>("/api/leads/bulk-delete", { method: "POST", body: JSON.stringify({ ids, confirmation: "DELETE" }) }); clearSelection(); setDetail(null); showToast(`${result.deleted} lead${result.deleted === 1 ? "" : "s"} permanently deleted`); await load(true); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to delete leads."); } }
  function openBulkUpload() { setBulkUploadOpen(true); setBulkError(""); setBulkResult(null); }
  function closeBulkUpload() { if (!bulkLoading) { setBulkUploadOpen(false); setBulkFile(null); setBulkPreview(null); setBulkResult(null); setBulkError(""); } }
  async function downloadBulkTemplate(format: "xlsx" | "csv" = "xlsx") { const response = await fetch(`/api/leads/import/template?format=${format}`, { credentials: "same-origin" }); if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error || "Unable to download the sample file."); } const blob = await response.blob(); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `altus-leads-sample.${format}`; link.click(); URL.revokeObjectURL(link.href); }
  async function uploadRequest(path: string, file: File, hash?: string) { const headers: Record<string, string> = { "Content-Type": "application/octet-stream", "X-Altus": "1", "X-Altus-Filename": file.name, ...(bulkAllowDuplicates ? { "X-Altus-Allow-Duplicates": "1" } : {}) }; if (hash) headers["X-Altus-File-Hash"] = hash; const response = await fetch(path, { method: "POST", credentials: "same-origin", headers, body: await file.arrayBuffer() }); const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error || "Request failed."); return body; }
  async function previewBulkUpload(file: File) { setBulkFile(file); setBulkPreview(null); setBulkResult(null); setBulkError(""); setBulkLoading(true); try { setBulkPreview(await uploadRequest("/api/leads/import/preview", file)); } catch (cause) { setBulkError(cause instanceof Error ? cause.message : "Unable to preview the file."); } finally { setBulkLoading(false); } }
  async function applyBulkUpload() { if (!bulkFile || !bulkPreview) return; setBulkLoading(true); setBulkError(""); try { setBulkResult(await uploadRequest("/api/leads/import/apply", bulkFile, bulkPreview.file_hash)); await load(true); } catch (cause) { setBulkError(cause instanceof Error ? cause.message : "Unable to apply the file."); } finally { setBulkLoading(false); } }
  function openViewMenu() { setActiveViewIndex(Math.max(0, VIEW_OPTIONS.findIndex(([key]) => key === view))); setViewMenuOpen(true); }
  function closeViewMenu(restoreFocus = false) { setViewMenuOpen(false); if (restoreFocus) requestAnimationFrame(() => viewButtonRef.current?.focus()); }
  function chooseView(next: string) { setPage(1); setView(next); closeViewMenu(true); }
  function handleViewButtonKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) { if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown") { event.preventDefault(); openViewMenu(); } }
  function handleViewOptionKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) { if (event.key === "ArrowDown" || event.key === "ArrowRight") { event.preventDefault(); setActiveViewIndex((index + 1) % VIEW_OPTIONS.length); } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") { event.preventDefault(); setActiveViewIndex((index - 1 + VIEW_OPTIONS.length) % VIEW_OPTIONS.length); } else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); chooseView(VIEW_OPTIONS[index][0]); } else if (event.key === "Escape") { event.preventDefault(); closeViewMenu(true); } }
  const totalPages = pageSize === "all" ? 1 : Math.max(1, Math.ceil((data?.total || 0) / (data?.page_size || 50)));
  const currentViewLabel = viewByKey.get(view as LeadViewKey)?.[1] || "All Leads";
  const filtersActive = !!view || Object.values(filters).some(Boolean) || advancedConditions.length > 0;
  // TODO Phase 2: these frontend-only filter fields need server query support after migration/API work.
  const extendedFilterFields = [...filterFieldDropdown.options, ...[...ADDITIONAL_LEAD_FIELDS, ...SYSTEM_LEAD_FIELDS].map((field, index) => ({ id: `phase1-${field.key}`, dropdown_id: "filter_field", label: field.label, value: field.key, semantic_key: null, sort_order: 1000 + index, is_active: true }))].filter((option, index, all) => all.findIndex((candidate) => candidate.value === option.value) === index);
  const canLogCall = canCall && detail?.lead.permission === "Yes";
  const callDisabledReason = !canCall ? "Your role cannot log calls." : "Permission to Call is required.";
  return { data, detail, detailLoading, error, filters, filtersActive, loading, page, pageSize, totalPages, view, viewCounts, viewGroups: LEAD_VIEW_GROUPS, viewOptions: VIEW_OPTIONS, currentViewLabel, viewMenuOpen, activeViewIndex, viewMenuRef, viewButtonRef, viewOptionRefs, savedFilters, quickFilterLoading, advancedConditions, advancedJoin, advancedOpen, editingQuickFilter, toast, draftConditions, draftJoin, newLeadOpen: searchParams.get("new") === "1", newLeadForm, setNewLeadForm, products, leadFields, editing, editForm, setEditing, setEditForm, formErrors, canEdit, canChangePermission, canCall, canLogCall, callDisabledReason, canConvertAccount, canImport, canAssign, canDelete, bulkImportLabel, statusUpdatingId, statusOptions: LEAD_STATUS_OPTIONS, formatDate, load, openDetail, closeDetail: () => { setDetail(null); setActivityKind(null); }, closeNewLead, createNewLead, saveLeadEdit, updateLeadStatus, updateLeadField, updateStage, updatePermission, reassignByRoundRobin, convertLead, archiveLeads, permanentlyDeleteLeads, chooseView, openViewMenu, closeViewMenu, handleViewButtonKeyDown, handleViewOptionKeyDown, updateFilter, clearFilters, changePageSize, saveSavedFilter, applySavedFilter, deleteSavedFilter, openAdvancedFilter, applyAdvancedFilter, updateCondition, addCondition, removeCondition, setAdvancedOpen, setDraftJoin, previousPage: () => setPage((value) => Math.max(1, value - 1)), nextPage: () => setPage((value) => Math.min(totalPages, value + 1)), activityKind, activityItems, activityPage, activityTotal, activityLoading, activityError, activityForm, setActivityForm, loadActivity, closeActivity: () => { setActivityKind(null); setActivityItems([]); }, addActivity, rescheduleActivity, bulkUploadOpen, bulkFile, bulkPreview, bulkResult, bulkLoading, bulkError, bulkAllowDuplicates, setBulkAllowDuplicates, openBulkUpload, closeBulkUpload, downloadBulkTemplate, previewBulkUpload, applyBulkUpload, selectedLeadIds, selectAllView, setSelectAllView, toggleSelectLead, toggleSelectAll, clearSelection, userOptions, dropdownOptions: { leadType: leadTypeDropdown.options, stage: stageDropdown.options, permission: permissionDropdown.options, businessCategory: businessCategoryDropdown.options, callingResolution: callingResolutionDropdown.options, rating: ratingDropdown.options, leadSource: leadSourceDropdown.options, join: joinDropdown.options, filterField: extendedFilterFields, filterOperator: filterOperatorDropdown.options, pageSize: pageSizeDropdown.options.length ? pageSizeDropdown.options : DEFAULT_PAGE_SIZE_OPTIONS, relatedActivity: relatedActivityDropdown.options, noteVisibility: noteVisibilityDropdown.options, notifyBefore: notifyBeforeDropdown.options }, dropdownDefaults: { leadType: leadTypeDropdown.defaultValue, permission: permissionDropdown.defaultValue } };
}

export function fieldValue(lead: Lead, key: string) {
  if (key === "businessCategory") key = "business_category";
  return resolveLeadValue(lead, key);
}
