"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  createLeadProduct,
  createLeadResolution,
  createLeadStage,
  deleteLeadProductResolution,
  deleteLeadStage,
  updateLeadStage,
} from "@/app/dashboard/lead-settings/actions";

type Product = { id: string; code: string; name: string };
type Stage = { id: string; product_id: string; name: string; position: number };
type ProductResolution = { id: string; product_id: string; resolution_id: string; resolution_name: string; next_stage_id: string | null; requires_follow_up: boolean; follow_up_after_hours: number | null; closes_lead: boolean };

export function LeadConfiguration({ products, stages, resolutions }: { products: Product[]; stages: Stage[]; resolutions: ProductResolution[] }) {
  const [selectedProductId, setSelectedProductId] = useState(products[0]?.id ?? "");
  const [editingStage, setEditingStage] = useState<Stage | null>(null);
  const [stageName, setStageName] = useState("");
  const [showCreateProduct, setShowCreateProduct] = useState(false);
  const selectedProduct = products.find((product) => product.id === selectedProductId);
  const productStages = stages.filter((stage) => stage.product_id === selectedProductId);
  const productResolutions = resolutions.filter((resolution) => resolution.product_id === selectedProductId);

  if (!selectedProduct) return <><section className="rounded-[20px] border border-slate-100 bg-white p-8 text-center shadow-[0_8px_24px_rgba(42,55,80,0.06)]"><p className="text-[11px] font-extrabold tracking-[0.12em] text-red-600">PRODUCT MANAGEMENT</p><h2 className="mt-1 text-xl font-extrabold text-slate-900">Create your first product</h2><p className="mt-2 text-sm text-slate-500">Create a product, then add its stages and call resolutions here.</p><button type="button" onClick={() => setShowCreateProduct(true)} className="mt-5 h-9 rounded-md bg-[#d90000] px-4 text-xs font-extrabold text-white hover:bg-red-700">+ Add product</button></section>{showCreateProduct && <CreateProductModal onClose={() => setShowCreateProduct(false)} onCreated={(product) => { setSelectedProductId(product.id); setShowCreateProduct(false); }} />}</>;

  return (
    <section className="rounded-[20px] border border-slate-100 bg-white p-4 shadow-[0_8px_24px_rgba(42,55,80,0.06)] lg:p-5">
      <header className="flex flex-col justify-between gap-4 border-b border-slate-100 pb-4 sm:flex-row sm:items-start">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-[14px] bg-red-50 text-xl text-red-600">⚙</span>
          <div>
            <p className="text-xs font-extrabold tracking-[0.08em] text-red-600">{selectedProduct.code}</p>
            <h2 className="mt-0.5 text-[21px] font-extrabold tracking-[-0.04em] text-slate-900">{selectedProduct.name}</h2>
            <p className="mt-0.5 text-xs font-medium text-slate-500">Manage call stages and call resolutions for this product.</p>
          </div>
        </div>
        <select value={selectedProductId} onChange={(event) => setSelectedProductId(event.target.value)} className="h-9 rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none focus:border-red-400">
          {products.map((product) => <option key={product.id} value={product.id}>{product.code} — {product.name}</option>)}
        </select>
        <button type="button" onClick={() => setShowCreateProduct(true)} className="h-9 rounded-md bg-[#d90000] px-3 text-xs font-extrabold text-white hover:bg-red-700">+ Add product</button>
      </header>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <article className="rounded-xl border border-slate-100 bg-white p-3.5">
          <div className="flex items-center justify-between rounded-lg bg-red-50 px-3 py-2.5">
            <div className="flex items-center gap-2.5"><span className="grid h-8 w-8 place-items-center rounded-full bg-red-100 text-red-600">◈</span><div><h3 className="text-sm font-extrabold text-slate-900">Stages</h3><p className="text-xs font-medium text-slate-500">Define the process stages.</p></div></div>
            <span className="rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-extrabold text-red-700">{productStages.length} Stages</span>
          </div>
          <div className="mt-3 space-y-1.5">
            {productStages.map((stage) => (
              <div key={stage.id} className="flex min-h-11 items-center gap-3 rounded-lg bg-slate-50 px-3">
                <span className="text-slate-400">⠿</span><span className="grid h-6 w-6 place-items-center rounded-full bg-slate-200 text-xs font-extrabold text-slate-600">{stage.position}</span><span className="flex-1 text-xs font-bold text-slate-700">{stage.name}</span>
                <button
                  type="button"
                  title="Edit stage"
                  aria-label={`Edit ${stage.name}`}
                  onClick={() => {
                    setEditingStage(stage);
                    setStageName(stage.name);
                  }}
                  className="grid h-7 w-7 place-items-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-100"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                </button>
                <form action={deleteLeadStage}><input type="hidden" name="stageId" value={stage.id} /><button title="Delete stage" className="grid h-7 w-7 place-items-center rounded-md border border-red-100 text-sm text-red-500 hover:bg-red-50">⌫</button></form>
              </div>
            ))}
          </div>
          <form action={createLeadStage} className="mt-4 flex gap-2 border-t border-slate-100 pt-3"><input type="hidden" name="productId" value={selectedProduct.id} /><input name="name" required placeholder="Enter new stage name" className="h-9 min-w-0 flex-1 rounded-md border border-slate-200 px-3 text-xs outline-none focus:border-red-400" /><button className="rounded-md bg-[#d90000] px-3 text-xs font-extrabold text-white">＋ Add stage</button></form>
        </article>

        <article className="rounded-xl border border-slate-100 bg-white p-3.5">
          <div className="flex items-center justify-between rounded-lg bg-red-50 px-3 py-2.5">
            <div className="flex items-center gap-2.5"><span className="grid h-8 w-8 place-items-center rounded-full bg-red-100 text-red-600">⌕</span><div><h3 className="text-sm font-extrabold text-slate-900">Call resolutions</h3><p className="text-xs font-medium text-slate-500">Add reasons for call outcomes.</p></div></div>
            <span className="rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-extrabold text-red-700">{productResolutions.length} Resolutions</span>
          </div>
          <div className="mt-3 flex min-h-[132px] content-start flex-wrap gap-1.5">
            {productResolutions.map((resolution) => <form key={resolution.id} action={deleteLeadProductResolution}><input type="hidden" name="productResolutionId" value={resolution.id} /><button title={`Remove ${resolution.resolution_name}`} className="rounded-full bg-red-50 px-2.5 py-1.5 text-xs font-extrabold text-red-600 hover:bg-red-100">{resolution.resolution_name} <span className="ml-1 text-red-400">×</span></button></form>)}
          </div>
          <form action={createLeadResolution} className="mt-4 flex gap-2 border-t border-slate-100 pt-3"><input type="hidden" name="productId" value={selectedProduct.id} /><input name="name" required placeholder="Enter new resolution" className="h-9 min-w-0 flex-1 rounded-md border border-slate-200 px-3 text-xs outline-none focus:border-red-400" /><button className="rounded-md bg-[#d90000] px-3 text-xs font-extrabold text-white">＋ Add resolution</button></form>
        </article>
      </div>

      {editingStage && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-labelledby="edit-stage-title">
          <form
            action={async (formData) => {
              await updateLeadStage(formData);
              setEditingStage(null);
            }}
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"
          >
            <input type="hidden" name="stageId" value={editingStage.id} />
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-extrabold tracking-[0.12em] text-red-600">LEAD STAGE</p>
                <h3 id="edit-stage-title" className="mt-1 text-lg font-extrabold text-slate-900">Edit stage</h3>
                <p className="mt-1 text-sm text-slate-500">Update the name of this process stage.</p>
              </div>
              <button type="button" onClick={() => setEditingStage(null)} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100">×</button>
            </div>
            <label className="mt-5 block text-sm font-bold text-slate-700">
              Stage name
              <input name="name" value={stageName} onChange={(event) => setStageName(event.target.value)} autoFocus required className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100" />
            </label>
            <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button type="button" onClick={() => setEditingStage(null)} className="h-9 rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-600 hover:bg-slate-50">Cancel</button>
              <button className="h-9 rounded-lg bg-[#d90000] px-4 text-sm font-extrabold text-white hover:bg-red-700">Save changes</button>
            </div>
          </form>
        </div>
      )}

      {showCreateProduct && <CreateProductModal onClose={() => setShowCreateProduct(false)} onCreated={(product) => { setSelectedProductId(product.id); setShowCreateProduct(false); }} />}

    </section>
  );
}

