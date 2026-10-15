import { ADDITIONAL_LEAD_FIELDS, ActivityKind, EMPTY_LEAD_FORM, fieldValue, isQuickFilterDateField, LEAD_COLUMNS, SYSTEM_LEAD_FIELDS, useLeadsScreen, VIEW_FIELDS, type LeadFormState, type LeadColumn, type Lead } from "./function";
import { useAuth } from "../../shared/auth/auth";
import { usePermission } from "../../shared/auth/permissions";
import { api } from "../../shared/api/client";
import { useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { ChevronsUpDown, ChevronDown, ChevronUp } from "lucide-react";
import { DropdownSelect } from "../../shared/dropdowns/component";
import { useRegisterLeadNavbarActions } from "../../shared/layout/lead-navbar-actions";
import "./leads.css";

const LEADS_COLUMN_PREFERENCE_KEY = "leads.columns.v1";
const SHOW_DEMO_TIMELINE = false;
const COLUMN_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,120}$/;
const LEAD_SORT_KEYS: Record<string, string> = { leadNo: "lead_no", leadTypeCode: "lead_type", name: "name", first_name: "first_name", last_name: "last_name", company: "company", cellNo: "cell_no", email: "email", designation: "designation", businessCategory: "business_category", business_category: "business_category", leadSource: "lead_source", rating: "rating", permission: "permission", lastCalledOn: "last_call_at", last_called_on: "last_call_at", lead_acquisition_date: "lead_acquisition_date", nature_of_business: "nature_of_business", proposed_solution: "proposed_solution", invite_sent_by_introducer: "invite_sent_by_introducer", invite_date_sent: "invite_date_sent", introducer_call_done: "introducer_call_done", introducer_call_date: "introducer_call_date", introducer_feedback: "introducer_feedback", introducer_name: "introducer_name", employee_name: "employee_name", association_network_name: "association_network_name", chapter_name: "chapter_name", calling_resolution: "calling_resolution", next_call_on: "next_call_on", calling_remarks: "calling_remarks", intro_video_sent: "intro_video_sent", email_sent: "email_sent", whatsapp_message_sent: "whatsapp_message_sent", extra_notes: "extra_notes", created_at: "created_at", updated_at: "updated_at", city: "city", sourceSystem: "source_system", leadAcquiredDate: "lead_acquisition_date", natureOfBusiness: "nature_of_business", service: "service", owner: "owner", callingResolution: "calling_resolution", priority: "priority", callingRemarks: "calling_remarks", psoDate: "pso_date", registrationTime: "registration_time", approvalStatus: "approval_status", zoomOrPhysical: "zoom_or_physical", confirmationCallStatus: "confirmation_call_status", zoomLinkSent: "zoom_link_sent", attendanceStatus: "attendance_status", salesFollowUpBy: "sales_follow_up_by", salesResolution: "sales_resolution", cameraOn: "camera_on", photoTaken: "photo_taken", salesNotes: "sales_notes", leftHalfway: "left_halfway", nextFollowUpAt: "next_follow_up_at", totalPayable: "total_payable", amountPaid: "amount_paid", balanceReceivable: "balance_receivable", targetDate: "target_date" };
function columnStorageKey(userId: string) { return `${LEADS_COLUMN_PREFERENCE_KEY}:${userId}`; }
function readStoredColumns(userId: string | undefined): unknown {
  if (!userId) return null;
  try { const value = JSON.parse(window.localStorage.getItem(columnStorageKey(userId)) || "null"); return Array.isArray(value) ? value : null; } catch { return null; }
}
function writeStoredColumns(userId: string | undefined, keys: string[]) {
  if (!userId) return;
  try { window.localStorage.setItem(columnStorageKey(userId), JSON.stringify(keys)); } catch { /* localStorage is optional */ }
}
function clearStoredColumns(userId: string | undefined) {
  if (!userId) return;
  try { window.localStorage.removeItem(columnStorageKey(userId)); } catch { /* localStorage is optional */ }
}
function normalizeColumnKeys(value: unknown, fields: readonly { key: string }[], defaults: readonly string[]) {
  const valid = new Set(fields.map((field) => field.key));
  const seen = new Set<string>();
  const saved = Array.isArray(value) ? value.filter((key): key is string => typeof key === "string" && COLUMN_KEY_PATTERN.test(key) && valid.has(key) && !seen.has(key) && (seen.add(key), true)) : [];
  const fallback = saved.length ? saved : defaults.filter((key) => valid.has(key));
  if (valid.has("leadNo") && !fallback.includes("leadNo")) return ["leadNo", ...fallback];
  return [...new Set(fallback)];
}

export function moveColumnKey(order: readonly string[], fromKey: string, toKey: string, side: "before" | "after") {
  const fromIndex = order.indexOf(fromKey);
  if (fromIndex < 0) return [...order];
  const next = [...order];
  next.splice(fromIndex, 1);
  const targetIndex = next.indexOf(toKey);
  if (targetIndex < 0) return [...order];
  const insertIndex = side === "before" ? targetIndex : targetIndex + 1;
  next.splice(insertIndex, 0, fromKey);
  return next;
}

function SortableLeadHeader({ label, sortKey, sortBy, sortDir, onSort, headerProps }: { label: string; sortKey: string; sortBy: string | null; sortDir: "asc" | "desc" | null; onSort: (sort: string) => void; headerProps?: React.ThHTMLAttributes<HTMLTableCellElement> }) {
  const direction = sortBy === sortKey ? sortDir : null;
  const SortIcon = direction === "asc" ? ChevronUp : direction === "desc" ? ChevronDown : ChevronsUpDown;
  return <th scope="col" {...headerProps} aria-sort={direction === "asc" ? "ascending" : direction === "desc" ? "descending" : "none"}><button type="button" className={`lead-sort-button${direction ? " is-sorted" : ""}`} onClick={() => onSort(sortKey)}>{label}<SortIcon size={14} strokeWidth={2} aria-hidden="true" /></button></th>;
}

