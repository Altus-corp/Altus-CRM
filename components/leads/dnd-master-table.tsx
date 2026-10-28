"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import type { LeadColumn, LeadRow } from "./leads-table";

const LeadDetailPanel = dynamic(() => import("./lead-detail-panel").then((module) => module.LeadDetailPanel), { ssr: false });

export type DndRow = { id: string; lead: LeadRow; status: string; markedBy: string; markedOn: string };

export function DndMasterTable({ rows, columns, assignedNames }: { rows: DndRow[]; columns: LeadColumn[]; assignedNames: Record<string, string> }) {
  const [detailLead, setDetailLead] = useState<LeadRow | null>(null);

  return <>
    <div className="mt-3 overflow-x-auto rounded-md bg-white shadow-[0_3px_10px_rgba(42,55,80,0.05)]">
      <table className="w-full min-w-[900px] text-left text-xs">
        <thead className="bg-slate-50 text-[10px] font-extrabold uppercase tracking-wider text-slate-500"><tr>{["Lead No", "Name", "Phone", "Email", "Product", "Marked as", "Marked by", "Marked on"].map((heading) => <th key={heading} className="px-3 py-2.5">{heading}</th>)}</tr></thead>
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
          </tr>)}
          {!rows.length && <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-400">No DND or Not Interested leads yet.</td></tr>}
        </tbody>
      </table>
    </div>
    {detailLead && <LeadDetailPanel lead={detailLead} columns={columns} assignedNames={assignedNames} onClose={() => setDetailLead(null)} />}
  </>;
}
