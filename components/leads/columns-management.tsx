"use client";

import { useState } from "react";
import { createLeadFullNameColumn, createLeadTableColumn, deleteLeadTableColumn, editLeadTableColumn, reorderLeadTableColumns, updateLeadTableColumn, updateLeadTableColumnRequired } from "@/app/dashboard/lead-settings/actions";

type FieldType = "text" | "number" | "date" | "dropdown" | "checkbox" | "textarea";
type Source = "standard" | "product" | "stage" | "resolution" | "custom";
type LeadTableColumn = { id: string; field_key: string; label: string; source: Source; field_type: FieldType; options: string[]; is_required: boolean; is_visible: boolean; position: number; computed_from?: string[] };
type Filter = "all" | "visible" | "hidden" | "standard" | "product" | "custom";

const sourceLabel: Record<Source, string> = { standard: "Lead details", product: "Product configuration", stage: "Product configuration", resolution: "Product configuration", custom: "Custom field" };
const typeLabel: Record<FieldType, string> = { text: "Text", number: "Number", date: "Date", dropdown: "Dropdown", checkbox: "Checkbox", textarea: "Text area" };

export function ColumnsManagement({ columns }: { columns: LeadTableColumn[] }) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isFullNameOpen, setIsFullNameOpen] = useState(false);
  const [fieldType, setFieldType] = useState<FieldType>("text");
  const [editingColumn, setEditingColumn] = useState<LeadTableColumn | null>(null);
  const [editFieldType, setEditFieldType] = useState<FieldType>("text");
  const [draggedColumnId, setDraggedColumnId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const visible = columns.filter((column) => column.is_visible).length;
  const hidden = columns.length - visible;
  const filteredColumns = columns.filter((column) => {
    const matchesSearch = column.label.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === "all" || (filter === "visible" && column.is_visible) || (filter === "hidden" && !column.is_visible) || (filter === "standard" && column.source === "standard") || (filter === "product" && ["product", "stage", "resolution"].includes(column.source)) || (filter === "custom" && column.source === "custom");
    return matchesSearch && matchesFilter;
  });
  const filters: { id: Filter; label: string; count: number }[] = [
    { id: "all", label: "All", count: columns.length }, { id: "visible", label: "Visible", count: visible }, { id: "hidden", label: "Hidden", count: hidden },
    { id: "standard", label: "Lead details", count: columns.filter((column) => column.source === "standard").length },
    { id: "product", label: "Product", count: columns.filter((column) => ["product", "stage", "resolution"].includes(column.source)).length },
    { id: "custom", label: "Custom", count: columns.filter((column) => column.source === "custom").length },
  ];

  return (
    <section className="rounded-[16px] border border-slate-100 bg-white p-3 shadow-[0_8px_24px_rgba(42,55,80,0.06)] md:p-4">
      <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div className="flex items-start gap-2.5"><span className="grid h-9 w-9 place-items-center rounded-[10px] bg-red-50 text-red-600"><TableIcon /></span><div><p className="text-[10px] font-extrabold tracking-[0.13em] text-red-600">LEAD SETTINGS</p><h1 className="mt-0.5 text-[19px] font-extrabold tracking-[-0.04em] text-slate-900">Columns management</h1><p className="mt-0.5 text-[11px] font-medium text-slate-500">Choose and organize the fields that appear in the Leads table.</p></div></div>
        <div className="flex items-center gap-2"><span className="rounded-lg bg-red-50 px-2.5 py-2 text-[11px] font-extrabold text-red-700">◉ {visible} visible columns</span><button type="button" onClick={() => setIsCreateOpen(true)} className="h-8 rounded-md bg-[#d90000] px-3 text-[11px] font-extrabold text-white hover:bg-red-700">＋ Add column</button></div>
      </header>

      <div className="mt-2 flex justify-end">
        <button type="button" onClick={() => setIsFullNameOpen(true)} className="h-8 rounded-md border border-red-200 bg-white px-3 text-[11px] font-extrabold text-red-700 hover:bg-red-50">+ Add Full Name column</button>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard tone="red" icon="⊞" label="Total columns" count={columns.length} description="All available fields" />
        <SummaryCard tone="green" icon="◉" label="Visible columns" count={visible} description="Shown in leads table" />
        <SummaryCard tone="blue" icon="⊘" label="Hidden columns" count={hidden} description="Not visible to users" />
        <SummaryCard tone="purple" icon="▣" label="Data sources" count={3} description="Lead, Product, Custom" />
      </div>

      <div className="mt-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
        <div className="flex flex-wrap gap-1.5">{filters.map((item) => <button key={item.id} type="button" onClick={() => setFilter(item.id)} className={`rounded-md border px-2.5 py-1.5 text-[10px] font-bold transition ${filter === item.id ? "border-[#d90000] bg-[#d90000] text-white" : "border-slate-200 bg-white text-slate-600 hover:border-red-200 hover:text-red-700"}`}>{item.label} ({item.count})</button>)}</div>
        <label className="relative"><span className="pointer-events-none absolute left-2.5 top-1.5 text-slate-400"><SearchIcon /></span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search columns..." className="h-8 w-full rounded-md border border-slate-200 pl-8 pr-2.5 text-[11px] outline-none focus:border-red-400 sm:w-40" /></label>
      </div>

      <div className="mt-2 overflow-x-auto rounded-xl border border-slate-100">
        <div className="min-w-[760px]">
          <div className="grid grid-cols-[34px_minmax(180px,1.6fr)_105px_minmax(150px,1.2fr)_70px_78px_58px] items-center gap-2 bg-slate-50 px-3 py-2 text-[9px] font-extrabold uppercase tracking-[0.06em] text-slate-500"><span>#</span><span>Column name</span><span>Field type</span><span>Data source</span><span>Visible</span><span>Required</span><span className="text-right">Actions</span></div>
          <div className="divide-y divide-slate-100">{filteredColumns.map((column, index) => <ColumnRow key={column.id} column={column} index={index + 1} isDragging={draggedColumnId === column.id} onDragStart={() => setDraggedColumnId(column.id)} onDrop={async () => { if (!draggedColumnId || draggedColumnId === column.id) return setDraggedColumnId(null); const formData = new FormData(); formData.set("draggedId", draggedColumnId); formData.set("targetId", column.id); await reorderLeadTableColumns(formData); setDraggedColumnId(null); }} onDragEnd={() => setDraggedColumnId(null)} onEdit={() => { setEditingColumn(column); setEditFieldType(column.field_type); }} />)}{!filteredColumns.length && <p className="px-4 py-8 text-center text-sm font-semibold text-slate-500">No columns match your search.</p>}</div>
        </div>
      </div>

      {isCreateOpen && <CreateColumnModal fieldType={fieldType} setFieldType={setFieldType} close={() => setIsCreateOpen(false)} />}
      {isFullNameOpen && <FullNameColumnModal close={() => setIsFullNameOpen(false)} />}
      {editingColumn && <EditColumnModal column={editingColumn} fieldType={editFieldType} setFieldType={setEditFieldType} close={() => setEditingColumn(null)} />}
    </section>
  );
}

