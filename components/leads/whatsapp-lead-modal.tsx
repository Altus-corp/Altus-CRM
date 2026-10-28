"use client";

import { useState, useTransition, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { MessageCircle, X } from "lucide-react";
import { logWhatsappMessage } from "@/app/dashboard/leads/actions";
import { TemplatePicker } from "./template-picker";
import { renderTemplate } from "@/app/lib/message-templates";

export function WhatsappLeadModal({ leadId, assignments, initialAssignmentId, leadName, firstName, lastName, phoneDigits, onClose, onSent }: { leadId: string; assignments: { id: string; code: string }[]; initialAssignmentId: string; leadName: string; firstName: string; lastName: string | null; phoneDigits: string; onClose: () => void; onSent: () => void }) {
  const [assignmentId, setAssignmentId] = useState(initialAssignmentId);
  const product = assignments.find((assignment) => assignment.id === assignmentId)?.code ?? null;
  const [body, setBody] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = renderTemplate(body, { firstName, lastName, product });
    const url = `https://wa.me/${phoneDigits}?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noopener,noreferrer");
    startTransition(async () => {
      const formData = new FormData();
      formData.set("leadId", leadId); formData.set("assignmentId", assignmentId); formData.set("body", text);
      const result = await logWhatsappMessage(formData);
      setMessage(result.message);
      if (result.ok) { onSent(); window.setTimeout(onClose, 900); }
    });
  }

  if (typeof document === "undefined") return null;
  return createPortal(<div className="fixed inset-0 z-[110] grid place-items-center bg-slate-950/35 p-4" role="dialog" aria-modal="true" aria-label={`WhatsApp ${leadName}`}>
    <form onSubmit={submit} className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl">
      <div className="flex items-start justify-between gap-3"><div><h3 className="flex items-center gap-2 text-base font-extrabold text-slate-900"><MessageCircle className="h-4 w-4 text-emerald-500" />WhatsApp {leadName}</h3><p className="mt-1 text-xs text-slate-500">Opens WhatsApp with this message ready to send, and records it in Activity.</p></div><button type="button" onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"><X className="h-4 w-4" /></button></div>
      {assignments.length > 1 && <label className="mt-3 block text-[11px] font-bold uppercase tracking-wide text-slate-400">Product<select value={assignmentId} onChange={(event) => setAssignmentId(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-slate-800 outline-none focus:border-red-400">{assignments.map((assignment) => <option key={assignment.id} value={assignment.id}>{assignment.code}</option>)}</select></label>}
      <TemplatePicker key={assignmentId} assignmentId={assignmentId} channel="whatsapp" values={{ firstName, lastName, product }} onPick={(_subject, text) => setBody(text)} />
      <textarea value={body} onChange={(event) => setBody(event.target.value)} required maxLength={4000} placeholder="Write your message..." className="mt-3 min-h-40 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-red-400" />
      {message && <p role="status" className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">{message}</p>}
      <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={onClose} className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-600">Cancel</button><button type="submit" disabled={isPending || !body.trim()} className="h-9 rounded-lg bg-emerald-600 px-4 text-sm font-extrabold text-white hover:bg-emerald-700 disabled:opacity-50">Open WhatsApp</button></div>
    </form>
  </div>, document.body);
}
