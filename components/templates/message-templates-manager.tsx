"use client";

import { useState, useTransition, type FormEvent } from "react";
import { deleteMessageTemplate, saveMessageTemplate } from "@/app/dashboard/message-templates/actions";
import { templateVariables, type MessageTemplate } from "@/app/lib/message-templates";

type Product = { id: string; code: string; name: string };
type Stage = { id: string; product_id: string; name: string };
type Channel = "email" | "whatsapp";

const inputClass = "mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:border-red-400";

export function MessageTemplatesManager({ products, stages, templates, userId, isAdmin }: { products: Product[]; stages: Stage[]; templates: MessageTemplate[]; userId: string; isAdmin: boolean }) {
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [channel, setChannel] = useState<Channel>("email");
  const [editing, setEditing] = useState<MessageTemplate | "new" | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const productStages = stages.filter((stage) => stage.product_id === productId);
  const visible = templates.filter((template) => template.product_id === productId && template.channel === channel);
  const editingTemplate = editing && editing !== "new" ? editing : null;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set("productId", productId); formData.set("channel", channel); formData.set("id", editingTemplate?.id ?? "");
    startTransition(async () => { const result = await saveMessageTemplate(formData); setMessage({ ok: result.ok, text: result.message }); if (result.ok) setEditing(null); });
  }

  function remove(template: MessageTemplate) {
    if (!window.confirm(`Delete the template "${template.name}"?`)) return;
    const formData = new FormData();
    formData.set("id", template.id);
    startTransition(async () => { const result = await deleteMessageTemplate(formData); setMessage({ ok: result.ok, text: result.message }); });
  }

  return <section className="mx-auto max-w-4xl">
    <header><p className="text-[10px] font-extrabold tracking-[0.12em] text-red-600">SALES</p><h1 className="mt-0.5 text-[22px] font-extrabold tracking-[-0.04em] text-slate-900">Message templates</h1><p className="mt-1 text-xs text-slate-500">Create the email and WhatsApp templates for each product, optionally for a specific stage. They appear when you email or WhatsApp a lead on that product.</p></header>
    <div className="mt-4 flex flex-wrap items-center gap-2 rounded-md bg-white p-2 shadow-[0_3px_10px_rgba(42,55,80,0.05)]">
      <select value={productId} onChange={(event) => { setProductId(event.target.value); setEditing(null); }} aria-label="Product" className="h-8 rounded border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-700">{products.map((product) => <option key={product.id} value={product.id}>{product.code} - {product.name}</option>)}</select>
      <div className="flex overflow-hidden rounded border border-slate-200" role="group" aria-label="Channel">{(["email", "whatsapp"] as Channel[]).map((item) => <button key={item} type="button" onClick={() => { setChannel(item); setEditing(null); }} className={`h-8 px-3 text-[11px] font-extrabold ${channel === item ? "bg-[#d90000] text-white" : "text-slate-600 hover:bg-slate-50"}`}>{item === "email" ? "Email" : "WhatsApp"}</button>)}</div>
      <button type="button" onClick={() => { setEditing("new"); setMessage(null); }} disabled={!productId} className="ml-auto h-8 rounded border border-red-200 bg-red-50 px-3 text-[11px] font-extrabold text-red-600 hover:bg-red-100 disabled:opacity-50">+ New template</button>
    </div>
    {message && <p role="status" className={`mt-3 rounded-lg px-3 py-2 text-xs font-bold ${message.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{message.text}</p>}
    {editing && <form key={editingTemplate?.id ?? "new"} onSubmit={submit} className="mt-3 rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-extrabold text-slate-900">{editingTemplate ? "Edit template" : "New template"} - {channel === "email" ? "Email" : "WhatsApp"}</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Template name<input name="name" required maxLength={100} defaultValue={editingTemplate?.name ?? ""} placeholder="Template 1" className={inputClass} /></label>
        <label className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Use at stage<select name="stageId" defaultValue={editingTemplate?.stage_id ?? ""} className={inputClass}><option value="">Any stage</option>{productStages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</select></label>
      </div>
      {channel === "email" && <label className="mt-3 block text-[11px] font-bold uppercase tracking-wide text-slate-400">Subject<input name="subject" required maxLength={200} defaultValue={editingTemplate?.subject ?? ""} className={inputClass} /></label>}
      <label className="mt-3 block text-[11px] font-bold uppercase tracking-wide text-slate-400">Message<textarea name="body" required maxLength={10000} defaultValue={editingTemplate?.body ?? ""} className="mt-1 min-h-40 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-red-400" /></label>
      <p className="mt-2 text-[11px] text-slate-500">Variables filled in for each lead (short forms like {"{{firstname}}"} also work): {templateVariables.map((variable) => <code key={variable} className="mr-1.5 rounded bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-700">{`{{${variable}}}`}</code>)}</p>
      <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={() => setEditing(null)} className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-600">Cancel</button><button type="submit" disabled={isPending} className="h-9 rounded-lg bg-[#d90000] px-4 text-sm font-extrabold text-white hover:bg-red-700 disabled:opacity-60">{isPending ? "Saving..." : "Save template"}</button></div>
    </form>}
    <div className="mt-3 space-y-3">
      {visible.map((template) => <article key={template.id} className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><h3 className="text-sm font-extrabold text-slate-800">{template.name}</h3><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{template.stage_name ?? "Any stage"}</span></div>
          {(isAdmin || template.created_by === userId || !template.created_by) && <div className="flex gap-1.5"><button type="button" onClick={() => { setEditing(template); setMessage(null); }} className="h-7 rounded border border-slate-200 px-2.5 text-[11px] font-bold text-slate-600 hover:bg-slate-50">Edit</button>{(isAdmin || template.created_by === userId) && <button type="button" onClick={() => remove(template)} disabled={isPending} className="h-7 rounded border border-red-200 px-2.5 text-[11px] font-bold text-red-600 hover:bg-red-50 disabled:opacity-50">Delete</button>}</div>}</div>
        {template.subject && <p className="mt-2 text-xs font-bold text-slate-600">Subject: {template.subject}</p>}
        <pre className="mt-2 whitespace-pre-wrap font-sans text-sm leading-6 text-slate-600">{template.body}</pre>
      </article>)}
      {!visible.length && <p className="rounded-lg border border-dashed border-slate-300 bg-white px-3 py-6 text-center text-xs text-slate-500">No {channel === "email" ? "email" : "WhatsApp"} templates for this product yet.</p>}
    </div>
  </section>;
}
