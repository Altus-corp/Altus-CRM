import { requireUser } from "@/app/lib/auth";
import { DATE_KEY, istDayRange, istTodayKey } from "@/app/lib/altus-call-utils";
import { createAdminClient } from "@/app/lib/supabase/admin";

type Person = { id: string; name: string };

function previousIstDay(day: string, amount: number) {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - amount);
  return date.toISOString().slice(0, 10);
}

function validDay(value: string | null, maximum: string) {
  return Boolean(value && DATE_KEY.test(value) && value <= maximum);
}

async function loadActivities(
  admin: ReturnType<typeof createAdminClient>,
  userIds: string[],
  start: Date,
  end: Date,
) {
  const rows: { metadata: unknown }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin
      .from("lead_activities")
      .select("metadata")
      .eq("activity_type", "resolution_updated")
      .in("created_by", userIds)
      .gte("created_at", start.toISOString())
      .lt("created_at", end.toISOString())
      .order("created_at", { ascending: false })
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) return rows;
  }
}

export async function GET(request: Request) {
  const user = await requireUser();
  const isAdmin = user.roles.includes("admin");
  const isManager = user.roles.includes("sales_manager");
  const isSalesUser = user.roles.some((role) =>
    ["sales_executive", "sales_manager", "consultant"].includes(role),
  );
  if (!isAdmin && !isSalesUser)
    return Response.json({ ok: false, error: "Not authorized." }, { status: 403 });

  const url = new URL(request.url);
  const today = istTodayKey();
  const range = url.searchParams.get("range") ?? "today";
  const customFrom = url.searchParams.get("from");
  const customTo = url.searchParams.get("to");
  const selectedScope = url.searchParams.get("user") ?? (isManager ? "me" : "all");
  const day =
    range === "yesterday"
      ? previousIstDay(today, 1)
      : range === "day_before_yesterday"
        ? previousIstDay(today, 2)
        : today;
  const from = range === "custom" && validDay(customFrom, today) ? customFrom! : day;
  const to = range === "custom" && validDay(customTo, today) && customTo! >= from ? customTo! : from;
  const start = istDayRange(from).start;
  const end = new Date(istDayRange(to).end.getTime());
  const admin = createAdminClient();

  let people: Person[] = [];
  let teamIds: string[] = [];
  if (isAdmin) {
    const [{ data: roles, error: rolesError }, { data: profiles, error: profilesError }] = await Promise.all([
      admin.from("user_roles").select("user_id").in("role", ["sales_executive", "sales_manager", "consultant"]),
      admin.from("profiles").select("id, first_name, last_name, full_name, is_suspended").eq("is_suspended", false),
    ]);
    if (rolesError || profilesError) return Response.json({ ok: false, error: rolesError?.message ?? profilesError?.message ?? "People could not be loaded." }, { status: 500 });
    const ids = new Set((roles ?? []).map((item) => item.user_id));
    people = (profiles ?? []).filter((profile) => ids.has(profile.id)).map((profile) => ({ id: profile.id, name: [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.full_name || "Unnamed user" }));
  } else if (isManager) {
    const { data: teams, error: teamsError } = await admin.from("crm_teams").select("id").eq("manager_id", user.userId);
    if (teamsError) return Response.json({ ok: false, error: teamsError.message }, { status: 500 });
    teamIds = (teams ?? []).map((team) => team.id);
    const { data: memberships, error: membersError } = teamIds.length
      ? await admin.from("crm_team_members").select("user_id").in("team_id", teamIds)
      : { data: [], error: null };
    if (membersError) return Response.json({ ok: false, error: membersError.message }, { status: 500 });
    const ids = [...new Set([user.userId, ...(memberships ?? []).map((member) => member.user_id)])];
    const { data: profiles, error: profilesError } = ids.length
      ? await admin.from("profiles").select("id, first_name, last_name, full_name, is_suspended").in("id", ids).eq("is_suspended", false)
      : { data: [], error: null };
    if (profilesError) return Response.json({ ok: false, error: profilesError.message }, { status: 500 });
    people = (profiles ?? []).map((profile) => ({ id: profile.id, name: [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.full_name || "Unnamed user" }));
  } else {
    people = [{ id: user.userId, name: user.displayName }];
  }

  const personIds = new Set(people.map((person) => person.id));
  const chosenIds = isAdmin
    ? selectedScope !== "all" && personIds.has(selectedScope) ? [selectedScope] : [...personIds]
    : isManager
      ? selectedScope === "team" ? people.filter((person) => person.id !== user.userId).map((person) => person.id) : personIds.has(selectedScope) && selectedScope !== "all" ? [selectedScope] : [user.userId]
      : [user.userId];

  if (!chosenIds.length) {
    return Response.json({ ok: true, data: { from, to, people, selectedScope, cards: [], total: 0 } }, { headers: { "Cache-Control": "no-store" } });
  }

  try {
    const activities = await loadActivities(admin, chosenIds, start, end);
    const resolutionIds = [...new Set(activities.map((activity) => {
      const metadata = activity.metadata;
      return metadata && typeof metadata === "object" && !Array.isArray(metadata) && typeof (metadata as Record<string, unknown>).resolution_id === "string"
        ? (metadata as Record<string, string>).resolution_id
        : "";
    }).filter(Boolean))];
    const { data: resolutions, error: resolutionsError } = resolutionIds.length
      ? await admin.from("lead_resolutions").select("id, name").in("id", resolutionIds)
      : { data: [], error: null };
    if (resolutionsError) throw new Error(resolutionsError.message);
    const names = new Map((resolutions ?? []).map((resolution) => [resolution.id, resolution.name]));
    const counts = new Map<string, number>();
    for (const activity of activities) {
      const metadata = activity.metadata as Record<string, unknown> | null;
      const id = typeof metadata?.resolution_id === "string" ? metadata.resolution_id : "";
      const name = names.get(id);
      if (name) counts.set(name.trim().toLowerCase().replace(/[,_-]+/g, " ").replace(/\s+/g, " "), (counts.get(name.trim().toLowerCase().replace(/[,_-]+/g, " ").replace(/\s+/g, " ")) ?? 0) + 1);
    }
    return Response.json({ ok: true, data: { from, to, people, selectedScope, counts: Object.fromEntries(counts), total: activities.length } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "Resolution report could not be loaded." }, { status: 500 });
  }
}
