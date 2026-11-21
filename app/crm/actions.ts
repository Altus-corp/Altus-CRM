"use server";
// Altus CRM v2 — thin wrappers. Lead writes call the EXISTING actions so every rule, trigger,
// notification and activity log of the current CRM keeps working unchanged.
import { requireAdmin, requireUser } from "@/app/lib/auth";
import { createClient } from "@/app/lib/supabase/server";
import { createAdminClient } from "@/app/lib/supabase/admin";
import { createSmtpTransport, getUserSmtpPassword, getUserSmtpSettings } from "@/app/lib/smtp-settings";
import type { AppRole } from "@/app/lib/roles";
import {
  createLeadNote,
  createManualLead,
  manuallyAssignLeads,
  updateLeadDetails,
  updateLeadFollowUp,
  updateLeadResolutionInline,
  updateLeadStageInline,
} from "@/app/dashboard/leads/actions";
import type { ManagedUser } from "@/app/dashboard/users/users-table";
import type { ApiActivityLog } from "@/components/marketplace/leads-management-api";
import { saveTeam } from "@/app/dashboard/team/actions";
import { attendanceAvailability, attendanceForEmail, getWmsAttendance } from "@/app/lib/wms-attendance";
import { withoutDuplicateSystemColumns } from "@/app/lib/lead-shared-config";
import { loadWorkspace } from "@/app/lib/crm2/workspace";

type Target = { leadId: string; assignmentId: string };
export type ActionResult = { ok: boolean; message: string; done?: number };
const fd = (o: Record<string, string>) => { const f = new FormData(); Object.entries(o).forEach(([k, v]) => f.set(k, v)); return f; };

export async function refreshWorkspace() {
  const user = await requireUser();
  return loadWorkspace(user);
}

/** Change one field on many rows. Fields map 1:1 to existing actions. */
export async function v2UpdateField(targets: Target[], field: string, value: string): Promise<ActionResult> {
  await requireUser();
  if (!targets.length) return { ok: false, message: "Nothing selected." };
  try {
    if (field === "owner") {
      for (let i = 0; i < targets.length; i += 100) { const f = new FormData(); f.set("assigneeId", value); targets.slice(i, i + 100).forEach((t) => f.append("assignmentId", t.assignmentId)); await manuallyAssignLeads(f); }
      return { ok: true, message: `Reassigned ${targets.length}`, done: targets.length };
    }
    let done = 0;
    for (const t of targets) {
      if (field === "resolutionId") await updateLeadResolutionInline(fd({ leadId: t.leadId, assignmentId: t.assignmentId, resolutionId: value, followUpAt: "", followUpNote: "" }));
      else if (field === "nextFollowUp") await updateLeadFollowUp(fd({ leadId: t.leadId, assignmentId: t.assignmentId, followUpAt: value }));
      else if (field === "stageId") await updateLeadStageInline(fd({ leadId: t.leadId, assignmentId: t.assignmentId, stageId: value }));
      else await updateLeadDetails(fd({ leadId: t.leadId, assignmentId: t.assignmentId, values: JSON.stringify([{ key: field, value }]) }));
      done++;
    }
    return { ok: true, message: `Updated ${done}`, done };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Update failed." };
  }
}

export async function v2LogCall(t: Target, resolutionId: string, followUpAt: string, note: string): Promise<ActionResult> {
  try {
    await updateLeadResolutionInline(fd({ leadId: t.leadId, assignmentId: t.assignmentId, resolutionId, followUpAt, followUpNote: note }));
    return { ok: true, message: "Call logged" };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "Could not log the call." }; }
}

export async function v2AddNote(t: Target, note: string): Promise<ActionResult> {
  try { await createLeadNote(fd({ leadId: t.leadId, assignmentId: t.assignmentId, note })); return { ok: true, message: "Note saved" }; }
  catch (e) { return { ok: false, message: e instanceof Error ? e.message : "Could not save the note." }; }
}