function ColumnRow({ column, index, isDragging, onDragStart, onDragEnd, onDrop, onEdit }: { column: LeadTableColumn; index: number; isDragging: boolean; onDragStart: () => void; onDragEnd: () => void; onDrop: () => void; onEdit: () => void }) {
  const canDelete = column.source === "custom" && !column.is_required;
  return <div onDragOver={(event) => event.preventDefault()} onDrop={onDrop} className={`grid grid-cols-[34px_minmax(180px,1.6fr)_105px_minmax(150px,1.2fr)_70px_78px_58px] items-center gap-2 px-3 py-2 text-[11px] text-slate-600 transition ${isDragging ? "bg-red-50 opacity-50" : ""}`}><span className="flex items-center gap-1 text-slate-400"><button type="button" draggable onDragStart={onDragStart} onDragEnd={onDragEnd} title="Drag to reorder" className="cursor-grab text-base leading-none active:cursor-grabbing">⠿</button>{index}</span><div className="flex items-center gap-2"><ColumnIcon type={column.field_type} /><span className="font-bold text-slate-800">{column.label}</span>{column.source === "standard" && <span className="rounded bg-red-50 px-1.5 py-0.5 text-[8px] font-bold text-red-600">SYSTEM</span>}</div><span className="flex items-center gap-1.5"><FieldIcon type={column.field_type} />{typeLabel[column.field_type]}</span><span className="flex items-center gap-1.5"><SourceIcon source={column.source} />{sourceLabel[column.source]}</span><ColumnToggle column={column} /><RequiredToggle column={column} /><div className="flex justify-end gap-0.5 text-slate-500"><button type="button" onClick={onEdit} title="Edit column" className="grid h-6 w-6 place-items-center rounded hover:bg-slate-100"><PencilIcon /></button>{canDelete && <form action={deleteLeadTableColumn}><input type="hidden" name="columnId" value={column.id} /><button title="Delete optional custom column" className="grid h-6 w-6 place-items-center rounded text-red-500 hover:bg-red-50">⌫</button></form>}</div></div>;
}

