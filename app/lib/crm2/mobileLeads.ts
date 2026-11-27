import "server-only";
// Mobile-sized read queries for Altus CRM v2's companion app (Phase 1: "my leads" + single lead
// detail + activity). Deliberately NOT loadWorkspace() — that loader pages through every active
// assignment in the viewer's scope (admin/sales_manager can mean thousands of rows) plus 60 days
// of scope-wide calls/meetings/contacts, built for the web dashboard's table/kanban/cards/calendar
// all at once. A phone only ever needs one rep's own queue or a single lead, so these queries stay
// narrow and cheap instead of reusing that loader.
import { createAdminClient } from "@/app/lib/supabase/admin";
import { getSalesManagerTeamMemberIds } from "@/app/lib/sales-manager-team";
import { isAmbassadorWorkspace } from "@/app/lib/roles";
import { DEFAULT_RESOLUTION_BUCKETS, type BucketKey } from "./config";
import type { MobileUser } from "@/app/lib/auth-token";

type Raw = Record<string, unknown>;
const s = (v: unknown) => (v == null ? "" : String(v));
const one = <T>(v: T | T[] | null | undefined): T | undefined => (Array.isArray(v) ? v[0] : v ?? undefined);

async function resolutionBuckets(db: ReturnType<typeof createAdminClient>) {
  const { data } = await db.from("crm_resolution_buckets").select("resolution_id, bucket");
  return new Map((data ?? []).map((row: Raw) => [s(row.resolution_id), row.bucket as BucketKey]));
}
function bucketFor(resolutionId: string | null, resolutionName: string | null, overrides: Map<string, BucketKey>): BucketKey {
  if (!resolutionId || !resolutionName) return "new";
  return overrides.get(resolutionId) ?? DEFAULT_RESOLUTION_BUCKETS[resolutionName.trim().toLowerCase()] ?? "approach";
}

export type MyLeadRow = {
  assignmentId: string; leadId: string; name: string; company: string; phone: string; email: string;
  product: string; stage: string | null; resolution: string | null; bucket: BucketKey;
  nextFollowUp: string | null; lastCalledAt: string | null;
};

const LIST_SELECT = "id, lead_id, product_id, stage_id, latest_resolution_id, next_follow_up_at, updated_at, lead:leads!inner(id, first_name, last_name, phone, email, custom_data), product:lead_products(code), stage:lead_stages(name), resolution:lead_resolutions(name)";

export async function listMyAssignments(user: MobileUser, opts: { cursor?: number; limit?: number } = {}) {
  const db = createAdminClient();
  const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);
  const offset = Math.max(opts.cursor ?? 0, 0);
  const [{ data, error }, overrides] = await Promise.all([
    db.from("lead_product_assignments").select(LIST_SELECT)
      .eq("is_active", true).eq("assigned_to", user.userId)
      .order("updated_at", { ascending: false }).order("id", { ascending: false })
      .range(offset, offset + limit - 1),
    resolutionBuckets(db),
  ]);
  if (error) throw new Error("Unable to load your leads.");
  const rows = (data ?? []) as Raw[];
  const ids = rows.map((r) => s(r.id));
  const { data: calls } = ids.length
    ? await db.from("lead_call_log").select("lead_product_assignment_id, called_at").in("lead_product_assignment_id", ids).order("called_at", { ascending: false })
    : { data: [] as Raw[] };
  const lastCalled = new Map<string, string>();
  for (const call of calls ?? []) {
    const id = s(call.lead_product_assignment_id);
    if (!lastCalled.has(id)) lastCalled.set(id, s(call.called_at));
  }

  const result: MyLeadRow[] = rows.map((row) => {
    const lead = one(row.lead as Raw | Raw[]) ?? {};
    const product = one(row.product as Raw | Raw[]);
    const stage = one(row.stage as Raw | Raw[]);
    const resolution = one(row.resolution as Raw | Raw[]);
    const cd = (lead.custom_data ?? {}) as Record<string, unknown>;
    return {
      assignmentId: s(row.id), leadId: s(row.lead_id),
      name: [lead.first_name, lead.last_name].filter(Boolean).join(" "),
      company: s(cd.company_name), phone: s(lead.phone), email: s(lead.email),
      product: product ? s(product.code) : "UNCATEGORIZED",
      stage: stage ? s(stage.name) : null,
      resolution: resolution ? s(resolution.name) : null,
      bucket: bucketFor(row.latest_resolution_id ? s(row.latest_resolution_id) : null, resolution ? s(resolution.name) : null, overrides),
      nextFollowUp: row.next_follow_up_at ? s(row.next_follow_up_at) : null,
      lastCalledAt: lastCalled.get(s(row.id)) ?? null,
    };
  });
  return { rows: result, nextCursor: result.length === limit ? offset + limit : null };
}

