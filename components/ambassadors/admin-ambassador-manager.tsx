"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type FormEvent } from "react";
import { Download, FileSpreadsheet, Pencil, Plus, Trash2, Upload, X } from "lucide-react";
import { createAmbassador, deleteAmbassadorRecords, importAmbassadors, updateAmbassadorDetails, type AmbassadorInput } from "@/app/dashboard/my-ambassador/actions";
import type { LeadColumn, LeadRow } from "@/components/leads/leads-table";

const LeadDetailPanel = dynamic(() => import("@/components/leads/lead-detail-panel").then((module) => module.LeadDetailPanel), { ssr: false });

type SalesPerson = { id: string; name: string };
export type AmbassadorRecord = AmbassadorInput & {
  assignmentId: string;
  leadId: string;
  fullName: string;
  leadNumber: number | null;
  email: string | null;
  createdAt: string;
  customData: Record<string, unknown>;
  product: { id: string; code: string; name: string } | null;
  stage: { name: string } | null;
};

const agreementStatuses = ["Abandoned", "Agreement Sent", "Agreement Signed", "Not Pitched", "Pitched", "Query", "Said No", "Verbal Yes"];
const headers = ["Participant First Name", "Participant Last Name", "Cell Number", "Sales Person", "Commission", "Commission Notes", "Priority", "Agreement Status", "Signed Agreement Link", "Last Called On", "Last Call Notes", "Remark", "Manan Sir Notes", "Target Leads", "Target Demo", "Target Proposals", "Target Sales"];
const emptyInput = (): AmbassadorInput => ({ firstName: "", lastName: "", cellNumber: "", salesPersonId: "", commission: "", commissionNotes: "", priority: "", agreementStatus: "", signedAgreementLink: "", lastCalledOn: "", lastCallNotes: "", remark: "", mananSirNotes: "", targetLeads: "", targetDemo: "", targetProposals: "", targetSales: "" });
const normalize = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ");
const inputClass = "mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-50";

function excelColumn(index: number) {
  let value = "";
  let current = index;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    value = String.fromCharCode(65 + remainder) + value;
    current = Math.floor((current - 1) / 26);
  }
  return value;
}

function toLocalDateTime(value: string) {
  if (!value) return "";
  const date = new Date(value); if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function formatDate(value: string) { return value ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)) : "—"; }

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/45 p-3" role="dialog" aria-modal="true" aria-label={title}><div className="max-h-[calc(100svh-24px)] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-extrabold tracking-[0.15em] text-red-600">AMBASSADOR</p><h2 className="mt-1 text-xl font-extrabold text-slate-900">{title}</h2></div><button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Close"><X className="h-4 w-4" /></button></div>{children}</div></div>;
}

