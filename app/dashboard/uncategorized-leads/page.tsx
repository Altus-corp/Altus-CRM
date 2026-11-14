import { connection } from "next/server";
import { requireUser } from "@/app/lib/auth";
import { createAdminClient } from "@/app/lib/supabase/admin";
import { getLeadSharedConfig } from "@/app/lib/lead-shared-config";
import { DndMasterTable, type DndRow } from "@/components/leads/dnd-master-table";

export const instant = false;

type Product = { id: string; code: string; name: string };
type Lead = { id: string; lead_number: number | null; first_name: string; last_name: string | null; email: string | null; phone: string | null; created_at: string; custom_data: Record<string, unknown> | null };
type Assignment = {
  id: string;
  assigned_to: string | null;
  assigned_at: string | null;
  focused_on: string | null;
  next_follow_up_at: string | null;
  is_new_inbound: boolean | null;
  product: Product | Product[] | null;
  stage: { name: string } | { name: string }[] | null;
  resolution: { name: string } | { name: string }[] | null;
  lead: Lead | Lead[] | null;
};

const one = <T,>(value: T | T[] | null): T | null => Array.isArray(value) ? value[0] ?? null : value;

export default async function UncategorizedLeadsPage() {
  await connection();
  const { roles, userId } = await requireUser();
  if (!roles.includes("admin")) {
    return <section className="mx-auto max-w-3xl rounded-xl bg-red-50 p-5 text-sm font-bold text-red-700">Only an admin can review Uncategorized Leads.</section>;
  }

  const supabase = createAdminClient();
  const [sharedConfig, assignmentsResult, profilesResult, salesRolesResult, preferencesResult] = await Promise.all([
    getLeadSharedConfig(),
    supabase
      .from("lead_product_assignments")
      .select("id, assigned_to, assigned_at, focused_on, next_follow_up_at, is_new_inbound, product:lead_products!inner(id, code, name), stage:lead_stages(name), resolution:lead_resolutions(name), lead:leads!inner(id, lead_number, first_name, last_name, email, phone, created_at, custom_data)")
      .eq("is_active", true)
      .eq("product.code", "UNCATEGORIZED")
      .order("created_at", { ascending: false })
      .limit(2000),
    supabase.from("profiles").select("id, first_name, last_name, full_name, is_suspended"),
    supabase.from("user_roles").select("user_id, role").in("role", ["sales_executive", "sales_manager", "consultant"]),
    supabase.from("lead_table_preferences").select("column_order, column_widths, frozen_column_keys, hidden_column_keys, layout_version").eq("user_id", userId).maybeSingle(),
  ]);

  if (assignmentsResult.error) {
    return <section className="mx-auto max-w-3xl rounded-xl bg-red-50 p-5 text-sm font-bold text-red-700">Uncategorized Leads could not be loaded. Run the Uncategorized Leads migration, then refresh this page.</section>;
  }

  const profiles = profilesResult.data ?? [];
  const assignedNames = Object.fromEntries(profiles.map((profile) => [profile.id, [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.full_name || "Unknown user"]));
  const eligibleAssignees = new Set((salesRolesResult.data ?? []).map((role) => role.user_id));
  const reassignUsers = profiles
    .filter((profile) => !profile.is_suspended && eligibleAssignees.has(profile.id))
    .map((profile) => ({ id: profile.id, name: [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.full_name || "Unnamed user" }));
  const rows: DndRow[] = ((assignmentsResult.data ?? []) as unknown as Assignment[]).flatMap((assignment) => {
    const lead = one(assignment.lead);
    const product = one(assignment.product);
    if (!lead || !product) return [];
    const stage = one(assignment.stage);
    const resolution = one(assignment.resolution);
    return [{
      id: assignment.id,
      status: "Uncategorized",
      markedBy: assignment.assigned_to ? assignedNames[assignment.assigned_to] ?? "Unknown user" : "Unassigned",
      markedOn: lead.created_at,
      lead: {
        ...lead,
        custom_data: lead.custom_data ?? {},
        assignment_id: assignment.id,
        assigned_to: assignment.assigned_to,
        assigned_at: assignment.assigned_at,
        focused_on: assignment.focused_on,
        next_follow_up_at: assignment.next_follow_up_at,
        is_new_inbound: assignment.is_new_inbound ?? undefined,
        product: [product],
        stage: stage ? [stage] : [],
        resolution: resolution ? [resolution] : [],
        product_assignments: [{
          id: assignment.id,
          assigned_to: assignment.assigned_to,
          assigned_at: assignment.assigned_at,
          focused_on: assignment.focused_on,
          next_follow_up_at: assignment.next_follow_up_at,
          is_new_inbound: assignment.is_new_inbound ?? undefined,
          product,
          stage,
          resolution,
        }],
      },
    }];
  });
  const tablePreferences = preferencesResult.data;
  const preferences = {
    order: Array.isArray(tablePreferences?.column_order) ? tablePreferences.column_order.filter((value): value is string => typeof value === "string") : [],
    widths: tablePreferences?.column_widths && typeof tablePreferences.column_widths === "object" ? tablePreferences.column_widths as Record<string, number> : {},
    frozen: tablePreferences?.frozen_column_keys ?? [],
    hidden: tablePreferences?.hidden_column_keys ?? [],
    layoutVersion: tablePreferences?.layout_version ?? 0,
  };

  return <section className="mx-auto max-w-[1500px]">
    <header>
      <p className="text-[10px] font-extrabold tracking-[0.12em] text-red-600">LEADS</p>
      <h1 className="mt-0.5 text-[22px] font-extrabold tracking-[-0.04em] text-slate-900">Uncategorized Leads</h1>
      <p className="mt-1 text-xs text-slate-500">Leads submitted with no product, or with the Uncategorized product. Select records to assign them to a sales user. Double-click a lead to open its details.</p>
    </header>
    <DndMasterTable
      rows={rows}
      columns={sharedConfig.columns.filter((column) => column.is_visible)}
      assignedNames={assignedNames}
      preferences={preferences}
      emptyLabel="No Uncategorized Leads yet."
      reassignUsers={reassignUsers}
      reassignDescription="Assign selected Uncategorized product work when its correct product or sales owner is known."
    />
  </section>;
}