function displayField(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function formatSystemDate(value: unknown) {
  if (!value) return "—";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("sv-SE", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date).replace(" ", " ");
}

function fieldOrFallback(value: unknown, fallback: string) {
  void fallback;
  return displayField(value);
}

function activityValue(value: unknown, _key?: string) { return value == null || value === "" ? "—" : String(value); }
function activityDate(value: unknown) { return value ? new Date(String(value)).toLocaleString() : "—"; }
function duration(value: unknown) { const seconds = Number(value); if (!Number.isFinite(seconds)) return "not recorded"; return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`; }

function ManagedFilterMultiSelect({ dropdown, values, onChange }: { dropdown: { id: string; key: string; label: string; options: Array<{ id: string; label: string; value: string; is_active: boolean }> }; values: string[]; onChange: (values: string[]) => void }) {
  const [open, setOpen] = useState(false); const [search, setSearch] = useState(""); const rootRef = useRef<HTMLDivElement>(null);
  const options = dropdown.options.filter((option) => option.is_active); const matching = options.filter((option) => option.label.toLowerCase().includes(search.trim().toLowerCase()));
  useEffect(() => { if (!open) return; const close = (event: MouseEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); }; document.addEventListener("mousedown", close); return () => document.removeEventListener("mousedown", close); }, [open]);
  const toggle = (value: string) => onChange(values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);
  const label = values.length === 0 ? `All ${dropdown.label}` : values.length === 1 ? options.find((option) => option.value === values[0])?.label || "1 selected" : `${values.length} selected`;
  return <div ref={rootRef} className="lead-managed-multiselect"><button className={open ? "lead-managed-filter-select active" : "lead-managed-filter-select"} type="button" aria-expanded={open} onClick={() => { setOpen((current) => !current); setSearch(""); }}>{label}<span aria-hidden="true">⌄</span></button>{open && <div className="lead-managed-options" role="dialog" aria-label={`${dropdown.label} filter`}><label className="lead-managed-search"><span aria-hidden="true">⌕</span><input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search..." /></label><div className="lead-managed-options-head"><strong>{values.length ? `${values.length} selected` : "None selected"}</strong><button type="button" onClick={() => onChange(values.length === options.length ? [] : options.map((option) => option.value))}>{values.length === options.length ? "Clear all" : `Select all (${options.length})`}</button></div><div className="lead-managed-options-list">{matching.map((option) => <label key={option.id} className={values.includes(option.value) ? "selected" : ""}><input type="checkbox" checked={values.includes(option.value)} onChange={() => toggle(option.value)} /><span>{option.label}</span></label>)}{matching.length === 0 && <p>No matching options.</p>}</div></div>}</div>;
}

function SavedFiltersPicker({ screen }: { screen: ReturnType<typeof useLeadsScreen> }) {
  const [open, setOpen] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const pickerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnOutside = (event: MouseEvent) => { if (!pickerRef.current?.contains(event.target as Node)) setOpen(false); };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); triggerRef.current?.focus(); } };
    document.addEventListener("mousedown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => { document.removeEventListener("mousedown", closeOnOutside); document.removeEventListener("keydown", closeOnEscape); };
  }, [open]);

  return <div className="saved-filters-picker" ref={pickerRef}>
    <button ref={triggerRef} className="saved-filters-trigger" type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
      <span>My Filters</span><span aria-hidden="true">v</span>
    </button>
    {open && <div className="saved-filters-menu" role="menu" aria-label="Saved lead filters">
      <div className="saved-filters-heading">Saved filters</div>
      {screen.quickFilterLoading ? <p className="saved-filters-empty">Loading filters...</p> : screen.savedFilters.length ? screen.savedFilters.map((saved) => <div className="saved-filter-row" key={saved.id}>
        <button className="saved-filter-apply" type="button" role="menuitem" onClick={() => { screen.applySavedFilter(saved); setOpen(false); }}>{saved.name}</button>
        <button className="saved-filter-edit" type="button" aria-label={`Edit quick filter ${saved.name}`} onClick={() => { screen.openAdvancedFilter(saved); setOpen(false); }}>Edit</button>
        <button className="saved-filter-delete" type="button" aria-label={`Delete saved filter ${saved.name}`} onClick={() => screen.deleteSavedFilter(saved.id)}>×</button>
      </div>) : <p className="saved-filters-empty">No saved filters yet.</p>}
    </div>}
    <AdvancedFilterPanel screen={screen} onSave={() => { setSaveName(screen.editingQuickFilter ? screen.savedFilters.find((item) => item.id === screen.editingQuickFilter)?.name || "" : ""); setSaveDialogOpen(true); }} />
    {saveDialogOpen && <div className="quick-filter-dialog-backdrop" role="presentation"><form className="quick-filter-dialog" role="dialog" aria-modal="true" aria-label="Save as Quick Filter" onSubmit={async (event) => { event.preventDefault(); if (await screen.saveSavedFilter(saveName)) { setSaveDialogOpen(false); setSaveName(""); screen.setAdvancedOpen(false); } }}><h2>{screen.editingQuickFilter ? "Update Quick Filter" : "Save as Quick Filter"}</h2><label>Name<input autoFocus required maxLength={80} value={saveName} onChange={(event) => setSaveName(event.target.value)} /></label><div className="quick-filter-dialog-actions"><button className="leads-button secondary" type="button" onClick={() => setSaveDialogOpen(false)}>Cancel</button><button className="leads-button" type="submit">Save</button></div></form></div>}
    {screen.toast && <div className="lead-toast" role="status">{screen.toast}</div>}
  </div>;
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M2 2l10 10M12 2L2 12" />
    </svg>
  );
}

function TableSelectAllCheckbox({
  checked,
  indeterminate,
  onChange,
  ariaLabel = "Select all leads",
}: {
  checked: boolean;
  indeterminate: boolean;
  onChange: () => void;
  ariaLabel?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  return (
    <input
      ref={ref}
      type="checkbox"
      className="lead-table-checkbox"
      checked={checked}
      onChange={onChange}
      aria-label={ariaLabel}
      title={ariaLabel}
    />
  );
}

function CallIcon({ color = "var(--red)" }: { color?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function EmailIcon({ color = "var(--red)" }: { color?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#25d366" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

function NoteIcon({ color = "var(--red)" }: { color?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
    </svg>
  );
}

function CalendarIcon({ color = "var(--red)" }: { color?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
      <line x1="16" x2="16" y1="2" y2="6" />
      <line x1="8" x2="8" y1="2" y2="6" />
      <line x1="3" x2="21" y1="10" y2="10" />
      <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" />
    </svg>
  );
}

function BuildingIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="16" height="20" x="4" y="2" rx="2" ry="2" />
      <path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 0 0 20M12 2a14.5 14.5 0 0 1 0 20M2 12h20" />
    </svg>
  );
}

function FilterFunnelIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m2 4 4 4 4-4" />
    </svg>
  );
}

function DotsIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <circle cx="5" cy="12" r="1" fill="currentColor" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
      <circle cx="19" cy="12" r="1" fill="currentColor" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function MailIcon() { return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></svg>; }
function PhoneIcon() { return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>; }
function TeamIcon() { return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 5a3 3 0 0 1 0 6M18 14c1.7.8 3 2.5 3 5" /></svg>; }
function TagIcon() { return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3.4 13.4a2 2 0 0 1 0-2.8V4h6.6a2 2 0 0 1 1.4.6l9.2 9.2a2 2 0 0 1 0 2.8Z" /><circle cx="7.5" cy="7.5" r="1" /></svg>; }
function BoxIcon() { return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 7 9 5 9-5M12 12v9M4 5l8-3 8 3v14l-8 3-8-3Z" /></svg>; }

function BulletListIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <line x1="9" y1="6" x2="20" y2="6" />
      <line x1="9" y1="12" x2="20" y2="12" />
      <line x1="9" y1="18" x2="20" y2="18" />
      <circle cx="4" cy="6" r="1.5" fill="currentColor" />
      <circle cx="4" cy="12" r="1.5" fill="currentColor" />
      <circle cx="4" cy="18" r="1.5" fill="currentColor" />
    </svg>
  );
}

function NumberedListIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <line x1="10" y1="6" x2="20" y2="6" />
      <line x1="10" y1="12" x2="20" y2="12" />
      <line x1="10" y1="18" x2="20" y2="18" />
      <path d="M4 4.5v3M3.5 7.5h2M3.5 12h2a1 1 0 0 1 0 2H3.5v2h2.5" strokeWidth="1.6" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function AtIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8" />
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7v6h6" />
      <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
    </svg>
  );
}

function RedoIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 7v6h-6" />
      <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function PaperclipIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l7.88-7.88" />
    </svg>
  );
}

function HandoffIcon({ color = "var(--red)" }: { color?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function DesktopIcon({ color = "currentColor" }: { color?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="14" x="2" y="3" rx="2" />
      <line x1="8" x2="16" y1="21" y2="21" />
      <line x1="12" x2="12" y1="17" y2="21" />
    </svg>
  );
}

function EditPencilIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}

function VerticalDotsIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <circle cx="12" cy="5" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="12" cy="19" r="1.8" />
    </svg>
  );
}

const ADMIN_ACTIVITY_TYPES = [
  { id: "call", label: "Phone call", icon: CallIcon, placeholder: "Interested in a product walkthrough next week. Asked to share the proposal before the demo." },
  { id: "meeting", label: "Meeting / Demo", icon: CalendarIcon, placeholder: "Met with client team. Discussed requirements, timeline, and next steps." },
  { id: "email", label: "Email follow-up", icon: EmailIcon, placeholder: "Sent follow-up email with product deck and case studies." },
  { id: "whatsapp", label: "WhatsApp message", icon: WhatsAppIcon, placeholder: "Sent WhatsApp message with Productivity Shastra overview." },
  { id: "site_visit", label: "Site visit", icon: BuildingIcon, placeholder: "Conducted on-site inspection and met operational managers." },
  { id: "proposal", label: "Proposal review", icon: NoteIcon, placeholder: "Shared revised commercial proposal with pricing breakdown." },
  { id: "walkthrough", label: "Product walkthrough", icon: GlobeIcon, placeholder: "Walked client through core platform modules and answered questions." },
  { id: "note", label: "Internal note", icon: HandoffIcon, placeholder: "Internal coordination note for sales and delivery team." },
];

type LeadDetailTab = "activity" | "details" | "notes" | "follow-up";

const LEAD_DETAIL_TABS: Array<[LeadDetailTab, string]> = [
  ["activity", "Activity"],
  ["details", "Details"],
  ["notes", "Notes"],
  ["follow-up", "Follow-up"],
];

function AdvancedFilterPanel({ screen, onSave }: { screen: ReturnType<typeof useLeadsScreen>; onSave: () => void }) {
  if (!screen.advancedOpen) return null;
  return <div className="advanced-filter-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) screen.setAdvancedOpen(false); }}>
    <aside className="advanced-filter-panel" role="dialog" aria-modal="true" aria-label="Advanced lead filters">
      <div className="drawer-head"><div><p className="eyebrow">Leads</p><h2>Advanced Filters</h2></div><button className="icon-button" type="button" aria-label="Close advanced filters" onClick={() => screen.setAdvancedOpen(false)}><CloseIcon /></button></div>
      <p className="advanced-filter-note">Match leads using one or more conditions. Conditions are joined with {screen.draftJoin}.</p>
      <div className="advanced-condition-list">
        {screen.draftConditions.map((condition, index) => { const isDateField = isQuickFilterDateField(condition.field); const operators = screen.dropdownOptions.filterOperator.filter((item) => isDateField || !["gt", "gte", "lt", "lte"].includes(item.value)); return <div className="advanced-condition-row" key={condition.id}>
          {index > 0 && <DropdownSelect dropdownKey="filter_join_operator" options={screen.dropdownOptions.join} className="lead-control advanced-join" aria-label={`Join condition ${index + 1}`} value={screen.draftJoin} onValueChange={(value) => screen.setDraftJoin(value as "AND" | "OR")} />}
          <DropdownSelect dropdownKey="filter_field" options={screen.dropdownOptions.filterField} className="lead-control" aria-label={`Condition ${index + 1} field`} value={condition.field} onValueChange={(value) => screen.updateCondition(condition.id, { field: value, operator: isQuickFilterDateField(value) ? "equals" : "contains", value: "" })} />
          <DropdownSelect dropdownKey="filter_operator" options={operators} className="lead-control" aria-label={`Condition ${index + 1} operator`} value={condition.operator} onValueChange={(value) => screen.updateCondition(condition.id, { operator: value })} />
          {!['is_empty', 'is_not_empty'].includes(condition.operator) && <input className="lead-control" aria-label={`Condition ${index + 1} value`} type={isDateField ? "date" : "text"} value={condition.value} onChange={(event) => screen.updateCondition(condition.id, { value: event.target.value })} placeholder="Value" />}
          <button className="icon-button advanced-remove" type="button" aria-label={`Remove condition ${index + 1}`} onClick={() => screen.removeCondition(condition.id)}><CloseIcon /></button>
        </div>; })}
      </div>
      <div className="advanced-filter-actions"><button className="leads-button secondary" type="button" onClick={screen.addCondition}>+ Add condition</button><button className="leads-button" type="button" onClick={screen.applyAdvancedFilter}>Apply</button></div>
      <div className="advanced-filter-footer"><button className="leads-button secondary" type="button" disabled={!screen.advancedConditions.length} onClick={onSave}>{screen.editingQuickFilter ? "Update Quick Filter" : "Save as Quick Filter"}</button></div>
    </aside>
  </div>;
}

type TimelineEntry = { id: string; date: string | null; title: string; subtitle: string; body: string; kind: "followup" | "note" | "message" | "call" | "assignment"; badge?: string };

function LeadTimeline({ detail, leadName, ownerName }: { detail: any; leadName: string; ownerName: string }) {
  const entries: TimelineEntry[] = [
    ...(detail.followups || []).map((item: any) => ({ id: `followup-${item.id}`, date: item.created_at || item.due_at, title: item.status === "done" ? "Follow-up completed" : "Follow-up scheduled", subtitle: item.due_at ? new Date(item.due_at).toLocaleString() : "Follow-up", body: item.note || "No follow-up note.", kind: "followup" as const, badge: item.status === "done" ? "Completed" : "Upcoming" })),
    ...(detail.notes || []).map((item: any) => ({ id: `note-${item.id}`, date: item.created_at, title: `Note added by ${item.author_name || ownerName}`, subtitle: item.created_at ? new Date(item.created_at).toLocaleString() : "Note", body: item.body || "No note body.", kind: "note" as const })),
    ...(detail.calls || []).map((item: any) => ({ id: `call-${item.id}`, date: item.happened_at, title: `${item.caller_name || ownerName} called ${leadName}`, subtitle: `${item.happened_at ? new Date(item.happened_at).toLocaleString() : "Call"}${item.duration_seconds != null ? ` · ${Math.floor(Number(item.duration_seconds) / 60)}:${String(Number(item.duration_seconds) % 60).padStart(2, "0")} min` : ""}`, body: [item.resolution ? `Outcome: ${item.resolution}` : "", item.note || ""].filter(Boolean).join(" · ") || "Call activity recorded.", kind: "call" as const, badge: item.resolution === "Connected" ? "Connected" : undefined })),
    ...(detail.messages || []).map((item: any) => ({ id: `message-${item.id}`, date: item.sent_at, title: `${item.channel || "Message"} message sent`, subtitle: item.sent_at ? new Date(item.sent_at).toLocaleString() : "Message", body: item.body || "Message activity recorded.", kind: "message" as const })),
    ...(detail.history || []).filter((item: any) => ["lead.round_robin_assigned", "lead.owner_changed"].includes(String(item.action))).map((item: any) => ({ id: `history-${item.id}`, date: item.occurred_at, title: item.action === "lead.round_robin_assigned" ? (item.note || `Lead round-robined to ${item.to_value || "an owner"}.`) : `Lead manually assigned to ${item.to_value || "an owner"}`, subtitle: item.occurred_at ? new Date(item.occurred_at).toLocaleString() : "Assignment recorded", body: "", kind: "assignment" as const, badge: "Assigned" })),
  ].sort((left, right) => new Date(String(right.date || 0)).getTime() - new Date(String(left.date || 0)).getTime());
  return <div className="lead-timeline-container" aria-label="Lead timeline"><div className="lead-timeline-rail" />{entries.length === 0 ? <p className="lead-activity-empty">No activity recorded for this lead yet.</p> : entries.map((item, index) => <div className="lead-timeline-item" key={item.id}><div className={`lead-timeline-node ${item.kind === "message" ? "green-node" : "red-node"}`} aria-hidden="true">{item.kind === "followup" ? <CalendarIcon /> : item.kind === "note" ? <NoteIcon /> : item.kind === "message" ? <WhatsAppIcon /> : item.kind === "call" ? <CallIcon /> : <UserIcon />}</div><div className={`lead-timeline-card ${index === 0 ? "card-highlight" : ""}`}><div className="lead-timeline-card-main"><h4 className="lead-timeline-title">{item.title}</h4><span className="lead-timeline-subtitle">{item.subtitle}</span>{item.body && <p className="lead-timeline-desc">{item.body}</p>}</div>{item.badge && <span className={`lead-timeline-pill ${item.badge === "Upcoming" ? "badge-upcoming" : item.badge === "Connected" ? "badge-connected" : item.badge === "Assigned" ? "badge-assigned" : "badge-latest"}`}>{item.badge}</span>}</div></div>)}</div>;
}

function LeadForm({ form, setForm, errors, onSubmit, onCancel, submitLabel, leadFields, saving = false, error = "", success = "" }: { form: LeadFormState; setForm: React.Dispatch<React.SetStateAction<LeadFormState>>; errors: Record<string, string>; onSubmit: (event: React.FormEvent) => void; onCancel?: () => void; submitLabel: string; leadFields: import("./function").ConfiguredLeadField[]; saving?: boolean; error?: string; success?: string }) {
  const configuredByKey = new Map(leadFields.filter((field) => field.active).map((field) => [field.key, field]));
  const update = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const dropdown = (key: string, label: string, required = false) => { const field = configuredByKey.get(key); return <label className="lead-form-field"><span>{label}{required && <b> *</b>}</span><select className="lead-control" required={required} value={form[key] || ""} onChange={(event) => update(key, event.target.value)}><option value="">Select {label}</option>{(field?.options || []).map((option) => <option key={option} value={option}>{option}</option>)}</select></label>; };
  const text = (key: string, label: string, required = false, type = "text", placeholder?: string) => configuredByKey.get(key)?.type === "dropdown" ? dropdown(key, label, required) : <label className="lead-form-field"><span>{label}{required && <b> *</b>}</span><input className="lead-control" required={required} type={type} value={form[key] || ""} placeholder={placeholder} onChange={(event) => update(key, event.target.value)} />{errors[key] && <small className="lead-form-error">{errors[key]}</small>}</label>;
  const area = (key: string, label: string) => <label className="lead-form-field lead-form-wide"><span>{label}</span><textarea className="lead-control" value={form[key] || ""} onChange={(event) => update(key, event.target.value)} /></label>;
  const yesNo = (key: string, label: string) => configuredByKey.get(key)?.type === "dropdown" ? dropdown(key, label) : <label className="lead-form-field"><span>{label}</span><select className="lead-control" value={form[key] || ""} onChange={(event) => update(key, event.target.value)}><option value="No">No</option><option value="Yes">Yes</option></select></label>;
  const date = (key: string, label: string) => text(key, label, false, "date");
  const dateTime = (key: string, label: string) => text(key, label, false, "datetime-local");
  const additionalFields = leadFields.filter((field) => field.active && !Object.prototype.hasOwnProperty.call(EMPTY_LEAD_FORM, field.key));
  return <form className="lead-structured-form" onSubmit={onSubmit}>
    <section className="lead-form-section"><h3>Basic details</h3><div className="lead-form-grid">{text("lead_no", "Lead No")} {date("lead_acquisition_date", "Lead Acquisition Date")} {text("first_name", "First Name")} {text("last_name", "Last Name")} {text("company", "Company Name")} {text("phone", "Cell No", true, "tel")} {text("email", "Email ID", false, "email")} {text("designation", "Designation")} {text("business_category", "Business Category")} {text("nature_of_business", "Nature of Business")} {text("proposed_solution", "Proposed Solution")}</div></section>
    <section className="lead-form-section"><h3>Introducer details</h3><div className="lead-form-grid">{yesNo("invite_sent_by_introducer", "Invite Sent by Introducer")} {form.invite_sent_by_introducer === "Yes" && date("invite_date_sent", "Invite Date Sent")} {yesNo("introducer_call_done", "Introducer Call Done")} {form.introducer_call_done === "Yes" && date("introducer_call_date", "Introducer Call Date")} {area("introducer_feedback", "Introducer Feedback")} {text("introducer_name", "Introducer Name")} {text("employee_name", "Employee Name")} {text("association_network_name", "Association / Network Name")} {text("chapter_name", "Chapter Name")}</div></section>
    <section className="lead-form-section"><h3>Calling details</h3><div className="lead-form-grid">{dateTime("last_called_on", "Last Called On")}<label className="lead-form-field"><span>Calling Resolution</span><select className="lead-control" value={form.calling_resolution} onChange={(event) => update("calling_resolution", event.target.value)}><option value="">Select resolution</option><option>Connected</option><option>Not reachable</option><option>Follow-up required</option><option>Wrong number</option></select></label>{dateTime("next_call_on", "Next Call On")}{area("calling_remarks", "Calling Remarks")}</div></section>
    <section className="lead-form-section"><h3>Outreach tracking</h3><div className="lead-form-grid">{yesNo("intro_video_sent", "2 Mins Intro Video Sent")} {yesNo("email_sent", "Email Sent")} {yesNo("whatsapp_message_sent", "Msg Sent on WhatsApp")}</div></section>
    <section className="lead-form-section"><h3>Other</h3><div className="lead-form-grid">{area("extra_notes", "Extra Notes")}</div></section>
    {additionalFields.length > 0 && <section className="lead-form-section"><h3>Additional details</h3><div className="lead-form-grid">{additionalFields.map((field) => field.type === "dropdown" ? <span key={field.key}>{dropdown(field.key, field.label)}</span> : field.type === "boolean" ? <label className="lead-form-field" key={field.key}><span>{field.label}</span><select className="lead-control" value={form[field.key] || ""} onChange={(event) => update(field.key, event.target.value)}><option value="">Select</option><option value="Yes">Yes</option><option value="No">No</option></select></label> : field.type === "textarea" ? <span key={field.key}>{area(field.key, field.label)}</span> : <span key={field.key}>{text(field.key, field.label, false, field.type === "date" ? "date" : field.type === "email" ? "email" : field.type === "phone" ? "tel" : field.type === "url" ? "url" : "text")}</span>)}</div></section>}
    {error && <p className="lead-form-error" role="alert">{error}</p>}{success && <p className="lead-form-success" role="status">{success}</p>}
    <div className="lead-form-actions"><button className="leads-button" type="submit" disabled={saving}>{saving ? "Saving…" : submitLabel}</button>{onCancel && <button className="leads-button secondary" type="button" onClick={onCancel} disabled={saving}>Cancel</button>}</div>
  </form>;
}

function InlineLeadCell({ lead, column, canEdit, dropdownOptions, onSave }: { lead: Lead; column: LeadColumn; canEdit: boolean; dropdownOptions: Record<string, Array<{ value: string; label: string }>>; onSave: (field: string, value: unknown) => Promise<unknown> }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(fieldValue(lead, column.key) ?? ""));
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const inputRef = useRef<any>(null);
  const wrapRef = useRef<HTMLSpanElement>(null);

  useEffect(() => { if (!editing) setValue(String(fieldValue(lead, column.key) ?? "")); }, [lead, column.key, editing]);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);
  /* highlight the parent <tr> while editing */
  useEffect(() => {
    const tr = wrapRef.current?.closest("tr");
    if (editing) tr?.classList.add("is-inline-editing");
    return () => { tr?.classList.remove("is-inline-editing"); };
  }, [editing]);

  if (!column.editable || !canEdit) return <span>{displayField(fieldValue(lead, column.key))}</span>;

  const begin = (event: React.MouseEvent | React.KeyboardEvent) => { event.stopPropagation(); setValue(String(fieldValue(lead, column.key) ?? "")); setState("idle"); setEditing(true); };
  const cancel = (event?: React.SyntheticEvent) => { event?.stopPropagation(); setEditing(false); setState("idle"); };
  async function save(event?: React.SyntheticEvent) {
    event?.stopPropagation();
    const next: unknown = column.input === "boolean" ? value === "true" || value === "Yes" : value.trim() || null;
    if (column.required && !next) { setState("error"); return; }
    setState("saving");
    try { await onSave(column.key, next); setState("saved"); setEditing(false); window.setTimeout(() => setState("idle"), 900); } catch { setState("error"); }
  }

  const inputProps = {
    ref: inputRef,
    value,
    className: "inline-edit-input",
    onClick: (event: React.MouseEvent) => event.stopPropagation(),
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setValue(event.target.value),
    onKeyDown: (event: React.KeyboardEvent) => { event.stopPropagation(); if (event.key === "Escape") cancel(event); if (event.key === "Enter" && column.input !== "textarea") { event.preventDefault(); void save(event); } },
    "aria-label": `Edit ${column.label} for ${lead.name}`,
  };

  if (editing) {
    let control: React.ReactNode;
    if (column.input === "textarea") {
      control = <textarea {...inputProps} rows={2} />;
    } else if (column.input === "dropdown" || column.input === "boolean") {
      const options = column.input === "boolean" ? [{ value: "", label: "—" }, { value: "true", label: "Yes" }, { value: "false", label: "No" }] : [{ value: "", label: "—" }, ...(dropdownOptions[column.dropdown || ""] || [])];
      control = <select {...inputProps}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>;
    } else {
      control = <input {...inputProps} type={column.input === "phone" || column.input === "email" ? column.input : column.input === "date" ? "date" : column.input === "datetime" ? "datetime-local" : "text"} />;
    }
    return (
      <span className="inline-edit-wrap" ref={wrapRef}>
        {control}
        <button type="button" className="inline-edit-save" aria-label="Save" disabled={state === "saving"} onClick={(e) => { e.stopPropagation(); void save(e); }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </button>
        <button type="button" className="inline-edit-cancel" aria-label="Cancel" onClick={(e) => { e.stopPropagation(); cancel(e); }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </span>
    );
  }

  return (
    <span ref={wrapRef}>
      <button type="button" className={`inline-lead-cell${state === "error" ? " has-error" : ""}`} title="Click to edit" onClick={begin} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") begin(event); }}>
        {displayField(fieldValue(lead, column.key))}{state === "saving" ? " …" : state === "saved" ? " ✓" : state === "error" ? " !" : ""}
      </button>
    </span>
  );
}

export function LeadsPage() {
  const screen = useLeadsScreen();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [callResolutionMoreOpen, setCallResolutionMoreOpen] = useState(false);
  const [collapsedCallResolutionCount, setCollapsedCallResolutionCount] = useState(0);
  const callResolutionBarRef = useRef<HTMLDivElement>(null);
  const callResolutionMeasureRef = useRef<HTMLDivElement>(null);
  const [psoStage, setPsoStage] = useState("Pre PSO");
  const [psoBarVisible, setPsoBarVisible] = useState(false);
  const [callLogsOpen, setCallLogsOpen] = useState(false);
  const [callLogsMember, setCallLogsMember] = useState("");
  const [callLogsSearch, setCallLogsSearch] = useState("");
  const isAdmin = usePermission("nav.admin");
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [detailTab, setDetailTab] = useState<LeadDetailTab>("activity");
  const [activityMenuOpen, setActivityMenuOpen] = useState(false);
  const [activityFilterOpen, setActivityFilterOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [activityComposer, setActivityComposer] = useState<"note" | "call" | "followup" | null>(null);
  const [detailPsoStage, setDetailPsoStage] = useState("Pre PSO");
  const [detailPsoBarVisible, setDetailPsoBarVisible] = useState(false);
  const [quickAddOpen] = useState(false);
  useRegisterLeadNavbarActions({ openBulkUpload: screen.openBulkUpload, openNewLead: () => navigate("/leads?new=1") });
  const [activeDetailProduct, setActiveDetailProduct] = useState("");

  // Add Note composer state matching reference design
  const [noteType, setNoteType] = useState<"general" | "call" | "meeting" | "handoff">("general");
  const [noteText, setNoteText] = useState("");
  const [relatedActivity, setRelatedActivity] = useState("");
  const [noteTags, setNoteTags] = useState<string[]>([]);
  const [noteVisibility, setNoteVisibility] = useState("");
  const [pinToLead, setPinToLead] = useState(true);
  const [setReminder, setSetReminder] = useState(true);
  const [reminderDate, setReminderDate] = useState("");
  const [reminderTime, setReminderTime] = useState("");
  const [reminderNotify, setReminderNotify] = useState("");
  const [showInHistory, setShowInHistory] = useState(true);
  const [noteAttachments, setNoteAttachments] = useState<string[]>([]);
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [savedNotesList, setSavedNotesList] = useState<
    Array<{
      id: string;
      type: string;
      text: string;
      tags: string[];
      pinned: boolean;
      createdAt: string;
      attachments: string[];
    }>
  >([]);
  const [noteSavedFeedback, setNoteSavedFeedback] = useState(false);

  // Redesigned Add Activity drawer state
  const [showAddActivityDrawer, setShowAddActivityDrawer] = useState(false);
  const [activityType, setActivityType] = useState("Phone call");
  const [activityTypeSearch, setActivityTypeSearch] = useState("");
  const [activityTypeDropdownOpen, setActivityTypeDropdownOpen] = useState(false);
  const activityTypePickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!activityTypeDropdownOpen) return;
    const handleOutsideClick = (event: MouseEvent) => {
      if (!activityTypePickerRef.current?.contains(event.target as Node)) {
        setActivityTypeDropdownOpen(false);
        setActivityTypeSearch("");
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActivityTypeDropdownOpen(false);
        setActivityTypeSearch("");
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [activityTypeDropdownOpen]);

  const [activityDetailsText, setActivityDetailsText] = useState("");
  const [activityAttachments, setActivityAttachments] = useState<string[]>([]);
  const [addFollowUpTask, setAddFollowUpTask] = useState(true);
  const [followUpTitle, setFollowUpTitle] = useState("");
  const [followUpDueDate, setFollowUpDueDate] = useState("");
  const [followUpDueTime, setFollowUpDueTime] = useState("");
  const [followUpAssignee, setFollowUpAssignee] = useState("");
  const [sendNotification, setSendNotification] = useState(true);
  const [notifyMe, setNotifyMe] = useState(true);
  const [notifyBefore, setNotifyBefore] = useState("");
  useEffect(() => {
    if (!relatedActivity && screen.dropdownOptions.relatedActivity[0]) setRelatedActivity(screen.dropdownOptions.relatedActivity[0].value);
    if (!noteVisibility && screen.dropdownOptions.noteVisibility[0]) setNoteVisibility(screen.dropdownOptions.noteVisibility[0].value);
    if (!reminderNotify && screen.userOptions[0]) setReminderNotify(screen.userOptions[0].value);
    if (!followUpAssignee && screen.userOptions[0]) setFollowUpAssignee(screen.userOptions[0].value);
    if (!notifyBefore && screen.dropdownOptions.notifyBefore[0]) setNotifyBefore(screen.dropdownOptions.notifyBefore[0].value);
  }, [followUpAssignee, noteVisibility, notifyBefore, relatedActivity, reminderNotify, screen.dropdownOptions, screen.userOptions]);
  const [notifyViaApp, setNotifyViaApp] = useState(true);
  const [notifyViaEmail, setNotifyViaEmail] = useState(false);

  // Dedicated Follow-up tab state
  const [showFollowUpForm, setShowFollowUpForm] = useState(false);
  const [followUpDate, setFollowUpDate] = useState("");
  const [followUpTime, setFollowUpTime] = useState("");
  const [followUpNote, setFollowUpNote] = useState("");
  const [followUpNotifyApp, setFollowUpNotifyApp] = useState(true);
  const [followUpNotifyEmail, setFollowUpNotifyEmail] = useState(false);
  const [savedFollowUpsList, setSavedFollowUpsList] = useState<
    Array<{
      id: string;
      dueDate: string;
      dueTime: string;
      status: string;
      note: string;
      notifyApp: boolean;
      notifyEmail: boolean;
      createdAt: string;
    }>
  >([]);
  const [followUpSavedFeedback, setFollowUpSavedFeedback] = useState(false);
  const [detailsMoreOpen, setDetailsMoreOpen] = useState(false);
  const [additionalFieldsOpen, setAdditionalFieldsOpen] = useState(false);

  const detailTabRefs = useRef<Partial<Record<LeadDetailTab, HTMLButtonElement | null>>>({});
  useEffect(() => {
    if (screen.detail?.lead.id) setDetailTab("activity");
  }, [screen.detail?.lead.id]);
  useEffect(() => {
    if (!screen.detail && !screen.detailLoading) return;
    const handleDetailEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (showAddActivityDrawer) {
          setShowAddActivityDrawer(false);
          return;
        }
        if (activityFilterOpen) {
          setActivityFilterOpen(false);
          return;
        }
        if (screen.editing) {
          screen.cancelEdit();
          return;
        }
        screen.closeDetail();
      }
    };
    document.addEventListener("keydown", handleDetailEscape);
    return () => document.removeEventListener("keydown", handleDetailEscape);
  }, [screen.detail, screen.detailLoading, screen.closeDetail, screen.editing, showAddActivityDrawer, activityFilterOpen]);
  useEffect(() => { if (!screen.bulkUploadOpen) return; const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") screen.closeBulkUpload(); }; document.addEventListener("keydown", closeOnEscape); return () => document.removeEventListener("keydown", closeOnEscape); }, [screen.bulkUploadOpen, screen.closeBulkUpload]);
  function moveDetailTab(event: React.KeyboardEvent<HTMLButtonElement>, tab: LeadDetailTab) {
    const index = LEAD_DETAIL_TABS.findIndex(([key]) => key === tab);
    const nextIndex = event.key === "ArrowRight" ? (index + 1) % LEAD_DETAIL_TABS.length : event.key === "ArrowLeft" ? (index - 1 + LEAD_DETAIL_TABS.length) % LEAD_DETAIL_TABS.length : -1;
    if (nextIndex < 0) return;
    event.preventDefault();
    const nextTab = LEAD_DETAIL_TABS[nextIndex][0];
    setDetailTab(nextTab);
    detailTabRefs.current[nextTab]?.focus();
  }
  const activeConfiguredFields = screen.leadFields.filter((field) => field.active);
  const configuredFieldLabels = new Map(activeConfiguredFields.map((field) => [field.key, field.label]));
  const configuredFieldsByKey = new Map(activeConfiguredFields.map((field) => [field.key, field]));
  const configuredFields: LeadColumn[] = activeConfiguredFields.map((field) => ({ key: field.key, label: field.label, input: field.type === "boolean" ? "boolean" : field.type === "date" ? "date" : field.type === "dropdown" ? "dropdown" : "text", editable: true, storage: { kind: "custom", key: field.key } }));
  const tableColumns = [...LEAD_COLUMNS.map((field) => configuredFieldLabels.has(field.key) ? { ...field, label: configuredFieldLabels.get(field.key)! } : field), ...configuredFields.filter((field) => !LEAD_COLUMNS.some((column) => column.key === field.key))];
  const baseFields = VIEW_FIELDS[screen.view] || VIEW_FIELDS.new_leads;
  const chooserFields = tableColumns.filter((field) => !field.aliasOf);
  const canonicalKey = (key: string) => tableColumns.find((field) => field.key === key)?.aliasOf || key;
  const allChooserFields = [...baseFields.map((field) => tableColumns.find((candidate) => candidate.key === canonicalKey(field.key)) || { key: field.key, label: field.label, input: "text" as const, editable: false, storage: { kind: "column" as const, key: field.key } }), ...chooserFields.filter((field) => !baseFields.some((b) => canonicalKey(b.key) === field.key))];
  const defaultColumnKeys = [...new Set([...baseFields.map((field) => canonicalKey(field.key)), ...configuredFields.map((field) => field.key)])];
  const [columnChooserOpen, setColumnChooserOpen] = useState(false);
  const [groupByOpen, setGroupByOpen] = useState(false);
  const selectedProductCodes = screen.managedFilters.products || [];
  const [productStageOptions, setProductStageOptions] = useState<Array<{ id: string; label: string }>>([]);
  useEffect(() => { if (!selectedProductCodes.length && (screen.managedFilters.product_stage || []).length) screen.updateManagedFilter("product_stage", []); }, [selectedProductCodes.join("|"), screen.managedFilters.product_stage?.join("|")]);
  useEffect(() => {
    const selectedProducts = screen.products.filter((product) => selectedProductCodes.includes(product.code) || selectedProductCodes.includes(product.label));
    if (!selectedProducts.length) { setProductStageOptions([]); return; }
    let live = true;
    void Promise.all(selectedProducts.map(async (product) => {
      const response = await api<{ stages: Array<{ id: string; label: string; active: boolean }> }>(`/api/products/${encodeURIComponent(product.id)}/stages`);
      return (response.stages || []).filter((stage) => stage.active).map((stage) => ({ id: `${product.id}:${stage.id}`, label: stage.label }));
    })).then((groups) => {
      if (!live) return;
      const seen = new Set<string>();
      setProductStageOptions(groups.flat().filter((stage) => !seen.has(stage.label) && (seen.add(stage.label), true)));
    }).catch(() => { if (live) setProductStageOptions([]); });
    return () => { live = false; };
  }, [screen.products, selectedProductCodes.join("|")]);
  const [visibleColumnKeys, setVisibleColumnKeys] = useState<string[]>(() => normalizeColumnKeys(readStoredColumns(user?.id), allChooserFields, defaultColumnKeys));
  useEffect(() => { setVisibleColumnKeys((current) => normalizeColumnKeys([...current, ...configuredFields.map((field) => field.key)], allChooserFields, defaultColumnKeys)); }, [screen.view, screen.leadFields]);

  /* Enhanced column chooser state */
  const [columnSearch, setColumnSearch] = useState("");
  const [pendingColumnKeys, setPendingColumnKeys] = useState<string[]>([]);
  const [dragColumnIdx, setDragColumnIdx] = useState<number | null>(null);
  const [headerDragKey, setHeaderDragKey] = useState<string | null>(null);
  const [headerDropTarget, setHeaderDropTarget] = useState<{ key: string; side: "before" | "after" } | null>(null);
  const [columnOrderAnnouncement, setColumnOrderAnnouncement] = useState("");
  const columnPreferenceRevision = useRef(0);
  const tableWrapRef = useRef<HTMLDivElement>(null);
  const suppressHeaderSortClickRef = useRef(false);
  const filteredChooserFields = columnSearch ? allChooserFields.filter((f) => f.label.toLowerCase().includes(columnSearch.toLowerCase())) : allChooserFields;
  const filteredColumnKeys = filteredChooserFields.map((field) => field.key);
  const pendingAllSelected = filteredColumnKeys.length > 0 && filteredColumnKeys.every((key) => pendingColumnKeys.includes(key));
  const pendingSelectedCount = pendingColumnKeys.length;
  useEffect(() => { if (columnChooserOpen) { setPendingColumnKeys([...visibleColumnKeys]); setColumnSearch(""); } }, [columnChooserOpen]);
  useEffect(() => {
    if (!user?.id) return;
    let live = true;
    const requestRevision = columnPreferenceRevision.current;
    void api<{ value: unknown }>(`/api/user-preferences/${encodeURIComponent(LEADS_COLUMN_PREFERENCE_KEY)}`).then((response) => {
      if (!live || columnPreferenceRevision.current !== requestRevision || !Array.isArray(response.value)) return;
      const next = normalizeColumnKeys(response.value, allChooserFields, defaultColumnKeys);
      setVisibleColumnKeys(next);
      writeStoredColumns(user.id, next);
    }).catch(() => { /* localStorage remains the offline fallback */ });
    return () => { live = false; };
  }, [user?.id, screen.view, screen.leadFields]);
  function saveColumnOrder(order: string[]) {
    columnPreferenceRevision.current += 1;
    const next = normalizeColumnKeys(order, allChooserFields, defaultColumnKeys);
    setVisibleColumnKeys(next);
    setPendingColumnKeys(next);
    writeStoredColumns(user?.id, next);
    void api(`/api/user-preferences/${encodeURIComponent(LEADS_COLUMN_PREFERENCE_KEY)}`, { method: "POST", body: JSON.stringify({ value: next }) }).catch(() => {});
    return next;
  }
  function applyColumnSelection() {
    saveColumnOrder(pendingColumnKeys);
    setColumnChooserOpen(false);
  }
  function resetColumnSelection() {
    columnPreferenceRevision.current += 1;
    const defaults = normalizeColumnKeys(defaultColumnKeys, allChooserFields, defaultColumnKeys);
    setPendingColumnKeys(defaults);
    setVisibleColumnKeys(defaults);
    clearStoredColumns(user?.id);
    void api(`/api/user-preferences/${encodeURIComponent(LEADS_COLUMN_PREFERENCE_KEY)}`, { method: "DELETE" }).catch(() => {});
    setColumnChooserOpen(false);
  }
  function toggleAllColumns() {
    setPendingColumnKeys((current) => pendingAllSelected ? current.filter((key) => !filteredColumnKeys.includes(key)) : [...current, ...filteredColumnKeys.filter((key) => !current.includes(key))]);
  }
  function togglePendingColumn(key: string) { setPendingColumnKeys((current) => current.includes(key) ? current.filter((k) => k !== key) : [...current, key]); }
  function handleColumnDragStart(key: string) { const index = pendingColumnKeys.indexOf(key); setDragColumnIdx(index >= 0 ? index : null); }
  function handleColumnDragOver(event: React.DragEvent, targetKey: string) { event.preventDefault(); if (dragColumnIdx === null) return; setPendingColumnKeys((current) => { const targetIdx = current.indexOf(targetKey); if (targetIdx < 0 || dragColumnIdx === targetIdx) return current; const next = [...current]; const [moved] = next.splice(dragColumnIdx, 1); next.splice(targetIdx, 0, moved); return next; }); setDragColumnIdx((current) => { const targetIdx = pendingColumnKeys.indexOf(targetKey); return targetIdx >= 0 ? targetIdx : current; }); }
  function handleColumnDragEnd() { setDragColumnIdx(null); }
  function moveVisibleColumn(fromKey: string, toKey: string, side: "before" | "after", announce = false) {
    const next = moveColumnKey(visibleColumnKeys, fromKey, toKey, side);
    if (next.every((key, index) => key === visibleColumnKeys[index])) return false;
    const saved = saveColumnOrder(next);
    if (announce) {
      const field = allChooserFields.find((item) => item.key === fromKey);
      setColumnOrderAnnouncement(`${field?.label || fromKey} moved to position ${saved.indexOf(fromKey) + 1} of ${saved.length}.`);
    }
    return true;
  }
  function handleHeaderDragStart(event: React.DragEvent<HTMLTableCellElement>, key: string) { setHeaderDragKey(key); setHeaderDropTarget(null); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", key); }
  function handleHeaderDragOver(event: React.DragEvent<HTMLTableCellElement>, targetKey: string) {
    event.preventDefault();
    if (!headerDragKey || headerDragKey === targetKey) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const side = event.clientX < bounds.left + bounds.width / 2 ? "before" : "after";
    setHeaderDropTarget({ key: targetKey, side });
    const wrap = tableWrapRef.current;
    if (wrap) { const wrapBounds = wrap.getBoundingClientRect(); if (event.clientX - wrapBounds.left < 48) wrap.scrollLeft -= 18; else if (wrapBounds.right - event.clientX < 48) wrap.scrollLeft += 18; }
  }
  function handleHeaderDrop(event: React.DragEvent<HTMLTableCellElement>, targetKey: string) {
    event.preventDefault();
    const sourceKey = headerDragKey || event.dataTransfer.getData("text/plain");
    const dropTarget = headerDropTarget?.key === targetKey ? headerDropTarget : null;
    if (sourceKey && dropTarget && moveVisibleColumn(sourceKey, dropTarget.key, dropTarget.side)) suppressHeaderSortClickRef.current = true;
    setHeaderDropTarget(null);
  }
  function handleHeaderDragEnd() { setHeaderDragKey(null); setHeaderDropTarget(null); }
  function handleHeaderKeyDown(event: React.KeyboardEvent<HTMLTableCellElement>, key: string) {
    if (!event.altKey || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    const index = visibleColumnKeys.indexOf(key);
    const targetKey = visibleColumnKeys[index + (event.key === "ArrowLeft" ? -1 : 1)];
    if (!targetKey) return;
    event.preventDefault();
    moveVisibleColumn(key, targetKey, event.key === "ArrowLeft" ? "before" : "after", true);
    const header = event.currentTarget;
    requestAnimationFrame(() => header.focus());
  }
  function headerProps(key: string): React.ThHTMLAttributes<HTMLTableCellElement> {
    const dropSide = headerDropTarget?.key === key ? headerDropTarget.side : null;
    return { className: `lead-column-header${headerDragKey === key ? " is-dragging" : ""}${dropSide ? ` drop-${dropSide}` : ""}`, draggable: true, tabIndex: 0, onDragStart: (event) => handleHeaderDragStart(event, key), onDragOver: (event) => handleHeaderDragOver(event, key), onDrop: (event) => handleHeaderDrop(event, key), onDragEnd: handleHeaderDragEnd, onKeyDown: (event) => handleHeaderKeyDown(event, key) };
  }
  const fields = visibleColumnKeys.map((key) => allChooserFields.find((field) => field.key === key)).filter((field): field is (typeof allChooserFields)[number] => Boolean(field));
  const configuredCallResolutionField = activeConfiguredFields.find((field) => field.key === "calling_resolution" && field.type === "dropdown");
  // Prefer the options defined by Admin in Lead Fields. The legacy dropdown is only a fallback.
  const callResolutionOptions = configuredCallResolutionField
    ? (configuredCallResolutionField.options || []).map((option, index) => ({ id: `lead-field-calling-resolution-${index}`, value: option, label: option }))
    : screen.dropdownOptions.callingResolution.filter((option) => option.value);
  const callResolutionOptionsKey = callResolutionOptions.map((option) => `${option.value}:${option.label}`).join("|");
  useEffect(() => {
    const bar = callResolutionBarRef.current;
    const measure = callResolutionMeasureRef.current;
    if (!bar || !measure) return;
    const updateVisibleCount = () => {
      const chipWidths = Array.from(measure.querySelectorAll<HTMLElement>("[data-call-resolution-measure-chip]")).map((chip) => chip.offsetWidth);
      if (!chipWidths.length || !bar.clientWidth) return;
      let used = chipWidths[0];
      let visible = 0;
      for (let index = 1; index < chipWidths.length; index += 1) {
        const nextWidth = used + 6 + chipWidths[index];
        if (nextWidth > bar.clientWidth - 38) break;
        used += 6 + chipWidths[index];
        visible += 1;
      }
      setCollapsedCallResolutionCount((current) => current === visible ? current : visible);
    };
    updateVisibleCount();
    const observer = new ResizeObserver(updateVisibleCount);
    observer.observe(bar);
    return () => observer.disconnect();
  }, [callResolutionOptionsKey, screen.data?.total]);
  const hasHiddenCallResolutionOptions = collapsedCallResolutionCount < callResolutionOptions.length;
  const visibleCallResolutionOptions = callResolutionMoreOpen ? callResolutionOptions : callResolutionOptions.slice(0, collapsedCallResolutionCount);
  const selectedCallResolutions = screen.managedFilters.calling_resolution || [];
  const selectedProductStages = screen.managedFilters.product_stage || [];
  const callResolutionCounts = new Map<string, number>();
  for (const lead of screen.data?.items || []) {
    const resolution = String(fieldValue(lead, "calling_resolution") || "");
    if (resolution) callResolutionCounts.set(resolution, (callResolutionCounts.get(resolution) || 0) + 1);
  }
  function applyCallResolutionFilter(value: string) {
    screen.updateManagedFilter("calling_resolution", selectedCallResolutions.length === 1 && selectedCallResolutions[0] === value ? [] : [value]);
  }
  function applyProductStageFilter(value: string) {
    screen.updateManagedFilter("product_stage", selectedProductStages.length === 1 && selectedProductStages[0] === value ? [] : [value]);
  }
  function renderLeadTableField(lead: Lead, field: LeadColumn) {
    if (field.key === "name") return <><strong>{displayField(fieldValue(lead, field.key))}</strong><small>{displayField(lead.lead_status || lead.email)}</small></>;
    const configured = configuredFieldsByKey.get(field.key);
    if (!configured || !["dropdown", "boolean"].includes(configured.type)) return displayField(fieldValue(lead, field.key));
    const currentValue = fieldValue(lead, field.key);
    const options = configured.type === "boolean" ? [{ value: "", label: "—" }, { value: "true", label: "Yes" }, { value: "false", label: "No" }] : [{ value: "", label: "—" }, ...(configured.options || []).map((option) => ({ value: option, label: option }))];
    const value = configured.type === "boolean" ? currentValue === true ? "true" : currentValue === false ? "false" : "" : String(currentValue || "");
    return <select className="lead-table-field-select" aria-label={`Change ${configured.label} for ${lead.name}`} value={value} disabled={!screen.canEdit} onClick={(event) => event.stopPropagation()} onChange={(event) => { void screen.updateLeadField(lead.id, field.key, event.target.value).catch(() => undefined); }}>
      {options.map((option) => <option key={option.value || "empty"} value={option.value}>{option.label}</option>)}
    </select>;
  }
  const visibleLeadIds = (screen.data?.items || []).map((lead) => lead.id);
  const selectedLeadIdSet = new Set(screen.selectedLeadIds);
  const allVisibleSelected = visibleLeadIds.length > 0 && visibleLeadIds.every((id) => selectedLeadIdSet.has(id));
  const isAllSelected = screen.selectAllView || (visibleLeadIds.length > 0 && allVisibleSelected);
  const isSomeSelected = !isAllSelected && screen.selectedLeadIds.length > 0;
  const selectedIds = screen.selectAllView ? visibleLeadIds : screen.selectedLeadIds;
  function archiveSelectedLeads() { if (selectedIds.length && window.confirm(`Archive ${selectedIds.length} selected lead${selectedIds.length === 1 ? "" : "s"}? You can restore archived data later through an administrator.`)) void screen.archiveLeads(selectedIds); }
  function deleteSelectedLeads() { if (!selectedIds.length) return; const accepted = window.confirm(`Permanently delete ${selectedIds.length} selected lead${selectedIds.length === 1 ? "" : "s"}, including their linked activity? This cannot be undone.`); if (!accepted) return; if (window.prompt('Type DELETE to permanently remove the selected leads.') === "DELETE") void screen.permanentlyDeleteLeads(selectedIds); }
  const selectedLead = screen.detail?.lead;
  const leadName = String(fieldValue(selectedLead!, "name") || "");
  const leadFullName = leadName.trim();
  const placeholderLeadName = /^imported\s+lead$/i.test(leadFullName);
  const nameParts = placeholderLeadName ? [] : leadFullName.split(/\s+/).filter(Boolean);
  const derivedFirstName = nameParts[0] || "";
  const derivedLastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "";
  const rawFirstName = String((selectedLead as any)?.first_name || (selectedLead ? fieldValue(selectedLead, "first_name") : null) || "").trim();
  const rawLastName = String((selectedLead as any)?.last_name || (selectedLead ? fieldValue(selectedLead, "last_name") : null) || "").trim();
  const placeholderSplitName = placeholderLeadName && /^imported$/i.test(rawFirstName) && /^lead$/i.test(rawLastName);
  const leadFirstName = placeholderSplitName ? "" : rawFirstName || derivedFirstName;
  const leadLastName = placeholderSplitName ? "" : rawLastName || derivedLastName;
  const leadStatus = displayField(fieldValue(selectedLead!, "lead_status"));
  const leadSource = displayField(fieldValue(selectedLead!, "leadSource"));
  const ownerName = displayField(fieldValue(selectedLead!, "owner"));
  const assignmentHistory = (screen.detail?.history || []).filter((item: any) => ["lead.round_robin_assigned", "lead.owner_changed"].includes(String(item.action)));
  return <div className={`leads-page${showAddActivityDrawer ? " activity-form-active" : ""}`}>
    {screen.bulkUploadOpen && <div className="bulk-upload-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) screen.closeBulkUpload(); }}><section className="bulk-upload-dialog" role="dialog" aria-modal="true" aria-labelledby="bulk-upload-title"><div className="drawer-head"><div><p className="eyebrow">Leads</p><h2 id="bulk-upload-title">Bulk upload leads</h2></div><button className="icon-button" type="button" onClick={screen.closeBulkUpload} aria-label="Close bulk upload">×</button></div><p>Upload a CSV or .xlsx file. Preview validates the file before anything is written.</p><ol className="bulk-upload-steps"><li>Download sample file</li><li>Fill in your leads (replace the example rows or keep them to test)</li><li>Choose your file and upload</li></ol><div className="bulk-upload-downloads"><button className="leads-button secondary" type="button" onClick={() => void screen.downloadBulkTemplate("xlsx")}>Download sample file</button><button className="leads-button secondary" type="button" onClick={() => void screen.downloadBulkTemplate("csv")}>Download CSV sample</button></div><label className="bulk-upload-file">Choose file<input type="file" accept=".csv,.xlsx" onChange={(event) => { const file = event.target.files?.[0]; if (file) void screen.previewBulkUpload(file); }} /></label><label className="bulk-upload-checkbox"><input type="checkbox" checked={screen.bulkAllowDuplicates} onChange={(event) => screen.setBulkAllowDuplicates(event.target.checked)} /> Import possible duplicates anyway</label>{screen.bulkLoading && <div className="lead-state">Reading file…</div>}{screen.bulkError && <div className="lead-state error" role="alert">{screen.bulkError}</div>}{screen.bulkPreview && <div className="bulk-upload-preview"><p><strong>{screen.bulkPreview.total_rows}</strong> rows · <strong>{screen.bulkPreview.valid}</strong> valid · <strong>{screen.bulkPreview.errors}</strong> errors · <strong>{screen.bulkPreview.possible_duplicates}</strong> possible duplicates</p>{screen.bulkPreview.sheet_note && <p>{screen.bulkPreview.sheet_note}</p>}{screen.bulkPreview.ignored_columns.length > 0 && <p>Ignored columns: {screen.bulkPreview.ignored_columns.join(", ")}</p>}{screen.bulkPreview.duplicate_rows.length > 0 && <div className="bulk-upload-errors"><strong>Possible duplicates</strong>{screen.bulkPreview.duplicate_rows.map((item) => <div key={item.row}>Row {item.row}: {item.reason || "possible duplicate"}</div>)}</div>}{screen.bulkPreview.error_rows.length > 0 && <div className="bulk-upload-errors"><strong>Errors</strong>{screen.bulkPreview.error_rows.map((item) => <div key={item.row}>Row {item.row}: {item.errors.join("; ")}</div>)}</div>}{screen.bulkPreview.preview_rows.length > 0 && <div className="bulk-upload-sample"><strong>First valid rows</strong>{screen.bulkPreview.preview_rows.slice(0, 20).map((row) => <div key={String(row.row)}>{String(row.row)} · {String(row.name || "")}{row.email ? ` · ${String(row.email)}` : ""}</div>)}</div>}<button className="leads-button" type="button" disabled={!screen.bulkPreview.can_apply || screen.bulkLoading} onClick={() => void screen.applyBulkUpload()}>Apply import</button></div>}{screen.bulkResult && <div className="bulk-upload-result" role="status">Created: {screen.bulkResult.created}; skipped duplicates: {screen.bulkResult.skipped_duplicates}; skipped errors: {screen.bulkResult.skipped_errors}; import run: {screen.bulkResult.import_run_id}</div>}</section></div>}
    <header className="leads-header manage-header"><div className="lead-managed-filter-row" aria-label="Lead filters">{screen.managedFilterDropdowns.map((dropdown) => <ManagedFilterMultiSelect key={dropdown.id} dropdown={dropdown} values={screen.managedFilters[dropdown.key] || []} onChange={(values) => screen.updateManagedFilter(dropdown.key, values)} />)}</div></header>
    {screen.newLeadOpen && <div className="lead-edit-form-host"><div className="drawer-head"><h2>New lead</h2><button className="icon-button" type="button" onClick={screen.closeNewLead} aria-label="Close new lead form"><CloseIcon /></button></div><LeadForm form={screen.newLeadForm} setForm={screen.setNewLeadForm} errors={screen.formErrors} onSubmit={(event) => void screen.createNewLead(event)} onCancel={screen.closeNewLead} submitLabel="Save Lead" leadFields={screen.leadFields} /></div>}
    {quickAddOpen && <div className="quick-add-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) screen.closeNewLead(); }}><div className="quick-add-modal" aria-labelledby="quick-add-title">
      <div className="quick-add-header"><div className="quick-add-title-wrap"><div className="quick-add-icon"><UserIcon /></div><div><h2 id="quick-add-title">Quick Add Lead</h2><p>Add a new lead to your pipeline</p></div></div><button className="quick-add-close" type="button" onClick={screen.closeNewLead} aria-label="Close quick add lead"><CloseIcon /></button></div>
      <div className="legacy-quick-add-fields">
        <label className="quick-add-field"><span>Name <b>*</b></span><div className="quick-add-input"><UserIcon /><input required autoFocus placeholder="Enter name" value={screen.newLeadForm.name} onChange={(event) => screen.setNewLeadForm((form) => ({ ...form, name: event.target.value }))} /></div></label>
        <label className="quick-add-field"><span>Email <b>*</b></span><div className="quick-add-input"><MailIcon /><input required type="email" placeholder="Enter email" value={screen.newLeadForm.email} onChange={(event) => screen.setNewLeadForm((form) => ({ ...form, email: event.target.value }))} /></div></label>
        <label className="quick-add-field"><span>Phone <b>*</b></span><div className="quick-add-input"><PhoneIcon /><input required placeholder="Enter phone number" value={screen.newLeadForm.phone} onChange={(event) => screen.setNewLeadForm((form) => ({ ...form, phone: event.target.value }))} /></div></label>
        <label className="quick-add-field"><span>Company <b>*</b></span><div className="quick-add-input"><BuildingIcon /><input required placeholder="Enter company name" value={screen.newLeadForm.company} onChange={(event) => screen.setNewLeadForm((form) => ({ ...form, company: event.target.value }))} /></div></label>
        <label className="quick-add-field"><span>Team <b>*</b></span><div className="quick-add-input"><TeamIcon /><input required placeholder="Select team" value={screen.newLeadForm.team} onChange={(event) => screen.setNewLeadForm((form) => ({ ...form, team: event.target.value }))} /></div></label>
        <label className="quick-add-field"><span>Lead type</span><div className="quick-add-select"><TagIcon /><DropdownSelect dropdownKey="lead_type" options={screen.dropdownOptions.leadType} value={screen.newLeadForm.lead_type} onValueChange={(value) => screen.setNewLeadForm((form) => ({ ...form, lead_type: value }))} /></div></label>
        <label className="quick-add-field"><span>Permission To Call</span><div className="quick-add-select"><PhoneIcon /><DropdownSelect dropdownKey="permission" options={screen.dropdownOptions.permission} value={screen.newLeadForm.permission} onValueChange={(value) => screen.setNewLeadForm((form) => ({ ...form, permission: value }))} /></div></label>
        <label className="quick-add-field quick-add-products"><span>Product</span><div className="quick-add-input"><BoxIcon /><select value={screen.newLeadForm.product} onChange={(event) => screen.setNewLeadForm((form) => ({ ...form, product: event.target.value }))}><option value="">Select product</option>{screen.products.map((product) => <option key={product.id} value={product.code}>{product.label}</option>)}</select></div></label>
      </div>
      <LeadForm form={screen.newLeadForm} setForm={screen.setNewLeadForm} errors={screen.formErrors} onSubmit={(event) => void screen.createNewLead(event)} onCancel={screen.closeNewLead} submitLabel="Save Lead" leadFields={screen.leadFields} />
    </div></div>}
    {/* The filter controls below are populated from managed dropdowns and users. */}
    {false && <><div className="lead-quick-chip-bar" role="toolbar" aria-label="Quick filters">
      {/* Date chip */}
      <button className="lead-chip lead-chip-date" type="button" aria-label="Date range filter">
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="1" y="2" width="14" height="13" rx="2" /><path d="M1 6h14M5 1v2M11 1v2" /></svg>
        <span>Sep 13 – Oct 13</span>
        <svg className="lead-chip-caret" viewBox="0 0 10 10" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="m2 3.5 3 3 3-3" /></svg>
      </button>
      {/* Call Logs chip — admin only opens member picker */}
      <div className="lead-chip-wrap">
        <button
          className={`lead-chip lead-chip-activity${callLogsOpen ? " lead-chip-active" : ""}`}
          type="button"
          aria-label="Activity type filter"
          aria-expanded={isAdmin ? callLogsOpen : undefined}
          onClick={() => { if (isAdmin) { setCallLogsOpen((o) => !o); setCallLogsSearch(""); } }}
        >
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zM8 4v4l3 1.5" /></svg>
          <span>Call Logs{callLogsMember && isAdmin ? ` · ${screen.userOptions.find((o) => o.value === callLogsMember)?.label ?? ""}` : ""}</span>
          <svg className="lead-chip-caret" viewBox="0 0 10 10" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="m2 3.5 3 3 3-3" /></svg>
        </button>
        {isAdmin && callLogsOpen && (
          <div className="call-logs-dropdown" role="listbox" aria-label="Select member">
            <p className="call-logs-dropdown-title">Select Member</p>
            <div className="call-logs-search-wrap">
              <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="6.5" cy="6.5" r="5"/><path d="M11 11l3 3"/></svg>
              <input className="call-logs-search" type="text" placeholder="Search member..." value={callLogsSearch} autoFocus onChange={(e) => setCallLogsSearch(e.target.value)} />
            </div>
            <ul className="call-logs-list">
              <li>
                <button type="button" className={`call-logs-member${callLogsMember === "" ? " call-logs-member-active" : ""}`} onClick={() => { setCallLogsMember(""); setCallLogsOpen(false); }}>
                  <span className="call-logs-avatar call-logs-avatar-all" aria-hidden="true">
                    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="10" cy="7" r="4"/><path d="M2 18c0-4 3.6-7 8-7s8 3 8 7"/></svg>
                  </span>
                  <span className="call-logs-member-name">All Members</span>
                </button>
              </li>
              {screen.userOptions
                .filter((u) => !callLogsSearch || u.label.toLowerCase().includes(callLogsSearch.toLowerCase()))
                .map((u) => {
                  const initials = u.label.split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase();
                  return (
                    <li key={u.value}>
                      <button type="button" className={`call-logs-member${callLogsMember === u.value ? " call-logs-member-active" : ""}`} onClick={() => { setCallLogsMember(u.value); setCallLogsOpen(false); }}>
                        <span className="call-logs-avatar" aria-hidden="true">{initials}</span>
                        <span className="call-logs-member-name">{u.label}</span>
                      </button>
                    </li>
                  );
                })
              }
            </ul>
          </div>
        )}
      </div>
      <div className="lead-chip-divider" aria-hidden="true" />
      {/* PSO chip — toggles PSO stage bar */}
      <button
        className={`lead-chip lead-chip-filter${psoBarVisible ? " lead-chip-active" : ""}`}
        type="button"
        aria-label="Filter by PSO"
        aria-expanded={psoBarVisible}
        onClick={() => { setPsoBarVisible((v) => !v); if (!psoBarVisible) setPsoStage("Pre PSO"); }}
      >
        <svg viewBox="0 0 14 14" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><polygon points="13 1 1 1 5.5 6.5 5.5 12 8.5 13 8.5 6.5 13 1" /></svg>
        <span>PSO</span>
        <svg className="lead-chip-caret" viewBox="0 0 10 10" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="m2 3.5 3 3 3-3" /></svg>
      </button>
      {/* Remaining filter chips */}
      {(["PS", "BSSO", "Altus OS", "Altus Concave", "Key note speech", "Consulting"] as const).map((label) => (
        <button key={label} className="lead-chip lead-chip-filter" type="button" aria-label={`Filter by ${label}`}>
          <svg viewBox="0 0 14 14" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><polygon points="13 1 1 1 5.5 6.5 5.5 12 8.5 13 8.5 6.5 13 1" /></svg>
          <span>{label}</span>
          <svg className="lead-chip-caret" viewBox="0 0 10 10" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="m2 3.5 3 3 3-3" /></svg>
        </button>
      ))}
    </div>
    {/* PSO Stage bar — toggled by PSO chip */}
    {psoBarVisible && (
      <div className="lead-pso-stage-bar" role="group" aria-label="PSO stage filter">
        <span className="lead-pso-stage-label">PSO Stage</span>
        <div className="lead-pso-stage-tabs">
          {(["Pre PSO", "During PSO", "Attend PSO", "Not Attend PSO"] as const).map((stage) => (
            <label key={stage} className="lead-pso-stage-tab">
              <input type="radio" name="pso-stage" value={stage} checked={psoStage === stage} onChange={() => setPsoStage(stage)} />
              <span>{stage}</span>
            </label>
          ))}
        </div>
        <button className="lead-pso-clear" type="button" aria-label="Clear PSO stage filter" onClick={() => { setPsoBarVisible(false); setPsoStage(""); }}>
          <CloseIcon /> Clear
        </button>
      </div>
    )}</>}
    {screen.detail && !screen.detailLoading && <section className="lead-edit-panel" aria-label="Lead actions">
      <div className="drawer-head"><div><p className="eyebrow">Selected lead</p><h2>{screen.detail.lead.name}</h2></div><button className="leads-button secondary" type="button" onClick={screen.closeDetail}>Close</button></div>
      {!screen.editing && <div className="lead-action-row"><button className="leads-button" type="button" onClick={screen.beginEdit}>Edit lead</button>{screen.canAssign && <button className="leads-button secondary" type="button" onClick={() => void screen.reassignByRoundRobin()}>Reassign by round-robin</button>}{screen.canConvertAccount && <button className="leads-button secondary" type="button" onClick={() => void screen.convertLead()}>Convert to account</button>}<label>Stage<DropdownSelect dropdownKey="lead_stage" options={screen.dropdownOptions.stage} className="lead-control" includeEmpty emptyLabel="Unstaged" value={String(screen.detail.lead.stage || "")} onValueChange={(value) => void screen.updateStage(value)} /></label>{screen.canChangePermission && <label>Permission To Call<DropdownSelect dropdownKey="permission" options={screen.dropdownOptions.permission} className="lead-control" value={String(screen.detail.lead.permission || screen.dropdownDefaults.permission)} onValueChange={(value) => void screen.updatePermission(value)} /></label>}</div>}
      {screen.editing && <form className="lead-edit-form" onSubmit={(event) => void screen.saveLeadEdit(event)}><label>Name<input required className="lead-control" value={screen.editForm.name} onChange={(event) => screen.setEditForm((form) => ({ ...form, name: event.target.value }))} /></label><label>Email<input type="email" className="lead-control" value={screen.editForm.email} onChange={(event) => screen.setEditForm((form) => ({ ...form, email: event.target.value }))} /></label><label>Phone<input className="lead-control" value={screen.editForm.phone} onChange={(event) => screen.setEditForm((form) => ({ ...form, phone: event.target.value }))} /></label><label>Company<input className="lead-control" value={screen.editForm.company} onChange={(event) => screen.setEditForm((form) => ({ ...form, company: event.target.value }))} /></label><label>Lead type<DropdownSelect dropdownKey="lead_type" options={screen.dropdownOptions.leadType} className="lead-control" value={screen.editForm.lead_type} onValueChange={(value) => screen.setEditForm((form) => ({ ...form, lead_type: value }))} /></label><div className="lead-action-row"><button className="leads-button" type="submit">Save lead</button><button className="leads-button secondary" type="button" onClick={screen.cancelEdit}>Cancel</button></div></form>}
    </section>}
    {screen.editSuccess && <div className="lead-toast" role="status">{screen.editSuccess}</div>}{screen.editing && <div className="lead-edit-form-host"><LeadForm form={screen.editForm} setForm={screen.setEditForm} errors={screen.formErrors} onSubmit={(event) => void screen.saveLeadEdit(event)} onCancel={screen.cancelEdit} submitLabel="Save lead" leadFields={screen.leadFields} saving={screen.editSaving} error={screen.editError} /></div>}
    {false && <section className="lead-filters lead-dynamic-filters" aria-label="Lead filters">
      <button className="leads-button filter-toggle" type="button" aria-expanded={screen.advancedOpen} onClick={() => screen.openAdvancedFilter()}>+ Filter</button>
      <SavedFiltersPicker screen={screen} />
      <div className="lead-filter-primary"><div className="lead-view-picker" ref={screen.viewMenuRef}><span>View</span><button ref={screen.viewButtonRef} className="lead-view-button" type="button" aria-haspopup="listbox" aria-expanded={screen.viewMenuOpen} onClick={() => screen.viewMenuOpen ? screen.closeViewMenu() : screen.openViewMenu()} onKeyDown={screen.handleViewButtonKeyDown}>{screen.currentViewLabel}<span aria-hidden="true">v</span></button>{screen.viewMenuOpen && <div className="lead-view-menu" role="listbox" aria-label="Lead views">{screen.viewGroups.map((group) => <div className="lead-view-group" key={group.label}><div className="lead-view-group-label">{group.label}</div>{group.views.map(([key, label]) => { const index = screen.viewOptions.findIndex(([groupKey]) => groupKey === key); return <button key={key} ref={(element) => { screen.viewOptionRefs.current[index] = element; }} className={screen.view === key ? "lead-view-option selected" : "lead-view-option"} type="button" role="option" aria-selected={screen.view === key} onClick={() => screen.chooseView(key)} onKeyDown={(event) => screen.handleViewOptionKeyDown(event, index)}>{label}<span>{screen.viewCounts[key] ?? "…"}</span></button>; })}</div>)}</div>}</div>
        <label className="lead-search"><span>Search</span><input className="lead-control" value={screen.filters.q} onChange={(event) => screen.updateFilter("q", event.target.value)} placeholder="Name, company, email or lead number" /></label><label><span>Stage</span><DropdownSelect dropdownKey="lead_stage" options={screen.dropdownOptions.stage} className="lead-control" includeEmpty emptyLabel="All stages" value={screen.filters.stage} onValueChange={(value) => screen.updateFilter("stage", value)} /></label><label><span>Permission</span><DropdownSelect dropdownKey="permission" options={screen.dropdownOptions.permission} className="lead-control" includeEmpty emptyLabel="All" value={screen.filters.permission} onValueChange={(value) => screen.updateFilter("permission", value)} /></label>
      </div><div className="lead-filter-secondary"><label><span>Caller</span><DropdownSelect dropdownKey="lead_owner" options={screen.userOptions} className="lead-control" includeEmpty emptyLabel="All callers" value={screen.filters.owner} onValueChange={(value) => screen.updateFilter("owner", value)} /></label><label><span>Lead status</span><select className="lead-control" value={screen.filters.lead_status} onChange={(event) => screen.updateFilter("lead_status", event.target.value)}><option value="">All statuses</option>{screen.statusOptions.filter(Boolean).map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label><span>PSO from</span><input className="lead-control" type="date" value={screen.filters.pso_date_from} onChange={(event) => screen.updateFilter("pso_date_from", event.target.value)} /></label><label><span>PSO to</span><input className="lead-control" type="date" value={screen.filters.pso_date_to} onChange={(event) => screen.updateFilter("pso_date_to", event.target.value)} /></label><label><span>Follow-up</span><input className="lead-control" type="date" value={screen.filters.next_follow_up} onChange={(event) => screen.updateFilter("next_follow_up", event.target.value)} /></label>{screen.filtersActive && <button className="leads-button clear-filters" type="button" onClick={screen.clearFilters}>Clear filters</button>}</div>
    </section>}
    {screen.error && <div className="lead-state error" role="alert"><span>{screen.error}</span><button className="leads-button secondary" onClick={() => void screen.load(true)}>Retry</button></div>}{screen.loading && <div className="lead-state">Loading leads…</div>}{!screen.loading && !screen.error && screen.data?.items.length === 0 && <div className="lead-state"><strong>No leads in this view.</strong><span>Try another view or clear a filter.</span></div>}
    {!screen.loading && !screen.error && !!screen.data?.items.length && <>
      <div className="call-resolution-summary" aria-label="Filter leads by call resolution">
        <div className="call-resolution-bar" ref={callResolutionBarRef}>
          <button type="button" className={!selectedCallResolutions.length ? "call-resolution-chip selected" : "call-resolution-chip"} onClick={() => screen.updateManagedFilter("calling_resolution", [])}><span className="call-resolution-dot" /><strong>{screen.data.total}</strong><span className="call-resolution-label">Total</span></button>
          {visibleCallResolutionOptions.map((option, index) => <button key={option.id || option.value} type="button" className={selectedCallResolutions.includes(option.value) ? `call-resolution-chip selected tone-${index % 7}` : `call-resolution-chip tone-${index % 7}`} onClick={() => applyCallResolutionFilter(option.value)}><span className="call-resolution-dot" /><strong>{callResolutionCounts.get(option.value) || 0}</strong><span className="call-resolution-label">{option.label}</span></button>)}
        </div>
        {hasHiddenCallResolutionOptions && <button className="call-resolution-more" type="button" aria-expanded={callResolutionMoreOpen} aria-label={callResolutionMoreOpen ? "Show fewer statuses" : "Show more statuses"} title={callResolutionMoreOpen ? "Show fewer statuses" : "Show more statuses"} onClick={() => setCallResolutionMoreOpen((open) => !open)}>{callResolutionMoreOpen ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}</button>}
        <div className="call-resolution-measure" ref={callResolutionMeasureRef} aria-hidden="true">
          <span className="call-resolution-chip" data-call-resolution-measure-chip><span className="call-resolution-dot" /><strong>{screen.data.total}</strong><span className="call-resolution-label">Total</span></span>
          {callResolutionOptions.map((option, index) => <span className={`call-resolution-chip tone-${index % 7}`} data-call-resolution-measure-chip key={option.id || option.value}><span className="call-resolution-dot" /><strong>{callResolutionCounts.get(option.value) || 0}</strong><span className="call-resolution-label">{option.label}</span></span>)}
        </div>
      </div>
      {selectedProductCodes.length > 0 && <div className="product-stage-summary" aria-label="Filter selected product by stage"><span>Product stages</span><button type="button" className={!selectedProductStages.length ? "product-stage-chip selected" : "product-stage-chip"} onClick={() => screen.updateManagedFilter("product_stage", [])}>All stages</button>{productStageOptions.map((stage) => <button key={stage.id} type="button" className={selectedProductStages.includes(stage.label) ? "product-stage-chip selected" : "product-stage-chip"} onClick={() => applyProductStageFilter(stage.label)}>{stage.label}</button>)}{!productStageOptions.length && <span className="product-stage-empty">No active stages for this product.</span>}</div>}<div className="lead-table-toolbar"><div className="lead-group-by-wrap"><button className="leads-button secondary lead-group-by-button" type="button" aria-expanded={groupByOpen} onClick={() => setGroupByOpen((open) => !open)}>⌘ <span>Group By</span>⌄</button>{groupByOpen && <div className="lead-group-by-menu" role="menu"><button type="button" role="menuitem" onClick={() => setGroupByOpen(false)}>No grouping</button><button type="button" role="menuitem" onClick={() => setGroupByOpen(false)}>Owner</button><button type="button" role="menuitem" onClick={() => setGroupByOpen(false)}>Lead source</button><button type="button" role="menuitem" onClick={() => setGroupByOpen(false)}>Stage</button></div>}</div><div className="lead-table-toolbar-right"><span className="lead-table-count-pill">All ({screen.data.total})</span><span>Showing {screen.data.total === 0 ? 0 : (screen.page - 1) * (screen.data.page_size || 50) + 1}–{Math.min(screen.page * (screen.data.page_size || 50), screen.data.total)} of {screen.data.total}</span><label className="lead-toolbar-rows"><span>Rows</span><DropdownSelect dropdownKey="page_size" options={screen.dropdownOptions.pageSize} className="lead-control" aria-label="Rows per page" value={String(screen.pageSize)} onValueChange={screen.changePageSize} /></label><span>Page</span><button className="lead-toolbar-page" type="button" disabled={screen.page <= 1} onClick={screen.previousPage}>‹</button><span className="lead-toolbar-page-number">{screen.page}</span><span>of {screen.totalPages}</span><button className="lead-toolbar-page" type="button" disabled={screen.page >= screen.totalPages} onClick={screen.nextPage}>›</button><div className="lead-column-chooser"><button className="leads-button secondary lead-toolbar-columns" type="button" aria-expanded={columnChooserOpen} aria-haspopup="menu" onClick={() => setColumnChooserOpen((open) => !open)}>☷ <span>Columns</span></button>{columnChooserOpen && <div className="lead-column-menu" role="menu" aria-label="Choose columns">
              <div className="col-menu-search-wrap">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                <input className="col-menu-search" type="text" placeholder="Search columns..." value={columnSearch} onChange={(e) => setColumnSearch(e.target.value)} autoFocus />
              </div>
              <label className="col-menu-select-all">
                <input type="checkbox" checked={pendingAllSelected} onChange={toggleAllColumns} />
                <span>Select All</span>
                <span className="col-menu-count">{pendingSelectedCount} of {allChooserFields.length} selected</span>
              </label>
              <div className="col-menu-list">
                {filteredChooserFields.map((field) => {
                  const idx = pendingColumnKeys.indexOf(field.key);
                  return (
                    <label key={field.key} className={`col-menu-item${dragColumnIdx !== null && idx === dragColumnIdx ? " col-dragging" : ""}`} draggable onDragStart={() => handleColumnDragStart(field.key)} onDragOver={(e) => handleColumnDragOver(e, field.key)} onDragEnd={handleColumnDragEnd}>
                      <input type="checkbox" checked={pendingColumnKeys.includes(field.key)} onChange={() => togglePendingColumn(field.key)} />
                      <span>{field.label}</span>
                      <span className="col-menu-drag-handle" aria-hidden="true">⠿</span>
                    </label>
                  );
                })}
              </div>
               <div className="col-menu-footer">
                 <button type="button" className="col-menu-reset" onClick={resetColumnSelection}>Reset</button>
                 <button type="button" className="col-menu-apply" onClick={applyColumnSelection}>Apply</button>
               </div>
            </div>}</div></div></div>{(screen.selectAllView || screen.selectedLeadIds.length > 0) && (
      <div className="lead-selection-bar" role="status" aria-live="polite">
        <span className="lead-selection-count">
          {screen.selectAllView ? (
            <>All <strong>{visibleLeadIds.length}</strong> visible leads selected</>
          ) : (
            <><strong>{screen.selectedLeadIds.length}</strong> {screen.selectedLeadIds.length === 1 ? "lead" : "leads"} selected</>
          )}
        </span>
        <div className="lead-selection-actions">{screen.canDelete && <><button type="button" className="leads-button secondary lead-selection-clear-btn" onClick={archiveSelectedLeads}>Archive selected</button><button type="button" className="leads-button lead-selection-delete-btn" onClick={deleteSelectedLeads}>Delete permanently</button></>}<button type="button" className="leads-button secondary lead-selection-clear-btn" onClick={screen.clearSelection}>Deselect all</button></div>
      </div>
    )}<div className="lead-column-order-announcement" role="status" aria-live="polite">{columnOrderAnnouncement}</div><div className="lead-table-wrap" ref={tableWrapRef}><table className="lead-table"><thead><tr><th className="lead-table-checkbox-col" scope="col"><label className="lead-table-checkbox-label"><TableSelectAllCheckbox checked={isAllSelected} indeterminate={isSomeSelected} onChange={() => screen.toggleSelectAll(visibleLeadIds)} ariaLabel="Select all leads" /></label></th>{fields.map((field) => { const sortKey = configuredFieldsByKey.has(field.key) ? `configured:${field.key}` : LEAD_SORT_KEYS[field.key]; const onSort = (key: string) => { if (suppressHeaderSortClickRef.current) { suppressHeaderSortClickRef.current = false; return; } screen.changeSort(key); }; return sortKey ? <SortableLeadHeader key={field.key} label={field.label} sortKey={sortKey} sortBy={screen.sortBy} sortDir={screen.sortDir} onSort={onSort} headerProps={headerProps(field.key)} /> : <th key={field.key} scope="col" {...headerProps(field.key)}>{field.label}</th>; })}<SortableLeadHeader label="Status" sortKey="lead_status" sortBy={screen.sortBy} sortDir={screen.sortDir} onSort={screen.changeSort} /></tr></thead><tbody>{screen.data.items.map((lead) => { const isSelected = screen.selectAllView || selectedLeadIdSet.has(lead.id); const statusOptions = screen.statusOptions.includes(lead.lead_status as (typeof screen.statusOptions)[number]) ? screen.statusOptions : [lead.lead_status || "", ...screen.statusOptions.filter(Boolean)]; return <tr key={lead.id} tabIndex={0} className={isSelected ? "is-selected" : undefined} onClick={() => void screen.openDetail(lead.id)} onKeyDown={(event) => { if (event.key === "Enter") void screen.openDetail(lead.id); }}><td className="lead-table-checkbox-col" onClick={(event) => { event.stopPropagation(); }}><input type="checkbox" className="lead-table-checkbox" checked={isSelected} aria-label={`Select lead ${lead.name}`} onChange={() => screen.toggleSelectLead(lead.id, visibleLeadIds)} onClick={(event) => event.stopPropagation()} /></td>{fields.map((field) => <td key={field.key}>{renderLeadTableField(lead, field)}</td>)}<td onClick={(event) => event.stopPropagation()}><select className="lead-status-select" aria-label={`Change status for ${lead.name}`} value={lead.lead_status || ""} disabled={screen.statusUpdatingId === lead.id} onChange={(event) => void screen.updateLeadStatus(lead.id, event.target.value)}>{statusOptions.map((status) => <option key={status || "empty"} value={status}>{status || "—"}</option>)}</select></td></tr>; })}</tbody></table></div></>}
    {screen.detailLoading && <div className="drawer-backdrop"><aside className="lead-drawer"><div className="drawer-head"><h2>Lead details</h2><button className="icon-button" type="button" onClick={screen.closeDetail} aria-label="Close lead details"><CloseIcon /></button></div><div className="lead-state">Loading…</div></aside></div>}
    {screen.detail && !screen.detailLoading && (
      <div
        className="drawer-backdrop"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) screen.closeDetail();
        }}
      >
        <aside
          className="lead-drawer"
          role="dialog"
          aria-modal="true"
          aria-label={`Lead details for ${screen.detail.lead.name}`}
        >
          {/* 1-3. Static Top Section (Header, Quick Actions, Tabs) */}
          <div className="lead-detail-static-top">
            {/* 1. Header */}
            <div className="lead-detail-header">
              <div className="lead-detail-title-group">
                <span className="lead-detail-eyebrow">LEAD DETAIL</span>
                <h2 className="lead-detail-title">{displayField(fieldValue(selectedLead!, "name"))}</h2>
              </div>
              <button
                className="lead-detail-close-btn"
                type="button"
                onClick={screen.closeDetail}
                aria-label="Close lead details"
              >
                <CloseIcon />
              </button>
            </div>

            {/* 2. Quick actions */}
            <div className="lead-quick-actions-bar" aria-label="Quick actions">
              <span className="lead-quick-actions-label">Quick actions</span>
              <div className="lead-quick-actions-list">
                <button
                  type="button"
                  className="lead-quick-action-btn"
                  disabled={!screen.canLogCall}
                  title={screen.canLogCall ? "Log a call" : screen.callDisabledReason}
                  aria-label={screen.canLogCall ? "Log call" : `Log call disabled: ${screen.callDisabledReason}`}
                  onClick={() => {
                    setDetailTab("activity");
                    setActivityComposer("call");
                  }}
                >
                  <CallIcon />
                  <span>Call</span>
                </button>
                <button
                  type="button"
                  className="lead-quick-action-btn"
                  onClick={() => {
                    if (screen.detail?.lead.email) {
                      window.location.href = `mailto:${screen.detail.lead.email}`;
                    } else {
                      alert("No email address registered for this lead.");
                    }
                  }}
                >
                  <EmailIcon />
                  <span>Email</span>
                </button>
                <button
                  type="button"
                  className="lead-quick-action-btn"
                  onClick={() => {
                    const phone = screen.detail?.lead.phone;
                    if (phone) {
                      const clean = phone.replace(/[^0-9]/g, "");
                      window.open(`https://wa.me/${clean}`, "_blank", "noopener,noreferrer");
                    } else {
                      alert("No phone number registered for this lead.");
                    }
                  }}
                >
                  <WhatsAppIcon />
                  <span>WhatsApp</span>
                </button>
                <button
                  type="button"
                  className="lead-quick-action-btn"
                  onClick={() => {
                    setDetailTab("notes");
                    setShowNoteForm(true);
                  }}
                >
                  <NoteIcon />
                  <span>Note</span>
                </button>
                <button
                  type="button"
                  className="lead-quick-action-btn"
                  onClick={() => {
                    setDetailTab("follow-up");
                    setShowFollowUpForm(true);
                  }}
                >
                  <CalendarIcon />
                  <span>Follow-up</span>
                </button>
              </div>
            </div>

            {/* 3. Section Tabs */}
            <div className="lead-detail-tabs" role="tablist" aria-label="Lead detail sections">
              {LEAD_DETAIL_TABS.map(([tab, label]) => (
                <button
                  key={tab}
                  ref={(element) => {
                    detailTabRefs.current[tab] = element;
                  }}
                  className={detailTab === tab ? "lead-detail-tab active" : "lead-detail-tab"}
                  type="button"
                  role="tab"
                  aria-selected={detailTab === tab}
                  aria-controls={`lead-detail-panel-${tab}`}
                  tabIndex={detailTab === tab ? 0 : -1}
                  onClick={() => setDetailTab(tab)}
                  onKeyDown={(event) => moveDetailTab(event, tab)}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* 3b. Product and Stage Filter Chips */}
            <div className="lead-detail-product-bar" role="toolbar" aria-label="Product and stage filters">
              <button
                className={`lead-chip lead-chip-filter${detailPsoBarVisible ? " lead-chip-active" : ""}`}
                type="button"
                aria-label="Filter by PSO"
                aria-expanded={detailPsoBarVisible}
                onClick={() => {
                  setDetailPsoBarVisible((v) => !v);
                  if (!detailPsoBarVisible) setDetailPsoStage("Pre PSO");
                }}
              >
                <svg viewBox="0 0 14 14" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <polygon points="13 1 1 1 5.5 6.5 5.5 12 8.5 13 8.5 6.5 13 1" />
                </svg>
                <span>PSO</span>
                <svg className="lead-chip-caret" viewBox="0 0 10 10" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="m2 3.5 3 3 3-3" />
                </svg>
              </button>
              {(["PS", "BSSO", "Altus OS", "Altus Concave", "Key note speech", "Consulting"] as const).map((label) => {
                const isActive = activeDetailProduct === label;
                return (
                  <button
                    key={label}
                    className={`lead-chip lead-chip-filter${isActive ? " lead-chip-active" : ""}`}
                    type="button"
                    aria-label={`Filter by ${label}`}
                    onClick={() => setActiveDetailProduct((curr) => (curr === label ? "" : label))}
                  >
                    <svg viewBox="0 0 14 14" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                      <polygon points="13 1 1 1 5.5 6.5 5.5 12 8.5 13 8.5 6.5 13 1" />
                    </svg>
                    <span>{label}</span>
                    <svg className="lead-chip-caret" viewBox="0 0 10 10" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                      <path d="m2 3.5 3 3 3-3" />
                    </svg>
                  </button>
                );
              })}
            </div>
            {detailPsoBarVisible && (
              <div className="lead-pso-stage-bar" role="group" aria-label="PSO stage filter">
                <span className="lead-pso-stage-label">PSO Stage</span>
                <div className="lead-pso-stage-tabs">
                  {(["Pre PSO", "During PSO", "Attend PSO", "Not Attend PSO"] as const).map((stage) => (
                    <label key={stage} className="lead-pso-stage-tab">
                      <input
                        type="radio"
                        name="detail-pso-stage"
                        value={stage}
                        checked={detailPsoStage === stage}
                        onChange={() => setDetailPsoStage(stage)}
                      />
                      <span>{stage}</span>
                    </label>
                  ))}
                </div>
                <button
                  className="lead-pso-clear"
                  type="button"
                  aria-label="Clear PSO stage filter"
                  onClick={() => {
                    setDetailPsoBarVisible(false);
                    setDetailPsoStage("");
                  }}
                >
                  <CloseIcon /> Clear
                </button>
              </div>
            )}
          </div>

          {/* 4. Tab Panel: Activity */}
          {detailTab === "activity" && (
            <section
              className="lead-detail-tab-panel"
              id="lead-detail-panel-activity"
              role="tabpanel"
              aria-label="Lead activity"
            >
              {/* Activity Section Heading & Actions */}
              <div className="lead-activity-header-row">
                <h3 className="lead-activity-title">Activity</h3>
                <div className="lead-activity-actions-wrap">
                  <div className="lead-activity-menu-wrap">
                    <button
                      className="lead-add-activity-btn"
                      type="button"
                      onClick={() => setShowAddActivityDrawer(true)}
                    >
                      <span className="plus-sign">＋</span> Add Activity
                    </button>
                  </div>
                  <div className="lead-activity-filter-wrap">
                    <button
                      className="lead-activity-filter-btn"
                      type="button"
                      onClick={() => setActivityFilterOpen((val) => !val)}
                    >
                      <FilterFunnelIcon />
                      <span>Filter</span>
                      <ChevronDownIcon />
                    </button>
                    {activityFilterOpen && (
                      <div className="lead-activity-menu" role="menu">
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            screen.closeActivity?.();
                            setActivityFilterOpen(false);
                          }}
                        >
                          All activities
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            screen.loadActivity("calls");
                            setActivityFilterOpen(false);
                          }}
                        >
                          Calls
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            screen.loadActivity("notes");
                            setActivityFilterOpen(false);
                          }}
                        >
                          Notes
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            screen.loadActivity("followups");
                            setActivityFilterOpen(false);
                          }}
                        >
                          Follow-ups
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            screen.loadActivity("messages");
                            setActivityFilterOpen(false);
                          }}
                        >
                          Messages
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 3-Column Lead Info / Meta Banner */}
              <div className="lead-meta-banner">
                {/* Col 1: Lead Status */}
                <div className="lead-meta-col">
                  <div className="lead-meta-icon-box status-icon" aria-hidden="true">
                    <BuildingIcon />
                  </div>
                  <div className="lead-meta-text">
                    <strong className="lead-meta-value">{leadStatus}</strong>
                    <span className="lead-meta-label">Lead status</span>
                  </div>
                </div>

                <div className="lead-meta-divider" aria-hidden="true" />

                {/* Col 2: Source */}
                <div className="lead-meta-col">
                  <div className="lead-meta-icon-box source-icon" aria-hidden="true">
                    <GlobeIcon />
                  </div>
                  <div className="lead-meta-text">
                    <strong className="lead-meta-value">{leadSource}</strong>
                    <span className="lead-meta-label">Source</span>
                  </div>
                </div>

                <div className="lead-meta-divider" aria-hidden="true" />

                {/* Col 3: Assigned to */}
                <div className="lead-meta-col assignee-col">
                  <div className="lead-meta-avatar" aria-hidden="true">
                    <span>
                      {ownerName
                        .split(" ")
                        .map((n: string) => n[0])
                        .slice(0, 2)
                        .join("")
                        .toUpperCase()}
                    </span>
                  </div>
                  <div className="lead-meta-text">
                    <span className="lead-meta-label">Assigned to</span>
                    <strong className="lead-meta-value">{ownerName}</strong>
                  </div>
                  <div className="lead-meta-more-wrap">
                    <button
                      className="lead-meta-more-btn"
                      type="button"
                      aria-label="Lead options"
                      onClick={() => setMoreMenuOpen((val) => !val)}
                    >
                      <DotsIcon />
                    </button>
                    {moreMenuOpen && (
                      <div className="lead-activity-menu" role="menu">
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setDetailTab("details");
                            screen.beginEdit();
                            setMoreMenuOpen(false);
                          }}
                        >
                          Edit Lead
                        </button>
                        {screen.canConvertAccount && (
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              void screen.convertLead();
                              setMoreMenuOpen(false);
                            }}
                          >
                            Convert to account
                          </button>
                        )}
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setDetailTab("details");
                            setMoreMenuOpen(false);
                          }}
                        >
                          View all details
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Activity Composers if open */}
              {activityComposer && (
                <form
                  className="lead-activity-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void screen.addActivity(activityComposer).then((ok) => {
                      if (ok) setActivityComposer(null);
                    });
                  }}
                >
                  <strong>
                    {activityComposer === "call"
                      ? "Log call"
                      : activityComposer === "followup"
                      ? "Set follow-up"
                      : "Add note"}
                  </strong>
                  {activityComposer === "note" && (
                    <textarea
                      required
                      maxLength={4000}
                      value={screen.activityForm.body}
                      onChange={(event) =>
                        screen.setActivityForm((form) => ({ ...form, body: event.target.value }))
                      }
                      placeholder="What was decided or discussed?"
                    />
                  )}
                  {activityComposer === "call" && (
                    <>
                      <input
                        type="datetime-local"
                        value={screen.activityForm.happened_at}
                        onChange={(event) =>
                          screen.setActivityForm((form) => ({ ...form, happened_at: event.target.value }))
                        }
                      />
                      <input
                        type="number"
                        min="0"
                        max="86400"
                        placeholder="Duration seconds"
                        value={screen.activityForm.duration_seconds}
                        onChange={(event) =>
                          screen.setActivityForm((form) => ({ ...form, duration_seconds: event.target.value }))
                        }
                      />
                      <input
                        maxLength={200}
                        placeholder="Outcome / resolution"
                        value={screen.activityForm.resolution}
                        onChange={(event) =>
                          screen.setActivityForm((form) => ({ ...form, resolution: event.target.value }))
                        }
                      />
                      <textarea
                        maxLength={4000}
                        placeholder="Call note"
                        value={screen.activityForm.note}
                        onChange={(event) =>
                          screen.setActivityForm((form) => ({ ...form, note: event.target.value }))
                        }
                      />
                    </>
                  )}
                  {activityComposer === "followup" && (
                    <>
                      <input
                        required
                        type="datetime-local"
                        value={screen.activityForm.due_at}
                        onChange={(event) =>
                          screen.setActivityForm((form) => ({ ...form, due_at: event.target.value }))
                        }
                      />
                      <textarea
                        maxLength={4000}
                        placeholder="Follow-up note"
                        value={screen.activityForm.note}
                        onChange={(event) =>
                          screen.setActivityForm((form) => ({ ...form, note: event.target.value }))
                        }
                      />
                    </>
                  )}
                  <div>
                    <button className="leads-button" type="submit">
                      Save
                    </button>
                    <button
                      className="leads-button secondary"
                      type="button"
                      onClick={() => setActivityComposer(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              {/* Specific Filtered Activity List (if user drilled down) */}
              {screen.activityKind ? (
                <div className="lead-activity-list-view">
                  <div className="lead-activity-subnav">
                    <button
                      className="leads-button secondary"
                      type="button"
                      onClick={() => screen.closeActivity?.()}
                    >
                      ← Back to timeline overview
                    </button>
                    <h4>{screen.activityKind}</h4>
                  </div>
                  {screen.activityKind === "notes" && (
                    <form
                      className="lead-activity-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void screen.addActivity("note");
                      }}
                    >
                      <textarea
                        required
                        maxLength={4000}
                        value={screen.activityForm.body}
                        onChange={(event) =>
                          screen.setActivityForm((form) => ({ ...form, body: event.target.value }))
                        }
                        placeholder="Add a note"
                      />
                      <button className="leads-button" type="submit">
                        Save note
                      </button>
                    </form>
                  )}
                  {screen.activityLoading ? (
                    <div className="lead-state">Loading…</div>
                  ) : screen.activityError ? (
                    <div className="lead-state error">
                      <span>{screen.activityError}</span>
                      <button
                        className="leads-button secondary"
                        type="button"
                        onClick={() => screen.loadActivity(screen.activityKind as ActivityKind, screen.activityPage)}
                      >
                        Retry
                      </button>
                    </div>
                  ) : screen.activityItems.length === 0 ? (
                    <div className="lead-detail-empty">
                      <p>No {screen.activityKind} recorded yet.</p>
                    </div>
                  ) : (
                    <ul className="lead-activity-list">
                      {screen.activityItems.map((item, index) => (
                        <li key={String(item.id || index)}>
                          {screen.activityKind === "history" && (
                            <>
                              <strong>{activityDate(item.occurred_at)}</strong>
                              <span>
                                {activityValue(item.actor_name, "actor_name")} · {activityValue(item.field, "field")}
                              </span>
                              <p>
                                {item.field
                                  ? `${activityValue(item.from_value, "from_value")} → ${activityValue(item.to_value, "to_value")}`
                                  : activityValue(item.note, "note")}
                              </p>
                            </>
                          )}
                          {screen.activityKind === "calls" && (
                            <>
                              <strong>{activityDate(item.happened_at)}</strong>
                              <span>
                                {duration(item.duration_seconds)} · {activityValue(item.resolution, "resolution")} ·{" "}
                                {activityValue(item.caller_name, "caller_name")}
                              </span>
                              {Boolean(item.note) && <p>{activityValue(item.note, "note")}</p>}
                            </>
                          )}
                          {screen.activityKind === "followups" && (
                            <>
                              <strong>{activityDate(item.due_at)}</strong>
                              <span>
                                {activityValue(item.status, "status")} · set {activityDate(item.created_at)} by{" "}
                                {activityValue(item.creator_name, "creator_name")}
                              </span>
                              {Boolean(item.note) && <p>{activityValue(item.note, "note")}</p>}
                            </>
                          )}
                          {screen.activityKind === "messages" && (
                            <>
                              <strong>{activityDate(item.sent_at)}</strong>
                              <span>
                                {activityValue(item.channel, "channel")} · {activityValue(item.status, "status")}
                              </span>
                              <p>{activityValue(item.body, "body")}</p>
                            </>
                          )}
                          {screen.activityKind === "notes" && (
                            <>
                              <strong>{activityDate(item.created_at)}</strong>
                              <span>
                                {activityValue(item.note_type, "note_type")} · {activityValue(item.author_name, "author_name")}
                              </span>
                              <p>{activityValue(item.body, "body")}</p>
                            </>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <><LeadTimeline detail={screen.detail} leadName={leadName} ownerName={ownerName} />{SHOW_DEMO_TIMELINE && <>
                <div className="lead-timeline-container" aria-label="Lead timeline">
                  <div className="lead-timeline-rail" />

                  {/* 1. Follow-up scheduled */}
                  <div className="lead-timeline-item">
                    <div className="lead-timeline-node red-node" aria-hidden="true">
                      <CalendarIcon />
                    </div>
                    <div className="lead-timeline-card">
                      <div className="lead-timeline-card-main">
                        <h4 className="lead-timeline-title">Follow-up scheduled</h4>
                        <span className="lead-timeline-subtitle">
                          {screen.detail?.lead.next_follow_up_at
                            ? new Date(screen.detail?.lead.next_follow_up_at as string).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
                            : "Oct 13, 2026 • 11:00 AM"}
                        </span>
                        <p className="lead-timeline-desc">
                          {(screen.detail?.followups[0]?.note as string) || "Send proposal and confirm a demo time."}
                        </p>
                      </div>
                      <span className="lead-timeline-pill badge-upcoming">Upcoming</span>
                    </div>
                  </div>

                  {/* Divider: Latest activity */}
                  <div className="lead-timeline-divider-wrap">
                    <span className="lead-timeline-divider-chip">Latest activity</span>
                  </div>

                  {/* 2. Note added by Aarav Mehta (highlighted card) */}
                  <div className="lead-timeline-item">
                    <div className="lead-timeline-node red-node" aria-hidden="true">
                      <NoteIcon />
                    </div>
                    <div className="lead-timeline-card card-highlight">
                      <div className="lead-timeline-card-main">
                        <h4 className="lead-timeline-title">
                          Note added by {ownerName}
                        </h4>
                        <span className="lead-timeline-subtitle">Today, 10:31 AM</span>
                        <p className="lead-timeline-desc">
                          {leadName} is interested in a product walkthrough next week. Asked to share the proposal before the demo.
                        </p>
                      </div>
                      <span className="lead-timeline-pill badge-latest">Latest</span>
                    </div>
                  </div>

                  {/* 3. WhatsApp message sent */}
                  <div className="lead-timeline-item">
                    <div className="lead-timeline-node green-node" aria-hidden="true">
                      <WhatsAppIcon />
                    </div>
                    <div className="lead-timeline-card">
                      <div className="lead-timeline-card-main">
                        <h4 className="lead-timeline-title">WhatsApp message sent</h4>
                        <span className="lead-timeline-subtitle">Today, 10:29 AM</span>
                        <p className="lead-timeline-desc">Shared the Productivity Shastra overview.</p>
                      </div>
                    </div>
                  </div>

                  {/* 4. Call activity marked */}
                  <div className="lead-timeline-item">
                    <div className="lead-timeline-node red-node" aria-hidden="true">
                      <NoteIcon />
                    </div>
                    <div className="lead-timeline-card">
                      <div className="lead-timeline-card-main">
                        <h4 className="lead-timeline-title">Call activity marked</h4>
                        <span className="lead-timeline-subtitle">Today, 10:24 AM</span>
                        <p className="lead-timeline-desc">Outcome: Qualified lead</p>
                      </div>
                    </div>
                  </div>

                  {/* 5. Owner called the lead */}
                  <div className="lead-timeline-item">
                    <div className="lead-timeline-node red-node" aria-hidden="true">
                      <CallIcon />
                    </div>
                    <div className="lead-timeline-card">
                      <div className="lead-timeline-card-main">
                        <h4 className="lead-timeline-title">
                          {ownerName} called {leadName}
                        </h4>
                        <span className="lead-timeline-subtitle">
                          Today, 10:18 AM • 04:36 min
                        </span>
                        <p className="lead-timeline-desc">Interested in a product walkthrough next week.</p>
                      </div>
                      <span className="lead-timeline-pill badge-connected">Connected</span>
                    </div>
                  </div>

                  {assignmentHistory.map((item: any) => <div className="lead-timeline-item" key={String(item.id)}>
                    <div className="lead-timeline-node red-node" aria-hidden="true"><UserIcon /></div>
                    <div className="lead-timeline-card">
                      <div className="lead-timeline-card-main">
                        <h4 className="lead-timeline-title">{item.action === "lead.round_robin_assigned" ? (item.note || `Lead round-robined to ${item.to_value || "an owner"}.`) : `Lead manually assigned to ${item.to_value || "an owner"}`}</h4>
                        <span className="lead-timeline-subtitle">{item.occurred_at ? new Date(item.occurred_at).toLocaleString() : "Assignment recorded"}</span>
                      </div>
                      <span className="lead-timeline-pill badge-assigned">Assigned</span>
                    </div>
                  </div>)}
                </div></>}</>
              )}
            </section>
          )}

          {/* Details tab */}
          {detailTab === "details" && (
            <section
              className="lead-detail-tab-panel lead-details-tab-panel"
              id="lead-detail-panel-details"
              role="tabpanel"
              aria-label="Lead details"
            >
              {/* Header Row: Title, Edit details & More menu */}
              <div className="lead-details-header-row">
                <h3 className="lead-details-title">Lead details</h3>
                <div className="lead-details-header-actions">
                  <button
                    className="lead-details-edit-btn"
                    type="button"
                    onClick={screen.beginEdit}
                    disabled={!screen.canEdit}
                  >
                    <EditPencilIcon />
                    <span>Edit details</span>
                  </button>
                  <div className="lead-details-more-wrap">
                    <button
                      className="lead-details-more-btn"
                      type="button"
                      aria-label="More details options"
                      onClick={() => setDetailsMoreOpen((v) => !v)}
                    >
                      <VerticalDotsIcon />
                    </button>
                    {detailsMoreOpen && (
                      <div className="lead-activity-menu" role="menu">
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setDetailsMoreOpen(false);
                            screen.beginEdit();
                          }}
                        >
                          Edit lead info
                        </button>
                        {screen.canConvertAccount && (
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setDetailsMoreOpen(false);
                              void screen.convertLead();
                            }}
                          >
                            Convert to account
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Hero Summary Banner */}
              <div className="lead-details-hero-card">
                <div className="lead-details-hero-identity">
                  <div className="lead-details-hero-avatar" aria-hidden="true">
                    <span>
                      {leadName
                        .split(" ")
                        .map((n: string) => n[0])
                        .slice(0, 2)
                        .join("")
                        .toUpperCase() || "NS"}
                    </span>
                  </div>
                  <div className="lead-details-hero-name-wrap">
                    <strong className="lead-details-hero-name">{leadName}</strong>
                    <span className="lead-details-hero-stage-pill">
                      {displayField(fieldValue(selectedLead!, "stage"))}
                    </span>
                  </div>
                </div>

                <div className="lead-details-hero-divider" aria-hidden="true" />

                <div className="lead-details-hero-stat">
                  <span className="lead-details-hero-label">Owner</span>
                  <strong className="lead-details-hero-val">{ownerName}</strong>
                </div>

                <div className="lead-details-hero-divider" aria-hidden="true" />

                <div className="lead-details-hero-stat">
                  <span className="lead-details-hero-label">Lead score</span>
                  <strong className="lead-details-hero-val">42</strong>
                </div>

                <div className="lead-details-hero-divider" aria-hidden="true" />

                <div className="lead-details-hero-stat">
                  <span className="lead-details-hero-label">Source</span>
                  <strong className="lead-details-hero-val">{leadSource}</strong>
                </div>
              </div>

              {/* 1. Contact information */}
              <div className="lead-details-section">
                <div className="lead-details-section-header">Contact information</div>
                <div className="lead-details-grid">
                  <div className="lead-details-item">
                    <span className="lead-details-label">First name</span>
                    <span className="lead-details-value">{displayField(leadFirstName)}</span>
                  </div>
                  <div className="lead-details-item">
                    <span className="lead-details-label">Last name</span>
                    <span className="lead-details-value">{displayField(leadLastName)}</span>
                  </div>
                  <div className="lead-details-item">
                    <span className="lead-details-label">Mobile</span>
                    <span className="lead-details-value">
                      {displayField(fieldValue(selectedLead!, "phone"))}
                    </span>
                  </div>
                  <div className="lead-details-item">
                    <span className="lead-details-label">Email</span>
                    <span className="lead-details-value">
                      {displayField(fieldValue(selectedLead!, "email"))}
                    </span>
                  </div>
                  <div className="lead-details-item">
                    <span className="lead-details-label">Preferred contact</span>
                    <span className="lead-details-value">
                      {displayField(fieldValue(selectedLead!, "preferred_contact"))}
                    </span>
                  </div>
                </div>
              </div>

              {/* 2. Professional information */}
              <div className="lead-details-section">
                <div className="lead-details-section-header">Professional information</div>
                <div className="lead-details-grid">
                  <div className="lead-details-item">
                    <span className="lead-details-label">Company</span>
                    <span className="lead-details-value">
                      {displayField(fieldValue(selectedLead!, "company"))}
                    </span>
                  </div>
                  <div className="lead-details-item">
                    <span className="lead-details-label">Designation</span>
                    <span className="lead-details-value">
                      {displayField(fieldValue(selectedLead!, "designation"))}
                    </span>
                  </div>
                  <div className="lead-details-item">
                    <span className="lead-details-label">Location</span>
                    <span className="lead-details-value">
                      {displayField(fieldValue(selectedLead!, "city"))}
                    </span>
                  </div>
                  <div className="lead-details-item">
                    <span className="lead-details-label">Industry</span>
                    <span className="lead-details-value">
                      {displayField(fieldValue(selectedLead!, "industry"))}
                    </span>
                  </div>
                </div>
              </div>

              {/* 3. Lead qualification */}
              <div className="lead-details-section">
                <div className="lead-details-section-header">Lead qualification</div>
                <div className="lead-details-grid">
                  <div className="lead-details-item">
                    <span className="lead-details-label">Lead stage</span>
                    <span className="lead-details-value">
                      {displayField(fieldValue(selectedLead!, "stage"))}
                    </span>
                  </div>
                  <div className="lead-details-item">
                    <span className="lead-details-label">Lead temperature</span>
                    <span className="lead-details-value">
                      {displayField(fieldValue(selectedLead!, "temperature"))}
                    </span>
                  </div>
                  <div className="lead-details-item">
                    <span className="lead-details-label">Interest</span>
                    <span className="lead-details-value">
                      {displayField(fieldValue(selectedLead!, "interest"))}
                    </span>
                  </div>
                  <div className="lead-details-item">
                    <span className="lead-details-label">Expected decision date</span>
                    <span className="lead-details-value">
                      {displayField(fieldValue(selectedLead!, "psoDate"))}
                    </span>
                  </div>
                </div>
              </div>

              {/* 4. Attribution & ownership */}
              <div className="lead-details-section">
                <div className="lead-details-section-header">Attribution & ownership</div>
                <div className="lead-details-grid">
                  <div className="lead-details-item">
                    <span className="lead-details-label">Lead source</span>
                    <span className="lead-details-value">{leadSource}</span>
                  </div>
                  <div className="lead-details-item">
                    <span className="lead-details-label">Campaign</span>
                    <span className="lead-details-value">
                      {displayField(fieldValue(selectedLead!, "campaign"))}
                    </span>
                  </div>
                  <div className="lead-details-item">
                    <span className="lead-details-label">Assigned to</span>
                    <span className="lead-details-value">{ownerName}</span>
                  </div>
                  <div className="lead-details-item">
                    <span className="lead-details-label">Created on</span>
                    <span className="lead-details-value">
                      {selectedLead?.created_at
                        ? new Date(String(selectedLead.created_at)).toLocaleString("en-GB", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })
                        : "10 Oct 2026, 9:58 AM"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="lead-details-section">
                <div className="lead-details-section-header">Acquisition &amp; relationship details</div>
                <div className="lead-details-grid">
                  <div className="lead-details-item">
                    <span className="lead-details-label">Lead No</span>
                    <span className="lead-details-value">{displayField(fieldValue(selectedLead!, "leadNo"))}</span>
                  </div>
                  {screen.leadFields.filter((field) => field.active && field.detail_visible).map((field) => <div className="lead-details-item" key={field.key}>
                    <span className="lead-details-label">{field.label}</span>
                    <span className="lead-details-value">{displayField(fieldValue(selectedLead!, field.key))}</span>
                  </div>)}
                </div>
              </div>

              <div className="lead-details-section lead-system-info"><div className="lead-details-section-header">System info</div><div className="lead-details-grid">{SYSTEM_LEAD_FIELDS.map((field) => <div className="lead-details-item" key={field.key}><span className="lead-details-label">{field.label}</span><span className="lead-details-value">{formatSystemDate(selectedLead?.[field.key])}</span></div>)}</div></div>
              <div className="lead-details-section"><div className="lead-details-section-header">Lead relationship details</div><div className="lead-details-grid">{ADDITIONAL_LEAD_FIELDS.map((field) => <div className="lead-details-item" key={field.key}><span className="lead-details-label">{field.label}</span><span className="lead-details-value">{displayField(fieldValue(selectedLead!, field.key))}</span></div>)}</div><p className="lead-form-todo">TODO Phase 2: unsupported fields will become server-backed after migration/API approval.</p></div>

              {/* 5. Additional fields (6) collapsible */}
              <div className="lead-details-accordion">
                <button
                  type="button"
                  className="lead-details-accordion-btn"
                  onClick={() => setAdditionalFieldsOpen((v) => !v)}
                  aria-expanded={additionalFieldsOpen}
                >
                  <span
                    className={
                      additionalFieldsOpen
                        ? "lead-details-accordion-chevron open"
                        : "lead-details-accordion-chevron"
                    }
                    aria-hidden="true"
                  >
                    <ChevronDownIcon />
                  </span>
                  <span>Additional fields (6)</span>
                </button>
                {additionalFieldsOpen && (
                  <div className="lead-details-accordion-content">
                    <div className="lead-details-grid">
                      <div className="lead-details-item">
                        <span className="lead-details-label">Permission To Call</span>
                        <span className="lead-details-value">
                          {displayField(fieldValue(selectedLead!, "permission"))}
                        </span>
                      </div>
                      <div className="lead-details-item">
                        <span className="lead-details-label">PSO Date</span>
                        <span className="lead-details-value">
                          {displayField(fieldValue(selectedLead!, "psoDate"))}
                        </span>
                      </div>
                      <div className="lead-details-item">
                        <span className="lead-details-label">Pre-PS Done</span>
                        <span className="lead-details-value">
                          {displayField(fieldValue(selectedLead!, "isPrePsDone"))}
                        </span>
                      </div>
                      <div className="lead-details-item">
                        <span className="lead-details-label">Last called on</span>
                        <span className="lead-details-value">
                          {displayField(fieldValue(selectedLead!, "lastCalledOn"))}
                        </span>
                      </div>
                      <div className="lead-details-item">
                        <span className="lead-details-label">Next follow-up</span>
                        <span className="lead-details-value">
                          {displayField(fieldValue(selectedLead!, "nextFollowUpAt"))}
                        </span>
                      </div>
                      <div className="lead-details-item">
                        <span className="lead-details-label">Products</span>
                        <span className="lead-details-value">
                          {displayField(
                            (screen.detail?.products && screen.detail.products.length > 0)
                              ? screen.detail.products.map((p: any) => p.code || p.name).join(", ")
                              : fieldValue(selectedLead!, "products")
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Notes tab */}
          {detailTab === "notes" && (
            <section
              className="lead-detail-tab-panel lead-notes-tab-panel"
              id="lead-detail-panel-notes"
              role="tabpanel"
              aria-label="Lead notes"
            >
              {/* Notes Tab Action Bar: Title, Count & Add note button */}
              <div className="lead-notes-tab-header">
                <div className="lead-notes-tab-heading">
                  <h3 className="lead-notes-tab-title">Notes</h3>
                  <span className="lead-notes-count-badge">{savedNotesList.length}</span>
                </div>
                {!showNoteForm && (
                  <button
                    type="button"
                    className="lead-add-note-trigger-btn"
                    onClick={() => setShowNoteForm(true)}
                  >
                    <span className="plus-sign">＋</span> Add note
                  </button>
                )}
              </div>

              {noteSavedFeedback && (
                <div className="lead-note-alert-success" role="status">
                  <span>✓ Note saved successfully</span>
                  <button type="button" onClick={() => setNoteSavedFeedback(false)}>
                    ×
                  </button>
                </div>
              )}

              {/* Dedicated Add Note UI Card (opens only when showNoteForm is true) */}
              {showNoteForm && (
                <div className="lead-note-composer-card">
                  {/* Header */}
                  <div className="lead-note-composer-head">
                    <div>
                      <span className="lead-note-composer-eyebrow">NEW NOTE</span>
                      <h3 className="lead-note-composer-title">Add note</h3>
                    </div>
                    <button
                      type="button"
                      className="lead-note-composer-close-btn"
                      onClick={() => setShowNoteForm(false)}
                      aria-label="Close note form"
                    >
                      <CloseIcon />
                    </button>
                  </div>

                  {/* Lead Context Bar */}
                  <div className="lead-note-context-bar">
                    <div className="lead-note-context-lead">
                      <div className="lead-note-avatar-badge" aria-hidden="true">
                        {leadName
                          .split(" ")
                          .map((n: string) => n[0])
                          .slice(0, 2)
                          .join("")
                          .toUpperCase()}
                      </div>
                      <span className="lead-note-lead-name">{leadName}</span>
                      <span className="lead-note-lead-stage">| {leadStatus || "Fresh lead"}</span>
                    </div>
                    <button
                      type="button"
                      className="lead-note-view-lead-btn"
                      onClick={() => setDetailTab("details")}
                    >
                      View lead <span aria-hidden="true">↗</span>
                    </button>
                  </div>

                  {/* Note Type Pills */}
                  <div className="lead-note-type-pills" role="radiogroup" aria-label="Note type">
                    <button
                      type="button"
                      className={`lead-note-type-pill ${noteType === "general" ? "active" : ""}`}
                      onClick={() => setNoteType("general")}
                      role="radio"
                      aria-checked={noteType === "general"}
                    >
                      <NoteIcon color={noteType === "general" ? "var(--red)" : "var(--ink-2)"} />
                      <span>General note</span>
                    </button>
                    <button
                      type="button"
                      className={`lead-note-type-pill ${noteType === "call" ? "active" : ""}`}
                      onClick={() => setNoteType("call")}
                      role="radio"
                      aria-checked={noteType === "call"}
                    >
                      <CallIcon color={noteType === "call" ? "var(--red)" : "var(--ink-2)"} />
                      <span>Call note</span>
                    </button>
                    <button
                      type="button"
                      className={`lead-note-type-pill ${noteType === "meeting" ? "active" : ""}`}
                      onClick={() => setNoteType("meeting")}
                      role="radio"
                      aria-checked={noteType === "meeting"}
                    >
                      <CalendarIcon color={noteType === "meeting" ? "var(--red)" : "var(--ink-2)"} />
                      <span>Meeting note</span>
                    </button>
                    <button
                      type="button"
                      className={`lead-note-type-pill ${noteType === "handoff" ? "active" : ""}`}
                      onClick={() => setNoteType("handoff")}
                      role="radio"
                      aria-checked={noteType === "handoff"}
                    >
                      <HandoffIcon color={noteType === "handoff" ? "var(--red)" : "var(--ink-2)"} />
                      <span>Internal handoff</span>
                    </button>
                  </div>

                  {/* Note Editor */}
                  <div className="lead-note-editor-wrapper">
                    <label className="lead-note-input-label" htmlFor="lead-note-textarea">
                      Note
                    </label>
                    <div className="lead-note-editor-box">
                      {/* Toolbar */}
                      <div className="lead-note-toolbar" role="toolbar" aria-label="Text formatting">
                        <div className="lead-note-toolbar-group">
                          <button type="button" className="lead-note-tool-btn" title="Bold" aria-label="Bold">
                            <strong>B</strong>
                          </button>
                          <button type="button" className="lead-note-tool-btn" title="Italic" aria-label="Italic">
                            <em>I</em>
                          </button>
                          <button type="button" className="lead-note-tool-btn" title="Underline" aria-label="Underline">
                            <u>U</u>
                          </button>
                          <div className="lead-note-tool-divider" aria-hidden="true" />
                          <button type="button" className="lead-note-tool-btn" title="Bullet list" aria-label="Bullet list">
                            <BulletListIcon />
                          </button>
                          <button type="button" className="lead-note-tool-btn" title="Numbered list" aria-label="Numbered list">
                            <NumberedListIcon />
                          </button>
                          <div className="lead-note-tool-divider" aria-hidden="true" />
                          <button type="button" className="lead-note-tool-btn" title="Insert link" aria-label="Insert link">
                            <LinkIcon />
                          </button>
                          <button type="button" className="lead-note-tool-btn" title="Mention team member" aria-label="Mention">
                            <AtIcon />
                          </button>
                        </div>
                        <div className="lead-note-toolbar-group right">
                          <button type="button" className="lead-note-tool-btn" title="Undo" aria-label="Undo">
                            <UndoIcon />
                          </button>
                          <button type="button" className="lead-note-tool-btn" title="Redo" aria-label="Redo">
                            <RedoIcon />
                          </button>
                        </div>
                      </div>

                      <textarea
                        id="lead-note-textarea"
                        className="lead-note-textarea"
                        rows={4}
                        value={noteText}
                        onChange={(e) => setNoteText(e.target.value)}
                        placeholder="Type your note here..."
                      />
                    </div>
                  </div>

                  {/* 3-Column Metadata Row: Related activity, Tags, Visibility */}
                  <div className="lead-note-meta-grid">
                    <div className="lead-note-meta-field">
                      <label className="lead-note-input-label" htmlFor="lead-note-related-activity">
                        Related activity
                      </label>
                      <div className="lead-note-select-wrap">
                        <DropdownSelect dropdownKey="related_activity" options={screen.dropdownOptions.relatedActivity} id="lead-note-related-activity" className="lead-note-select" value={relatedActivity} onValueChange={setRelatedActivity} />
                        <ChevronDownIcon />
                      </div>
                    </div>

                    <div className="lead-note-meta-field">
                      <label className="lead-note-input-label">Tags</label>
                      <div className="lead-note-tags-input-container">
                        <div className="lead-note-tag-chips">
                          {noteTags.map((tag) => (
                            <span className="lead-note-tag-chip" key={tag}>
                              <span>{tag}</span>
                              <button
                                type="button"
                                className="lead-note-tag-remove"
                                onClick={() => setNoteTags(noteTags.filter((t) => t !== tag))}
                                aria-label={`Remove tag ${tag}`}
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                        <button
                          type="button"
                          className="lead-note-tag-dropdown-btn"
                          onClick={() => {
                            const newTag = prompt("Enter tag name:");
                            if (newTag && !noteTags.includes(newTag.trim())) {
                              setNoteTags([...noteTags, newTag.trim()]);
                            }
                          }}
                          aria-label="Add tag"
                        >
                          <ChevronDownIcon />
                        </button>
                      </div>
                    </div>

                    <div className="lead-note-meta-field">
                      <label className="lead-note-input-label" htmlFor="lead-note-visibility">
                        Visibility
                      </label>
                      <div className="lead-note-select-wrap">
                        <DropdownSelect dropdownKey="note_visibility" options={screen.dropdownOptions.noteVisibility} id="lead-note-visibility" className="lead-note-select" value={noteVisibility} onValueChange={setNoteVisibility} />
                        <ChevronDownIcon />
                      </div>
                    </div>
                  </div>

                  {/* Switches & Reminders Container */}
                  <div className="lead-note-switches-container">
                    {/* Switch 1: Pin to lead */}
                    <div className="lead-note-switch-block">
                      <label className="lead-note-switch-label">
                        <span className="lead-toggle-switch">
                          <input
                            type="checkbox"
                            checked={pinToLead}
                            onChange={(e) => setPinToLead(e.target.checked)}
                          />
                          <span className="lead-toggle-slider" />
                        </span>
                        <div className="lead-note-switch-texts">
                          <span className="lead-note-switch-title">Pin to lead</span>
                          <span className="lead-note-switch-desc">Keep this note visible for the team</span>
                        </div>
                      </label>
                    </div>

                    {/* Switch 2: Set a reminder */}
                    <div className="lead-note-switch-block">
                      <label className="lead-note-switch-label">
                        <span className="lead-toggle-switch">
                          <input
                            type="checkbox"
                            checked={setReminder}
                            onChange={(e) => setSetReminder(e.target.checked)}
                          />
                          <span className="lead-toggle-slider" />
                        </span>
                        <div className="lead-note-switch-texts">
                          <span className="lead-note-switch-title">Set a reminder</span>
                        </div>
                      </label>

                      {/* Subfields for Reminder */}
                      {setReminder && (
                        <div className="lead-note-reminder-subrow">
                          <div className="lead-note-reminder-field">
                            <span className="lead-note-sublabel">Reminder date</span>
                            <div className="lead-note-input-with-icon">
                              <CalendarIcon color="var(--ink-2)" />
                              <input
                                type="date"
                                className="lead-note-clean-input"
                                value={reminderDate}
                                onChange={(e) => setReminderDate(e.target.value)}
                              />
                            </div>
                          </div>

                          <div className="lead-note-reminder-field">
                            <span className="lead-note-sublabel">Time</span>
                            <div className="lead-note-input-with-icon">
                              <ClockIcon />
                              <input
                                type="time"
                                className="lead-note-clean-input"
                                value={reminderTime}
                                onChange={(e) => setReminderTime(e.target.value)}
                              />
                            </div>
                          </div>

                          <div className="lead-note-reminder-field">
                            <span className="lead-note-sublabel">Notify</span>
                            <div className="lead-note-input-with-icon">
                              <UserIcon />
                              <DropdownSelect dropdownKey="reminder_recipient" options={screen.userOptions} className="lead-note-clean-select" value={reminderNotify} onValueChange={setReminderNotify} />
                              <ChevronDownIcon />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Attachments Section */}
                  <div className="lead-note-attachments-section">
                    <label className="lead-note-input-label">Attachments</label>
                    <div className="lead-note-attachments-row">
                      <button
                        type="button"
                        className="lead-note-attach-btn"
                        onClick={() => {
                          const fileName = prompt("Attach file name (e.g. proposal.pdf):");
                          if (fileName) setNoteAttachments([...noteAttachments, fileName.trim()]);
                        }}
                      >
                        <PaperclipIcon />
                        <span>Attach files</span>
                      </button>

                      {noteAttachments.map((file) => (
                        <div className="lead-note-file-chip" key={file}>
                          <span className="lead-note-pdf-icon" aria-hidden="true">
                            PDF
                          </span>
                          <span className="lead-note-file-name">{file}</span>
                          <button
                            type="button"
                            className="lead-note-file-remove"
                            onClick={() => setNoteAttachments(noteAttachments.filter((f) => f !== file))}
                            aria-label={`Remove attachment ${file}`}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Bottom Switch 3: Show in activity history */}
                  <div className="lead-note-switch-block single-line">
                    <label className="lead-note-switch-label">
                      <span className="lead-toggle-switch">
                        <input
                          type="checkbox"
                          checked={showInHistory}
                          onChange={(e) => setShowInHistory(e.target.checked)}
                        />
                        <span className="lead-toggle-slider" />
                      </span>
                      <div className="lead-note-switch-texts">
                        <span className="lead-note-switch-title">Show in activity history</span>
                        <span className="lead-note-switch-desc">This note becomes the latest activity.</span>
                      </div>
                    </label>
                  </div>

                  {/* Footer Action Buttons */}
                  <div className="lead-note-footer-actions">
                    <button
                      type="button"
                      className="lead-note-cancel-btn"
                      onClick={() => {
                        setShowNoteForm(false);
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="lead-note-save-btn"
                      onClick={() => {
                        if (!noteText.trim()) return;
                        const newNote = {
                          id: `note-${Date.now()}`,
                          type: noteType,
                          text: noteText,
                          tags: [...noteTags],
                          pinned: pinToLead,
                          createdAt: "Just now",
                          attachments: [...noteAttachments],
                        };
                        setSavedNotesList((prev) => [newNote, ...prev]);
                        screen.setActivityForm((form) => ({ ...form, body: noteText }));
                        void screen.addActivity("note");
                        setNoteSavedFeedback(true);
                        setShowNoteForm(false);
                        setNoteText("");
                        setTimeout(() => setNoteSavedFeedback(false), 3000);
                      }}
                    >
                      Save note
                    </button>
                  </div>
                </div>
              )}

              {/* All Notes List Feed */}
              <div className="lead-notes-feed-container">
                {savedNotesList.length === 0 ? (
                  <div className="lead-detail-empty">
                    <p>No notes recorded yet for this lead.</p>
                    {!showNoteForm && (
                      <button
                        className="leads-button"
                        style={{ marginTop: 12 }}
                        type="button"
                        onClick={() => setShowNoteForm(true)}
                      >
                        ＋ Add the first note
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="lead-note-saved-cards">
                    {savedNotesList.map((sn) => (
                      <div className="lead-note-saved-card" key={sn.id}>
                        <div className="lead-note-saved-head">
                          <span className="lead-note-saved-badge">{sn.type.toUpperCase()} NOTE</span>
                          {sn.pinned && <span className="lead-note-pinned-badge">📌 Pinned</span>}
                          <span className="lead-note-saved-date">{sn.createdAt}</span>
                        </div>
                        <p className="lead-note-saved-text">{sn.text}</p>
                        {sn.tags.length > 0 && (
                          <div className="lead-note-saved-tags">
                            {sn.tags.map((t) => (
                              <span className="lead-note-saved-tag-pill" key={t}>
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
                        {sn.attachments.length > 0 && (
                          <div className="lead-note-saved-attachments">
                            {sn.attachments.map((att) => (
                              <span className="lead-note-file-chip small" key={att}>
                                <span className="lead-note-pdf-icon small">PDF</span>
                                <span>{att}</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Follow-up tab */}
          {detailTab === "follow-up" && (
            <section
              className="lead-detail-tab-panel lead-followup-tab-panel"
              id="lead-detail-panel-follow-up"
              role="tabpanel"
              aria-label="Lead follow-up"
            >
              {/* Follow-up Tab Action Bar: Title, Count & Add follow-up button */}
              <div className="lead-followup-tab-header">
                <div className="lead-followup-tab-heading">
                  <h3 className="lead-followup-tab-title">Follow-ups</h3>
                  <span className="lead-followup-count-badge">
                    {savedFollowUpsList.length + screen.detail.followups.length}
                  </span>
                </div>
                {!showFollowUpForm && (
                  <button
                    type="button"
                    className="lead-add-followup-trigger-btn"
                    onClick={() => setShowFollowUpForm(true)}
                  >
                    <span className="plus-sign">＋</span> Add follow-up
                  </button>
                )}
              </div>

              {followUpSavedFeedback && (
                <div className="lead-note-alert-success" role="status">
                  <span>✓ Follow-up scheduled successfully</span>
                  <button type="button" onClick={() => setFollowUpSavedFeedback(false)}>
                    ×
                  </button>
                </div>
              )}

              {/* Dedicated Add Follow-up Form Card (opens when showFollowUpForm is true) */}
              {showFollowUpForm && (
                <div className="lead-followup-form-card">
                  {/* Form Header */}
                  <div className="lead-followup-form-head">
                    <div>
                      <span className="lead-followup-form-eyebrow">NEW FOLLOW-UP</span>
                      <h3 className="lead-followup-form-title">Schedule follow-up</h3>
                    </div>
                    <button
                      type="button"
                      className="lead-followup-form-close-btn"
                      onClick={() => setShowFollowUpForm(false)}
                      aria-label="Close follow-up form"
                    >
                      <CloseIcon />
                    </button>
                  </div>

                  <div className="lead-followup-form-fields">
                    {/* Row 1: Date & Time */}
                    <div className="lead-followup-row">
                      <div className="lead-followup-field">
                        <label className="lead-followup-label" htmlFor="lead-followup-date-input">
                          Date <span className="req">*</span>
                        </label>
                        <div className="lead-followup-input-icon">
                          <CalendarIcon color="var(--ink-2)" />
                          <input
                            id="lead-followup-date-input"
                            type="date"
                            className="lead-followup-clean-input"
                            value={followUpDate}
                            onChange={(e) => setFollowUpDate(e.target.value)}
                          />
                        </div>
                      </div>

                      <div className="lead-followup-field">
                        <label className="lead-followup-label" htmlFor="lead-followup-time-input">
                          Follow-up time <span className="req">*</span>
                        </label>
                        <div className="lead-followup-input-icon">
                          <ClockIcon />
                          <input
                            id="lead-followup-time-input"
                            type="time"
                            className="lead-followup-clean-input"
                            value={followUpTime}
                            onChange={(e) => setFollowUpTime(e.target.value)}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Row 2: Follow-up Note */}
                    <div className="lead-followup-field">
                      <label className="lead-followup-label" htmlFor="lead-followup-note-input">
                        Follow-up Note <span className="req">*</span>
                      </label>
                      <textarea
                        id="lead-followup-note-input"
                        className="lead-followup-textarea"
                        rows={3}
                        value={followUpNote}
                        onChange={(e) => setFollowUpNote(e.target.value)}
                        placeholder="What needs to be discussed or followed up on?"
                      />
                    </div>

                    {/* Row 3: Notification Set */}
                    <div className="lead-followup-field">
                      <label className="lead-followup-label">Notification set</label>
                      <span className="lead-followup-helper">
                        Choose reminder channels for this follow-up:
                      </span>
                      <div className="lead-followup-notify-cards">
                        <button
                          type="button"
                          className={`lead-followup-notify-card ${followUpNotifyApp ? "selected" : ""}`}
                          onClick={() => setFollowUpNotifyApp((v) => !v)}
                        >
                          <div className="notify-card-head">
                            <span className={`custom-checkbox-box ${followUpNotifyApp ? "checked" : ""}`}>
                              {followUpNotifyApp ? "✓" : ""}
                            </span>
                            <DesktopIcon color={followUpNotifyApp ? "var(--red)" : "var(--ink-2)"} />
                            <strong>In-app pop-up</strong>
                          </div>
                          <span className="notify-card-desc">Desktop pop-up alert in application</span>
                        </button>

                        <button
                          type="button"
                          className={`lead-followup-notify-card ${followUpNotifyEmail ? "selected" : ""}`}
                          onClick={() => setFollowUpNotifyEmail((v) => !v)}
                        >
                          <div className="notify-card-head">
                            <span className={`custom-checkbox-box ${followUpNotifyEmail ? "checked" : ""}`}>
                              {followUpNotifyEmail ? "✓" : ""}
                            </span>
                            <EmailIcon color={followUpNotifyEmail ? "var(--red)" : "var(--ink-2)"} />
                            <strong>Email notification</strong>
                          </div>
                          <span className="notify-card-desc">Send reminder by email</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Form Footer */}
                  <div className="lead-followup-form-footer">
                    <button
                      type="button"
                      className="lead-followup-cancel-btn"
                      onClick={() => setShowFollowUpForm(false)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="lead-followup-save-btn"
                      onClick={() => {
                        if (!followUpNote.trim()) return;
                        const newFollowUp = {
                          id: `fu-${Date.now()}`,
                          dueDate: followUpDate,
                          dueTime: followUpTime,
                          status: "Upcoming",
                          note: followUpNote,
                          notifyApp: followUpNotifyApp,
                          notifyEmail: followUpNotifyEmail,
                          createdAt: "Just now",
                        };
                        setSavedFollowUpsList((prev) => [newFollowUp, ...prev]);
                        screen.setActivityForm((form) => ({
                          ...form,
                          happened_at: `${followUpDate}T${followUpTime}`,
                          body: followUpNote,
                        }));
                        void screen.addActivity("followup");
                        setFollowUpSavedFeedback(true);
                        setShowFollowUpForm(false);
                        setTimeout(() => setFollowUpSavedFeedback(false), 3000);
                      }}
                    >
                      Save follow-up
                    </button>
                  </div>
                </div>
              )}

              {/* Follow-up Feed Container */}
              <div className="lead-followup-feed-container">
                {savedFollowUpsList.length === 0 && screen.detail.followups.length === 0 ? (
                  <div className="lead-detail-empty">
                    <p>No follow-ups are currently scheduled for this lead.</p>
                    {!showFollowUpForm && (
                      <button
                        className="leads-button"
                        style={{ marginTop: 12 }}
                        type="button"
                        onClick={() => setShowFollowUpForm(true)}
                      >
                        ＋ Schedule follow-up
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="lead-followup-cards">
                    {/* Render saved follow-ups */}
                    {savedFollowUpsList.map((fu) => (
                      <div className="lead-followup-card" key={fu.id}>
                        <div className="lead-followup-card-head">
                          <span className="lead-followup-date-badge">
                            📅 {fu.dueDate} • {fu.dueTime}
                          </span>
                          <span className="lead-followup-status-badge badge-upcoming">
                            {fu.status}
                          </span>
                          <div className="lead-followup-notify-pills">
                            {fu.notifyApp && <span className="notify-pill">🔔 In-app pop-up</span>}
                            {fu.notifyEmail && <span className="notify-pill">✉ Email</span>}
                          </div>
                          <span className="lead-followup-card-date">{fu.createdAt}</span>
                        </div>
                        <p className="lead-followup-card-text">{fu.note}</p>
                      </div>
                    ))}

                    {/* Render lead's existing follow-ups from database */}
                    {screen.detail.followups.map((followup, index) => (
                      <div className="lead-followup-card" key={String(followup.id || `db-${index}`)}>
                        <div className="lead-followup-card-head">
                          <span className="lead-followup-date-badge">
                            📅 {displayField(followup.due_at || followup.dueAt)}
                          </span>
                          <span className="lead-followup-status-badge">
                            {displayField(followup.status || "Pending")}
                          </span>
                        </div>
                        {Boolean(followup.note || followup.notes) && (
                          <p className="lead-followup-card-text">
                            {displayField(followup.note || followup.notes)}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}
        </aside>
      </div>
    )}

    {/* Redesigned "Add Activity" Drawer Panel */}
    {showAddActivityDrawer && (
      <div
        className="drawer-backdrop add-activity-backdrop"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) setShowAddActivityDrawer(false);
        }}
      >
        <aside
          className="lead-add-activity-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Log an activity"
        >
          {/* Header */}
          <div className="lead-add-activity-header">
            <div>
              <span className="lead-add-activity-eyebrow">ADD ACTIVITY</span>
              <h2 className="lead-add-activity-title">Log an activity</h2>
            </div>
            <button
              type="button"
              className="lead-add-activity-close-btn"
              onClick={() => setShowAddActivityDrawer(false)}
              aria-label="Close activity form"
            >
              <CloseIcon />
            </button>
          </div>

          <div className="lead-add-activity-body">
            {/* Lead context row */}
            <div className="lead-add-activity-lead-row">
              <div className="lead-add-activity-avatar" aria-hidden="true">
                {leadName
                  .split(" ")
                  .map((n: string) => n[0])
                  .slice(0, 2)
                  .join("")
                  .toUpperCase()}
              </div>
              <span className="lead-add-activity-lead-name">{leadName}</span>
              <span className="lead-add-activity-lead-status">{leadStatus || "Fresh lead"}</span>
              <span className="lead-add-activity-row-divider" aria-hidden="true">|</span>
              <span className="lead-add-activity-score">Score 42</span>
              <span className="lead-add-activity-row-divider" aria-hidden="true">|</span>
              <button
                type="button"
                className="lead-add-activity-view-link"
                onClick={() => {
                  setShowAddActivityDrawer(false);
                  setDetailTab("details");
                }}
              >
                View lead <span aria-hidden="true">→</span>
              </button>
            </div>

            {/* Activity type: full-width searchable dropdown */}
            <div className="lead-add-activity-field">
              <label className="lead-add-activity-label" htmlFor="lead-activity-type-picker">
                Activity type <span className="req">*</span>
              </label>
              <div className="lead-add-activity-dropdown-container" ref={activityTypePickerRef}>
                <button
                  type="button"
                  id="lead-activity-type-picker"
                  className="lead-add-activity-select-box"
                  onClick={() => setActivityTypeDropdownOpen((prev) => !prev)}
                  aria-expanded={activityTypeDropdownOpen}
                >
                  <div className="lead-add-activity-select-left">
                    {(() => {
                      const match = ADMIN_ACTIVITY_TYPES.find((t) => t.label === activityType) || ADMIN_ACTIVITY_TYPES[0];
                      const Icon = match.icon;
                      return <Icon color="var(--ink)" />;
                    })()}
                    <span className="selected-type-label">{activityType}</span>
                  </div>
                  <div className="lead-add-activity-select-right">
                    <SearchIcon />
                    <ChevronDownIcon />
                  </div>
                </button>

                {activityTypeDropdownOpen && (
                  <div className="lead-add-activity-dropdown-menu" role="listbox">
                    <div className="dropdown-search-wrap">
                      <SearchIcon />
                      <input
                        type="text"
                        className="lead-add-activity-dropdown-search"
                        placeholder="Search activity types..."
                        value={activityTypeSearch}
                        onChange={(e) => setActivityTypeSearch(e.target.value)}
                        autoFocus
                      />
                    </div>
                    <div className="dropdown-items-scroll">
                      {ADMIN_ACTIVITY_TYPES.filter((item) =>
                        item.label.toLowerCase().includes(activityTypeSearch.toLowerCase())
                      ).map((item) => {
                        const ItemIcon = item.icon;
                        const isSelected = item.label === activityType;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            role="option"
                            aria-selected={isSelected}
                            className={`lead-add-activity-dropdown-item ${isSelected ? "selected" : ""}`}
                            onClick={() => {
                              setActivityType(item.label);
                              setActivityTypeDropdownOpen(false);
                              setActivityTypeSearch("");
                              if (!activityDetailsText || ADMIN_ACTIVITY_TYPES.some((a) => a.placeholder === activityDetailsText)) {
                                setActivityDetailsText(item.placeholder);
                              }
                            }}
                          >
                            <ItemIcon color={isSelected ? "var(--red)" : "var(--ink-2)"} />
                            <span>{item.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              <span className="lead-add-activity-helper">Activity types are managed by your administrator.</span>
            </div>

            {/* Activity details: generic multiline input */}
            <div className="lead-add-activity-field">
              <label className="lead-add-activity-label" htmlFor="lead-activity-details-text">
                Activity details <span className="req">*</span>
              </label>
              <textarea
                id="lead-activity-details-text"
                className="lead-add-activity-textarea"
                rows={3}
                value={activityDetailsText}
                onChange={(e) => setActivityDetailsText(e.target.value)}
                placeholder="Interested in a product walkthrough next week. Asked to share the proposal before the demo."
              />
            </div>

            {/* Attachments */}
            <div className="lead-add-activity-attachments-section">
              <div className="lead-add-activity-attachments-row">
                <span className="lead-add-activity-label no-margin">Attachments</span>
                <button
                  type="button"
                  className="lead-add-activity-attach-btn"
                  onClick={() => {
                    const fileName = prompt("Attachment name (e.g. proposal.pdf):");
                    if (fileName) setActivityAttachments((prev) => [...prev, fileName.trim()]);
                  }}
                >
                  <PaperclipIcon />
                  <span>Add attachment</span>
                </button>
              </div>
              {activityAttachments.length > 0 && (
                <div className="lead-add-activity-attachment-chips">
                  {activityAttachments.map((file) => (
                    <div className="lead-note-file-chip small" key={file}>
                      <span className="lead-note-pdf-icon small">PDF</span>
                      <span className="lead-note-file-name">{file}</span>
                      <button
                        type="button"
                        className="lead-note-file-remove"
                        onClick={() => setActivityAttachments((prev) => prev.filter((f) => f !== file))}
                        aria-label={`Remove attachment ${file}`}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Optional follow-up task */}
            <div className="lead-add-activity-switch-block">
              <label className="lead-add-activity-switch-label">
                <span className="lead-toggle-switch">
                  <input
                    type="checkbox"
                    checked={addFollowUpTask}
                    onChange={(e) => setAddFollowUpTask(e.target.checked)}
                  />
                  <span className="lead-toggle-slider" />
                </span>
                <span className="lead-add-activity-switch-title">Add follow-up task</span>
              </label>

              {/* Follow-up task subfields */}
              {addFollowUpTask && (
                <div className="lead-add-activity-task-container">
                  <div className="lead-add-activity-task-grid">
                    <div className="lead-add-activity-task-col">
                      <span className="lead-add-activity-sublabel">Task title <span className="req">*</span></span>
                      <input
                        type="text"
                        className="lead-add-activity-input"
                        value={followUpTitle}
                        onChange={(e) => setFollowUpTitle(e.target.value)}
                        placeholder="Send proposal and confirm demo time"
                      />
                    </div>
                    <div className="lead-add-activity-task-col">
                      <span className="lead-add-activity-sublabel">Due date <span className="req">*</span></span>
                      <div className="lead-add-activity-input-icon">
                        <CalendarIcon color="var(--ink-2)" />
                        <input
                          type="date"
                          className="lead-add-activity-clean-input"
                          value={followUpDueDate}
                          onChange={(e) => setFollowUpDueDate(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="lead-add-activity-task-col">
                      <span className="lead-add-activity-sublabel">Due time <span className="req">*</span></span>
                      <div className="lead-add-activity-input-icon">
                        <ClockIcon />
                        <input
                          type="time"
                          className="lead-add-activity-clean-input"
                          value={followUpDueTime}
                          onChange={(e) => setFollowUpDueTime(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="lead-add-activity-task-col">
                      <span className="lead-add-activity-sublabel">Assign to <span className="req">*</span></span>
                      <div className="lead-add-activity-select-wrap">
                        <DropdownSelect dropdownKey="assignee" options={screen.userOptions} className="lead-add-activity-select" value={followUpAssignee} onValueChange={setFollowUpAssignee} />
                        <ChevronDownIcon />
                      </div>
                    </div>
                  </div>

                  {/* Send notification inside follow-up task */}
                  <div className="lead-add-activity-notification-block">
                    <label className="lead-add-activity-switch-label">
                      <span className="lead-toggle-switch">
                        <input
                          type="checkbox"
                          checked={sendNotification}
                          onChange={(e) => setSendNotification(e.target.checked)}
                        />
                        <span className="lead-toggle-slider" />
                      </span>
                      <span className="lead-add-activity-switch-title">Send notification</span>
                    </label>

                    {sendNotification && (
                      <div className="lead-add-activity-notify-row">
                        {/* Notify me checkbox */}
                        <div className="notify-me-box">
                          <label className="lead-add-activity-checkbox-label">
                            <input
                              type="checkbox"
                              className="lead-add-activity-checkbox"
                              checked={notifyMe}
                              onChange={(e) => setNotifyMe(e.target.checked)}
                            />
                            <span>Notify me</span>
                          </label>
                        </div>

                        {/* Notify before dropdown */}
                        <div className="notify-before-box">
                          <span className="lead-add-activity-sublabel">Notify before</span>
                          <div className="lead-add-activity-select-wrap">
                            <DropdownSelect dropdownKey="notify_before" options={screen.dropdownOptions.notifyBefore} className="lead-add-activity-select" value={notifyBefore} onValueChange={setNotifyBefore} />
                            <ChevronDownIcon />
                          </div>
                        </div>

                        {/* Send notification via choice controls */}
                        <div className="notify-via-box">
                          <span className="lead-add-activity-sublabel">Send notification via</span>
                          <div className="lead-add-activity-choice-cards">
                            <button
                              type="button"
                              className={`lead-add-activity-choice-card ${notifyViaApp ? "selected" : ""}`}
                              onClick={() => setNotifyViaApp((v) => !v)}
                              aria-checked={notifyViaApp}
                              role="checkbox"
                            >
                              <div className="choice-head">
                                <span className={`choice-checkbox ${notifyViaApp ? "checked" : ""}`}>
                                  {notifyViaApp ? "✓" : ""}
                                </span>
                                <DesktopIcon color={notifyViaApp ? "var(--red)" : "var(--ink-2)"} />
                                <strong>App</strong>
                              </div>
                              <span className="choice-helper">In-app pop-up</span>
                            </button>

                            <button
                              type="button"
                              className={`lead-add-activity-choice-card ${notifyViaEmail ? "selected" : ""}`}
                              onClick={() => setNotifyViaEmail((v) => !v)}
                              aria-checked={notifyViaEmail}
                              role="checkbox"
                            >
                              <div className="choice-head">
                                <span className={`choice-checkbox ${notifyViaEmail ? "checked" : ""}`}>
                                  {notifyViaEmail ? "✓" : ""}
                                </span>
                                <EmailIcon color={notifyViaEmail ? "var(--red)" : "var(--ink-2)"} />
                                <strong>Email</strong>
                              </div>
                              <span className="choice-helper">Send by email</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Sticky footer */}
          <div className="lead-add-activity-footer">
            <button
              type="button"
              className="lead-add-activity-cancel-btn"
              onClick={() => setShowAddActivityDrawer(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="lead-add-activity-save-btn"
              onClick={() => {
                if (!activityDetailsText.trim()) return;
                const newNote = {
                  id: `act-${Date.now()}`,
                  type: activityType.toLowerCase().replace(/[^a-z]/g, ""),
                  text: `[${activityType}] ${activityDetailsText}`,
                  tags: [activityType],
                  pinned: false,
                  createdAt: "Just now",
                  attachments: [...activityAttachments],
                };
                setSavedNotesList((prev) => [newNote, ...prev]);
                screen.setActivityForm((form) => ({ ...form, body: `[${activityType}] ${activityDetailsText}` }));
                void screen.addActivity("note");
                setShowAddActivityDrawer(false);
                setNoteSavedFeedback(true);
                setTimeout(() => setNoteSavedFeedback(false), 3000);
              }}
            >
              Save activity
            </button>
          </div>
        </aside>
      </div>
    )}
  </div>;
}
