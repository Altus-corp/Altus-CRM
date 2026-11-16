"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { ROLE_LABELS, type AppRole } from "@/app/lib/roles";
import { toggleUserSuspension } from "./actions";
import { DeleteUserDialog } from "./delete-user-dialog";
import { UserRolesEditor } from "./user-roles-editor";

export type ManagedUser = {
  id: string;
  name: string;
  email: string;
  phone: string;
  roles: AppRole[];
  isSuspended: boolean;
};

export function UsersTable({ users, transferUsers }: { users: ManagedUser[]; transferUsers: { id: string; name: string }[] }) {
  const [search, setSearch] = useState("");
  const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const filteredUsers = users.filter((user) => {
    const searchableText = [user.name, user.email, user.phone, ...user.roles.map((role) => ROLE_LABELS[role])].join(" ").toLowerCase();
    return terms.every((term) => searchableText.includes(term));
  });

  return (
    <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-[0_8px_24px_rgba(42,55,80,0.06)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 focus-within:border-red-400 sm:w-80">
            <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400" />
            <input type="search" aria-label="Search users" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, email, phone or role..." className="h-9 min-w-0 w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400" />
          </label>
          {search && <button type="button" onClick={() => setSearch("")} className="shrink-0 rounded-md border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">Clear</button>}
        </div>
        <p role="status" className="text-xs font-medium text-slate-500">Showing {filteredUsers.length} of {users.length} users</p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-100 bg-slate-50 text-xs font-extrabold uppercase tracking-[0.08em] text-slate-500">
            <tr><th className="px-5 py-3">User</th><th className="px-5 py-3">Phone</th><th className="px-5 py-3">Role</th><th className="px-5 py-3">Status</th><th className="px-5 py-3 text-right">Action</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredUsers.map((user) => (
              <tr key={user.id} className="hover:bg-slate-50/70">
                <td className="px-5 py-3.5"><div className="flex items-center gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-red-50 text-xs font-extrabold text-red-700">{user.name.slice(0, 2).toUpperCase()}</span><div><p className="font-bold text-slate-800">{user.name}</p><p className="text-xs font-medium text-slate-500">{user.email}</p></div></div></td>
                <td className="whitespace-nowrap px-5 py-3.5 font-medium text-slate-600">{user.phone}</td>
                <td className="px-5 py-3.5"><UserRolesEditor userId={user.id} name={user.name} roles={user.roles} /></td>
                <td className="px-5 py-3.5"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${user.isSuspended ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{user.isSuspended ? "Suspended" : "Active"}</span></td>
                <td className="px-5 py-3.5"><div className="flex justify-end gap-2"><form action={toggleUserSuspension}><input type="hidden" name="userId" value={user.id} /><input type="hidden" name="suspend" value={String(!user.isSuspended)} /><button className={`rounded-md border px-3 py-1.5 text-xs font-bold ${user.isSuspended ? "border-emerald-200 text-emerald-700 hover:bg-emerald-50" : "border-red-200 text-red-700 hover:bg-red-50"}`}>{user.isSuspended ? "Reactivate" : "Suspend"}</button></form><DeleteUserDialog user={{ id: user.id, name: user.name, email: user.email }} transferUsers={transferUsers} /></div></td>
              </tr>
            ))}
            {!filteredUsers.length && <tr><td colSpan={5} className="px-5 py-10 text-center font-medium text-slate-500">{terms.length ? "No users match your search." : "No users found."}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
