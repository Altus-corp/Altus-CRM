import { requireAdmin } from "@/app/lib/auth";
import { type AppRole } from "@/app/lib/roles";
import { createAdminClient } from "@/app/lib/supabase/admin";
import { UserModal } from "./user-modal";
import { UsersTable, type ManagedUser } from "./users-table";

export const instant = false;

export default async function UsersPage() {
  await requireAdmin();
  const admin = createAdminClient();
  const { data: authData, error: authError } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
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
  const transferUsers = users
    .filter((user) => !user.isSuspended && user.roles.some((role) => ["sales_executive", "sales_manager", "consultant"].includes(role)))
    .map((user) => ({ id: user.id, name: user.name }));

  return (
    <section className="mx-auto max-w-6xl">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-[-0.04em] text-slate-900">Users</h1>
          <p className="mt-1 text-sm font-medium text-slate-500">Manage team members and their CRM access.</p>
        </div>
        <UserModal />
      </div>

      <UsersTable users={users} transferUsers={transferUsers} />
    </section>
  );
}
