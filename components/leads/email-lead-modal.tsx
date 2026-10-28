"use client";

import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Mail, X } from "lucide-react";
import { sendEmailToLead } from "@/app/dashboard/leads/actions";
import { TemplatePicker } from "./template-picker";
import { renderTemplate } from "@/app/lib/message-templates";

export function EmailLeadModal({ leadId, assignments, initialAssignmentId, leadName, firstName, lastName, email, onClose, onSent }: { leadId: string; assignments: { id: string; code: string }[]; initialAssignmentId: string; leadName: string; firstName: string; lastName: string | null; email: string; onClose: () => void; onSent: () => void }) {
  const [assignmentId, setAssignmentId] = useState(initialAssignmentId);
  const product = assignments.find((assignment) => assignment.id === assignmentId)?.code ?? null;
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const formData = new FormData();
      formData.set("leadId", leadId); formData.set("assignmentId", assignmentId); formData.set("subject", renderTemplate(subject, { firstName, lastName, product })); formData.set("body", renderTemplate(body, { firstName, lastName, product }));
      const result = await sendEmailToLead(formData);
      setMessage({ ok: result.ok, text: result.message });
      if (result.ok) { onSent(); window.setTimeout(onClose, 900); }
    });
  }

  if (typeof document === "undefined") return null;
  return createPortal(<div className="fixed inset-0 z-[110] grid place-items-center bg-slate-950/35 p-4" role="dialog" aria-modal="true" aria-label={`Email ${leadName}`}>
    <form onSubmit={submit} className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl">
      <div className="flex items-start justify-between gap-3"><div><h3 className="flex items-center gap-2 text-base font-extrabold text-slate-900"><Mail className="h-4 w-4 text-red-600" />Email {leadName}</h3><p className="mt-1 text-xs text-slate-500">To: {email}. Sent from your own mailbox.</p></div><button type="button" onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"><X className="h-4 w-4" /></button></div>
      {assignments.length > 1 && <label className="mt-3 block text-[11px] font-bold uppercase tracking-wide text-slate-400">Product<select value={assignmentId} onChange={(event) => setAssignmentId(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-slate-800 outline-none focus:border-red-400">{assignments.map((assignment) => <option key={assignment.id} value={assignment.id}>{assignment.code}</option>)}</select></label>}
      <TemplatePicker key={assignmentId} assignmentId={assignmentId} channel="email" values={{ firstName, lastName, product }} onPick={(templateSubject, templateBody) => { setSubject(templateSubject); setBody(templateBody); }} />
      <input value={subject} onChange={(event) => setSubject(event.target.value)} required maxLength={200} placeholder="Subject" className="mt-3 h-9 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-red-400" />
      <textarea value={body} onChange={(event) => setBody(event.target.value)} required maxLength={10000} placeholder="Write your message..." className="mt-3 min-h-40 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-red-400" />
      {message && <p role="status" className={`mt-3 rounded-lg px-3 py-2 text-xs font-bold ${message.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{message.text} {!message.ok && message.text.includes("Settings") && <Link href="/dashboard/settings" className="underline">Open Settings</Link>}</p>}
      <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={onClose} className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-600">Cancel</button><button type="submit" disabled={isPending || !subject.trim() || !body.trim()} className="h-9 rounded-lg bg-[#d90000] px-4 text-sm font-extrabold text-white hover:bg-red-700 disabled:opacity-50">{isPending ? "Sending..." : "Send email"}</button></div>
    </form>
  </div>, document.body);
}
