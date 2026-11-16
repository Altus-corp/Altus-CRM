"use client";

import { useActionState, useEffect, useState } from "react";
import { X } from "lucide-react";
import { PasswordField } from "@/components/auth/password-field";
import { createAmbassadorAccount } from "@/app/dashboard/my-ambassador/actions";

export function CreateAmbassadorAccountModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [passwordMode, setPasswordMode] = useState<"manual" | "generated">("manual");
  const [state, action, isPending] = useActionState(createAmbassadorAccount, {});

  useEffect(() => {
    if (!isOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isPending) setIsOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isOpen, isPending]);

  return <>
    <button type="button" onClick={() => setIsOpen(true)} className="h-9 rounded-lg bg-[#d90000] px-4 text-xs font-extrabold text-white shadow-sm hover:bg-red-700">+ Add Ambassador</button>
    {isOpen && <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/45 p-4 backdrop-blur-[2px]" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !isPending) setIsOpen(false); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="create-ambassador-account-title" className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-[10px] font-extrabold tracking-[0.14em] text-red-600">AMBASSADOR ACCOUNT</p><h2 id="create-ambassador-account-title" className="mt-1 text-xl font-extrabold text-slate-900">Add Ambassador</h2><p className="mt-1 text-sm text-slate-500">Create an Ambassador-only CRM login. Their temporary credentials will be sent by email.</p></div>
          <button type="button" onClick={() => setIsOpen(false)} disabled={isPending} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-50"><X className="h-4 w-4" /></button>
        </div>
        <form action={action} className="mt-5 space-y-4">
          {state.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{state.error}</p>}
          {state.success && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">{state.success}</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold text-slate-700">First name *<input name="firstName" required placeholder="John" className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-medium outline-none focus:border-red-500" /></label>
            <label className="text-xs font-bold text-slate-700">Last name *<input name="lastName" required placeholder="Doe" className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-medium outline-none focus:border-red-500" /></label>
            <label className="text-xs font-bold text-slate-700">Email address *<input name="email" type="email" required placeholder="john@example.com" className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-medium outline-none focus:border-red-500" /></label>
            <label className="text-xs font-bold text-slate-700">Mobile number *<input name="phone" type="tel" inputMode="numeric" required placeholder="9876543210" className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-medium outline-none focus:border-red-500" /></label>
          </div>
          <fieldset>
            <legend className="text-xs font-bold text-slate-700">Temporary password *</legend>
            <div className="mt-1.5 flex gap-2">
              <label className={`cursor-pointer rounded-md border px-3 py-1.5 text-xs font-bold ${passwordMode === "manual" ? "border-red-400 bg-red-50 text-red-700" : "border-slate-200 text-slate-600"}`}><input className="sr-only" type="radio" name="passwordMode" value="manual" checked={passwordMode === "manual"} onChange={() => setPasswordMode("manual")} />Set manually</label>
              <label className={`cursor-pointer rounded-md border px-3 py-1.5 text-xs font-bold ${passwordMode === "generated" ? "border-red-400 bg-red-50 text-red-700" : "border-slate-200 text-slate-600"}`}><input className="sr-only" type="radio" name="passwordMode" value="generated" checked={passwordMode === "generated"} onChange={() => setPasswordMode("generated")} />Generate automatically</label>
            </div>
            {passwordMode === "manual" && <PasswordField name="password" required minLength={12} autoComplete="new-password" placeholder="Enter password" className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-medium outline-none focus:border-red-500" />}
            <p className="mt-1 text-[11px] font-medium text-slate-500">Minimum 12 characters: uppercase, lowercase, number, and symbol.</p>
          </fieldset>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" disabled={isPending} onClick={() => setIsOpen(false)} className="h-9 rounded-lg border border-slate-200 px-4 text-xs font-bold text-slate-600 disabled:opacity-50">Cancel</button><button disabled={isPending} className="h-9 rounded-lg bg-[#d90000] px-4 text-xs font-extrabold text-white disabled:opacity-60">{isPending ? "Creating…" : "Create Ambassador account"}</button></div>
        </form>
      </section>
    </div>}
  </>;
}
