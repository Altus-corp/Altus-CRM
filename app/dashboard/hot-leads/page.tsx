import { connection } from "next/server";
import { requireUser } from "@/app/lib/auth";
import { createClient } from "@/app/lib/supabase/server";
import { createAdminClient } from "@/app/lib/supabase/admin";
import { getLeadSharedConfig } from "@/app/lib/lead-shared-config";
import { getSalesManagerTeamMemberIds } from "@/app/lib/sales-manager-team";
import { LeadsTable, type LeadRow } from "@/components/leads/leads-table";

export const instant = false;

const normalizeLabel = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");

type Named = { name: string } | { name: string }[] | null;
type Coded = { id: string; code: string; name: string } | { id: string; code: string; name: string }[] | null;
type Assignment = {
  id: string; assigned_to: string | null; assigned_at: string | null;
  focused_on: string | null; next_follow_up_at: string | null; is_new_inbound: boolean | null;
  is_ambassador: boolean | null; is_active: boolean | null;
  product: Coded; stage: Named; resolution: Named;
};
type LeadWithAssignments = { id: string; lead_number: number | null; first_name: string; last_name: string | null; email: string | null; phone: string | null; created_at: string; custom_data: Record<string, unknown> | null; assignments: Assignment | Assignment[] | null };
const one = <T,>(value: T | T[] | null): T | null => (Array.isArray(value) ? value[0] ?? null : value);

export default async function HotLeadsPage() {
  await connection();
  const user = await requireUser();
  const isAdmin = user.roles.includes("admin");
  const isSalesManager = !isAdmin && user.roles.includes("sales_manager");
  const supabase = isAdmin || isSalesManager ? createAdminClient() : await createClient();

  const sharedConfig = await getLeadSharedConfig();
  const { columns, columnsError, products, stages, resolutions, resolutionMappings } = sharedConfig;
  if (columnsError) return <section className="mx-auto max-w-3xl rounded-xl bg-red-50 p-5 text-sm font-bold text-red-700">Leads table configuration is unavailable. Ask an admin to run the lead-table-columns database migration.</section>;
  const expectedClosingColumn = columns.find((column) => column.source === "custom" && normalizeLabel(column.label) === "expectedclosing");
  if (!expectedClosingColumn) {
    return <section className="mx-auto max-w-3xl rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">Create the &quot;Expected Closing&quot; dropdown column from Lead Configuration before Hot Leads can show anything.</section>;
  }
  const key = expectedClosingColumn.field_key;

  // null means no owner restriction (admin sees every user's Hot Leads).
  let ownerIds: string[] | null = null;
  if (isSalesManager) {
    const teamMemberIds = await getSalesManagerTeamMemberIds(user.userId);
    ownerIds = [...new Set([user.userId, ...teamMemberIds])];
  } else if (!isAdmin) {
    ownerIds = [user.userId];
  }

  const assignmentsJoin = ownerIds ? "!inner" : "";
  let query = supabase
    .from("leads")
    .select(`id, lead_number, first_name, last_name, email, phone, created_at, custom_data, assignments:lead_product_assignments${assignmentsJoin}(id, assigned_to, assigned_at, focused_on, next_follow_up_at, is_new_inbound, is_ambassador, is_active, product:lead_products(id, code, name), stage:lead_stages(name), resolution:lead_resolutions(name))`)
    .not(`custom_data->>${key}`, "is", null)
    .neq(`custom_data->>${key}`, "")
    .order("created_at", { ascending: false })
    .limit(500);
  if (ownerIds) query = query.eq("assignments.is_active", true).in("assignments.assigned_to", ownerIds);

  const { data: leads, error } = await query;
  if (error) return <section className="mx-auto max-w-3xl rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">Hot Leads could not be loaded. {error.message}</section>;

  const normalizedLeads: LeadRow[] = ((leads ?? []) as unknown as LeadWithAssignments[]).flatMap((lead) => {
    const assignments = (Array.isArray(lead.assignments) ? lead.assignments : lead.assignments ? [lead.assignments] : []).filter((item) => item.is_active !== false && !isAmbassadorAssignment(item));
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
      custom_data: lead.custom_data ?? {},
      assigned_to: assignment.assigned_to,
      assigned_at: assignment.assigned_at,
      focused_on: assignment.focused_on,
      next_follow_up_at: assignment.next_follow_up_at,
      is_new_inbound: assignment.is_new_inbound ?? undefined,
      product: Array.isArray(assignment.product) ? assignment.product : assignment.product ? [assignment.product] : [],
      stage: Array.isArray(assignment.stage) ? assignment.stage : assignment.stage ? [assignment.stage] : [],
      resolution: Array.isArray(assignment.resolution) ? assignment.resolution : assignment.resolution ? [assignment.resolution] : [],
      product_assignments: assignments.map((item) => ({
        id: item.id,
        assigned_to: item.assigned_to,
        assigned_at: item.assigned_at,
        focused_on: item.focused_on,
        next_follow_up_at: item.next_follow_up_at,
        is_new_inbound: item.is_new_inbound ?? undefined,
        product: one(item.product),
        stage: one(item.stage),
        resolution: one(item.resolution),
      })),
    }];
  });

  const assignedUserIds = [...new Set(normalizedLeads.map((lead) => lead.assigned_to).filter((id): id is string => Boolean(id)))];
  const { data: profiles } = assignedUserIds.length
    ? await supabase.from("profiles").select("id, first_name, last_name, full_name").in("id", assignedUserIds)
    : { data: [] as { id: string; first_name: string | null; last_name: string | null; full_name: string | null }[] };
  const assignedNames = Object.fromEntries((profiles ?? []).map((profile) => [profile.id, [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.full_name || "Unassigned user"]));

  const resolutionNames = new Map(resolutions.map((resolution) => [resolution.id, resolution.name]));
  const productResolutions = resolutionMappings.map((mapping) => ({ product_id: mapping.product_id, resolution_id: mapping.resolution_id, resolution_name: resolutionNames.get(mapping.resolution_id) ?? "Unknown resolution" }));

  return (
    <section className="mx-auto max-w-[1600px]">
      <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Hot Leads</h1>
      <p className="mt-1 text-sm text-slate-500">
        Leads with an Expected Closing window set.
        {isAdmin ? " Showing every user's leads." : isSalesManager ? " Showing your leads and your team's." : " Showing your leads."}
      </p>
      <div className="mt-3">
        <LeadsTable
          columns={columns.filter((column) => column.is_visible)}
          leads={normalizedLeads}
          assignedNames={assignedNames}
          editableConfiguration={{ products, stages, productResolutions }}
          showHeader={false}
        />
      </div>
    </section>
  );
}

function isAmbassadorAssignment(assignment: { is_ambassador?: boolean | null }) {
  return Boolean(assignment.is_ambassador);
}