function CreateProductModal({ onClose, onCreated }: { onClose: () => void; onCreated: (product: Product) => void }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      try {
        const product = await createLeadProduct(new FormData(event.currentTarget));
        onCreated(product);
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Unable to create product.");
      }
    });
  }

  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-labelledby="create-product-title">
    <form onSubmit={submit} className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
      <div className="flex items-start justify-between gap-4"><div><p className="text-[11px] font-extrabold tracking-[0.12em] text-red-600">PRODUCT MANAGEMENT</p><h3 id="create-product-title" className="mt-1 text-lg font-extrabold text-slate-900">Add product</h3><p className="mt-1 text-sm text-slate-500">Create the product, then add its stages and call resolutions from this screen.</p></div><button type="button" onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100">×</button></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2"><label className="text-sm font-bold text-slate-700">Product code<input name="code" required maxLength={20} autoFocus placeholder="e.g. PSO" className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-red-400" /></label><label className="text-sm font-bold text-slate-700">Product name<input name="name" required maxLength={160} placeholder="Product name" className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-red-400" /></label></div>
      {message && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{message}</p>}
      <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={onClose} disabled={isPending} className="h-9 rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-600 hover:bg-slate-50">Cancel</button><button disabled={isPending} className="h-9 rounded-lg bg-[#d90000] px-4 text-sm font-extrabold text-white hover:bg-red-700 disabled:opacity-60">{isPending ? "Creating..." : "Create product"}</button></div>
    </form>
  </div>;
}
