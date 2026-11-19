"use client";

import { useState, useTransition, type ChangeEvent, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { CalendarPlus, Paperclip } from "lucide-react";
import { createLeadNoteWithAttachment, updateLeadFollowUp } from "@/app/dashboard/leads/actions";
import { VoiceDictationButton } from "./voice-dictation-button";
import { googleCalendarCreateUrl } from "@/app/lib/google-calendar-link";

type UploadTicket = { url: string; leadId: string; assignmentId: string; nonce: string; expires: number; signature: string };
type UploadedAttachment = { url: string; name: string; mime: string; size: number };
const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024;

export function LeadNoteActivity({ leadId, assignmentId, leadName, onSaved, readOnly = false }: { leadId: string; assignmentId: string; leadName?: string; onSaved: () => void; readOnly?: boolean }) {
  const [selected, setSelected] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [followUpAt, setFollowUpAt] = useState("");
  const [calendarUrl, setCalendarUrl] = useState("");
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  const close = () => { if (!isPending) { setSelected(""); setNote(""); setFile(null); setMessage(""); setShowFollowUp(false); setFollowUpAt(""); setCalendarUrl(""); setSaved(false); } };
  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null;
    if (nextFile && nextFile.size > MAX_ATTACHMENT_BYTES) { setFile(null); setMessage("Attachments must be 100 MB or smaller."); return; }
    setFile(nextFile); setMessage("");
  };
  const uploadFile = async (selectedFile: File): Promise<UploadedAttachment> => {
    const ticketResponse = await fetch("/api/lead-attachments/ticket", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ leadId, assignmentId }) });
    const ticketPayload = await ticketResponse.json() as { ok?: boolean; error?: string; upload?: UploadTicket };
    if (!ticketResponse.ok || !ticketPayload.ok || !ticketPayload.upload) throw new Error(ticketPayload.error ?? "Unable to prepare the upload.");
    const body = new FormData();
    body.set("file", selectedFile);
    body.set("lead_id", ticketPayload.upload.leadId);
    body.set("assignment_id", ticketPayload.upload.assignmentId);
    body.set("nonce", ticketPayload.upload.nonce);
    body.set("expires", String(ticketPayload.upload.expires));
    body.set("signature", ticketPayload.upload.signature);
    const uploadResponse = await fetch(ticketPayload.upload.url, { method: "POST", body });
    const uploadPayload = await uploadResponse.json() as { ok?: boolean; error?: string; url?: string; name?: string; mime?: string; size?: number };
    if (!uploadResponse.ok || !uploadPayload.ok || !uploadPayload.url || !uploadPayload.name || !uploadPayload.mime || !uploadPayload.size) throw new Error(uploadPayload.error ?? "The CDN could not upload this attachment.");
    return { url: uploadPayload.url, name: uploadPayload.name, mime: uploadPayload.mime, size: uploadPayload.size };
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!note.trim() && !file) { setMessage("Add a note or choose an attachment."); return; }
    if (showFollowUp && !followUpAt) { setMessage("Choose a follow-up date and time, or turn off the follow-up toggle."); return; }
    setMessage("");
    startTransition(async () => {
      try {
        const attachment = file ? await uploadFile(file) : null;
        const formData = new FormData();
        formData.set("leadId", leadId); formData.set("assignmentId", assignmentId); formData.set("note", note.trim());
        if (attachment) { formData.set("attachmentUrl", attachment.url); formData.set("attachmentName", attachment.name); formData.set("attachmentMime", attachment.mime); formData.set("attachmentSize", String(attachment.size)); }
        const result = await createLeadNoteWithAttachment(formData);
        if (!result.ok) throw new Error(result.message);
        if (followUpAt) {
          const followUpFormData = new FormData();
          followUpFormData.set("leadId", leadId); followUpFormData.set("assignmentId", assignmentId); followUpFormData.set("followUpAt", followUpAt);
          await updateLeadFollowUp(followUpFormData);
          const start = new Date(followUpAt);
          setCalendarUrl(googleCalendarCreateUrl({ title: `Follow-up: ${leadName ?? "Lead"}`, description: note.trim(), start, end: new Date(start.getTime() + 30 * 60_000) }));
        }
        onSaved();
        setSaved(true);
      } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to save the note."); }
    });
  };
  if (readOnly) return null;
  return <><select aria-label="Add lead activity" value={selected} disabled={isPending} onChange={(event) => { setSelected(event.target.value); setMessage(""); }} className="h-9 rounded-lg border border-red-200 bg-white px-3 text-xs font-extrabold text-red-600 outline-none hover:bg-red-50 disabled:opacity-60"><option value="">Add activity</option><option value="note">Notes</option></select>{selected === "note" && typeof document !== "undefined" && createPortal(<div className="fixed inset-0 z-[110] grid place-items-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-label="Add note activity"><form onSubmit={submit} className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl">
    <p className="text-[11px] font-extrabold tracking-[0.12em] text-red-600">LEAD ACTIVITY</p>
    <h3 className="mt-1 text-lg font-extrabold text-slate-900">Add notes</h3>
    <p className="mt-1 text-sm text-slate-500">Add a note, an attachment, or both. Files are saved securely on the CDN.</p>
    <label className="mt-4 block text-sm font-bold text-slate-700">Notes
      <div className="relative mt-1.5"><textarea autoFocus value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} rows={5} placeholder="What was discussed, outcome, or next action?" className="w-full resize-none rounded-lg border border-slate-200 p-3 pr-20 text-sm font-medium outline-none focus:border-red-400" /><VoiceDictationButton onResult={(text) => setNote((current) => (current ? `${current} ${text}` : text))} className="absolute right-2 top-2" /></div>
    </label>
    <label className="mt-4 block cursor-pointer rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm font-bold text-slate-600 hover:border-red-300 hover:bg-red-50/40"><Paperclip className="mx-auto mb-1 h-5 w-5 text-red-600" /><span>{file ? file.name : "Attach PDF, image, audio, video, or document"}</span><span className="mt-1 block text-[11px] font-medium text-slate-400">Maximum 100 MB</span><input type="file" className="sr-only" onChange={chooseFile} accept="application/pdf,image/*,audio/*,video/*,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv" /></label>
    <div className="mt-4 rounded-xl border border-slate-200 p-3">
      <button type="button" onClick={() => setShowFollowUp((value) => !value)} className={`inline-flex items-center gap-1.5 text-xs font-extrabold ${showFollowUp ? "text-red-600" : "text-slate-600"}`}><CalendarPlus className="h-4 w-4" />{showFollowUp ? "Remove follow-up" : "Add a follow-up for this note"}</button>
      {showFollowUp && <label className="mt-2 block text-xs font-bold text-slate-700">Follow-up date and time<input required type="datetime-local" value={followUpAt} onChange={(event) => setFollowUpAt(event.target.value)} className="mt-1.5 h-9 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-red-400" /><span className="mt-1 block text-[11px] font-medium text-slate-400">Saved as this lead&apos;s follow-up date. You can also add it to your own Google Calendar after saving.</span></label>}
    </div>
    {message && <p className="mt-3 text-xs font-bold text-red-600">{message}</p>}
    {saved && <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">Activity saved.{calendarUrl && <a href={calendarUrl} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-1 rounded border border-emerald-300 bg-white px-2 py-1 text-emerald-700 underline">Add to Google Calendar</a>}</div>}
    <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={close} disabled={isPending} className="h-9 rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-600">{saved ? "OK" : "Cancel"}</button>{!saved && <button disabled={isPending || (!note.trim() && !file)} className="h-9 rounded-lg bg-red-600 px-4 text-sm font-extrabold text-white disabled:opacity-60">{isPending ? (file ? "Uploading..." : "Saving...") : "Save activity"}</button>}</div>
  </form></div>, document.body)}</>;
}
