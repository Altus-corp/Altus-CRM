import { requireUser } from "@/app/lib/auth";
import { istMonthRange, istTodayKey } from "@/app/lib/altus-call-utils";
import { MISSING_LOG_MESSAGE, syncTeamCallLogs } from "@/app/lib/lead-call-log";
import type { CallSummaryData } from "@/app/lib/sales-dashboard";

export async function GET() {
  try {
    const { roles } = await requireUser();
    if (!roles.includes("admin")) return Response.json({ ok: false, error: "This dashboard is for admins." }, { status: 403 });

    const { admin, people, message } = await syncTeamCallLogs();
    const ids = people.map((person) => person.userId);
    const monthKey = istTodayKey().slice(0, 7);
    const { start, end } = istMonthRange(monthKey);
    const [calls, connected, assigned] = await Promise.all([
      admin.from("lead_call_log").select("id", { count: "exact", head: true }).in("user_id", ids).gte("called_at", start.toISOString()).lt("called_at", end.toISOString()),
      admin.from("lead_call_log").select("id", { count: "exact", head: true }).in("user_id", ids).eq("is_connected", true).gte("called_at", start.toISOString()).lt("called_at", end.toISOString()),
      admin.from("lead_product_assignments").select("id", { count: "exact", head: true }).gte("assigned_at", start.toISOString()).lt("assigned_at", end.toISOString()),
    ]);
    if (assigned.error) return Response.json({ ok: false, error: "Unable to load assigned leads." }, { status: 500 });

    const data: CallSummaryData = {
      monthLabel: new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${monthKey}-01T00:00:00Z`)),
      calls: calls.count ?? 0,
      connected: connected.count ?? 0,
      assignedLeads: assigned.count ?? 0,
      message: calls.error || connected.error ? MISSING_LOG_MESSAGE : message,
      updatedAt: new Date().toISOString(),
    };
    return Response.json({ ok: true, data });
  } catch {
    return Response.json({ ok: false, error: "Unable to load the monthly summary." }, { status: 401 });
  }
}
