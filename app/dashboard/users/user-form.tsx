"use client";

import { useActionState, useRef, useState } from "react";
import { APP_ROLES, ROLE_LABELS } from "@/app/lib/roles";
import { createUser } from "./actions";

type UserFormProps = {
  onClose: () => void;
};

export function UserForm({ onClose }: UserFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [passwordMode, setPasswordMode] = useState<"manual" | "generated">("manual");
  const [registrationData, setRegistrationData] = useState<Record<string, string>>({});
  const [state, action, isPending] = useActionState(createUser, {});

  function nextStep() {
    if (formRef.current?.reportValidity()) {
      const formData = new FormData(formRef.current);
      setRegistrationData({
        firstName: String(formData.get("firstName") ?? ""),
        lastName: String(formData.get("lastName") ?? ""),
        email: String(formData.get("email") ?? ""),
        phone: String(formData.get("phone") ?? ""),
        password: String(formData.get("password") ?? ""),
      });
      setStep(2);
    }
  }

  return (
    <form ref={formRef} action={action} className="space-y-3">
      <div className="flex items-center gap-3 text-xs font-bold">
        <span className={`grid h-6 w-6 place-items-center rounded-full ${step === 1 ? "bg-[#d90000] text-white" : "bg-slate-300 text-white"}`}>1</span>
        <span className={step === 1 ? "text-slate-900" : "text-slate-500"}>Registration</span>
        <span className="h-px flex-1 bg-slate-200" />
        <span className={`grid h-6 w-6 place-items-center rounded-full ${step === 2 ? "bg-[#d90000] text-white" : "bg-slate-300 text-white"}`}>2</span>
        <span className={step === 2 ? "text-slate-900" : "text-slate-500"}>Assign role</span>
      </div>

      {state.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{state.error}</p>}
      {state.success && (
        <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <p className="font-bold">{state.success}</p>
        </div>
      )}

      {step === 1 ? (
        <>
          <div className="rounded-lg bg-red-50 px-3 py-2">
            <p className="text-sm font-extrabold text-slate-800">Personal information</p>
            <p className="mt-0.5 text-xs font-medium text-slate-500">Enter basic details to create an account.</p>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-2">
            <label className="text-xs font-bold text-slate-700">First name *<input name="firstName" required placeholder="John" className="mt-1 h-9 w-full rounded-md border border-slate-200 px-3 text-sm font-medium outline-none focus:border-red-500" /></label>
            <label className="text-xs font-bold text-slate-700">Last name *<input name="lastName" required placeholder="Doe" className="mt-1 h-9 w-full rounded-md border border-slate-200 px-3 text-sm font-medium outline-none focus:border-red-500" /></label>
            <label className="text-xs font-bold text-slate-700">Email address *<input name="email" type="email" required placeholder="john@company.com" className="mt-1 h-9 w-full rounded-md border border-slate-200 px-3 text-sm font-medium outline-none focus:border-red-500" /></label>
            <label className="text-xs font-bold text-slate-700">Phone number *<input name="phone" type="tel" required placeholder="+91 98765 43210" className="mt-1 h-9 w-full rounded-md border border-slate-200 px-3 text-sm font-medium outline-none focus:border-red-500" /></label>
          </div>
          <fieldset>
            <legend className="text-xs font-bold text-slate-700">Password *</legend>
            <div className="mt-1 flex gap-2">
              <label className={`cursor-pointer rounded-md border px-3 py-1.5 text-xs font-bold ${passwordMode === "manual" ? "border-red-400 bg-red-50 text-red-700" : "border-slate-200 text-slate-600"}`}><input className="sr-only" type="radio" name="passwordMode" value="manual" checked={passwordMode === "manual"} onChange={() => setPasswordMode("manual")} />Set manually</label>
              <label className={`cursor-pointer rounded-md border px-3 py-1.5 text-xs font-bold ${passwordMode === "generated" ? "border-red-400 bg-red-50 text-red-700" : "border-slate-200 text-slate-600"}`}><input className="sr-only" type="radio" name="passwordMode" value="generated" checked={passwordMode === "generated"} onChange={() => setPasswordMode("generated")} />Generate automatically</label>
            </div>
            {passwordMode === "manual" && <input name="password" type="password" required minLength={12} autoComplete="new-password" placeholder="Enter password" className="mt-1.5 h-9 w-full rounded-md border border-slate-200 px-3 text-sm font-medium outline-none focus:border-red-500" />}
            <p className="mt-1 text-[11px] font-medium text-slate-500">Minimum 12 characters: upper/lowercase, number, and symbol.</p>
          </fieldset>
          <div className="flex justify-between border-t border-slate-100 pt-3">
            <button type="button" onClick={onClose} className="rounded-md border border-slate-200 px-5 py-2 text-sm font-bold text-slate-600">Cancel</button>
            <button type="button" onClick={nextStep} className="rounded-md bg-[#d90000] px-8 py-2 text-sm font-bold text-white">Next →</button>
          </div>
        </>
      ) : (
        <>
          <input type="hidden" name="firstName" value={registrationData.firstName ?? ""} />
          <input type="hidden" name="lastName" value={registrationData.lastName ?? ""} />
          <input type="hidden" name="email" value={registrationData.email ?? ""} />
          <input type="hidden" name="phone" value={registrationData.phone ?? ""} />
          <input type="hidden" name="passwordMode" value={passwordMode} />
          {passwordMode === "manual" && <input type="hidden" name="password" value={registrationData.password ?? ""} />}
          <div className="rounded-lg bg-red-50 px-3 py-2">
            <p className="text-sm font-extrabold text-slate-800">Assign role</p>
            <p className="mt-0.5 text-xs font-medium text-slate-500">Choose one or more roles for this user.</p>
          </div>
          <fieldset>
            <legend className="text-xs font-bold text-slate-700">Roles *</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {APP_ROLES.map((role) => (
                <label key={role} className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-red-300 hover:bg-red-50">
                  <input name="roles" type="checkbox" value={role} className="h-4 w-4 accent-red-600" />
                  {ROLE_LABELS[role]}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex justify-between border-t border-slate-100 pt-3">
            <button type="button" onClick={() => setStep(1)} className="rounded-md border border-slate-200 px-5 py-2 text-sm font-bold text-slate-600">← Back</button>
            <button disabled={isPending} className="rounded-md bg-[#d90000] px-8 py-2 text-sm font-bold text-white disabled:opacity-60">{isPending ? "Creating…" : "Create user"}</button>
          </div>
        </>
      )}
    </form>
  );
}
