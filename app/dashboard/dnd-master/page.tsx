import Link from "next/link";
import { connection } from "next/server";
import { requireUser } from "@/app/lib/auth";
import { isAmbassadorWorkspace } from "@/app/lib/roles";
import { createClient } from "@/app/lib/supabase/server";
import { getLeadSharedConfig } from "@/app/lib/lead-shared-config";
import { DndMasterTable, type DndRow } from "@/components/leads/dnd-master-table";

export const instant = false;

type Product = { id: string; code: string; name: string };
type LeadInfo = { id: string; lead_number: number | null; first_name: string; last_name: string | null; email: string | null; phone: string | null; created_at: string; custom_data: Record<string, unknown> | null };
type AssignmentInfo = { id: string; assigned_to: string | null; assigned_at: string | null; focused_on: string | null; next_follow_up_at: string | null; product: Product | Product[] | null; stage: { name: string } | { name: string }[] | null; resolution: { name: string } | { name: string }[] | null; lead: LeadInfo | LeadInfo[] | null };
type Row = { id: string; created_by: string; created_at: string; metadata: { resolution_id?: string } | null; assignment: AssignmentInfo | AssignmentInfo[] | null };

const one = <T,>(value: T | T[] | null): T | null => (Array.isArray(value) ? value[0] ?? null : value);
const list = <T,>(value: T | T[] | null): T[] => (Array.isArray(value) ? value : value ? [value] : []);
const filters = [{ key: "all", label: "All" }, { key: "dnd", label: "DND" }, { key: "not interested", label: "Not Interested" }, { key: "wrong number", label: "Wrong Number" }];
const dateFormat = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default async function DndMasterPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  await connection();
  const { roles, userId } = await requireUser();
  const isAmbassador = isAmbassadorWorkspace(roles);
  const canReviewAll = roles.includes("admin") || roles.includes("sales_manager");
  const canUseDoNotCall = isAmbassador || canReviewAll || roles.some((role) => role === "sales_executive" || role === "consultant");
  if (!canUseDoNotCall) return <section className="mx-auto max-w-3xl rounded-xl bg-red-50 p-5 text-sm font-bold text-red-700">You do not have access to Do Not Call.</section>;

  const { type } = await searchParams;
  const activeFilter = filters.find((filter) => filter.key === type)?.key ?? "all";
  const supabase = await createClient();
  const { data: channelPartnerLinks, error: channelPartnerError } = isAmbassador
    ? await supabase.from("lead_channel_partners").select("lead_id").eq("ambassador_id", userId)
    : { data: [], error: null };
  if (channelPartnerError) return <section className="mx-auto max-w-3xl rounded-xl bg-amber-50 p-5 text-sm font-bold text-amber-800">Your Ambassador lead shares are unavailable. Ask an admin to run the Channel Partner database migration.</section>;
  const ambassadorLeadIds = (channelPartnerLinks ?? []).map((link) => link.lead_id);
  let activitiesQuery = supabase.from("lead_activities")
    .select("id, created_by, created_at, metadata, assignment:lead_product_assignments(id, assigned_to, assigned_at, focused_on, next_follow_up_at, product:lead_products(id, code, name), stage:lead_stages(name), resolution:lead_resolutions(name), lead:leads(id, lead_number, first_name, last_name, email, phone, created_at, custom_data))")
    .eq("activity_type", "resolution_updated").order("created_at", { ascending: false }).limit(2000);
  if (isAmbassador) activitiesQuery = activitiesQuery.in("lead_id", ambassadorLeadIds);
  else if (!canReviewAll) activitiesQuery = activitiesQuery.eq("created_by", userId);
  const [sharedConfig, { data: resolutions }, { data: activities, error }, { data: allProfiles }, { data: salesRoles }, { data: tablePreferences }] = await Promise.all([
    getLeadSharedConfig(),
    supabase.from("lead_resolutions").select("id, name").in("name", ["DND", "Not Interested", "Wrong Number"]),
    activitiesQuery,
    supabase.from("profiles").select("id, first_name, last_name, full_name, is_suspended"),
    supabase.from("user_roles").select("user_id, role").in("role", ["sales_executive", "sales_manager", "consultant"]),
    supabase.from("lead_table_preferences").select("column_order, column_widths, frozen_column_keys, hidden_column_keys, layout_version").eq("user_id", userId).maybeSingle(),
  ]);

  if (error) {
    return <section className="mx-auto max-w-3xl rounded-xl bg-red-50 p-5 text-sm font-bold text-red-700">DND Master could not be loaded. Please refresh the page.</section>;
  }

  const assignedNames = Object.fromEntries((allProfiles ?? []).map((profile) => [profile.id, [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.full_name || "Unknown user"]));
  const eligibleAssignees = new Set((salesRoles ?? []).map((role) => role.user_id));
  const reassignUsers = canReviewAll ? (allProfiles ?? []).filter((profile) => !profile.is_suspended && eligibleAssignees.has(profile.id)).map((profile) => ({ id: profile.id, name: [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.full_name || "Unnamed user" })) : [];
  const preferences = { order: Array.isArray(tablePreferences?.column_order) ? tablePreferences.column_order.filter((value): value is string => typeof value === "string") : [], widths: tablePreferences?.column_widths && typeof tablePreferences.column_widths === "object" ? tablePreferences.column_widths as Record<string, number> : {}, frozen: tablePreferences?.frozen_column_keys ?? [], hidden: tablePreferences?.hidden_column_keys ?? [], layoutVersion: tablePreferences?.layout_version ?? 0 };
  const resolutionNames = new Map((resolutions ?? []).map((resolution) => [resolution.id, resolution.name]));
  const rows: DndRow[] = ((activities ?? []) as unknown as Row[]).flatMap((row) => {
    const status = row.metadata?.resolution_id ? resolutionNames.get(row.metadata.resolution_id) : undefined;
    const assignment = one(row.assignment);
    const lead = assignment ? one(assignment.lead) : null;
    if (!status || !assignment || !lead || (activeFilter !== "all" && status.toLowerCase() !== activeFilter)) return [];
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
  const visibleColumns = list(sharedConfig.columns).filter((column) => column.is_visible);

  return <section className="mx-auto max-w-[1500px]">
    <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
      <div><p className="text-[10px] font-extrabold tracking-[0.12em] text-red-600">LEADS</p><h1 className="mt-0.5 text-[22px] font-extrabold tracking-[-0.04em] text-slate-900">Do Not Call</h1><p className="mt-1 text-xs text-slate-500">{isAmbassador ? "Your Channel Partner leads marked as DND, Not Interested, or Wrong Number by their Sales Person." : canReviewAll ? "Team leads marked as DND, Not Interested, or Wrong Number." : "Leads you marked as DND, Not Interested, or Wrong Number."} Double-click a lead to open its details.</p></div>
      <div className="flex gap-2">{filters.map((filter) => <Link key={filter.key} href={filter.key === "all" ? "/dashboard/dnd-master" : `/dashboard/dnd-master?type=${encodeURIComponent(filter.key)}`} className={`h-8 rounded border px-3 text-[11px] font-extrabold leading-8 ${activeFilter === filter.key ? "border-[#d90000] bg-[#d90000] text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>{filter.label}</Link>)}</div>
    </header>
    <DndMasterTable rows={rows} columns={visibleColumns} assignedNames={assignedNames} preferences={preferences} reassignUsers={reassignUsers} />
  </section>;
}
