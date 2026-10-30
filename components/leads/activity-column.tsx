"use client";

import { useState, useTransition, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { createLeadActivity } from "@/app/dashboard/leads/actions";

export const LEAD_ACTIVITY_OPTIONS = [
  { value: "offline_meeting", label: "Offline meeting" },
  { value: "online_meeting", label: "Online meeting" },
] as const;

export function ActivityColumn({ leadId, assignmentId }: { leadId: string; assignmentId: string }) {
  const [selected, setSelected] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const selectedLabel = LEAD_ACTIVITY_OPTIONS.find((activity) => activity.value === selected)?.label ?? "Meeting";

  function close() {
    if (isPending) return;
    setSelected("");
    setNote("");
    setMessage("");
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedNote = note.trim();
    if (!trimmedNote) { setMessage("Add a meeting note."); return; }
    setMessage("");
    startTransition(async () => {
      const formData = new FormData();
      formData.set("leadId", leadId);
      formData.set("assignmentId", assignmentId);
      formData.set("activityType", selected);
      formData.set("note", trimmedNote);
      try {
        await createLeadActivity(formData);
        close();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Unable to save activity.");
      }
    });
  }

  return <>
    <div className="relative min-w-[170px]"><select aria-label="Add lead activity" value={selected} disabled={isPending} onChange={(event) => { setSelected(event.target.value); setNote(""); setMessage(""); }} className="h-8 w-full rounded border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 outline-none focus:border-red-400 disabled:bg-slate-50"><option value="">Add activity</option>{LEAD_ACTIVITY_OPTIONS.map((activity) => <option key={activity.value} value={activity.value}>{activity.label}</option>)}</select></div>
    {selected && typeof document !== "undefined" && createPortal(<div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-label={`Record ${selectedLabel}`}>
      <form onSubmit={save} className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"><p className="text-[11px] font-extrabold tracking-[0.12em] text-red-600">LEAD ACTIVITY</p><h3 className="mt-1 text-lg font-extrabold text-slate-900">Record {selectedLabel}</h3><p className="mt-1 text-sm text-slate-500">Add a note so this meeting is useful in the lead activity history.</p><label className="mt-4 block text-sm font-bold text-slate-700">Meeting note<textarea autoFocus value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} required rows={4} placeholder="What was discussed, outcome, or next action?" className="mt-1.5 w-full resize-none rounded-lg border border-slate-200 p-3 text-sm font-medium outline-none focus:border-red-400" /></label>{message && <p className="mt-2 text-xs font-bold text-red-600">{message}</p>}<div className="mt-4 flex justify-end gap-2"><button type="button" onClick={close} disabled={isPending} className="h-9 rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-600">Cancel</button><button disabled={isPending} className="h-9 rounded-lg bg-red-600 px-4 text-sm font-extrabold text-white disabled:opacity-60">{isPending ? "Saving..." : "Save activity"}</button></div></form>
    </div>, document.body)}
  </>;
}