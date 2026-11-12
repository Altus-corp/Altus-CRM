"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Clock3, Mail, MapPin, MessageCircle, PhoneCall, UserRound, Video, X } from "lucide-react";
import { formatCrmDate } from "@/app/lib/date";
import { isChannelPartnerColumn, isSeniorAmbassadorColumn } from "@/app/lib/channel-partner";
import { completeLeadDetailColumns, storedDetailValue } from "@/app/lib/lead-detail-fields";
import { attachTranscriptToProduct, createLeadNote, syncLeadCallTranscripts, syncLeadTranscriptByCallId, updateLeadDetails, updateLeadFollowUp } from "@/app/dashboard/leads/actions";
import type { LeadColumn, LeadRow } from "./leads-table";
import { ZoomMeetingModal } from "./zoom-meeting-modal";
import { GoogleMeetModal } from "./google-meet-modal";
import { EmailLeadModal } from "./email-lead-modal";
import { WhatsappLeadModal } from "./whatsapp-lead-modal";

type Activity = { id: string; activity_type: string; note: string | null; follow_up_at: string | null; created_at: string; metadata: Record<string, unknown> | null; actor?: string | null };
type Tab = "activity" | "details" | "notes" | "follow-up" | "transcript";

const activityLabels: Record<string, string> = { lead_created: "Lead added", assigned: "Lead assigned", product_added: "Product added", product_transferred: "Transferred to product", product_transfer_completed: "Product transfer completed", transcript_attached: "Transcript attached", details_updated: "Details updated", product_updated: "Product updated", stage_updated: "Stage updated", resolution_updated: "Call resolution updated", follow_up_scheduled: "Follow-up scheduled", follow_up_rescheduled: "Follow-up date updated", call_transcript_synced: "Call transcript saved", zoom_meeting_scheduled: "Zoom meeting scheduled", zoom_transcript_received: "Zoom transcript received", note: "Note added", call: "Call", video_call: "Video call", offline_meeting: "Offline meeting", whatsapp_message: "WhatsApp message", online_demo: "Online demo", offline_demo: "Offline demo", linkedin: "LinkedIn", online_meeting: "Online meeting", email: "Email" };

