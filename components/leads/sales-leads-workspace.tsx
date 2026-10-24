"use client";

import { useState } from "react";
import { LeadsTable, type LeadColumn, type LeadRow } from "./leads-table";

type Product = { id: string; code: string; name: string };
type Stage = { id: string; product_id: string; name: string; position: number };
type ProductResolution = { product_id: string; resolution_id: string; resolution_name: string };

export function SalesLeadsWorkspace({ columns, leads, focusedLeadIds, assignedNames, preferences, products, stages, productResolutions }: { columns: LeadColumn[]; leads: LeadRow[]; focusedLeadIds: string[]; assignedNames: Record<string, string>; preferences: { order: string[]; widths: Record<string, number>; frozen: string[] }; products: Product[]; stages: Stage[]; productResolutions: ProductResolution[] }) {
  const [view, setView] = useState<"master" | "focused">("master");
  const focusedIds = new Set(focusedLeadIds);
  const displayedLeads = view === "focused" ? leads.filter((lead) => focusedIds.has(lead.id)) : leads;

  return <section className="mx-auto max-w-7xl" aria-label="Sales leads">
    <header className="border border-slate-200 bg-white px-4 py-3">
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center"><div><p className="text-[10px] font-extrabold tracking-[0.12em] text-red-600">LEADS</p><h1 className="mt-0.5 text-[19px] font-extrabold tracking-[-0.04em] text-slate-900">{view === "focused" ? "Focused leads" : "Lead Master"}</h1><p className="mt-1 text-xs text-slate-500">{view === "focused" ? "Leads assigned to you today. Tomorrow they move to Lead Master." : "All leads assigned to you, including leads from earlier days."}</p></div><span className="text-xs font-bold text-slate-500">{displayedLeads.length} records shown</span></div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <button type="button" onClick={() => setView("master")} className={`rounded border px-3 py-2 text-left transition ${view === "master" ? "border-red-200 border-b-2 border-b-red-600 bg-red-50/60" : "border-slate-200 bg-slate-50 hover:border-slate-300"}`}><p className="text-xs font-extrabold text-slate-800">Lead Master</p><p className="mt-0.5 text-[10px] text-slate-500">All assigned leads · {leads.length}</p></button>
        <button type="button" onClick={() => setView("focused")} className={`rounded border px-3 py-2 text-left transition ${view === "focused" ? "border-red-200 border-b-2 border-b-red-600 bg-red-50/60" : "border-slate-200 bg-slate-50 hover:border-slate-300"}`}><p className="text-xs font-extrabold text-slate-800">Focused Leads</p><p className="mt-0.5 text-[10px] text-slate-500">Assigned today · {focusedLeadIds.length}</p></button>
      </div>
    </header>
    <div className="mt-3"><LeadsTable columns={columns} leads={displayedLeads} assignedNames={assignedNames} preferences={preferences} editableConfiguration={{ products, stages, productResolutions }} showHeader={false} /></div>
  </section>;
}
