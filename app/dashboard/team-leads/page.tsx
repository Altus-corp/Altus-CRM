import { connection } from "next/server";
import { redirect } from "next/navigation";
import { requireUser } from "@/app/lib/auth";
import { createClient } from "@/app/lib/supabase/server";
import { createAdminClient } from "@/app/lib/supabase/admin";
import { getLeadSharedConfig } from "@/app/lib/lead-shared-config";
import { getSalesManagerTeamMemberIds } from "@/app/lib/sales-manager-team";
import { indiaToday } from "@/app/lib/lead-event-schedule";
import { TeamLeadsWorkspace } from "@/components/leads/team-leads-workspace";
import type { LeadRow } from "@/components/leads/leads-table";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isDoNotCallResolution = (resolution: unknown) => {
  const value = Array.isArray(resolution) ? resolution[0] : resolution;
  const name = value && typeof value === "object" && "name" in value && typeof value.name === "string"
    ? value.name.trim().toLowerCase().replace(/[,_-]+/g, " ").replace(/\s+/g, " ")
    : "";
  return ["dnd", "not interested", "lost", "i will get back", "wrong number", "old graduate", "abandoned"].includes(name);
};

export default async function TeamLeadsPage({ searchParams }: { searchParams: Promise<{ member?: string; view?: string }> }) {
  await connection();
  const [user, params] = await Promise.all([requireUser(), searchParams]);
  if (!user.roles.includes("sales_manager") || user.roles.includes("admin")) redirect("/dashboard/leads");

  const admin = createAdminClient();
  const memberIds = await getSalesManagerTeamMemberIds(user.userId);
  const requestedMemberId = params.member ?? "";
  const selectedMemberId = UUID_PATTERN.test(requestedMemberId) && memberIds.includes(requestedMemberId) ? requestedMemberId : null;
  const view = params.view === "master" ? "master" as const : "focused" as const;
  const [sharedConfig, preferenceResult, memberProfilesResult] = await Promise.all([
    getLeadSharedConfig(),
    (await createClient()).from("lead_table_preferences").select("column_order, column_widths, frozen_column_keys, hidden_column_keys, layout_version").eq("user_id", user.userId).maybeSingle(),
    memberIds.length ? admin.from("profiles").select("id, first_name, last_name, full_name, is_suspended").in("id", memberIds).eq("is_suspended", false) : Promise.resolve({ data: [] as { id: string; first_name: string | null; last_name: string | null; full_name: string | null }[] }),
  ]);

  const teamMembers = (memberProfilesResult.data ?? []).map((profile) => ({
    id: profile.id,
    name: [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.full_name || "Unnamed user",
  }));
  const visibleMemberIds = new Set(teamMembers.map((member) => member.id));
  const permittedMemberId = selectedMemberId && visibleMemberIds.has(selectedMemberId) ? selectedMemberId : null;

  const leadsResult = permittedMemberId
    ? await admin
        .from("leads")
        .select("id, lead_number, first_name, last_name, email, phone, created_at, custom_data, assignments:lead_product_assignments!inner(id, is_ambassador, assigned_to, assigned_at, focused_on, next_follow_up_at, is_new_inbound, product:lead_products(id, code, name), stage:lead_stages(name), resolution:lead_resolutions(name))")
        .eq("assignments.assigned_to", permittedMemberId)
        .eq("assignments.is_active", true)
        .eq("assignments.is_closed", false)
        .order("created_at", { ascending: false })
        .limit(200)
    : { data: [] as Array<Record<string, unknown>>, error: null };

  if (leadsResult.error) {
    return <section className="mx-auto max-w-3xl rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800"><p className="font-extrabold">Team Leads are unavailable.</p><p className="mt-1">{leadsResult.error.message}</p></section>;
  }

  const rawLeads = leadsResult.data ?? [];
  const leadIds = rawLeads.map((lead) => lead.id).filter((id): id is string => typeof id === "string");
  const { data: callActivities } = leadIds.length
    ? await admin.from("lead_activities").select("lead_id, lead_product_assignment_id, created_at").eq("activity_type", "call").in("lead_id", leadIds).order("created_at", { ascending: false }).limit(2000)
    : { data: [] as { lead_id: string; lead_product_assignment_id: string | null; created_at: string }[] };
  const lastCalledByAssignment = new Map<string, string>();
  const lastCalledByLead = new Map<string, string>();
  for (const activity of callActivities ?? []) {
    if (!lastCalledByLead.has(activity.lead_id)) lastCalledByLead.set(activity.lead_id, activity.created_at);
    if (activity.lead_product_assignment_id && !lastCalledByAssignment.has(activity.lead_product_assignment_id)) lastCalledByAssignment.set(activity.lead_product_assignment_id, activity.created_at);
  }

  const leads = rawLeads.flatMap((lead) => {
    const assignments = Array.isArray(lead.assignments) ? lead.assignments : [];
    const visibleAssignments = assignments.filter((assignment) => !assignment.is_ambassador && !isDoNotCallResolution(assignment.resolution));
    const assignment = visibleAssignments[0];
    if (!assignment || typeof lead.id !== "string" || typeof lead.created_at !== "string") return [];
    return [{
      id: lead.id,
      lead_number: typeof lead.lead_number === "number" ? lead.lead_number : null,
      assignment_id: assignment.id,
      first_name: typeof lead.first_name === "string" ? lead.first_name : "",
      last_name: typeof lead.last_name === "string" ? lead.last_name : null,
      email: typeof lead.email === "string" ? lead.email : null,
      phone: typeof lead.phone === "string" ? lead.phone : null,
      created_at: lead.created_at,
      custom_data: lead.custom_data && typeof lead.custom_data === "object" ? lead.custom_data as Record<string, unknown> : {},
      assigned_to: assignment.assigned_to,
      assigned_at: assignment.assigned_at,
      focused_on: assignment.focused_on,
      next_follow_up_at: assignment.next_follow_up_at,
      is_new_inbound: assignment.is_new_inbound,
      last_called_at: lastCalledByAssignment.get(assignment.id) ?? lastCalledByLead.get(lead.id) ?? null,
      product: Array.isArray(assignment.product) ? assignment.product : assignment.product ? [assignment.product] : [],
      stage: Array.isArray(assignment.stage) ? assignment.stage : assignment.stage ? [assignment.stage] : [],
      resolution: Array.isArray(assignment.resolution) ? assignment.resolution : assignment.resolution ? [assignment.resolution] : [],
      product_assignments: visibleAssignments.map((item) => ({
        id: item.id,
        assigned_to: item.assigned_to,
        assigned_at: item.assigned_at,
        focused_on: item.focused_on,
        next_follow_up_at: item.next_follow_up_at,
        is_new_inbound: item.is_new_inbound,
        last_called_at: lastCalledByAssignment.get(item.id) ?? lastCalledByLead.get(lead.id) ?? null,
        product: Array.isArray(item.product) ? item.product[0] : item.product,
        stage: Array.isArray(item.stage) ? item.stage[0] : item.stage,
        resolution: Array.isArray(item.resolution) ? item.resolution[0] : item.resolution,
      })),
    }] as LeadRow[];
  });

  const preferencesData = preferenceResult.data;
  const preferences = {
    order: Array.isArray(preferencesData?.column_order) ? preferencesData.column_order.filter((value): value is string => typeof value === "string") : [],
    widths: preferencesData?.column_widths && typeof preferencesData.column_widths === "object" ? preferencesData.column_widths as Record<string, number> : {},
    frozen: preferencesData?.frozen_column_keys ?? [],
    hidden: preferencesData?.hidden_column_keys ?? [],
    layoutVersion: preferencesData?.layout_version ?? 0,
  };
  const assignedNames = Object.fromEntries(teamMembers.map((member) => [member.id, member.name]));
  const focusedLeadIds = leads.filter((lead) => lead.focused_on === indiaToday()).map((lead) => lead.assignment_id);

  return <TeamLeadsWorkspace columns={sharedConfig.columns} leads={leads} focusedLeadIds={focusedLeadIds} assignedNames={assignedNames} preferences={preferences} teamMembers={teamMembers} selectedMemberId={permittedMemberId} view={view} />;
}
