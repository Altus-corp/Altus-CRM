"use client";

import { useActionState, useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { PasswordField } from "@/components/auth/password-field";
import { updateUser } from "./actions";
import type { ManagedUser } from "./users-table";

export function EditUserModal({ user }: { user: ManagedUser }) {
  const [isOpen, setIsOpen] = useState(false);
  const [passwordMode, setPasswordMode] = useState<"none" | "manual" | "generated">("none");
  const [state, action, isPending] = useActionState(updateUser, {});

  useEffect(() => {
    if (!isOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isPending) setIsOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isOpen, isPending]);

  useEffect(() => {
    if (state.success) setPasswordMode("none");
  }, [state.success]);

  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)} aria-label={`Edit ${user.name}`} title="Edit user" className="grid h-8 w-8 place-items-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50">
        <Pencil className="h-3.5 w-3.5" />
      </button>
      {isOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4 backdrop-blur-[2px]">
          <div role="dialog" aria-modal="true" aria-labelledby="edit-user-title" className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-start justify-between">
              <div>
                <h2 id="edit-user-title" className="text-lg font-extrabold tracking-[-0.03em] text-slate-900">Edit user</h2>
                <p className="mt-0.5 text-sm font-medium text-slate-500">Update {user.name}&apos;s details, or reset their password.</p>
              </div>
              <button type="button" onClick={() => setIsOpen(false)} disabled={isPending} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-md text-lg text-slate-500 hover:bg-slate-100 disabled:opacity-50">×</button>
            </div>
            <form action={action} className="space-y-3">
              <input type="hidden" name="userId" value={user.id} />
              {state.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{state.error}</p>}
              {state.success && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">{state.success}</p>}
              <div className="grid gap-2.5 sm:grid-cols-2">
                <label className="text-xs font-bold text-slate-700">First name *<input name="firstName" required defaultValue={user.firstName} placeholder="John" className="mt-1 h-9 w-full rounded-md border border-slate-200 px-3 text-sm font-medium outline-none focus:border-red-500" /></label>
                <label className="text-xs font-bold text-slate-700">Last name *<input name="lastName" required defaultValue={user.lastName} placeholder="Doe" className="mt-1 h-9 w-full rounded-md border border-slate-200 px-3 text-sm font-medium outline-none focus:border-red-500" /></label>
                <label className="text-xs font-bold text-slate-700">Email address *<input name="email" type="email" required defaultValue={user.email} placeholder="john@company.com" className="mt-1 h-9 w-full rounded-md border border-slate-200 px-3 text-sm font-medium outline-none focus:border-red-500" /></label>
                <label className="text-xs font-bold text-slate-700">Phone number *<input name="phone" type="tel" required defaultValue={user.phone} placeholder="+91 98765 43210" className="mt-1 h-9 w-full rounded-md border border-slate-200 px-3 text-sm font-medium outline-none focus:border-red-500" /></label>
              </div>
              <fieldset>
                <legend className="text-xs font-bold text-slate-700">Password</legend>
                <div className="mt-1 flex flex-wrap gap-2">
                  <label className={`cursor-pointer rounded-md border px-3 py-1.5 text-xs font-bold ${passwordMode === "none" ? "border-red-400 bg-red-50 text-red-700" : "border-slate-200 text-slate-600"}`}><input className="sr-only" type="radio" name="passwordMode" value="none" checked={passwordMode === "none"} onChange={() => setPasswordMode("none")} />Keep current password</label>
                  <label className={`cursor-pointer rounded-md border px-3 py-1.5 text-xs font-bold ${passwordMode === "manual" ? "border-red-400 bg-red-50 text-red-700" : "border-slate-200 text-slate-600"}`}><input className="sr-only" type="radio" name="passwordMode" value="manual" checked={passwordMode === "manual"} onChange={() => setPasswordMode("manual")} />Set manually</label>
                  <label className={`cursor-pointer rounded-md border px-3 py-1.5 text-xs font-bold ${passwordMode === "generated" ? "border-red-400 bg-red-50 text-red-700" : "border-slate-200 text-slate-600"}`}><input className="sr-only" type="radio" name="passwordMode" value="generated" checked={passwordMode === "generated"} onChange={() => setPasswordMode("generated")} />Generate automatically</label>
                </div>
                {passwordMode === "manual" && <PasswordField name="password" required minLength={12} autoComplete="new-password" placeholder="Enter new password" className="mt-2 h-9 w-full rounded-md border border-slate-200 px-3 text-sm font-medium outline-none focus:border-red-500" />}
                {passwordMode !== "none" && <p className="mt-1 text-[11px] font-medium text-slate-500">Minimum 12 characters: upper/lowercase, number, and symbol. The new credentials will be emailed, and this user will be signed out of any session still using the old password.</p>}
              </fieldset>
              <div className="flex justify-between border-t border-slate-100 pt-3">
                <button type="button" onClick={() => setIsOpen(false)} className="rounded-md border border-slate-200 px-5 py-2 text-sm font-bold text-slate-600">Cancel</button>
                <button disabled={isPending} className="rounded-md bg-[#d90000] px-8 py-2 text-sm font-bold text-white disabled:opacity-60">{isPending ? "Saving…" : "Save changes"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
