"use client";

import { useState, useTransition, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { LeadsTable, type LeadColumn, type LeadRow } from "./leads-table";
import { createManualLead } from "@/app/dashboard/leads/actions";

type Product = { id: string; code: string; name: string };
type Stage = { id: string; product_id: string; name: string; position: number };
type ProductResolution = { product_id: string; resolution_id: string; resolution_name: string };

export function SalesLeadsWorkspace({ columns, leads, focusedLeadIds, assignedNames, preferences, products, stages, productResolutions }: { columns: LeadColumn[]; leads: LeadRow[]; focusedLeadIds: string[]; assignedNames: Record<string, string>; preferences: { order: string[]; widths: Record<string, number>; frozen: string[] }; products: Product[]; stages: Stage[]; productResolutions: ProductResolution[] }) {
  // The calling-target card links here with ?view=focused; follow the URL whenever it changes.
  const urlView = useSearchParams().get("view") === "focused" ? "focused" : "master";
  const [view, setView] = useState<"master" | "focused">(urlView);
  const [syncedUrlView, setSyncedUrlView] = useState(urlView);
  const [showAddLead, setShowAddLead] = useState(false);
  if (syncedUrlView !== urlView) { setSyncedUrlView(urlView); setView(urlView); }
  const focusedIds = new Set(focusedLeadIds);
  const displayedLeads = view === "focused" ? leads.filter((lead) => focusedIds.has(lead.assignment_id)) : leads;

  return <section className="mx-auto max-w-7xl" aria-label="Sales leads">
    <header className="border border-slate-200 bg-white px-4 py-3">
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center"><div><p className="text-[10px] font-extrabold tracking-[0.12em] text-red-600">LEADS</p><h1 className="mt-0.5 text-[19px] font-extrabold tracking-[-0.04em] text-slate-900">{view === "focused" ? "Focused leads" : "Lead Master"}</h1><p className="mt-1 text-xs text-slate-500">{view === "focused" ? "Leads assigned to you today. Tomorrow they move to Lead Master." : "All leads assigned to you, including leads from earlier days."}</p></div><span className="text-xs font-bold text-slate-500">{displayedLeads.length} records shown</span></div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <button type="button" onClick={() => setView("master")} className={`rounded border px-3 py-2 text-left transition ${view === "master" ? "border-red-200 border-b-2 border-b-red-600 bg-red-50/60" : "border-slate-200 bg-slate-50 hover:border-slate-300"}`}><p className="text-xs font-extrabold text-slate-800">Lead Master</p><p className="mt-0.5 text-[10px] text-slate-500">All assigned leads · {leads.length}</p></button>
        <button type="button" onClick={() => setView("focused")} className={`rounded border px-3 py-2 text-left transition ${view === "focused" ? "border-red-200 border-b-2 border-b-red-600 bg-red-50/60" : "border-slate-200 bg-slate-50 hover:border-slate-300"}`}><p className="text-xs font-extrabold text-slate-800">Focused Leads</p><p className="mt-0.5 text-[10px] text-slate-500">Assigned today · {focusedLeadIds.length}</p></button>
      </div>
    </header>
    <div className="mt-3"><LeadsTable columns={columns} leads={displayedLeads} assignedNames={assignedNames} preferences={preferences} editableConfiguration={{ products, stages, productResolutions }} showHeader={false} onAddLead={() => setShowAddLead(true)} /></div>
    {showAddLead && <ManualLeadModal products={products} stages={stages} onClose={() => setShowAddLead(false)} />}
  </section>;
}

function ManualLeadModal({ products, stages, onClose }: { products: Product[]; stages: Stage[]; onClose: () => void }) {
  const router = useRouter();
  const [productId, setProductId] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const selectedStages = stages.filter((stage) => stage.product_id === productId);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set("productId", productId);
    startTransition(async () => {
      const result = await createManualLead(formData);
      setMessage(result.message);
      if (result.ok) { router.refresh(); window.setTimeout(onClose, 600); }
    });
  };
  if (typeof document === "undefined") return null;
  return createPortal(<div className="fixed inset-0 z-[120] grid place-items-center bg-slate-950/35 p-4" role="dialog" aria-modal="true" aria-labelledby="manual-lead-title"><form onSubmit={submit} className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-extrabold tracking-[0.13em] text-red-600">MANUAL LEAD</p><h2 id="manual-lead-title" className="mt-1 text-xl font-extrabold text-slate-900">Add lead</h2><p className="mt-1 text-sm text-slate-500">The lead will be assigned to you and recorded in its activity trail.</p></div><button type="button" onClick={onClose} disabled={isPending} aria-label="Close" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">×</button></div><div className="mt-5 grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold text-slate-700">First name *<input required name="firstName" maxLength={120} autoFocus className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-red-400" /></label><label className="text-xs font-bold text-slate-700">Last name<input name="lastName" maxLength={120} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-red-400" /></label><label className="text-xs font-bold text-slate-700">Email<input name="email" type="email" maxLength={254} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-red-400" /></label><label className="text-xs font-bold text-slate-700">Phone<input name="phone" maxLength={30} inputMode="tel" className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-red-400" /></label><label className="text-xs font-bold text-slate-700">Product *<select required value={productId} onChange={(event) => setProductId(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-red-400"><option value="">Choose product</option>{products.map((product) => <option key={product.id} value={product.id}>{product.code} - {product.name}</option>)}</select></label><label className="text-xs font-bold text-slate-700">Stage<select name="stageId" disabled={!productId} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-red-400 disabled:bg-slate-50"><option value="">Choose stage later</option>{selectedStages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</select></label></div>{message && <p className={`mt-4 rounded-lg px-3 py-2 text-xs font-bold ${message.startsWith("Lead created") ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{message}</p>}<div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={onClose} disabled={isPending} className="h-9 rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-600">Cancel</button><button type="submit" disabled={isPending || !productId} className="h-9 rounded-lg bg-[#d90000] px-4 text-sm font-extrabold text-white disabled:opacity-50">{isPending ? "Adding..." : "Add lead"}</button></div></form></div>, document.body);
}
