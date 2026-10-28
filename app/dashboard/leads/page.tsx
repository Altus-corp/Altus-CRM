import { requireUser } from "@/app/lib/auth";
import { connection } from "next/server";
import { LeadsTable } from "@/components/leads/leads-table";
import { AdminLeadsMaster } from "@/components/leads/admin-leads-master";
import { SalesLeadsWorkspace } from "@/components/leads/sales-leads-workspace";
import { createClient } from "@/app/lib/supabase/server";

export const instant = false;

export default async function LeadsPage() {
  await connection();
  const user = await requireUser();
  const supabase = await createClient();
  const [{ data: columns, error: columnsError }, { data: leads, error: leadsError }, { count: databaseLeadsCount }, { count: referenceLeadsCount }, { count: qualifiedLeadsCount }, { count: leadsCount }, { data: products }, { data: stages }, { data: resolutions }, { data: resolutionMappings }, { data: assignmentProfiles }, { data: assignmentRoles }, { data: tablePreferences }] = await Promise.all([
    supabase.from("lead_table_columns").select("id, field_key, label, field_type, options, is_visible, computed_from").order("position"),
    supabase.from("leads").select("id, lead_number, first_name, last_name, email, phone, created_at, custom_data, assignments:lead_product_assignments(id, assigned_to, assigned_at, focused_on, next_follow_up_at, product:lead_products(id, code, name), stage:lead_stages(name), resolution:lead_resolutions(name))").order("created_at", { ascending: false }).limit(100),
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("lead_database", "database_leads"),
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("lead_database", "reference_leads"),
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("lead_database", "qualified_leads"),
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("lead_database", "leads"),
    supabase.from("lead_products").select("id, code, name").eq("is_active", true).order("code"),
    supabase.from("lead_stages").select("id, product_id, name, position").eq("is_active", true).order("position"),
    supabase.from("lead_resolutions").select("id, name").order("name"),
    supabase.from("lead_product_resolutions").select("product_id, resolution_id"),
    supabase.from("profiles").select("id, first_name, last_name, full_name").eq("is_suspended", false).order("first_name"),
    supabase.from("user_roles").select("user_id, role").in("role", ["sales_executive", "sales_manager", "consultant"]),
    supabase.from("lead_table_preferences").select("column_order, column_widths, frozen_column_keys").eq("user_id", user.userId).maybeSingle(),
  ]);

  if (columnsError) return <section className="rounded-xl bg-red-50 p-5 text-sm font-bold text-red-700">Leads table configuration is unavailable. Ask an admin to run the lead-table-columns database migration.</section>;
  if (leadsError) return <section className="mx-auto max-w-3xl rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800"><p className="font-extrabold">Lead product assignments are not available yet.</p><p className="mt-1">Run <code className="rounded bg-white px-1.5 py-0.5 font-semibold">20261024_create_lead_product_assignments.sql</code> in Supabase SQL Editor, then reload this page.</p><p className="mt-3 text-xs font-semibold text-red-600">Database message: {leadsError.message}</p></section>;
  const visibleColumns = (columns ?? []).filter((column) => column.is_visible);
  const normalizedLeads = (leads ?? []).flatMap((lead) => {
    const assignments = Array.isArray(lead.assignments) ? lead.assignments : [];
    const assignment = assignments[0];
    if (!assignment) return [];
    return [{
      id: lead.id,
      lead_number: lead.lead_number,
      assignment_id: assignment.id,
      first_name: lead.first_name,
      last_name: lead.last_name,
      email: lead.email,
      phone: lead.phone,
      created_at: lead.created_at,
      custom_data: lead.custom_data,
      assigned_to: assignment.assigned_to,
      assigned_at: assignment.assigned_at,
      focused_on: assignment.focused_on,
      next_follow_up_at: assignment.next_follow_up_at,
      product: Array.isArray(assignment.product) ? assignment.product : assignment.product ? [assignment.product] : [],
      stage: Array.isArray(assignment.stage) ? assignment.stage : assignment.stage ? [assignment.stage] : [],
      resolution: Array.isArray(assignment.resolution) ? assignment.resolution : assignment.resolution ? [assignment.resolution] : [],
      product_assignments: assignments.map((item) => ({
        id: item.id,
        assigned_to: item.assigned_to,
        assigned_at: item.assigned_at,
        focused_on: item.focused_on,
        next_follow_up_at: item.next_follow_up_at,
        product: Array.isArray(item.product) ? item.product[0] : item.product,
        stage: Array.isArray(item.stage) ? item.stage[0] : item.stage,
        resolution: Array.isArray(item.resolution) ? item.resolution[0] : item.resolution,
      })),
    }];
  });

  const assignedIds = [...new Set(normalizedLeads.map((lead) => lead.assigned_to).filter((id): id is string => Boolean(id)))];
  const { data: assignees } = assignedIds.length ? await supabase.from("profiles").select("id, first_name, last_name").in("id", assignedIds) : { data: [] };
  const assignedNames = Object.fromEntries((assignees ?? []).map((profile) => [profile.id, [profile.first_name, profile.last_name].filter(Boolean).join(" ") || "Unassigned user"]));
  const eligibleAssigneeIds = new Set((assignmentRoles ?? []).map((role) => role.user_id));
  const assignmentUsers = (assignmentProfiles ?? []).filter((profile) => eligibleAssigneeIds.has(profile.id)).map((profile) => ({ id: profile.id, name: [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.full_name || "Unnamed user" }));
  const resolutionNames = new Map((resolutions ?? []).map((resolution) => [resolution.id, resolution.name]));
  const productResolutions = (resolutionMappings ?? []).map((mapping) => ({ product_id: mapping.product_id, resolution_id: mapping.resolution_id, resolution_name: resolutionNames.get(mapping.resolution_id) ?? "Unknown resolution" }));

  const preferences = { order: Array.isArray(tablePreferences?.column_order) ? tablePreferences.column_order.filter((value): value is string => typeof value === "string") : [], widths: tablePreferences?.column_widths && typeof tablePreferences.column_widths === "object" ? tablePreferences.column_widths as Record<string, number> : {}, frozen: tablePreferences?.frozen_column_keys ?? [] };
  if (user.roles.includes("admin")) return <AdminLeadsMaster columns={visibleColumns} sampleColumns={columns ?? []} leads={normalizedLeads} assignedNames={assignedNames} assignmentUsers={assignmentUsers} preferences={preferences} databaseCounts={{ databaseLeads: databaseLeadsCount ?? 0, referenceLeads: referenceLeadsCount ?? 0, qualifiedLeads: qualifiedLeadsCount ?? 0, leads: leadsCount ?? 0 }} products={products ?? []} stages={stages ?? []} />;
  const todayParts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric" }).formatToParts(new Date());
  const todayKey = [todayParts.find((part) => part.type === "year")?.value, todayParts.find((part) => part.type === "month")?.value, todayParts.find((part) => part.type === "day")?.value].join("-");
  const focusedLeadIds = normalizedLeads.filter((lead) => lead.focused_on === todayKey).map((lead) => lead.assignment_id);
  if (user.roles.some((role) => role === "sales_executive" || role === "sales_manager")) return <SalesLeadsWorkspace columns={visibleColumns} leads={normalizedLeads} focusedLeadIds={focusedLeadIds} assignedNames={assignedNames} preferences={preferences} products={products ?? []} stages={stages ?? []} productResolutions={productResolutions} />;
  return <section className="mx-auto max-w-7xl" aria-label="Leads"><LeadsTable columns={visibleColumns} leads={normalizedLeads} assignedNames={assignedNames} preferences={preferences} /></section>;
}
