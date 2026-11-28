"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { CalendarDays, Clock3, Mail, MapPin, MessageCircle, Pencil, PhoneCall, UserRound, Video, X } from "lucide-react";
import { formatCrmDate } from "@/app/lib/date";
import { displayProductCode } from "@/app/lib/product-display";
import { isChannelPartnerColumn, isSeniorAmbassadorColumn } from "@/app/lib/channel-partner";
import { completeLeadDetailColumns, storedDetailValue } from "@/app/lib/lead-detail-fields";
import { LEAD_ADDRESS_COUNTRIES, leadAddressFieldKeyForColumn, locationCities, locationStates } from "@/app/lib/lead-address-fields";
import { addProductToLeadDetails, attachTranscriptToProduct, createLeadContact, createLeadNote, makeLeadContactPrimary, manuallyAssignLeads, sendEmailToLeadContact, syncLeadCallTranscripts, syncLeadTranscriptByCallId, updateLeadContact, updateLeadDetails, updateLeadFollowUp, updateLeadProductInline, updateLeadResolutionInline, updateLeadStageInline } from "@/app/dashboard/leads/actions";
import type { LeadColumn, LeadRow } from "./leads-table";
import { ChannelPartnerSelect } from "./channel-partner-select";
import { SeniorAmbassadorSelect } from "./senior-ambassador-select";
import { ZoomMeetingModal } from "./zoom-meeting-modal";
import { GoogleMeetModal } from "./google-meet-modal";
import { EmailLeadModal } from "./email-lead-modal";
import { WhatsappLeadModal } from "./whatsapp-lead-modal";
import { LeadNoteActivity } from "./lead-note-activity";
import { VoiceDictationButton } from "./voice-dictation-button";
import { ResolutionPicker } from "./resolution-picker";
import { googleCalendarCreateUrl } from "@/app/lib/google-calendar-link";

type Activity = { id: string; activity_type: string; note: string | null; follow_up_at: string | null; created_at: string; metadata: Record<string, unknown> | null; actor?: string | null };
type Tab = "activity" | "details" | "notes" | "follow-up" | "transcript" | "contacts";
type DetailEditableConfiguration = {
  products: { id: string; code: string; name: string }[];
  stages: { id: string; product_id: string; name: string }[];
  productResolutions: { product_id: string; resolution_id: string; resolution_name: string }[];
};

const activityLabels: Record<string, string> = { lead_created: "Lead added", assigned: "Lead assigned", product_added: "Product added", product_transferred: "Transferred to product", product_transfer_completed: "Product transfer completed", transcript_attached: "Transcript attached", details_updated: "Details updated", product_updated: "Product updated", stage_updated: "Stage updated", resolution_updated: "Call resolution updated", follow_up_scheduled: "Follow-up scheduled", follow_up_rescheduled: "Follow-up date updated", call_transcript_synced: "Call transcript saved", zoom_meeting_scheduled: "Zoom meeting scheduled", zoom_transcript_received: "Zoom transcript received", zoom_recording_ready: "Zoom recording ready", google_meet_scheduled: "Google Meet scheduled", google_meet_recording_ready: "Google Meet recording ready", note: "Note added", call: "Call", video_call: "Video call", offline_meeting: "Offline meeting", whatsapp_message: "WhatsApp message", online_demo: "Online demo", offline_demo: "Offline demo", linkedin: "LinkedIn", online_meeting: "Online meeting", email: "Email" };

