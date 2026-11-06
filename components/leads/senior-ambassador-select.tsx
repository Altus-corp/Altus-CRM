"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { saveLeadSeniorAmbassador } from "@/app/dashboard/leads/actions";

export function SeniorAmbassadorSelect({ leadId, assignmentId, selected, options, onSaved }: {
  leadId: string;
  assignmentId: string;
  selected?: { id: string; name: string } | null;
  options: { id: string; name: string }[];
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(selected?.id ?? "");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const close = () => { if (!pending) setOpen(false); };

  const save = () => startTransition(async () => {
    const form = new FormData();
    form.set("leadId", leadId);
    form.set("assignmentId", assignmentId);
    form.set("seniorAmbassadorId", draft);
    try {
      const result = await saveLeadSeniorAmbassador(form);
      if (!result.ok) { setError(result.message); return; }
      onSaved();
      setOpen(false);
    } catch {
      setError("Senior Ambassador could not be saved. Please retry.");
    }
  });

  return <>
    <button type="button" aria-label="Select Senior Ambassador" title={selected?.name || "Select Senior Ambassador"} onClick={(event) => { event.stopPropagation(); setDraft(selected?.id ?? ""); setError(""); setOpen(true); }} onDoubleClick={(event) => event.stopPropagation()} className="inline-flex max-w-full items-center gap-2 text-left font-semibold text-slate-700 hover:text-red-700"><span className="truncate">{selected?.name || "Select Senior Ambassador"}</span><span aria-hidden="true">v</span></button>
    {open && createPortal(<div className="fixed inset-0 z-[150] grid place-items-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-labelledby={`senior-ambassador-title-${leadId}`} onClick={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()}>
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl"><h2 id={`senior-ambassador-title-${leadId}`} className="text-lg font-bold text-slate-900">Senior Ambassador</h2><p className="mt-1 text-sm text-slate-500">Choose the Ambassador who referred this lead.</p>
        <select value={draft} disabled={pending} onChange={(event) => setDraft(event.target.value)} className="mt-4 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-red-400"><option value="">No Senior Ambassador</option>{options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select>
        {!options.length && <p className="mt-2 text-xs font-semibold text-amber-700">No active Ambassadors are available.</p>}
        {error && <p role="alert" className="mt-3 text-xs text-red-700">{error}</p>}
        <div className="mt-4 flex justify-end gap-2"><button type="button" disabled={pending} onClick={close} className="rounded-lg border px-3 py-2 text-sm font-bold text-slate-600">Cancel</button><button type="button" disabled={pending} onClick={save} className="rounded-lg bg-red-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-60">{pending ? "Saving..." : "Save"}</button></div>
      </div>
    </div>, document.body)}
  </>;
}
