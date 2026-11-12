"use client";

import dynamic from "next/dynamic";
import { Mail, MessageCircle, PhoneCall, X } from "lucide-react";
import { useState, useTransition } from "react";
import { getAmbassadorActualBreakdown, updateAmbassadorActuals, type AmbassadorActualBreakdownItem, type AmbassadorActualMetric } from "@/app/dashboard/my-ambassador/actions";
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
  assignedTo: string | null;
  canEditActualSales: boolean;
};

const countValue = (value: number | null) => String(value ?? 0);

export function SalesAmbassadorTable({ rows, columns, assignedNames, showSalesPerson = false }: { rows: SalesAmbassadorRow[]; columns: LeadColumn[]; assignedNames: Record<string, string>; showSalesPerson?: boolean }) {
  const [detailLead, setDetailLead] = useState<LeadRow | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { actualSales: string }>>({});
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const [breakdown, setBreakdown] = useState<{ metric: AmbassadorActualMetric; items: AmbassadorActualBreakdownItem[]; error: string } | null>(null);
  const draftFor = (row: SalesAmbassadorRow) => drafts[row.assignmentId] ?? {
    actualSales: countValue(row.actualSales),
  };
  const change = (row: SalesAmbassadorRow, field: "actualSales", value: string) => {
    setDrafts((current) => ({ ...current, [row.assignmentId]: { ...draftFor(row), [field]: value.replace(/\D/g, "") } }));
  };
  const save = (row: SalesAmbassadorRow) => startTransition(async () => {
    const result = await updateAmbassadorActuals(row.assignmentId, draftFor(row));
    setMessage(result.message);
    if (result.ok) setDrafts((current) => { const next = { ...current }; delete next[row.assignmentId]; return next; });
  });
  const showBreakdown = (row: SalesAmbassadorRow, metric: AmbassadorActualMetric) => startTransition(async () => {
    setBreakdown({ metric, items: [], error: "" });
    const result = await getAmbassadorActualBreakdown(row.assignmentId, metric);
    setBreakdown({ metric, items: result.items, error: result.ok ? "" : result.message || "Unable to load details." });
  });
  const metricTitle: Record<AmbassadorActualMetric, string> = { leads: "Actual Leads", demo: "Actual Demos", proposals: "Actual Proposals" };

  const headers = ["Contact", "Full Name", ...(showSalesPerson ? ["Sales Person"] : []), "Cell Number", "Agreement Status", "Target Lead", "Actual Lead", "Target Demo", "Actual Demo", "Target Proposal", "Actual Proposal", "Target Sales", "Actual Sales", ""];
  return <>
    <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="min-w-[1500px] w-full text-left text-xs">
        <thead className="bg-slate-50 text-[10px] font-extrabold uppercase tracking-wide text-slate-500"><tr>{headers.map((header, index) => <th key={`${header}-${index}`} className="whitespace-nowrap border-b border-slate-200 px-3 py-3">{header}</th>)}</tr></thead>
        <tbody>{rows.map((row) => {
          const draft = draftFor(row);
          const contact = row.lead.phone?.replace(/\D/g, "") ?? "";
          return <tr key={row.assignmentId} onDoubleClick={(event) => { if (!(event.target as HTMLElement).closest("input,button,a")) setDetailLead(row.lead); }} title="Double-click to open Ambassador detail" className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50">
            <td className="px-3 py-3"><div className="flex items-center gap-2">{contact ? <a href={`tel:${contact}`} onClick={(event) => event.stopPropagation()} title="Call" className="text-red-500 hover:text-red-700"><PhoneCall className="h-4 w-4" /></a> : <PhoneCall className="h-4 w-4 text-slate-300" />}{contact ? <a href={`https://wa.me/91${contact.slice(-10)}`} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()} title="WhatsApp" className="text-emerald-500 hover:text-emerald-700"><MessageCircle className="h-4 w-4" /></a> : null}{row.lead.email ? <a href={`mailto:${row.lead.email}`} onClick={(event) => event.stopPropagation()} title="Email" className="text-slate-500 hover:text-slate-700"><Mail className="h-4 w-4" /></a> : null}</div></td>
            <td className="px-3 py-3 font-extrabold text-slate-800">{[row.lead.first_name, row.lead.last_name].filter(Boolean).join(" ")}</td>{showSalesPerson && <td className="px-3 py-3 font-semibold text-slate-600">{row.assignedTo ? assignedNames[row.assignedTo] || "Unavailable user" : "Unassigned"}</td>}<td className="px-3 py-3 font-semibold text-slate-600">{row.lead.phone || "—"}</td><td className="px-3 py-3 font-bold text-slate-700">{row.agreementStatus || "—"}</td>
            <td className="px-3 py-3 font-bold text-slate-700">{countValue(row.targetLeads)}</td><td className="px-3 py-3"><button type="button" onClick={(event) => { event.stopPropagation(); showBreakdown(row, "leads"); }} className="rounded px-1 font-extrabold text-slate-800 underline decoration-slate-300 underline-offset-4 hover:text-red-600" title="View leads counted for this Ambassador">{countValue(row.actualLeads)}</button></td>
            <td className="px-3 py-3 font-bold text-slate-700">{countValue(row.targetDemo)}</td><td className="px-3 py-3"><button type="button" onClick={(event) => { event.stopPropagation(); showBreakdown(row, "demo"); }} className="rounded px-1 font-extrabold text-slate-800 underline decoration-slate-300 underline-offset-4 hover:text-red-600" title="View demo outcomes counted for this Ambassador">{countValue(row.actualDemo)}</button></td>
            <td className="px-3 py-3 font-bold text-slate-700">{countValue(row.targetProposals)}</td><td className="px-3 py-3"><button type="button" onClick={(event) => { event.stopPropagation(); showBreakdown(row, "proposals"); }} className="rounded px-1 font-extrabold text-slate-800 underline decoration-slate-300 underline-offset-4 hover:text-red-600" title="View proposal outcomes counted for this Ambassador">{countValue(row.actualProposals)}</button></td>
            <td className="px-3 py-3 font-bold text-slate-700">{countValue(row.targetSales)}</td><td className="px-3 py-3">{row.canEditActualSales ? <input aria-label="Actual Sales" value={draft.actualSales} onChange={(event) => change(row, "actualSales", event.target.value)} inputMode="numeric" className="h-8 w-20 rounded border border-slate-200 px-2 font-bold text-slate-700 outline-none focus:border-red-400" /> : <span className="font-bold text-slate-700">{countValue(row.actualSales)}</span>}</td>
            <td className="px-3 py-3">{row.canEditActualSales ? <button type="button" disabled={isPending} onClick={() => save(row)} className="h-8 rounded bg-[#d90000] px-3 text-[11px] font-extrabold text-white disabled:opacity-50">Save</button> : <span className="text-[10px] font-semibold text-slate-400">Team member</span>}</td>
          </tr>;
        })}{!rows.length && <tr><td colSpan={headers.length} className="px-4 py-12 text-center text-sm font-semibold text-slate-400">No Ambassadors assigned to you yet.</td></tr>}</tbody>
      </table>
    </div>
    {message && <p className={`mt-2 text-xs font-bold ${message === "Actuals saved." ? "text-emerald-700" : "text-red-600"}`}>{message}</p>}
    {detailLead && <LeadDetailPanel lead={detailLead} columns={columns} assignedNames={assignedNames} onClose={() => setDetailLead(null)} />}
    {breakdown && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-4" role="dialog" aria-modal="true" aria-label={metricTitle[breakdown.metric]}>
      <div className="max-h-[80vh] w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4"><div><h2 className="text-lg font-extrabold text-slate-900">{metricTitle[breakdown.metric]}</h2><p className="mt-1 text-sm text-slate-500">Leads currently counted for this Ambassador.</p></div><button type="button" onClick={() => setBreakdown(null)} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Close"><X className="h-5 w-5" /></button></div>
        <div className="max-h-[60vh] overflow-auto p-5">
          {isPending && !breakdown.error && !breakdown.items.length ? <p className="py-8 text-center text-sm font-semibold text-slate-500">Loading details…</p> : null}
          {breakdown.error ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">{breakdown.error}</p> : null}
          {!isPending && !breakdown.error && !breakdown.items.length ? <p className="py-8 text-center text-sm font-semibold text-slate-500">No qualifying leads yet.</p> : null}
          {breakdown.items.length ? <table className="min-w-full text-left text-sm"><thead className="sticky top-0 bg-slate-50 text-[11px] font-extrabold uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-2">Lead</th><th className="px-3 py-2">Cell Number</th><th className="px-3 py-2">Email</th>{breakdown.metric !== "leads" ? <><th className="px-3 py-2">Product</th><th className="px-3 py-2">Resolution</th></> : null}</tr></thead><tbody>{breakdown.items.map((item) => <tr key={item.id} className="border-t border-slate-100"><td className="px-3 py-3 font-bold text-slate-800">{item.fullName}</td><td className="px-3 py-3 text-slate-600">{item.cellNumber || "—"}</td><td className="px-3 py-3 text-slate-600">{item.email || "—"}</td>{breakdown.metric !== "leads" ? <><td className="px-3 py-3 text-slate-600">{item.product || "—"}</td><td className="px-3 py-3 font-semibold text-slate-700">{item.resolution || "—"}</td></> : null}</tr>)}</tbody></table> : null}
        </div>
      </div>
    </div>}
  </>;
}
