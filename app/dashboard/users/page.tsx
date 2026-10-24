import { requireAdmin } from "@/app/lib/auth";
import { ROLE_LABELS, type AppRole } from "@/app/lib/roles";
import { createAdminClient } from "@/app/lib/supabase/admin";
import { toggleUserSuspension } from "./actions";
import { UserModal } from "./user-modal";

export const instant = false;

type ManagedUser = {
  id: string;
  name: string;
  email: string;
  phone: string;
  roles: AppRole[];
  isSuspended: boolean;
};

export default async function UsersPage() {
  await requireAdmin();
  const admin = createAdminClient();
  const { data: authData, error: authError } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 50,
  });

  if (authError) throw new Error("Unable to load users.");

  const userIds = authData.users.map((user) => user.id);
  const [{ data: profiles }, { data: userRoles }] = await Promise.all([
    userIds.length
      ? admin.from("profiles").select("id, first_name, last_name, full_name, phone, is_suspended").in("id", userIds)
      : Promise.resolve({ data: [] }),
    userIds.length
      ? admin.from("user_roles").select("user_id, role").in("user_id", userIds)
      : Promise.resolve({ data: [] }),
  ]);

  const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  const rolesByUserId = new Map<string, AppRole[]>();
  (userRoles ?? []).forEach((item) => {
    const existing = rolesByUserId.get(item.user_id) ?? [];
    existing.push(item.role as AppRole);
    rolesByUserId.set(item.user_id, existing);
  });

  const users: ManagedUser[] = authData.users.map((user) => {
    const profile = profileById.get(user.id);
    const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || profile?.full_name || user.email || "Unnamed user";
    return {
      id: user.id,
      name,
      email: user.email ?? "—",
      phone: profile?.phone ?? "—",
      roles: rolesByUserId.get(user.id) ?? [],
      isSuspended: profile?.is_suspended ?? false,
    };
  });

  return (
    <section className="mx-auto max-w-6xl">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-[-0.04em] text-slate-900">Users</h1>
          <p className="mt-1 text-sm font-medium text-slate-500">Manage team members and their CRM access.</p>
        </div>
        <UserModal />
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-[0_8px_24px_rgba(42,55,80,0.06)]">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-xs font-extrabold uppercase tracking-[0.08em] text-slate-500">
              <tr><th className="px-5 py-3">User</th><th className="px-5 py-3">Phone</th><th className="px-5 py-3">Role</th><th className="px-5 py-3">Status</th><th className="px-5 py-3 text-right">Action</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-slate-50/70">
                  <td className="px-5 py-3.5"><div className="flex items-center gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-red-50 text-xs font-extrabold text-red-700">{user.name.slice(0, 2).toUpperCase()}</span><div><p className="font-bold text-slate-800">{user.name}</p><p className="text-xs font-medium text-slate-500">{user.email}</p></div></div></td>
                  <td className="whitespace-nowrap px-5 py-3.5 font-medium text-slate-600">{user.phone}</td>
                  <td className="px-5 py-3.5"><div className="flex flex-wrap gap-1">{user.roles.length ? user.roles.map((role) => <span key={role} className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">{ROLE_LABELS[role]}</span>) : <span className="text-xs text-slate-400">No role</span>}</div></td>
                  <td className="px-5 py-3.5"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${user.isSuspended ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{user.isSuspended ? "Suspended" : "Active"}</span></td>
                  <td className="px-5 py-3.5 text-right"><form action={toggleUserSuspension}><input type="hidden" name="userId" value={user.id} /><input type="hidden" name="suspend" value={String(!user.isSuspended)} /><button className={`rounded-md border px-3 py-1.5 text-xs font-bold ${user.isSuspended ? "border-emerald-200 text-emerald-700 hover:bg-emerald-50" : "border-red-200 text-red-700 hover:bg-red-50"}`}>{user.isSuspended ? "Reactivate" : "Suspend"}</button></form></td>
                </tr>
              ))}
              {!users.length && <tr><td colSpan={5} className="px-5 py-10 text-center font-medium text-slate-500">No users found.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
