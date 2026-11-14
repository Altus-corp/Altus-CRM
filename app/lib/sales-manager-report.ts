import "server-only";
import { redirect } from "next/navigation";
import { requireUser } from "@/app/lib/auth";
import { createAdminClient } from "@/app/lib/supabase/admin";
import { DATE_KEY, istDayRange, istTodayKey } from "@/app/lib/altus-call-utils";
import { makeCompanyOf, syncLeadCallLog, type AssignmentRow } from "@/app/lib/lead-call-log";
import { summarizeTeamPerformance } from "@/app/lib/team-performance";
import { getSalesManagerTeamMemberIds } from "@/app/lib/sales-manager-team";

async function readAll<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await fetchPage(offset, offset + 499);
    if (error) throw new Error("Report data could not be loaded. Please try again or contact an admin.");
    rows.push(...(data ?? []));
    if (!data || data.length < 500) return rows;
  }
}

export async function getSalesManagerReport(params: { from?: string; to?: string; team?: string }) {
  const { userId, roles } = await requireUser();
  if (!roles.includes("sales_manager")) redirect("/dashboard");
  const today = istTodayKey();
  const validDate = (value?: string) => Boolean(value && DATE_KEY.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value && value <= today);
  const to = validDate(params.to) ? params.to! : today;
  const from = validDate(params.from) && params.from! <= to ? params.from! : `${to.slice(0, 7)}-01`;
  const start = istDayRange(from).start;
  const end = istDayRange(to).end;
  const admin = createAdminClient();
  // Resolve the manager's permitted teams before any service-role member/report reads.
  const teams = await readAll((lo, hi) => admin.from("crm_teams").select("id, name").eq("manager_id", userId).order("id").range(lo, hi));
  const selectedTeam = teams.find((team) => team.id === params.team)?.id ?? "";
  const ids = selectedTeam ? [selectedTeam] : teams.map((team) => team.id);
  const memberships = ids.length ? await readAll((lo, hi) => admin.from("crm_team_members").select("team_id, user_id").in("team_id", ids).order("team_id").order("user_id").range(lo, hi)) : [];
  // Direct manager-to-member links participate in the combined report. A
  // selected named team remains limited to members of that team.
  const directMemberIds = selectedTeam ? [] : await getSalesManagerTeamMemberIds(userId);
  const memberIds = [...new Set([...memberships.map((member) => member.user_id), ...directMemberIds])];
  // Include the logged-in manager even when they are not a member of their
  // own team, so the report and its totals include their personal work.
  const reportUserIds = [...new Set([...memberIds, userId])];
  const salesRoles = reportUserIds.length ? await readAll((lo, hi) => admin.from("user_roles").select("user_id, role").in("user_id", reportUserIds).in("role", ["sales_executive", "sales_manager", "consultant"]).order("user_id").order("role").range(lo, hi)) : [];
  const salesIds = [...new Set([...salesRoles.map((role) => role.user_id), userId])];
  const profiles = salesIds.length ? await readAll((lo, hi) => admin.from("profiles").select("id, first_name, last_name, full_name, is_suspended").in("id", salesIds).order("id").range(lo, hi)) : [];
  const people = profiles.map((person) => ({ id: person.id, name: [person.first_name, person.last_name].filter(Boolean).join(" ") || person.full_name || "Unnamed user", suspended: person.is_suspended ?? false, isManager: person.id === userId }));
  const rawWork = salesIds.length ? await readAll((lo, hi) => admin.from("lead_product_assignments")
    .select("id, lead_id, assigned_to, is_closed, is_ambassador, next_follow_up_at, product:lead_products(code), stage:lead_stages(name), resolution:lead_resolutions(name), lead:leads(first_name, last_name, phone, email, custom_data)")
    .in("assigned_to", salesIds).eq("is_active", true).order("id").range(lo, hi)) : [];
  const one = <T,>(value: T | T[] | null): T | null => Array.isArray(value) ? value[0] ?? null : value;
  const work = rawWork.map((row) => ({ ...row, product: one(row.product), stage: one(row.stage), resolution: one(row.resolution), lead: one(row.lead) }));
  const { data: columns } = salesIds.length ? await admin.from("lead_table_columns").select("field_key, label").eq("source", "custom") : { data: [] };
  const companyOf = makeCompanyOf(columns);
  let syncFailed = false;
  // Limit concurrent external requests; sync only this manager's team members.
  for (let offset = 0; offset < people.length; offset += 4) {
    const results = await Promise.allSettled(people.slice(offset, offset + 4).map(async (person) => {
      const { data, error } = await admin.auth.admin.getUserById(person.id);
      if (error || !data.user?.email) throw new Error("Email unavailable");
      const mine: AssignmentRow[] = work.filter((row) => row.assigned_to === person.id);
      await syncLeadCallLog(person.id, data.user.email.trim().toLowerCase(), mine, companyOf, 60_000);
    }));
    if (results.some((result) => result.status === "rejected")) syncFailed = true;
  }
  let callsUnavailable = false;
  const calls = salesIds.length ? await readAll((lo, hi) => admin.from("lead_call_log")
    .select("user_id, lead_id, direction, is_connected, duration_seconds, called_at").in("user_id", salesIds)
    .gte("called_at", start.toISOString()).lt("called_at", end.toISOString()).order("id").range(lo, hi))
    .catch(() => { callsUnavailable = true; return []; }) : [];

  return { teams, selectedTeam, from, to, today, callsUnavailable, syncFailed, ...summarizeTeamPerformance(people, calls, work, Date.now(), start.getTime(), end.getTime()) };
}
