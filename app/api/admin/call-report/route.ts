import { requireUser } from "@/app/lib/auth";
import { DATE_KEY, MONTH_KEY, istDayOfMonth, istDayRange, istMonthRange, istTodayKey } from "@/app/lib/altus-call-utils";
import { MISSING_LOG_MESSAGE, syncTeamCallLogs } from "@/app/lib/lead-call-log";
import type { CallReportData, TeamMember } from "@/app/lib/sales-dashboard";

export async function GET(request: Request) {
  try {
    const { roles } = await requireUser();
    if (!roles.includes("admin")) return Response.json({ ok: false, error: "This report is for admins." }, { status: 403 });

    const params = new URL(request.url).searchParams;
    const today = istTodayKey();
    const requestedDate = params.get("date") ?? today;
    const date = DATE_KEY.test(requestedDate) && !Number.isNaN(Date.parse(requestedDate)) && requestedDate <= today ? requestedDate : today;
    const requestedMonth = params.get("month") ?? date.slice(0, 7);
    const month = MONTH_KEY.test(requestedMonth) && requestedMonth <= today.slice(0, 7) && !Number.isNaN(Date.parse(`${requestedMonth}-01`)) ? requestedMonth : date.slice(0, 7);

    const { admin, people, byUser, message } = await syncTeamCallLogs();
    const ids = people.map((person) => person.userId);
    const day = istDayRange(date);
    const monthRange = istMonthRange(month);

    const [dayCalls, monthCalls, dayAssignments] = ids.length ? await Promise.all([
      admin.from("lead_call_log").select("user_id, lead_id, direction, is_connected").in("user_id", ids).gte("called_at", day.start.toISOString()).lt("called_at", day.end.toISOString()).limit(50000),
      admin.from("lead_call_log").select("called_at").in("user_id", ids).gte("called_at", monthRange.start.toISOString()).lt("called_at", monthRange.end.toISOString()).limit(100000),
      admin.from("lead_product_assignments").select("assigned_to, lead_id").in("assigned_to", ids).gte("assigned_at", day.start.toISOString()).lt("assigned_at", day.end.toISOString()).limit(20000),
    ]) : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }];

    const members: TeamMember[] = people.map((person) => {
      const mine = (dayCalls.data ?? []).filter((call) => call.user_id === person.userId);
      const connected = mine.filter((call) => call.is_connected).length;
      const incoming = mine.filter((call) => call.direction === "incoming").length;
      const followUps = (byUser.get(person.userId) ?? []).filter((row) => {
        const time = row.next_follow_up_at ? new Date(row.next_follow_up_at).getTime() : NaN;
        return time >= day.start.getTime() && time < day.end.getTime();
      }).length;
      // Focused leads = leads assigned to this person on the selected day; "called" = how many of them they phoned that day.
      const focused = new Set((dayAssignments.data ?? []).filter((row) => row.assigned_to === person.userId).map((row) => row.lead_id));
      const leadsCalled = new Set(mine.map((call) => call.lead_id).filter((id): id is string => Boolean(id && focused.has(id)))).size;
      return { userId: person.userId, name: person.name, calls: mine.length, incoming, outgoing: mine.length - incoming, connected, followUps, assigned: focused.size, leadsCalled, connectRate: mine.length ? Math.round((connected / mine.length) * 100) : 0 };
    }).sort((a, b) => b.calls - a.calls || a.name.localeCompare(b.name));

    const sum = (pick: (member: TeamMember) => number) => members.reduce((total, member) => total + pick(member), 0);
    const monthDays: Record<string, number> = {};
    for (const call of monthCalls.data ?? []) {
      const key = String(istDayOfMonth(call.called_at));
      monthDays[key] = (monthDays[key] ?? 0) + 1;
    }

    const data: CallReportData = {
      date,
      month,
      totals: { calls: sum((m) => m.calls), incoming: sum((m) => m.incoming), outgoing: sum((m) => m.outgoing), connected: sum((m) => m.connected), followUps: sum((m) => m.followUps), assigned: sum((m) => m.assigned), leadsCalled: sum((m) => m.leadsCalled) },
      members,
      monthDays,
      message: dayCalls.error || monthCalls.error || dayAssignments.error ? MISSING_LOG_MESSAGE : message,
      updatedAt: new Date().toISOString(),
    };
    return Response.json({ ok: true, data });
  } catch {
    return Response.json({ ok: false, error: "Unable to load the call report." }, { status: 401 });
  }
}