export function LeadDetailPanel({ lead, columns, assignedNames, onClose, supplementalDetails = [], detailsExtra, detailConfiguration, salesPersonOptions, canManageAllDetails = false, initialTab = "activity", readOnly = false, onChannelPartnersSaved, onSeniorAmbassadorSaved }: { lead: LeadRow; columns: LeadColumn[]; assignedNames: Record<string, string>; onClose: () => void; supplementalDetails?: { label: string; value: string }[]; detailsExtra?: React.ReactNode; detailConfiguration?: DetailEditableConfiguration; salesPersonOptions?: { id: string; name: string }[]; canManageAllDetails?: boolean; initialTab?: Tab; readOnly?: boolean; onChannelPartnersSaved?: (leadId: string, ambassadorIds: string[]) => void; onSeniorAmbassadorSaved?: (leadId: string, seniorAmbassadorId: string) => void }) {
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
  const visibleTabs: Tab[] = readOnly ? ["activity", "details", "contacts"] : ["activity", "details", "notes", "follow-up", "transcript", "contacts"];

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
        <nav className="mt-4 flex gap-6" aria-label="Lead detail sections">{visibleTabs.map((item) => <button key={item} type="button" onClick={() => setTab(item)} className={`border-b-2 pb-2.5 text-[13px] font-bold capitalize ${tab === item ? "border-red-600 text-red-600" : "border-transparent text-slate-500 hover:text-slate-800"}`}>{item === "follow-up" ? "Follow-up" : item === "transcript" ? "Unassigned transcript" : item === "contacts" ? "Add Contact" : item}{item === "transcript" && unassignedCount > 0 && <span className="ml-1.5 rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-extrabold normal-case text-white">{unassignedCount}</span>}</button>)}</nav>
      </header>
      <main className="p-5">
        <label className="mb-4 flex max-w-sm items-center gap-3 rounded-xl border border-red-100 bg-white px-3 py-2 text-xs font-bold text-slate-600"><span className="shrink-0 text-red-600">Select product</span><select value={scopedLead.assignment_id} onChange={(event) => { setSelectedAssignmentId(event.target.value); setFollowUpAt(detailAssignments.find((assignment) => assignment.id === event.target.value)?.next_follow_up_at ?? null); }} className="min-w-0 flex-1 bg-transparent font-extrabold text-slate-800 outline-none">{detailAssignments.map((assignment) => <option key={assignment.id} value={assignment.id}>{displayProductCode(assignment.product?.code)}</option>)}</select></label>
        {tab === "activity" && <ActivityTab activities={activities} loading={loading} assignedName={scopedAssignedName} lead={scopedLead} transcripts={transcripts.filter((item) => item.lead_product_assignment_id === scopedLead.assignment_id)} onSaved={() => setActivityVersion((version) => version + 1)} readOnly={readOnly} />}
        {tab === "details" && <DetailsTab lead={scopedLead} columns={columns} assignedName={scopedAssignedName} supplementalDetails={supplementalDetails} detailsExtra={detailsExtra} detailConfiguration={detailConfiguration} salesPersonOptions={salesPersonOptions} canManageAllDetails={canManageAllDetails} contactVersion={activityVersion} onSaved={() => setActivityVersion((version) => version + 1)} onChannelPartnersSaved={onChannelPartnersSaved} onSeniorAmbassadorSaved={onSeniorAmbassadorSaved} readOnly={readOnly} />}
        {tab === "notes" && <NotesTab leadId={lead.id} assignmentId={scopedLead.assignment_id} onSaved={() => setActivityVersion((version) => version + 1)} />}
        {tab === "follow-up" && <FollowUpTab leadId={lead.id} assignmentId={scopedLead.assignment_id} followUpAt={followUpAt} onSaved={(value) => { setFollowUpAt(value); setActivityVersion((version) => version + 1); }} />}
        {tab === "transcript" && <TranscriptTab leadId={lead.id} selectedAssignmentId={scopedLead.assignment_id} assignments={detailAssignments} transcripts={transcripts} onSaved={() => setActivityVersion((version) => version + 1)} />}
        {tab === "contacts" && <ContactsTab leadId={lead.id} assignmentId={scopedLead.assignment_id} columns={columns} readOnly={readOnly} onSaved={() => setActivityVersion((version) => version + 1)} />}
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

function ActivityTab({ activities, loading, assignedName, lead, transcripts, onSaved, readOnly = false }: { activities: Activity[]; loading: boolean; assignedName?: string; lead: LeadRow; transcripts: Transcript[]; onSaved: () => void; readOnly?: boolean }) {
  return <><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-base font-extrabold text-slate-900">Activity</h3><div className="flex items-center gap-2"><span className="rounded-full bg-red-50 px-3 py-1 text-[11px] font-bold text-red-600">{activities.length} recorded</span><LeadNoteActivity leadId={lead.id} assignmentId={lead.assignment_id} leadName={[lead.first_name, lead.last_name].filter(Boolean).join(" ") || undefined} onSaved={onSaved} readOnly={readOnly} /></div></div><div className="mt-4 grid gap-3 sm:grid-cols-3"><Info label="Lead status" value={lead.stage?.[0]?.name ?? "-"} icon={<CalendarDays className="h-4 w-4" />} /><Info label="Product" value={displayProductCode(lead.product?.[0]?.code, "-")} icon={<MapPin className="h-4 w-4" />} /><Info label="Assigned to" value={assignedName ?? "Unassigned"} icon={<UserRound className="h-4 w-4" />} /></div><div className="mt-5 space-y-3 border-l-2 border-slate-200 pl-5">{loading ? <p className="text-sm font-semibold text-slate-400">Loading activity...</p> : activities.length ? activities.map((activity) => <ActivityCard key={activity.id} activity={activity} productCode={lead.product?.[0]?.code ?? null} leadName={[lead.first_name, lead.last_name].filter(Boolean).join(" ") || undefined} transcript={transcripts.find((item) => item.altus_call_id === String(activity.metadata?.call_id ?? ""))} />) : <EmptyTab icon={<CalendarDays className="h-5 w-5" />} title="No activity yet" text="Calls, messages, updates, assignments, and notes will appear here." />}</div></>;
}

function ActivityCard({ activity, transcript, productCode, leadName }: { activity: Activity; transcript?: Transcript; productCode: string | null; leadName?: string }) {
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
      {transcript && <div className="border-t border-slate-100 px-5 py-3">
        {transcript.summary && <div className="mb-3"><p className="text-[11px] font-extrabold uppercase tracking-wide text-slate-400">AI summary</p><p className="mt-1 text-sm text-slate-700">{transcript.summary}</p>
          {transcript.key_points.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-600">{transcript.key_points.map((point, i) => <li key={i}>{point}</li>)}</ul>}
          {(transcript.sentiment || transcript.disposition) && <p className="mt-2 text-[11px] font-bold text-slate-500">{[transcript.sentiment, transcript.disposition].filter(Boolean).join(" · ")}</p>}</div>}
        <button type="button" onClick={() => setShowTranscript((value) => !value)} className="rounded border border-red-200 px-2.5 py-1 text-[11px] font-extrabold text-red-600 hover:bg-red-50">{showTranscript ? "Hide transcript" : "View full transcript"}</button>
        {showTranscript && <pre className="mt-3 max-h-96 overflow-y-auto whitespace-pre-wrap font-sans text-sm leading-6 text-slate-600">{transcript.transcript_text}</pre>}
      </div>}
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
      <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-bold">{product && <span className="rounded-full bg-red-50 px-2.5 py-1 text-red-600">Product: {displayProductCode(product)}</span>}{to && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">To: {to}</span>}</div>
      {subject && <p className="mt-3 text-sm font-extrabold text-slate-800">{subject}</p>}
      {body ? <pre className="mt-2 whitespace-pre-wrap font-sans text-sm leading-6 text-slate-600">{body}</pre> : <p className="mt-2 text-xs text-slate-400">{subject ? "The message text was not saved for this email (sent before message details were recorded)." : `The ${isEmail ? "email" : "WhatsApp"} icon was clicked, but no message was sent from the CRM.`}</p>}
    </article>;
  }

  if (isCall) return <article className="relative rounded-xl border border-slate-200 bg-white p-4 shadow-sm before:absolute before:-left-[29px] before:top-5 before:h-3 before:w-3 before:rounded-full before:border-2 before:border-red-300 before:bg-white"><div className="flex flex-wrap items-center justify-between gap-2"><div><h4 className="text-sm font-extrabold text-slate-800">Call</h4><p className="mt-0.5 text-[11px] font-semibold text-slate-400">by {activity.actor ?? "CRM user"}</p></div><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{formatCrmDate(activity.created_at)}</span></div><p className="mt-2 text-xs text-slate-500">{activity.note || "Call request recorded. Details will appear after Altus Contacts completes the call."}</p></article>;
  const attachments = Array.isArray(metadata.attachments) ? metadata.attachments.filter((item): item is { url: string; name: string } => Boolean(item && typeof item === "object" && typeof (item as { url?: unknown }).url === "string" && typeof (item as { name?: unknown }).name === "string")) : [];
  const followUpNote = activity.note || (typeof metadata.follow_up_note === "string" ? metadata.follow_up_note : "");
  const followUpCalendarUrl = activity.follow_up_at && !Number.isNaN(new Date(activity.follow_up_at).getTime())
    ? googleCalendarCreateUrl({ title: `Follow-up: ${leadName ?? "Lead"}`, description: followUpNote, start: new Date(activity.follow_up_at), end: new Date(new Date(activity.follow_up_at).getTime() + 30 * 60_000) })
    : null;
  return <article className="relative rounded-xl border border-slate-200 bg-white p-4 shadow-sm before:absolute before:-left-[29px] before:top-5 before:h-3 before:w-3 before:rounded-full before:border-2 before:border-red-300 before:bg-white"><div className="flex flex-wrap items-center justify-between gap-2"><div><h4 className="text-sm font-extrabold text-slate-800">{activityLabels[activity.activity_type] ?? activity.activity_type}</h4>{activity.actor && <p className="mt-0.5 text-[11px] font-semibold text-slate-400">by {activity.actor}</p>}</div><div className="flex shrink-0 items-center gap-2">{followUpCalendarUrl && <a href={followUpCalendarUrl} target="_blank" rel="noreferrer" title="Add or edit this follow-up in Google Calendar" className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[10px] font-extrabold text-red-600 hover:bg-red-100"><CalendarDays className="h-3 w-3" />Add to Google Calendar</a>}<span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{formatCrmDate(activity.created_at)}</span></div></div>{activity.note && <p className="mt-2 text-sm text-slate-600">{activity.note}</p>}{attachments.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{attachments.map((attachment) => <a key={attachment.url} href={attachment.url} target="_blank" rel="noreferrer" className="rounded border border-red-200 px-2.5 py-1 text-xs font-extrabold text-red-600 hover:bg-red-50">Open attachment: {attachment.name}</a>)}</div>}{activity.follow_up_at && <p className="mt-2 text-xs font-semibold text-red-600">Follow-up: {formatCrmDate(activity.follow_up_at)}</p>}</article>;
}

function CallDetail({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) { return <div className="flex min-w-0 items-center gap-2.5 border-b border-r border-slate-100 bg-white/70 px-4 py-3 last:border-r-0 sm:border-b-0"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-red-50 text-red-600">{icon}</span><div className="min-w-0"><dt className="text-[10px] font-bold text-slate-400">{label}</dt><dd className="mt-0.5 truncate text-xs font-extrabold text-slate-800">{value}</dd></div></div>; }
function formatCallDateTime(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "Not available" : new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }).format(date); }

type LeadContact = { id: string; first_name: string; last_name: string | null; email: string | null; phone: string | null; designation: string | null; department_function: string | null; contact_type: "primary" | "secondary"; created_at: string };

function ContactsTab({ leadId, assignmentId, columns, readOnly = false, onSaved }: { leadId: string; assignmentId: string; columns: LeadColumn[]; readOnly?: boolean; onSaved: () => void }) {
  const router = useRouter();
  const [contacts, setContacts] = useState<LeadContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const [editingContact, setEditingContact] = useState<LeadContact | null>(null);
  const [emailingContact, setEmailingContact] = useState<LeadContact | null>(null);
  const [dialingId, setDialingId] = useState<string | null>(null);
  const [dialMessages, setDialMessages] = useState<Record<string, string>>({});
  const designationColumn = columns.find((column) => column.source === "custom" && column.field_type === "dropdown" && normalizeContactColumnLabel(column.label) === "designation");
  const departmentColumn = columns.find((column) => column.source === "custom" && column.field_type === "dropdown" && normalizeContactColumnLabel(column.label) === "departmentfunction");

  const callContact = async (contact: LeadContact) => {
    if (!contact.phone || dialingId) return;
    setDialingId(contact.id);
    setDialMessages((current) => ({ ...current, [contact.id]: "" }));
    try {
      const response = await fetch("/api/altus-contacts/dial", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ leadId, assignmentId, number: contact.phone }) });
      const result = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error || "Unable to start the call.");
      setDialMessages((current) => ({ ...current, [contact.id]: "Call requested in Altus Contacts." }));
      onSaved();
    } catch (error) {
      setDialMessages((current) => ({ ...current, [contact.id]: error instanceof Error ? error.message : "Unable to start the call." }));
    } finally {
      setDialingId(null);
    }
  };

  const loadContacts = () => {
    setLoading(true);
    fetch(`/api/leads/${leadId}/contacts?assignmentId=${encodeURIComponent(assignmentId)}`, { cache: "no-store" })
      .then(async (response) => ({ response, result: await response.json() as { ok?: boolean; contacts?: LeadContact[]; error?: string } }))
      .then(({ response, result }) => {
        if (!response.ok || !result.ok) throw new Error(result.error ?? "Unable to load contacts.");
        setContacts(result.contacts ?? []);
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : "Unable to load contacts."))
      .finally(() => setLoading(false));
  };
  useEffect(() => { loadContacts(); }, [leadId, assignmentId]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("leadId", leadId); formData.set("assignmentId", assignmentId);
      formData.set("firstName", String(form.get("firstName") ?? ""));
      formData.set("lastName", String(form.get("lastName") ?? ""));
      formData.set("email", String(form.get("email") ?? ""));
      formData.set("phone", String(form.get("phone") ?? ""));
      formData.set("designation", String(form.get("designation") ?? ""));
      formData.set("departmentFunction", String(form.get("departmentFunction") ?? ""));
      formData.set("contactType", String(form.get("contactType") ?? "secondary"));
      const isPrimary = formData.get("contactType") === "primary";
      const result = await createLeadContact(formData);
      setMessage(result.message);
      if (!result.ok) return;
      formElement.reset();
      await loadContacts();
      onSaved();
      if (isPrimary) router.refresh();
    });
  };
  const makePrimary = (contactId: string) => {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("leadId", leadId);
      formData.set("assignmentId", assignmentId);
      formData.set("contactId", contactId);
      const result = await makeLeadContactPrimary(formData);
      setMessage(result.message);
      if (!result.ok) return;
      await loadContacts();
      onSaved();
      router.refresh();
    });
  };

  return <section className="max-w-5xl"><div><h3 className="text-base font-extrabold text-slate-900">Lead contacts</h3><p className="mt-1 text-xs text-slate-500">The lead record is the Primary contact. Saving a new Primary contact updates the lead and preserves the previous lead contact as Secondary.</p></div>{!readOnly && <form onSubmit={submit} className="mt-4 rounded-xl border border-red-100 bg-white p-4"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"><ContactInput name="firstName" label="First name" required /><ContactInput name="lastName" label="Last name" /><ContactInput name="email" label="Email" type="email" /><ContactInput name="phone" label="Phone" type="tel" /><ContactDropdown name="designation" label="Designation" options={designationColumn?.options ?? []} unavailable={!designationColumn} /><ContactDropdown name="departmentFunction" label="Department/Function" options={departmentColumn?.options ?? []} unavailable={!departmentColumn} /><label className="block text-xs font-bold text-slate-700">Contact type<select name="contactType" defaultValue="secondary" className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-red-400"><option value="secondary">Secondary</option><option value="primary">Primary</option></select></label></div><p className="mt-3 text-[11px] text-slate-500">Saving a new Primary contact updates the lead and moves the previous lead contact into the Secondary list.</p>{message && <p className={`mt-3 text-xs font-bold ${message.includes("added") || message.includes("updated") || message.includes("now the Primary") ? "text-emerald-700" : "text-red-600"}`}>{message}</p>}<div className="mt-4 flex justify-end"><button type="submit" disabled={isPending} className="h-9 rounded-lg bg-[#d90000] px-4 text-sm font-extrabold text-white disabled:opacity-60">{isPending ? "Saving..." : "Add contact"}</button></div></form>}<div className="mt-4 space-y-3">{loading ? <p className="text-sm font-semibold text-slate-400">Loading contacts...</p> : contacts.length ? contacts.map((contact) => <article key={contact.id} className={`rounded-xl border p-4 ${contact.contact_type === "primary" ? "border-red-200 bg-red-50/30" : "border-slate-200 bg-white"}`}><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-sm font-extrabold text-slate-900">{[contact.first_name, contact.last_name].filter(Boolean).join(" ")}</p><p className="mt-0.5 text-xs font-semibold text-slate-500">{contact.designation || "No designation"}{contact.department_function ? ` · ${contact.department_function}` : ""}</p>{(contact.phone || contact.email) && <p className="mt-1 text-xs text-slate-600">{[contact.phone, contact.email].filter(Boolean).join(" · ")}</p>}{dialMessages[contact.id] && <p className="mt-1 text-[10px] font-bold text-emerald-700">{dialMessages[contact.id]}</p>}</div><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide ${contact.contact_type === "primary" ? "bg-red-600 text-white" : "bg-slate-100 text-slate-600"}`}>{contact.contact_type}</span>{!readOnly && <button type="button" disabled={!contact.phone || dialingId === contact.id} onClick={() => callContact(contact)} title={contact.phone ? `Call ${contact.phone}` : "No phone number"} className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-red-500 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"><PhoneCall className="h-3.5 w-3.5" /></button>}{!readOnly && <button type="button" disabled={!contact.email} onClick={() => setEmailingContact(contact)} title={contact.email ? `Email ${contact.email}` : "No email address"} className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"><Mail className="h-3.5 w-3.5" /></button>}{!readOnly && <button type="button" onClick={() => setEditingContact(contact)} title="Edit contact" className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-red-50 hover:text-red-600"><Pencil className="h-3.5 w-3.5" /></button>}{!readOnly && contact.contact_type === "secondary" && <button type="button" disabled={isPending} onClick={() => makePrimary(contact.id)} className="h-8 rounded-lg border border-red-200 bg-white px-2.5 text-[10px] font-extrabold text-red-600 hover:bg-red-50 disabled:opacity-50">Make primary</button>}</div></div></article>) : <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm font-semibold text-slate-500">No Secondary contacts have been added to this lead.</p>}</div>{editingContact && <EditContactModal contact={editingContact} leadId={leadId} assignmentId={assignmentId} designationOptions={designationColumn?.options ?? []} departmentOptions={departmentColumn?.options ?? []} onClose={() => setEditingContact(null)} onSaved={() => { setEditingContact(null); void loadContacts(); onSaved(); router.refresh(); }} />}{emailingContact?.email && <ContactEmailModal leadId={leadId} assignmentId={assignmentId} to={emailingContact.email} name={[emailingContact.first_name, emailingContact.last_name].filter(Boolean).join(" ")} onClose={() => setEmailingContact(null)} onSent={() => { onSaved(); router.refresh(); }} />}</section>;
}

