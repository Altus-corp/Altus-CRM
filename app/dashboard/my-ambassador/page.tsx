import Link from "next/link";
import { requireUser } from "@/app/lib/auth";
import { createClient } from "@/app/lib/supabase/server";
import { getLeadSharedConfig } from "@/app/lib/lead-shared-config";
import { DndMasterTable, type DndRow } from "@/components/leads/dnd-master-table";
import type { LeadRow } from "@/components/leads/leads-table";

export const instant = false;

type Assignment = {
  id: string; assigned_to: string | null; assigned_at: string | null;
  focused_on: string | null; next_follow_up_at: string | null;
  product: { id: string; code: string; name: string } | null;
  stage: { name: string } | null; resolution: { name: string } | null;
  lead: { id: string; lead_number: number | null; first_name: string; last_name: string | null; email: string | null; phone: string | null; created_at: string; custom_data: Record<string, unknown> | null } | null;
};
const one = <T,>(value: T | T[] | null): T | null => Array.isArray(value) ? value[0] ?? null : value;

export default async function MyAmbassadorPage({ searchParams }: { searchParams: Promise<{ page?: string; owner?: string }> }) {
  const { userId, roles } = await requireUser();
  const isAdmin = roles.includes("admin");
  const params = await searchParams;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const ownerFilter = params.owner ?? "";
  const pageSize = 50;
  const supabase = await createClient();
  let query = supabase.from("lead_product_assignments")
    .select("id, assigned_to, assigned_at, focused_on, next_follow_up_at, product:lead_products(id, code, name), stage:lead_stages(name), resolution:lead_resolutions(name), lead:leads(id, lead_number, first_name, last_name, email, phone, created_at, custom_data)")
    .eq("is_ambassador", true).eq("is_active", true)
    .order("assigned_at", { ascending: false }).order("id").range((page - 1) * pageSize, page * pageSize);
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
    isAdmin ? supabase.from("user_roles").select("user_id").in("role", ["sales_executive", "sales_manager", "consultant"]) : Promise.resolve({ data: [], error: null }),
  ]);
  if (profilesResult.error || eligibleResult.error) throw new Error("Unable to load Ambassador owners.");
  const profiles = profilesResult.data ?? [];
  const nameOf = (person: typeof profiles[number]) => [person.first_name, person.last_name].filter(Boolean).join(" ") || person.full_name || "Unnamed user";
  const assignedNames = Object.fromEntries(profiles.map((person) => [person.id, nameOf(person)]));
  const eligibleIds = new Set((eligibleResult.data ?? []).map((item) => item.user_id));
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
    if (targetPage > 1) query.set("page", String(targetPage));
    const value = query.toString();
    return `/dashboard/my-ambassador${value ? `?${value}` : ""}`;
  };
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

  return <section className="mx-auto max-w-[1500px]">
    <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">{isAdmin ? "Ambassador" : "My Ambassador"}</h1>
    <p className="mt-1 text-sm text-slate-500">{isAdmin ? "Completed Ambassador agreements and their CRM owners. Only admins can reassign them." : "Your Ambassadors remain assigned to you. Contact an admin to request reassignment."}</p>
    {isAdmin && <nav aria-label="Filter Ambassadors by CRM user" className="mt-3 flex flex-wrap gap-2">
      <Link href={filterHref("")} className={`rounded border px-3 py-1.5 text-xs font-extrabold ${!ownerFilter ? "border-red-600 bg-red-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>All Ambassadors</Link>
      {ownerOptions.map((owner) => <Link key={owner.id} href={filterHref(owner.id)} className={`rounded border px-3 py-1.5 text-xs font-extrabold ${ownerFilter === owner.id ? "border-red-600 bg-red-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>{owner.name}</Link>)}
      <Link href={filterHref("unassigned")} className={`rounded border px-3 py-1.5 text-xs font-extrabold ${ownerFilter === "unassigned" ? "border-red-600 bg-red-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>Unassigned</Link>
    </nav>}
    <DndMasterTable rows={rows} columns={ambassadorColumns} detailColumns={config.columns} assignedNames={assignedNames} reassignUsers={reassignUsers} reassignDescription="Only an admin can transfer an Ambassador to another CRM user." emptyLabel="No Ambassadors yet." />
    <nav aria-label="Ambassador pages" className="mt-4 flex items-center justify-end gap-3 text-sm">
      <span className="mr-auto text-slate-500">Page {page}</span>
      {page > 1 && <Link href={filterHref(ownerFilter, page - 1)} className="font-bold text-red-700">Previous</Link>}
      {(result.data?.length ?? 0) > pageSize && <Link href={filterHref(ownerFilter, page + 1)} className="font-bold text-red-700">Next</Link>}
    </nav>
  </section>;
}
