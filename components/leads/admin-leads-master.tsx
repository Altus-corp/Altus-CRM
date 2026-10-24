"use client";

import { useState } from "react";
import { LeadsTable, type LeadColumn, type LeadRow } from "./leads-table";
import { AdminLeadImport } from "./admin-lead-import";
import { manuallyAssignLeads } from "@/app/dashboard/leads/actions";

type Product = { id: string; code: string; name: string };
type Stage = { id: string; product_id: string; name: string; position: number };

export function AdminLeadsMaster({ columns, sampleColumns, leads, assignedNames, assignmentUsers, preferences, databaseCounts, products, stages }: { columns: LeadColumn[]; sampleColumns: { label: string; field_key: string; computed_from?: string[] }[]; leads: LeadRow[]; assignedNames: Record<string, string>; assignmentUsers: { id: string; name: string }[]; preferences: { order: string[]; widths: Record<string, number>; frozen: string[] }; databaseCounts: { databaseLeads: number; referenceLeads: number; qualifiedLeads: number; leads: number }; products: Product[]; stages: Stage[] }) {
  const [search, setSearch] = useState("");
  const [productId, setProductId] = useState("");
  const [stageId, setStageId] = useState("");
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const selectableStages = productId ? stages.filter((stage) => stage.product_id === productId) : stages;
  const filteredLeads = leads.filter((lead) => {
    const productCode = lead.product?.[0]?.code ?? "";
    const stageName = lead.stage?.[0]?.name ?? "";
    const term = search.trim().toLowerCase();
    const searchMatch = !term || [lead.first_name, lead.last_name, lead.email, lead.phone, productCode, stageName].filter(Boolean).join(" ").toLowerCase().includes(term);
    const productMatch = !productId || products.find((product) => product.id === productId)?.code === productCode;
    const stageMatch = !stageId || stages.find((stage) => stage.id === stageId)?.name === stageName;
    return searchMatch && productMatch && stageMatch;
  });

  return <section className="mx-auto max-w-[1500px]">
    <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p className="text-[10px] font-extrabold tracking-[0.12em] text-red-600">LEADS</p><h1 className="mt-0.5 text-[22px] font-extrabold tracking-[-0.04em] text-slate-900">Leads Master</h1></div><AdminLeadImport sampleColumns={sampleColumns} /></header>
    <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Database Leads" value={databaseCounts.databaseLeads} hint="All time" tone="orange" /><Metric label="Reference Leads" value={databaseCounts.referenceLeads} hint="All time" tone="blue" /><Metric label="Qualified Leads" value={databaseCounts.qualifiedLeads} hint="All time" tone="purple" /><Metric label="Leads" value={databaseCounts.leads} hint="All time" tone="red" /></div>
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md bg-white p-2 shadow-[0_3px_10px_rgba(42,55,80,0.05)]"><label className="flex h-8 min-w-[210px] flex-1 items-center gap-2 rounded border border-slate-200 px-2.5 text-[10px] text-slate-400">Search <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, email, phone..." className="w-full outline-none" /></label><select value={productId} onChange={(event) => { setProductId(event.target.value); setStageId(""); }} className="h-8 max-w-[210px] rounded border border-slate-200 bg-white px-2.5 text-[10px] font-semibold text-slate-600"><option value="">All products</option>{products.map((product) => <option key={product.id} value={product.id}>{product.code} - {product.name}</option>)}</select><select value={stageId} onChange={(event) => setStageId(event.target.value)} className="h-8 max-w-[180px] rounded border border-slate-200 bg-white px-2.5 text-[10px] font-semibold text-slate-600"><option value="">All stages</option>{selectableStages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</select><button type="button" onClick={() => { setSearch(""); setProductId(""); setStageId(""); }} className="h-8 rounded border border-slate-200 px-2.5 text-[10px] font-semibold text-slate-600">Reset</button></div>
    <form action={async (formData) => { await manuallyAssignLeads(formData); setSelectedLeadIds([]); }} className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-red-100 bg-red-50/60 px-3 py-2"><div><p className="text-xs font-extrabold text-slate-800">Manual assignment for today</p><p className="text-[10px] text-slate-500">{selectedLeadIds.length ? `${selectedLeadIds.length} lead${selectedLeadIds.length === 1 ? "" : "s"} selected` : "Select leads from the table, then choose a sales user."}</p></div>{selectedLeadIds.map((leadId) => <input key={leadId} type="hidden" name="leadId" value={leadId} />)}<div className="flex items-center gap-2"><select name="assigneeId" required defaultValue="" className="h-8 min-w-[180px] rounded border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-700"><option value="" disabled>Choose sales user</option>{assignmentUsers.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select><button disabled={!selectedLeadIds.length || !assignmentUsers.length} className="h-8 rounded bg-[#d90000] px-3 text-[11px] font-extrabold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-slate-300">Assign selected</button></div></form>
    <div className="mt-3"><LeadsTable columns={columns} leads={filteredLeads} assignedNames={assignedNames} preferences={preferences} selectedIds={selectedLeadIds} onSelectionChange={setSelectedLeadIds} showHeader={false} /></div>
  </section>;
}

function Metric({ label, value, hint, tone }: { label: string; value: number; hint: string; tone: "red" | "blue" | "purple" | "orange" }) { const color = { red: "border-red-200", blue: "border-blue-200", purple: "border-violet-200", orange: "border-orange-200" }; return <div className={`rounded-md border-l-2 bg-white p-3 shadow-[0_3px_10px_rgba(42,55,80,0.05)] ${color[tone]}`}><p className="text-[10px] font-bold text-slate-500">{label}</p><p className="mt-1 text-xl font-extrabold leading-none text-slate-900">{value.toLocaleString("en-IN")}</p><p className="mt-1 text-[9px] font-medium text-slate-400">{hint}</p></div>; }