function AmbassadorForm({ value, salesPeople, submitLabel, onCancel, onSubmit }: { value: AmbassadorInput; salesPeople: SalesPerson[]; submitLabel: string; onCancel: () => void; onSubmit: (value: AmbassadorInput) => Promise<{ ok: boolean; message: string }>; }) {
  const [draft, setDraft] = useState<AmbassadorInput>({ ...value, lastCalledOn: toLocalDateTime(value.lastCalledOn ?? "") });
  const [message, setMessage] = useState(""); const [pending, setPending] = useState(false);
  const set = (key: keyof AmbassadorInput, next: string) => setDraft((current) => ({ ...current, [key]: next }));
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setPending(true); setMessage(""); const result = await onSubmit(draft); setPending(false); if (result.ok) onCancel(); else setMessage(result.message); }
  return <form onSubmit={submit} className="mt-5"><div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
    <label className="text-xs font-bold text-slate-700">Participant First Name *<input value={draft.firstName} onChange={(e) => set("firstName", e.target.value)} required className={inputClass} /></label>
    <label className="text-xs font-bold text-slate-700">Participant Last Name *<input value={draft.lastName} onChange={(e) => set("lastName", e.target.value)} required className={inputClass} /></label>
    <label className="text-xs font-bold text-slate-700">Cell Number *<input value={draft.cellNumber} onChange={(e) => set("cellNumber", e.target.value.replace(/\D/g, "").slice(-10))} inputMode="numeric" required className={inputClass} /></label>
    <label className="text-xs font-bold text-slate-700">Sales Person<select value={draft.salesPersonId} onChange={(e) => set("salesPersonId", e.target.value)} className={inputClass}><option value="">Unassigned</option>{salesPeople.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
    <label className="text-xs font-bold text-slate-700">Commission<input value={draft.commission} onChange={(e) => set("commission", e.target.value)} inputMode="decimal" placeholder="0.00" className={inputClass} /></label>
    <label className="text-xs font-bold text-slate-700">Priority<select value={draft.priority} onChange={(e) => set("priority", e.target.value)} className={inputClass}><option value="">Select priority</option>{[1, 2, 3].map((number) => <option key={number} value={number}>{number}</option>)}</select></label>
    <label className="text-xs font-bold text-slate-700">Agreement Status<select value={draft.agreementStatus} onChange={(e) => set("agreementStatus", e.target.value)} className={inputClass}><option value="">Select status</option>{agreementStatuses.map((status) => <option key={status}>{status}</option>)}</select></label>
    <label className="text-xs font-bold text-slate-700">Last Called On<input type="datetime-local" value={draft.lastCalledOn} onChange={(e) => set("lastCalledOn", e.target.value)} className={inputClass} /></label>
    <label className="text-xs font-bold text-slate-700">Signed Agreement Link<input value={draft.signedAgreementLink} onChange={(e) => set("signedAgreementLink", e.target.value)} type="url" placeholder="https://" className={inputClass} /></label>
    <label className="text-xs font-bold text-slate-700">Target Leads<input value={draft.targetLeads} onChange={(e) => set("targetLeads", e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="0" className={inputClass} /></label>
    <label className="text-xs font-bold text-slate-700">Target Demo<input value={draft.targetDemo} onChange={(e) => set("targetDemo", e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="0" className={inputClass} /></label>
    <label className="text-xs font-bold text-slate-700">Target Proposals<input value={draft.targetProposals} onChange={(e) => set("targetProposals", e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="0" className={inputClass} /></label>
    <label className="text-xs font-bold text-slate-700">Target Sales<input value={draft.targetSales} onChange={(e) => set("targetSales", e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="0" className={inputClass} /></label>
    <label className="text-xs font-bold text-slate-700 sm:col-span-2 lg:col-span-3">Commission Notes<textarea value={draft.commissionNotes} onChange={(e) => set("commissionNotes", e.target.value)} className={`${inputClass} h-16 py-2`} /></label>
    <label className="text-xs font-bold text-slate-700 sm:col-span-2 lg:col-span-3">Last Call Notes<textarea value={draft.lastCallNotes} onChange={(e) => set("lastCallNotes", e.target.value)} className={`${inputClass} h-16 py-2`} /></label>
    <label className="text-xs font-bold text-slate-700 sm:col-span-2 lg:col-span-3">Remark<textarea value={draft.remark} onChange={(e) => set("remark", e.target.value)} className={`${inputClass} h-16 py-2`} /></label>
    <label className="text-xs font-bold text-slate-700 sm:col-span-2 lg:col-span-3">Manan Sir Notes<textarea value={draft.mananSirNotes} onChange={(e) => set("mananSirNotes", e.target.value)} className={`${inputClass} h-16 py-2`} /></label>
  </div>{message && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{message}</p>}<div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={onCancel} className="h-9 rounded-lg border border-slate-200 px-4 text-xs font-bold text-slate-600">Cancel</button><button disabled={pending} className="h-9 rounded-lg bg-[#d90000] px-4 text-xs font-extrabold text-white disabled:opacity-60">{pending ? "Saving…" : submitLabel}</button></div></form>;
}

function AmbassadorDetailsEditor({ record, salesPeople }: { record: AmbassadorRecord; salesPeople: SalesPerson[] }) {
  const [editing, setEditing] = useState(false);
  const router = useRouter();

  return <section className="mt-5 rounded-2xl border border-red-100 bg-white p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="text-sm font-extrabold text-slate-900">Ambassador management details</h3><p className="mt-1 text-xs text-slate-500">Commission, agreement, targets, notes, contact details, and Sales Person are managed here.</p></div>
      <button type="button" onClick={() => setEditing((value) => !value)} className="h-9 rounded-lg border border-red-200 bg-white px-3 text-xs font-extrabold text-red-600 hover:bg-red-50">{editing ? "Cancel" : "Edit Ambassador details"}</button>
    </div>
    {editing && <AmbassadorForm value={record} salesPeople={salesPeople} submitLabel="Save Ambassador details" onCancel={() => setEditing(false)} onSubmit={async (input) => {
      const result = await updateAmbassadorDetails(record.assignmentId, input);
      if (result.ok) router.refresh();
      return result;
    }} />}
  </section>;
}

export function AdminAmbassadorManager({ rows, salesPeople, detailColumns, assignedNames }: { rows: AmbassadorRecord[]; salesPeople: SalesPerson[]; detailColumns: LeadColumn[]; assignedNames: Record<string, string> }) {
  const [mode, setMode] = useState<"manual" | "bulk" | null>(null); const [editing, setEditing] = useState<AmbassadorRecord | null>(null);
  const [detailRecord, setDetailRecord] = useState<AmbassadorRecord | null>(null);
  const [file, setFile] = useState<File | null>(null); const [message, setMessage] = useState(""); const [pending, setPending] = useState(false);
  const [inlineMessage, setInlineMessage] = useState("");
  const [isSavingInline, startSavingInline] = useTransition();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, startDeleting] = useTransition();
  const [selecting, setSelecting] = useState(false);
  const router = useRouter();
  const salesByName = useMemo(() => new Map(salesPeople.map((person) => [normalize(person.name), person.id])), [salesPeople]);
  const toLeadRow = (row: AmbassadorRecord): LeadRow => ({
    id: row.leadId,
    lead_number: row.leadNumber,
    assignment_id: row.assignmentId,
    first_name: row.firstName,
    last_name: row.lastName || null,
    email: row.email,
    phone: row.cellNumber,
    assigned_to: row.salesPersonId || null,
    assigned_at: null,
    focused_on: null,
    next_follow_up_at: null,
    created_at: row.createdAt,
    custom_data: row.customData,
    product: row.product ? [row.product] : null,
    stage: row.stage ? [row.stage] : null,
    resolution: null,
    product_assignments: [{ id: row.assignmentId, assigned_to: row.salesPersonId || null, assigned_at: null, focused_on: null, next_follow_up_at: null, product: row.product, stage: row.stage, resolution: null }],
  });
  const saveInline = (row: AmbassadorRecord, patch: Partial<Pick<AmbassadorInput, "salesPersonId" | "priority" | "agreementStatus">>) => startSavingInline(async () => {
    setInlineMessage("");
    const result = await updateAmbassadorDetails(row.assignmentId, { ...row, ...patch });
    setInlineMessage(result.message);
    if (result.ok) router.refresh();
  });
  const toggleSelected = (assignmentId: string) => setSelectedIds((current) => {
    const next = new Set(current);
    if (next.has(assignmentId)) next.delete(assignmentId); else next.add(assignmentId);
    return next;
  });
  const toggleAll = () => setSelectedIds((current) => current.size === rows.length ? new Set() : new Set(rows.map((row) => row.assignmentId)));
  const deleteSelected = () => {
    if (!selectedIds.size || !window.confirm(`Delete ${selectedIds.size} selected Ambassador record${selectedIds.size === 1 ? "" : "s"}? The lead and its activity history will remain in CRM.`)) return;
    startDeleting(async () => {
      const result = await deleteAmbassadorRecords([...selectedIds]);
      setInlineMessage(result.message);
      if (result.ok) { setSelectedIds(new Set()); router.refresh(); }
    });
  };
  async function downloadTemplate() {
    const ExcelJS = (await import("exceljs")).default;
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet("Ambassadors", { views: [{ state: "frozen", ySplit: 1 }] });
    const lists = book.addWorksheet("Lists");
    lists.state = "veryHidden";

    const dropdownLists = [
      { title: "Sales People", values: salesPeople.map((person) => person.name) },
      { title: "Priority", values: ["1", "2", "3"] },
      { title: "Agreement Status", values: agreementStatuses },
    ];

    dropdownLists.forEach((list, index) => {
      const column = index + 1;
      lists.getCell(1, column).value = list.title;
      list.values.forEach((value, row) => { lists.getCell(row + 2, column).value = value; });
    });

    sheet.addRow(headers);
    sheet.addRow(["Mayur", "Gaikwad", "9876543210", salesPeople[0]?.name ?? "", "0", "", "1", "Agreement Sent", "", "", "", "", "", "0", "0", "0", "0"]);
    sheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD90000" } };
    });
    sheet.getColumn(3).numFmt = "@";
    sheet.columns.forEach((column) => { column.width = Math.max(18, String(column.header ?? "").length + 4); });

    const lastRow = 501;
    const salesEnd = Math.max(2, salesPeople.length + 1);
    const priorityEnd = 4;
    const statusEnd = agreementStatuses.length + 1;
    const listFormula = (column: number, end: number) => `'Lists'!$${excelColumn(column)}$2:$${excelColumn(column)}$${end}`;
    const selectValidation = (formula: string) => ({
      type: "list" as const,
      allowBlank: true,
      formulae: [formula],
      showErrorMessage: true,
      errorStyle: "stop" as const,
      errorTitle: "Choose a listed value",
      error: "Please select a value from the dropdown.",
    });
    const requiredValidation = (formula: string, error: string) => ({
      type: "custom" as const,
      allowBlank: false,
      formulae: [formula],
      showErrorMessage: true,
      errorStyle: "stop" as const,
      errorTitle: "Required field",
      error,
    });

    for (let row = 2; row <= lastRow; row += 1) {
      if (salesPeople.length) sheet.getCell(`D${row}`).dataValidation = selectValidation(listFormula(1, salesEnd));
      sheet.getCell(`G${row}`).dataValidation = selectValidation(listFormula(2, priorityEnd));
      sheet.getCell(`H${row}`).dataValidation = selectValidation(listFormula(3, statusEnd));
      sheet.getCell(`A${row}`).dataValidation = requiredValidation(`A${row}<>""`, "Participant First Name is required.");
      sheet.getCell(`B${row}`).dataValidation = requiredValidation(`B${row}<>""`, "Participant Last Name is required.");
      sheet.getCell(`C${row}`).dataValidation = requiredValidation(`AND(LEN(C${row})=10,ISNUMBER(--C${row}))`, "Cell Number must contain exactly 10 digits.");
    }

    const buffer = await book.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "ambassador-import-template.xlsx";
    link.click();
    URL.revokeObjectURL(url);
  }
  async function importFile(event: FormEvent) { event.preventDefault(); if (!file) return; setPending(true); setMessage(""); try { const ExcelJS = (await import("exceljs")).default; const book = new ExcelJS.Workbook(); await book.xlsx.load(await file.arrayBuffer() as never); const sheet = book.worksheets[0]; const values: string[][] = []; sheet?.eachRow({ includeEmpty: false }, (row) => { const rowValues = Array.isArray(row.values) ? row.values.slice(1).map((value) => String(value ?? "").trim()) : []; if (rowValues.some(Boolean)) values.push(rowValues); }); const indexes = new Map((values[0] ?? []).map((header, index) => [normalize(header), index])); const get = (row: string[], header: string) => row[indexes.get(normalize(header)) ?? -1] ?? ""; const parsed = values.slice(1).map((row) => ({ firstName: get(row, "Participant First Name"), lastName: get(row, "Participant Last Name"), cellNumber: get(row, "Cell Number"), salesPersonId: salesByName.get(normalize(get(row, "Sales Person"))) ?? "", commission: get(row, "Commission"), commissionNotes: get(row, "Commission Notes"), priority: get(row, "Priority"), agreementStatus: get(row, "Agreement Status"), signedAgreementLink: get(row, "Signed Agreement Link"), lastCalledOn: get(row, "Last Called On"), lastCallNotes: get(row, "Last Call Notes"), remark: get(row, "Remark"), mananSirNotes: get(row, "Manan Sir Notes"), targetLeads: get(row, "Target Leads"), targetDemo: get(row, "Target Demo"), targetProposals: get(row, "Target Proposals"), targetSales: get(row, "Target Sales") })); const result = await importAmbassadors(parsed); setMessage(result.message); if (result.ok) { setFile(null); setTimeout(() => setMode(null), 1000); } } catch { setMessage("The spreadsheet could not be read. Use the downloaded Excel template."); } finally { setPending(false); } }
  return <>
    <style>{`#ambassador-records ~ div:not([role="dialog"]) { display: none; }`}</style>
    <div id="ambassador-records">
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-100 bg-gradient-to-r from-red-50 to-white p-3">
        <div><p className="text-sm font-extrabold text-slate-900">Ambassador Management</p><p className="mt-0.5 text-xs text-slate-500">Create one Ambassador manually or import many records from the standard template.</p></div>
        <div className="flex flex-wrap gap-2"><button type="button" onClick={() => setSelecting(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-extrabold text-slate-700">Select records</button><button type="button" onClick={deleteSelected} disabled={!selectedIds.size || isDeleting} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 text-xs font-extrabold text-red-600 disabled:cursor-not-allowed disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" />{isDeleting ? "Deleting..." : `Delete selected${selectedIds.size ? ` (${selectedIds.size})` : ""}`}</button><button onClick={() => setMode("bulk")} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-extrabold text-slate-700"><Upload className="h-3.5 w-3.5" />Bulk Import</button><button onClick={() => setMode("manual")} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#d90000] px-3 text-xs font-extrabold text-white"><Plus className="h-3.5 w-3.5" />Add Ambassador</button></div>
      </div>
      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-[1900px] w-full text-left text-xs">
          <thead className="bg-slate-50 text-[10px] font-extrabold uppercase tracking-wide text-slate-500"><tr><th className="border-b border-slate-200 px-3 py-3"><input type="checkbox" aria-label="Select all Ambassador records" checked={rows.length > 0 && selectedIds.size === rows.length} onChange={toggleAll} /></th>{["Edit", "Full Name", "Cell Number", "Sales Person", "Commission", "Commission Notes", "Priority", "Agreement Status", "Signed Agreement Link", "Last Called On", "Last Call Notes", "Remark", "Manan Sir Notes", "Target Leads", "Target Demo", "Target Proposals", "Target Sales"].map((header, index) => <th key={`${header}-${index}`} className="whitespace-nowrap border-b border-slate-200 px-3 py-3">{header}</th>)}</tr></thead>
          <tbody>
            {rows.map((row) => <tr key={row.assignmentId} onDoubleClick={(event) => { if (!(event.target as HTMLElement).closest("input, select, button, a")) setDetailRecord(row); }} title="Double-click to open Ambassador details" className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50">
              <td className="px-3 py-3"><input type="checkbox" aria-label={`Select ${row.fullName}`} checked={selectedIds.has(row.assignmentId)} onChange={() => toggleSelected(row.assignmentId)} onClick={(event) => event.stopPropagation()} /></td>
              <td className="px-3 py-3"><button onClick={() => setEditing(row)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600" aria-label={`Edit ${row.fullName}`}><Pencil className="h-4 w-4" /></button></td>
              <td className="px-3 py-3 font-extrabold text-slate-800">{row.fullName}</td><td className="px-3 py-3 font-semibold text-slate-600">{row.cellNumber}</td>
              <td className="px-3 py-3"><select aria-label={`Sales Person for ${row.fullName}`} value={row.salesPersonId} onChange={(event) => saveInline(row, { salesPersonId: event.target.value })} disabled={isSavingInline} className="h-8 min-w-40 rounded border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700"><option value="">Unassigned</option>{salesPeople.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></td>
              <td className="px-3 py-3">{row.commission || "—"}</td><td className="max-w-48 truncate px-3 py-3" title={row.commissionNotes}>{row.commissionNotes || "—"}</td>
              <td className="px-3 py-3"><select aria-label={`Priority for ${row.fullName}`} value={row.priority} onChange={(event) => saveInline(row, { priority: event.target.value })} disabled={isSavingInline} className="h-8 min-w-24 rounded border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700"><option value="">None</option>{[1, 2, 3].map((priority) => <option key={priority} value={priority}>{priority}</option>)}</select></td>
              <td className="px-3 py-3"><select aria-label={`Agreement Status for ${row.fullName}`} value={row.agreementStatus} onChange={(event) => saveInline(row, { agreementStatus: event.target.value })} disabled={isSavingInline} className="h-8 min-w-40 rounded border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700"><option value="">Select status</option>{agreementStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></td>
              <td className="px-3 py-3">{row.signedAgreementLink ? <a href={row.signedAgreementLink} target="_blank" rel="noreferrer" className="font-bold text-red-600 underline">Open</a> : "—"}</td><td className="px-3 py-3">{formatDate(row.lastCalledOn || "")}</td>
              <td className="max-w-48 truncate px-3 py-3" title={row.lastCallNotes}>{row.lastCallNotes || "—"}</td><td className="max-w-48 truncate px-3 py-3" title={row.remark}>{row.remark || "—"}</td><td className="max-w-48 truncate px-3 py-3" title={row.mananSirNotes}>{row.mananSirNotes || "—"}</td>
              <td className="px-3 py-3 font-bold text-slate-700">{row.targetLeads || "0"}</td><td className="px-3 py-3 font-bold text-slate-700">{row.targetDemo || "0"}</td><td className="px-3 py-3 font-bold text-slate-700">{row.targetProposals || "0"}</td><td className="px-3 py-3 font-bold text-slate-700">{row.targetSales || "0"}</td>
            </tr>)}
            {!rows.length && <tr><td colSpan={18} className="px-4 py-12 text-center text-sm font-semibold text-slate-400">No Ambassador records yet.</td></tr>}
          </tbody>
        </table>
      </div>
      {inlineMessage && <p className={`mt-2 text-xs font-bold ${inlineMessage.includes("saved") ? "text-emerald-700" : "text-red-600"}`}>{inlineMessage}</p>}
    </div>
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-100 bg-gradient-to-r from-red-50 to-white p-3"><div><p className="text-sm font-extrabold text-slate-900">Ambassador Management</p><p className="mt-0.5 text-xs text-slate-500">Create one Ambassador manually or import many records from the standard template.</p></div><div className="flex gap-2"><button onClick={() => setMode("bulk")} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-extrabold text-slate-700"><Upload className="h-3.5 w-3.5" />Bulk Import</button><button onClick={() => setMode("manual")} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#d90000] px-3 text-xs font-extrabold text-white"><Plus className="h-3.5 w-3.5" />Add Ambassador</button></div></div>
    <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="min-w-[1900px] w-full text-left text-xs"><thead className="bg-slate-50 text-[10px] font-extrabold uppercase tracking-wide text-slate-500"><tr>{["Full Name", "Cell Number", "Sales Person", "Commission", "Commission Notes", "Priority", "Agreement Status", "Signed Agreement Link", "Last Called On", "Last Call Notes", "Remark", "Manan Sir Notes", ""].map((header) => <th key={header} className="whitespace-nowrap border-b border-slate-200 px-3 py-3">{header}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.assignmentId} className="border-b border-slate-100 last:border-0"><td className="px-3 py-3 font-extrabold text-slate-800">{row.fullName}</td><td className="px-3 py-3 font-semibold text-slate-600">{row.cellNumber}</td><td className="px-3 py-3">{salesPeople.find((person) => person.id === row.salesPersonId)?.name ?? "Unassigned"}</td><td className="px-3 py-3">{row.commission || "—"}</td><td className="max-w-48 truncate px-3 py-3" title={row.commissionNotes}>{row.commissionNotes || "—"}</td><td className="px-3 py-3">{row.priority || "—"}</td><td className="px-3 py-3">{row.agreementStatus || "—"}</td><td className="px-3 py-3">{row.signedAgreementLink ? <a href={row.signedAgreementLink} target="_blank" className="font-bold text-red-600 underline">Open</a> : "—"}</td><td className="px-3 py-3">{formatDate(row.lastCalledOn || "")}</td><td className="max-w-48 truncate px-3 py-3" title={row.lastCallNotes}>{row.lastCallNotes || "—"}</td><td className="max-w-48 truncate px-3 py-3" title={row.remark}>{row.remark || "—"}</td><td className="max-w-48 truncate px-3 py-3" title={row.mananSirNotes}>{row.mananSirNotes || "—"}</td><td className="px-3 py-3"><button onClick={() => setEditing(row)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600" aria-label={`Edit ${row.fullName}`}><Pencil className="h-4 w-4" /></button></td></tr>)}{!rows.length && <tr><td colSpan={13} className="px-4 py-12 text-center text-sm font-semibold text-slate-400">No Ambassador records yet.</td></tr>}</tbody></table></div>
    {selecting && <Modal title="Select Ambassador records" onClose={() => setSelecting(false)}><p className="mt-1 text-sm text-slate-500">Choose records to delete from the current Ambassador queue.</p><div className="mt-4 max-h-80 space-y-2 overflow-y-auto rounded-xl border border-slate-200 p-3">{rows.map((row) => <label key={row.assignmentId} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-slate-50"><input type="checkbox" checked={selectedIds.has(row.assignmentId)} onChange={() => toggleSelected(row.assignmentId)} /><span className="min-w-0"><span className="block truncate text-sm font-bold text-slate-800">{row.fullName}</span><span className="block truncate text-xs text-slate-500">{row.cellNumber} · {row.stage?.name || "Ambassador"}</span></span></label>)}{!rows.length && <p className="py-6 text-center text-sm text-slate-500">No records in this queue.</p>}</div><div className="mt-4 flex justify-between gap-2"><button type="button" onClick={toggleAll} className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-700">{selectedIds.size === rows.length && rows.length ? "Clear all" : "Select all"}</button><button type="button" onClick={() => setSelecting(false)} className="h-9 rounded-lg bg-[#d90000] px-4 text-xs font-extrabold text-white">Done ({selectedIds.size})</button></div></Modal>}
    {mode === "manual" && <Modal title="Add Ambassador" onClose={() => setMode(null)}><p className="mt-1 text-sm text-slate-500">First and Last Name are stored separately and displayed as Full Name.</p><AmbassadorForm value={emptyInput()} salesPeople={salesPeople} submitLabel="Create Ambassador" onCancel={() => setMode(null)} onSubmit={createAmbassador} /></Modal>}
    {editing && <Modal title={`Edit ${editing.fullName}`} onClose={() => setEditing(null)}><AmbassadorForm value={editing} salesPeople={salesPeople} submitLabel="Save changes" onCancel={() => setEditing(null)} onSubmit={(input) => updateAmbassadorDetails(editing.assignmentId, input)} /></Modal>}
    {mode === "bulk" && <Modal title="Bulk Import Ambassadors" onClose={() => setMode(null)}><p className="mt-1 text-sm text-slate-500">Download the template, complete the listed columns, and upload up to 500 records.</p><button type="button" onClick={downloadTemplate} className="mt-4 inline-flex items-center gap-2 text-xs font-extrabold text-red-600 underline"><Download className="h-4 w-4" />Download Excel template</button><form onSubmit={importFile} className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4"><FileSpreadsheet className="h-6 w-6 text-red-600" /><label className="mt-2 block text-xs font-bold text-slate-700">Excel file<input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="mt-2 block w-full text-xs" /></label>{message && <p className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700">{message}</p>}<div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setMode(null)} className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-xs font-bold">Cancel</button><button disabled={pending} className="h-9 rounded-lg bg-[#d90000] px-4 text-xs font-extrabold text-white disabled:opacity-60">{pending ? "Importing…" : "Import records"}</button></div></form></Modal>}
    {detailRecord && <LeadDetailPanel lead={toLeadRow(detailRecord)} columns={detailColumns} assignedNames={assignedNames} supplementalDetails={[
      { label: "Commission", value: detailRecord.commission || "—" }, { label: "Commission Notes", value: detailRecord.commissionNotes || "—" }, { label: "Priority", value: detailRecord.priority || "—" },
      { label: "Agreement Status", value: detailRecord.agreementStatus || "—" }, { label: "Signed Agreement Link", value: detailRecord.signedAgreementLink || "—" }, { label: "Last Called On", value: formatDate(detailRecord.lastCalledOn || "") },
      { label: "Last Call Notes", value: detailRecord.lastCallNotes || "—" }, { label: "Remark", value: detailRecord.remark || "—" }, { label: "Manan Sir Notes", value: detailRecord.mananSirNotes || "—" },
      { label: "Target Leads", value: detailRecord.targetLeads || "0" }, { label: "Target Demo", value: detailRecord.targetDemo || "0" }, { label: "Target Proposals", value: detailRecord.targetProposals || "0" }, { label: "Target Sales", value: detailRecord.targetSales || "0" },
    ]} detailsExtra={<AmbassadorDetailsEditor record={detailRecord} salesPeople={salesPeople} />} initialTab="details" onClose={() => setDetailRecord(null)} />}
  </>;
}
