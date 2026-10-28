"use client";

import { useState, useTransition, type FormEvent } from "react";
import { removeSmtpSettings, saveSmtpSettings } from "@/app/dashboard/settings/actions";

type Defaults = { host: string; port: number; username: string; fromEmail: string; fromName: string };

const inputClass = "mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:border-red-400";

export function SmtpSettingsForm({ configured, defaults }: { configured: boolean; defaults: Defaults }) {
  const [isConfigured, setIsConfigured] = useState(configured);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    startTransition(async () => {
      const result = await saveSmtpSettings(formData);
      setMessage({ ok: result.ok, text: result.message });
      if (result.ok) { setIsConfigured(true); (form.elements.namedItem("password") as HTMLInputElement).value = ""; }
    });
  }

  function remove() {
    if (!window.confirm("Remove your email settings? You will not be able to email leads until you set them up again.")) return;
    startTransition(async () => { const result = await removeSmtpSettings(); setMessage({ ok: result.ok, text: result.message }); if (result.ok) setIsConfigured(false); });
  }

  return <form onSubmit={submit} className="mt-4 rounded-xl border border-slate-200 bg-white p-5">
    <div className="flex items-start justify-between gap-3"><div><h2 className="text-base font-extrabold text-slate-900">Email (SMTP)</h2><p className="mt-1 text-xs text-slate-500">Emails you send to leads go out from your own mailbox. Your email is filled in from your CRM login; enter your mailbox password to connect.</p></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-extrabold ${isConfigured ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{isConfigured ? "Connected" : "Not set up"}</span></div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <label className="text-[11px] font-bold uppercase tracking-wide text-slate-400">SMTP host<input name="host" required defaultValue={defaults.host} placeholder="smtp.example.com" className={inputClass} /></label>
      <label className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Port<input name="port" type="number" required defaultValue={defaults.port} className={inputClass} /><span className="mt-1 block text-[10px] normal-case tracking-normal text-slate-400">465 uses SSL; 587 uses STARTTLS.</span></label>
      <label className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Username<input name="username" required defaultValue={defaults.username} className={inputClass} /></label>
      <label className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Email password<input name="password" type="password" autoComplete="new-password" required={!isConfigured} placeholder={isConfigured ? "Leave blank to keep the saved password" : ""} className={inputClass} /></label>
      <label className="text-[11px] font-bold uppercase tracking-wide text-slate-400">From email<input name="fromEmail" type="email" required defaultValue={defaults.fromEmail} className={inputClass} /></label>
      <label className="text-[11px] font-bold uppercase tracking-wide text-slate-400">From name<input name="fromName" defaultValue={defaults.fromName} className={inputClass} /></label>
    </div>
    {message && <p role="status" className={`mt-4 rounded-lg px-3 py-2 text-xs font-bold ${message.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{message.text}</p>}
    <div className="mt-4 flex items-center justify-end gap-2 border-t border-slate-100 pt-4">{isConfigured && <button type="button" onClick={remove} disabled={isPending} className="mr-auto h-9 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">Remove</button>}<button type="submit" disabled={isPending} className="h-9 rounded-lg bg-[#d90000] px-4 text-sm font-extrabold text-white hover:bg-red-700 disabled:opacity-60">{isPending ? "Verifying..." : "Verify & save"}</button></div>
  </form>;
}
