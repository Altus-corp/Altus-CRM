"use client";

import { useEffect, useState, useTransition } from "react";
import { Pin, PinOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { savePreConfirmation, saveStageDropdownValue, updateLeadResolutionInline, updateLeadStageInline } from "@/app/dashboard/leads/actions";
import { formatCrmDate } from "@/app/lib/date";
import { FollowUpActions } from "@/components/dashboard/follow-up-actions";
import { LeadDetailPanel } from "@/components/leads/lead-detail-panel";
import { FollowUpDateModal, type LeadColumn, type LeadRow } from "@/components/leads/leads-table";

export type PreDetails = { notes: string };
export type BoardDropdown = { id: string; stageId: string; label: string; options: { id: string; label: string }[] };

export type BoardLead = {
  assignmentId: string;
  leadId: string;
  stageId: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  resolutionId: string;
  nextFollowUpAt: string | null;
  assignedAt: string | null;
  note: string | null;
  details: PreDetails | null;
  detail: LeadRow;
  choices: Record<string, string>;
};

type BoardColumn = { key: string; label: string; width: number };
type Layout = { order: string[]; widths: Record<string, number>; frozen: string[] };
const EMPTY_LAYOUT: Layout = { order: [], widths: {}, frozen: [] };
type Stage = { id: string; name: string };
type Resolution = { id: string; name: string };

const selectClass = "h-8 w-full min-w-[130px] rounded border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 outline-none focus:border-red-400 disabled:bg-slate-50";

export function ProductStageBoard({ product, stages, leads, resolutions, dropdowns, dropdownsReady, detailsReady, detailColumns, assignedNames }: { product: { code: string; name: string }; stages: Stage[]; leads: BoardLead[]; resolutions: Resolution[]; dropdowns: BoardDropdown[]; dropdownsReady: boolean; detailsReady: boolean; detailColumns: LeadColumn[]; assignedNames: Record<string, string> }) {
  const router = useRouter();
  const [activeId, setActiveId] = useState(stages[0]?.id ?? "");
  const [error, setError] = useState("");
  const [movingId, setMovingId] = useState("");
  const [detailLead, setDetailLead] = useState<LeadRow | null>(null);
  const [isPending, startTransition] = useTransition();
  const countFor = (stageId: string) => leads.filter((lead) => lead.stageId === stageId).length;
  const active = stages.find((stage) => stage.id === activeId) ?? stages[0];
  const visible = active ? leads.filter((lead) => lead.stageId === active.id) : [];
  const isPrePso = product.code.toUpperCase() === "PSO" && active?.name.toLowerCase() === "pre pso";
  const isDuringPso = product.code.toUpperCase() === "PSO" && active?.name.toLowerCase() === "during pso";
  const isPostPso = product.code.toUpperCase() === "PSO" && active?.name.toLowerCase() === "pso attendant";
  const isLeanLayout = isPrePso || isDuringPso || isPostPso;

  function moveTo(lead: BoardLead, stageId: string) {
    if (!stageId || stageId === lead.stageId) return;
    setError("");
    setMovingId(lead.assignmentId);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("leadId", lead.leadId);
      formData.set("assignmentId", lead.assignmentId);
      formData.set("stageId", stageId);
      try { await updateLeadStageInline(formData); router.refresh(); }
      catch (moveError) { setError(moveError instanceof Error ? moveError.message : "Unable to move this lead."); }
      finally { setMovingId(""); }
    });
  }

  const stageDropdowns = active ? dropdowns.filter((dropdown) => dropdown.stageId === active.id) : [];
  const dropdownColumns: BoardColumn[] = stageDropdowns.map((dropdown) => ({ key: `dropdown:${dropdown.id}`, label: dropdown.label, width: 190 }));
  const columnDefs: BoardColumn[] = isLeanLayout
    ? [
      { key: "actions", label: "Action", width: 190 }, { key: "lead", label: "Full Name", width: 170 }, { key: "phone", label: "Number", width: 140 },
      ...dropdownColumns, ...(isPrePso ? [{ key: "notes", label: "Confirmation Notes", width: 250 }] : []),
      { key: "moveTo", label: "Move To", width: 170 },
    ]
    : [
      { key: "lead", label: "Lead", width: 170 }, { key: "phone", label: "Phone", width: 140 }, { key: "resolution", label: "Call resolution", width: 180 }, { key: "followUp", label: "Next follow-up", width: 170 },
      { key: "assignedOn", label: "Assigned on", width: 140 }, { key: "note", label: "Latest note", width: 240 }, ...dropdownColumns,
      { key: "moveTo", label: "Move to", width: 170 }, { key: "actions", label: "Actions", width: 190 },
    ];
  const layoutKey = `altus-stage-board:${product.code}:${isPrePso ? "pre-pso" : isDuringPso ? "during-pso" : isPostPso ? "post-pso" : "default"}:${stageDropdowns.map((dropdown) => dropdown.id).join(",")}`;
  const [layouts, setLayouts] = useState<Record<string, Layout>>({});
  const layout = layouts[layoutKey] ?? EMPTY_LAYOUT;
  const [dragged, setDragged] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ key: string; after: boolean } | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(layoutKey);
      if (raw) setLayouts((current) => ({ ...current, [layoutKey]: { ...EMPTY_LAYOUT, ...JSON.parse(raw) } }));
    } catch { /* saved layout is optional */ }
  }, [layoutKey]);

  const persist = (next: Layout) => { try { window.localStorage.setItem(layoutKey, JSON.stringify(next)); } catch { /* storage unavailable */ } };
  const updateLayout = (change: (current: Layout) => Layout) => {
    const next = change(layout);
    setLayouts((current) => ({ ...current, [layoutKey]: next }));
    persist(next);
  };
  const resetLayout = () => updateLayout(() => EMPTY_LAYOUT);
  // On Pre PSO the Action column is always the first, pinned column, like Contact on the leads table.
  const isLocked = (key: string) => isLeanLayout && key === "actions";
  const sortedColumns = [...layout.order.flatMap((key) => columnDefs.find((column) => column.key === key) ?? []), ...columnDefs.filter((column) => !layout.order.includes(column.key))];
  const orderedColumns = [...sortedColumns.filter((column) => isLocked(column.key)), ...sortedColumns.filter((column) => !isLocked(column.key))];
  const widthOf = (column: BoardColumn) => layout.widths[column.key] ?? column.width;
  const frozen = [...new Set([...layout.frozen, ...(isLeanLayout ? ["actions"] : [])])].filter((key) => columnDefs.some((column) => column.key === key));
  const frozenOffsets = new Map<string, number>();
  let nextOffset = 0;
  orderedColumns.forEach((column) => { if (frozen.includes(column.key)) { frozenOffsets.set(column.key, nextOffset); nextOffset += widthOf(column); } });
  const frozenBoundaryKey = orderedColumns.filter((column) => frozen.includes(column.key)).at(-1)?.key;
  const stickyStyle = (key: string, header = false) => frozenOffsets.has(key) ? { position: "sticky" as const, left: frozenOffsets.get(key), zIndex: header ? 40 : 4 } : {};
  const toggleFrozen = (key: string) => updateLayout((current) => ({ ...current, frozen: current.frozen.includes(key) ? current.frozen.filter((item) => item !== key) : [...current.frozen, key] }));
  const resize = (event: React.PointerEvent, column: BoardColumn) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = widthOf(column);
    let latest = startWidth;
    const move = (moveEvent: PointerEvent) => {
      latest = Math.min(800, Math.max(90, startWidth + moveEvent.clientX - startX));
      setLayouts((current) => { const base = current[layoutKey] ?? EMPTY_LAYOUT; return { ...current, [layoutKey]: { ...base, widths: { ...base.widths, [column.key]: latest } } }; });
    };
    const end = () => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", end);
      persist({ ...layout, widths: { ...layout.widths, [column.key]: latest } });
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", end);
  };

  function renderCell(key: string, lead: BoardLead) {
    switch (key) {
      case "lead": return <span className="font-semibold text-slate-900">{lead.name}</span>;
      case "phone": return <span className="text-xs font-medium text-slate-700">{lead.phone ?? "—"}</span>;
      case "resolution": return <ResolutionCell key={`${lead.assignmentId}:${lead.resolutionId}`} lead={lead} resolutions={resolutions} />;
      case "followUp": return <span className="text-xs font-medium text-slate-700">{lead.nextFollowUpAt ? formatCrmDate(lead.nextFollowUpAt) : "—"}</span>;
      case "notes": return <PreNotesCell key={lead.assignmentId} lead={lead} ready={detailsReady} />;
      case "assignedOn": return <span className="text-xs font-medium text-slate-700">{lead.assignedAt ? formatCrmDate(lead.assignedAt) : "—"}</span>;
      case "note": return <span className="block max-w-[220px] truncate text-xs text-slate-600" title={lead.note ?? undefined}>{lead.note ?? "—"}</span>;
      case "moveTo": return <select value={lead.stageId ?? ""} disabled={isPending && movingId === lead.assignmentId} onChange={(event) => moveTo(lead, event.target.value)} aria-label={`Move ${lead.name} to another stage`} className={selectClass}>{stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</select>;
      case "actions": return <FollowUpActions leadId={lead.leadId} assignmentId={lead.assignmentId} phone={lead.phone} email={lead.email} />;
      default: {
        const dropdown = stageDropdowns.find((item) => `dropdown:${item.id}` === key);
        return dropdown ? <DropdownCell key={`${lead.assignmentId}:${dropdown.id}`} dropdown={dropdown} lead={lead} ready={dropdownsReady} /> : null;
      }
    }
  }

  return <section className="mx-auto max-w-[1500px] space-y-4" aria-label={`${product.code} leads`}>
    <header className="rounded-2xl bg-white p-4 shadow-sm">
      <p className="text-[10px] font-extrabold tracking-[0.12em] text-red-600">PRODUCT</p>
      <h1 className="mt-0.5 text-xl font-extrabold tracking-[-0.03em] text-slate-900">{product.code}</h1>
      <p className="mt-1 text-xs text-slate-500">{product.name} · leads assigned to you, grouped by stage.</p>

      {stages.length ? <div className="mt-4 grid gap-2 sm:grid-cols-3" role="tablist" aria-label={`${product.code} stages`}>
        {stages.map((stage) => <button key={stage.id} type="button" role="tab" aria-selected={stage.id === active?.id} onClick={() => setActiveId(stage.id)} className={`rounded-xl border px-4 py-3 text-left transition ${stage.id === active?.id ? "border-red-300 border-b-2 border-b-red-600 bg-red-50/60" : "border-slate-200 bg-slate-50 hover:border-slate-300"}`}>
          <p className="text-xs font-extrabold text-slate-800">{stage.name}</p>
          <p className="mt-0.5 text-2xl font-extrabold leading-tight text-slate-900">{countFor(stage.id)}</p>
        </button>)}
      </div> : <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">No stages are configured for {product.code} yet. Ask an admin to add them in Lead configuration.</p>}
    </header>

    {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-700" role="alert">{error}</p>}
    {isPrePso && !detailsReady && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">Pre PSO confirmation fields are not set up yet. Run 20261025_create_lead_pre_pso_details.sql in the Supabase SQL Editor.</p>}

    {!dropdownsReady && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">Stage dropdowns are not set up yet. Run 20261026_create_stage_dropdowns.sql in the Supabase SQL Editor.</p>}

    {active && <div className="border border-slate-200 bg-white shadow-[0_5px_18px_rgba(42,55,80,0.05)]" role="tabpanel" aria-label={active.name}>
      <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3"><h2 className="text-[15px] font-extrabold tracking-[-0.03em] text-slate-900">{active.name}</h2><span className="text-xs font-bold text-slate-500">{visible.length} record{visible.length === 1 ? "" : "s"} shown</span></header>
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-white px-3 py-2"><p className="text-[10px] font-semibold text-slate-500">Drag headers to reorder. Drag the right edge to resize. Pin freezes a column.</p><button type="button" onClick={resetLayout} className="h-7 rounded border border-slate-200 px-2 text-[10px] font-bold text-slate-600">Reset</button></div>
      <div className="max-h-[calc(100vh-205px)] overflow-auto">
        <table className="isolate w-full border-separate border-spacing-0 text-left" style={{ minWidth: orderedColumns.reduce((sum, column) => sum + widthOf(column), 0) }}>
          <colgroup>{orderedColumns.map((column) => <col key={column.key} style={{ width: widthOf(column) }} />)}</colgroup>
          <thead className="sticky top-0 z-[30] bg-[#f7f8fa] text-[11px] font-extrabold tracking-[0.06em] text-slate-600 shadow-[0_1px_0_#dfe4ec]"><tr>
            {orderedColumns.map((column) => <th key={column.key} draggable={!isLocked(column.key)}
              onDragStart={() => setDragged(column.key)}
              onDragOver={(event) => { event.preventDefault(); const box = event.currentTarget.getBoundingClientRect(); setDropTarget({ key: column.key, after: event.clientX > box.left + box.width / 2 }); }}
              onDrop={() => { if (dragged && dropTarget && dragged !== column.key) updateLayout((current) => { const next = orderedColumns.map((item) => item.key).filter((key) => key !== dragged); next.splice(next.indexOf(column.key) + (dropTarget.after ? 1 : 0), 0, dragged); return { ...current, order: next }; }); setDragged(null); setDropTarget(null); }}
              onDragEnd={() => { setDragged(null); setDropTarget(null); }}
              style={{ width: widthOf(column), minWidth: widthOf(column), ...stickyStyle(column.key, true) }}
              className={`relative whitespace-nowrap bg-[#f7f8fa] px-4 py-2.5 ${column.key === frozenBoundaryKey ? "border-r border-slate-200 shadow-[5px_0_8px_-6px_rgba(15,23,42,0.5)]" : ""} ${dropTarget?.key === column.key ? (dropTarget.after ? "border-r-2 border-red-500" : "border-l-2 border-red-500") : ""}`}>
              <span className="inline-flex items-center gap-1.5">{column.label}{!isLocked(column.key) && <button type="button" onClick={() => toggleFrozen(column.key)} className={frozen.includes(column.key) ? "text-red-600" : "text-slate-400"} title={frozen.includes(column.key) ? "Unfreeze this column" : "Freeze this column"}>{frozen.includes(column.key) ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}</button>}</span>
              <span onPointerDown={(event) => resize(event, column)} className="absolute inset-y-0 right-0 w-1 cursor-col-resize hover:bg-red-400" />
            </th>)}
          </tr></thead>
          <tbody className="divide-y divide-slate-200">{visible.map((lead) => <tr key={lead.assignmentId} onDoubleClick={(event) => { if (!(event.target as HTMLElement).closest("select, textarea, input, button, a")) setDetailLead(lead.detail); }} className="group min-h-[50px] cursor-pointer bg-white align-top text-[13px] text-slate-700 transition hover:bg-slate-50">
            {orderedColumns.map((column) => <td key={column.key} style={{ width: widthOf(column), minWidth: widthOf(column), ...stickyStyle(column.key) }} className={`relative z-0 bg-white px-4 py-2.5 ${column.key === frozenBoundaryKey ? "border-r border-slate-200 shadow-[5px_0_8px_-6px_rgba(15,23,42,0.5)]" : ""}`}>{renderCell(column.key, lead)}</td>)}
          </tr>)}</tbody>
        </table>
        {!visible.length && <p className="px-3 py-8 text-center text-xs font-semibold text-slate-400">No leads in {active.name} yet. A lead appears here once its product is {product.code} and its stage is {active.name}.</p>}
      </div>
    </div>}
    {detailLead && <LeadDetailPanel lead={detailLead} columns={detailColumns} assignedNames={assignedNames} onClose={() => setDetailLead(null)} />}
  </section>;
}

// The lead's own call resolution for this product, editable with the product's resolutions.
function ResolutionCell({ lead, resolutions }: { lead: BoardLead; resolutions: Resolution[] }) {
  const router = useRouter();
  const [value, setValue] = useState(lead.resolutionId);
  const [followUpFor, setFollowUpFor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const save = (resolutionId: string, followUpAt?: string) => startTransition(async () => {
    const formData = new FormData();
    formData.set("leadId", lead.leadId);
    formData.set("assignmentId", lead.assignmentId);
    formData.set("resolutionId", resolutionId);
    if (followUpAt) formData.set("followUpAt", followUpAt);
    setError("");
    try { await updateLeadResolutionInline(formData); setFollowUpFor(null); router.refresh(); }
    catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Unable to save this lead."); setValue(lead.resolutionId); setFollowUpFor(null); }
  });
  const choose = (resolutionId: string) => {
    setValue(resolutionId);
    if (/follow[\s-]?up/i.test(resolutions.find((item) => item.id === resolutionId)?.name ?? "")) setFollowUpFor(resolutionId);
    else save(resolutionId);
  };

  return <div>
    <select value={value} disabled={isPending || !resolutions.length} onChange={(event) => choose(event.target.value)} aria-label={`Call resolution for ${lead.name}`} className={selectClass}>
      <option value="" disabled>{resolutions.length ? "Select resolution" : "No resolutions configured"}</option>
      {resolutions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
    </select>
    {error && <p className="mt-1 max-w-[180px] whitespace-normal text-[10px] font-bold text-red-600">{error}</p>}
    {followUpFor && <FollowUpDateModal loading={isPending} onCancel={() => { setFollowUpFor(null); setValue(lead.resolutionId); }} onConfirm={(dateTime) => save(followUpFor, dateTime)} />}
  </div>;
}

// An admin-defined dropdown for this stage. The choice saves as soon as it changes.
function DropdownCell({ dropdown, lead, ready }: { dropdown: BoardDropdown; lead: BoardLead; ready: boolean }) {
  const [value, setValue] = useState(lead.choices[dropdown.id] ?? "");
  const [status, setStatus] = useState<{ saving: boolean; error: string }>({ saving: false, error: "" });

  async function change(next: string) {
    const previous = value;
    setValue(next);
    setStatus({ saving: true, error: "" });
    const formData = new FormData();
    formData.set("leadId", lead.leadId);
    formData.set("assignmentId", lead.assignmentId);
    formData.set("dropdownId", dropdown.id);
    formData.set("optionId", next);
    try { await saveStageDropdownValue(formData); setStatus({ saving: false, error: "" }); }
    catch (saveError) { setValue(previous); setStatus({ saving: false, error: saveError instanceof Error ? saveError.message : "Unable to save." }); }
  }

  return <>
    <select value={value} disabled={!ready || !dropdown.options.length} onChange={(event) => void change(event.target.value)} aria-label={`${dropdown.label} for ${lead.name}`} className={selectClass}>
      <option value="">{dropdown.options.length ? "Select" : "No options yet"}</option>
      {dropdown.options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
    </select>
    {status.saving && <p className="mt-1 text-[10px] font-semibold text-slate-400">Saving…</p>}
    {status.error && <p className="mt-1 max-w-[220px] whitespace-normal text-[10px] font-bold text-red-600" role="alert">{status.error}</p>}
  </>;
}

// Pre PSO confirmation notes. Saves when the field loses focus.
function PreNotesCell({ lead, ready }: { lead: BoardLead; ready: boolean }) {
  const [value, setValue] = useState(lead.details?.notes ?? "");
  const [saved, setSaved] = useState(value);
  const [status, setStatus] = useState<{ saving: boolean; error: string }>({ saving: false, error: "" });

  async function save() {
    if (value.trim() === saved.trim()) return;
    const previous = saved;
    setSaved(value);
    setStatus({ saving: true, error: "" });
    const formData = new FormData();
    formData.set("leadId", lead.leadId);
    formData.set("assignmentId", lead.assignmentId);
    formData.set("field", "notes");
    formData.set("value", value);
    try { await savePreConfirmation(formData); setStatus({ saving: false, error: "" }); }
    catch (saveError) { setSaved(previous); setValue(previous); setStatus({ saving: false, error: saveError instanceof Error ? saveError.message : "Unable to save." }); }
  }

  return <>
    <textarea value={value} disabled={!ready} rows={2} maxLength={2000} placeholder="Add confirmation notes" aria-label={`Confirmation notes for ${lead.name}`} onChange={(event) => setValue(event.target.value)} onBlur={() => void save()}
      className="w-full resize-y rounded border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-red-400 disabled:bg-slate-50" />
    {status.saving && <p className="mt-1 text-[10px] font-semibold text-slate-400">Saving…</p>}
    {status.error && <p className="mt-1 max-w-[220px] whitespace-normal text-[10px] font-bold text-red-600" role="alert">{status.error}</p>}
  </>;
}