export type MobileLeadDetail = MyLeadRow & {
  custom: Record<string, string>;
  leadNumber: string;
  availableResolutions: { id: string; name: string }[];
};

/** Same ownership rule app/dashboard/leads/actions.ts's getEditableLead() enforces for writes
 * (direct assignee / sales-manager-team / channel-partner ambassador) — reimplemented read-side
 * since that function isn't exported. Keep these two in sync if either one's rule changes. */
async function canAccessAssignment(db: ReturnType<typeof createAdminClient>, user: MobileUser, leadId: string, assignedTo: string | null) {
  if (user.roles.includes("admin")) return true;
  if (assignedTo === user.userId) return true;
  if (user.roles.includes("sales_manager") && assignedTo && (await getSalesManagerTeamMemberIds(user.userId)).includes(assignedTo)) return true;
  if (isAmbassadorWorkspace(user.roles)) {
    const { data } = await db.from("lead_channel_partners").select("lead_id").eq("lead_id", leadId).eq("ambassador_id", user.userId).maybeSingle();
    if (data) return true;
  }
  return false;
}

export async function loadMobileLead(user: MobileUser, assignmentId: string): Promise<MobileLeadDetail | null> {
  const db = createAdminClient();
  const [{ data: row, error }, overrides] = await Promise.all([
    db.from("lead_product_assignments").select(
      "id, lead_id, product_id, stage_id, latest_resolution_id, assigned_to, next_follow_up_at, lead:leads!inner(id, lead_number, first_name, last_name, phone, email, custom_data), product:lead_products(id, code), stage:lead_stages(name), resolution:lead_resolutions(name)",
    ).eq("id", assignmentId).maybeSingle(),
    resolutionBuckets(db),
  ]);
  if (error || !row) return null;
  const lead = one(row.lead as Raw | Raw[]) ?? {};
  if (!(await canAccessAssignment(db, user, s(row.lead_id), row.assigned_to ? s(row.assigned_to) : null))) return null;

  const product = one(row.product as Raw | Raw[]);
  const stage = one(row.stage as Raw | Raw[]);
  const resolution = one(row.resolution as Raw | Raw[]);
  const cd = (lead.custom_data ?? {}) as Record<string, unknown>;
  const custom: Record<string, string> = {};
  Object.entries(cd).forEach(([k, v]) => { if (v != null && typeof v !== "object") custom[k] = String(v); });

  const { data: availableResolutions } = product
    ? await db.from("lead_product_resolutions").select("resolution:lead_resolutions!inner(id, name)").eq("product_id", s(product.id)).eq("is_active", true)
    : { data: [] as Raw[] };

  return {
    assignmentId: s(row.id), leadId: s(row.lead_id),
    name: [lead.first_name, lead.last_name].filter(Boolean).join(" "),
    company: s(cd.company_name), phone: s(lead.phone), email: s(lead.email),
    leadNumber: s(lead.lead_number),
    product: product ? s(product.code) : "UNCATEGORIZED",
    stage: stage ? s(stage.name) : null,
    resolution: resolution ? s(resolution.name) : null,
    bucket: bucketFor(row.latest_resolution_id ? s(row.latest_resolution_id) : null, resolution ? s(resolution.name) : null, overrides),
    nextFollowUp: row.next_follow_up_at ? s(row.next_follow_up_at) : null,
    lastCalledAt: null,
    custom,
    availableResolutions: (availableResolutions ?? []).map((item: Raw) => {
      const r = one(item.resolution as Raw | Raw[]) ?? {};
      return { id: s(r.id), name: s(r.name) };
    }).filter((r) => r.id),
  };
}

