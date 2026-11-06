import { requireUser } from "@/app/lib/auth";
import { isAmbassadorWorkspace } from "@/app/lib/roles";
import { createClient } from "@/app/lib/supabase/server";
import { createAdminClient } from "@/app/lib/supabase/admin";

export async function POST(request: Request) {
  const user = await requireUser();
  const body = await request.json().catch(() => null);
  if (!Array.isArray(body?.leadIds) || body.leadIds.length > 100 || body.leadIds.some((id: unknown) => typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id))) return Response.json({ ok: false, error: "Invalid lead selection." }, { status: 400 });
  const supabase = await createClient();
  const result = await supabase.from("leads").select("id, channel_partner_ids").in("id", body.leadIds);
  const missingSelectionColumn = result.error?.code === "42703" || result.error?.code === "PGRST204";
  let leads = result.data;
  if (missingSelectionColumn) {
    const fallback = await supabase.from("leads").select("id").in("id", body.leadIds);
    if (fallback.error) return Response.json({ ok: false, error: "Channel Partners could not be loaded." }, { status: 500 });
    leads = (fallback.data ?? []).map((lead) => ({ ...lead, channel_partner_ids: [] as string[] }));
  } else if (result.error) return Response.json({ ok: false, error: "Channel Partners could not be loaded." }, { status: 500 });
  const admin = createAdminClient();
  const { data: roleRows, error: roleError } = await admin.from("user_roles").select("user_id").eq("role", "ambassador");
  if (roleError) return Response.json({ ok: false, error: "Ambassadors could not be loaded." }, { status: 500 });
  const currentIds = new Set((roleRows ?? []).map((role) => role.user_id));
  const relationResult = await admin
    .from("lead_channel_partners")
    .select("lead_id, ambassador_id")
    .in("lead_id", (leads ?? []).map((lead) => lead.id));
  const relationMissing = ["42P01", "PGRST205"].includes(relationResult.error?.code ?? "");
  if (relationResult.error && !relationMissing)
    return Response.json({ ok: false, error: "Channel Partners could not be loaded." }, { status: 500 });
  const selectedByLead = new Map<string, string[]>();
  if (!relationMissing) {
    for (const relation of relationResult.data ?? []) {
      selectedByLead.set(relation.lead_id, [...(selectedByLead.get(relation.lead_id) ?? []), relation.ambassador_id]);
    }
  }
  const selectedFor = (lead: { id: string; channel_partner_ids?: string[] }) =>
    relationMissing ? lead.channel_partner_ids ?? [] : selectedByLead.get(lead.id) ?? [];
  const ids = [...new Set([...currentIds, ...(leads ?? []).flatMap(selectedFor)])];
  const { data: profiles, error: profilesError } = ids.length ? await admin.from("profiles").select("id, first_name, last_name, full_name, is_suspended").in("id", ids) : { data: [], error: null };
  if (profilesError) return Response.json({ ok: false, error: "Ambassadors could not be loaded." }, { status: 500 });
  const names = new Map((profiles ?? []).map((profile) => [profile.id, [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.full_name || "Ambassador"]));
  const options = (profiles ?? []).filter((profile) => currentIds.has(profile.id) && !profile.is_suspended).map((profile) => ({ id: profile.id, name: names.get(profile.id)! })).sort((a, b) => a.name.localeCompare(b.name));
  const seniorResult = await admin
    .from("lead_senior_ambassadors")
    .select("lead_id, senior_ambassador_id")
    .in("lead_id", (leads ?? []).map((lead) => lead.id));
  const seniorTableMissing = ["42P01", "PGRST205"].includes(seniorResult.error?.code ?? "");
  if (seniorResult.error && !seniorTableMissing)
    return Response.json({ ok: false, error: "Senior Ambassadors could not be loaded." }, { status: 500 });
  const seniorByLead = new Map((seniorResult.data ?? []).map((row) => [row.lead_id, row.senior_ambassador_id]));
  const seniorIds = [...new Set([...seniorByLead.values(), ...currentIds])];
  const unknownSeniorIds = seniorIds.filter((id) => !names.has(id));
  if (unknownSeniorIds.length) {
    const { data: seniorProfiles, error: seniorProfilesError } = await admin.from("profiles").select("id, first_name, last_name, full_name").in("id", unknownSeniorIds);
    if (seniorProfilesError) return Response.json({ ok: false, error: "Senior Ambassadors could not be loaded." }, { status: 500 });
    for (const profile of seniorProfiles ?? []) names.set(profile.id, [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.full_name || "Ambassador");
  }
  const canEdit = user.roles.some((role) => ["admin", "sales_executive", "sales_manager"].includes(role));
  if (isAmbassadorWorkspace(user.roles)) return Response.json({
    ok: true,
    partners: Object.fromEntries((leads ?? []).map((lead) => [lead.id, user.displayName])),
    selected: {}, options: [], editable: false,
    seniors: Object.fromEntries((leads ?? []).map((lead) => [lead.id, seniorByLead.has(lead.id) ? { id: seniorByLead.get(lead.id)!, name: names.get(seniorByLead.get(lead.id)!) ?? "Unavailable Ambassador" } : null])),
    seniorEditable: false,
    warning: seniorTableMissing ? "Senior Ambassador setup is not available until its database migration is run." : undefined,
  });
  return Response.json({ ok: true,
    partners: Object.fromEntries((leads ?? []).map((lead) => [lead.id, selectedFor(lead).map((id: string) => names.get(id) ?? "Unavailable Ambassador").join(", ")])),
    selected: Object.fromEntries((leads ?? []).map((lead) => [lead.id, selectedFor(lead)])), options,
    editable: canEdit,
    seniors: Object.fromEntries((leads ?? []).map((lead) => [lead.id, seniorByLead.has(lead.id) ? { id: seniorByLead.get(lead.id)!, name: names.get(seniorByLead.get(lead.id)!) ?? "Unavailable Ambassador" } : null])),
    seniorEditable: canEdit && !seniorTableMissing,
    warning: seniorTableMissing ? "Senior Ambassador setup is not available until its database migration is run." : undefined,
  });
}
