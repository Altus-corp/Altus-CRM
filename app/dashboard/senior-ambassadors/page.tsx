import { redirect } from "next/navigation";
import { requireUser } from "@/app/lib/auth";
import { isAmbassadorWorkspace } from "@/app/lib/roles";
import { createAdminClient } from "@/app/lib/supabase/admin";

export const instant = false;

type HierarchyRow = {
  junior_ambassador_id: string;
  senior_ambassador_id: string;
  source_lead_id: string | null;
  created_at: string;
  updated_at: string;
};

type Profile = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  phone: string | null;
  email: string | null;
};

type FallbackAssignment = {
  id: string;
  lead_id: string;
  updated_at: string;
  lead: { first_name: string | null; last_name: string | null; phone: string | null; email: string | null } | { first_name: string | null; last_name: string | null; phone: string | null; email: string | null }[] | null;
};

const displayName = (profile?: Profile) =>
  profile ? [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.full_name || "Unnamed Ambassador" : "Unavailable Ambassador";

const formatDate = (value: string) => new Intl.DateTimeFormat("en-IN", {
  day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata",
}).format(new Date(value));
const isMissingHierarchyTable = (code: string | undefined) => ["42P01", "PGRST205"].includes(code ?? "");
const one = <T,>(value: T | T[] | null) => Array.isArray(value) ? value[0] ?? null : value;

export default async function SeniorAmbassadorsPage() {
  const { userId, roles } = await requireUser();
  const isAdmin = roles.includes("admin");
  const isAmbassador = isAmbassadorWorkspace(roles);
  if (!isAdmin && !isAmbassador) redirect("/dashboard");

  const supabase = createAdminClient();
  let query = supabase
    .from("ambassador_hierarchy")
    .select("junior_ambassador_id, senior_ambassador_id, source_lead_id, created_at, updated_at")
    .order("updated_at", { ascending: false });
  if (!isAdmin) query = query.eq("senior_ambassador_id", userId);
  const { data, error } = await query;

  if (error && !isMissingHierarchyTable(error.code)) {
    return <section className="mx-auto max-w-6xl">
      <p className="text-[11px] font-extrabold tracking-[0.14em] text-red-600">AMBASSADORS</p>
      <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900">{isAdmin ? "Senior Ambassadors" : "My Ambassador"}</h1>
      <p role="alert" className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">The Senior Ambassador hierarchy is not available yet. Run the latest Senior Ambassador database migration, then refresh this page.</p>
    </section>;
  }

  const relationships = (data ?? []) as HierarchyRow[];
  type DisplayRow = { id: string; seniorId: string; juniorName: string; phone: string | null; email: string | null; linkedAt: string };
  let fallbackRows: DisplayRow[] = [];
  // Older records can predate ambassador_hierarchy. Rebuild their display
  // relationship from the original Channel Partner referral instead of
  // making the Admin view look empty.
  if (!relationships.length) {
    const { data: assignments, error: assignmentsError } = await supabase
      .from("lead_product_assignments")
      .select("id, lead_id, updated_at, lead:leads(first_name, last_name, phone, email)")
      .eq("is_ambassador", true)
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(500);
    if (assignmentsError) throw new Error("Unable to load Ambassador records.");
    const ambassadorRecords = (assignments ?? []) as FallbackAssignment[];
    const leadIds = [...new Set(ambassadorRecords.map((record) => record.lead_id))];
    const { data: partners, error: partnersError } = leadIds.length
      ? await supabase.from("lead_channel_partners").select("lead_id, ambassador_id, assigned_at").in("lead_id", leadIds).order("assigned_at", { ascending: false, nullsFirst: false })
      : { data: [], error: null };
    if (partnersError) throw new Error("Unable to load Ambassador referral relationships.");
    const { data: selections, error: selectionsError } = leadIds.length
      ? await supabase.from("lead_senior_ambassadors").select("lead_id, senior_ambassador_id").in("lead_id", leadIds)
      : { data: [], error: null };
    if (selectionsError && !isMissingHierarchyTable(selectionsError.code)) throw new Error("Unable to load Senior Ambassador selections.");
    const seniorByLead = new Map<string, string>();
    for (const partner of partners ?? []) if (!seniorByLead.has(partner.lead_id)) seniorByLead.set(partner.lead_id, partner.ambassador_id);
    const selectedSeniorByLead = new Map((selections ?? []).map((selection) => [selection.lead_id, selection.senior_ambassador_id]));
    fallbackRows = ambassadorRecords.flatMap((record) => {
      const seniorId = selectedSeniorByLead.get(record.lead_id) ?? seniorByLead.get(record.lead_id);
      const lead = one(record.lead);
      if (!seniorId || !lead) return [];
      return [{ id: record.id, seniorId, juniorName: [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Unnamed Ambassador", phone: lead.phone, email: lead.email, linkedAt: record.updated_at }];
    });
  }
  const personIds = [...new Set(relationships.flatMap((row) => [row.senior_ambassador_id, row.junior_ambassador_id]))];
  const { data: profileRows, error: profilesError } = personIds.length
    ? await supabase.from("profiles").select("id, first_name, last_name, full_name, phone").in("id", personIds)
    : { data: [], error: null };
  if (profilesError) throw new Error("Unable to load Ambassador profiles.");
  const fallbackSeniorIds = fallbackRows.map((row) => row.seniorId).filter((id) => !personIds.includes(id));
  const { data: fallbackProfiles, error: fallbackProfilesError } = fallbackSeniorIds.length
    ? await supabase.from("profiles").select("id, first_name, last_name, full_name, phone").in("id", fallbackSeniorIds)
    : { data: [], error: null };
  if (fallbackProfilesError) throw new Error("Unable to load Senior Ambassador profiles.");
  const profiles = new Map([...(profileRows as Profile[] ?? []), ...(fallbackProfiles as Profile[] ?? [])].map((profile) => [profile.id, profile]));
  const hierarchyRows: DisplayRow[] = relationships.map((relationship) => {
    const junior = profiles.get(relationship.junior_ambassador_id);
    return { id: relationship.junior_ambassador_id, seniorId: relationship.senior_ambassador_id, juniorName: displayName(junior), phone: junior?.phone ?? null, email: junior?.email ?? null, linkedAt: relationship.created_at };
  });
  const allRows = hierarchyRows.length ? hierarchyRows : fallbackRows;
  const visibleRows = isAdmin ? allRows : allRows.filter((row) => row.seniorId === userId);

  if (!relationships.length) {
    return <section className="mx-auto max-w-6xl">
      <p className="text-[11px] font-extrabold tracking-[0.14em] text-red-600">AMBASSADORS</p>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-extrabold tracking-tight text-slate-900">{isAdmin ? "Senior Ambassadors" : "My Ambassador"}</h1><p className="mt-1 text-sm text-slate-500">{isAdmin ? "Senior Ambassador and Junior Ambassador relationships across CRM." : "Ambassadors who joined through your referral leads."}</p></div><span className="rounded-full bg-red-50 px-3 py-1.5 text-xs font-extrabold text-red-700">{visibleRows.length} {visibleRows.length === 1 ? "Junior Ambassador" : "Junior Ambassadors"}</span></div>
      <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">Showing relationships from the original Channel Partner referral. Run the latest hierarchy migration to permanently store these links.</p>
      <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm"><table className="min-w-[820px] w-full text-left text-sm"><thead className="bg-slate-50 text-[10px] font-extrabold uppercase tracking-wide text-slate-500"><tr>{isAdmin && <th className="border-b border-slate-200 px-4 py-3">Senior Ambassador</th>}<th className="border-b border-slate-200 px-4 py-3">Junior Ambassador</th><th className="border-b border-slate-200 px-4 py-3">Cell Number</th><th className="border-b border-slate-200 px-4 py-3">Email</th><th className="border-b border-slate-200 px-4 py-3">Linked On</th></tr></thead><tbody>{visibleRows.map((row) => <tr key={row.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">{isAdmin && <td className="px-4 py-3 font-bold text-slate-800">{displayName(profiles.get(row.seniorId))}</td>}<td className="px-4 py-3"><p className="font-extrabold text-slate-800">{row.juniorName}</p><p className="mt-0.5 text-xs font-medium text-slate-400">Junior Ambassador</p></td><td className="px-4 py-3 font-semibold text-slate-600">{row.phone || "—"}</td><td className="px-4 py-3 font-semibold text-slate-600">{row.email || "—"}</td><td className="px-4 py-3 font-semibold text-slate-600">{formatDate(row.linkedAt)}</td></tr>)}{!visibleRows.length && <tr><td colSpan={isAdmin ? 5 : 4} className="px-4 py-14 text-center"><p className="font-bold text-slate-700">No Junior Ambassadors yet</p><p className="mt-1 text-xs text-slate-500">Choose the referring Ambassador as Channel Partner before the lead becomes an Ambassador.</p></td></tr>}</tbody></table></div>
    </section>;
  }

  return <section className="mx-auto max-w-6xl">
    <p className="text-[11px] font-extrabold tracking-[0.14em] text-red-600">AMBASSADORS</p>
    <div className="mt-1 flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-extrabold tracking-tight text-slate-900">{isAdmin ? "Senior Ambassadors" : "My Ambassador"}</h1><p className="mt-1 text-sm text-slate-500">{isAdmin ? "Senior Ambassador and Junior Ambassador relationships across CRM." : "Ambassadors who joined through your referral leads."}</p></div><span className="rounded-full bg-red-50 px-3 py-1.5 text-xs font-extrabold text-red-700">{visibleRows.length} {visibleRows.length === 1 ? "Junior Ambassador" : "Junior Ambassadors"}</span></div>

    <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm"><table className="min-w-[820px] w-full text-left text-sm"><thead className="bg-slate-50 text-[10px] font-extrabold uppercase tracking-wide text-slate-500"><tr>{isAdmin && <th className="border-b border-slate-200 px-4 py-3">Senior Ambassador</th>}<th className="border-b border-slate-200 px-4 py-3">Junior Ambassador</th><th className="border-b border-slate-200 px-4 py-3">Cell Number</th><th className="border-b border-slate-200 px-4 py-3">Email</th><th className="border-b border-slate-200 px-4 py-3">Linked On</th></tr></thead><tbody>{relationships.map((relationship) => { const junior = profiles.get(relationship.junior_ambassador_id); const senior = profiles.get(relationship.senior_ambassador_id); return <tr key={relationship.junior_ambassador_id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">{isAdmin && <td className="px-4 py-3 font-bold text-slate-800">{displayName(senior)}</td>}<td className="px-4 py-3"><p className="font-extrabold text-slate-800">{displayName(junior)}</p><p className="mt-0.5 text-xs font-medium text-slate-400">Junior Ambassador</p></td><td className="px-4 py-3 font-semibold text-slate-600">{junior?.phone || "—"}</td><td className="px-4 py-3 font-semibold text-slate-600">{junior?.email || "—"}</td><td className="px-4 py-3 font-semibold text-slate-600">{formatDate(relationship.created_at)}</td></tr>; })}{!relationships.length && <tr><td colSpan={isAdmin ? 5 : 4} className="px-4 py-14 text-center"><p className="font-bold text-slate-700">No Junior Ambassadors yet</p><p className="mt-1 text-xs text-slate-500">When a lead referred by an Ambassador becomes an Ambassador, it will appear here.</p></td></tr>}</tbody></table></div>
  </section>;
}