function ColumnToggle({ column }: { column: LeadTableColumn }) {
  return <form action={updateLeadTableColumn}><input type="hidden" name="columnId" value={column.id} /><input type="hidden" name="isVisible" value={String(!column.is_visible)} /><button title={column.is_visible ? "Hide column" : "Show column"} className={`relative h-4 w-7 rounded-full ${column.is_visible ? "bg-[#d90000]" : "bg-slate-200"}`}><span className={`absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform ${column.is_visible ? "translate-x-3" : "translate-x-0"}`} /></button></form>;
}

function RequiredToggle({ column }: { column: LeadTableColumn }) {
  return <form action={updateLeadTableColumnRequired}><input type="hidden" name="columnId" value={column.id} /><input type="hidden" name="isRequired" value={String(!column.is_required)} /><button title={column.is_required ? "Make optional" : "Make required"} className={`relative h-4 w-7 rounded-full ${column.is_required ? "bg-[#d90000]" : "bg-slate-200"}`}><span className={`absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform ${column.is_required ? "translate-x-3" : "translate-x-0"}`} /></button></form>;
}

function FullNameColumnModal({ close }: { close: () => void }) {
  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-labelledby="full-name-column-title"><form action={async (formData) => { await createLeadFullNameColumn(formData); close(); }} className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><p className="text-[11px] font-extrabold tracking-[0.12em] text-red-600">CALCULATED COLUMN</p><h2 id="full-name-column-title" className="mt-1 text-lg font-extrabold text-slate-900">Add Full Name</h2><p className="mt-1 text-sm text-slate-500">Display a name in the Leads table without changing lead data.</p></div><button type="button" onClick={close} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100">×</button></div><label className="mt-5 block text-sm font-bold text-slate-700">Column name<input name="label" required autoFocus defaultValue="Full Name" className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100" /></label><div className="mt-4 rounded-xl border border-red-100 bg-red-50 p-3"><p className="text-[11px] font-extrabold uppercase tracking-wide text-red-600">Concatenation</p><p className="mt-1 text-sm font-bold text-slate-800">First Name <span className="mx-1 text-red-600">+</span> Last Name</p><p className="mt-1 text-xs text-slate-500">This is display-only. CSV templates and imports still use the separate First Name and Last Name fields.</p></div><div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={close} className="h-9 rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-600 hover:bg-slate-50">Cancel</button><button className="h-9 rounded-lg bg-[#d90000] px-4 text-sm font-extrabold text-white hover:bg-red-700">Add Full Name</button></div></form></div>;
}

function CreateColumnModal({ fieldType, setFieldType, close }: { fieldType: FieldType; setFieldType: (type: FieldType) => void; close: () => void }) {
  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-labelledby="add-column-title"><form action={async (formData) => { await createLeadTableColumn(formData); close(); }} className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><p className="text-[11px] font-extrabold tracking-[0.12em] text-red-600">LEAD TABLE</p><h2 id="add-column-title" className="mt-1 text-lg font-extrabold text-slate-900">Add custom column</h2><p className="mt-1 text-sm text-slate-500">This field will be available in every lead.</p></div><button type="button" onClick={close} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100">×</button></div><div className="mt-5 grid gap-3 sm:grid-cols-2"><label className="text-sm font-bold text-slate-700">Column name<input name="label" required autoFocus placeholder="e.g. City" className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100" /></label><label className="text-sm font-bold text-slate-700">Field type<select name="fieldType" value={fieldType} onChange={(event) => setFieldType(event.target.value as FieldType)} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-red-400"><option value="text">Text</option><option value="number">Number</option><option value="date">Date</option><option value="dropdown">Dropdown</option><option value="checkbox">Checkbox</option><option value="textarea">Long text</option></select></label></div>{fieldType === "dropdown" && <label className="mt-3 block text-sm font-bold text-slate-700">Dropdown options<textarea name="options" required rows={3} placeholder={"One option per line\nExample: Mumbai\nDelhi"} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100" /></label>}<label className="mt-3 flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" name="isRequired" className="h-4 w-4 accent-red-600" /> Required when creating a lead</label><div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={close} className="h-9 rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-600 hover:bg-slate-50">Cancel</button><button className="h-9 rounded-lg bg-[#d90000] px-4 text-sm font-extrabold text-white hover:bg-red-700">Add column</button></div></form></div>;
}

