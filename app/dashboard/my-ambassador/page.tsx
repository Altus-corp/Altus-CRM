import Link from "next/link";
import { requireUser } from "@/app/lib/auth";
import { createClient } from "@/app/lib/supabase/server";
import { getLeadSharedConfig } from "@/app/lib/lead-shared-config";
import { DndMasterTable, type DndRow } from "@/components/leads/dnd-master-table";
import type { LeadRow } from "@/components/leads/leads-table";
import { AdminAmbassadorManager, type AmbassadorRecord } from "@/components/ambassadors/admin-ambassador-manager";
import { SalesAmbassadorTable, type SalesAmbassadorRow } from "@/components/ambassadors/sales-ambassador-table";
import { AmbassadorExternalSync } from "@/components/ambassadors/ambassador-external-sync";

export const instant = false;

type Assignment = {
  id: string; assigned_to: string | null; assigned_at: string | null;
  focused_on: string | null; next_follow_up_at: string | null;
  ambassador_commission: number | null; ambassador_commission_notes: string | null;
  ambassador_priority: number | null; ambassador_agreement_status: string | null;
  ambassador_signed_agreement_link: string | null; ambassador_last_called_on: string | null;
  ambassador_last_call_notes: string | null; ambassador_remark: string | null;
  ambassador_manan_sir_notes: string | null;
  ambassador_target_leads: number | null; ambassador_target_demo: number | null;
  ambassador_target_proposals: number | null; ambassador_target_sales: number | null;
  ambassador_actual_leads: number | null; ambassador_actual_demo: number | null;
  ambassador_actual_proposals: number | null; ambassador_actual_sales: number | null;
  product: { id: string; code: string; name: string } | null;
  stage: { name: string } | null; resolution: { name: string } | null;
  lead: { id: string; lead_number: number | null; first_name: string; last_name: string | null; email: string | null; phone: string | null; created_at: string; custom_data: Record<string, unknown> | null } | null;
};
const one = <T,>(value: T | T[] | null): T | null => Array.isArray(value) ? value[0] ?? null : value;

