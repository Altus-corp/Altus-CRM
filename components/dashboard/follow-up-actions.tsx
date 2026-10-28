"use client";

import { useState } from "react";
import { Mail, MessageCircle, PhoneCall } from "lucide-react";

type Props = { leadId: string; assignmentId: string; phone: string | null; email: string | null };

export function FollowUpActions({ leadId, assignmentId, phone, email }: Props) {
  const [state, setState] = useState<{ busy: boolean; message: string; ok: boolean }>({ busy: false, message: "", ok: false });
  const whatsapp = phone?.replace(/\D/g, "") ?? "";

  async function dial() {
    if (!phone) return;
    setState({ busy: true, message: "", ok: false });
    try {
      const response = await fetch("/api/altus-contacts/dial", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ leadId, assignmentId, number: phone }) });
      const result = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error || "Unable to start the call.");
      setState({ busy: false, message: "Call requested.", ok: true });
    } catch (dialError) {
      setState({ busy: false, message: dialError instanceof Error ? dialError.message : "Unable to start the call.", ok: false });
    }
  }

  return <div className="relative flex shrink-0 items-center gap-1.5">
    {phone && <button type="button" onClick={dial} disabled={state.busy} className="inline-flex items-center gap-1.5 rounded-lg bg-sky-50 px-3 py-1.5 text-xs font-bold text-sky-600 hover:bg-sky-100 disabled:opacity-50"><PhoneCall className="h-3.5 w-3.5" />{state.busy ? "…" : "Call"}</button>}
    {whatsapp && <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noreferrer" title="WhatsApp" className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100"><MessageCircle className="h-4 w-4" /></a>}
    {email && <a href={`mailto:${email}`} title="Send email" className="grid h-8 w-8 place-items-center rounded-lg bg-orange-50 text-orange-600 hover:bg-orange-100"><Mail className="h-4 w-4" /></a>}
    {state.message && <span role="status" className={`absolute right-0 top-full z-10 mt-1 whitespace-nowrap rounded border bg-white px-2 py-1 text-[10px] font-bold shadow ${state.ok ? "border-emerald-200 text-emerald-700" : "border-red-200 text-red-600"}`}>{state.message}</span>}
  </div>;
}
