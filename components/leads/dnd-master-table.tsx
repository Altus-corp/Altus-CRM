"use client";

import dynamic from "next/dynamic";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LeadsTable, leadMatchesSearch, type EditableConfiguration, type LeadColumn, type LeadRow } from "./leads-table";
import { deleteLeads, manuallyAssignLeads } from "@/app/dashboard/leads/actions";
import { setDndArchiveStatus } from "@/app/dashboard/dnd-master/actions";

const LeadDetailPanel = dynamic(() => import("./lead-detail-panel").then((module) => module.LeadDetailPanel), { ssr: false });

export type DndRow = { id: string; lead: LeadRow; status: string; markedBy: string; markedOn: string };
type Preferences = { order: string[]; widths: Record<string, number>; frozen: string[]; hidden: string[]; layoutVersion?: number };

export function DndMasterTable({ rows, columns, detailColumns, assignedNames, editableConfiguration, salesPersonOptions, preferences = { order: [], widths: {}, frozen: [], hidden: [] }, emptyLabel = "No Do Not Call leads yet.", reassignUsers = [], reassignDescription = "The original CRM user remains visible until an Admin or Sales Manager selects a new user.", readOnly = false, canManageLeads = false, archived = false }: { rows: DndRow[]; columns: LeadColumn[]; detailColumns?: LeadColumn[]; assignedNames: Record<string, string>; editableConfiguration?: EditableConfiguration; salesPersonOptions?: { id: string; name: string }[]; preferences?: Preferences; emptyLabel?: string; reassignUsers?: { id: string; name: string }[]; reassignDescription?: string; readOnly?: boolean; canManageLeads?: boolean; archived?: boolean }) {
  const router = useRouter();
  const [detailLead, setDetailLead] = useState<LeadRow | null>(null);
  const [selection, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const filteredRows = rows.filter((row) => leadMatchesSearch(row.lead, search));
  const visibleIds = new Set(filteredRows.map((row) => row.lead.assignment_id));
  const selectedIds = selection.filter((id) => visibleIds.has(id));
  const [isPending, startTransition] = useTransition();
  const [actionResult, setActionResult] = useState<{ ok: boolean; message: string } | null>(null);

  const reassign = (formData: FormData) => startTransition(async () => {
    setActionResult(null);
    try {
      await manuallyAssignLeads(formData);
      setSelectedIds([]);
      setActionResult({ ok: true, message: "Lead reassigned." });
    } catch (error) {
      setActionResult({ ok: false, message: error instanceof Error ? error.message : "Unable to reassign this lead." });
    }
  });

  const manageSelected = (action: "archive" | "restore" | "delete") => {
    if (!canManageLeads || readOnly || !selectedIds.length) return;
    if (selectedIds.length > 100) { setActionResult({ ok: false, message: "Select no more than 100 lead work records at a time." }); return; }
    const confirmation = action === "delete"
      ? "Permanently delete the selected leads? This removes each entire lead, all its product assignments, notes and history, including work outside DND Master. This cannot be undone."
      : action === "archive"
        ? "Archive the selected Do Not Call records? They will move to Archived. Lead data and history will be kept."
        : "Restore the selected Do Not Call records to the active DND Master list?";
    if (!window.confirm(confirmation)) return;
    const formData = new FormData();
    selectedIds.forEach((id) => formData.append("assignmentId", id));
    if (action !== "delete") formData.set("archive", String(action === "archive"));
    setActionResult(null);
    startTransition(async () => {
      try {
        const result = action === "delete" ? await deleteLeads(formData) : await setDndArchiveStatus(formData);
        setActionResult(result);
        if (result.ok) { setSelectedIds([]); setDetailLead(null); }
        router.refresh();
      } catch (error) {
        setActionResult({ ok: false, message: error instanceof Error ? error.message : "Unable to update the selected leads." });
      }
    });
  };

  return <>
    {reassignUsers.length > 0 && <form action={reassign} className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-red-100 bg-red-50/60 px-3 py-2"><div><p className="text-xs font-extrabold text-slate-800">Reassign selected lead work</p><p className="text-[10px] text-slate-500">{reassignDescription}</p></div>{selectedIds.map((assignmentId) => <input key={assignmentId} type="hidden" name="assignmentId" value={assignmentId} />)}<div className="flex items-center gap-2"><select name="assigneeId" required defaultValue="" disabled={isPending} className="h-8 min-w-[180px] rounded border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-700"><option value="" disabled>Choose sales user</option>{reassignUsers.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select><button disabled={isPending || !selectedIds.length} className="h-8 rounded bg-[#d90000] px-3 text-[11px] font-extrabold text-white disabled:cursor-not-allowed disabled:bg-slate-300">Assign selected</button></div></form>}
    {canManageLeads && !readOnly && <div aria-label="Selected lead actions" className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 py-2">
      <p role="status" className="text-xs font-extrabold text-slate-800">{selectedIds.length ? `${selectedIds.length} lead work record${selectedIds.length === 1 ? "" : "s"} selected` : "Select leads below to enable these actions"}</p>
      <div className="flex items-center gap-2">
        <button type="button" disabled={isPending || !selectedIds.length} onClick={() => manageSelected(archived ? "restore" : "archive")} className="h-8 rounded border border-slate-300 px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">{archived ? "Unarchive selected" : "Archive selected"}</button>
        <button type="button" disabled={isPending || !selectedIds.length} onClick={() => manageSelected("delete")} className="h-8 rounded bg-[#d90000] px-3 text-xs font-extrabold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50">Delete selected</button>
      </div>
    </div>}
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md bg-white p-2 shadow-[0_3px_10px_rgba(42,55,80,0.05)]">
      <label className="flex h-8 min-w-[210px] flex-1 items-center gap-2 rounded border border-slate-200 px-2.5 text-[10px] text-slate-400">
        Search
        <input type="search" aria-label="Search leads" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, email, phone, lead number..." className="w-full bg-transparent text-xs text-slate-700 outline-none" />
      </label>
      {search && <button type="button" onClick={() => setSearch("")} className="h-8 rounded border border-slate-200 px-2.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-50">Clear</button>}
      <p role="status" className="text-xs font-medium text-slate-500">{filteredRows.length} of {rows.length} shown</p>
    </div>
    <div className="mt-3"><LeadsTable columns={columns} detailColumns={detailColumns} leads={filteredRows.map((row) => row.lead)} assignedNames={assignedNames} editableConfiguration={editableConfiguration} salesPersonOptions={salesPersonOptions} preferences={preferences} selectedIds={selectedIds} onSelectionChange={!readOnly && (reassignUsers.length > 0 || canManageLeads) ? setSelectedIds : undefined} showHeader={false} readOnly={readOnly} /></div>
    <div className="hidden mt-3 overflow-x-auto rounded-md bg-white shadow-[0_3px_10px_rgba(42,55,80,0.05)]">
      <table className="w-full min-w-[900px] text-left text-xs">
        <thead className="bg-slate-50 text-[10px] font-extrabold uppercase tracking-wider text-slate-500"><tr>{["Lead No", "Name", "Phone", "Email", "Product", "Marked as", "Marked by", "Marked on", ...(reassignUsers.length ? ["Reassign"] : [])].map((heading) => <th key={heading} className="px-3 py-2.5">{heading}</th>)}</tr></thead>
        <tbody>
          {rows.map((row) => <tr key={row.id} onDoubleClick={() => setDetailLead(row.lead)} title="Double-click to open lead detail" className="cursor-pointer border-t border-slate-100 font-semibold text-slate-700 hover:bg-slate-50">
            <td className="px-3 py-2.5">{row.lead.lead_number ? `L-${row.lead.lead_number}` : "—"}</td>
            <td className="px-3 py-2.5">{[row.lead.first_name, row.lead.last_name].filter(Boolean).join(" ")}</td>
            <td className="px-3 py-2.5">{row.lead.phone ?? "—"}</td>
            <td className="px-3 py-2.5">{row.lead.email ?? "—"}</td>
            <td className="px-3 py-2.5">{row.lead.product?.[0]?.code ?? "—"}</td>
            <td className="px-3 py-2.5"><span className="rounded bg-red-50 px-2 py-1 text-[10px] font-extrabold text-red-600">{row.status}</span></td>
            <td className="px-3 py-2.5">{row.markedBy}</td>
            <td className="px-3 py-2.5">{row.markedOn}</td>
            {reassignUsers.length > 0 && <td className="px-3 py-2.5" onDoubleClick={(event) => event.stopPropagation()}><form action={reassign} className="flex items-center gap-1"><input type="hidden" name="assignmentId" value={row.lead.assignment_id} /><select name="assigneeId" defaultValue="" disabled={isPending} className="h-7 max-w-[140px] rounded border border-slate-200 bg-white px-1.5 text-[10px] font-bold"><option value="" disabled>Choose user</option>{reassignUsers.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select><button disabled={isPending} className="h-7 rounded bg-[#d90000] px-2 text-[10px] font-extrabold text-white disabled:opacity-50">Assign</button></form></td>}
          </tr>)}
          {!rows.length && <tr><td colSpan={reassignUsers.length ? 9 : 8} className="px-3 py-8 text-center text-slate-400">{emptyLabel}</td></tr>}
        </tbody>
      </table>
    </div>
    {actionResult && <p role={actionResult.ok ? "status" : "alert"} className={`mt-2 text-xs font-bold ${actionResult.ok ? "text-emerald-700" : "text-red-600"}`}>{actionResult.message}</p>}
    {detailLead && <LeadDetailPanel lead={detailLead} columns={detailColumns ?? columns} assignedNames={assignedNames} detailConfiguration={editableConfiguration} onClose={() => setDetailLead(null)} readOnly={readOnly} />}
  </>;
}