export default async function MyAmbassadorPage({ searchParams }: { searchParams: Promise<{ page?: string; owner?: string; stage?: string }> }) {
  const { userId, roles } = await requireUser();
  const isAdmin = roles.includes("admin");
  const params = await searchParams;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const ownerFilter = params.owner ?? "";
  const stageFilter = params.stage === "pre-sales" || params.stage === "onboarding-ambassador" ? params.stage : "";
  const pageSize = 50;
  const supabase = await createClient();
  const stageName = stageFilter === "pre-sales" ? "Pre Sales" : stageFilter === "onboarding-ambassador" ? "Onboarding Ambassador" : "";
  const { data: ambassadorProduct } = stageName ? await supabase
    .from("lead_products")
    .select("id")
    .eq("code", "AMBASSADOR")
    .maybeSingle() : { data: null };
  const { data: selectedStage } = stageName && ambassadorProduct ? await supabase
    .from("lead_stages")
    .select("id")
    .eq("product_id", ambassadorProduct.id)
    .eq("name", stageName)
    .maybeSingle() : { data: null };
  const { data: agreementSentResolution } = stageFilter === "pre-sales" ? await supabase
    .from("lead_resolutions")
    .select("id")
    .eq("name", "Agreement Sent")
    .eq("is_active", true)
    .maybeSingle() : { data: null };
  let query = supabase.from("lead_product_assignments")
    .select("id, assigned_to, assigned_at, focused_on, next_follow_up_at, ambassador_commission, ambassador_commission_notes, ambassador_priority, ambassador_agreement_status, ambassador_signed_agreement_link, ambassador_last_called_on, ambassador_last_call_notes, ambassador_remark, ambassador_manan_sir_notes, ambassador_target_leads, ambassador_target_demo, ambassador_target_proposals, ambassador_target_sales, ambassador_actual_leads, ambassador_actual_demo, ambassador_actual_proposals, ambassador_actual_sales, product:lead_products(id, code, name), stage:lead_stages(name), resolution:lead_resolutions(name), lead:leads(id, lead_number, first_name, last_name, email, phone, created_at, custom_data)")
    .eq("is_active", true)
    .order("assigned_at", { ascending: false }).order("id").range((page - 1) * pageSize, page * pageSize);
  if (stageFilter === "pre-sales") {
    // A Pre Sales record is a pending Ambassador-product opportunity, not yet
    // an onboarded Ambassador. Keep the list exact even if a stale stage ID
    // exists on another kind of work.
    if (selectedStage?.id && ambassadorProduct?.id && agreementSentResolution?.id) {
      query = query.eq("stage_id", selectedStage.id).eq("product_id", ambassadorProduct.id).eq("latest_resolution_id", agreementSentResolution.id);
    } else {
      query = query.is("id", null);
    }
  } else {
    query = query.eq("is_ambassador", true);
    if (selectedStage?.id) query = query.eq("stage_id", selectedStage.id);
  }
  if (!isAdmin) query = query.eq("assigned_to", userId);
  else if (ownerFilter === "unassigned") query = query.is("assigned_to", null);
  else if (/^[0-9a-f-]{36}$/i.test(ownerFilter)) query = query.eq("assigned_to", ownerFilter);
  const [result, config] = await Promise.all([query, getLeadSharedConfig()]);
  if (result.error) return <section className="mx-auto max-w-5xl"><h1 className="text-2xl font-extrabold">My Ambassador</h1><p role="alert" className="mt-4 rounded-xl bg-amber-50 p-5 text-sm text-amber-800">Ambassadors could not be loaded. Ask an admin to check that the Ambassador migration has been applied.</p></section>;

  const assignments: Assignment[] = (result.data ?? []).slice(0, pageSize).map((item) => ({ ...item, product: one(item.product), stage: one(item.stage), resolution: one(item.resolution), lead: one(item.lead) }));
  const leadIds = [...new Set(assignments.flatMap((assignment) => assignment.lead ? [assignment.lead.id] : []))];
  // Load all product work visible to this user for the detail panel, while the
  // table and admin reassignment selection remain scoped to Ambassador work.
  const { data: detailWork, error: detailError } = leadIds.length ? await supabase
    .from("lead_product_assignments")
    .select("id, lead_id, assigned_to, assigned_at, focused_on, next_follow_up_at, product:lead_products(id, code, name), stage:lead_stages(name), resolution:lead_resolutions(name)")
    .in("lead_id", leadIds).order("created_at") : { data: [], error: null };
  if (detailError) throw new Error("Unable to load complete Ambassador product details.");
  const ownerIds = [...new Set(assignments.map((item) => item.assigned_to).filter((id): id is string => Boolean(id)))];
  const [profilesResult, eligibleResult] = await Promise.all([
    isAdmin ? supabase.from("profiles").select("id, first_name, last_name, full_name, is_suspended") : ownerIds.length ? supabase.from("profiles").select("id, first_name, last_name, full_name, is_suspended").in("id", ownerIds) : Promise.resolve({ data: [], error: null }),
    isAdmin ? supabase.from("user_roles").select("user_id, role") : Promise.resolve({ data: [], error: null }),
  ]);
  if (profilesResult.error || eligibleResult.error) throw new Error("Unable to load Ambassador owners.");
  const profiles = profilesResult.data ?? [];
  const nameOf = (person: typeof profiles[number]) => [person.first_name, person.last_name].filter(Boolean).join(" ") || person.full_name || "Unnamed user";
  const assignedNames = Object.fromEntries(profiles.map((person) => [person.id, nameOf(person)]));
  const eligibleIds = new Set((eligibleResult.data ?? []).filter((item) => item.role !== "ambassador").map((item) => item.user_id));
  const reassignUsers = isAdmin ? profiles.filter((person) => !person.is_suspended && eligibleIds.has(person.id)).map((person) => ({ id: person.id, name: nameOf(person) })) : [];
  const ownerOptions = profiles
    .filter((person) => eligibleIds.has(person.id))
    .map((person) => ({ id: person.id, name: nameOf(person) }))
    .sort((left, right) => left.name.localeCompare(right.name));
  const visibleColumns = config.columns.filter((column) => column.is_visible);
  // An Ambassador page must always show who owns the relationship, even if an
  // admin hid Sales Person in the generic Leads configuration.
  const ambassadorColumns = visibleColumns.some((column) => column.field_key === "assigned_to")
    ? visibleColumns
    : [...visibleColumns, ...config.columns.filter((column) => column.field_key === "assigned_to").map((column) => ({ ...column, is_visible: true }))];
  const filterHref = (owner: string, targetPage = 1) => {
    const query = new URLSearchParams();
    if (owner) query.set("owner", owner);
    if (stageFilter) query.set("stage", stageFilter);
    if (targetPage > 1) query.set("page", String(targetPage));
    const value = query.toString();
    return `/dashboard/my-ambassador${value ? `?${value}` : ""}`;
  };
  const adminRecords: AmbassadorRecord[] = assignments.flatMap((assignment) => assignment.lead ? [{
    assignmentId: assignment.id,
    leadId: assignment.lead.id,
    fullName: [assignment.lead.first_name, assignment.lead.last_name].filter(Boolean).join(" ") || "Unnamed Ambassador",
    leadNumber: assignment.lead.lead_number,
    firstName: assignment.lead.first_name,
    lastName: assignment.lead.last_name ?? "",
    email: assignment.lead.email,
    createdAt: assignment.lead.created_at,
    product: assignment.product,
    stage: assignment.stage,
    cellNumber: assignment.lead.phone ?? "",
    salesPersonId: assignment.assigned_to ?? "",
    commission: assignment.ambassador_commission?.toString() ?? "",
    commissionNotes: assignment.ambassador_commission_notes ?? "",
    priority: assignment.ambassador_priority?.toString() ?? "",
    agreementStatus: assignment.ambassador_agreement_status ?? "",
    signedAgreementLink: assignment.ambassador_signed_agreement_link ?? "",
    lastCalledOn: assignment.ambassador_last_called_on ?? "",
    lastCallNotes: assignment.ambassador_last_call_notes ?? "",
    remark: assignment.ambassador_remark ?? "",
    mananSirNotes: assignment.ambassador_manan_sir_notes ?? "",
    targetLeads: assignment.ambassador_target_leads?.toString() ?? "",
    targetDemo: assignment.ambassador_target_demo?.toString() ?? "",
    targetProposals: assignment.ambassador_target_proposals?.toString() ?? "",
    targetSales: assignment.ambassador_target_sales?.toString() ?? "",
  }] : []);
  const rows: DndRow[] = assignments.flatMap((assignment) => {
    if (!assignment.lead) return [];
    const lead: LeadRow = {
      ...assignment.lead, custom_data: assignment.lead.custom_data ?? {},
      assignment_id: assignment.id, assigned_to: assignment.assigned_to, assigned_at: assignment.assigned_at,
      focused_on: assignment.focused_on, next_follow_up_at: assignment.next_follow_up_at,
      product: assignment.product ? [assignment.product] : [], stage: assignment.stage ? [assignment.stage] : [],
      resolution: assignment.resolution ? [assignment.resolution] : [],
      detail_product_assignments: (detailWork ?? []).filter((item) => item.lead_id === assignment.lead?.id).map((item) => ({
        id: item.id, assigned_to: item.assigned_to, assigned_at: item.assigned_at, focused_on: item.focused_on,
        next_follow_up_at: item.next_follow_up_at, product: one(item.product), stage: one(item.stage), resolution: one(item.resolution),
      })),
      product_assignments: [{ id: assignment.id, assigned_to: assignment.assigned_to, assigned_at: assignment.assigned_at, focused_on: assignment.focused_on, next_follow_up_at: assignment.next_follow_up_at, product: assignment.product, stage: assignment.stage, resolution: assignment.resolution }],
    };
    return [{ id: assignment.id, lead, status: "Ambassador", markedBy: assignedNames[assignment.assigned_to ?? ""] ?? "Unassigned", markedOn: "" }];
  });
  const salesRows: SalesAmbassadorRow[] = assignments.flatMap((assignment) => {
    if (!assignment.lead) return [];
    const lead = rows.find((row) => row.id === assignment.id)?.lead;
    if (!lead) return [];
    return [{
      assignmentId: assignment.id, lead, agreementStatus: assignment.ambassador_agreement_status,
      targetLeads: assignment.ambassador_target_leads, targetDemo: assignment.ambassador_target_demo,
      targetProposals: assignment.ambassador_target_proposals, targetSales: assignment.ambassador_target_sales,
      actualLeads: assignment.ambassador_actual_leads, actualDemo: assignment.ambassador_actual_demo,
      actualProposals: assignment.ambassador_actual_proposals, actualSales: assignment.ambassador_actual_sales,
    }];
  });

  return <section className="mx-auto max-w-[1500px]">
    <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">{isAdmin ? "Ambassador" : "My Ambassador"}</h1>
    <p className="mt-1 text-sm text-slate-500">{stageFilter === "pre-sales" ? "Ambassador-product opportunities marked Agreement Sent." : stageFilter === "onboarding-ambassador" ? "Signed or waived Ambassadors currently in onboarding." : isAdmin ? "Completed Ambassador agreements and their CRM owners. Only admins can reassign them." : "Your Ambassadors remain assigned to you. Contact an admin to request reassignment."}</p>
    {isAdmin && <AmbassadorExternalSync />}
    {isAdmin && <nav aria-label="Filter Ambassadors by CRM user" className="mt-3 flex flex-wrap gap-2">
      <Link href={filterHref("")} className={`rounded border px-3 py-1.5 text-xs font-extrabold ${!ownerFilter ? "border-red-600 bg-red-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>All Ambassadors</Link>
      {ownerOptions.map((owner) => <Link key={owner.id} href={filterHref(owner.id)} className={`rounded border px-3 py-1.5 text-xs font-extrabold ${ownerFilter === owner.id ? "border-red-600 bg-red-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>{owner.name}</Link>)}
      <Link href={filterHref("unassigned")} className={`rounded border px-3 py-1.5 text-xs font-extrabold ${ownerFilter === "unassigned" ? "border-red-600 bg-red-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>Unassigned</Link>
    </nav>}
    {isAdmin ? <AdminAmbassadorManager rows={adminRecords} salesPeople={ownerOptions} detailColumns={config.columns} assignedNames={assignedNames} /> : <SalesAmbassadorTable rows={salesRows} columns={config.columns} assignedNames={assignedNames} />}
    <nav aria-label="Ambassador pages" className="mt-4 flex items-center justify-end gap-3 text-sm">
      <span className="mr-auto text-slate-500">Page {page}</span>
      {page > 1 && <Link href={filterHref(ownerFilter, page - 1)} className="font-bold text-red-700">Previous</Link>}
      {(result.data?.length ?? 0) > pageSize && <Link href={filterHref(ownerFilter, page + 1)} className="font-bold text-red-700">Next</Link>}
    </nav>
  </section>;
}
