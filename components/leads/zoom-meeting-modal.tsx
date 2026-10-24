"use client";

import { useState, useTransition, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, Video, X } from "lucide-react";
import { scheduleLeadZoomMeeting } from "@/app/dashboard/leads/actions";

export function ZoomMeetingModal({ leadId, leadName, onClose, onScheduled }: { leadId: string; leadName: string; onClose: () => void; onScheduled: () => void }) {
  const [topic, setTopic] = useState(`Meeting with ${leadName}`);
  const [agenda, setAgenda] = useState("");
  const [startTime, setStartTime] = useState("");
  const [duration, setDuration] = useState("30");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const formData = new FormData();
      formData.set("leadId", leadId); formData.set("topic", topic); formData.set("agenda", agenda); formData.set("startTime", startTime); formData.set("duration", duration);
      const result = await scheduleLeadZoomMeeting(formData);
      setMessage(result.message);
      if (result.ok) { onScheduled(); window.setTimeout(onClose, 900); }
    });
  }
  if (typeof document === "undefined") return null;
  return createPortal(<div className="fixed inset-0 z-[110] grid place-items-center bg-slate-950/35 p-4" role="dialog" aria-modal="true" aria-labelledby="zoom-meeting-title"><form onSubmit={submit} className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-extrabold tracking-[0.13em] text-red-600">VIDEO MEETING</p><h2 id="zoom-meeting-title" className="mt-1 text-xl font-extrabold text-slate-900">Schedule Zoom meeting</h2><p className="mt-1 text-sm text-slate-500">The invite and Zoom link will be emailed to this lead.</p></div><button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button></div><label className="mt-5 block text-xs font-bold text-slate-700">Meeting title<input required maxLength={200} value={topic} onChange={(event) => setTopic(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-red-400" /></label><label className="mt-3 block text-xs font-bold text-slate-700">Description<textarea maxLength={2000} value={agenda} onChange={(event) => setAgenda(event.target.value)} placeholder="Purpose or agenda for the meeting" className="mt-1.5 min-h-20 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-red-400" /></label><div className="mt-3 grid gap-3 sm:grid-cols-[1fr_130px]"><label className="block text-xs font-bold text-slate-700">Date and time<div className="relative mt-1.5"><CalendarDays className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" /><input required type="datetime-local" value={startTime} onChange={(event) => setStartTime(event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-red-400" /></div></label><label className="block text-xs font-bold text-slate-700">Minutes<input required min="5" max="480" type="number" value={duration} onChange={(event) => setDuration(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-red-400" /></label></div>{message && <p className={`mt-4 rounded-lg px-3 py-2 text-xs font-bold ${message.includes("created") || message.includes("sent") ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{message}</p>}<div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={onClose} disabled={isPending} className="h-9 rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-600">Cancel</button><button type="submit" disabled={isPending} className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#d90000] px-4 text-sm font-extrabold text-white disabled:opacity-50"><Video className="h-4 w-4" />{isPending ? "Creating..." : "Create and send invite"}</button></div></form></div>, document.body);
}