export function LeadDetailPanel({ lead, columns, assignedNames, onClose, supplementalDetails = [], detailsExtra, initialTab = "activity", readOnly = false }: { lead: LeadRow; columns: LeadColumn[]; assignedNames: Record<string, string>; onClose: () => void; supplementalDetails?: { label: string; value: string }[]; detailsExtra?: React.ReactNode; initialTab?: Tab; readOnly?: boolean }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState(lead.assignment_id);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [activityVersion, setActivityVersion] = useState(0);
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [followUpAt, setFollowUpAt] = useState(lead.next_follow_up_at);
  const [showZoomModal, setShowZoomModal] = useState(false);
  const [showGoogleMeetModal, setShowGoogleMeetModal] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showWhatsappModal, setShowWhatsappModal] = useState(false);
  const [isDialling, setIsDialling] = useState(false);
  const [dialMessage, setDialMessage] = useState("");
  const [leaving, setLeaving] = useState(false);
  const name = [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Unnamed lead";
  const phoneDigits = lead.phone?.replace(/\D/g, "") ?? "";
  const detailAssignments = lead.detail_product_assignments ?? lead.product_assignments;
  const selectedAssignment = detailAssignments.find((assignment) => assignment.id === selectedAssignmentId) ?? detailAssignments[0];
  const scopedLead: LeadRow = { ...lead, assignment_id: selectedAssignment?.id ?? lead.assignment_id, assigned_to: selectedAssignment?.assigned_to ?? lead.assigned_to, assigned_at: selectedAssignment?.assigned_at ?? lead.assigned_at, next_follow_up_at: selectedAssignment?.next_follow_up_at ?? lead.next_follow_up_at, product: selectedAssignment?.product ? [selectedAssignment.product] : lead.product, stage: selectedAssignment?.stage ? [selectedAssignment.stage] : lead.stage, resolution: selectedAssignment?.resolution ? [selectedAssignment.resolution] : lead.resolution };
  const scopedAssignedName = scopedLead.assigned_to ? assignedNames[scopedLead.assigned_to] : undefined;

  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  });

  useEffect(() => {
    let active = true;
    fetch(`/api/leads/${lead.id}/activities?assignmentId=${encodeURIComponent(scopedLead.assignment_id)}`, { cache: "no-store" })
      .then(async (response) => response.json() as Promise<{ ok?: boolean; activities?: Activity[] }>)
      .then((data) => { if (active && data.ok) setActivities(data.activities ?? []); })
      .catch(() => undefined)
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [lead.id, scopedLead.assignment_id, activityVersion]);

  useEffect(() => {
    if (readOnly) return;
    let active = true;
    const formData = new FormData();
    formData.set("leadId", lead.id);
    formData.set("assignmentId", scopedLead.assignment_id);
    syncLeadCallTranscripts(formData)
      .then((result) => { if (active && result.ok) setActivityVersion((version) => version + 1); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [lead.id, scopedLead.assignment_id, readOnly]);

  useEffect(() => {
    if (readOnly) return;
    let active = true;
    fetch(`/api/leads/${lead.id}/transcripts`, { cache: "no-store" })
      .then((response) => response.json() as Promise<{ ok?: boolean; transcripts?: Transcript[] }>)
      .then((result) => { if (active && result.ok) setTranscripts(result.transcripts ?? []); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [lead.id, activityVersion, readOnly]);
  const unassignedCount = transcripts.filter((item) => !item.lead_product_assignment_id).length;
  const visibleTabs: Tab[] = readOnly ? ["activity", "details"] : ["activity", "details", "notes", "follow-up", "transcript"];

  function close() { if (leaving) return; setLeaving(true); window.setTimeout(onClose, 220); }
  async function startDial() {
    if (!lead.phone || isDialling) return;
    setIsDialling(true); setDialMessage("");
    try {
      const response = await fetch("/api/altus-contacts/dial", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ leadId: lead.id, assignmentId: scopedLead.assignment_id, number: lead.phone }) });
      const result = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error || "Unable to start the call.");
      setDialMessage("Call requested in Altus Contacts.");
      setActivityVersion((version) => version + 1);
    } catch (error) { setDialMessage(error instanceof Error ? error.message : "Unable to start the call."); }
    finally { setIsDialling(false); }
  }

  return <div className={`fixed inset-0 z-[70] flex justify-end bg-slate-950/20 transition-opacity duration-200 ${leaving ? "opacity-0" : "opacity-100"}`} role="dialog" aria-modal="true" aria-label={`Lead details for ${name}`}>
    <aside className={`h-full w-full max-w-none overflow-y-auto bg-[#fbfcfe] shadow-[-14px_0_35px_rgba(15,23,42,0.16)] transition-transform duration-200 ease-out ${leaving ? "translate-x-full" : "translate-x-0"}`}>
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white px-5 pb-0 pt-4">
        <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-extrabold tracking-[0.14em] text-red-600">LEAD DETAIL</p><div className="mt-1 flex flex-wrap items-center gap-3"><h2 className="text-[25px] font-extrabold tracking-[-0.04em] text-slate-900">{name}</h2>{!readOnly && <>{lead.phone && <button type="button" onClick={startDial} disabled={isDialling} title={dialMessage || "Call with Altus Contacts"} className="text-red-400 hover:text-red-600 disabled:opacity-50">{isDialling ? <span className="text-xs font-extrabold">...</span> : <PhoneCall className="h-4 w-4" />}</button>}{lead.email && <button type="button" onClick={() => setShowEmailModal(true)} title="Send email" className="text-slate-500 hover:text-slate-700"><Mail className="h-4 w-4" /></button>}{phoneDigits && <button type="button" onClick={() => setShowWhatsappModal(true)} title="Send WhatsApp message" className="text-emerald-500 hover:text-emerald-700"><MessageCircle className="h-4 w-4" /></button>}<button type="button" onClick={() => setShowZoomModal(true)} title="Schedule Zoom meeting" className="text-slate-400 hover:text-red-600"><Video className="h-4 w-4" /></button><button type="button" onClick={() => setShowGoogleMeetModal(true)} title="Schedule Google Meet" className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] font-extrabold text-blue-600 hover:bg-blue-50">G</button><button type="button" onClick={() => setTab("follow-up")} title="Set follow-up date" className="text-slate-400 hover:text-red-600"><CalendarDays className="h-4 w-4" /></button></>}</div>{readOnly && <p className="mt-1 text-[10px] font-bold text-slate-500">Viewing a team member&apos;s lead. Editing is disabled.</p>}{dialMessage && <p className={`mt-1 text-[10px] font-bold ${dialMessage.startsWith("Call requested") ? "text-emerald-600" : "text-red-600"}`}>{dialMessage}</p>}</div><button type="button" onClick={close} aria-label="Close lead detail" className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"><X className="h-4 w-4" /></button></div>
        <nav className="mt-4 flex gap-6" aria-label="Lead detail sections">{visibleTabs.map((item) => <button key={item} type="button" onClick={() => setTab(item)} className={`border-b-2 pb-2.5 text-[13px] font-bold capitalize ${tab === item ? "border-red-600 text-red-600" : "border-transparent text-slate-500 hover:text-slate-800"}`}>{item === "follow-up" ? "Follow-up" : item === "transcript" ? "Unassigned transcript" : item}{item === "transcript" && unassignedCount > 0 && <span className="ml-1.5 rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-extrabold normal-case text-white">{unassignedCount}</span>}</button>)}</nav>
      </header>
      <main className="p-5">
        <label className="mb-4 flex max-w-sm items-center gap-3 rounded-xl border border-red-100 bg-white px-3 py-2 text-xs font-bold text-slate-600"><span className="shrink-0 text-red-600">Select product</span><select value={scopedLead.assignment_id} onChange={(event) => { setSelectedAssignmentId(event.target.value); setFollowUpAt(detailAssignments.find((assignment) => assignment.id === event.target.value)?.next_follow_up_at ?? null); }} className="min-w-0 flex-1 bg-transparent font-extrabold text-slate-800 outline-none">{detailAssignments.map((assignment) => <option key={assignment.id} value={assignment.id}>{assignment.product?.code ?? "Product"}</option>)}</select></label>
        {tab === "activity" && <ActivityTab activities={activities} loading={loading} assignedName={scopedAssignedName} lead={scopedLead} transcripts={transcripts.filter((item) => item.lead_product_assignment_id === scopedLead.assignment_id)} />}
        {tab === "details" && <DetailsTab lead={scopedLead} columns={columns} assignedName={scopedAssignedName} supplementalDetails={supplementalDetails} detailsExtra={detailsExtra} onSaved={() => setActivityVersion((version) => version + 1)} readOnly={readOnly} />}
        {tab === "notes" && <NotesTab leadId={lead.id} assignmentId={scopedLead.assignment_id} onSaved={() => setActivityVersion((version) => version + 1)} />}
        {tab === "follow-up" && <FollowUpTab leadId={lead.id} assignmentId={scopedLead.assignment_id} followUpAt={followUpAt} onSaved={(value) => { setFollowUpAt(value); setActivityVersion((version) => version + 1); }} />}
        {tab === "transcript" && <TranscriptTab leadId={lead.id} selectedAssignmentId={scopedLead.assignment_id} assignments={detailAssignments} transcripts={transcripts} onSaved={() => setActivityVersion((version) => version + 1)} />}
      </main>
      {showZoomModal && <ZoomMeetingModal leadId={lead.id} assignmentId={scopedLead.assignment_id} leadName={name} onClose={() => setShowZoomModal(false)} onScheduled={() => setActivityVersion((version) => version + 1)} />}
      {showEmailModal && lead.email && <EmailLeadModal leadId={lead.id} assignments={detailAssignments.map((item) => ({ id: item.id, code: item.product?.code ?? "Product" }))} initialAssignmentId={scopedLead.assignment_id} leadName={name} firstName={lead.first_name} lastName={lead.last_name} email={lead.email} onClose={() => setShowEmailModal(false)} onSent={() => setActivityVersion((version) => version + 1)} />}
      {showWhatsappModal && phoneDigits && <WhatsappLeadModal leadId={lead.id} assignments={detailAssignments.map((item) => ({ id: item.id, code: item.product?.code ?? "Product" }))} initialAssignmentId={scopedLead.assignment_id} leadName={name} firstName={lead.first_name} lastName={lead.last_name} phoneDigits={phoneDigits} onClose={() => setShowWhatsappModal(false)} onSent={() => setActivityVersion((version) => version + 1)} />}
      {showGoogleMeetModal && <GoogleMeetModal leadId={lead.id} assignmentId={scopedLead.assignment_id} leadName={name} onClose={() => setShowGoogleMeetModal(false)} onScheduled={() => setActivityVersion((version) => version + 1)} />}
    </aside>
  </div>;
}

function LegacyActivityTab({ activities, loading, assignedName, lead }: { activities: Activity[]; loading: boolean; assignedName?: string; lead: LeadRow }) {
  return <><div className="flex items-center justify-between"><h3 className="text-base font-extrabold text-slate-900">Activity</h3><span className="rounded-full bg-red-50 px-3 py-1 text-[11px] font-bold text-red-600">{activities.length} recorded</span></div><div className="mt-4 grid gap-3 sm:grid-cols-3"><Info label="Lead status" value={lead.stage?.[0]?.name ?? "—"} icon={<CalendarDays className="h-4 w-4" />} /><Info label="Product" value={lead.product?.[0]?.code ?? "—"} icon={<MapPin className="h-4 w-4" />} /><Info label="Assigned to" value={assignedName ?? "Unassigned"} icon={<UserRound className="h-4 w-4" />} /></div><div className="mt-5 space-y-3 border-l-2 border-slate-200 pl-5">{loading ? <p className="text-sm font-semibold text-slate-400">Loading activity…</p> : activities.length ? activities.map((activity) => <article key={activity.id} className="relative rounded-xl border border-slate-200 bg-white p-4 shadow-sm before:absolute before:-left-[29px] before:top-5 before:h-3 before:w-3 before:rounded-full before:border-2 before:border-red-300 before:bg-white"><div className="flex flex-wrap items-center justify-between gap-2"><div><h4 className="text-sm font-extrabold text-slate-800">{activityLabels[activity.activity_type] ?? activity.activity_type}</h4>{activity.actor && <p className="mt-0.5 text-[11px] font-semibold text-slate-400">by {activity.actor}</p>}</div><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{formatCrmDate(activity.created_at)}</span></div>{activity.note && <p className="mt-2 text-sm text-slate-600">{activity.note}</p>}{activity.follow_up_at && <p className="mt-2 text-xs font-semibold text-red-600">Follow-up: {formatCrmDate(activity.follow_up_at)}</p>}</article>) : <EmptyTab icon={<CalendarDays className="h-5 w-5" />} title="No activity yet" text="Calls, messages, updates, assignments, and notes will appear here." />}</div></>;
}

void LegacyActivityTab;

function ActivityTab({ activities, loading, assignedName, lead, transcripts }: { activities: Activity[]; loading: boolean; assignedName?: string; lead: LeadRow; transcripts: Transcript[] }) {
  return <><div className="flex items-center justify-between"><h3 className="text-base font-extrabold text-slate-900">Activity</h3><span className="rounded-full bg-red-50 px-3 py-1 text-[11px] font-bold text-red-600">{activities.length} recorded</span></div><div className="mt-4 grid gap-3 sm:grid-cols-3"><Info label="Lead status" value={lead.stage?.[0]?.name ?? "-"} icon={<CalendarDays className="h-4 w-4" />} /><Info label="Product" value={lead.product?.[0]?.code ?? "-"} icon={<MapPin className="h-4 w-4" />} /><Info label="Assigned to" value={assignedName ?? "Unassigned"} icon={<UserRound className="h-4 w-4" />} /></div><div className="mt-5 space-y-3 border-l-2 border-slate-200 pl-5">{loading ? <p className="text-sm font-semibold text-slate-400">Loading activity...</p> : activities.length ? activities.map((activity) => <ActivityCard key={activity.id} activity={activity} productCode={lead.product?.[0]?.code ?? null} transcript={transcripts.find((item) => item.altus_call_id === String(activity.metadata?.call_id ?? ""))} />) : <EmptyTab icon={<CalendarDays className="h-5 w-5" />} title="No activity yet" text="Calls, messages, updates, assignments, and notes will appear here." />}</div></>;
}

function ActivityCard({ activity, transcript, productCode }: { activity: Activity; transcript?: Transcript; productCode: string | null }) {
  const [showTranscript, setShowTranscript] = useState(false);
  const isCall = activity.activity_type === "call";
  const metadata = activity.metadata ?? {};
  const seconds = Number(metadata.duration_seconds ?? 0);
  const hasDuration = Number.isFinite(seconds) && seconds > 0;
  const duration = hasDuration ? `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s` : "Not provided";
  const startedAt = typeof metadata.started_at === "string" ? metadata.started_at : null;
  const rawDirection = String(metadata.direction ?? "").toLowerCase();
  const direction = rawDirection === "incoming" ? "Incoming call" : rawDirection === "outgoing" ? "Outgoing call" : null;
  const hasCallData = Boolean(direction || startedAt || hasDuration);

  if (isCall && hasCallData) {
    const callDateTime = startedAt ? formatCallDateTime(startedAt) : formatCrmDate(activity.created_at);

    return <article className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm before:absolute before:-left-[29px] before:top-6 before:h-3 before:w-3 before:rounded-full before:border-2 before:border-red-300 before:bg-white">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-4">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-red-100 text-xs font-extrabold text-red-600">{(activity.actor ?? "CRM").split(" ").map((part) => part[0]).join("").slice(0, 2)}</span>
        <div className="min-w-28">
          <h4 className="text-sm font-extrabold text-slate-900">Call</h4>
          <p className="text-[11px] font-semibold text-slate-400">by {activity.actor ?? "CRM user"}</p>
        </div>
        {direction && <span className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-extrabold text-red-600"><PhoneCall className="h-3.5 w-3.5" />{direction}</span>}
        <div className="ml-auto flex items-center gap-3 text-xs font-bold text-slate-700">
          <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4 text-slate-400" />{callDateTime}</span>
          {hasDuration && <span className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-1.5 text-red-600"><Clock3 className="h-4 w-4" />{duration}</span>}
        </div>
      </header>
      <dl className="grid border-t border-slate-100 bg-slate-50/70 sm:grid-cols-4">
        <CallDetail icon={<PhoneCall className="h-4 w-4" />} label="Direction" value={direction ?? "Not provided"} />
        <CallDetail icon={<CalendarDays className="h-4 w-4" />} label="Call date & time" value={callDateTime} />
        <CallDetail icon={<Clock3 className="h-4 w-4" />} label="Duration" value={duration} />
        <CallDetail icon={<UserRound className="h-4 w-4" />} label="Called by" value={activity.actor ?? "CRM user"} />
      </dl>
      {transcript && <div className="border-t border-slate-100 px-5 py-3"><button type="button" onClick={() => setShowTranscript((value) => !value)} className="rounded border border-red-200 px-2.5 py-1 text-[11px] font-extrabold text-red-600 hover:bg-red-50">{showTranscript ? "Hide transcript" : "View transcript"}</button>{showTranscript && <pre className="mt-3 max-h-96 overflow-y-auto whitespace-pre-wrap font-sans text-sm leading-6 text-slate-600">{transcript.transcript_text}</pre>}</div>}
    </article>;
  }

  if (activity.activity_type === "email" || activity.activity_type === "whatsapp_message") {
    const isEmail = activity.activity_type === "email";
    const subject = typeof metadata.subject === "string" ? metadata.subject : null;
    const body = typeof metadata.body === "string" ? metadata.body : null;
    const to = typeof metadata.to === "string" ? metadata.to : null;
    const product = typeof metadata.product_code === "string" ? metadata.product_code : productCode;
    const recorded = Boolean(subject || body);
    return <article className="relative rounded-xl border border-slate-200 bg-white p-4 shadow-sm before:absolute before:-left-[29px] before:top-5 before:h-3 before:w-3 before:rounded-full before:border-2 before:border-red-300 before:bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><h4 className="text-sm font-extrabold text-slate-800">{recorded ? (isEmail ? "Email sent" : "WhatsApp message sent") : (isEmail ? "Email icon clicked" : "WhatsApp icon clicked")}</h4><p className="mt-0.5 text-[11px] font-semibold text-slate-400">by {activity.actor ?? "CRM user"}</p></div><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{formatCallDateTime(activity.created_at)}</span></div>
      <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-bold">{product && <span className="rounded-full bg-red-50 px-2.5 py-1 text-red-600">Product: {product}</span>}{to && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">To: {to}</span>}</div>
      {subject && <p className="mt-3 text-sm font-extrabold text-slate-800">{subject}</p>}
      {body ? <pre className="mt-2 whitespace-pre-wrap font-sans text-sm leading-6 text-slate-600">{body}</pre> : <p className="mt-2 text-xs text-slate-400">{subject ? "The message text was not saved for this email (sent before message details were recorded)." : `The ${isEmail ? "email" : "WhatsApp"} icon was clicked, but no message was sent from the CRM.`}</p>}
    </article>;
  }

  if (isCall) return <article className="relative rounded-xl border border-slate-200 bg-white p-4 shadow-sm before:absolute before:-left-[29px] before:top-5 before:h-3 before:w-3 before:rounded-full before:border-2 before:border-red-300 before:bg-white"><div className="flex flex-wrap items-center justify-between gap-2"><div><h4 className="text-sm font-extrabold text-slate-800">Call</h4><p className="mt-0.5 text-[11px] font-semibold text-slate-400">by {activity.actor ?? "CRM user"}</p></div><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{formatCrmDate(activity.created_at)}</span></div><p className="mt-2 text-xs text-slate-500">{activity.note || "Call request recorded. Details will appear after Altus Contacts completes the call."}</p></article>;
  return <article className="relative rounded-xl border border-slate-200 bg-white p-4 shadow-sm before:absolute before:-left-[29px] before:top-5 before:h-3 before:w-3 before:rounded-full before:border-2 before:border-red-300 before:bg-white"><div className="flex flex-wrap items-center justify-between gap-2"><div><h4 className="text-sm font-extrabold text-slate-800">{activityLabels[activity.activity_type] ?? activity.activity_type}</h4>{activity.actor && <p className="mt-0.5 text-[11px] font-semibold text-slate-400">by {activity.actor}</p>}</div><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{formatCrmDate(activity.created_at)}</span></div>{activity.note && <p className="mt-2 text-sm text-slate-600">{activity.note}</p>}{activity.follow_up_at && <p className="mt-2 text-xs font-semibold text-red-600">Follow-up: {formatCrmDate(activity.follow_up_at)}</p>}</article>;
}

function CallDetail({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) { return <div className="flex min-w-0 items-center gap-2.5 border-b border-r border-slate-100 bg-white/70 px-4 py-3 last:border-r-0 sm:border-b-0"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-red-50 text-red-600">{icon}</span><div className="min-w-0"><dt className="text-[10px] font-bold text-slate-400">{label}</dt><dd className="mt-0.5 truncate text-xs font-extrabold text-slate-800">{value}</dd></div></div>; }
function formatCallDateTime(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "Not available" : new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }).format(date); }

function DetailsTab({ lead, columns, assignedName, supplementalDetails = [], detailsExtra, onSaved, readOnly = false }: { lead: LeadRow; columns: LeadColumn[]; assignedName?: string; supplementalDetails?: { label: string; value: string }[]; detailsExtra?: React.ReactNode; onSaved: () => void; readOnly?: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const fields = completeLeadDetailColumns(lead, columns).map((column) => ({ column, value: detailValue(lead, column, assignedName) }));
  const editableFields = fields.filter(({ column }) => isEditableColumn(column));

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const values = editableFields.map(({ column }) => ({ key: column.field_key, value: String(form.get(`field:${column.id}`) ?? "") }));
    startTransition(async () => {
      const formData = new FormData();
      formData.set("leadId", lead.id); formData.set("assignmentId", lead.assignment_id);
      formData.set("values", JSON.stringify(values));
      setMessage("");
      try { await updateLeadDetails(formData); setEditing(false); setMessage("Details saved."); onSaved(); router.refresh(); }
      catch (error) { setMessage(error instanceof Error ? error.message : "Unable to save details."); }
    });
  }

  return <div><div className="flex items-center justify-between gap-3"><div><h3 className="text-base font-extrabold text-slate-900">Lead details</h3><p className="mt-1 text-xs text-slate-500">Lead information and custom fields.</p></div>{!readOnly && <button type="button" onClick={() => { setEditing((value) => !value); setMessage(""); }} className="h-9 rounded-lg border border-red-200 bg-white px-3 text-xs font-extrabold text-red-600 hover:bg-red-50">{editing ? "Cancel" : "Edit details"}</button>}</div>{message && <p className={`mt-3 rounded-lg px-3 py-2 text-xs font-bold ${message === "Details saved." ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{message}</p>}<form onSubmit={submit} className="mt-4"><dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{fields.map(({ column, value }) => <div key={column.id} className="rounded-xl border border-slate-200 bg-white p-4"><dt className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{column.label}</dt><dd className="mt-1">{editing && !readOnly && isEditableColumn(column) ? <DetailInput column={column} value={value} /> : <span className="whitespace-pre-wrap break-words text-sm font-bold text-slate-800">{value || "—"}</span>}</dd></div>)}{supplementalDetails.map((field) => <div key={field.label} className="rounded-xl border border-red-100 bg-red-50/40 p-4"><dt className="text-[11px] font-bold uppercase tracking-wide text-red-500">{field.label}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm font-bold text-slate-800">{field.value || "—"}</dd></div>)}</dl>{editing && !readOnly && <div className="mt-5 flex items-center justify-end gap-2 border-t border-slate-200 pt-4"><p className="mr-auto text-xs text-slate-500">Product, stage, resolution, assignments, and calculated fields remain managed in the Leads table.</p><button type="submit" disabled={isPending} className="h-9 rounded-lg bg-[#d90000] px-4 text-sm font-extrabold text-white hover:bg-red-700 disabled:opacity-60">{isPending ? "Saving…" : "Save changes"}</button></div>}</form>{detailsExtra}</div>;
}

function NotesTab({ leadId, assignmentId, onSaved }: { leadId: string; assignmentId: string; onSaved: () => void }) {
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const [transcripts, setTranscripts] = useState<{ id: string; altus_call_id: string; transcript_text: string; updated_at: string }[]>([]);
  const [transcriptsLoading, setTranscriptsLoading] = useState(true);
  const [callId, setCallId] = useState("");
  function loadTranscripts() { setTranscriptsLoading(true); fetch(`/api/leads/${leadId}/transcripts`, { cache: "no-store" }).then((response) => response.json() as Promise<{ ok?: boolean; transcripts?: { id: string; altus_call_id: string; transcript_text: string; updated_at: string }[] }>).then((result) => { if (result.ok) setTranscripts(result.transcripts ?? []); }).catch(() => undefined).finally(() => setTranscriptsLoading(false)); }
  useEffect(() => {
    let active = true;
    fetch(`/api/leads/${leadId}/transcripts`, { cache: "no-store" })
      .then((response) => response.json() as Promise<{ ok?: boolean; transcripts?: { id: string; altus_call_id: string; transcript_text: string; updated_at: string }[] }>)
      .then((result) => { if (active && result.ok) setTranscripts(result.transcripts ?? []); })
      .catch(() => undefined)
      .finally(() => { if (active) setTranscriptsLoading(false); });
    return () => { active = false; };
  }, [leadId]);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const formData = new FormData();
      formData.set("leadId", leadId); formData.set("assignmentId", assignmentId); formData.set("note", note);
      try { await createLeadNote(formData); setNote(""); setMessage("Note saved to activity."); onSaved(); }
      catch (error) { setMessage(error instanceof Error ? error.message : "Unable to save note."); }
    });
  }
  function syncTranscripts() { startTransition(async () => { const formData = new FormData(); formData.set("leadId", leadId); formData.set("assignmentId", assignmentId); const result = await syncLeadCallTranscripts(formData); setMessage(result.message); if (result.ok) { loadTranscripts(); onSaved(); } }); }
  function syncCallId(event: FormEvent<HTMLFormElement>) { event.preventDefault(); startTransition(async () => { const formData = new FormData(); formData.set("leadId", leadId); formData.set("assignmentId", assignmentId); formData.set("callId", callId); const result = await syncLeadTranscriptByCallId(formData); setMessage(result.message); if (result.ok) { setCallId(""); loadTranscripts(); onSaved(); } }); }
  return <div><div className="flex flex-wrap items-end justify-between gap-3"><div><h3 className="text-base font-extrabold text-slate-900">Notes</h3><p className="mt-1 text-xs text-slate-500">Notes and full Altus Contact call transcripts for this lead.</p></div><button type="button" onClick={syncTranscripts} disabled={isPending} className="h-9 rounded-lg border border-red-200 bg-white px-3 text-xs font-extrabold text-red-600 hover:bg-red-50 disabled:opacity-50">{isPending ? "Syncing..." : "Sync call transcripts"}</button></div><form onSubmit={syncCallId} className="mt-3 flex max-w-3xl gap-2 rounded-xl border border-slate-200 bg-white p-3"><input value={callId} onChange={(event) => setCallId(event.target.value)} inputMode="numeric" pattern="[0-9]*" placeholder="Altus call ID (for example 39083)" className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-red-400" /><button type="submit" disabled={isPending || !callId} className="h-9 shrink-0 rounded-lg border border-red-200 px-3 text-xs font-extrabold text-red-600 disabled:opacity-50">Sync this call</button></form><form onSubmit={submit} className="mt-4 max-w-3xl rounded-xl border border-slate-200 bg-white p-4"><textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} required placeholder="Write a note about this lead..." className="min-h-32 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-red-400" /><div className="mt-3 flex items-center justify-between gap-3"><span className="text-xs text-slate-400">{note.length}/2000</span><button type="submit" disabled={isPending || !note.trim()} className="h-9 rounded-lg bg-[#d90000] px-4 text-sm font-extrabold text-white disabled:opacity-50">{isPending ? "Saving..." : "Save note"}</button></div>{message && <p className="mt-3 text-xs font-bold text-emerald-700">{message}</p>}</form><section className="mt-4 max-w-3xl"><h4 className="text-sm font-extrabold text-slate-800">Call transcripts</h4>{transcriptsLoading ? <p className="mt-2 text-xs text-slate-400">Loading transcripts...</p> : transcripts.length ? <div className="mt-2 space-y-3">{transcripts.map((transcript) => <article key={transcript.id} className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex justify-between gap-3"><p className="text-xs font-extrabold text-slate-700">Altus call #{transcript.altus_call_id}</p><p className="text-[10px] font-semibold text-slate-400">{formatCrmDate(transcript.updated_at)}</p></div><pre className="mt-3 whitespace-pre-wrap font-sans text-sm leading-6 text-slate-600">{transcript.transcript_text}</pre></article>)}</div> : <p className="mt-2 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-4 text-xs text-slate-500">No call transcripts saved yet. Use Sync after Altus Contacts has processed the call.</p>}</section></div>;
}

type ProductAssignment = LeadRow["product_assignments"][number];
type Transcript = { id: string; altus_call_id: string; transcript_text: string; lead_product_assignment_id: string | null; updated_at: string };

function TranscriptTab({ leadId, selectedAssignmentId, assignments, transcripts, onSaved }: { leadId: string; selectedAssignmentId: string; assignments: ProductAssignment[]; transcripts: Transcript[]; onSaved: () => void }) {
  const [callId, setCallId] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const selectedProduct = assignments.find((assignment) => assignment.id === selectedAssignmentId)?.product?.code ?? "selected product";
  const unassigned = transcripts.filter((item) => !item.lead_product_assignment_id);
  const syncAll = () => startTransition(async () => { const formData = new FormData(); formData.set("leadId", leadId); formData.set("assignmentId", selectedAssignmentId); const result = await syncLeadCallTranscripts(formData); setMessage(result.message); if (result.ok) onSaved(); });
  const syncOne = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); startTransition(async () => { const formData = new FormData(); formData.set("leadId", leadId); formData.set("assignmentId", selectedAssignmentId); formData.set("callId", callId); const result = await syncLeadTranscriptByCallId(formData); setMessage(result.message); if (result.ok) { setCallId(""); onSaved(); } }); };
  const attach = (transcriptId: string) => startTransition(async () => { const formData = new FormData(); formData.set("leadId", leadId); formData.set("transcriptId", transcriptId); formData.set("assignmentId", selectedAssignmentId); try { await attachTranscriptToProduct(formData); setMessage(`Transcript attached to ${selectedProduct}. It now appears on the call in Activity.`); onSaved(); } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to attach transcript."); } });
  return <section className="max-w-4xl"><div className="flex flex-wrap items-end justify-between gap-3"><div><h3 className="text-base font-extrabold text-slate-900">Unassigned transcripts</h3><p className="mt-1 text-xs text-slate-500">Attach a transcript to {selectedProduct}. Once attached it moves to the call in Activity, under View transcript.</p></div><button type="button" onClick={syncAll} disabled={isPending} className="h-9 rounded-lg border border-red-200 bg-white px-3 text-xs font-extrabold text-red-600 disabled:opacity-50">{isPending ? "Syncing..." : "Sync transcripts"}</button></div><form onSubmit={syncOne} className="mt-3 flex gap-2 rounded-xl border border-slate-200 bg-white p-3"><input value={callId} onChange={(event) => setCallId(event.target.value)} inputMode="numeric" placeholder="Altus call ID" className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-red-400" /><button type="submit" disabled={isPending || !callId} className="h-9 rounded-lg border border-red-200 px-3 text-xs font-extrabold text-red-600 disabled:opacity-50">Sync call</button></form>{message && <p className="mt-3 text-xs font-bold text-emerald-700">{message}</p>}<div className="mt-4 space-y-3">{unassigned.length ? unassigned.map((transcript) => <article key={transcript.id} className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-extrabold text-slate-700">Altus call #{transcript.altus_call_id}</p><button type="button" disabled={isPending} onClick={() => attach(transcript.id)} className="rounded border border-red-200 px-2 py-1 text-[10px] font-extrabold text-red-600 disabled:opacity-50">Attach to {selectedProduct}</button></div><pre className="mt-3 whitespace-pre-wrap font-sans text-sm leading-6 text-slate-600">{transcript.transcript_text}</pre></article>) : <p className="rounded-lg border border-dashed border-slate-300 bg-white px-3 py-4 text-xs text-slate-500">No unassigned transcripts. Attached transcripts are on their calls in Activity.</p>}</div></section>;
}

function DetailInput({ column, value }: { column: LeadColumn; value: string }) { const className = "mt-1 h-9 w-full rounded border border-slate-200 bg-white px-2 text-sm font-semibold text-slate-700 outline-none focus:border-red-400"; if (column.field_type === "dropdown") return <select name={`field:${column.id}`} defaultValue={value} className={className}><option value="">Select</option>{(column.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}</select>; if (column.field_type === "textarea") return <textarea name={`field:${column.id}`} defaultValue={value} className="mt-1 min-h-20 w-full rounded border border-slate-200 bg-white px-2 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-red-400" />; return <input name={`field:${column.id}`} type={column.field_type === "date" ? "date" : column.field_type === "number" ? "number" : "text"} defaultValue={column.field_type === "date" ? dateInputValue(value) : value} className={className} />; }
function isLeadNumberColumn(column: LeadColumn) { return column.field_key === "lead_number" || ["lead no", "lead number"].includes(column.label.trim().toLowerCase()); }
function isLeadAcquisitionDateColumn(column: LeadColumn) { return column.field_key === "lead_acquisition_date" || column.label.trim().toLowerCase() === "lead acquisition date"; }
function isEditableColumn(column: LeadColumn) { return !isChannelPartnerColumn(column) && !isSeniorAmbassadorColumn(column) && !column.read_only && !column.computed_from?.length && !isLeadNumberColumn(column) && !isLeadAcquisitionDateColumn(column) && !["product", "stage", "call_resolution", "assigned_to", "next_follow_up", "created_at"].includes(column.field_key); }
function detailValue(lead: LeadRow, column: LeadColumn, assignedName?: string) { if (isChannelPartnerColumn(column)) return lead.channel_partner_name ?? ""; if (isSeniorAmbassadorColumn(column)) return lead.senior_ambassador?.name ?? ""; if (column.computed_from?.length) return column.computed_from.map((field) => field === "first_name" ? lead.first_name : field === "last_name" ? lead.last_name : field === "email" ? lead.email : field === "phone" ? lead.phone : lead.custom_data?.[field]).filter((value): value is string | number => typeof value === "string" || typeof value === "number").join(" "); if (isLeadNumberColumn(column)) return lead.lead_number ? `L-${lead.lead_number}` : ""; if (isLeadAcquisitionDateColumn(column)) return formatCrmDate(lead.created_at); switch (column.field_key) { case "lead_name": return [lead.first_name, lead.last_name].filter(Boolean).join(" "); case "first_name": return lead.first_name; case "last_name": return lead.last_name ?? ""; case "email": return lead.email ?? ""; case "phone": return lead.phone ?? ""; case "product": return lead.product?.[0]?.name ?? lead.product?.[0]?.code ?? ""; case "stage": return lead.stage?.[0]?.name ?? ""; case "call_resolution": return lead.resolution?.[0]?.name ?? ""; case "assigned_to": return assignedName ?? ""; case "next_follow_up": return lead.next_follow_up_at ? formatCrmDate(lead.next_follow_up_at) : ""; case "assigned_at": return lead.assigned_at ? formatCrmDate(lead.assigned_at) : ""; case "created_at": return formatCrmDate(lead.created_at); default: return storedDetailValue(lead.custom_data?.[column.field_key]); } }
function dateInputValue(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10); }
function FollowUpTab({ leadId, assignmentId, followUpAt, onSaved }: { leadId: string; assignmentId: string; followUpAt: string | null; onSaved: (value: string) => void }) {
  const [value, setValue] = useState(toDateTimeLocal(followUpAt));
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const formData = new FormData(); formData.set("leadId", leadId); formData.set("assignmentId", assignmentId); formData.set("followUpAt", value);
      try { await updateLeadFollowUp(formData); onSaved(new Date(value).toISOString()); setMessage("Follow-up date saved."); }
      catch (error) { setMessage(error instanceof Error ? error.message : "Unable to save follow-up."); }
    });
  }
  return <div className="max-w-xl rounded-xl border border-red-100 bg-white p-5"><p className="text-xs font-extrabold uppercase tracking-wide text-red-600">Follow-up</p><h3 className="mt-1 text-lg font-extrabold text-slate-900">{followUpAt ? "Change follow-up date" : "Schedule follow-up"}</h3><p className="mt-1 text-sm text-slate-500">{followUpAt ? `Currently scheduled for ${formatCrmDate(followUpAt)}.` : "Choose when this lead should be followed up."}</p><form onSubmit={submit} className="mt-5"><label className="block text-xs font-bold text-slate-700">Follow-up date and time<input required type="datetime-local" value={value} onChange={(event) => setValue(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-red-400" /></label><div className="mt-4 flex items-center justify-between gap-3"><p className="text-xs font-bold text-emerald-700">{message}</p><button type="submit" disabled={isPending || !value} className="h-9 rounded-lg bg-[#d90000] px-4 text-sm font-extrabold text-white disabled:opacity-50">{isPending ? "Saving..." : followUpAt ? "Update follow-up" : "Schedule follow-up"}</button></div></form></div>;
}
function toDateTimeLocal(value: string | null) { if (!value) return ""; const date = new Date(value); if (Number.isNaN(date.getTime())) return ""; const offset = date.getTimezoneOffset() * 60_000; return new Date(date.getTime() - offset).toISOString().slice(0, 16); }
function Info({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) { return <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3"><span className="grid h-8 w-8 place-items-center rounded-lg bg-red-50 text-red-600">{icon}</span><div><p className="text-[10px] font-bold text-slate-400">{label}</p><p className="mt-0.5 text-xs font-extrabold text-slate-800">{value}</p></div></div>; }
function EmptyTab({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) { return <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center"><span className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-slate-500">{icon}</span><p className="mt-3 text-sm font-extrabold text-slate-800">{title}</p><p className="mt-1 text-xs text-slate-500">{text}</p></div>; }
