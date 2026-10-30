"use client";

import dynamic from "next/dynamic";
import { useState, useTransition } from "react";
import { LeadsTable, type LeadColumn, type LeadRow } from "./leads-table";
import { manuallyAssignLeads } from "@/app/dashboard/leads/actions";

const LeadDetailPanel = dynamic(() => import("./lead-detail-panel").then((module) => module.LeadDetailPanel), { ssr: false });

export type DndRow = { id: string; lead: LeadRow; status: string; markedBy: string; markedOn: string };
type Preferences = { order: string[]; widths: Record<string, number>; frozen: string[]; hidden: string[]; layoutVersion?: number };

export function DndMasterTable({ rows, columns, assignedNames, preferences = { order: [], widths: {}, frozen: [], hidden: [] }, emptyLabel = "No Do Not Call leads yet.", reassignUsers = [] }: { rows: DndRow[]; columns: LeadColumn[]; assignedNames: Record<string, string>; preferences?: Preferences; emptyLabel?: string; reassignUsers?: { id: string; name: string }[] }) {
  const [detailLead, setDetailLead] = useState<LeadRow | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();
  const [assignmentMessage, setAssignmentMessage] = useState("");

  const reassign = (formData: FormData) => startTransition(async () => {
    setAssignmentMessage("");
    try {
      await manuallyAssignLeads(formData);
      setSelectedIds([]);
      setAssignmentMessage("Lead reassigned.");
    } catch (error) {
      setAssignmentMessage(error instanceof Error ? error.message : "Unable to reassign this lead.");
    }
  });

  return <>
    {reassignUsers.length > 0 && <form action={reassign} className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-red-100 bg-red-50/60 px-3 py-2"><div><p className="text-xs font-extrabold text-slate-800">Reassign selected lead work</p><p className="text-[10px] text-slate-500">The original CRM user remains visible until an Admin or Sales Manager selects a new user.</p></div>{selectedIds.map((assignmentId) => <input key={assignmentId} type="hidden" name="assignmentId" value={assignmentId} />)}<div className="flex items-center gap-2"><select name="assigneeId" required defaultValue="" disabled={isPending} className="h-8 min-w-[180px] rounded border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-700"><option value="" disabled>Choose sales user</option>{reassignUsers.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select><button disabled={isPending || !selectedIds.length} className="h-8 rounded bg-[#d90000] px-3 text-[11px] font-extrabold text-white disabled:cursor-not-allowed disabled:bg-slate-300">Assign selected</button></div></form>}
    <div className="mt-3"><LeadsTable columns={columns} leads={rows.map((row) => row.lead)} assignedNames={assignedNames} preferences={preferences} selectedIds={selectedIds} onSelectionChange={reassignUsers.length ? setSelectedIds : undefined} showHeader={false} /></div>
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
    {assignmentMessage && <p className={`mt-2 text-xs font-bold ${assignmentMessage === "Lead reassigned." ? "text-emerald-700" : "text-red-600"}`}>{assignmentMessage}</p>}
    {detailLead && <LeadDetailPanel lead={detailLead} columns={columns} assignedNames={assignedNames} onClose={() => setDetailLead(null)} />}
  </>;
}