function EditContactModal({ contact, leadId, assignmentId, designationOptions, departmentOptions, onClose, onSaved }: { contact: LeadContact; leadId: string; assignmentId: string; designationOptions: string[]; departmentOptions: string[]; onClose: () => void; onSaved: () => void }) {
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("leadId", leadId); formData.set("assignmentId", assignmentId); formData.set("contactId", contact.id);
      formData.set("firstName", String(form.get("firstName") ?? ""));
      formData.set("lastName", String(form.get("lastName") ?? ""));
      formData.set("email", String(form.get("email") ?? ""));
      formData.set("phone", String(form.get("phone") ?? ""));
      formData.set("designation", String(form.get("designation") ?? ""));
      formData.set("departmentFunction", String(form.get("departmentFunction") ?? ""));
      const result = await updateLeadContact(formData);
      if (!result.ok) { setMessage(result.message); return; }
      onSaved();
    });
  };
  if (typeof document === "undefined") return null;
  return createPortal(<div className="fixed inset-0 z-[120] grid place-items-center bg-slate-950/35 p-4" role="dialog" aria-modal="true" aria-label={`Edit ${contact.first_name}`}>
    <form onSubmit={submit} className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl">
      <div className="flex items-start justify-between gap-3"><h3 className="text-base font-extrabold text-slate-900">Edit contact</h3><button type="button" onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"><X className="h-4 w-4" /></button></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="block text-xs font-bold text-slate-700">First name *<input name="firstName" defaultValue={contact.first_name} required maxLength={120} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-red-400" /></label><label className="block text-xs font-bold text-slate-700">Last name<input name="lastName" defaultValue={contact.last_name ?? ""} maxLength={120} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-red-400" /></label><label className="block text-xs font-bold text-slate-700">Email<input name="email" type="email" defaultValue={contact.email ?? ""} maxLength={254} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-red-400" /></label><label className="block text-xs font-bold text-slate-700">Phone<input name="phone" type="tel" defaultValue={contact.phone ?? ""} maxLength={20} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-red-400" /></label><ContactDropdown name="designation" label="Designation" options={designationOptions} unavailable={!designationOptions.length} /><ContactDropdown name="departmentFunction" label="Department/Function" options={departmentOptions} unavailable={!departmentOptions.length} /></div>
      {message && <p className="mt-3 text-xs font-bold text-red-600">{message}</p>}
      <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={onClose} className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-600">Cancel</button><button type="submit" disabled={isPending} className="h-9 rounded-lg bg-[#d90000] px-4 text-sm font-extrabold text-white hover:bg-red-700 disabled:opacity-60">{isPending ? "Saving..." : "Save changes"}</button></div>
    </form>
  </div>, document.body);
}

