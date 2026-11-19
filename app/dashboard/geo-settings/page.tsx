import { requireAdmin } from "@/app/lib/auth";
import { createAdminClient } from "@/app/lib/supabase/admin";
import { listGeoFences } from "./actions";
import { GeoSettingsManager } from "./geo-settings-manager";

export const instant = false;

export default async function GeoSettingsPage() {
  await requireAdmin();
  const admin = createAdminClient();
  const [{ data: authData }, { data: profiles }, fences] = await Promise.all([
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    admin.from("profiles").select("id, first_name, last_name, full_name, is_suspended"),
    listGeoFences(),
  ]);
  const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  const users = (authData?.users ?? [])
    .filter((user) => !profileById.get(user.id)?.is_suspended)
    .map((user) => {
      const profile = profileById.get(user.id);
      const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || profile?.full_name || user.email || "Unnamed user";
      return { id: user.id, name };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <section className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-extrabold tracking-[-0.04em] text-slate-900">Geo Setting CRM</h1>
      <p className="mt-1 text-sm font-medium text-slate-500">Restrict a CRM user&apos;s login to a radius around a chosen location. Users without a geofence here can sign in from anywhere.</p>
      <GeoSettingsManager users={users} fences={fences} />
    </section>
  );
}
