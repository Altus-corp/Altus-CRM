import { connection } from "next/server";
import { redirect } from "next/navigation";
import { requireUser } from "@/app/lib/auth";
import { createClient } from "@/app/lib/supabase/server";
import { createAdminClient } from "@/app/lib/supabase/admin";
import { getLeadSharedConfig } from "@/app/lib/lead-shared-config";
import { getSalesManagerTeamMemberIds } from "@/app/lib/sales-manager-team";
import { TeamDndMasterWorkspace } from "@/components/leads/team-dnd-master-workspace";
import type { DndRow } from "@/components/leads/dnd-master-table";

type Product = { id: string; code: string; name: string };
type LeadInfo = { id: string; lead_number: number | null; first_name: string; last_name: string | null; email: string | null; phone: string | null; created_at: string; custom_data: Record<string, unknown> | null };
type AssignmentInfo = { id: string; assigned_to: string | null; assigned_at: string | null; focused_on: string | null; next_follow_up_at: string | null; product: Product | Product[] | null; stage: { name: string } | { name: string }[] | null; resolution: { name: string } | { name: string }[] | null; lead: LeadInfo | LeadInfo[] | null };
type ActivityRow = { id: string; created_by: string; created_at: string; metadata: { resolution_id?: string } | null; assignment: AssignmentInfo | AssignmentInfo[] | null };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const one = <T,>(value: T | T[] | null): T | null => (Array.isArray(value) ? value[0] ?? null : value);
const filters = [
  { key: "all", label: "All" },
  { key: "dnd", label: "DND" },
  { key: "not interested", label: "Not Interested" },
  { key: "lost", label: "Lost" },
  { key: "i will get back", label: "I Will Get Back" },
  { key: "wrong number", label: "Wrong Number" },
];
const dateFormat = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default async function TeamDndMasterPage({ searchParams }: { searchParams: Promise<{ member?: string; type?: string }> }) {
  await connection();
  const [user, params] = await Promise.all([requireUser(), searchParams]);
  if (!user.roles.includes("sales_manager") || user.roles.includes("admin")) redirect("/dashboard/dnd-master");

  const admin = createAdminClient();
  const memberIds = await getSalesManagerTeamMemberIds(user.userId);
  const requestedMemberId = params.member ?? "";
  const selectedMemberId = UUID_PATTERN.test(requestedMemberId) && memberIds.includes(requestedMemberId) ? requestedMemberId : null;
  const activeFilter = filters.some((filter) => filter.key === params.type) ? params.type! : "all";
  const [sharedConfig, preferencesResult, memberProfilesResult] = await Promise.all([
    getLeadSharedConfig(),
    (await createClient()).from("lead_table_preferences").select("column_order, column_widths, frozen_column_keys, hidden_column_keys, layout_version").eq("user_id", user.userId).maybeSingle(),
    memberIds.length ? admin.from("profiles").select("id, first_name, last_name, full_name, is_suspended").in("id", memberIds).eq("is_suspended", false) : Promise.resolve({ data: [] as { id: string; first_name: string | null; last_name: string | null; full_name: string | null }[] }),
  ]);
  const teamMembers = (memberProfilesResult.data ?? []).map((profile) => ({ id: profile.id, name: [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.full_name || "Unnamed user" }));
  const visibleIds = new Set(teamMembers.map((member) => member.id));
  const permittedMemberId = selectedMemberId && visibleIds.has(selectedMemberId) ? selectedMemberId : null;

  const [resolutionsResult, activitiesResult] = permittedMemberId
    ? await Promise.all([
        admin.from("lead_resolutions").select("id, name").in("name", ["DND", "Not Interested", "Lost", "I will get Back", "I Will Get Back", "Wrong Number"]),
        admin.from("lead_activities").select("id, created_by, created_at, metadata, assignment:lead_product_assignments!inner(id, assigned_to, assigned_at, focused_on, next_follow_up_at, product:lead_products(id, code, name), stage:lead_stages(name), resolution:lead_resolutions(name), lead:leads(id, lead_number, first_name, last_name, email, phone, created_at, custom_data))").eq("activity_type", "resolution_updated").eq("assignment.assigned_to", permittedMemberId).order("created_at", { ascending: false }).limit(2000),
      ])
    : [{ data: [] as { id: string; name: string }[], error: null }, { data: [] as ActivityRow[], error: null }];

  if (activitiesResult.error) return <section className="mx-auto max-w-3xl rounded-xl bg-red-50 p-5 text-sm font-bold text-red-700">Team Do Not Call could not be loaded. Please refresh the page.</section>;

  const activities = (activitiesResult.data ?? []) as unknown as ActivityRow[];
  const actorIds = [...new Set(activities.map((activity) => activity.created_by).filter(Boolean))];
  const { data: actorProfiles } = actorIds.length ? await admin.from("profiles").select("id, first_name, last_name, full_name").in("id", actorIds) : { data: [] as { id: string; first_name: string | null; last_name: string | null; full_name: string | null }[] };
  const assignedNames = Object.fromEntries([...(memberProfilesResult.data ?? []), ...(actorProfiles ?? [])].map((profile) => [profile.id, [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.full_name || "Unknown user"]));
  const resolutionNames = new Map((resolutionsResult.data ?? []).map((resolution) => [resolution.id, resolution.name]));
  const allRows: DndRow[] = activities.flatMap((row) => {
    const status = row.metadata?.resolution_id ? resolutionNames.get(row.metadata.resolution_id) : undefined;
    const assignment = one(row.assignment);
    const lead = assignment ? one(assignment.lead) : null;
    if (!status || !assignment || !lead) return [];
    const product = one(assignment.product);
    const stage = one(assignment.stage);
    const resolution = one(assignment.resolution);
    return [{
      id: row.id,
      status,
      markedBy: assignedNames[row.created_by] ?? "Unknown user",
      markedOn: dateFormat.format(new Date(row.created_at)),
      lead: {
        ...lead,
        custom_data: lead.custom_data ?? {},
        assignment_id: assignment.id,
        assigned_to: assignment.assigned_to,
        assigned_at: assignment.assigned_at,
        focused_on: assignment.focused_on,
        next_follow_up_at: assignment.next_follow_up_at,
        product: product ? [product] : [],
        stage: stage ? [stage] : [],
        resolution: resolution ? [resolution] : [],
        product_assignments: [{ id: assignment.id, assigned_to: assignment.assigned_to, assigned_at: assignment.assigned_at, focused_on: assignment.focused_on, next_follow_up_at: assignment.next_follow_up_at, product, stage, resolution }],
      },
    }];
  });
  const rows = activeFilter === "all" ? allRows : allRows.filter((row) => row.status.toLowerCase() === activeFilter);
  const filterCounts = Object.fromEntries(filters.map((filter) => [filter.key, filter.key === "all" ? allRows.length : allRows.filter((row) => row.status.toLowerCase() === filter.key).length]));
  const preferencesData = preferencesResult.data;
  const preferences = {
    order: Array.isArray(preferencesData?.column_order) ? preferencesData.column_order.filter((value): value is string => typeof value === "string") : [],
    widths: preferencesData?.column_widths && typeof preferencesData.column_widths === "object" ? preferencesData.column_widths as Record<string, number> : {},
    frozen: preferencesData?.frozen_column_keys ?? [],
    hidden: preferencesData?.hidden_column_keys ?? [],
    layoutVersion: preferencesData?.layout_version ?? 0,
  };

  return <TeamDndMasterWorkspace rows={rows} columns={sharedConfig.columns.filter((column) => column.is_visible)} assignedNames={assignedNames} preferences={preferences} teamMembers={teamMembers} selectedMemberId={permittedMemberId} filters={filters} activeFilter={activeFilter} filterCounts={filterCounts} />;
}