function ContactEmailModal({ leadId, assignmentId, to, name, onClose, onSent }: { leadId: string; assignmentId: string; to: string; name: string; onClose: () => void; onSent: () => void }) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    startTransition(async () => {
      const formData = new FormData();
      formData.set("leadId", leadId); formData.set("assignmentId", assignmentId); formData.set("to", to); formData.set("subject", subject); formData.set("body", body);
      const result = await sendEmailToLeadContact(formData);
      setMessage({ ok: result.ok, text: result.message });
      if (result.ok) { onSent(); window.setTimeout(onClose, 900); }
    });
  };
  if (typeof document === "undefined") return null;
  return createPortal(<div className="fixed inset-0 z-[120] grid place-items-center bg-slate-950/35 p-4" role="dialog" aria-modal="true" aria-label={`Email ${name || to}`}>
    <form onSubmit={submit} className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl">
      <div className="flex items-start justify-between gap-3"><div><h3 className="flex items-center gap-2 text-base font-extrabold text-slate-900"><Mail className="h-4 w-4 text-red-600" />Email {name || to}</h3><p className="mt-1 text-xs text-slate-500">To: {to}. Sent from the assigned Sales Person&apos;s mailbox.</p></div><button type="button" onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"><X className="h-4 w-4" /></button></div>
      <input value={subject} onChange={(event) => setSubject(event.target.value)} required maxLength={200} placeholder="Subject" className="mt-3 h-9 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-red-400" />
      <div className="relative mt-3"><textarea value={body} onChange={(event) => setBody(event.target.value)} required maxLength={10000} placeholder="Write your message..." className="w-full rounded-lg border border-slate-200 px-3 py-2 pr-20 text-sm outline-none focus:border-red-400 min-h-40" /><VoiceDictationButton onResult={(text) => setBody((current) => (current ? `${current} ${text}` : text))} className="absolute right-2 top-2" /></div>
      {message && <p role="status" className={`mt-3 rounded-lg px-3 py-2 text-xs font-bold ${message.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{message.text}</p>}
      <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={onClose} className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-600">Cancel</button><button type="submit" disabled={isPending || !subject.trim() || !body.trim()} className="h-9 rounded-lg bg-[#d90000] px-4 text-sm font-extrabold text-white hover:bg-red-700 disabled:opacity-50">{isPending ? "Sending..." : "Send email"}</button></div>
    </form>
  </div>, document.body);
}

function ContactInput({ name, label, required = false, type = "text" }: { name: string; label: string; required?: boolean; type?: string }) { return <label className="block text-xs font-bold text-slate-700">{label}{required ? " *" : ""}<input name={name} type={type} required={required} maxLength={type === "email" ? 254 : 120} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-red-400" /></label>; }
function ContactDropdown({ name, label, options, unavailable }: { name: string; label: string; options: string[]; unavailable: boolean }) { return <label className="block text-xs font-bold text-slate-700">{label}<select name={name} disabled={unavailable} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-red-400 disabled:cursor-not-allowed disabled:bg-slate-50"><option value="">{unavailable ? `No ${label} dropdown configured` : `Select ${label}`}</option>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>; }
function normalizeContactColumnLabel(value: string) { return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ""); }

function BasicDetailsTab({ lead, columns, assignedName, supplementalDetails = [], detailsExtra, onSaved, readOnly = false }: { lead: LeadRow; columns: LeadColumn[]; assignedName?: string; supplementalDetails?: { label: string; value: string }[]; detailsExtra?: React.ReactNode; onSaved: () => void; readOnly?: boolean }) {
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

function DetailsTab({ lead, columns, assignedName, supplementalDetails = [], detailsExtra, detailConfiguration, salesPersonOptions, canManageAllDetails = false, contactVersion, onSaved, readOnly = false, onChannelPartnersSaved, onSeniorAmbassadorSaved }: { lead: LeadRow; columns: LeadColumn[]; assignedName?: string; supplementalDetails?: { label: string; value: string }[]; detailsExtra?: React.ReactNode; detailConfiguration?: DetailEditableConfiguration; salesPersonOptions?: { id: string; name: string }[]; canManageAllDetails?: boolean; contactVersion: number; onSaved: () => void; readOnly?: boolean; onChannelPartnersSaved?: (leadId: string, ambassadorIds: string[]) => void; onSeniorAmbassadorSaved?: (leadId: string, seniorAmbassadorId: string) => void }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const fields = completeLeadDetailColumns(lead, columns).map((column) => ({ column, value: detailValue(lead, column, assignedName) }));
  const editableFields = fields.filter(({ column }) => isEditableColumn(column, canManageAllDetails));
  const savedAddressValue = (key: "country" | "state" | "city") => fields.find(({ column }) => leadAddressFieldKeyForColumn(column) === key)?.value ?? "";
  const [country, setCountry] = useState(() => savedAddressValue("country"));
  const [state, setState] = useState(() => savedAddressValue("state"));
  const [city, setCity] = useState(() => savedAddressValue("city"));

  const resetLocation = () => {
    setCountry(savedAddressValue("country"));
    setState(savedAddressValue("state"));
    setCity(savedAddressValue("city"));
  };

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const values = editableFields.map(({ column }) => ({ key: column.field_key, value: String(form.get(`field:${column.id}`) ?? "") }));
    startTransition(async () => {
      const formData = new FormData();
      formData.set("leadId", lead.id);
      formData.set("assignmentId", lead.assignment_id);
      formData.set("values", JSON.stringify(values));
      setMessage("");
      try {
        await updateLeadDetails(formData);
        setEditing(false);
        setMessage("Details saved.");
        onSaved();
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Unable to save details.");
      }
    });
  }

  const toggleEditing = () => {
    if (!editing) resetLocation();
    setEditing((value) => !value);
    setMessage("");
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-extrabold text-slate-900">Lead details</h3>
          <p className="mt-1 text-xs text-slate-500">Lead information, address, and custom fields.</p>
        </div>
        {!readOnly && <button type="button" onClick={toggleEditing} className="h-9 rounded-lg border border-red-200 bg-white px-3 text-xs font-extrabold text-red-600 hover:bg-red-50">{editing ? "Cancel" : "Edit details"}</button>}
      </div>
      {message && <p className={`mt-3 rounded-lg px-3 py-2 text-xs font-bold ${message === "Details saved." ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{message}</p>}
      <form onSubmit={submit} className="mt-4">
        <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {fields.map(({ column, value }) => {
            // Keep Details a read-only summary until the user explicitly
            // chooses Edit details. This includes Ambassador and Senior
            // Ambassador, so normal viewing shows their saved names instead
            // of an empty "Select…" dropdown.
            const workflowDropdown = editing && !readOnly && (
              isChannelPartnerColumn(column) ||
              isSeniorAmbassadorColumn(column) ||
              ((column.field_key === "stage" || column.field_key === "call_resolution") && Boolean(detailConfiguration)) ||
              (Boolean(detailConfiguration) && column.field_key === "product") ||
              (canManageAllDetails && Boolean(detailConfiguration) && ["assigned_to", "next_follow_up"].includes(column.field_key))
            );
            return <div key={column.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{column.label}</dt>
              <dd className="mt-1">
                {workflowDropdown
                  ? <DetailWorkflowDropdown lead={lead} column={column} configuration={detailConfiguration} salesPersonOptions={salesPersonOptions} canManageAllDetails={canManageAllDetails} onChannelPartnersSaved={onChannelPartnersSaved} onSeniorAmbassadorSaved={onSeniorAmbassadorSaved} onSaved={() => { onSaved(); router.refresh(); }} />
                  : editing && !readOnly && isEditableColumn(column, canManageAllDetails)
                    ? <AddressDetailInput column={column} value={value} country={country} state={state} city={city} onCountryChange={(value) => { setCountry(value); setState(""); setCity(""); }} onStateChange={(value) => { setState(value); setCity(""); }} onCityChange={setCity} />
                    : <DetailDisplayValue column={column} value={value} />}
              </dd>
            </div>;
          })}
          <SecondaryContactNames leadId={lead.id} assignmentId={lead.assignment_id} refreshVersion={contactVersion} />
          {supplementalDetails.map((field) => <div key={field.label} className="rounded-xl border border-red-100 bg-red-50/40 p-4"><dt className="text-[11px] font-bold uppercase tracking-wide text-red-500">{field.label}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm font-bold text-slate-800">{field.value || "—"}</dd></div>)}
        </dl>
        {editing && !readOnly && <div className="mt-5 flex items-center justify-end gap-2 border-t border-slate-200 pt-4"><p className="mr-auto text-xs text-slate-500">Calculated and system-generated values remain protected. All editable lead fields and dropdowns can be updated here.</p><button type="submit" disabled={isPending} className="h-9 rounded-lg bg-[#d90000] px-4 text-sm font-extrabold text-white hover:bg-red-700 disabled:opacity-60">{isPending ? "Saving..." : "Save changes"}</button></div>}
      </form>
      {detailsExtra}
    </div>
  );
}

function DetailWorkflowDropdown({ lead, column, configuration, salesPersonOptions, canManageAllDetails = false, onSaved, onChannelPartnersSaved, onSeniorAmbassadorSaved }: { lead: LeadRow; column: LeadColumn; configuration?: DetailEditableConfiguration; salesPersonOptions?: { id: string; name: string }[]; canManageAllDetails?: boolean; onSaved: () => void; onChannelPartnersSaved?: (leadId: string, ambassadorIds: string[]) => void; onSeniorAmbassadorSaved?: (leadId: string, seniorAmbassadorId: string) => void }) {
  if (isChannelPartnerColumn(column)) {
    return <ChannelPartnerSelect leadId={lead.id} assignmentId={lead.assignment_id} names={lead.channel_partner_name} options={lead.channel_partner_options ?? []} selectedIds={lead.channel_partner_ids ?? []} onSaved={(ambassadorIds) => { onChannelPartnersSaved?.(lead.id, ambassadorIds); onSaved(); }} />;
  }
  if (isSeniorAmbassadorColumn(column)) {
    return <SeniorAmbassadorSelect leadId={lead.id} assignmentId={lead.assignment_id} selected={lead.senior_ambassador} options={lead.senior_ambassador_options ?? []} onSaved={(seniorAmbassadorId) => { onSeniorAmbassadorSaved?.(lead.id, seniorAmbassadorId); onSaved(); }} />;
  }
  if (!configuration) return null;
  if (column.field_key === "product") return <DetailProductDropdown lead={lead} products={configuration.products} onSaved={onSaved} />;
  if (canManageAllDetails && column.field_key === "assigned_to") return <DetailSalesPersonDropdown lead={lead} options={salesPersonOptions ?? []} onSaved={onSaved} />;
  if (canManageAllDetails && column.field_key === "next_follow_up") return <DetailFollowUpDropdown lead={lead} onSaved={onSaved} />;
  if (column.field_key === "stage") return <DetailStageDropdown lead={lead} configuration={configuration} onSaved={onSaved} />;
  if (column.field_key === "call_resolution") return <DetailResolutionDropdown lead={lead} configuration={configuration} onSaved={onSaved} />;
  return null;
}

function DetailProductDropdown({ lead, products, onSaved }: { lead: LeadRow; products: DetailEditableConfiguration["products"]; onSaved: () => void }) {
  const savedProductId = lead.product?.[0]?.id ?? "";
  const [value, setValue] = useState(savedProductId);
  const [additionalProductId, setAdditionalProductId] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => setValue(savedProductId), [savedProductId]);

  const save = (productId: string) => startTransition(async () => {
    const formData = new FormData();
    formData.set("leadId", lead.id);
    formData.set("assignmentId", lead.assignment_id);
    formData.set("productId", productId);
    setError("");
    try {
      await updateLeadProductInline(formData);
      onSaved();
    } catch (saveError) {
      setValue(savedProductId);
      setError(saveError instanceof Error ? saveError.message : "Unable to update the product.");
    }
  });

  const addAnother = (productId: string) => startTransition(async () => {
    const formData = new FormData();
    formData.set("leadId", lead.id);
    formData.set("sourceAssignmentId", lead.assignment_id);
    formData.set("productId", productId);
    setError("");
    try {
      await addProductToLeadDetails(formData);
      setAdditionalProductId("");
      onSaved();
    } catch (saveError) {
      setAdditionalProductId("");
      setError(saveError instanceof Error ? saveError.message : "Unable to add this product.");
    }
  });

  // Ambassador product work is created only through the dedicated Ambassador
  // flows, which apply the matching Pre Sales/Onboarding routing. Keep it out
  // of this generic "add another product" picker so it can't be attached to
  // a lead without that routing.
  const addableProducts = products.filter((product) => product.id !== savedProductId && product.code !== "AMBASSADOR" && !lead.product_assignments.some((assignment) => assignment.product?.id === product.id));
  return <div className="space-y-2"><select aria-label="Product" value={value} disabled={isPending || !products.length} onChange={(event) => { const productId = event.target.value; setValue(productId); if (productId) save(productId); }} className="h-9 w-full rounded border border-slate-200 bg-white px-2 text-sm font-semibold text-slate-700 outline-none focus:border-red-400 disabled:bg-slate-50"><option value="" disabled>Select product</option>{products.map((product) => <option key={product.id} value={product.id}>{displayProductCode(product.code, product.name)}</option>)}</select><select aria-label="Add another product" value={additionalProductId} disabled={isPending || !addableProducts.length} onChange={(event) => { const productId = event.target.value; setAdditionalProductId(productId); if (productId) addAnother(productId); }} className="h-8 w-full rounded border border-dashed border-red-200 bg-red-50/40 px-2 text-xs font-bold text-red-600 outline-none focus:border-red-400 disabled:bg-slate-50 disabled:text-slate-400"><option value="">{addableProducts.length ? "+ Add another product" : "All products already added"}</option>{addableProducts.map((product) => <option key={product.id} value={product.id}>{displayProductCode(product.code, product.name)}</option>)}</select>{error && <p className="mt-1 text-[11px] font-bold text-red-600">{error}</p>}</div>;
}

function DetailSalesPersonDropdown({ lead, options, onSaved }: { lead: LeadRow; options: { id: string; name: string }[]; onSaved: () => void }) {
  const savedAssigneeId = lead.assigned_to ?? "";
  const [value, setValue] = useState(savedAssigneeId);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => setValue(savedAssigneeId), [savedAssigneeId]);

  const save = (assigneeId: string) => startTransition(async () => {
    const formData = new FormData();
    formData.set("assignmentId", lead.assignment_id);
    formData.set("assigneeId", assigneeId);
    setError("");
    try {
      await manuallyAssignLeads(formData);
      onSaved();
    } catch (saveError) {
      setValue(savedAssigneeId);
      setError(saveError instanceof Error ? saveError.message : "Unable to assign this lead.");
    }
  });

  if (!options.length) return <span className="text-sm font-bold text-slate-500">Unassigned</span>;
  return <div><select aria-label="Assigned sales person" value={value} disabled={isPending} onChange={(event) => { const assigneeId = event.target.value; setValue(assigneeId); if (assigneeId && assigneeId !== savedAssigneeId) save(assigneeId); }} className="h-9 w-full rounded border border-slate-200 bg-white px-2 text-sm font-semibold text-slate-700 outline-none focus:border-red-400 disabled:bg-slate-50"><option value="" disabled>Choose sales person</option>{options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select>{error && <p className="mt-1 text-[11px] font-bold text-red-600">{error}</p>}</div>;
}

function DetailFollowUpDropdown({ lead, onSaved }: { lead: LeadRow; onSaved: () => void }) {
  const savedValue = toDateTimeLocal(lead.next_follow_up_at);
  const [value, setValue] = useState(savedValue);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => setValue(savedValue), [savedValue]);

  const save = () => {
    if (!value) {
      setError("Choose a follow-up date and time.");
      return;
    }
    startTransition(async () => {
      const formData = new FormData();
      formData.set("leadId", lead.id);
      formData.set("assignmentId", lead.assignment_id);
      formData.set("followUpAt", value);
      setError("");
      try {
        await updateLeadFollowUp(formData);
        onSaved();
      } catch (saveError) {
        setError(saveError instanceof Error ? saveError.message : "Unable to save the follow-up date.");
      }
    });
  };

  return <div className="flex flex-wrap gap-2"><input aria-label="Next follow-up" type="datetime-local" value={value} disabled={isPending} onChange={(event) => setValue(event.target.value)} className="h-9 min-w-0 flex-1 rounded border border-slate-200 bg-white px-2 text-sm font-semibold text-slate-700 outline-none focus:border-red-400 disabled:bg-slate-50" /><button type="button" disabled={isPending || !value || value === savedValue} onClick={save} className="h-9 rounded border border-red-200 bg-white px-2.5 text-xs font-extrabold text-red-600 hover:bg-red-50 disabled:opacity-50">{isPending ? "Saving..." : "Save"}</button>{error && <p className="basis-full text-[11px] font-bold text-red-600">{error}</p>}</div>;
}

function DetailStageDropdown({ lead, configuration, onSaved }: { lead: LeadRow; configuration: DetailEditableConfiguration; onSaved: () => void }) {
  const productId = lead.product?.[0]?.id ?? "";
  const stages = configuration.stages.filter((stage) => stage.product_id === productId);
  const savedStageId = stages.find((stage) => stage.name === lead.stage?.[0]?.name)?.id ?? "";
  const [value, setValue] = useState(savedStageId);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => setValue(savedStageId), [savedStageId]);

  const save = (stageId: string) => startTransition(async () => {
    const formData = new FormData();
    formData.set("leadId", lead.id);
    formData.set("assignmentId", lead.assignment_id);
    formData.set("stageId", stageId);
    setError("");
    try {
      await updateLeadStageInline(formData);
      onSaved();
    } catch (saveError) {
      setValue(savedStageId);
      setError(saveError instanceof Error ? saveError.message : "Unable to update the stage.");
    }
  });

  return <div>
    <select aria-label="Stage" value={value} disabled={isPending || !stages.length} onChange={(event) => { const stageId = event.target.value; setValue(stageId); if (stageId) save(stageId); }} className="h-9 w-full rounded border border-slate-200 bg-white px-2 text-sm font-semibold text-slate-700 outline-none focus:border-red-400 disabled:bg-slate-50"><option value="" disabled>{productId ? "Select stage" : "Select product first"}</option>{stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</select>
    {error && <p className="mt-1 text-[11px] font-bold text-red-600">{error}</p>}
  </div>;
}

function DetailResolutionDropdown({ lead, configuration, onSaved }: { lead: LeadRow; configuration: DetailEditableConfiguration; onSaved: () => void }) {
  const productId = lead.product?.[0]?.id ?? "";
  const resolutions = configuration.productResolutions.filter((resolution) => resolution.product_id === productId);
  const savedResolutionId = resolutions.find((resolution) => resolution.resolution_name === lead.resolution?.[0]?.name)?.resolution_id ?? "";
  const [value, setValue] = useState(savedResolutionId);
  const [followUpResolutionId, setFollowUpResolutionId] = useState<string | null>(null);
  const [followUpAt, setFollowUpAt] = useState("");
  const [followUpNote, setFollowUpNote] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => setValue(savedResolutionId), [savedResolutionId]);

  const save = (resolutionId: string, nextFollowUpAt?: string, nextFollowUpNote?: string) => startTransition(async () => {
    const formData = new FormData();
    formData.set("leadId", lead.id);
    formData.set("assignmentId", lead.assignment_id);
    formData.set("resolutionId", resolutionId);
    if (nextFollowUpAt) formData.set("followUpAt", nextFollowUpAt);
    if (nextFollowUpNote) formData.set("followUpNote", nextFollowUpNote);
    setError("");
    try {
      await updateLeadResolutionInline(formData);
      setFollowUpResolutionId(null);
      setFollowUpAt("");
      setFollowUpNote("");
      onSaved();
    } catch (saveError) {
      if (!followUpResolutionId) setValue(savedResolutionId);
      setError(saveError instanceof Error ? saveError.message : "Unable to update the activity resolution.");
    }
  });

  const chooseResolution = (resolutionId: string) => {
    setValue(resolutionId);
    const resolution = resolutions.find((item) => item.resolution_id === resolutionId);
    if (/follow[\s-]?up|verbal\s*yes/i.test(resolution?.resolution_name ?? "")) {
      setFollowUpResolutionId(resolutionId);
      setError("");
      return;
    }
    setFollowUpResolutionId(null);
    save(resolutionId);
  };

  return <div>
    <ResolutionPicker value={value} options={resolutions.map((resolution) => ({ value: resolution.resolution_id, label: resolution.resolution_name }))} disabled={isPending} placeholder={productId ? "Select activity resolution" : "Select product first"} onChoose={chooseResolution} wide />
    {followUpResolutionId && <div className="mt-2 space-y-2 rounded-lg border border-red-100 bg-red-50/50 p-2"><label className="block text-[11px] font-bold text-slate-700">Follow-up date and time<input type="datetime-local" value={followUpAt} onChange={(event) => setFollowUpAt(event.target.value)} className="mt-1 h-8 w-full rounded border border-slate-200 bg-white px-2 text-xs" /></label><label className="block text-[11px] font-bold text-slate-700">Follow-up note<textarea value={followUpNote} onChange={(event) => setFollowUpNote(event.target.value)} className="mt-1 min-h-16 w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs" /></label><div className="flex justify-end gap-2"><button type="button" disabled={isPending} onClick={() => { setFollowUpResolutionId(null); setValue(savedResolutionId); }} className="h-8 rounded border border-slate-200 px-2 text-[11px] font-bold text-slate-600">Cancel</button><button type="button" disabled={isPending || !followUpAt || !followUpNote.trim()} onClick={() => save(followUpResolutionId, followUpAt, followUpNote)} className="h-8 rounded bg-[#d90000] px-2 text-[11px] font-extrabold text-white disabled:opacity-50">{isPending ? "Saving..." : "Save resolution"}</button></div></div>}
    {error && <p className="mt-1 text-[11px] font-bold text-red-600">{error}</p>}
  </div>;
}

function SecondaryContactNames({ leadId, assignmentId, refreshVersion }: { leadId: string; assignmentId: string; refreshVersion: number }) {
  const [contacts, setContacts] = useState<LeadContact[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`/api/leads/${leadId}/contacts?assignmentId=${encodeURIComponent(assignmentId)}`, { cache: "no-store" })
      .then(async (response) => ({ response, result: await response.json() as { ok?: boolean; contacts?: LeadContact[] } }))
      .then(({ response, result }) => {
        if (!response.ok || !result.ok) throw new Error("Unable to load contacts.");
        if (active) setContacts(result.contacts ?? []);
      })
      .catch(() => {
        if (active) setContacts([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [leadId, assignmentId, refreshVersion]);

  const names = contacts
    .filter((contact) => contact.contact_type === "secondary")
    .map((contact) => [contact.first_name, contact.last_name].filter(Boolean).join(" "))
    .filter(Boolean);

  return <div className="rounded-xl border border-slate-200 bg-white p-4">
    <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{names.length === 1 ? "Secondary contact full name" : "Secondary contact full names"}</dt>
    <dd className="mt-1 whitespace-pre-wrap break-words text-sm font-bold text-slate-800">{loading ? "Loading..." : names.join(", ") || "—"}</dd>
  </div>;
}

function NotesTab({ leadId, assignmentId, onSaved }: { leadId: string; assignmentId: string; onSaved: () => void }) {
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [transcriptsLoading, setTranscriptsLoading] = useState(true);
  const [callId, setCallId] = useState("");
  function loadTranscripts() { setTranscriptsLoading(true); fetch(`/api/leads/${leadId}/transcripts`, { cache: "no-store" }).then((response) => response.json() as Promise<{ ok?: boolean; transcripts?: Transcript[] }>).then((result) => { if (result.ok) setTranscripts(result.transcripts ?? []); }).catch(() => undefined).finally(() => setTranscriptsLoading(false)); }
  useEffect(() => {
    let active = true;
    fetch(`/api/leads/${leadId}/transcripts`, { cache: "no-store" })
      .then((response) => response.json() as Promise<{ ok?: boolean; transcripts?: Transcript[] }>)
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
  return <div><div className="flex flex-wrap items-end justify-between gap-3"><div><h3 className="text-base font-extrabold text-slate-900">Notes</h3><p className="mt-1 text-xs text-slate-500">Notes and full Altus Contact call transcripts for this lead.</p></div><button type="button" onClick={syncTranscripts} disabled={isPending} className="h-9 rounded-lg border border-red-200 bg-white px-3 text-xs font-extrabold text-red-600 hover:bg-red-50 disabled:opacity-50">{isPending ? "Syncing..." : "Sync call transcripts"}</button></div><form onSubmit={syncCallId} className="mt-3 flex max-w-3xl gap-2 rounded-xl border border-slate-200 bg-white p-3"><input value={callId} onChange={(event) => setCallId(event.target.value)} inputMode="numeric" pattern="[0-9]*" placeholder="Altus call ID (for example 39083)" className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-red-400" /><button type="submit" disabled={isPending || !callId} className="h-9 shrink-0 rounded-lg border border-red-200 px-3 text-xs font-extrabold text-red-600 disabled:opacity-50">Sync this call</button></form><form onSubmit={submit} className="mt-4 max-w-3xl rounded-xl border border-slate-200 bg-white p-4"><div className="relative"><textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} required placeholder="Write a note about this lead..." className="min-h-32 w-full rounded-lg border border-slate-200 px-3 py-2 pr-20 text-sm outline-none focus:border-red-400" /><VoiceDictationButton onResult={(text) => setNote((current) => (current ? `${current} ${text}` : text))} className="absolute right-2 top-2" /></div><div className="mt-3 flex items-center justify-between gap-3"><span className="text-xs text-slate-400">{note.length}/2000</span><button type="submit" disabled={isPending || !note.trim()} className="h-9 rounded-lg bg-[#d90000] px-4 text-sm font-extrabold text-white disabled:opacity-50">{isPending ? "Saving..." : "Save note"}</button></div>{message && <p className="mt-3 text-xs font-bold text-emerald-700">{message}</p>}</form><section className="mt-4 max-w-3xl"><h4 className="text-sm font-extrabold text-slate-800">Call transcripts</h4>{transcriptsLoading ? <p className="mt-2 text-xs text-slate-400">Loading transcripts...</p> : transcripts.length ? <div className="mt-2 space-y-3">{transcripts.map((transcript) => <article key={transcript.id} className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex justify-between gap-3"><p className="text-xs font-extrabold text-slate-700">Altus call #{transcript.altus_call_id}</p><p className="text-[10px] font-semibold text-slate-400">{formatCrmDate(transcript.updated_at)}</p></div>
        {transcript.summary && <div className="mt-3 rounded-lg bg-slate-50 p-3"><p className="text-[11px] font-extrabold uppercase tracking-wide text-slate-400">AI summary{transcript.language ? ` · ${transcript.language}` : ""}</p><p className="mt-1 text-sm text-slate-700">{transcript.summary}</p>
          {transcript.key_points.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-600">{transcript.key_points.map((point, i) => <li key={i}>{point}</li>)}</ul>}
          {(transcript.sentiment || transcript.disposition) && <p className="mt-2 text-[11px] font-bold text-slate-500">{[transcript.sentiment, transcript.disposition].filter(Boolean).join(" · ")}</p>}</div>}
        <details className="mt-3"><summary className="cursor-pointer text-[11px] font-extrabold text-red-600">View full transcript</summary><pre className="mt-2 whitespace-pre-wrap font-sans text-sm leading-6 text-slate-600">{transcript.transcript_text}</pre></details>
      </article>)}</div> : <p className="mt-2 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-4 text-xs text-slate-500">No call transcripts saved yet. Use Sync after Altus Contacts has processed the call.</p>}</section></div>;
}

type ProductAssignment = LeadRow["product_assignments"][number];
type Transcript = { id: string; altus_call_id: string; transcript_text: string; summary: string | null; key_points: string[]; action_items: string[]; sentiment: string | null; disposition: string | null; language: string | null; lead_product_assignment_id: string | null; updated_at: string };

function TranscriptTab({ leadId, selectedAssignmentId, assignments, transcripts, onSaved }: { leadId: string; selectedAssignmentId: string; assignments: ProductAssignment[]; transcripts: Transcript[]; onSaved: () => void }) {
  const [callId, setCallId] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const selectedProduct = displayProductCode(assignments.find((assignment) => assignment.id === selectedAssignmentId)?.product?.code, "selected product");
  const unassigned = transcripts.filter((item) => !item.lead_product_assignment_id);
  const syncAll = () => startTransition(async () => { const formData = new FormData(); formData.set("leadId", leadId); formData.set("assignmentId", selectedAssignmentId); const result = await syncLeadCallTranscripts(formData); setMessage(result.message); if (result.ok) onSaved(); });
  const syncOne = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); startTransition(async () => { const formData = new FormData(); formData.set("leadId", leadId); formData.set("assignmentId", selectedAssignmentId); formData.set("callId", callId); const result = await syncLeadTranscriptByCallId(formData); setMessage(result.message); if (result.ok) { setCallId(""); onSaved(); } }); };
  const attach = (transcriptId: string) => startTransition(async () => { const formData = new FormData(); formData.set("leadId", leadId); formData.set("transcriptId", transcriptId); formData.set("assignmentId", selectedAssignmentId); try { await attachTranscriptToProduct(formData); setMessage(`Transcript attached to ${selectedProduct}. It now appears on the call in Activity.`); onSaved(); } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to attach transcript."); } });
  return <section className="max-w-4xl"><div className="flex flex-wrap items-end justify-between gap-3"><div><h3 className="text-base font-extrabold text-slate-900">Unassigned transcripts</h3><p className="mt-1 text-xs text-slate-500">Attach a transcript to {selectedProduct}. Once attached it moves to the call in Activity, under View transcript.</p></div><button type="button" onClick={syncAll} disabled={isPending} className="h-9 rounded-lg border border-red-200 bg-white px-3 text-xs font-extrabold text-red-600 disabled:opacity-50">{isPending ? "Syncing..." : "Sync transcripts"}</button></div><form onSubmit={syncOne} className="mt-3 flex gap-2 rounded-xl border border-slate-200 bg-white p-3"><input value={callId} onChange={(event) => setCallId(event.target.value)} inputMode="numeric" placeholder="Altus call ID" className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-red-400" /><button type="submit" disabled={isPending || !callId} className="h-9 rounded-lg border border-red-200 px-3 text-xs font-extrabold text-red-600 disabled:opacity-50">Sync call</button></form>{message && <p className="mt-3 text-xs font-bold text-emerald-700">{message}</p>}<div className="mt-4 space-y-3">{unassigned.length ? unassigned.map((transcript) => <article key={transcript.id} className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-extrabold text-slate-700">Altus call #{transcript.altus_call_id}</p><button type="button" disabled={isPending} onClick={() => attach(transcript.id)} className="rounded border border-red-200 px-2 py-1 text-[10px] font-extrabold text-red-600 disabled:opacity-50">Attach to {selectedProduct}</button></div><pre className="mt-3 whitespace-pre-wrap font-sans text-sm leading-6 text-slate-600">{transcript.transcript_text}</pre></article>) : <p className="rounded-lg border border-dashed border-slate-300 bg-white px-3 py-4 text-xs text-slate-500">No unassigned transcripts. Attached transcripts are on their calls in Activity.</p>}</div></section>;
}

function appendDictatedText(element: HTMLInputElement | HTMLTextAreaElement | null, text: string) {
  if (!element) return;
  element.value = element.value ? `${element.value} ${text}` : text;
}

function DetailInput({ column, value }: { column: LeadColumn; value: string }) {
  const className = "mt-1 h-9 w-full rounded border border-slate-200 bg-white px-2 text-sm font-semibold text-slate-700 outline-none focus:border-red-400";
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  if (column.field_type === "dropdown") return <select name={`field:${column.id}`} defaultValue={value} className={className}><option value="">Select</option>{(column.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}</select>;
  if (column.field_type === "checkbox") return <label className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-slate-700"><input name={`field:${column.id}`} type="checkbox" value="true" defaultChecked={value === "true"} className="h-4 w-4 rounded border-slate-300 accent-red-600" />Yes</label>;
  if (column.field_type === "textarea" || column.field_type === "long_text") return <div className="relative"><textarea ref={textareaRef} name={`field:${column.id}`} defaultValue={value} className="mt-1 min-h-20 w-full rounded border border-slate-200 bg-white px-2 py-2 pr-20 text-sm font-semibold text-slate-700 outline-none focus:border-red-400" /><VoiceDictationButton onResult={(text) => appendDictatedText(textareaRef.current, text)} className="absolute right-1 top-2" /></div>;
  const isFreeText = !column.field_type || column.field_type === "text";
  const input = <input ref={inputRef} name={`field:${column.id}`} type={column.field_type === "date" ? "date" : column.field_type === "number" ? "number" : "text"} inputMode={column.field_type === "link" ? "url" : undefined} placeholder={column.field_type === "link" ? "https:// or www." : undefined} pattern={column.field_type === "link" ? "(https://|www\\.).+" : undefined} title={column.field_type === "link" ? "Start the link with https:// or www." : undefined} defaultValue={column.field_type === "date" ? dateInputValue(value) : value} className={isFreeText ? `${className} pr-16` : className} />;
  if (!isFreeText) return input;
  return <div className="relative">{input}<VoiceDictationButton onResult={(text) => appendDictatedText(inputRef.current, text)} className="absolute right-1 top-1.5" /></div>;
}
function AddressDetailInput({ column, value, country, state, city, onCountryChange, onStateChange, onCityChange }: { column: LeadColumn; value: string; country: string; state: string; city: string; onCountryChange: (value: string) => void; onStateChange: (value: string) => void; onCityChange: (value: string) => void }) {
  const field = leadAddressFieldKeyForColumn(column);
  const className = "mt-1 h-9 w-full rounded border border-slate-200 bg-white px-2 text-sm font-semibold text-slate-700 outline-none focus:border-red-400 disabled:cursor-not-allowed disabled:bg-slate-50";
  if (field === "country") return <select name={`field:${column.id}`} value={country} onChange={(event) => onCountryChange(event.target.value)} className={className}><option value="">Select Country</option>{LEAD_ADDRESS_COUNTRIES.map((option) => <option key={option} value={option}>{option}</option>)}</select>;
  if (field === "state") return <select name={`field:${column.id}`} value={state} disabled={!country} onChange={(event) => onStateChange(event.target.value)} className={className}><option value="">{country ? "Select State" : "Select Country first"}</option>{locationStates(country).map((option) => <option key={option} value={option}>{option}</option>)}</select>;
  if (field === "city") return <select name={`field:${column.id}`} value={city} disabled={!country || !state} onChange={(event) => onCityChange(event.target.value)} className={className}><option value="">{state ? "Select City" : "Select State first"}</option>{locationCities(country, state).map((option) => <option key={option} value={option}>{option}</option>)}</select>;
  return <DetailInput column={column} value={value} />;
}
function DetailDisplayValue({ column, value }: { column: LeadColumn; value: string }) {
  if (column.field_type === "link" && value) {
    const href = value.startsWith("www.") ? `https://${value}` : value;
    return <a href={href} target="_blank" rel="noreferrer" className="break-all text-sm font-extrabold text-red-600 underline underline-offset-2 hover:text-red-800">Open link</a>;
  }
  return <span className="whitespace-pre-wrap break-words text-sm font-bold text-slate-800">{value || "—"}</span>;
}
function isLeadNumberColumn(column: LeadColumn) { return column.field_key === "lead_number" || ["lead no", "lead number"].includes(column.label.trim().toLowerCase()); }
function isLeadAcquisitionDateColumn(column: LeadColumn) { return column.field_key === "lead_acquisition_date" || column.label.trim().toLowerCase() === "lead acquisition date"; }
function isEditableColumn(column: LeadColumn, canManageAllDetails = false) { return !isChannelPartnerColumn(column) && !isSeniorAmbassadorColumn(column) && (!column.read_only || canManageAllDetails) && !column.computed_from?.length && !isLeadNumberColumn(column) && !isLeadAcquisitionDateColumn(column) && !["product", "stage", "call_resolution", "assigned_to", "next_follow_up", "created_at", "bant"].includes(column.field_key); }
function detailValue(lead: LeadRow, column: LeadColumn, assignedName?: string) { if (isChannelPartnerColumn(column)) return lead.channel_partner_name ?? ""; if (isSeniorAmbassadorColumn(column)) return lead.senior_ambassador?.name ?? ""; if (column.computed_from?.length) return column.computed_from.map((field) => field === "first_name" ? lead.first_name : field === "last_name" ? lead.last_name : field === "email" ? lead.email : field === "phone" ? lead.phone : lead.custom_data?.[field]).filter((value): value is string | number => typeof value === "string" || typeof value === "number").join(" "); if (isLeadNumberColumn(column)) return lead.lead_number ? `L-${lead.lead_number}` : ""; if (isLeadAcquisitionDateColumn(column)) return formatCrmDate(lead.created_at); switch (column.field_key) { case "lead_name": return [lead.first_name, lead.last_name].filter(Boolean).join(" "); case "first_name": return lead.first_name; case "last_name": return lead.last_name ?? ""; case "email": return lead.email ?? ""; case "phone": return lead.phone ?? ""; case "product": return lead.product?.[0] ? displayProductCode(lead.product[0].code) : ""; case "stage": return lead.stage?.[0]?.name ?? ""; case "call_resolution": return lead.resolution?.[0]?.name ?? ""; case "assigned_to": return assignedName ?? ""; case "focused_on": return lead.focused_on ? formatCrmDate(lead.focused_on) : ""; case "last_called_on": case "last_called_at": return lead.last_called_at ? formatCrmDate(lead.last_called_at) : ""; case "next_follow_up": return lead.next_follow_up_at ? formatCrmDate(lead.next_follow_up_at) : ""; case "assigned_at": return lead.assigned_at ? formatCrmDate(lead.assigned_at) : ""; case "created_at": return formatCrmDate(lead.created_at); default: return storedDetailValue(lead.custom_data?.[column.field_key]); } }
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
