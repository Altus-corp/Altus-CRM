"use client";
// Shared client-side upload flow for the lead-attachment CDN — same ticket-then-upload mechanism
// components/leads/lead-note-activity.tsx already uses, factored out so the v2 Attachment/Proposal tabs
// (and anything else) can reuse it instead of duplicating the ticket/signature dance.
export type UploadedLeadFile = { url: string; name: string; mime: string; size: number };

export async function uploadLeadAttachment(leadId: string, assignmentId: string, file: File): Promise<UploadedLeadFile> {
  const ticketResponse = await fetch("/api/lead-attachments/ticket", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ leadId, assignmentId }) });
  const ticketPayload = await ticketResponse.json() as { ok?: boolean; error?: string; upload?: { url: string; leadId: string; assignmentId: string; nonce: string; expires: number; signature: string } };
  if (!ticketResponse.ok || !ticketPayload.ok || !ticketPayload.upload) throw new Error(ticketPayload.error ?? "Unable to prepare the upload.");
  const body = new FormData();
  body.set("file", file);
  body.set("lead_id", ticketPayload.upload.leadId);
  body.set("assignment_id", ticketPayload.upload.assignmentId);
  body.set("nonce", ticketPayload.upload.nonce);
  body.set("expires", String(ticketPayload.upload.expires));
  body.set("signature", ticketPayload.upload.signature);
  const uploadResponse = await fetch(ticketPayload.upload.url, { method: "POST", body });
  const uploadPayload = await uploadResponse.json() as { ok?: boolean; error?: string; url?: string; name?: string; mime?: string; size?: number };
  if (!uploadResponse.ok || !uploadPayload.ok || !uploadPayload.url || !uploadPayload.name || !uploadPayload.mime || !uploadPayload.size) throw new Error(uploadPayload.error ?? "The CDN could not upload this file.");
  return { url: uploadPayload.url, name: uploadPayload.name, mime: uploadPayload.mime, size: uploadPayload.size };
}
