import { ActivityKind, fieldValue, QUICK_FILTER_FIELDS, QUICK_FILTER_OPERATORS, useLeadsScreen, VIEW_FIELDS } from "./function";
import { useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import "./leads.css";

function displayField(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function activityValue(value: unknown, _key?: string) { return value == null || value === "" ? "—" : String(value); }
function activityDate(value: unknown) { return value ? new Date(String(value)).toLocaleString() : "—"; }
function duration(value: unknown) { const seconds = Number(value); if (!Number.isFinite(seconds)) return "not recorded"; return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`; }

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
        {screen.draftConditions.map((condition, index) => { const field = QUICK_FILTER_FIELDS.find((item) => item.key === condition.field) || QUICK_FILTER_FIELDS[0]; const operators = QUICK_FILTER_OPERATORS.filter((item) => field.kind === "date" || !["gt", "gte", "lt", "lte"].includes(item.key)); return <div className="advanced-condition-row" key={condition.id}>
          {index > 0 && <select className="lead-control advanced-join" aria-label={`Join condition ${index + 1}`} value={screen.draftJoin} onChange={(event) => screen.setDraftJoin(event.target.value as "AND" | "OR")}><option>AND</option><option>OR</option></select>}
          <select className="lead-control" aria-label={`Condition ${index + 1} field`} value={condition.field} onChange={(event) => { const nextField = QUICK_FILTER_FIELDS.find((item) => item.key === event.target.value) || QUICK_FILTER_FIELDS[0]; screen.updateCondition(condition.id, { field: nextField.key, operator: nextField.kind === "date" ? "equals" : "contains", value: "" }); }}>{QUICK_FILTER_FIELDS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select>
          <select className="lead-control" aria-label={`Condition ${index + 1} operator`} value={condition.operator} onChange={(event) => screen.updateCondition(condition.id, { operator: event.target.value })}>{operators.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select>
          {!['is_empty', 'is_not_empty'].includes(condition.operator) && <input className="lead-control" aria-label={`Condition ${index + 1} value`} type={field.kind === "date" ? "date" : "text"} value={condition.value} onChange={(event) => screen.updateCondition(condition.id, { value: event.target.value })} placeholder="Value" />}
          <button className="icon-button advanced-remove" type="button" aria-label={`Remove condition ${index + 1}`} onClick={() => screen.removeCondition(condition.id)}><CloseIcon /></button>
        </div>; })}
      </div>
      <div className="advanced-filter-actions"><button className="leads-button secondary" type="button" onClick={screen.addCondition}>+ Add condition</button><button className="leads-button" type="button" onClick={screen.applyAdvancedFilter}>Apply</button></div>
      <div className="advanced-filter-footer"><button className="leads-button secondary" type="button" disabled={!screen.advancedConditions.length} onClick={onSave}>{screen.editingQuickFilter ? "Update Quick Filter" : "Save as Quick Filter"}</button></div>
    </aside>
  </div>;
}

export function LeadsPage() {
  const screen = useLeadsScreen();
  const navigate = useNavigate();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [detailTab, setDetailTab] = useState<LeadDetailTab>("activity");
  const [activityMenuOpen, setActivityMenuOpen] = useState(false);
  const [activityFilterOpen, setActivityFilterOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [activityComposer, setActivityComposer] = useState<"note" | "call" | "followup" | null>(null);
  const detailTabRefs = useRef<Partial<Record<LeadDetailTab, HTMLButtonElement | null>>>({});
  useEffect(() => {
    if (screen.detail?.lead.id) setDetailTab("activity");
  }, [screen.detail?.lead.id]);
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
  const fields = VIEW_FIELDS[screen.view] || VIEW_FIELDS.new_leads;
  const selectedLead = screen.detail?.lead;
  const leadName = String(selectedLead?.name || "Nikhil Shah");
  const leadStatus = String(selectedLead?.lead_status || selectedLead?.stage || "New Lead");
  const leadSource = String(selectedLead?.lead_source || "Website enquiry");
  const ownerName = String(selectedLead?.owner_name || selectedLead?.owner_user_id || "Aarav Mehta");
  return <div className="leads-page">
    <div className="bulk-upload-toolbar"><button className="leads-button secondary" type="button" disabled={!screen.canImport} title={screen.bulkImportLabel} aria-label={screen.bulkImportLabel} onClick={() => { if (screen.canImport) screen.openBulkUpload(); }}>Bulk upload leads</button></div>
    {screen.bulkUploadOpen && <div className="bulk-upload-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) screen.closeBulkUpload(); }}><section className="bulk-upload-dialog" role="dialog" aria-modal="true" aria-labelledby="bulk-upload-title"><div className="drawer-head"><div><p className="eyebrow">Leads</p><h2 id="bulk-upload-title">Bulk upload leads</h2></div><button className="icon-button" type="button" onClick={screen.closeBulkUpload} aria-label="Close bulk upload">×</button></div><p>Upload a CSV or .xlsx file. Preview validates the file before anything is written.</p><ol className="bulk-upload-steps"><li>Download sample file</li><li>Fill in your leads (replace the example rows or keep them to test)</li><li>Choose your file and upload</li></ol><div className="bulk-upload-downloads"><button className="leads-button secondary" type="button" onClick={() => void screen.downloadBulkTemplate("xlsx")}>Download sample file</button><button className="leads-button secondary" type="button" onClick={() => void screen.downloadBulkTemplate("csv")}>Download CSV sample</button></div><label className="bulk-upload-file">Choose file<input type="file" accept=".csv,.xlsx" onChange={(event) => { const file = event.target.files?.[0]; if (file) void screen.previewBulkUpload(file); }} /></label><label className="bulk-upload-checkbox"><input type="checkbox" checked={screen.bulkAllowDuplicates} onChange={(event) => screen.setBulkAllowDuplicates(event.target.checked)} /> Import possible duplicates anyway</label>{screen.bulkLoading && <div className="lead-state">Reading file…</div>}{screen.bulkError && <div className="lead-state error" role="alert">{screen.bulkError}</div>}{screen.bulkPreview && <div className="bulk-upload-preview"><p><strong>{screen.bulkPreview.total_rows}</strong> rows · <strong>{screen.bulkPreview.valid}</strong> valid · <strong>{screen.bulkPreview.errors}</strong> errors · <strong>{screen.bulkPreview.possible_duplicates}</strong> possible duplicates</p>{screen.bulkPreview.sheet_note && <p>{screen.bulkPreview.sheet_note}</p>}{screen.bulkPreview.ignored_columns.length > 0 && <p>Ignored columns: {screen.bulkPreview.ignored_columns.join(", ")}</p>}{screen.bulkPreview.duplicate_rows.length > 0 && <div className="bulk-upload-errors"><strong>Possible duplicates</strong>{screen.bulkPreview.duplicate_rows.map((item) => <div key={item.row}>Row {item.row}: {item.reason || "possible duplicate"}</div>)}</div>}{screen.bulkPreview.error_rows.length > 0 && <div className="bulk-upload-errors"><strong>Errors</strong>{screen.bulkPreview.error_rows.map((item) => <div key={item.row}>Row {item.row}: {item.errors.join("; ")}</div>)}</div>}{screen.bulkPreview.preview_rows.length > 0 && <div className="bulk-upload-sample"><strong>First valid rows</strong>{screen.bulkPreview.preview_rows.slice(0, 20).map((row) => <div key={String(row.row)}>{String(row.row)} · {String(row.name || "")}{row.email ? ` · ${String(row.email)}` : ""}</div>)}</div>}<button className="leads-button" type="button" disabled={!screen.bulkPreview.can_apply || screen.bulkLoading} onClick={() => void screen.applyBulkUpload()}>Apply import</button></div>}{screen.bulkResult && <div className="bulk-upload-result" role="status">Created: {screen.bulkResult.created}; skipped duplicates: {screen.bulkResult.skipped_duplicates}; skipped errors: {screen.bulkResult.skipped_errors}; import run: {screen.bulkResult.import_run_id}</div>}</section></div>}
    <header className="leads-header manage-header"><div className="manage-heading"><h1>Manage Leads</h1><button className="manage-refresh" type="button" onClick={() => void screen.load()} aria-label="Refresh leads" title="Refresh leads">↻</button></div><div className="manage-actions"><button className="leads-button manage-quick-add" type="button" onClick={() => navigate("/leads?new=1")}>Quick Add Lead</button><button className="leads-button manage-add" type="button" onClick={() => navigate("/leads?new=1")}>＋ Add New Lead</button><div className="manage-overflow-wrap"><button className="leads-button manage-overflow" type="button" aria-label="More lead actions" aria-expanded={overflowOpen} onClick={() => setOverflowOpen((value) => !value)}>⋯</button>{overflowOpen && <div className="manage-overflow-menu" role="menu"><button type="button" role="menuitem" disabled={!screen.canImport} title={screen.bulkImportLabel} aria-label={screen.bulkImportLabel} onClick={() => { if (screen.canImport) { setOverflowOpen(false); screen.openBulkUpload(); } }}>Bulk upload leads</button><button type="button" role="menuitem" onClick={() => { setOverflowOpen(false); void screen.load(); }}>Refresh</button>{screen.filtersActive && <button type="button" role="menuitem" onClick={() => { setOverflowOpen(false); screen.clearFilters(); }}>Clear filters</button>}</div>}</div></div></header>
    {screen.newLeadOpen && <form className="lead-create-form" onSubmit={(event) => void screen.createNewLead(event)}><div className="drawer-head"><h2>New lead</h2><button className="icon-button" type="button" onClick={screen.closeNewLead} aria-label="Close new lead form"><CloseIcon /></button></div><label>Name<input required value={screen.newLeadForm.name} onChange={(event) => screen.setNewLeadForm((form) => ({ ...form, name: event.target.value }))} /></label><label>Email<input type="email" value={screen.newLeadForm.email} onChange={(event) => screen.setNewLeadForm((form) => ({ ...form, email: event.target.value }))} /></label><label>Phone<input value={screen.newLeadForm.phone} onChange={(event) => screen.setNewLeadForm((form) => ({ ...form, phone: event.target.value }))} /></label><label>Company<input value={screen.newLeadForm.company} onChange={(event) => screen.setNewLeadForm((form) => ({ ...form, company: event.target.value }))} /></label><label>Lead type<select value={screen.newLeadForm.lead_type} onChange={(event) => screen.setNewLeadForm((form) => ({ ...form, lead_type: event.target.value }))}>{["DL", "L", "QDL", "QL", "R"].map((type) => <option key={type}>{type}</option>)}</select></label><label>Permission To Call<select value={screen.newLeadForm.permission} onChange={(event) => screen.setNewLeadForm((form) => ({ ...form, permission: event.target.value }))}><option>Pending</option>{screen.canChangePermission && <><option>Yes</option><option>No</option></>}</select></label><label>Products<input placeholder="Product codes, comma-separated" value={screen.newLeadForm.products} onChange={(event) => screen.setNewLeadForm((form) => ({ ...form, products: event.target.value }))} /></label><button className="leads-button" type="submit">Create lead</button></form>}
    {screen.detail && !screen.detailLoading && <section className="lead-edit-panel" aria-label="Lead actions">
      <div className="drawer-head"><div><p className="eyebrow">Selected lead</p><h2>{screen.detail.lead.name}</h2></div><button className="leads-button secondary" type="button" onClick={screen.closeDetail}>Close</button></div>
      {!screen.editing && <div className="lead-action-row"><button className="leads-button" type="button" onClick={() => screen.setEditing(true)}>Edit lead</button>{screen.canConvertAccount && <button className="leads-button secondary" type="button" onClick={() => void screen.convertLead()}>Convert to account</button>}<label>Stage<select className="lead-control" value={String(screen.detail.lead.stage || "")} onChange={(event) => void screen.updateStage(event.target.value)}><option value="">Unstaged</option>{["database", "lead", "qualified", "reference", "calling", "registered", "prepso", "attended", "notattended", "psreg", "preps"].map((stage) => <option key={stage} value={stage}>{stage}</option>)}</select></label>{screen.canChangePermission && <label>Permission To Call<select className="lead-control" value={String(screen.detail.lead.permission || "Pending")} onChange={(event) => void screen.updatePermission(event.target.value)}><option>Pending</option><option>Yes</option><option>No</option></select></label>}</div>}
      {screen.editing && <form className="lead-edit-form" onSubmit={(event) => void screen.saveLeadEdit(event)}><label>Name<input required className="lead-control" value={screen.editForm.name} onChange={(event) => screen.setEditForm((form) => ({ ...form, name: event.target.value }))} /></label><label>Email<input type="email" className="lead-control" value={screen.editForm.email} onChange={(event) => screen.setEditForm((form) => ({ ...form, email: event.target.value }))} /></label><label>Phone<input className="lead-control" value={screen.editForm.phone} onChange={(event) => screen.setEditForm((form) => ({ ...form, phone: event.target.value }))} /></label><label>Company<input className="lead-control" value={screen.editForm.company} onChange={(event) => screen.setEditForm((form) => ({ ...form, company: event.target.value }))} /></label><label>Lead type<select className="lead-control" value={screen.editForm.lead_type} onChange={(event) => screen.setEditForm((form) => ({ ...form, lead_type: event.target.value }))}>{["DL", "L", "QDL", "QL", "R"].map((type) => <option key={type}>{type}</option>)}</select></label><div className="lead-action-row"><button className="leads-button" type="submit">Save lead</button><button className="leads-button secondary" type="button" onClick={() => screen.setEditing(false)}>Cancel</button></div></form>}
    </section>}
    <section className={filtersOpen ? "lead-filters filters-open" : "lead-filters filters-collapsed"} aria-label="Lead filters">
      <button className="leads-button filter-toggle" type="button" aria-expanded={screen.advancedOpen} onClick={() => screen.openAdvancedFilter()}>+ Filter</button>
      <SavedFiltersPicker screen={screen} />
      <div className="lead-filter-primary"><div className="lead-view-picker" ref={screen.viewMenuRef}><span>View</span><button ref={screen.viewButtonRef} className="lead-view-button" type="button" aria-haspopup="listbox" aria-expanded={screen.viewMenuOpen} onClick={() => screen.viewMenuOpen ? screen.closeViewMenu() : screen.openViewMenu()} onKeyDown={screen.handleViewButtonKeyDown}>{screen.currentViewLabel}<span aria-hidden="true">v</span></button>{screen.viewMenuOpen && <div className="lead-view-menu" role="listbox" aria-label="Lead views">{screen.viewGroups.map((group) => <div className="lead-view-group" key={group.label}><div className="lead-view-group-label">{group.label}</div>{group.views.map(([key, label]) => { const index = screen.viewOptions.findIndex(([groupKey]) => groupKey === key); return <button key={key} ref={(element) => { screen.viewOptionRefs.current[index] = element; }} className={screen.view === key ? "lead-view-option selected" : "lead-view-option"} type="button" role="option" aria-selected={screen.view === key} onClick={() => screen.chooseView(key)} onKeyDown={(event) => screen.handleViewOptionKeyDown(event, index)}>{label}<span>{screen.viewCounts[key] ?? "…"}</span></button>; })}</div>)}</div>}</div>
        <label className="lead-search"><span>Search</span><input className="lead-control" value={screen.filters.q} onChange={(event) => screen.updateFilter("q", event.target.value)} placeholder="Name, company, email or lead number" /></label><label><span>Stage</span><select className="lead-control" value={screen.filters.stage} onChange={(event) => screen.updateFilter("stage", event.target.value)}><option value="">All stages</option><option value="database">Database</option><option value="lead">Lead</option><option value="qualified">Qualified</option><option value="reference">Reference</option><option value="calling">Calling</option><option value="registered">Registered</option><option value="prepso">Pre PSO</option><option value="attended">Attended</option><option value="notattended">Not Attended</option><option value="psreg">Sale / Registration</option><option value="preps">Pre PS</option></select></label><label><span>Permission</span><select className="lead-control" value={screen.filters.permission} onChange={(event) => screen.updateFilter("permission", event.target.value)}><option value="">All</option><option value="Yes">Yes</option><option value="No">No</option><option value="Pending">Pending</option></select></label>
      </div><div className="lead-filter-secondary"><label><span>Owner</span><input className="lead-control" value={screen.filters.owner} onChange={(event) => screen.updateFilter("owner", event.target.value)} placeholder="Owner" /></label><label><span>Lead status</span><input className="lead-control" value={screen.filters.lead_status} onChange={(event) => screen.updateFilter("lead_status", event.target.value)} placeholder="Any status" /></label><label><span>PSO from</span><input className="lead-control" type="date" value={screen.filters.pso_date_from} onChange={(event) => screen.updateFilter("pso_date_from", event.target.value)} /></label><label><span>PSO to</span><input className="lead-control" type="date" value={screen.filters.pso_date_to} onChange={(event) => screen.updateFilter("pso_date_to", event.target.value)} /></label><label><span>Follow-up</span><select className="lead-control" value={screen.filters.next_follow_up} onChange={(event) => screen.updateFilter("next_follow_up", event.target.value)}><option value="">Any</option><option value="overdue">Overdue</option><option value="today">Today</option><option value="upcoming">Upcoming</option></select></label>{screen.filtersActive && <button className="leads-button clear-filters" type="button" onClick={screen.clearFilters}>Clear filters</button>}</div>
    </section>
    {screen.error && <div className="lead-state error" role="alert"><span>{screen.error}</span><button className="leads-button secondary" onClick={() => void screen.load()}>Retry</button></div>}{screen.loading && <div className="lead-state">Loading leads…</div>}{!screen.loading && !screen.error && screen.data?.items.length === 0 && <div className="lead-state"><strong>No leads in this view.</strong><span>Try another view or clear a filter.</span></div>}
    {!screen.loading && !screen.error && !!screen.data?.items.length && <><div className="lead-table-wrap"><table className="lead-table"><thead><tr>{fields.map((field) => <th key={field.key}>{field.label}</th>)}</tr></thead><tbody>{screen.data.items.map((lead) => <tr key={lead.id} tabIndex={0} onClick={() => void screen.openDetail(lead.id)} onKeyDown={(event) => { if (event.key === "Enter") void screen.openDetail(lead.id); }}>{fields.map((field) => <td key={field.key}>{field.key === "name" ? <><strong>{displayField(fieldValue(lead, field.key))}</strong><small>{displayField(lead.lead_status || lead.email)}</small></> : field.key === "permission" || field.key === "stage" ? <span className="lead-pill">{displayField(fieldValue(lead, field.key))}</span> : displayField(fieldValue(lead, field.key))}</td>)}</tr>)}</tbody></table></div><footer className="lead-pagination"><span>{screen.data.total} leads</span><div><button className="leads-button secondary" disabled={screen.page <= 1} onClick={screen.previousPage}>Previous</button><span>Page {screen.page} of {screen.totalPages}</span><button className="leads-button secondary" disabled={screen.page >= screen.totalPages} onClick={screen.nextPage}>Next</button></div></footer></>}
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
          {/* 1. Header */}
          <div className="lead-detail-header">
            <div className="lead-detail-title-group">
              <span className="lead-detail-eyebrow">LEAD DETAIL</span>
              <h2 className="lead-detail-title">{screen.detail.lead.name || "Nikhil Shah"}</h2>
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
                  setDetailTab("activity");
                  setActivityComposer("note");
                }}
              >
                <NoteIcon />
                <span>Note</span>
              </button>
              <button
                type="button"
                className="lead-quick-action-btn"
                onClick={() => {
                  setDetailTab("activity");
                  setActivityComposer("followup");
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
                      onClick={() => setActivityMenuOpen((val) => !val)}
                    >
                      <span className="plus-sign">＋</span> Add Activity
                    </button>
                    {activityMenuOpen && (
                      <div className="lead-activity-menu" role="menu">
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setActivityComposer("call");
                            setActivityMenuOpen(false);
                          }}
                        >
                          Log call
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setActivityComposer("note");
                            setActivityMenuOpen(false);
                            screen.loadActivity("notes");
                          }}
                        >
                          Add note
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setActivityComposer("followup");
                            setActivityMenuOpen(false);
                          }}
                        >
                          Set follow-up
                        </button>
                      </div>
                    )}
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
                            screen.setEditing(true);
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
                /* Primary Timeline Feed matching Reference Image */
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
                          {screen.detail.lead.next_follow_up_at
                            ? new Date(screen.detail.lead.next_follow_up_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
                            : "Oct 13, 2026 • 11:00 AM"}
                        </span>
                        <p className="lead-timeline-desc">
                          {(screen.detail.followups[0]?.note as string) || "Send proposal and confirm a demo time."}
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

                  {/* 5. Aarav Mehta called Nikhil Shah */}
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

                  {/* 6. Lead round-robined to Aarav Mehta */}
                  <div className="lead-timeline-item">
                    <div className="lead-timeline-node red-node" aria-hidden="true">
                      <UserIcon />
                    </div>
                    <div className="lead-timeline-card">
                      <div className="lead-timeline-card-main">
                        <h4 className="lead-timeline-title">
                          Lead round-robined to {ownerName}
                        </h4>
                        <span className="lead-timeline-subtitle">Today, 10:02 AM</span>
                      </div>
                      <span className="lead-timeline-pill badge-assigned">Assigned</span>
                    </div>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Details tab */}
          {detailTab === "details" && (
            <section
              className="lead-detail-tab-panel"
              id="lead-detail-panel-details"
              role="tabpanel"
              aria-label="Lead details"
            >
              <div className="lead-detail-actions-bar">
                <button
                  className="leads-button"
                  type="button"
                  onClick={() => screen.setEditing(true)}
                >
                  Edit lead info
                </button>
                {screen.canConvertAccount && (
                  <button
                    className="leads-button secondary"
                    type="button"
                    onClick={() => void screen.convertLead()}
                  >
                    Convert to account
                  </button>
                )}
              </div>
              <dl className="lead-facts">
                {[
                  "company",
                  "stage",
                  "permission",
                  "owner",
                  "psoDate",
                  "isPrePsDone",
                  "email",
                  "phone",
                  "designation",
                  "city",
                  "leadSource",
                  "lastCalledOn",
                  "nextFollowUpAt",
                ].map((key) => (
                  <div className="lead-fact-row" key={key}>
                    <dt>{key.replaceAll("_", " ")}</dt>
                    <dd>{displayField(fieldValue(screen.detail!.lead, key))}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {/* Notes tab */}
          {detailTab === "notes" && (
            <section
              className="lead-detail-tab-panel"
              id="lead-detail-panel-notes"
              role="tabpanel"
              aria-label="Lead notes"
            >
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
                  placeholder="Add a new note for this lead..."
                />
                <button className="leads-button" type="submit">
                  Save note
                </button>
              </form>
              <div className="lead-detail-empty">
                <p>Notes will appear in the activity feed and note history.</p>
              </div>
            </section>
          )}

          {/* Follow-up tab */}
          {detailTab === "follow-up" && (
            <section
              className="lead-detail-tab-panel"
              id="lead-detail-panel-follow-up"
              role="tabpanel"
              aria-label="Lead follow-up"
            >
              {screen.detail.followups.length ? (
                <ul className="lead-follow-up-list">
                  {screen.detail.followups.map((followup, index) => (
                    <li key={String(followup.id || index)}>
                      <strong>{displayField(followup.due_at || followup.dueAt)}</strong>
                      <span>{displayField(followup.status)}</span>
                      {Boolean(followup.note || followup.notes) && (
                        <p>{displayField(followup.note || followup.notes)}</p>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="lead-detail-empty">
                  <p>No follow-ups are currently scheduled for this lead.</p>
                  <button
                    className="leads-button"
                    style={{ marginTop: 12 }}
                    type="button"
                    onClick={() => {
                      setDetailTab("activity");
                      setActivityComposer("followup");
                    }}
                  >
                    Schedule follow-up
                  </button>
                </div>
              )}
            </section>
          )}
        </aside>
      </div>
    )}
  </div>;
}
