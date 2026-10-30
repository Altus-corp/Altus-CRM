"use client";

import { useActionState, useState } from "react";
import { saveTeam } from "./actions";

export type TeamPerson = { id: string; name: string; roles: string[]; suspended: boolean };
export type Team = { id: string; name: string; managerId: string; memberIds: string[] };

export function TeamForm({ people, team }: { people: TeamPerson[]; team?: Team }) {
  const [state, action, pending] = useActionState(saveTeam, {});
  const [managerId, setManagerId] = useState(team?.managerId ?? "");
  const [selected, setSelected] = useState(team?.memberIds ?? []);
  const managers = people.filter((person) => (!person.suspended && person.roles.includes("sales_manager")) || person.id === team?.managerId);
  const members = people.filter((person) => person.id !== managerId && ((!person.suspended && person.roles.length > 0) || team?.memberIds.includes(person.id)));

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="teamId" value={team?.id ?? ""} />
      <fieldset disabled={pending} className="space-y-4">
        <legend className="sr-only">{team ? `Edit ${team.name}` : "Create team"}</legend>
        <label className="block text-sm font-bold text-slate-700">Team name
          <input name="name" required maxLength={100} defaultValue={team?.name ?? ""} placeholder="e.g. Sales Team A" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-normal" />
        </label>
        <label className="block text-sm font-bold text-slate-700">Sales manager
          <select name="managerId" required value={managerId} onChange={(event) => { setManagerId(event.target.value); setSelected((ids) => ids.filter((id) => id !== event.target.value)); }} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-normal">
            <option value="">Select a sales manager</option>
            {managers.map((person) => <option key={person.id} value={person.id}>{person.name}{person.suspended || !person.roles.includes("sales_manager") ? " (unavailable — choose another manager)" : ""}</option>)}
          </select>
        </label>
        {!managers.length && <p className="text-xs text-amber-700">Assign the Sales Manager role to an active user on the Users page first.</p>}
        <fieldset>
          <legend className="text-sm font-bold text-slate-700">Team members ({selected.length})</legend>
          <div className="mt-2 max-h-60 space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-3">
            {members.map((person) => <label key={person.id} className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" name="members" value={person.id} checked={selected.includes(person.id)} onChange={(event) => setSelected((ids) => event.target.checked ? [...ids, person.id] : ids.filter((id) => id !== person.id))} className="h-4 w-4 accent-red-600" />{person.name}{person.suspended ? " (suspended — remove to save)" : !person.roles.length ? " (no role — remove to save)" : ""}</label>)}
            {!members.length && <p className="text-xs text-slate-500">No members available.</p>}
          </div>
        </fieldset>
        <button disabled={pending} className="rounded-lg bg-[#d90000] px-4 py-2 text-sm font-bold text-white disabled:opacity-60">{pending ? "Saving..." : team ? "Save changes" : "Create team"}</button>
      </fieldset>
      {state.error && <p role="alert" className="text-sm font-semibold text-red-700">{state.error}</p>}
      {state.success && <p role="status" className="text-sm font-semibold text-emerald-700">{state.success}</p>}
    </form>
  );
}