export type ActivityItem = { id: string; activityType: string; note: string | null; createdAt: string; followUpAt: string | null; metadata: Record<string, unknown> | null };

export async function loadMobileLeadActivity(assignmentId: string, limit = 20): Promise<ActivityItem[]> {
  const db = createAdminClient();
  const { data, error } = await db.from("lead_activities")
    .select("id, activity_type, note, created_at, follow_up_at, metadata")
    .eq("lead_product_assignment_id", assignmentId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error("Unable to load activity for this lead.");
  return (data ?? []).map((row: Raw) => ({
    id: s(row.id), activityType: s(row.activity_type), note: row.note ? s(row.note) : null,
    createdAt: s(row.created_at), followUpAt: row.follow_up_at ? s(row.follow_up_at) : null,
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata as Record<string, unknown> : null,
  }));
}

export type CallLogRow = {
  id: string; calledAt: string; leadName: string; company: string;
  direction: string; isConnected: boolean; durationSeconds: number;
};

export async function listMyCalls(user: MobileUser, opts: { limit?: number } = {}): Promise<CallLogRow[]> {
  const db = createAdminClient();
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 200);
  const since60 = new Date(Date.now() - 60 * 86_400_000).toISOString();
  const { data, error } = await db.from("lead_call_log")
    .select("id, called_at, is_connected, direction, duration_seconds, lead_product_assignment_id, assignment:lead_product_assignments(lead:leads(first_name, last_name, custom_data))")
    .eq("user_id", user.userId).gte("called_at", since60)
    .order("called_at", { ascending: false }).limit(limit);
  if (error) throw new Error("Unable to load your calls.");
  return (data ?? []).map((row: Raw) => {
    const assignment = one(row.assignment as Raw | Raw[]) ?? {};
    const lead = one(assignment.lead as Raw | Raw[]) ?? {};
    const cd = (lead.custom_data ?? {}) as Record<string, unknown>;
    return {
      id: s(row.id), calledAt: s(row.called_at),
      leadName: [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Lead",
      company: s(cd.company_name), direction: s(row.direction),
      isConnected: !!row.is_connected, durationSeconds: Number(row.duration_seconds) || 0,
    };
  });
}

export type MeetingRow = { id: string; kind: "Zoom" | "Google Meet"; leadName: string; startTime: string; upcoming: boolean };

export async function listMyMeetings(user: MobileUser): Promise<MeetingRow[]> {
  const db = createAdminClient();
  const since7 = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const [zoom, meet] = await Promise.all([
    db.from("lead_zoom_meetings").select("id, start_time, lead:leads(first_name, last_name)").eq("host_user_id", user.userId).gte("start_time", since7).order("start_time", { ascending: true }).limit(100),
    db.from("lead_google_meetings").select("id, start_time, lead:leads(first_name, last_name)").eq("host_user_id", user.userId).gte("start_time", since7).order("start_time", { ascending: true }).limit(100),
  ]);
  if (zoom.error || meet.error) throw new Error("Unable to load your meetings.");
  const now = Date.now();
  const toRow = (kind: MeetingRow["kind"]) => (row: Raw): MeetingRow => {
    const lead = one(row.lead as Raw | Raw[]) ?? {};
    return {
      id: s(row.id), kind, startTime: s(row.start_time),
      leadName: [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Lead",
      upcoming: new Date(s(row.start_time)).getTime() > now,
    };
  };
  return [...(zoom.data ?? []).map(toRow("Zoom")), ...(meet.data ?? []).map(toRow("Google Meet"))]
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
}

/** Resolves {leadId, assignedTo} for an assignmentId and checks access — every mobile write route
 * calls this first so it never trusts a client-supplied leadId/assignmentId pairing. */
export async function resolveOwnedAssignment(user: MobileUser, assignmentId: string): Promise<{ leadId: string } | null> {
  const db = createAdminClient();
  const { data: row, error } = await db.from("lead_product_assignments").select("lead_id, assigned_to").eq("id", assignmentId).maybeSingle();
  if (error || !row) return null;
  if (!(await canAccessAssignment(db, user, s(row.lead_id), row.assigned_to ? s(row.assigned_to) : null))) return null;
  return { leadId: s(row.lead_id) };
}
