import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { requireUser } from "@/app/lib/auth";
import { isAmbassadorWorkspace } from "@/app/lib/roles";
import { createAdminClient } from "@/app/lib/supabase/admin";

export const instant = false;

type Product = { code: string; name: string };
type Named = { name: string };
type Assignment = {
  id: string;
  assigned_to: string | null;
  assigned_at: string | null;
  is_active: boolean;
  is_closed: boolean;
  product: Product | Product[] | null;
  stage: Named | Named[] | null;
  resolution: Named | Named[] | null;
};
type Lead = {
  id: string;
  lead_number: number | null;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  created_at: string;
  ambassador_imported_by: string | null;
  assignments: Assignment[] | null;
};
type Profile = { id: string; first_name: string | null; last_name: string | null; full_name: string | null };

const one = <T,>(value: T | T[] | null) => Array.isArray(value) ? value[0] ?? null : value;
const profileName = (profile?: Profile) => profile ? [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.full_name || "Unnamed Ambassador" : "Unknown Ambassador";
const formatDate = (value: string) => new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date(value));
const isMissingHierarchyTable = (code: string | undefined) => ["42P01", "PGRST205"].includes(code ?? "");

export default async function AmbassadorLeadsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  await connection();
  const { userId, roles } = await requireUser();
  if (!isAmbassadorWorkspace(roles)) redirect("/dashboard");

  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);
  const pageSize = 50;
  const offset = (page - 1) * pageSize;
  const supabase = createAdminClient();

  const { data: hierarchyRows, error: hierarchyError } = await supabase
    .from("ambassador_hierarchy")
    .select("junior_ambassador_id")
    .eq("senior_ambassador_id", userId);
  if (hierarchyError && !isMissingHierarchyTable(hierarchyError.code)) throw new Error("Unable to load Junior Ambassador relationships.");

  const juniorIds = [...new Set((hierarchyRows ?? []).map((row) => row.junior_ambassador_id))];
  const submitterIds = [userId, ...juniorIds];
  const { data: leadRows, error: leadsError } = await supabase
    .from("leads")
    .select("id, lead_number, first_name, last_name, email, phone, created_at, ambassador_imported_by, assignments:lead_product_assignments(id, assigned_to, assigned_at, is_active, is_closed, product:lead_products(code, name), stage:lead_stages(name), resolution:lead_resolutions(name))")
    .in("ambassador_imported_by", submitterIds)
    .order("created_at", { ascending: false })
    .range(offset, offset + pageSize);
  if (leadsError) throw new Error("Unable to load Ambassador leads.");

  const leads = (leadRows ?? []) as unknown as Lead[];
  const hasNextPage = leads.length > pageSize;
  const pageLeads = leads.slice(0, pageSize);
  const assigneeIds = pageLeads.flatMap((lead) => (lead.assignments ?? []).map((assignment) => assignment.assigned_to).filter((id): id is string => Boolean(id)));
  const personIds = [...new Set([...submitterIds, ...assigneeIds])];
  const { data: profileRows, error: profilesError } = personIds.length
    ? await supabase.from("profiles").select("id, first_name, last_name, full_name").in("id", personIds)
    : { data: [], error: null };
  if (profilesError) throw new Error("Unable to load Ambassador lead owners.");
  const profiles = new Map(((profileRows ?? []) as Profile[]).map((profile) => [profile.id, profile]));

  return <section className="mx-auto max-w-[1500px]">
    <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
      <div>
        <p className="text-[10px] font-extrabold tracking-[0.12em] text-red-600">AMBASSADORS</p>
        <h1 className="mt-0.5 text-[22px] font-extrabold tracking-[-0.04em] text-slate-900">Ambassador Leads</h1>
        <p className="mt-1 text-xs text-slate-500">Your submitted leads{juniorIds.length ? " and leads submitted by your Junior Ambassadors" : ""}. Leads remain assigned to their CRM sales person.</p>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 shadow-sm"><span className="text-slate-400">Junior Ambassadors: </span>{juniorIds.length}</div>
    </header>

    {hierarchyError && <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">Junior Ambassador leads will appear here after the Senior Ambassador hierarchy migration is run.</p>}

    <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-[1120px] w-full text-left text-sm">
        <thead className="bg-slate-50 text-[10px] font-extrabold uppercase tracking-wide text-slate-500"><tr><th className="border-b border-slate-200 px-4 py-3">Lead</th><th className="border-b border-slate-200 px-4 py-3">Cell Number</th><th className="border-b border-slate-200 px-4 py-3">Submitted By</th><th className="border-b border-slate-200 px-4 py-3">Sales Person</th><th className="border-b border-slate-200 px-4 py-3">Product</th><th className="border-b border-slate-200 px-4 py-3">Stage</th><th className="border-b border-slate-200 px-4 py-3">Activity Resolution</th><th className="border-b border-slate-200 px-4 py-3">Submitted On</th></tr></thead>
        <tbody>{pageLeads.map((lead) => {
          const assignment = (lead.assignments ?? []).find((item) => item.is_active && !item.is_closed) ?? (lead.assignments ?? [])[0];
          const product = assignment ? one(assignment.product) : null;
          const stage = assignment ? one(assignment.stage) : null;
          const resolution = assignment ? one(assignment.resolution) : null;
          const submittedBy = lead.ambassador_imported_by ?? userId;
          return <tr key={lead.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
            <td className="px-4 py-3"><p className="font-extrabold text-slate-800">{[lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Unnamed Lead"}</p>{lead.lead_number && <p className="mt-0.5 text-[10px] font-semibold text-slate-400">L-{lead.lead_number}</p>}</td>
            <td className="px-4 py-3 font-semibold text-slate-600">{lead.phone || "—"}</td>
            <td className="px-4 py-3"><p className="font-bold text-slate-700">{submittedBy === userId ? "You" : profileName(profiles.get(submittedBy))}</p>{submittedBy !== userId && <p className="mt-0.5 text-[10px] font-semibold text-red-600">Junior Ambassador</p>}</td>
            <td className="px-4 py-3 font-semibold text-slate-600">{assignment?.assigned_to ? profileName(profiles.get(assignment.assigned_to)) : "Unassigned"}</td>
            <td className="px-4 py-3 font-semibold text-slate-600">{product?.code ?? product?.name ?? "—"}</td>
            <td className="px-4 py-3 font-semibold text-slate-600">{stage?.name ?? "—"}</td>
            <td className="px-4 py-3 font-semibold text-slate-600">{resolution?.name ?? "—"}</td>
            <td className="px-4 py-3 font-semibold text-slate-600">{formatDate(lead.created_at)}</td>
          </tr>;
        })}{!pageLeads.length && <tr><td colSpan={8} className="px-4 py-14 text-center"><p className="font-bold text-slate-700">No Ambassador leads yet</p><p className="mt-1 text-xs text-slate-500">Leads entered by you and your Junior Ambassadors will appear here.</p></td></tr>}</tbody>
      </table>
    </div>

    <nav className="mt-4 flex items-center justify-between text-sm font-bold" aria-label="Ambassador lead pagination">
      <Link href={page > 1 ? `/dashboard/ambassador-leads?page=${page - 1}` : "#"} aria-disabled={page === 1} className={`rounded-lg border px-3 py-2 ${page === 1 ? "pointer-events-none border-slate-100 text-slate-300" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>Previous</Link>
      <span className="text-xs text-slate-500">Page {page}</span>
      <Link href={hasNextPage ? `/dashboard/ambassador-leads?page=${page + 1}` : "#"} aria-disabled={!hasNextPage} className={`rounded-lg border px-3 py-2 ${!hasNextPage ? "pointer-events-none border-slate-100 text-slate-300" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>Next</Link>
    </nav>
  </section>;
}
