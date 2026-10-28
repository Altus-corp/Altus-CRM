import "server-only";
import { AltusContactsError, altusContactsRequest } from "@/app/lib/altus-contacts";
import { callNumbers, dateFromCall, isConnected, numberKey, type ContactCall } from "@/app/lib/altus-call-utils";
import { createAdminClient } from "@/app/lib/supabase/admin";

export type Named = { name: string } | { name: string }[] | null;
export type LeadInfo = { first_name: string; last_name: string | null; phone: string | null; email: string | null; custom_data: Record<string, unknown> | null };
export type AssignmentRow = { id: string; lead_id: string; next_follow_up_at: string | null; resolution: Named; lead: LeadInfo | LeadInfo[] | null };
type KnownLead = { leadId: string; assignmentId: string | null; name: string; company: string | null };

const lastSyncAt = new Map<string, number>();
const PAGE_SIZE = 100;
const BACKFILL_PAGES = 20;
const INCREMENTAL_PAGES = 5;
export const MISSING_LOG_MESSAGE = "Call history is not set up yet. Run 20261025_create_lead_call_log.sql in the Supabase SQL Editor.";

export const one = <T,>(value: T | T[] | null): T | null => (Array.isArray(value) ? value[0] ?? null : value);
export const fullName = (lead: Pick<LeadInfo, "first_name" | "last_name">) => [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Unnamed lead";

// Pages through this user's own Altus calls (newest first), stopping once a page reaches calls older than `sinceMs`.
async function fetchUserCalls(email: string, sinceMs: number, maxPages: number) {
  const calls: ContactCall[] = [];
  let cursor: string | null | undefined;
  for (let page = 0; page < maxPages; page += 1) {
    const query = `/calls?limit=${PAGE_SIZE}&user=${encodeURIComponent(email)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const response = await altusContactsRequest<ContactCall[]>(query);
    const batch = (response.data ?? []).filter((call) => call.user?.trim().toLowerCase() === email);
    calls.push(...batch);
    cursor = response.next_cursor;
    const oldest = batch.map((call) => dateFromCall(call)?.getTime() ?? Infinity).reduce((min, time) => Math.min(min, time), Infinity);
    if (!cursor || !response.data?.length || oldest < sinceMs) break;
  }
  return calls;
}

// Leads this user owns now plus leads once assigned to them, so a later reassignment never erases their call history.
async function knownLeadsByPhone(userId: string, current: AssignmentRow[], companyOf: (lead: LeadInfo) => string | null) {
  const byPhone = new Map<string, KnownLead>();
  for (const row of current) {
    const lead = one(row.lead);
    const key = numberKey(lead?.phone);
    if (lead && key && !byPhone.has(key)) byPhone.set(key, { leadId: row.lead_id, assignmentId: row.id, name: fullName(lead), company: companyOf(lead) });
  }

  const admin = createAdminClient();
  const { data: assigned } = await admin.from("lead_activities").select("lead_id").eq("activity_type", "assigned").eq("metadata->>assigned_to", userId).limit(5000);
  const knownIds = new Set(current.map((row) => row.lead_id));
  const formerIds = [...new Set((assigned ?? []).map((item) => item.lead_id))].filter((id) => !knownIds.has(id));
  for (let index = 0; index < formerIds.length; index += 200) {
    const { data: leads } = await admin.from("leads").select("id, first_name, last_name, phone, email, custom_data").in("id", formerIds.slice(index, index + 200));
    for (const lead of (leads ?? []) as (LeadInfo & { id: string })[]) {
      const key = numberKey(lead.phone);
      if (key && !byPhone.has(key)) byPhone.set(key, { leadId: lead.id, assignmentId: null, name: fullName(lead), company: companyOf(lead) });
    }
  }
  return byPhone;
}

// Stores only calls that match a lead; every other call (personal, unknown numbers) is discarded.
export async function syncLeadCallLog(userId: string, email: string, current: AssignmentRow[], companyOf: (lead: LeadInfo) => string | null, minIntervalMs = 0) {
  const lastSync = lastSyncAt.get(userId) ?? 0;
  if (minIntervalMs && Date.now() - lastSync < minIntervalMs) return;
  lastSyncAt.set(userId, Date.now());
  const admin = createAdminClient();
  const { data: latest, error: latestError } = await admin.from("lead_call_log").select("called_at").eq("user_id", userId).order("called_at", { ascending: false }).limit(1).maybeSingle();
  if (latestError) throw new Error(MISSING_LOG_MESSAGE);

  const sinceMs = latest ? new Date(latest.called_at).getTime() - 86_400_000 : 0;
  const [calls, leads] = await Promise.all([fetchUserCalls(email, sinceMs, latest ? INCREMENTAL_PAGES : BACKFILL_PAGES), knownLeadsByPhone(userId, current, companyOf)]);

  const records = calls.flatMap((call) => {
    const date = dateFromCall(call);
    const lead = callNumbers(call).map((phone) => leads.get(phone)).find(Boolean);
    if (!lead || !date || call.id === undefined || call.id === null) return [];
    return [{
      altus_call_id: String(call.id),
      user_id: userId,
      lead_id: lead.leadId,
      lead_product_assignment_id: lead.assignmentId,
      lead_name: lead.name,
      lead_company: lead.company,
      phone: String(call.number ?? call.number_raw ?? "") || null,
      direction: String(call.direction ?? "").toLowerCase() === "incoming" ? "incoming" : "outgoing",
      is_connected: isConnected(call),
      duration_seconds: Number.isFinite(Number(call.duration_seconds)) ? Math.round(Number(call.duration_seconds)) : null,
      called_at: date.toISOString(),
    }];
  });
  if (!records.length) return;
  const { error } = await admin.from("lead_call_log").upsert(records, { onConflict: "altus_call_id", ignoreDuplicates: true });
  if (error) throw new Error("Call history could not be updated.");
}


// Reads the company name from whichever custom lead column is labelled company / organisation / business / firm.
export function makeCompanyOf(columns: { field_key: string; label: string }[] | null) {
  const companyKey = (columns ?? []).find((column) => /company|organi[sz]ation|business|firm/i.test(column.label))?.field_key;
  return (lead: LeadInfo) => {
    const value = companyKey ? lead.custom_data?.[companyKey] : null;
    return typeof value === "string" && value.trim() ? value.trim() : null;
  };
}

export type TeamPerson = { userId: string; name: string };

// Refreshes every active salesperson's call log (at most once a minute each) and returns who they are
// plus the leads currently assigned to them, so admin views don't depend on who opened their own dashboard.
export async function syncTeamCallLogs() {
  const admin = createAdminClient();
  const [{ data: roleRows }, { data: profiles }, { data: authUsers }, { data: columns }] = await Promise.all([
    admin.from("user_roles").select("user_id").in("role", ["sales_executive", "sales_manager", "consultant"]),
    admin.from("profiles").select("id, first_name, last_name, full_name, is_suspended"),
    admin.auth.admin.listUsers({ perPage: 1000 }),
    admin.from("lead_table_columns").select("field_key, label").eq("source", "custom"),
  ]);

  const emails = new Map((authUsers?.users ?? []).map((user) => [user.id, user.email?.trim().toLowerCase() ?? ""]));
  const roleIds = new Set((roleRows ?? []).map((role) => role.user_id));
  const people: TeamPerson[] = (profiles ?? []).filter((profile) => !profile.is_suspended && roleIds.has(profile.id)).map((profile) => ({
    userId: profile.id,
    name: profile.full_name || [profile.first_name, profile.last_name].filter(Boolean).join(" ") || emails.get(profile.id) || "Unnamed user",
  }));

  const byUser = new Map<string, (AssignmentRow & { assigned_to: string })[]>();
  if (people.length) {
    const { data: assignments, error } = await admin
      .from("lead_product_assignments")
      .select("id, lead_id, assigned_to, next_follow_up_at, resolution:lead_resolutions(name), lead:leads(first_name, last_name, phone, email, custom_data)")
      .in("assigned_to", people.map((person) => person.userId)).eq("is_active", true).limit(20000);
    if (error) throw new Error("Unable to load team leads.");
    for (const row of (assignments ?? []) as unknown as (AssignmentRow & { assigned_to: string })[]) byUser.set(row.assigned_to, [...(byUser.get(row.assigned_to) ?? []), row]);
  }

  const companyOf = makeCompanyOf(columns);
  const syncs = await Promise.allSettled(people.map((person) => {
    const email = emails.get(person.userId);
    return email ? syncLeadCallLog(person.userId, email, byUser.get(person.userId) ?? [], companyOf, 60_000) : Promise.resolve();
  }));
  const failure = syncs.find((result): result is PromiseRejectedResult => result.status === "rejected");
  let message: string | null = null;
  if (failure) {
    const reason = failure.reason;
    message = reason instanceof Error && reason.message === MISSING_LOG_MESSAGE ? MISSING_LOG_MESSAGE
      : reason instanceof AltusContactsError ? `Showing saved call history. ${reason.message}` : "Showing saved call history. Live call sync is temporarily unavailable.";
  }
  return { admin, people, byUser, message };
}
