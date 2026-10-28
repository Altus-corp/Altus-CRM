import { requireUser } from "@/app/lib/auth";
import { AltusContactsError } from "@/app/lib/altus-contacts";
import { indiaDayRange } from "@/app/lib/altus-call-utils";
import { MISSING_LOG_MESSAGE, fullName, makeCompanyOf, one, syncLeadCallLog, type AssignmentRow } from "@/app/lib/lead-call-log";
import { createClient } from "@/app/lib/supabase/server";
import type { RecentCall, SalesDashboardData, UpcomingFollowUp } from "@/app/lib/sales-dashboard";

export async function GET() {
  try {
    const { userId, roles } = await requireUser();
    if (!roles.includes("sales_executive")) return Response.json({ ok: false, error: "This dashboard is for sales executives." }, { status: 403 });

    const supabase = await createClient();
    const [{ data: authResult }, { data: profile }, { data: assignments, error }, { data: columns }] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from("profiles").select("first_name, last_name, full_name").eq("id", userId).maybeSingle(),
      supabase.from("lead_product_assignments")
        .select("id, lead_id, next_follow_up_at, resolution:lead_resolutions(name), lead:leads(first_name, last_name, phone, email, custom_data)")
        .eq("assigned_to", userId).eq("is_active", true).limit(2000),
      supabase.from("lead_table_columns").select("field_key, label").eq("source", "custom"),
    ]);
    if (error) return Response.json({ ok: false, error: "Unable to load your leads." }, { status: 500 });

    const email = authResult.user?.email?.trim().toLowerCase();
    const myName = profile?.full_name || [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "You";
    const rows = (assignments ?? []) as unknown as AssignmentRow[];
    const companyOf = makeCompanyOf(columns);

    const { start } = indiaDayRange();
    const now = Date.now();
    const dated = rows.flatMap((row) => {
      const lead = one(row.lead);
      return lead && row.next_follow_up_at ? [{ row, lead, time: new Date(row.next_follow_up_at).getTime() }] : [];
    }).filter((item) => !Number.isNaN(item.time));

    const upcomingFollowUps: UpcomingFollowUp[] = dated
      .filter((item) => item.time >= start.getTime())
      .sort((a, b) => a.time - b.time)
      .slice(0, 6)
      .map(({ row, lead, time }) => ({
        assignmentId: row.id, leadId: row.lead_id, name: fullName(lead), company: companyOf(lead) ?? "—", phone: lead.phone, email: lead.email,
        followUpAt: new Date(time).toISOString(), isOverdue: time < now,
      }));
    const pendingFollowUps = dated.filter((item) => item.time >= start.getTime()).length;

    // A failed sync must not hide the history that is already stored.
    let callsMessage: string | null = null;
    try {
      if (!email) throw new AltusContactsError("Your CRM account does not have an email address.", 422);
      await syncLeadCallLog(userId, email, rows, companyOf);
    } catch (syncError) {
      callsMessage = syncError instanceof Error && syncError.message === MISSING_LOG_MESSAGE ? MISSING_LOG_MESSAGE
        : syncError instanceof AltusContactsError ? `Showing saved call history. ${syncError.message}` : "Showing saved call history. Live call sync is temporarily unavailable.";
    }

    const countLog = () => supabase.from("lead_call_log").select("id", { count: "exact", head: true }).eq("user_id", userId);
    const [total, incoming, connected, recent] = await Promise.all([
      countLog(),
      countLog().eq("direction", "incoming"),
      countLog().eq("is_connected", true),
      supabase.from("lead_call_log").select("altus_call_id, lead_id, lead_name, lead_company, direction, called_at").eq("user_id", userId).order("called_at", { ascending: false }).limit(5),
    ]);
    const logFailed = Boolean(total.error || incoming.error || connected.error || recent.error);
    if (logFailed) callsMessage = MISSING_LOG_MESSAGE;

    const currentByLead = new Map(rows.map((row) => [row.lead_id, row]));
    const recentCalls: RecentCall[] = (recent.data ?? []).map((call) => {
      const current = call.lead_id ? currentByLead.get(call.lead_id) : undefined;
      return {
        id: call.altus_call_id,
        name: call.lead_name,
        subtitle: call.lead_company || "—",
        calledAt: call.called_at,
        direction: call.direction === "incoming" ? "incoming" : "outgoing",
        outcome: one(current?.resolution ?? null)?.name ?? null,
        nextFollowUp: current?.next_follow_up_at ?? null,
        assignedTo: myName,
      };
    });

    const callsMade = total.count ?? 0;
    const incomingCalls = incoming.count ?? 0;
    const connectedCalls = connected.count ?? 0;
    const data: SalesDashboardData = {
      summary: { callsMade, incoming: incomingCalls, outgoing: callsMade - incomingCalls, connected: connectedCalls, followUps: pendingFollowUps, notReachable: callsMade - connectedCalls },
      callsAvailable: !logFailed,
      callsMessage,
      recentCalls,
      upcomingFollowUps,
      updatedAt: new Date().toISOString(),
    };
    return Response.json({ ok: true, data });
  } catch {
    return Response.json({ ok: false, error: "Unable to load the dashboard." }, { status: 401 });
  }
}
