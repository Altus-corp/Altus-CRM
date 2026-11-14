"use client";

import { Fragment, useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { EmailLeadModal } from "./email-lead-modal";
import { WhatsappLeadModal } from "./whatsapp-lead-modal";
import { Columns3, Eye, EyeOff, Mail, MessageCircle, PhoneCall, Pin, PinOff } from "lucide-react";
import { formatCrmDate } from "@/app/lib/date";
import { displayProductCode, displayProductLabel } from "@/app/lib/product-display";
import { ChannelPartnerSelect } from "./channel-partner-select";
import { SeniorAmbassadorSelect } from "./senior-ambassador-select";
import { isChannelPartnerColumn, isSeniorAmbassadorColumn } from "@/app/lib/channel-partner";
import { ActivityColumn } from "./activity-column";
import { addProductToMyLead, manuallyAssignLeads, saveLeadTablePreferences, updateLeadResolutionInline, updateLeadStageInline } from "@/app/dashboard/leads/actions";

const LeadDetailPanel = dynamic(() => import("./lead-detail-panel").then((module) => module.LeadDetailPanel), { ssr: false });

export type LeadColumn = { id: string; field_key: string; label: string; field_type: string; options?: string[]; computed_from?: string[]; is_visible?: boolean; read_only?: boolean };
export type LeadRow = { id: string; lead_number: number | null; assignment_id: string; first_name: string; last_name: string | null; email: string | null; phone: string | null; assigned_to: string | null; assigned_at: string | null; focused_on: string | null; next_follow_up_at: string | null; last_called_at?: string | null; is_new_inbound?: boolean; created_at: string; custom_data: Record<string, unknown>; channel_partner_name?: string | null; channel_partner_ids?: string[]; channel_partner_options?: { id: string; name: string }[]; channel_partner_editable?: boolean; senior_ambassador?: { id: string; name: string } | null; senior_ambassador_options?: { id: string; name: string }[]; senior_ambassador_editable?: boolean; detail_product_assignments?: LeadRow["product_assignments"]; product: { id: string; code: string; name: string }[] | null; stage: { name: string }[] | null; resolution: { name: string }[] | null; product_assignments: { id: string; assigned_to: string | null; assigned_at: string | null; focused_on: string | null; next_follow_up_at: string | null; last_called_at?: string | null; is_new_inbound?: boolean; product: { id: string; code: string; name: string } | null; stage: { name: string } | null; resolution: { name: string } | null }[] };
type EditableConfiguration = { products: { id: string; code: string; name: string }[]; stages: { id: string; product_id: string; name: string }[]; productResolutions: { product_id: string; resolution_id: string; resolution_name: string }[] };
type Preferences = { order: string[]; widths: Record<string, number>; frozen: string[]; hidden: string[]; layoutVersion?: number };

const activityColumn: LeadColumn = { id: "__activity__", field_key: "__activity__", label: "Activity", field_type: "system" };
const normalColumnName = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ");
const isActivityColumn = (column: LeadColumn) => column.field_key === activityColumn.field_key;
const displayColumnLabel = (column: LeadColumn) => {
  if (column.field_key === "assigned_to") return "Sales Person";
  if (column.field_key === "phone") return "Cell Number";
  if (column.field_key === "call_resolution") return "Activity Resolution";
  if (column.field_key === "next_follow_up") return "Next Follow Up";
  if (["calling remark", "calling remarks", "activity remark", "activity remarks"].includes(normalColumnName(column.label))) return "Activity Remarks";
  return column.label;
};
const findColumnKey = (columns: LeadColumn[], labels: string[], keys: string[] = []) => columns.find((column) => keys.includes(column.field_key) || labels.includes(normalColumnName(column.label)))?.field_key;

function defaultLeadLayout(columns: LeadColumn[]): Preferences {
  const fullName = findColumnKey(columns, ["full name", "lead name"], ["full_name", "lead_name"]);
  const phone = findColumnKey(columns, ["phone", "phone number"], ["phone"]);
  const product = findColumnKey(columns, ["product"], ["product"]);
  const company = findColumnKey(columns, ["company", "company name"], ["company_name"]);
  const introducer = findColumnKey(columns, ["introducer name"], ["introducer_name"]);
  const lastCalled = findColumnKey(columns, ["last called on"], ["last_called_on"]);
  const resolution = findColumnKey(columns, ["activity resolution", "call resolution"], ["call_resolution"]);
  const remark = findColumnKey(columns, ["activity remark", "calling remark", "calling remarks"], ["activity_remark", "calling_remarks"]);
  const nextFollowUp = findColumnKey(columns, ["next follow up"], ["next_follow_up"]);
  const primary = [fullName, phone, product, company, introducer, lastCalled, activityColumn.field_key, resolution, remark, nextFollowUp].filter((key): key is string => Boolean(key));
  const order = [...new Set([...primary, ...columns.map((column) => column.field_key).filter((key) => !primary.includes(key))])];
  const shown = new Set(primary);
  return { order, widths: {}, frozen: [fullName, phone, product].filter((key): key is string => Boolean(key)), hidden: columns.filter((column) => !shown.has(column.field_key)).map((column) => column.field_key) };
}

export function LeadsTable({ columns, detailColumns, leads: inputLeads, assignedNames, showHeader = true, selectedIds = [], onSelectionChange, editableConfiguration, salesPersonOptions, preferences = { order: [], widths: {}, frozen: [], hidden: [] }, onAddLead, readOnly = false }: { columns: LeadColumn[]; detailColumns?: LeadColumn[]; leads: LeadRow[]; assignedNames: Record<string, string>; showHeader?: boolean; selectedIds?: string[]; onSelectionChange?: (ids: string[]) => void; editableConfiguration?: EditableConfiguration; salesPersonOptions?: { id: string; name: string }[]; preferences?: Preferences; onAddLead?: () => void; readOnly?: boolean }) {
  const [partnerError, setPartnerError] = useState("");
  const [partnerNames, setPartnerNames] = useState<Record<string, string | null>>({});
  const [partnerConfig, setPartnerConfig] = useState<{ selected: Record<string, string[]>; options: { id: string; name: string }[]; editable: boolean }>({ selected: {}, options: [], editable: false });
  const [seniorConfig, setSeniorConfig] = useState<{ selected: Record<string, { id: string; name: string } | null>; editable: boolean }>({ selected: {}, editable: false });
  const partnerLeadIds = [...new Set(inputLeads.map((lead) => lead.id))].sort().join(",");
  const hasPartnerColumn = !readOnly && [...columns, ...(detailColumns ?? [])].some((column) => isChannelPartnerColumn(column) || isSeniorAmbassadorColumn(column));
  useEffect(() => {
    if (!hasPartnerColumn || !partnerLeadIds) return;
    let active = true;
    const ids = partnerLeadIds.split(",");
    const batches = Array.from({ length: Math.ceil(ids.length / 100) }, (_, index) => ids.slice(index * 100, index * 100 + 100));
    void Promise.all(batches.map(async (leadIds) => {
      const response = await fetch("/api/leads/channel-partners", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ leadIds }), cache: "no-store" });
      const data = await response.json() as { ok?: boolean; error?: string; warning?: string; partners?: Record<string, string | null>; selected?: Record<string, string[]>; options?: { id: string; name: string }[]; editable?: boolean; seniors?: Record<string, { id: string; name: string } | null>; seniorEditable?: boolean };
      if (!response.ok || !data.ok) throw new Error(data.error || "Channel Partners could not be loaded. Refresh and retry.");
      return data;
    })).then((results) => { if (active) { setPartnerError(results.find((data) => data.warning)?.warning ?? ""); setPartnerNames(Object.assign({}, ...results.map((data) => data.partners ?? {}))); setPartnerConfig({ selected: Object.assign({}, ...results.map((data) => data.selected ?? {})), options: results[0]?.options ?? [], editable: results[0]?.editable ?? false }); setSeniorConfig({ selected: Object.assign({}, ...results.map((data) => data.seniors ?? {})), editable: results[0]?.seniorEditable ?? false }); } }).catch((error: unknown) => { if (active) setPartnerError(error instanceof Error ? error.message : "Channel Partners could not be loaded."); });
    return () => { active = false; };
  }, [hasPartnerColumn, partnerLeadIds, inputLeads]);
  const leads = inputLeads.map((lead) => ({ ...lead, channel_partner_name: partnerNames[lead.id] ?? lead.channel_partner_name, channel_partner_ids: partnerConfig.selected[lead.id] ?? [], channel_partner_options: partnerConfig.options, channel_partner_editable: !readOnly && partnerConfig.editable, senior_ambassador: seniorConfig.selected[lead.id] ?? lead.senior_ambassador ?? null, senior_ambassador_options: partnerConfig.options, senior_ambassador_editable: !readOnly && seniorConfig.editable }));
  const router = useRouter();
  const hasSavedLayout = preferences.layoutVersion === 1 && (preferences.order.length > 0 || preferences.frozen.length > 0 || preferences.hidden.length > 0 || Object.keys(preferences.widths).length > 0);
  const initialLayout = hasSavedLayout ? preferences : defaultLeadLayout(columns);
  const tableColumns = [...columns, activityColumn];
  const [order, setOrder] = useState(() => [...initialLayout.order.filter((key) => tableColumns.some((column) => column.field_key === key)), ...tableColumns.map((column) => column.field_key).filter((key) => !initialLayout.order.includes(key))]);
  const [widths, setWidths] = useState(initialLayout.widths);
  const [frozen, setFrozen] = useState(() => initialLayout.frozen);
  const [hidden, setHidden] = useState(() => initialLayout.hidden);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [dragged, setDragged] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ key: string; after: boolean } | null>(null);
  const [detailLead, setDetailLead] = useState<LeadRow | null>(null);
  const [isSaving, startSaving] = useTransition();
  const [zoom, setZoom] = useState(1);
  const [transposed, setTransposed] = useState(false);
  const [expandedLeads, setExpandedLeads] = useState<Set<string>>(new Set());
  const toggleExpanded = (leadId: string) => setExpandedLeads((current) => { const next = new Set(current); if (next.has(leadId)) next.delete(leadId); else next.add(leadId); return next; });
  // Browser-only preference: read after mount to avoid a hydration mismatch.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => { try { const stored = Number(window.localStorage.getItem("leads-table-zoom")); if (stored >= 0.6 && stored <= 1.4) setZoom(stored); setTransposed(window.localStorage.getItem("leads-table-transposed") === "1"); } catch {} }, []);
  /* eslint-enable react-hooks/set-state-in-effect */
  const toggleTransposed = () => { const next = !transposed; setTransposed(next); try { window.localStorage.setItem("leads-table-transposed", next ? "1" : "0"); } catch {} };
  const changeZoom = (next: number) => { const value = Math.round(Math.min(1.4, Math.max(0.6, next)) * 10) / 10; setZoom(value); try { window.localStorage.setItem("leads-table-zoom", String(value)); } catch {} };
  const visibleOrderedColumns = order
    .map((key) => tableColumns.find((column) => column.field_key === key))
    .filter((column): column is LeadColumn => Boolean(column))
    .filter((column) => column.is_visible !== false && !hidden.includes(column.field_key));
  // Keep every frozen field in one solid left block after Contact. This avoids
  // frozen fields floating over scrollable cells when their original position is later.
  const orderedColumns = [
    ...visibleOrderedColumns.filter((column) => frozen.includes(column.field_key)),
    ...visibleOrderedColumns.filter((column) => !frozen.includes(column.field_key)),
  ];
  const frozenOffsets = new Map<string, number>();
  let nextFrozenOffset = 154;
  orderedColumns.forEach((column) => { if (frozen.includes(column.field_key)) { frozenOffsets.set(column.field_key, nextFrozenOffset); nextFrozenOffset += widths[column.field_key] ?? 160; } });
  const frozenBoundaryKey = orderedColumns.filter((column) => frozen.includes(column.field_key)).at(-1)?.field_key;
  const stickyColumnStyle = (key: string, header = false) => frozenOffsets.has(key) ? { position: "sticky" as const, left: frozenOffsets.get(key), zIndex: header ? 7 : 4 } : {};
  const setFreezeBoundary = (key: string) => {
    setFrozen((current) => current.includes(key) ? current.filter((frozenKey) => frozenKey !== key) : [...current, key]);
  };
  const saveLayout = () => startSaving(async () => { const formData = new FormData(); formData.set("preferences", JSON.stringify({ order, widths, frozen, hidden })); await saveLeadTablePreferences(formData); router.refresh(); });
  const toggleHidden = (key: string) => {
    setHidden((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
    setFrozen((current) => current.filter((item) => item !== key));
  };
  const resize = (event: React.PointerEvent, key: string) => { event.preventDefault(); const startX = event.clientX; const startWidth = widths[key] ?? 160; const move = (moveEvent: PointerEvent) => setWidths((current) => ({ ...current, [key]: Math.min(800, Math.max(90, startWidth + moveEvent.clientX - startX)) })); const end = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", end); }; window.addEventListener("pointermove", move); window.addEventListener("pointerup", end); };
  const selectionEnabled = Boolean(onSelectionChange);
  const selected = new Set(selectedIds);
  const allSelected = leads.length > 0 && leads.every((lead) => selected.has(lead.assignment_id));
  const toggleLead = (assignmentId: string) => onSelectionChange?.(selected.has(assignmentId) ? selectedIds.filter((id) => id !== assignmentId) : [...selectedIds, assignmentId]);
  const toggleAll = () => onSelectionChange?.(allSelected ? selectedIds.filter((id) => !leads.some((lead) => lead.assignment_id === id)) : [...new Set([...selectedIds, ...leads.map((lead) => lead.assignment_id)])]);

  return <section className="border border-slate-200 bg-white shadow-[0_5px_18px_rgba(42,55,80,0.05)]">
    {partnerError && <p role="alert" className="m-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">{partnerError}</p>}
    {showHeader && <header className="flex flex-col justify-between gap-2 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center"><div><p className="text-[10px] font-extrabold tracking-[0.12em] text-red-600">LEADS</p><h1 className="mt-0.5 text-[19px] font-extrabold tracking-[-0.04em] text-slate-900">All leads</h1></div><span className="text-xs font-bold text-slate-500">{leads.length} records shown</span></header>}
    <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-white px-3 py-2"><p className="text-[10px] font-semibold text-slate-500">Drag headers to reorder. Drag the right edge to resize. Pin freezes a column.</p><div className="flex items-center gap-1"><div className="mr-1 flex items-center overflow-hidden rounded border border-slate-200" role="group" aria-label="Table size"><button type="button" onClick={() => changeZoom(zoom - 0.1)} disabled={zoom <= 0.6} aria-label="Make table smaller" title="Make table smaller" className="h-7 w-7 text-sm font-extrabold text-slate-600 hover:bg-slate-50 disabled:text-slate-300">−</button><button type="button" onClick={() => changeZoom(1)} title="Reset table size" className="h-7 min-w-[42px] border-x border-slate-200 px-1 text-[10px] font-bold text-slate-600 hover:bg-slate-50">{Math.round(zoom * 100)}%</button><button type="button" onClick={() => changeZoom(zoom + 0.1)} disabled={zoom >= 1.4} aria-label="Make table bigger" title="Make table bigger" className="h-7 w-7 text-sm font-extrabold text-slate-600 hover:bg-slate-50 disabled:text-slate-300">+</button></div><div className="relative"><button type="button" onClick={() => setColumnsOpen((open) => !open)} aria-expanded={columnsOpen} className={`inline-flex h-7 items-center gap-1 rounded border px-2 text-[10px] font-bold ${columnsOpen ? "border-red-200 bg-red-50 text-red-600" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}><Columns3 className="h-3.5 w-3.5" /> Columns</button>{columnsOpen && <div className="absolute right-0 top-8 z-50 w-64 rounded-lg border border-slate-200 bg-white p-2 shadow-xl"><div className="mb-1 flex items-center justify-between px-2 py-1"><p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-500">Columns</p><span className="text-[9px] font-semibold text-slate-400">{orderedColumns.length} shown</span></div><div className="max-h-72 overflow-y-auto">{columns.map((column) => { const userHidden = hidden.includes(column.field_key); const adminHidden = column.is_visible === false; const isFrozen = frozen.includes(column.field_key); return <div key={column.id} className={`flex items-center gap-2 rounded px-2 py-1.5 text-xs ${adminHidden ? "opacity-50" : "hover:bg-slate-50"}`}><button type="button" disabled={adminHidden} onClick={() => toggleHidden(column.field_key)} title={userHidden ? "Show column" : "Hide column"} className="text-slate-500 disabled:cursor-not-allowed">{userHidden || adminHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5 text-emerald-600" />}</button><span className="min-w-0 flex-1 truncate font-semibold text-slate-700">{displayColumnLabel(column)}</span><button type="button" disabled={userHidden || adminHidden} onClick={() => setFreezeBoundary(column.field_key)} title={isFrozen ? "Unfreeze column" : "Freeze column"} className={isFrozen ? "text-red-600" : "text-slate-400 disabled:cursor-not-allowed disabled:text-slate-200"}>{isFrozen ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}</button></div>; })}</div><p className="mt-1 border-t border-slate-100 px-2 pt-2 text-[9px] leading-4 text-slate-400">Hidden columns are only hidden in your view. Admin-hidden fields cannot be enabled here.</p></div>}</div><button type="button" onClick={toggleTransposed} aria-pressed={transposed} title="Swap rows and columns" className={`h-7 rounded border px-2 text-[10px] font-bold ${transposed ? "border-red-200 bg-red-50 text-red-600" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>Transpose</button>{onAddLead && <button type="button" onClick={onAddLead} className="h-7 rounded border border-red-200 bg-red-50 px-2 text-[10px] font-extrabold text-red-600 hover:bg-red-100">+ Add lead</button>}<button type="button" onClick={() => { setOrder(columns.map((column) => column.field_key)); setWidths({}); setFrozen([]); setHidden([]); }} className="h-7 rounded border border-slate-200 px-2 text-[10px] font-bold text-slate-600">Reset</button><button type="button" disabled={isSaving} onClick={saveLayout} className="h-7 rounded bg-[#d90000] px-2 text-[10px] font-extrabold text-white disabled:bg-slate-300">Save view</button></div></div>
    {transposed ? <div style={{ zoom }} className="max-h-[calc(100vh-205px)] overflow-auto"><table className="isolate border-separate border-spacing-0 text-left"><thead className="sticky top-0 z-[30] bg-[#f7f8fa] text-[11px] font-extrabold tracking-[0.06em] text-slate-600 shadow-[0_1px_0_#dfe4ec]"><tr>
        <th style={{ position: "sticky", left: 0, zIndex: 40, width: 170, minWidth: 170 }} className="box-border border-r border-slate-200 bg-[#f7f8fa] px-4 py-2.5">Field</th>
        {leads.map((lead) => <th key={lead.assignment_id} onDoubleClick={() => setDetailLead(lead)} style={{ width: 220, minWidth: 220 }} className="cursor-pointer whitespace-nowrap bg-[#f7f8fa] px-4 py-2.5"><span className="inline-flex items-center gap-2">{selectionEnabled && <input type="checkbox" aria-label={`Select ${lead.first_name}`} checked={selected.has(lead.assignment_id)} onChange={() => toggleLead(lead.assignment_id)} className="h-4 w-4 rounded border-slate-300 accent-red-600" />}{[lead.first_name, lead.last_name].filter(Boolean).join(" ")}</span></th>)}
      </tr></thead>
      <tbody className="divide-y divide-slate-200">
        <tr className="bg-white"><th style={{ position: "sticky", left: 0, zIndex: 12, width: 170, minWidth: 170 }} className="box-border border-r border-slate-200 bg-white px-4 py-2 text-[11px] font-extrabold text-slate-600">Contact</th>{leads.map((lead) => <td key={lead.assignment_id} onDoubleClick={() => setDetailLead(lead)} className="cursor-pointer bg-white px-4 py-2"><LeadQuickActions lead={lead} /></td>)}</tr>
        {orderedColumns.map((column) => <tr key={column.id} className="bg-white text-[13px] text-slate-700"><th style={{ position: "sticky", left: 0, zIndex: 12, width: 170, minWidth: 170 }} className="box-border whitespace-nowrap border-r border-slate-200 bg-white px-4 py-2 text-left text-[11px] font-extrabold text-slate-600">{displayColumnLabel(column)}</th>{leads.map((lead) => <td key={lead.assignment_id} onDoubleClick={() => setDetailLead(lead)} style={{ width: 220, minWidth: 220 }} className="max-w-[260px] cursor-pointer truncate bg-white px-4 py-2 font-semibold"><InlineLeadField key={`${lead.id}:${column.id}:${lead.product?.[0]?.id ?? ""}:${lead.stage?.[0]?.name ?? ""}:${lead.resolution?.[0]?.name ?? ""}:${lead.assigned_to ?? ""}`} lead={lead} column={column} assignedNames={assignedNames} configuration={editableConfiguration} salesPersonOptions={salesPersonOptions} /></td>)}</tr>)}
        {!orderedColumns.some(isActivityColumn) && <tr className="bg-white"><th style={{ position: "sticky", left: 0, zIndex: 12, width: 170, minWidth: 170 }} className="box-border border-r border-slate-200 bg-white px-4 py-2 text-[11px] font-extrabold text-slate-600">Activity</th>{leads.map((lead) => <td key={lead.assignment_id} className="bg-white px-3 py-2"><ActivityColumn leadId={lead.id} assignmentId={lead.assignment_id} readOnly={readOnly} /></td>)}</tr>}
      </tbody></table>{!leads.length && <div className="px-4 py-12 text-center"><p className="text-sm font-bold text-slate-700">No leads yet</p></div>}</div> : <div style={{ zoom }} className="max-h-[calc(100vh-205px)] overflow-auto"><table className="isolate min-w-[1160px] w-full border-separate border-spacing-0 text-left"><colgroup><col style={{ width: 48 }} /><col style={{ width: 106 }} />{orderedColumns.map((column) => <col key={column.id} style={{ width: widths[column.field_key] ?? 160 }} />)}<col style={{ width: 180 }} /></colgroup>
      <thead className="sticky top-0 z-[30] bg-[#f7f8fa] text-[11px] font-extrabold tracking-[0.06em] text-slate-600 shadow-[0_1px_0_#dfe4ec]"><tr>
        <th style={{ position: "sticky", left: 0, zIndex: 20, width: 48, minWidth: 48, maxWidth: 48 }} className="box-border bg-[#f7f8fa] px-4 py-2.5"><input type="checkbox" aria-label="Select all leads" checked={selectionEnabled ? allSelected : false} onChange={toggleAll} disabled={!selectionEnabled} className="h-4 w-4 rounded border-slate-300 accent-red-600 disabled:cursor-default" /></th>
        <th style={{ position: "sticky", left: 48, zIndex: 20, width: 106, minWidth: 106, maxWidth: 106 }} className={`box-border bg-[#f7f8fa] px-2 py-2.5 ${frozenBoundaryKey ? "" : "border-r border-slate-200 shadow-[4px_0_7px_-6px_rgba(15,23,42,0.45)]"}`}><span>Contact</span></th>
        {orderedColumns.map((column) => <th key={column.id} draggable onDragStart={() => setDragged(column.field_key)} onDragOver={(event) => { event.preventDefault(); const box = event.currentTarget.getBoundingClientRect(); setDropTarget({ key: column.field_key, after: event.clientX > box.left + box.width / 2 }); }} onDrop={() => { if (!dragged || !dropTarget || dragged === column.field_key) return; setOrder((current) => { const next = current.filter((key) => key !== dragged); next.splice(next.indexOf(column.field_key) + (dropTarget.after ? 1 : 0), 0, dragged); return next; }); setDragged(null); setDropTarget(null); }} style={{ width: widths[column.field_key] ?? 160, minWidth: widths[column.field_key] ?? 160, ...stickyColumnStyle(column.field_key, true) }} className={`relative whitespace-nowrap bg-[#f7f8fa] px-4 py-2.5 ${column.field_key === frozenBoundaryKey ? "border-r border-slate-200 shadow-[5px_0_8px_-6px_rgba(15,23,42,0.5)]" : ""} ${dropTarget?.key === column.field_key ? (dropTarget.after ? "border-r-2 border-red-500" : "border-l-2 border-red-500") : ""}`}><span className="inline-flex items-center gap-1.5">{displayColumnLabel(column)}<button type="button" onClick={() => setFreezeBoundary(column.field_key)} className={frozen.includes(column.field_key) ? "text-red-600" : "text-slate-400"} title={frozen.includes(column.field_key) ? "Unfreeze this column" : "Freeze this column"}>{frozen.includes(column.field_key) ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}</button><SortIcon /></span><span onPointerDown={(event) => resize(event, column.field_key)} className="absolute inset-y-0 right-0 w-1 cursor-col-resize hover:bg-red-400" /></th>)}
        {!orderedColumns.some(isActivityColumn) && <th className="whitespace-nowrap bg-[#f7f8fa] px-4 py-2.5">Activity</th>}
      </tr></thead>
      <tbody className="divide-y divide-slate-200">{leads.map((lead) => {
        const stacked = Boolean(editableConfiguration) && lead.product_assignments.length > 1;
        const rowLead = stacked ? scopeLead(lead, lead.product_assignments[0]) : lead;
        const extras = stacked ? lead.product_assignments.slice(1) : [];
        const isExpanded = stacked && expandedLeads.has(lead.id);
        return <Fragment key={lead.assignment_id}><tr onDoubleClick={() => setDetailLead(lead)} className="group h-[50px] cursor-pointer bg-white text-[13px] text-slate-700 transition hover:bg-slate-50">
        <td style={{ position: "sticky", left: 0, zIndex: 12, width: 48, minWidth: 48, maxWidth: 48 }} className="box-border bg-white px-4"><input type="checkbox" aria-label={`Select ${lead.first_name}`} checked={selectionEnabled ? selected.has(lead.assignment_id) : false} onChange={() => toggleLead(lead.assignment_id)} disabled={!selectionEnabled} className="h-4 w-4 rounded border-slate-300 accent-red-600 disabled:cursor-default" /></td>
        <td style={{ position: "sticky", left: 48, zIndex: 12, width: 106, minWidth: 106, maxWidth: 106 }} className={`box-border bg-white px-2 ${frozenBoundaryKey ? "" : "border-r border-slate-200 shadow-[5px_0_8px_-6px_rgba(15,23,42,0.5)]"}`}><LeadQuickActions lead={lead} /></td>
        {orderedColumns.map((column) => <td key={column.id} style={{ width: widths[column.field_key] ?? 160, minWidth: widths[column.field_key] ?? 160, ...stickyColumnStyle(column.field_key) }} className={`relative z-0 max-w-[260px] truncate bg-white px-4 py-2 font-semibold ${column.field_key === frozenBoundaryKey ? "border-r border-slate-200 shadow-[5px_0_8px_-6px_rgba(15,23,42,0.5)]" : ""}`}>{column.field_key === "product" && stacked ? <div className="flex items-center gap-1.5"><InlineLeadField key={`${lead.id}:${column.id}:products:${lead.product_assignments.map((item) => item.product?.id).join(",")}`} lead={lead} column={column} assignedNames={assignedNames} configuration={editableConfiguration} salesPersonOptions={salesPersonOptions} /><button type="button" onClick={(event) => { event.stopPropagation(); toggleExpanded(lead.id); }} aria-expanded={isExpanded} title={isExpanded ? "Hide the other products" : "Show the other products"} className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-extrabold ${isExpanded ? "bg-red-600 text-white" : "bg-red-50 text-red-600 hover:bg-red-100"}`}>+{extras.length}</button></div> : <InlineLeadField key={`${rowLead.id}:${column.id}:${rowLead.product?.[0]?.id ?? ""}:${rowLead.stage?.[0]?.name ?? ""}:${rowLead.resolution?.[0]?.name ?? ""}:${rowLead.assigned_to ?? ""}`} lead={rowLead} column={column} assignedNames={assignedNames} configuration={editableConfiguration} salesPersonOptions={salesPersonOptions} />}</td>)}
        {!orderedColumns.some(isActivityColumn) && <td className="bg-white px-3 py-2"><ActivityColumn leadId={lead.id} assignmentId={lead.assignment_id} readOnly={readOnly} /></td>}
      </tr>{isExpanded && extras.map((assignment) => {
        const subLead = scopeLead(lead, assignment);
        return <tr key={assignment.id} onDoubleClick={() => setDetailLead({ ...lead, assignment_id: assignment.id })} className="h-[50px] cursor-pointer bg-slate-50 text-[13px] text-slate-700 hover:bg-slate-100">
          <td style={{ position: "sticky", left: 0, zIndex: 12, width: 48, minWidth: 48, maxWidth: 48 }} className="box-border bg-slate-50 px-4" />
          <td style={{ position: "sticky", left: 48, zIndex: 12, width: 106, minWidth: 106, maxWidth: 106 }} className={`box-border bg-slate-50 px-2 text-right text-[10px] font-extrabold text-slate-400 ${frozenBoundaryKey ? "" : "border-r border-slate-200 shadow-[5px_0_8px_-6px_rgba(15,23,42,0.5)]"}`}>↳</td>
          {orderedColumns.map((column) => <td key={column.id} style={{ width: widths[column.field_key] ?? 160, minWidth: widths[column.field_key] ?? 160, ...stickyColumnStyle(column.field_key) }} className={`relative z-0 max-w-[260px] truncate bg-slate-50 px-4 py-2 font-semibold ${column.field_key === frozenBoundaryKey ? "border-r border-slate-200 shadow-[5px_0_8px_-6px_rgba(15,23,42,0.5)]" : ""}`}>{column.field_key === "product" ? <span className="text-xs font-extrabold text-slate-700">{displayProductCode(assignment.product?.code)}</span> : ["stage", "call_resolution", "next_follow_up", "assigned_to"].includes(column.field_key) ? <InlineLeadField key={`${assignment.id}:${column.id}:${assignment.stage?.name ?? ""}:${assignment.resolution?.name ?? ""}:${assignment.assigned_to ?? ""}`} lead={subLead} column={column} assignedNames={assignedNames} configuration={editableConfiguration} salesPersonOptions={salesPersonOptions} /> : null}</td>)}
          {!orderedColumns.some(isActivityColumn) && <td className="bg-slate-50 px-3 py-2" />}
        </tr>;
      })}</Fragment>;
      })}</tbody>
    </table>{!leads.length && <div className="px-4 py-12 text-center"><p className="text-sm font-bold text-slate-700">No leads yet</p><p className="mt-1 text-xs text-slate-500">New leads will appear here using the columns selected by the admin.</p></div>}</div>}
    {detailLead && <LeadDetailPanel lead={{ ...detailLead, channel_partner_name: partnerNames[detailLead.id] ?? detailLead.channel_partner_name, senior_ambassador: seniorConfig.selected[detailLead.id] ?? detailLead.senior_ambassador ?? null }} columns={(detailColumns ?? columns).filter((column) => !isActivityColumn(column))} assignedNames={assignedNames} onClose={() => setDetailLead(null)} readOnly={readOnly} />}
  </section>;
}

function InlineLeadField({ lead, column, assignedNames, configuration, salesPersonOptions }: { lead: LeadRow; column: LeadColumn; assignedNames: Record<string, string>; configuration?: EditableConfiguration; salesPersonOptions?: { id: string; name: string }[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const productId = lead.product?.[0]?.id ?? "";
  const serverStageId = configuration?.stages.find((stage) => stage.product_id === productId && stage.name === lead.stage?.[0]?.name)?.id ?? "";
  const serverResolutionId = configuration?.productResolutions.find((resolution) => resolution.product_id === productId && resolution.resolution_name === lead.resolution?.[0]?.name)?.resolution_id ?? "";
  const [draftStageId, setDraftStageId] = useState(serverStageId);
  const [draftResolutionId, setDraftResolutionId] = useState(serverResolutionId);
  const [followUpResolutionId, setFollowUpResolutionId] = useState<string | null>(null);
  const [addingProduct, setAddingProduct] = useState(false);
  const [saveError, setSaveError] = useState("");
  const save = (action: (formData: FormData) => Promise<void>, field: string, value: string) => startTransition(async () => { const formData = new FormData(); formData.set("leadId", lead.id); formData.set("assignmentId", lead.assignment_id); formData.set(field, value); setSaveError(""); try { await action(formData); router.refresh(); } catch (error) { setSaveError(error instanceof Error ? error.message : "Unable to save this lead."); } });
  const saveResolution = (resolutionId: string, followUpAt?: string, followUpNote?: string) => startTransition(async () => { const formData = new FormData(); formData.set("leadId", lead.id); formData.set("assignmentId", lead.assignment_id); formData.set("resolutionId", resolutionId); if (followUpAt) formData.set("followUpAt", followUpAt); if (followUpNote) formData.set("followUpNote", followUpNote); setSaveError(""); try { await updateLeadResolutionInline(formData); setFollowUpResolutionId(null); router.refresh(); } catch (error) { setSaveError(error instanceof Error ? error.message : "Unable to save this lead."); } });
  if (isActivityColumn(column)) return configuration ? <ActivityColumn leadId={lead.id} assignmentId={lead.assignment_id} /> : <span className="text-xs font-semibold text-slate-400">View in task details</span>;
  if (isChannelPartnerColumn(column) && lead.channel_partner_editable) return <ChannelPartnerSelect leadId={lead.id} assignmentId={lead.assignment_id} names={lead.channel_partner_name} options={lead.channel_partner_options ?? []} selectedIds={lead.channel_partner_ids ?? []} onSaved={() => router.refresh()} />;
  if (isSeniorAmbassadorColumn(column) && lead.senior_ambassador_editable) return <SeniorAmbassadorSelect leadId={lead.id} assignmentId={lead.assignment_id} selected={lead.senior_ambassador} options={lead.senior_ambassador_options ?? []} onSaved={() => router.refresh()} />;
  if (column.field_key === "assigned_to" && salesPersonOptions?.length) return <SalesPersonSelect lead={lead} options={salesPersonOptions} />;
  if (!configuration) return <LeadFieldValue lead={lead} column={column} assignedNames={assignedNames} />;
  if (column.field_key === "product") return <><ProductAssignmentsMenu lead={lead} products={configuration.products} onAdd={() => setAddingProduct(true)} />{addingProduct && <AddProductModal lead={lead} products={configuration.products} onClose={() => setAddingProduct(false)} />}</>;
  if ((column.field_key === "stage" || column.field_key === "call_resolution") && lead.product_assignments.length > 1) return <ProductScopedMenu key={lead.product_assignments.map((item) => `${item.id}:${item.stage?.name ?? ""}:${item.resolution?.name ?? ""}`).join("|")} lead={lead} kind={column.field_key === "stage" ? "stage" : "resolution"} configuration={configuration} />;
  if (column.field_key === "stage") { const stages = configuration.stages.filter((stage) => stage.product_id === productId); return <FieldSelect value={draftStageId} disabled={isPending || !productId || !stages.length} onChange={(value) => { setDraftStageId(value); save(updateLeadStageInline, "stageId", value); }} placeholder={productId ? "Select stage" : "Select product first"} options={stages.map((stage) => ({ value: stage.id, label: stage.name }))} error={saveError} />; }
  if (column.field_key === "call_resolution") { const resolutions = configuration.productResolutions.filter((resolution) => resolution.product_id === productId); return <><FieldSelect value={draftResolutionId} disabled={isPending || !productId || !resolutions.length} onChange={(value) => { setDraftResolutionId(value); const selectedResolution = resolutions.find((resolution) => resolution.resolution_id === value); if (/follow[\s-]?up|verbal\s*yes/i.test(selectedResolution?.resolution_name ?? "")) setFollowUpResolutionId(value); else saveResolution(value); }} placeholder={productId ? "Select resolution" : "Select product first"} options={resolutions.map((resolution) => ({ value: resolution.resolution_id, label: resolution.resolution_name }))} error={saveError} wide />{followUpResolutionId && <FollowUpDateModal loading={isPending} onCancel={() => { setFollowUpResolutionId(null); setDraftResolutionId(serverResolutionId); }} onConfirm={(dateTime, note) => saveResolution(followUpResolutionId, dateTime, note)} />}</>; }
  return <LeadFieldValue lead={lead} column={column} assignedNames={assignedNames} />;
}

function FieldSelect({ value, disabled, onChange, placeholder, options, error, wide }: { value: string; disabled: boolean; onChange: (value: string) => void; placeholder: string; options: { value: string; label: string }[]; error: string; wide?: boolean }) {
  return <div><select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className={`h-8 ${wide ? "min-w-[160px]" : "min-w-[145px]"} rounded border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 outline-none focus:border-red-400 disabled:bg-slate-50`}><option value="" disabled>{placeholder}</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>{error && <p className="mt-1 max-w-[180px] whitespace-normal text-[9px] font-bold text-red-600">{error}</p>}</div>;
}

function SalesPersonSelect({ lead, options }: { lead: LeadRow; options: { id: string; name: string }[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedAssignee, setSelectedAssignee] = useState(lead.assigned_to ?? "");
  const [error, setError] = useState("");
  const assign = (assigneeId: string) => {
    if (!assigneeId || assigneeId === lead.assigned_to) return;
    setSelectedAssignee(assigneeId);
    setError("");
    startTransition(async () => {
      const formData = new FormData();
      formData.set("assignmentId", lead.assignment_id);
      formData.set("assigneeId", assigneeId);
      try {
        await manuallyAssignLeads(formData);
        router.refresh();
      } catch (saveError) {
        setSelectedAssignee(lead.assigned_to ?? "");
        setError(saveError instanceof Error ? saveError.message : "Unable to assign this lead.");
      }
    });
  };
  return <div onClick={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()}><select value={selectedAssignee} disabled={isPending} onChange={(event) => assign(event.target.value)} aria-label="Assign sales person" className="h-8 min-w-[155px] rounded border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 outline-none focus:border-red-400 disabled:bg-slate-50"><option value="" disabled>Unassigned</option>{options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select>{error && <p className="mt-1 max-w-[180px] whitespace-normal text-[9px] font-bold text-red-600">{error}</p>}</div>;
}

function ProductScopedMenu({ lead, kind, configuration }: { lead: LeadRow; kind: "stage" | "resolution"; configuration: EditableConfiguration }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [menuPath, setMenuPath] = useState("");
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [followUp, setFollowUp] = useState<{ assignmentId: string; resolutionId: string } | null>(null);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!buttonRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    window.addEventListener("pointerdown", closeOnOutsideClick);
    return () => window.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [open]);

  const rows = lead.product_assignments.flatMap((assignment) => {
    const productId = assignment.product?.id;
    if (!productId) return [];
    const options = kind === "stage"
      ? configuration.stages.filter((stage) => stage.product_id === productId).map((stage) => ({ value: stage.id, label: stage.name }))
      : configuration.productResolutions.filter((item) => item.product_id === productId).map((item) => ({ value: item.resolution_id, label: item.resolution_name }));
    const current = kind === "stage"
      ? configuration.stages.find((stage) => stage.product_id === productId && stage.name === assignment.stage?.name)?.id
      : configuration.productResolutions.find((item) => item.product_id === productId && item.resolution_name === assignment.resolution?.name)?.resolution_id;
    return [{ assignment, options, serverValue: current ?? "" }];
  });
  const noun = kind === "stage" ? "stage" : "resolution";
  const primary = rows[0]?.assignment;
  const primaryLabel = kind === "stage" ? primary?.stage?.name : primary?.resolution?.name;
  const clearDraft = (assignmentId: string) => setDrafts((current) => { const next = { ...current }; delete next[assignmentId]; return next; });

  const save = (assignmentId: string, value: string, followUpAt?: string, followUpNote?: string) => startTransition(async () => {
    const formData = new FormData();
    formData.set("leadId", lead.id);
    formData.set("assignmentId", assignmentId);
    if (kind === "stage") formData.set("stageId", value);
    else { formData.set("resolutionId", value); if (followUpAt) formData.set("followUpAt", followUpAt); if (followUpNote) formData.set("followUpNote", followUpNote); }
    setError("");
    try {
      await (kind === "stage" ? updateLeadStageInline(formData) : updateLeadResolutionInline(formData));
      setFollowUp(null);
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save this lead.");
      clearDraft(assignmentId);
      setFollowUp(null);
    }
  });
  const choose = (assignmentId: string, productRows: typeof rows, value: string) => {
    setDrafts((current) => ({ ...current, [assignmentId]: value }));
    const picked = productRows.find((row) => row.assignment.id === assignmentId)?.options.find((option) => option.value === value);
    if (kind === "resolution" && /follow[\s-]?up|verbal\s*yes/i.test(picked?.label ?? "")) setFollowUp({ assignmentId, resolutionId: value });
    else save(assignmentId, value);
  };
  const toggle = () => {
    if (open) { setOpen(false); return; }
    const box = buttonRef.current?.getBoundingClientRect();
    if (box) setPosition({ left: box.left, top: box.bottom + 6 });
    setMenuPath(pathname); setOpen(true);
  };

  const menu = open && menuPath === pathname && typeof document !== "undefined" ? createPortal(<div ref={menuRef} style={{ position: "fixed", left: position.left, top: position.top, zIndex: 150, width: 288 }} className="rounded-lg border border-slate-200 bg-white p-2 shadow-2xl">
    <p className="px-2 py-1 text-[10px] font-extrabold uppercase tracking-wide text-slate-400">{kind === "stage" ? "Stages" : "Call resolutions"} for each product</p>
    {rows.map((row) => <label key={row.assignment.id} className="block rounded px-2 py-1.5"><span className="text-xs font-extrabold text-slate-800">{displayProductCode(row.assignment.product?.code)}</span>
      <select value={drafts[row.assignment.id] ?? row.serverValue} disabled={isPending || !row.options.length} onChange={(event) => choose(row.assignment.id, rows, event.target.value)} className="mt-1 h-8 w-full rounded border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 outline-none focus:border-red-400 disabled:bg-slate-50">
        <option value="" disabled>{row.options.length ? `Select ${noun}` : `No ${noun}s configured`}</option>
        {row.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select></label>)}
    {error && <p className="px-2 pb-1 text-[10px] font-bold text-red-600">{error}</p>}
  </div>, document.body) : null;

  return <><button ref={buttonRef} type="button" onClick={toggle} title={`Set the ${noun} for each product`} className="inline-flex h-8 min-w-[145px] items-center justify-between gap-2 rounded border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 hover:border-red-300"><span className="truncate">{primary?.product?.code ? `${displayProductCode(primary.product.code)}: ` : ""}{primaryLabel ?? `Select ${noun}`}</span><span className="shrink-0 rounded-full bg-red-50 px-1.5 text-[10px] font-extrabold text-red-600">{rows.length} products</span></button>{menu}{followUp && <FollowUpDateModal loading={isPending} onCancel={() => { clearDraft(followUp.assignmentId); setFollowUp(null); }} onConfirm={(dateTime, note) => save(followUp.assignmentId, followUp.resolutionId, dateTime, note)} />}</>;
}

function ProductAssignmentsMenu({ lead, onAdd }: { lead: LeadRow; products: { id: string; code: string; name: string }[]; onAdd: () => void }) {
  const [open, setOpen] = useState(false);
  const [menuPath, setMenuPath] = useState("");
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!buttonRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    window.addEventListener("pointerdown", closeOnOutsideClick);
    return () => window.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [open]);
  const assignments = lead.product_assignments.length ? lead.product_assignments : [];
  const primary = assignments[0]?.product ?? lead.product?.[0] ?? null;
  const toggle = () => {
    if (open) { setOpen(false); return; }
    const box = buttonRef.current?.getBoundingClientRect();
    if (box) setPosition({ left: box.left, top: box.bottom + 6 });
    setMenuPath(pathname); setOpen(true);
  };
  const menu = open && menuPath === pathname && typeof document !== "undefined" ? createPortal(<div ref={menuRef} style={{ position: "fixed", left: position.left, top: position.top, zIndex: 150, width: 256 }} className="rounded-lg border border-slate-200 bg-white p-2 shadow-2xl"><p className="px-2 py-1 text-[10px] font-extrabold uppercase tracking-wide text-slate-400">Products for this lead</p>{assignments.map((assignment) => <div key={assignment.id} className="flex items-center justify-between rounded px-2 py-2 text-xs"><span className="font-extrabold text-slate-800">{displayProductCode(assignment.product?.code)}</span><span className="text-slate-400">{assignment.stage?.name ?? "No stage"}</span></div>)}<button type="button" onClick={() => { setOpen(false); onAdd(); }} className="mt-1 w-full rounded border border-red-200 px-2 py-2 text-left text-xs font-extrabold text-red-600 hover:bg-red-50">+ Select product</button></div>, document.body) : null;
  return <><button ref={buttonRef} type="button" onClick={toggle} className="inline-flex h-8 min-w-[145px] items-center justify-between gap-2 rounded border border-slate-200 bg-white px-2 text-xs font-bold text-slate-700 hover:border-red-300"><span>{primary?.code ?? "Select product"}</span><span className="text-slate-400">⌄</span></button>{menu}</>;
}

function AddProductModal({ lead, products, onClose }: { lead: LeadRow; products: { id: string; code: string; name: string }[]; onClose: () => void }) {
  const router = useRouter();
  const [productId, setProductId] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const submit = () => startTransition(async () => { const formData = new FormData(); formData.set("leadId", lead.id); formData.set("sourceAssignmentId", lead.assignment_id); formData.set("productId", productId); try { await addProductToMyLead(formData); router.refresh(); onClose(); } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to add the product."); } });
  if (typeof document === "undefined") return null;
  const contactName = [lead.first_name, lead.last_name].filter(Boolean).join(" ");
  return createPortal(<div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/35 p-4" role="dialog" aria-modal="true" aria-label="Add another product"><div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"><p className="text-[10px] font-extrabold tracking-[0.13em] text-red-600">MULTIPLE PRODUCTS</p><h2 className="mt-1 text-lg font-extrabold text-slate-900">Add product for {contactName || "lead"}</h2><p className="mt-1 text-sm text-slate-500">This creates separate product work and assigns it to you.</p><label className="mt-5 block text-xs font-bold text-slate-700">Product<select value={productId} onChange={(event) => setProductId(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-red-400"><option value="">Choose product</option>{products.map((product) => <option key={product.id} value={product.id}>{displayProductLabel(product)}</option>)}</select></label>{message && <p className="mt-3 text-xs font-bold text-red-600">{message}</p>}<div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={onClose} disabled={isPending} className="h-9 rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-600">Cancel</button><button type="button" disabled={isPending || !productId} onClick={submit} className="h-9 rounded-lg bg-[#d90000] px-4 text-sm font-extrabold text-white disabled:opacity-60">{isPending ? "Adding..." : "Add product"}</button></div></div></div>, document.body);
}

export function FollowUpDateModal({ loading, onCancel, onConfirm }: { loading: boolean; onCancel: () => void; onConfirm: (dateTime: string, note: string) => void }) { const [dateTime, setDateTime] = useState(""); const [note, setNote] = useState(""); if (typeof document === "undefined") return null; return createPortal(<div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/35 p-4" role="dialog" aria-modal="true" aria-labelledby="follow-up-date-title"><div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"><p className="text-[10px] font-extrabold tracking-[0.13em] text-red-600">FOLLOW-UP</p><h2 id="follow-up-date-title" className="mt-1 text-lg font-extrabold text-slate-900">Schedule follow-up</h2><p className="mt-1 text-sm text-slate-500">Choose when this lead should be followed up and record the next action.</p><label className="mt-5 block text-sm font-bold text-slate-700">Follow-up date and time<input required autoFocus type="datetime-local" value={dateTime} onChange={(event) => setDateTime(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-red-400" /></label><label className="mt-3 block text-sm font-bold text-slate-700">Follow-up note<textarea required value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} placeholder="What should happen in the follow-up?" className="mt-1.5 min-h-20 w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-red-400" /></label><div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={onCancel} disabled={loading} className="h-9 rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-600 hover:bg-slate-50">Cancel</button><button type="button" disabled={loading || !dateTime || !note.trim()} onClick={() => onConfirm(dateTime, note.trim())} className="h-9 rounded-lg bg-[#d90000] px-4 text-sm font-extrabold text-white hover:bg-red-700 disabled:opacity-60">{loading ? "Saving…" : "Save follow-up"}</button></div></div></div>, document.body); }

function scopeLead(lead: LeadRow, assignment: LeadRow["product_assignments"][number]): LeadRow {
  return { ...lead, assignment_id: assignment.id, assigned_to: assignment.assigned_to, assigned_at: assignment.assigned_at, focused_on: assignment.focused_on, next_follow_up_at: assignment.next_follow_up_at, last_called_at: assignment.last_called_at ?? lead.last_called_at, is_new_inbound: assignment.is_new_inbound ?? lead.is_new_inbound, product: assignment.product ? [assignment.product] : [], stage: assignment.stage ? [assignment.stage] : [], resolution: assignment.resolution ? [assignment.resolution] : [], product_assignments: [assignment] };
}

function LeadQuickActions({ lead }: { lead: LeadRow }) {
  const [composer, setComposer] = useState<"email" | "whatsapp" | null>(null);
  const whatsappNumber = lead.phone?.replace(/\D/g, "") ?? "";
  const leadName = [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Unnamed lead";
  const assignments = lead.product_assignments.map((item) => ({ id: item.id, code: item.product?.code ?? "Product" }));
  const close = () => setComposer(null);
  return <div className="flex items-center gap-2">{lead.phone ? <DialLeadButton leadId={lead.id} assignmentId={lead.assignment_id} number={lead.phone} /> : <span title="No phone number" className="text-red-200"><PhoneCall className="h-5 w-5" /></span>}{whatsappNumber && <button type="button" onClick={() => setComposer("whatsapp")} title="Send WhatsApp message" className="text-emerald-500 hover:text-emerald-700"><MessageCircle className="h-5 w-5" /></button>}{lead.email ? <button type="button" onClick={() => setComposer("email")} title="Send email" className="text-slate-400 hover:text-slate-600"><Mail className="h-5 w-5" /></button> : <span title="No email address" className="text-slate-200"><Mail className="h-5 w-5" /></span>}
    {composer === "email" && lead.email && <EmailLeadModal leadId={lead.id} assignments={assignments} initialAssignmentId={lead.assignment_id} leadName={leadName} firstName={lead.first_name} lastName={lead.last_name} email={lead.email} onClose={close} onSent={() => undefined} />}
    {composer === "whatsapp" && whatsappNumber && <WhatsappLeadModal leadId={lead.id} assignments={assignments} initialAssignmentId={lead.assignment_id} leadName={leadName} firstName={lead.first_name} lastName={lead.last_name} phoneDigits={whatsappNumber} onClose={close} onSent={() => undefined} />}
  </div>;
}

function DialLeadButton({ leadId, assignmentId, number }: { leadId: string; assignmentId: string; number: string }) { const [isDialling, setIsDialling] = useState(false); const [message, setMessage] = useState(""); const startDial = async () => { setIsDialling(true); setMessage(""); try { const response = await fetch("/api/altus-contacts/dial", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ leadId, assignmentId, number }) }); const result = await response.json() as { ok?: boolean; error?: string }; if (!response.ok || !result.ok) throw new Error(result.error || "Unable to start the call."); setMessage("Call requested in Altus Contacts."); } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to start the call."); } finally { setIsDialling(false); } }; return <span className="relative inline-flex"><button type="button" onClick={startDial} disabled={isDialling} title="Call with Altus Contacts" className="text-red-500 hover:text-red-700 disabled:opacity-50">{isDialling ? "…" : <PhoneCall className="h-5 w-5" />}</button>{message && <span className={`absolute left-0 top-7 z-20 w-48 rounded border bg-white px-2 py-1 text-[9px] font-bold shadow-lg ${message.startsWith("Call requested") ? "border-emerald-200 text-emerald-700" : "border-red-200 text-red-600"}`}>{message}</span>}</span>; }

function isLeadNumberColumn(column: LeadColumn) { return column.field_key === "lead_number" || ["lead no", "lead number"].includes(column.label.trim().toLowerCase()); }
function isLeadAcquisitionDateColumn(column: LeadColumn) { return column.field_key === "lead_acquisition_date" || column.label.trim().toLowerCase() === "lead acquisition date"; }
function isLastCalledOnColumn(column: LeadColumn) { return column.field_key === "last_called_on" || normalColumnName(column.label) === "last called on"; }
function isLeadNameColumn(column: LeadColumn) { return column.field_key === "lead_name" || ["full name", "lead name", "name"].includes(normalColumnName(column.label)) || Boolean(column.computed_from?.includes("first_name")); }

function NewInboundBadge() {
  return <span title="New website lead — work on this lead promptly" className="ml-2 inline-flex rounded-full bg-red-50 px-1.5 py-0.5 align-middle text-[9px] font-extrabold uppercase tracking-wide text-red-600 ring-1 ring-inset ring-red-200">New</span>;
}

function LeadFieldValue({ lead, column, assignedNames }: { lead: LeadRow; column: LeadColumn; assignedNames: Record<string, string> }) {
  const value = valueFor(lead, column, assignedNames);
  if (!lead.is_new_inbound || !isLeadNameColumn(column)) return value;
  return <span className="inline-flex max-w-full items-center whitespace-nowrap">{value}<NewInboundBadge /></span>;
}

function valueFor(lead: LeadRow, column: LeadColumn, assignedNames: Record<string, string>) {
  if (isChannelPartnerColumn(column)) return lead.channel_partner_name || "—";
  if (isSeniorAmbassadorColumn(column)) return lead.senior_ambassador?.name || "—";
  const computedValue = column.computed_from?.length
    ? column.computed_from.map((field) => field === "first_name" ? lead.first_name : field === "last_name" ? lead.last_name : field === "email" ? lead.email : field === "phone" ? lead.phone : lead.custom_data?.[field]).filter((part): part is string | number => typeof part === "string" || typeof part === "number").join(" ")
    : undefined;
  const multiProduct = lead.product_assignments.length > 1;
  const perProduct = (pick: (item: LeadRow["product_assignments"][number]) => string | undefined) => lead.product_assignments.map((item) => `${displayProductCode(item.product?.code, "?")}: ${pick(item) ?? "—"}`).join(" · ");
  const value = computedValue ?? (isLeadNumberColumn(column) ? (lead.lead_number ? `L-${lead.lead_number}` : null) : isLeadAcquisitionDateColumn(column) ? formatCrmDate(lead.created_at) : isLastCalledOnColumn(column) ? (lead.last_called_at ? formatCrmDate(lead.last_called_at) : null) : (() => { switch (column.field_key) { case "lead_name": return [lead.first_name, lead.last_name].filter(Boolean).join(" "); case "phone": return lead.phone; case "email": return lead.email; case "product": return multiProduct ? lead.product_assignments.map((item) => displayProductCode(item.product?.code, "")).filter(Boolean).join(", ") : lead.product?.[0]?.code ? displayProductCode(lead.product[0].code) : lead.product?.[0]?.name; case "stage": return multiProduct ? perProduct((item) => item.stage?.name) : lead.stage?.[0]?.name; case "call_resolution": return multiProduct ? perProduct((item) => item.resolution?.name) : lead.resolution?.[0]?.name; case "assigned_to": return lead.assigned_to ? assignedNames[lead.assigned_to] : null; case "next_follow_up": return lead.next_follow_up_at ? formatCrmDate(lead.next_follow_up_at) : null; case "created_at": return formatCrmDate(lead.created_at); default: return lead.custom_data?.[column.field_key]; } })());
  if (value === null || value === undefined || value === "") return <span className="font-medium text-slate-400">—</span>;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function SortIcon() { return <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-3 w-3 text-slate-400" aria-hidden="true"><path d="m5 6 3-3 3 3M11 10l-3 3-3-3" /></svg>; }