/* ---------- Control Panel / Admin settings (new tables) ---------- */
export async function v2SaveBucket(resolutionId: string, bucket: string): Promise<ActionResult> {
  await requireAdmin(); const supabase = await createClient();
  const { error } = await supabase.from("crm_resolution_buckets").upsert({ resolution_id: resolutionId, bucket, updated_at: new Date().toISOString() });
  return error ? { ok: false, message: error.message } : { ok: true, message: "Bucket saved" };
}
export async function v2SaveHygieneRule(rule: { field_key: string; label: string; from_bucket: string; weight: number; is_active: boolean }): Promise<ActionResult> {
  await requireAdmin(); const supabase = await createClient();
  const { error } = await supabase.from("crm_hygiene_rules").upsert({ ...rule, updated_at: new Date().toISOString() });
  return error ? { ok: false, message: error.message } : { ok: true, message: "Hygiene rule saved" };
}
export async function v2SaveTarget(userId: string, patch: Partial<{ demos: number; references_per_week: number; ambassadors: number; calls_per_day: number; leads: number }>): Promise<ActionResult> {
  await requireAdmin(); const supabase = await createClient();
  const { error } = await supabase.from("crm_targets").upsert({ user_id: userId, ...patch, updated_at: new Date().toISOString() });
  return error ? { ok: false, message: error.message } : { ok: true, message: "Target saved" };
}

/* ---------- Share: email through the user's own SMTP with Excel / PDF attached ---------- */
export async function v2ShareEmail(input: { to: string; subject: string; text: string; attachments: { filename: string; base64: string; contentType: string }[] }): Promise<ActionResult> {
  const { userId } = await requireUser();
  const [settings, password] = await Promise.all([getUserSmtpSettings(userId), getUserSmtpPassword(userId)]);
  if (!settings || !password) return { ok: false, message: "Set up your email (SMTP) in Settings first." };
  const to = input.to.split(/[,;\s]+/).filter((x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x)).slice(0, 20);
  if (!to.length) return { ok: false, message: "Enter at least one valid email address." };
  const size = input.attachments.reduce((s, a) => s + a.base64.length, 0); if (size > 14_000_000) return { ok: false, message: "Attachments are too large (max ~10 MB)." };
  try {
    await createSmtpTransport({ host: settings.host, port: settings.port, username: settings.username, password }).sendMail({
      from: settings.from_name ? { name: settings.from_name, address: settings.from_email } : settings.from_email,
      to, subject: input.subject.slice(0, 200), text: input.text.slice(0, 20000),
      attachments: input.attachments.map((a) => ({ filename: a.filename, content: Buffer.from(a.base64, "base64"), contentType: a.contentType })),
    });
    return { ok: true, message: `Sent to ${to.join(", ")}` };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "Email failed." }; }
}

