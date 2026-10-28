"use client";

import { useState, useTransition } from "react";
import { createLeadActivity } from "@/app/dashboard/leads/actions";

export const LEAD_ACTIVITY_OPTIONS = [
  { value: "call", label: "Call" },
  { value: "video_call", label: "Video call" },
  { value: "offline_meeting", label: "Offline meeting" },
  { value: "whatsapp_message", label: "WhatsApp message" },
  { value: "online_demo", label: "Online demo" },
  { value: "offline_demo", label: "Offline demo" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "online_meeting", label: "Online meeting" },
] as const;

export function ActivityColumn({ leadId, assignmentId }: { leadId: string; assignmentId: string }) {
  const [selected, setSelected] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function record(activityType: string) {
    if (!activityType) return;
    setSelected(activityType);
    setMessage("");
    startTransition(async () => {
      const formData = new FormData();
      formData.set("leadId", leadId);
      formData.set("assignmentId", assignmentId);
      formData.set("activityType", activityType);
      try {
        await createLeadActivity(formData);
        setMessage("Saved");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Unable to save activity.");
      }
    });
  }

  return <div className="relative min-w-[170px]"><select aria-label="Add lead activity" value={selected} disabled={isPending} onChange={(event) => record(event.target.value)} className="h-8 w-full rounded border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 outline-none focus:border-red-400 disabled:bg-slate-50"><option value="">Add activity</option>{LEAD_ACTIVITY_OPTIONS.map((activity) => <option key={activity.value} value={activity.value}>{activity.label}</option>)}</select>{message && <span className={`absolute left-0 top-9 z-20 whitespace-nowrap rounded border bg-white px-2 py-1 text-[9px] font-bold shadow ${message === "Saved" ? "border-emerald-200 text-emerald-700" : "border-red-200 text-red-600"}`}>{message}</span>}</div>;
}
