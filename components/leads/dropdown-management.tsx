"use client";

import { useState } from "react";
import { createStageDropdown, createStageDropdownOption, deleteStageDropdown, deleteStageDropdownOption, renameStageDropdown } from "@/app/dashboard/lead-settings/actions";
import { displayProductCode, displayProductLabel } from "@/app/lib/product-display";

type Product = { id: string; code: string; name: string };
type Stage = { id: string; product_id: string; name: string; position: number };
export type StageDropdown = { id: string; product_id: string; stage_id: string; label: string; position: number; options: { id: string; label: string; position: number }[] };

const inputClass = "h-9 min-w-0 flex-1 rounded-md border border-slate-200 px-3 text-xs outline-none focus:border-red-400";
const addButtonClass = "rounded-md bg-[#d90000] px-3 text-xs font-extrabold text-white";

export function DropdownManagement({ products, stages, dropdowns }: { products: Product[]; stages: Stage[]; dropdowns: StageDropdown[] }) {
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const productStages = stages.filter((stage) => stage.product_id === productId).sort((a, b) => a.position - b.position);
  const [stageChoice, setStageChoice] = useState("");
  const stage = productStages.find((item) => item.id === stageChoice) ?? productStages[0];
  const stageDropdowns = stage ? dropdowns.filter((dropdown) => dropdown.stage_id === stage.id).sort((a, b) => a.position - b.position) : [];
  const [renaming, setRenaming] = useState<StageDropdown | null>(null);
  const [error, setError] = useState("");
  const product = products.find((item) => item.id === productId);

  if (!product) return <p className="rounded-xl bg-white p-5 text-sm font-semibold text-slate-500">Add your first product to manage its dropdowns.</p>;

  // Server actions throw plain errors for bad input; show them here instead of crashing the page.
  const run = (action: (formData: FormData) => Promise<void>, after?: () => void) => async (formData: FormData) => {
    setError("");
    try { await action(formData); after?.(); }
    catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Unable to save this change."); }
  };

  return <section className="rounded-[20px] border border-slate-100 bg-white p-4 shadow-[0_8px_24px_rgba(42,55,80,0.06)] lg:p-5">
    <header className="flex flex-col justify-between gap-4 border-b border-slate-100 pb-4 sm:flex-row sm:items-start">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-[14px] bg-red-50 text-xl text-red-600">▾</span>
        <div>
          <p className="text-xs font-extrabold tracking-[0.08em] text-red-600">{displayProductCode(product.code)}</p>
          <h2 className="mt-0.5 text-[21px] font-extrabold tracking-[-0.04em] text-slate-900">Dropdown management</h2>
          <p className="mt-0.5 text-xs font-medium text-slate-500">Create dropdowns for a product stage and add the options users can pick. They appear as columns on that stage.</p>
        </div>
      </div>
      <div className="flex gap-2">
        <select value={productId} onChange={(event) => { setProductId(event.target.value); setStageChoice(""); }} aria-label="Product" className="h-9 rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none focus:border-red-400">
          {products.map((item) => <option key={item.id} value={item.id}>{displayProductLabel(item)}</option>)}
        </select>
        <select value={stage?.id ?? ""} onChange={(event) => setStageChoice(event.target.value)} disabled={!productStages.length} aria-label="Stage" className="h-9 rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none focus:border-red-400 disabled:bg-slate-50">
          {productStages.length ? productStages.map((item) => <option key={item.id} value={item.id}>{item.name}</option>) : <option value="">No stages</option>}
        </select>
      </div>
    </header>

    {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-700" role="alert">{error}</p>}

    {!stage ? <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">{displayProductCode(product.code)} has no stages yet. Add stages under Product management first.</p> : <>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {stageDropdowns.map((dropdown) => <article key={dropdown.id} className="rounded-xl border border-slate-100 bg-white p-3.5">
          <div className="flex items-center justify-between gap-2 rounded-lg bg-red-50 px-3 py-2.5">
            <div className="min-w-0"><h3 className="truncate text-sm font-extrabold text-slate-900">{dropdown.label}</h3><p className="text-xs font-medium text-slate-500">{dropdown.options.length} option{dropdown.options.length === 1 ? "" : "s"}</p></div>
            <div className="flex gap-1.5">
              <button type="button" title="Rename dropdown" aria-label={`Rename ${dropdown.label}`} onClick={() => setRenaming(dropdown)} className="grid h-7 w-7 place-items-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-100"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg></button>
              <form action={run(deleteStageDropdown)} onSubmit={(event) => { if (!window.confirm(`Delete "${dropdown.label}" and every choice users made in it?`)) event.preventDefault(); }}><input type="hidden" name="dropdownId" value={dropdown.id} /><button title="Delete dropdown" aria-label={`Delete ${dropdown.label}`} className="grid h-7 w-7 place-items-center rounded-md border border-red-100 bg-white text-sm text-red-500 hover:bg-red-50">⌫</button></form>
            </div>
          </div>
          <div className="mt-3 flex min-h-[60px] content-start flex-wrap gap-1.5">
            {dropdown.options.length ? [...dropdown.options].sort((a, b) => a.position - b.position).map((option) => <form key={option.id} action={run(deleteStageDropdownOption)}><input type="hidden" name="optionId" value={option.id} /><button title={`Remove ${option.label}`} className="rounded-full bg-red-50 px-2.5 py-1.5 text-xs font-extrabold text-red-600 hover:bg-red-100">{option.label} <span className="ml-1 text-red-400">×</span></button></form>) : <p className="text-xs font-semibold text-slate-400">No options yet. Add the first one below.</p>}
          </div>
          <form key={`${dropdown.id}:${dropdown.options.length}`} action={run(createStageDropdownOption)} className="mt-3 flex gap-2 border-t border-slate-100 pt-3"><input type="hidden" name="dropdownId" value={dropdown.id} /><input name="label" required maxLength={100} placeholder="Enter new option" className={inputClass} /><button className={addButtonClass}>＋ Add option</button></form>
        </article>)}
        {!stageDropdowns.length && <p className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-xs font-semibold text-slate-400 lg:col-span-2">No dropdowns for {displayProductCode(product.code)} › {stage.name} yet.</p>}
      </div>

      <form key={`${stage.id}:${stageDropdowns.length}`} action={run(createStageDropdown)} className="mt-4 flex gap-2 border-t border-slate-100 pt-4"><input type="hidden" name="stageId" value={stage.id} /><input name="label" required maxLength={80} placeholder={`New dropdown for ${stage.name} (e.g. Confirmation Call Status)`} className={inputClass} /><button className={addButtonClass}>＋ Add dropdown</button></form>
    </>}

    {renaming && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-labelledby="rename-dropdown-title">
      <form action={run(renameStageDropdown, () => setRenaming(null))} className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
        <input type="hidden" name="dropdownId" value={renaming.id} />
        <h3 id="rename-dropdown-title" className="text-lg font-extrabold text-slate-900">Rename dropdown</h3>
        <label className="mt-4 block text-sm font-bold text-slate-700">Dropdown name
          <input name="label" defaultValue={renaming.label} autoFocus required maxLength={80} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100" />
        </label>
        <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4">
          <button type="button" onClick={() => setRenaming(null)} className="h-9 rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-600 hover:bg-slate-50">Cancel</button>
          <button className="h-9 rounded-lg bg-[#d90000] px-4 text-sm font-extrabold text-white hover:bg-red-700">Save changes</button>
        </div>
      </form>
    </div>}
  </section>;
}
