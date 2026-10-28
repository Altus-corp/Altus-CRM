import { requireUser } from "@/app/lib/auth";
import { connection } from "next/server";
import Link from "next/link";
import { LeadsTable } from "@/components/leads/leads-table";
import { AdminLeadsMaster } from "@/components/leads/admin-leads-master";
import { SalesLeadsWorkspace } from "@/components/leads/sales-leads-workspace";
import { createClient } from "@/app/lib/supabase/server";
import { getLeadSharedConfig } from "@/app/lib/lead-shared-config";

export const instant = false;

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ page?: string; view?: string }> }) {
  await connection();
  const params = await searchParams;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const pageSize = 50;
  const offset = (page - 1) * pageSize;
  const user = await requireUser();
  const supabase = await createClient();
  const isAdmin = user.roles.includes("admin");
  const sharedConfigPromise = getLeadSharedConfig();
  const leadsPromise = supabase.from("leads").select("id, lead_number, first_name, last_name, email, phone, created_at, custom_data, assignments:lead_product_assignments(id, assigned_to, assigned_at, focused_on, next_follow_up_at, product:lead_products(id, code, name), stage:lead_stages(name), resolution:lead_resolutions(name))").order("created_at", { ascending: false }).range(offset, offset + pageSize);
  const preferencesPromise = supabase.from("lead_table_preferences").select("column_order, column_widths, frozen_column_keys").eq("user_id", user.userId).maybeSingle();
  const adminDataPromise = isAdmin ? Promise.all([
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("lead_database", "database_leads"),
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("lead_database", "reference_leads"),
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("lead_database", "qualified_leads"),
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("lead_database", "leads"),
    supabase.from("profiles").select("id, first_name, last_name, full_name").eq("is_suspended", false).order("first_name"),
    supabase.from("user_roles").select("user_id, role").in("role", ["sales_executive", "sales_manager", "consultant"]),
  ]) : Promise.resolve(null);
  const [sharedConfig, leadsResult, preferencesResult, adminData] = await Promise.all([sharedConfigPromise, leadsPromise, preferencesPromise, adminDataPromise]);
  const { columns, columnsError, products, stages, resolutions, resolutionMappings } = sharedConfig;
  const { data: leads, error: leadsError } = leadsResult;
  const { data: tablePreferences } = preferencesResult;
  const [databaseResult, referenceResult, qualifiedResult, leadsCountResult, profilesResult, rolesResult] = adminData ?? [];
  const databaseLeadsCount = databaseResult?.count ?? 0;
  const referenceLeadsCount = referenceResult?.count ?? 0;
  const qualifiedLeadsCount = qualifiedResult?.count ?? 0;
  const leadsCount = leadsCountResult?.count ?? 0;
  const assignmentProfiles = profilesResult?.data ?? [];
  const assignmentRoles = rolesResult?.data ?? [];

  if (columnsError) return <section className="rounded-xl bg-red-50 p-5 text-sm font-bold text-red-700">Leads table configuration is unavailable. Ask an admin to run the lead-table-columns database migration.</section>;
  if (leadsError) return <section className="mx-auto max-w-3xl rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800"><p className="font-extrabold">Lead product assignments are not available yet.</p><p className="mt-1">Run <code className="rounded bg-white px-1.5 py-0.5 font-semibold">20261024_create_lead_product_assignments.sql</code> in Supabase SQL Editor, then reload this page.</p><p className="mt-3 text-xs font-semibold text-red-600">Database message: {leadsError.message}</p></section>;
  const hasNextPage = (leads ?? []).length > pageSize;
  const visibleColumns = (columns ?? []).filter((column) => column.is_visible);
  const normalizedLeads = (leads ?? []).slice(0, pageSize).flatMap((lead) => {
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

  const assignedNames = Object.fromEntries(assignmentProfiles.map((profile) => [profile.id, [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.full_name || "Unassigned user"]));
  const eligibleAssigneeIds = new Set(assignmentRoles.map((role) => role.user_id));
  const assignmentUsers = assignmentProfiles.filter((profile) => eligibleAssigneeIds.has(profile.id)).map((profile) => ({ id: profile.id, name: [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.full_name || "Unnamed user" }));
  const resolutionNames = new Map((resolutions ?? []).map((resolution) => [resolution.id, resolution.name]));
  const productResolutions = (resolutionMappings ?? []).map((mapping) => ({ product_id: mapping.product_id, resolution_id: mapping.resolution_id, resolution_name: resolutionNames.get(mapping.resolution_id) ?? "Unknown resolution" }));

  const preferences = { order: Array.isArray(tablePreferences?.column_order) ? tablePreferences.column_order.filter((value): value is string => typeof value === "string") : [], widths: tablePreferences?.column_widths && typeof tablePreferences.column_widths === "object" ? tablePreferences.column_widths as Record<string, number> : {}, frozen: tablePreferences?.frozen_column_keys ?? [] };
  const pager = <LeadsPager page={page} hasNext={hasNextPage} view={params.view} />;
  if (user.roles.includes("admin")) return <><AdminLeadsMaster columns={visibleColumns} sampleColumns={columns ?? []} leads={normalizedLeads} assignedNames={assignedNames} assignmentUsers={assignmentUsers} preferences={preferences} databaseCounts={{ databaseLeads: databaseLeadsCount ?? 0, referenceLeads: referenceLeadsCount ?? 0, qualifiedLeads: qualifiedLeadsCount ?? 0, leads: leadsCount ?? 0 }} products={products ?? []} stages={stages ?? []} />{pager}</>;
  const todayParts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric" }).formatToParts(new Date());
  const todayKey = [todayParts.find((part) => part.type === "year")?.value, todayParts.find((part) => part.type === "month")?.value, todayParts.find((part) => part.type === "day")?.value].join("-");
  const focusedLeadIds = normalizedLeads.filter((lead) => lead.focused_on === todayKey).map((lead) => lead.assignment_id);
  if (user.roles.some((role) => role === "sales_executive" || role === "sales_manager")) return <><SalesLeadsWorkspace columns={visibleColumns} leads={normalizedLeads} focusedLeadIds={focusedLeadIds} assignedNames={assignedNames} preferences={preferences} products={products ?? []} stages={stages ?? []} productResolutions={productResolutions} />{pager}</>;
  return <><section className="mx-auto max-w-7xl" aria-label="Leads"><LeadsTable columns={visibleColumns} leads={normalizedLeads} assignedNames={assignedNames} preferences={preferences} /></section>{pager}</>;
}

function LeadsPager({ page, hasNext, view }: { page: number; hasNext: boolean; view?: string }) {
  const href = (nextPage: number) => `/dashboard/leads?page=${nextPage}${view ? `&view=${encodeURIComponent(view)}` : ""}`;
  return <nav className="mx-auto mt-3 flex max-w-[1500px] items-center justify-end gap-2" aria-label="Lead table pagination"><span className="mr-auto text-[10px] font-semibold text-slate-500">Page {page} · 50 records per page</span>{page > 1 && <Link href={href(page - 1)} className="rounded border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-50">Previous</Link>}{hasNext && <Link href={href(page + 1)} className="rounded bg-[#d90000] px-3 py-1.5 text-[11px] font-extrabold text-white hover:bg-red-700">Next</Link>}</nav>;
}
