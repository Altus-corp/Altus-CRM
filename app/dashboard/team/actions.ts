"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/app/lib/auth";
import { createAdminClient } from "@/app/lib/supabase/admin";

type TeamState = { error?: string; success?: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function saveTeam(_state: TeamState, form: FormData): Promise<TeamState> {
  await requireAdmin();
  const teamId = String(form.get("teamId") ?? "");
  const name = String(form.get("name") ?? "").trim();
  const managerId = String(form.get("managerId") ?? "");
  const members = [...new Set(form.getAll("members").map(String))];
  if (!name || name.length > 100) return { error: "Enter a team name of up to 100 characters." };
  if ((teamId && !uuid.test(teamId)) || !uuid.test(managerId) || members.some((id) => !uuid.test(id))) return { error: "Choose a valid manager and members." };
  if (members.includes(managerId)) return { error: "The manager cannot also be a team member." };
  const { error } = await createAdminClient().rpc("save_crm_team", { p_team_id: teamId || null, p_name: name, p_manager_id: managerId, p_member_ids: members });
  if (error) return { error: error.code === "23505" ? "A team with this name already exists." : error.code === "P0001" ? error.message : "Unable to save the team. Check that the team migration has been applied and try again." };
  revalidatePath("/dashboard/team");
  return { success: teamId ? "Team updated." : "Team created. You can now edit it below." };
}

export async function deleteTeam(_state: TeamState, form: FormData): Promise<TeamState> {
  await requireAdmin();
  const teamId = String(form.get("teamId") ?? "");
  if (!uuid.test(teamId)) return { error: "Invalid team." };

  const admin = createAdminClient();
  const { data: team, error: readError } = await admin
    .from("crm_teams")
    .select("id, name")
    .eq("id", teamId)
    .maybeSingle();
  if (readError || !team) return { error: "This team could not be found." };

  // crm_team_members.team_id uses ON DELETE CASCADE. Deleting a team removes
  // only those membership links; people and lead assignments remain intact.
  const { error: deleteError } = await admin.from("crm_teams").delete().eq("id", teamId);
  if (deleteError) return { error: "Unable to delete this team. Please try again." };

  revalidatePath("/dashboard", "layout");
  revalidatePath("/dashboard/team");
  revalidatePath("/dashboard/leads");
  revalidatePath("/dashboard/sales-manager");
  revalidatePath("/dashboard/sales-team");
  return { success: `${team.name} was deleted. CRM users and leads were not changed.` };
}
