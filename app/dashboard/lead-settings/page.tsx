import { requireAdmin } from "@/app/lib/auth";
import { connection } from "next/server";
import { DropdownManagement, type StageDropdown } from "@/components/leads/dropdown-management";
import { LeadConfiguration } from "@/components/leads/lead-configuration";
import { ColumnsManagement } from "@/components/leads/columns-management";
import { LeadDatabasePriority } from "@/components/leads/lead-database-priority";
import { RoundRobinWeeklyTargets } from "@/components/leads/round-robin-weekly-targets";
import { createClient } from "@/app/lib/supabase/server";

export const instant = false;

export default async function LeadSettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await connection();
  await requireAdmin();
  const { tab } = await searchParams;
  const supabase = await createClient();
  const [{ data: products, error: productsError }, { data: stages }, { data: resolutions }, { data: mappings }, { data: columns, error: columnsError }, { data: priorities, error: prioritiesError }, { data: profiles }, { data: userRoles }, { data: weeklyTargets, error: weeklyTargetsError }] = await Promise.all([
    supabase.from("lead_products").select("id, code, name").order("code"),
    supabase.from("lead_stages").select("id, product_id, name, position").order("position"),
    supabase.from("lead_resolutions").select("id, name"),
    supabase.from("lead_product_resolutions").select("id, product_id, resolution_id, next_stage_id, requires_follow_up, follow_up_after_hours, closes_lead"),
    supabase.from("lead_table_columns").select("id, field_key, label, source, field_type, options, is_required, is_visible, position, computed_from").order("position"),
    supabase.from("lead_database_priorities").select("database_key, label, priority").order("priority"),
    supabase.from("profiles").select("id, first_name, last_name, full_name, is_suspended").eq("is_suspended", false).order("first_name"),
    supabase.from("user_roles").select("user_id, role").in("role", ["sales_executive", "sales_manager", "consultant"]),
    supabase.from("lead_round_robin_weekly_targets").select("user_id, product_id, day_of_week, target_count"),
  ]);

  // Dropdown management is only needed on its own tab, and its tables may not exist until the migration is run.
  let dropdowns: StageDropdown[] = [];
  let dropdownsError = false;
  if (tab === "stages") {
    const [{ data: dropdownRows, error: dropdownRowsError }, { data: optionRows, error: optionRowsError }] = await Promise.all([
      supabase.from("lead_stage_dropdowns").select("id, product_id, stage_id, label, position").order("position"),
      supabase.from("lead_stage_dropdown_options").select("id, dropdown_id, label, position").order("position"),
    ]);
    dropdownsError = Boolean(dropdownRowsError || optionRowsError);
    dropdowns = (dropdownRows ?? []).map((dropdown) => ({ ...dropdown, options: (optionRows ?? []).filter((option) => option.dropdown_id === dropdown.id) }));
  }

  if (productsError) throw new Error("Lead configuration is not available. Run the lead-engine database migration first.");
  const resolutionNames = new Map((resolutions ?? []).map((resolution) => [resolution.id, resolution.name]));
  const productResolutions = (mappings ?? []).map((mapping) => ({ ...mapping, resolution_name: resolutionNames.get(mapping.resolution_id) ?? "Unknown resolution" }));
  const rolesByUser = new Map<string, string[]>();
  for (const role of userRoles ?? []) rolesByUser.set(role.user_id, [...(rolesByUser.get(role.user_id) ?? []), role.role]);
  const roundRobinMembers = (profiles ?? []).filter((profile) => rolesByUser.has(profile.id)).map((profile) => ({ id: profile.id, name: [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.full_name || "Unnamed user", roles: rolesByUser.get(profile.id) ?? [] }));

  return (
    <section className="mx-auto max-w-7xl">

      {tab === "columns" ? (
        columnsError ? <p className="rounded-xl bg-red-50 p-5 text-sm font-bold text-red-700">Columns management is not available. Run the lead-table-columns database migration first.</p> : <ColumnsManagement columns={columns ?? []} />
      ) : tab === "stages" ? (
        dropdownsError ? <p className="rounded-xl bg-red-50 p-5 text-sm font-bold text-red-700">Dropdown management is not set up yet. Run 20261026_create_stage_dropdowns.sql in the Supabase SQL Editor.</p> : <DropdownManagement products={products ?? []} stages={stages ?? []} dropdowns={dropdowns} />
      ) : tab === "products" ? <>
        <LeadConfiguration products={products ?? []} stages={stages ?? []} resolutions={productResolutions} />
      </> : !tab ? <>
        {prioritiesError ? <p className="mb-4 rounded-xl bg-red-50 p-4 text-sm font-bold text-red-700">Round-robin priorities are unavailable. Run the lead database priorities migration first.</p> : <LeadDatabasePriority priorities={priorities ?? []} />}
        {weeklyTargetsError ? <p className="rounded-xl bg-red-50 p-4 text-sm font-bold text-red-700">Round-robin weekly targets are unavailable. Run the round-robin weekly targets database migration first.</p> : <RoundRobinWeeklyTargets members={roundRobinMembers} products={products ?? []} targets={weeklyTargets ?? []} />}
      </> : null}
    </section>
  );
}
