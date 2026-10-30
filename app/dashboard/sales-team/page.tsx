import { redirect } from "next/navigation";
import { requireUser } from "@/app/lib/auth";
import { ROLE_LABELS, type AppRole } from "@/app/lib/roles";
import { createAdminClient } from "@/app/lib/supabase/admin";

export const instant = false;

export default async function MyTeamPage() {
  const { userId, roles, displayName } = await requireUser();
  if (!roles.includes("sales_manager")) redirect("/dashboard");

  // Service access is scoped to the authenticated manager before loading any members.
  const admin = createAdminClient();
  const { data: teams, error: teamsError } = await admin
    .from("crm_teams").select("id, name").eq("manager_id", userId).order("name");

  if (teamsError) return <TeamUnavailable />;
  const teamIds = (teams ?? []).map((team) => team.id);
  const { data: memberships, error: membershipError } = teamIds.length
    ? await admin.from("crm_team_members").select("team_id, user_id").in("team_id", teamIds)
    : { data: [], error: null };
  if (membershipError) return <TeamUnavailable />;

  const memberIds = [...new Set((memberships ?? []).map((member) => member.user_id))];
  const [profiles, memberRoles] = memberIds.length ? await Promise.all([
    admin.from("profiles").select("id, first_name, last_name, full_name, phone, is_suspended").in("id", memberIds),
    admin.from("user_roles").select("user_id, role").in("user_id", memberIds),
  ]) : [{ data: [], error: null }, { data: [], error: null }];
  if (profiles.error || memberRoles.error) return <TeamUnavailable />;

  const emails = await Promise.all(memberIds.map(async (id) => {
    const { data, error } = await admin.auth.admin.getUserById(id);
    if (error) throw new Error("Unable to load team member contact details.");
    return [id, data.user?.email ?? ""] as const;
  }));
  const emailById = new Map(emails);
  const profileById = new Map((profiles.data ?? []).map((profile) => [profile.id, profile]));

  return (
    <section className="mx-auto max-w-6xl space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">My Team</h1>
        <p className="mt-1 text-sm text-slate-500">Your assigned teams and member details. Contact an admin to update team assignments.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-100 bg-white p-4"><p className="text-sm text-slate-500">Teams you manage</p><p className="mt-1 text-2xl font-extrabold text-slate-900">{teams?.length ?? 0}</p></div>
        <div className="rounded-xl border border-slate-100 bg-white p-4"><p className="text-sm text-slate-500">Total members</p><p className="mt-1 text-2xl font-extrabold text-slate-900">{memberIds.length}</p></div>
      </div>
      {(teams ?? []).map((team) => {
        const members = (memberships ?? []).filter((member) => member.team_id === team.id);
        return (
          <article key={team.id} className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-5"><h2 className="text-lg font-bold text-slate-900">{team.name}</h2><p className="mt-1 text-sm text-slate-500">Sales manager: {displayName} &middot; {members.length} members</p></div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <caption className="sr-only">Members of {team.name}</caption>
                <thead className="bg-slate-50 text-xs font-bold uppercase text-slate-500"><tr>{["Member", "Email", "Phone", "Roles", "Status"].map((label) => <th key={label} scope="col" className="px-5 py-3">{label}</th>)}</tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {members.map(({ user_id: id }) => {
                    const profile = profileById.get(id);
                    const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || profile?.full_name || "Unavailable user";
                    const assignedRoles = (memberRoles.data ?? []).filter((role) => role.user_id === id);
                    const email = emailById.get(id);
                    return <tr key={id}>
                      <td className="px-5 py-4 font-bold text-slate-800">{name}</td>
                      <td className="px-5 py-4 text-slate-600">{email ? <a href={`mailto:${email}`} className="hover:text-red-700">{email}</a> : "—"}</td>
                      <td className="whitespace-nowrap px-5 py-4 text-slate-600">{profile?.phone || "—"}</td>
                      <td className="px-5 py-4"><div className="flex flex-wrap gap-1">{assignedRoles.length ? assignedRoles.map(({ role }) => <span key={role} className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">{ROLE_LABELS[role as AppRole] ?? role}</span>) : <span className="text-slate-400">No role</span>}</div></td>
                      <td className="px-5 py-4"><span className={`rounded-full px-2 py-1 text-xs font-bold ${!profile || profile.is_suspended ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{!profile ? "Unavailable" : profile.is_suspended ? "Suspended" : "Active"}</span></td>
                    </tr>;
                  })}
                  {!members.length && <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-500">No members assigned to this team yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </article>
        );
      })}
      {!teams?.length && <p className="rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">You haven’t been assigned a team yet. Ask an admin to assign you as a team’s sales manager.</p>}
    </section>
  );
}

function TeamUnavailable() {
  return <section className="mx-auto max-w-6xl"><h1 className="text-2xl font-extrabold text-slate-900">My Team</h1><p role="alert" className="mt-4 rounded-xl bg-amber-50 p-5 text-sm font-semibold text-amber-800">Team details are currently unavailable. Please try again or contact an admin.</p></section>;
}