/* ---------- Admin Panel · Users (same read as app/dashboard/users/page.tsx, so the classic Add/Edit/Suspend/Delete user modals can be embedded here unchanged) ---------- */
export async function v2ListUsers(): Promise<{ users: ManagedUser[]; transferUsers: { id: string; name: string }[] }> {
  await requireAdmin();
  const admin = createAdminClient();
  const { data: authData, error: authError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (authError) throw new Error("Unable to load users.");
  const userIds = authData.users.map((u) => u.id);
  const [{ data: profiles }, { data: userRoles }] = await Promise.all([
    userIds.length ? admin.from("profiles").select("id, first_name, last_name, full_name, phone, is_suspended").in("id", userIds) : Promise.resolve({ data: [] }),
    userIds.length ? admin.from("user_roles").select("user_id, role").in("user_id", userIds) : Promise.resolve({ data: [] }),
  ]);
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
  const rolesByUserId = new Map<string, AppRole[]>();
  (userRoles ?? []).forEach((item) => { const existing = rolesByUserId.get(item.user_id) ?? []; existing.push(item.role as AppRole); rolesByUserId.set(item.user_id, existing); });
  const users: ManagedUser[] = authData.users.map((user) => {
    const profile = profileById.get(user.id);
    const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || profile?.full_name || user.email || "Unnamed user";
    return { id: user.id, name, firstName: profile?.first_name ?? "", lastName: profile?.last_name ?? "", email: user.email ?? "—", phone: profile?.phone ?? "—", roles: rolesByUserId.get(user.id) ?? [], isSuspended: profile?.is_suspended ?? false };
  });
  const transferUsers = users.filter((u) => !u.isSuspended && u.roles.some((r) => ["sales_executive", "sales_manager", "consultant"].includes(r))).map((u) => ({ id: u.id, name: u.name }));
  return { users, transferUsers };
}

/* ---------- Admin Panel · CRM Marketplace (same read as app/dashboard/crm-market-place/page.tsx) ---------- */
export async function v2ListMarketplace() {
  await requireAdmin();
  const admin = createAdminClient();
  const [{ data: apiKeys, error: apiKeysError }, { data: activityLogs, error: activityLogsError }] = await Promise.all([
    admin.from("crm_marketplace_api_keys").select("id, name, key_prefix, key_last4, subscriptions, is_active, created_at, last_used_at").order("created_at", { ascending: false }),
    admin.from("crm_marketplace_api_activity_logs").select("id, api_key_name, method, action, service, success, status_code, lead_id, created_at, lead:leads(lead_number, first_name, last_name)").order("created_at", { ascending: false }).limit(100),
  ]);
  return { apiKeys: apiKeys ?? [], databaseReady: !apiKeysError, apiActivityLogs: (activityLogs ?? []) as unknown as ApiActivityLog[], auditReady: !activityLogsError };
}

/* ---------- Admin Panel · Teams (same read as app/dashboard/team/page.tsx; writes go through the existing saveTeam action) ---------- */
export async function v2ListTeams() {
  await requireAdmin();
  const admin = createAdminClient();
  const [{ data: profiles }, { data: roles }, { data: teams, error: teamsError }, { data: memberships, error: membershipsError }] = await Promise.all([
    admin.from("profiles").select("id, first_name, last_name, full_name, is_suspended").order("full_name"),
    admin.from("user_roles").select("user_id, role"),
    admin.from("crm_teams").select("id, name, manager_id").order("name"),
    admin.from("crm_team_members").select("team_id, user_id"),
  ]);
  const people = (profiles ?? []).map((p) => ({
    id: p.id as string,
    name: [p.first_name, p.last_name].filter(Boolean).join(" ") || p.full_name || "Unnamed user",
    suspended: p.is_suspended ?? false,
    roles: (roles ?? []).filter((r) => r.user_id === p.id).map((r) => r.role as AppRole),
  }));
  const teamsOut = (teams ?? []).map((t) => ({
    id: t.id as string, name: t.name as string, managerId: t.manager_id as string,
    memberIds: (memberships ?? []).filter((m) => m.team_id === t.id).map((m) => m.user_id as string),
  }));
  return { people, teams: teamsOut, teamsReady: !teamsError && !membershipsError };
}

/** Reassign one person between teams (drag-and-drop on the Teams board) by replacing each affected team's full
 * member list — the exact same saveTeam action / save_crm_team RPC the classic Team page already uses. */
export async function v2MoveTeamMember(personId: string, fromTeamId: string | null, toTeamId: string | null): Promise<ActionResult> {
  await requireAdmin();
  if (fromTeamId === toTeamId) return { ok: true, message: "No change" };
  const admin = createAdminClient();
  const ids = [fromTeamId, toTeamId].filter((x): x is string => !!x);
  if (!ids.length) return { ok: true, message: "No change" };
  const [{ data: teams, error: teamsError }, { data: memberships }] = await Promise.all([
    admin.from("crm_teams").select("id, name, manager_id").in("id", ids),
    admin.from("crm_team_members").select("team_id, user_id").in("team_id", ids),
  ]);
  if (teamsError || !teams) return { ok: false, message: "Unable to load teams." };
  for (const teamId of ids) {
    const team = teams.find((t) => t.id === teamId);
    if (!team) continue;
    let members = (memberships ?? []).filter((m) => m.team_id === teamId).map((m) => m.user_id as string);
    if (teamId === fromTeamId) members = members.filter((id) => id !== personId);
    if (teamId === toTeamId && !members.includes(personId)) members = [...members, personId];
    const f = new FormData(); f.set("teamId", team.id); f.set("name", team.name); f.set("managerId", team.manager_id);
    members.forEach((id) => f.append("members", id));
    const r = await saveTeam({}, f);
    if (r.error) return { ok: false, message: r.error };
  }
  return { ok: true, message: "Moved" };
}

/* ---------- Control Panel · Lead Configuration / Columns / Products / Dropdowns
 * (same reads as app/dashboard/lead-settings/page.tsx, one per tab; writes go through each
 * classic component's own actions in app/dashboard/lead-settings/actions.ts, used unchanged) ---------- */
export async function v2LeadConfigDefaults() {
  await requireAdmin();
  const supabase = await createClient();
  const [{ data: priorities, error: prioritiesError }, { data: qualifiedRules, error: qualifiedRulesError }, { data: profiles }, { data: userRoles }, { data: products }, { data: weeklyTargets, error: weeklyTargetsError }, { data: schedule, error: scheduleError }] = await Promise.all([
    supabase.from("lead_database_priorities").select("database_key, label, priority").order("priority"),
    supabase.from("qualified_lead_distribution_members").select("user_id, weight, position").order("position"),
    supabase.from("profiles").select("id, first_name, last_name, full_name, is_suspended").eq("is_suspended", false).order("first_name"),
    supabase.from("user_roles").select("user_id, role").in("role", ["sales_executive", "sales_manager", "consultant"]),
    supabase.from("lead_products").select("id, code, name").order("code"),
    supabase.from("lead_round_robin_weekly_targets").select("user_id, product_id, day_of_week, target_count"),
    supabase.from("lead_round_robin_schedule").select("start_time, end_time, retry_interval_minutes").eq("id", 1).maybeSingle(),
  ]);
  const rolesByUser = new Map<string, string[]>();
  for (const role of userRoles ?? []) rolesByUser.set(role.user_id, [...(rolesByUser.get(role.user_id) ?? []), role.role]);
  const admin = createAdminClient();
  const [authResult, attendanceResult] = await Promise.all([admin.auth.admin.listUsers({ page: 1, perPage: 1000 }), getWmsAttendance().catch(() => null)]);
  const emailByUser = new Map((authResult.data?.users ?? []).map((u) => [u.id, u.email ?? ""]));
  const indiaParts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const today = `${indiaParts.find((p) => p.type === "year")?.value}-${indiaParts.find((p) => p.type === "month")?.value}-${indiaParts.find((p) => p.type === "day")?.value}`;
  const members = (profiles ?? []).filter((p) => rolesByUser.has(p.id)).map((p) => {
    const record = attendanceResult ? attendanceForEmail(attendanceResult, emailByUser.get(p.id) ?? "") : null;
    const availability = attendanceResult ? attendanceAvailability(record, today) : null;
    return { id: p.id as string, name: [p.first_name, p.last_name].filter(Boolean).join(" ") || p.full_name || "Unnamed user", roles: rolesByUser.get(p.id) ?? [], attendance: availability ? { status: (availability.available ? "present" : "absent") as "present" | "absent", punchInTime: record?.punchInTime ?? null } : { status: "unavailable" as const, punchInTime: null } };
  });
  return {
    priorities: priorities ?? [], prioritiesReady: !prioritiesError,
    qualifiedRules: qualifiedRules ?? [], qualifiedRulesReady: !qualifiedRulesError,
    members, products: products ?? [],
    weeklyTargets: weeklyTargets ?? [], weeklyTargetsReady: !weeklyTargetsError,
    schedule: schedule ?? { start_time: "10:30", end_time: "15:00", retry_interval_minutes: 15 }, scheduleReady: !scheduleError,
  };
}

export async function v2LeadColumns() {
  await requireAdmin();
  const supabase = await createClient();
  const { data: columns, error } = await supabase.from("lead_table_columns").select("id, field_key, label, source, field_type, options, is_required, is_visible, position, computed_from").order("position");
  if (error) return { ready: false, columns: [] };
  return { ready: true, columns: withoutDuplicateSystemColumns(columns ?? []) };
}

export async function v2LeadProducts() {
  await requireAdmin();
  const supabase = await createClient();
  const [{ data: products, error }, { data: stages }, { data: resolutions }, { data: mappings }] = await Promise.all([
    supabase.from("lead_products").select("id, code, name").order("code"),
    supabase.from("lead_stages").select("id, product_id, name, position").order("position"),
    supabase.from("lead_resolutions").select("id, name"),
    supabase.from("lead_product_resolutions").select("id, product_id, resolution_id, next_stage_id, requires_follow_up, follow_up_after_hours, closes_lead"),
  ]);
  if (error) return { ready: false, products: [], stages: [], resolutions: [] };
  const resolutionNames = new Map((resolutions ?? []).map((r) => [r.id, r.name]));
  const productResolutions = (mappings ?? []).map((m) => ({ ...m, resolution_name: resolutionNames.get(m.resolution_id) ?? "Unknown resolution" }));
  return { ready: true, products: products ?? [], stages: stages ?? [], resolutions: productResolutions };
}

export async function v2LeadDropdowns() {
  await requireAdmin();
  const supabase = await createClient();
  const [{ data: products }, { data: stages }, { data: dropdownRows, error: dropdownRowsError }, { data: optionRows, error: optionRowsError }] = await Promise.all([
    supabase.from("lead_products").select("id, code, name").order("code"),
    supabase.from("lead_stages").select("id, product_id, name, position").order("position"),
    supabase.from("lead_stage_dropdowns").select("id, product_id, stage_id, label, position").order("position"),
    supabase.from("lead_stage_dropdown_options").select("id, dropdown_id, label, position").order("position"),
  ]);
  if (dropdownRowsError || optionRowsError) return { ready: false, products: products ?? [], stages: stages ?? [], dropdowns: [] };
  const dropdowns = (dropdownRows ?? []).map((d) => ({ ...d, options: (optionRows ?? []).filter((o) => o.dropdown_id === d.id) }));
  return { ready: true, products: products ?? [], stages: stages ?? [], dropdowns };
}

/* ---------- Channel Partner (Ambassador multi-select) — reads for the ChannelPartnerSelect widget embedded in LeadWindow; saving goes through the existing saveLeadChannelPartners action, used unchanged ---------- */
export async function v2LeadChannelPartners(leadId: string): Promise<{ ids: string[]; names: string }> {
  await requireUser();
  const supabase = await createClient();
  const { data: partners } = await supabase.from("lead_channel_partners").select("ambassador_id").eq("lead_id", leadId);
  const ids = [...new Set((partners ?? []).map((r) => String(r.ambassador_id)))];
  if (!ids.length) return { ids: [], names: "" };
  const { data: profiles } = await supabase.from("profiles").select("id, first_name, last_name, full_name").in("id", ids);
  const nameById = new Map((profiles ?? []).map((p) => [p.id, [p.first_name, p.last_name].filter(Boolean).join(" ") || p.full_name || "Ambassador"]));
  return { ids, names: ids.map((id) => nameById.get(id) ?? "Ambassador").join(", ") };
}

/* ---------- Add lead (uses the existing createManualLead: duplicate checks, round robin, notifications) ---------- */
export async function v2CreateLead(input: { firstName: string; lastName: string; phone: string; email: string; productIds: string[] }): Promise<ActionResult> {
  const f = new FormData(); f.set("firstName", input.firstName); f.set("lastName", input.lastName); f.set("phone", input.phone); f.set("email", input.email); input.productIds.forEach((p) => f.append("productId", p));
  try { const r = await createManualLead(f); return r && typeof r === "object" && "ok" in r ? { ok: Boolean(r.ok), message: String((r as { message?: string }).message ?? "Saved") } : { ok: true, message: "Lead added" }; }
  catch (e) { return { ok: false, message: e instanceof Error ? e.message : "Could not add the lead." }; }
}
