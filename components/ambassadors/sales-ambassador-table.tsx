"use client";

import dynamic from "next/dynamic";
import { Mail, MessageCircle, PhoneCall } from "lucide-react";
import { useState, useTransition } from "react";
import { updateAmbassadorActuals } from "@/app/dashboard/my-ambassador/actions";
import type { LeadColumn, LeadRow } from "@/components/leads/leads-table";

const LeadDetailPanel = dynamic(() => import("@/components/leads/lead-detail-panel").then((module) => module.LeadDetailPanel), { ssr: false });

export type SalesAmbassadorRow = {
  assignmentId: string;
  lead: LeadRow;
  agreementStatus: string | null;
  targetLeads: number | null;
  targetDemo: number | null;
  targetProposals: number | null;
  targetSales: number | null;
  actualLeads: number | null;
  actualDemo: number | null;
  actualProposals: number | null;
  actualSales: number | null;
};

const countValue = (value: number | null) => String(value ?? 0);

export function SalesAmbassadorTable({ rows, columns, assignedNames }: { rows: SalesAmbassadorRow[]; columns: LeadColumn[]; assignedNames: Record<string, string> }) {
  const [detailLead, setDetailLead] = useState<LeadRow | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { actualLeads: string; actualDemo: string; actualProposals: string; actualSales: string }>>({});
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const draftFor = (row: SalesAmbassadorRow) => drafts[row.assignmentId] ?? {
    actualLeads: countValue(row.actualLeads), actualDemo: countValue(row.actualDemo), actualProposals: countValue(row.actualProposals), actualSales: countValue(row.actualSales),
  };
  const change = (row: SalesAmbassadorRow, field: "actualLeads" | "actualDemo" | "actualProposals" | "actualSales", value: string) => {
    setDrafts((current) => ({ ...current, [row.assignmentId]: { ...draftFor(row), [field]: value.replace(/\D/g, "") } }));
  };
  const save = (row: SalesAmbassadorRow) => startTransition(async () => {
    const result = await updateAmbassadorActuals(row.assignmentId, draftFor(row));
    setMessage(result.message);
    if (result.ok) setDrafts((current) => { const next = { ...current }; delete next[row.assignmentId]; return next; });
  });

  const headers = ["Contact", "Full Name", "Cell Number", "Agreement Status", "Target Lead", "Actual Lead", "Target Demo", "Actual Demo", "Target Proposal", "Actual Proposal", "Target Sales", "Actual Sales", ""];
  return <>
    <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="min-w-[1500px] w-full text-left text-xs">
        <thead className="bg-slate-50 text-[10px] font-extrabold uppercase tracking-wide text-slate-500"><tr>{headers.map((header, index) => <th key={`${header}-${index}`} className="whitespace-nowrap border-b border-slate-200 px-3 py-3">{header}</th>)}</tr></thead>
        <tbody>{rows.map((row) => {
          const draft = draftFor(row);
          const contact = row.lead.phone?.replace(/\D/g, "") ?? "";
          return <tr key={row.assignmentId} onDoubleClick={(event) => { if (!(event.target as HTMLElement).closest("input,button,a")) setDetailLead(row.lead); }} title="Double-click to open Ambassador detail" className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50">
            <td className="px-3 py-3"><div className="flex items-center gap-2">{contact ? <a href={`tel:${contact}`} onClick={(event) => event.stopPropagation()} title="Call" className="text-red-500 hover:text-red-700"><PhoneCall className="h-4 w-4" /></a> : <PhoneCall className="h-4 w-4 text-slate-300" />}{contact ? <a href={`https://wa.me/91${contact.slice(-10)}`} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()} title="WhatsApp" className="text-emerald-500 hover:text-emerald-700"><MessageCircle className="h-4 w-4" /></a> : null}{row.lead.email ? <a href={`mailto:${row.lead.email}`} onClick={(event) => event.stopPropagation()} title="Email" className="text-slate-500 hover:text-slate-700"><Mail className="h-4 w-4" /></a> : null}</div></td>
            <td className="px-3 py-3 font-extrabold text-slate-800">{[row.lead.first_name, row.lead.last_name].filter(Boolean).join(" ")}</td><td className="px-3 py-3 font-semibold text-slate-600">{row.lead.phone || "—"}</td><td className="px-3 py-3 font-bold text-slate-700">{row.agreementStatus || "—"}</td>
            <td className="px-3 py-3 font-bold text-slate-700">{countValue(row.targetLeads)}</td><td className="px-3 py-3"><input aria-label="Actual Lead" value={draft.actualLeads} onChange={(event) => change(row, "actualLeads", event.target.value)} inputMode="numeric" className="h-8 w-20 rounded border border-slate-200 px-2 font-bold text-slate-700 outline-none focus:border-red-400" /></td>
            <td className="px-3 py-3 font-bold text-slate-700">{countValue(row.targetDemo)}</td><td className="px-3 py-3"><input aria-label="Actual Demo" value={draft.actualDemo} onChange={(event) => change(row, "actualDemo", event.target.value)} inputMode="numeric" className="h-8 w-20 rounded border border-slate-200 px-2 font-bold text-slate-700 outline-none focus:border-red-400" /></td>
            <td className="px-3 py-3 font-bold text-slate-700">{countValue(row.targetProposals)}</td><td className="px-3 py-3"><input aria-label="Actual Proposal" value={draft.actualProposals} onChange={(event) => change(row, "actualProposals", event.target.value)} inputMode="numeric" className="h-8 w-20 rounded border border-slate-200 px-2 font-bold text-slate-700 outline-none focus:border-red-400" /></td>
            <td className="px-3 py-3 font-bold text-slate-700">{countValue(row.targetSales)}</td><td className="px-3 py-3"><input aria-label="Actual Sales" value={draft.actualSales} onChange={(event) => change(row, "actualSales", event.target.value)} inputMode="numeric" className="h-8 w-20 rounded border border-slate-200 px-2 font-bold text-slate-700 outline-none focus:border-red-400" /></td>
            <td className="px-3 py-3"><button type="button" disabled={isPending} onClick={() => save(row)} className="h-8 rounded bg-[#d90000] px-3 text-[11px] font-extrabold text-white disabled:opacity-50">Save</button></td>
          </tr>;
        })}{!rows.length && <tr><td colSpan={13} className="px-4 py-12 text-center text-sm font-semibold text-slate-400">No Ambassadors assigned to you yet.</td></tr>}</tbody>
      </table>
    </div>
    {message && <p className={`mt-2 text-xs font-bold ${message === "Actuals saved." ? "text-emerald-700" : "text-red-600"}`}>{message}</p>}
    {detailLead && <LeadDetailPanel lead={detailLead} columns={columns} assignedNames={assignedNames} onClose={() => setDetailLead(null)} />}
  </>;
}
