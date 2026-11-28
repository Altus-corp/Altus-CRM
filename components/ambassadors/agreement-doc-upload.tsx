"use client";

import { useState, useTransition, type ChangeEvent } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { FileText, Upload, X } from "lucide-react";
import { previewAmbassadorAgreementDigital, uploadAmbassadorAgreementDocument } from "@/app/dashboard/my-ambassador/actions";

type UploadTicket = { url: string; leadId: string; assignmentId: string; nonce: string; expires: number; signature: string };
type DigitalPreview = { url: string; mime: string; size: number };
const MAX_AGREEMENT_BYTES = 20 * 1024 * 1024;

export function AgreementDocUpload({ leadId, assignmentId, documentUrl, canUpload, onUploaded }: { leadId: string; assignmentId: string; documentUrl: string | null; canUpload: boolean; onUploaded: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"choose" | "manual" | "digital">("choose");
  const [file, setFile] = useState<File | null>(null);
  const [digitalPreview, setDigitalPreview] = useState<DigitalPreview | null>(null);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  // Digital is a preview-then-confirm flow: generating the PDF only uploads it for viewing — nothing is
  // marked Signed or changes stage/resolution until the preview is explicitly confirmed below.
  const generatePreview = () => {
    setMessage(""); setDigitalPreview(null);
    startTransition(async () => {
      const result = await previewAmbassadorAgreementDigital(assignmentId);
      if (!result.ok || !result.documentUrl) { setMessage(result.message); return; }
      setDigitalPreview({ url: result.documentUrl, mime: result.documentMime ?? "application/pdf", size: result.documentSize ?? 0 });
    });
  };
  const confirmDigital = () => {
    if (!digitalPreview) return;
    setMessage("");
    startTransition(async () => {
      const formData = new FormData();
      formData.set("assignmentId", assignmentId);
      formData.set("documentUrl", digitalPreview.url);
      formData.set("documentMime", digitalPreview.mime);
      formData.set("documentSize", String(digitalPreview.size));
      const result = await uploadAmbassadorAgreementDocument(formData);
      if (!result.ok) { setMessage(result.message); return; }
      onUploaded();
      router.refresh();
      close();
    });
  };

  const close = () => { if (isPending) return; setOpen(false); setStep("choose"); setFile(null); setDigitalPreview(null); setMessage(""); };
  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null;
    if (nextFile && nextFile.type !== "application/pdf") { setFile(null); setMessage("Choose a PDF file."); return; }
    if (nextFile && nextFile.size > MAX_AGREEMENT_BYTES) { setFile(null); setMessage("The agreement PDF must be 20 MB or smaller."); return; }
    setFile(nextFile); setMessage("");
  };

  const upload = () => {
    if (!file) { setMessage("Choose a PDF file first."); return; }
    setMessage("");
    startTransition(async () => {
      try {
        const ticketResponse = await fetch("/api/lead-attachments/ticket", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ leadId, assignmentId }) });
        const ticketPayload = await ticketResponse.json() as { ok?: boolean; error?: string; upload?: UploadTicket };
        if (!ticketResponse.ok || !ticketPayload.ok || !ticketPayload.upload) throw new Error(ticketPayload.error ?? "Unable to prepare the upload.");
        const body = new FormData();
        body.set("file", file);
        body.set("lead_id", ticketPayload.upload.leadId);
        body.set("assignment_id", ticketPayload.upload.assignmentId);
        body.set("nonce", ticketPayload.upload.nonce);
        body.set("expires", String(ticketPayload.upload.expires));
        body.set("signature", ticketPayload.upload.signature);
        const uploadResponse = await fetch(ticketPayload.upload.url, { method: "POST", body });
        const uploadPayload = await uploadResponse.json() as { ok?: boolean; error?: string; url?: string; mime?: string; size?: number };
        if (!uploadResponse.ok || !uploadPayload.ok || !uploadPayload.url) throw new Error(uploadPayload.error ?? "The CDN could not upload this agreement.");

        const formData = new FormData();
        formData.set("assignmentId", assignmentId);
        formData.set("documentUrl", uploadPayload.url);
        formData.set("documentMime", uploadPayload.mime ?? "application/pdf");
        formData.set("documentSize", String(uploadPayload.size ?? file.size));
        const result = await uploadAmbassadorAgreementDocument(formData);
        if (!result.ok) { setMessage(result.message); return; }
        onUploaded();
        router.refresh();
        close();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Unable to upload this agreement.");
      }
    });
  };

  return <div className="flex items-center gap-2">
    {documentUrl && <a href={documentUrl} target="_blank" rel="noreferrer" title="View agreement" className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-red-50 hover:text-red-600"><FileText className="h-3.5 w-3.5" /></a>}
    {canUpload && <button type="button" onClick={() => setOpen(true)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-red-200 bg-white px-2.5 text-[10px] font-extrabold text-red-600 hover:bg-red-50"><Upload className="h-3 w-3" />{documentUrl ? "Re-upload" : "Upload"}</button>}
    {!documentUrl && !canUpload && <span className="text-xs text-slate-400">—</span>}
    {open && typeof document !== "undefined" && createPortal(<div className="fixed inset-0 z-[150] grid place-items-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-label="Upload agreement">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-extrabold tracking-[0.14em] text-red-600">AGREEMENT DOC</p><h3 className="mt-1 text-base font-extrabold text-slate-900">Upload signed agreement</h3></div><button type="button" onClick={close} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"><X className="h-4 w-4" /></button></div>
        {step === "choose" && <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={() => setStep("manual")} className="rounded-xl border border-red-200 bg-white p-4 text-left hover:bg-red-50"><p className="text-sm font-extrabold text-slate-900">Manual upload</p><p className="mt-1 text-xs text-slate-500">Upload a signed agreement PDF.</p></button>
          <button type="button" onClick={() => setStep("digital")} className="rounded-xl border border-red-200 bg-white p-4 text-left hover:bg-red-50"><p className="text-sm font-extrabold text-slate-900">Digital</p><p className="mt-1 text-xs text-slate-500">Generate the agreement from this Ambassador&apos;s AltusCorp record.</p></button>
        </div>}
        {step === "digital" && !digitalPreview && <div className="mt-4">
          <p className="text-xs text-slate-500">Generates a preview of the Ambassador Agreement from this Ambassador&apos;s AltusCorp website record (name, entity, KYC, bank details, and their uploaded signature). Only works for leads synced from the AltusCorp website. Nothing is saved or marked Signed until you review and confirm the preview.</p>
          {message && <p role="alert" className="mt-3 text-xs font-bold text-red-600">{message}</p>}
          <div className="mt-4 flex justify-end gap-2"><button type="button" disabled={isPending} onClick={() => setStep("choose")} className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-600">Back</button><button type="button" disabled={isPending} onClick={generatePreview} className="h-9 rounded-lg bg-[#d90000] px-4 text-sm font-extrabold text-white disabled:opacity-60">{isPending ? "Generating preview..." : "Generate preview"}</button></div>
        </div>}
        {step === "digital" && digitalPreview && <div className="mt-4">
          <p className="text-xs text-slate-500">Review the generated agreement below. Confirming marks the agreement Signed and moves this record to Onboarding Ambassador — discarding keeps everything as it is now.</p>
          <a href={digitalPreview.url} target="_blank" rel="noreferrer" className="mt-3 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-700 hover:bg-red-50 hover:text-red-600"><FileText className="h-4 w-4" /> Open preview in a new tab</a>
          <iframe src={digitalPreview.url} title="Agreement preview" className="mt-3 h-72 w-full rounded-xl border border-slate-200" />
          {message && <p role="alert" className="mt-3 text-xs font-bold text-red-600">{message}</p>}
          <div className="mt-4 flex justify-end gap-2"><button type="button" disabled={isPending} onClick={() => setDigitalPreview(null)} className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-600">Discard preview</button><button type="button" disabled={isPending} onClick={confirmDigital} className="h-9 rounded-lg bg-[#d90000] px-4 text-sm font-extrabold text-white disabled:opacity-60">{isPending ? "Saving..." : "Confirm & mark Signed"}</button></div>
        </div>}
        {step === "manual" && <div className="mt-4">
          <p className="text-xs text-slate-500">Saving this PDF marks the agreement Signed and moves this record to Onboarding Ambassador.</p>
          <label className="mt-3 block cursor-pointer rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm font-bold text-slate-600 hover:border-red-300 hover:bg-red-50/40">
            <span>{file ? file.name : "Choose a PDF file"}</span>
            <input type="file" accept="application/pdf" className="sr-only" onChange={chooseFile} />
          </label>
          {message && <p role="alert" className="mt-3 text-xs font-bold text-red-600">{message}</p>}
          <div className="mt-4 flex justify-end gap-2"><button type="button" disabled={isPending} onClick={() => setStep("choose")} className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-600">Back</button><button type="button" disabled={isPending || !file} onClick={upload} className="h-9 rounded-lg bg-[#d90000] px-4 text-sm font-extrabold text-white disabled:opacity-60">{isPending ? "Uploading..." : "Upload"}</button></div>
        </div>}
      </div>
    </div>, document.body)}
  </div>;
}