function EditColumnModal({ column, fieldType, setFieldType, close }: { column: LeadTableColumn; fieldType: FieldType; setFieldType: (type: FieldType) => void; close: () => void }) {
  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-labelledby="edit-column-title"><form action={async (formData) => { await editLeadTableColumn(formData); close(); }} className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl"><input type="hidden" name="columnId" value={column.id} /><div className="flex items-start justify-between gap-4"><div><p className="text-[11px] font-extrabold tracking-[0.12em] text-red-600">LEAD TABLE</p><h2 id="edit-column-title" className="mt-1 text-lg font-extrabold text-slate-900">Edit column</h2><p className="mt-1 text-sm text-slate-500">Update this field for every lead.</p></div><button type="button" onClick={close} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100">×</button></div><div className="mt-5 grid gap-3 sm:grid-cols-2"><label className="text-sm font-bold text-slate-700">Column name<input name="label" required autoFocus defaultValue={column.label} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100" /></label><label className="text-sm font-bold text-slate-700">Field type<select name="fieldType" value={fieldType} onChange={(event) => setFieldType(event.target.value as FieldType)} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-red-400"><option value="text">Text</option><option value="number">Number</option><option value="date">Date</option><option value="dropdown">Dropdown</option><option value="checkbox">Checkbox</option><option value="textarea">Long text</option></select></label></div>{fieldType === "dropdown" && <label className="mt-3 block text-sm font-bold text-slate-700">Dropdown options<textarea name="options" required rows={3} defaultValue={column.options.join("\n")} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100" /></label>}<label className="mt-3 flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" name="isRequired" defaultChecked={column.is_required} className="h-4 w-4 accent-red-600" /> Required when creating a lead</label><div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={close} className="h-9 rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-600 hover:bg-slate-50">Cancel</button><button className="h-9 rounded-lg bg-[#d90000] px-4 text-sm font-extrabold text-white hover:bg-red-700">Save changes</button></div></form></div>;
}

function SummaryCard({ tone, icon, label, count, description }: { tone: "red" | "green" | "blue" | "purple"; icon: string; label: string; count: number; description: string }) { const colors = { red: "bg-red-50 text-red-600", green: "bg-emerald-50 text-emerald-600", blue: "bg-blue-50 text-blue-600", purple: "bg-violet-50 text-violet-600" }; return <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3"><div className="flex gap-2"><span className={`grid h-8 w-8 place-items-center rounded-lg text-base ${colors[tone]}`}>{icon}</span><div><p className="text-[10px] font-bold text-slate-600">{label}</p><p className="mt-0.5 text-xl font-extrabold text-slate-900">{count}</p><p className="text-[9px] font-medium text-slate-500">{description}</p></div></div></div>; }
function TableIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M9 4v16" /></svg>; }
function SearchIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></svg>; }
function PencilIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>; }
function ColumnIcon({ type }: { type: FieldType }) { return <span className="text-slate-500">{type === "date" ? "◫" : type === "dropdown" ? "◇" : type === "checkbox" ? "☑" : "T"}</span>; }
function FieldIcon({ type }: { type: FieldType }) { return <span className="font-bold text-slate-500">{type === "date" ? "◫" : type === "dropdown" ? "◇" : type === "checkbox" ? "☑" : "T"}</span>; }
function SourceIcon({ source }: { source: Source }) { return <span className={source === "product" || source === "stage" || source === "resolution" ? "text-red-500" : source === "custom" ? "text-violet-600" : "text-slate-500"}>{source === "custom" ? "◉" : source === "standard" ? "♙" : "◇"}</span>; }
