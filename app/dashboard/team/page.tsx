import { requireAdmin } from "@/app/lib/auth";
import { createAdminClient } from "@/app/lib/supabase/admin";
import { TeamForm, type TeamPerson } from "./team-form";

export const instant = false;

export default async function TeamPage() {
  await requireAdmin();
  const admin = createAdminClient();
  const [profiles, roles, teams, memberships] = await Promise.all([
    admin.from("profiles").select("id, first_name, last_name, full_name, is_suspended").order("full_name"),
    admin.from("user_roles").select("user_id, role"),
    admin.from("crm_teams").select("id, name, manager_id").order("name"),
    admin.from("crm_team_members").select("team_id, user_id"),
  ]);
  if (profiles.error || roles.error) throw new Error("Unable to load team users.");
  const people: TeamPerson[] = (profiles.data ?? []).map((person) => ({
    id: person.id,
    name: [person.first_name, person.last_name].filter(Boolean).join(" ") || person.full_name || "Unnamed user",
    suspended: person.is_suspended ?? false,
    roles: (roles.data ?? []).filter((role) => role.user_id === person.id).map((role) => role.role),
  }));

  return (
    <section className="mx-auto max-w-6xl space-y-5">
      <div><h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Team</h1><p className="mt-1 text-sm text-slate-500">Create teams and organize members under a sales manager.</p></div>
      {teams.error || memberships.error ? <p role="alert" className="rounded-xl bg-amber-50 p-5 text-sm font-semibold text-amber-800">Team data is unavailable. Apply the 20261030_create_crm_teams.sql migration in Supabase, then reload this page.</p> : <>
        <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm"><h2 className="mb-4 text-lg font-bold text-slate-900">Create team</h2><TeamForm people={people} /></div>
        <h2 className="text-lg font-bold text-slate-900">Existing teams ({teams.data?.length ?? 0})</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {(teams.data ?? []).map((team) => {
            const memberIds = (memberships.data ?? []).filter((member) => member.team_id === team.id).map((member) => member.user_id);
            return <article key={team.id} className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm"><h3 className="text-lg font-bold text-slate-900">{team.name}</h3><p className="mt-1 text-sm text-slate-500">Sales manager: {people.find((person) => person.id === team.manager_id)?.name ?? "Unavailable"} · {memberIds.length} members</p><p className="mt-2 text-sm text-slate-600">{memberIds.map((id) => people.find((person) => person.id === id)?.name ?? "Unavailable user").join(", ") || "No members assigned yet."}</p><details className="mt-4"><summary className="cursor-pointer text-sm font-bold text-red-700">Edit team and members</summary><div className="mt-4"><TeamForm people={people} team={{ id: team.id, name: team.name, managerId: team.manager_id, memberIds }} /></div></details></article>;
          })}
        </div>
        {!teams.data?.length && <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">No teams yet. Create your first team above.</p>}
      </>}
    </section>
  );
}
