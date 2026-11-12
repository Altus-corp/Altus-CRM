import "server-only";

import { createAdminClient } from "@/app/lib/supabase/admin";

function missingTable(error: { code?: string } | null) {
  return error?.code === "42P01" || error?.code === "PGRST205";
}

// Supports both the existing named CRM teams and the direct Sales Manager →
// Team Member mapping. Keeping the union lets existing teams continue to work
// while managers can use the simpler direct relationship as well.
export async function getSalesManagerTeamMemberIds(managerId: string) {
  const admin = createAdminClient();
  const { data: teams, error: teamsError } = await admin
    .from("crm_teams")
    .select("id")
    .eq("manager_id", managerId);
  if (teamsError && !missingTable(teamsError)) throw new Error("Unable to load your sales team.");

  const teamIds = (teams ?? []).map((team) => team.id);
  const [membersResult, directMembersResult] = await Promise.all([
    teamIds.length
      ? admin.from("crm_team_members").select("user_id").in("team_id", teamIds)
      : Promise.resolve({ data: [] as { user_id: string }[], error: null }),
    admin.from("sales_manager_team_members").select("user_id").eq("manager_id", managerId),
  ]);
  if (membersResult.error && !missingTable(membersResult.error)) throw new Error("Unable to load your sales team.");
  if (directMembersResult.error && !missingTable(directMembersResult.error)) throw new Error("Unable to load your sales team.");

  return [...new Set([...(membersResult.data ?? []).map((member) => member.user_id), ...(directMembersResult.data ?? []).map((member) => member.user_id)])];
}
