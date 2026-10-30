"use client";

import { useActionState, useId, useState } from "react";
import { APP_ROLES, ROLE_LABELS, type AppRole } from "@/app/lib/roles";
import { updateUserRoles } from "./actions";

export function UserRolesEditor({ userId, name, roles }: { userId: string; name: string; roles: AppRole[] }) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <div className="min-w-48">
      <div className="flex flex-wrap gap-1">
        {roles.length ? roles.map((role) => <span key={role} className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">{ROLE_LABELS[role]}</span>) : <span className="text-xs text-slate-400">No role</span>}
      </div>
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)} className="mt-2 text-xs font-bold text-red-700 hover:underline">
        {open ? "Close role editor" : roles.length ? "Edit roles" : "Assign roles"}
      </button>
      {open && <RoleForm id={id} userId={userId} name={name} roles={roles} />}
    </div>
  );
}

function RoleForm({ id, userId, name, roles }: { id: string; userId: string; name: string; roles: AppRole[] }) {
  const [state, action, pending] = useActionState(updateUserRoles, {});

  return (
    <form id={id} action={action} className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <input type="hidden" name="userId" value={userId} />
      <fieldset disabled={pending} className="space-y-2">
        <legend className="mb-2 text-xs font-bold text-slate-700">Roles for {name}</legend>
        {APP_ROLES.map((role) => (
          <label key={role} className="flex items-center gap-2 text-xs font-medium text-slate-700">
            <input type="checkbox" name="roles" value={role} defaultChecked={roles.includes(role)} className="h-4 w-4 accent-red-600" />
            {ROLE_LABELS[role]}
          </label>
        ))}
        <button disabled={pending} className="rounded-md bg-[#d90000] px-3 py-2 text-xs font-bold text-white disabled:opacity-60">{pending ? "Saving..." : "Save roles"}</button>
      </fieldset>
      {state.error && <p role="alert" className="mt-2 text-xs font-semibold text-red-700">{state.error}</p>}
      {state.success && <p role="status" className="mt-2 text-xs font-semibold text-emerald-700">{state.success}</p>}
    </form>
  );
}
