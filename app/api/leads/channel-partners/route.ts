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
  if (isAmbassadorWorkspace(user.roles)) return Response.json({ ok: true, partners: Object.fromEntries((leads ?? []).map((lead) => [lead.id, user.displayName])), selected: {}, options: [], editable: false });
  const admin = createAdminClient();
  const { data: roleRows, error: roleError } = await admin.from("user_roles").select("user_id").eq("role", "ambassador");
  if (roleError) return Response.json({ ok: false, error: "Ambassadors could not be loaded." }, { status: 500 });
  const currentIds = new Set((roleRows ?? []).map((role) => role.user_id));
  const ids = [...new Set([...currentIds, ...(leads ?? []).flatMap((lead) => lead.channel_partner_ids ?? [])])];
  const { data: profiles, error: profilesError } = ids.length ? await admin.from("profiles").select("id, first_name, last_name, full_name, is_suspended").in("id", ids) : { data: [], error: null };
  if (profilesError) return Response.json({ ok: false, error: "Ambassadors could not be loaded." }, { status: 500 });
  const names = new Map((profiles ?? []).map((profile) => [profile.id, [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.full_name || "Ambassador"]));
  const options = (profiles ?? []).filter((profile) => currentIds.has(profile.id) && !profile.is_suspended).map((profile) => ({ id: profile.id, name: names.get(profile.id)! })).sort((a, b) => a.name.localeCompare(b.name));
  return Response.json({ ok: true,
    partners: Object.fromEntries((leads ?? []).map((lead) => [lead.id, (lead.channel_partner_ids ?? []).map((id: string) => names.get(id) ?? "Unavailable Ambassador").join(", ")])),
    selected: Object.fromEntries((leads ?? []).map((lead) => [lead.id, lead.channel_partner_ids ?? []])), options,
    editable: user.roles.some((role) => ["admin", "sales_executive", "sales_manager"].includes(role)),
  });
}
