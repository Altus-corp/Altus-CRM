"use client";

import { useState, useTransition, type ChangeEvent, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Paperclip } from "lucide-react";
import { createLeadNoteWithAttachment } from "@/app/dashboard/leads/actions";

type UploadTicket = { url: string; leadId: string; assignmentId: string; nonce: string; expires: number; signature: string };
type UploadedAttachment = { url: string; name: string; mime: string; size: number };
const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024;

export function LeadNoteActivity({ leadId, assignmentId, onSaved, readOnly = false }: { leadId: string; assignmentId: string; onSaved: () => void; readOnly?: boolean }) {
  const [selected, setSelected] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const close = () => { if (!isPending) { setSelected(""); setNote(""); setFile(null); setMessage(""); } };
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
    setMessage("");
    startTransition(async () => {
      try {
        const attachment = file ? await uploadFile(file) : null;
        const formData = new FormData();
        formData.set("leadId", leadId); formData.set("assignmentId", assignmentId); formData.set("note", note.trim());
        if (attachment) { formData.set("attachmentUrl", attachment.url); formData.set("attachmentName", attachment.name); formData.set("attachmentMime", attachment.mime); formData.set("attachmentSize", String(attachment.size)); }
        const result = await createLeadNoteWithAttachment(formData);
        if (!result.ok) throw new Error(result.message);
        onSaved(); close();
      } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to save the note."); }
    });
  };
  if (readOnly) return null;
  return <><select aria-label="Add lead activity" value={selected} disabled={isPending} onChange={(event) => { setSelected(event.target.value); setMessage(""); }} className="h-9 rounded-lg border border-red-200 bg-white px-3 text-xs font-extrabold text-red-600 outline-none hover:bg-red-50 disabled:opacity-60"><option value="">Add activity</option><option value="note">Notes</option></select>{selected === "note" && typeof document !== "undefined" && createPortal(<div className="fixed inset-0 z-[110] grid place-items-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-label="Add note activity"><form onSubmit={submit} className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl"><p className="text-[11px] font-extrabold tracking-[0.12em] text-red-600">LEAD ACTIVITY</p><h3 className="mt-1 text-lg font-extrabold text-slate-900">Add notes</h3><p className="mt-1 text-sm text-slate-500">Add a note, an attachment, or both. Files are saved securely on the CDN.</p><label className="mt-4 block text-sm font-bold text-slate-700">Notes<textarea autoFocus value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} rows={5} placeholder="What was discussed, outcome, or next action?" className="mt-1.5 w-full resize-none rounded-lg border border-slate-200 p-3 text-sm font-medium outline-none focus:border-red-400" /></label><label className="mt-4 block cursor-pointer rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm font-bold text-slate-600 hover:border-red-300 hover:bg-red-50/40"><Paperclip className="mx-auto mb-1 h-5 w-5 text-red-600" /><span>{file ? file.name : "Attach PDF, image, audio, video, or document"}</span><span className="mt-1 block text-[11px] font-medium text-slate-400">Maximum 100 MB</span><input type="file" className="sr-only" onChange={chooseFile} accept="application/pdf,image/*,audio/*,video/*,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv" /></label>{message && <p className="mt-3 text-xs font-bold text-red-600">{message}</p>}<div className="mt-5 flex justify-end gap-2"><button type="button" onClick={close} disabled={isPending} className="h-9 rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-600">Cancel</button><button disabled={isPending || (!note.trim() && !file)} className="h-9 rounded-lg bg-red-600 px-4 text-sm font-extrabold text-white disabled:opacity-60">{isPending ? (file ? "Uploading..." : "Saving...") : "Save activity"}</button></div></form></div>, document.body)}</>;
}
