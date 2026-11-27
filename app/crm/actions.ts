"use server";
// Altus CRM v2 — thin wrappers. Lead writes call the EXISTING actions so every rule, trigger,
// notification and activity log of the current CRM keeps working unchanged.
import { requireAdmin, requireUser } from "@/app/lib/auth";
import { createClient } from "@/app/lib/supabase/server";
import { createAdminClient } from "@/app/lib/supabase/admin";
import { createSmtpTransport, getUserSmtpPassword, getUserSmtpSettings } from "@/app/lib/smtp-settings";
import type { AppRole } from "@/app/lib/roles";
import {
  addProductToLeadDetails,
  claimUnassignedLeadAssignment,
  createLeadNote,
  createLeadNoteWithAttachment,
  createLeadProposal,
  createManualLead,
  logLeadProposalWhatsAppShare,
  manuallyAssignLeads,
  createLeadContact,
  sendLeadProposalEmail,
  setLeadProposalApproval,
  syncLeadCallTranscripts,
  updateLeadBantField,
  updateLeadDetails,
  updateLeadFollowUp,
  updateLeadResolutionInline,
  updateLeadStageInline,
} from "@/app/dashboard/leads/actions";
import type { ManagedUser } from "@/app/dashboard/users/users-table";
import type { ApiActivityLog } from "@/components/marketplace/leads-management-api";
import { saveTeam } from "@/app/dashboard/team/actions";
import { createOwnAmbassador } from "@/app/dashboard/my-ambassador/actions";
import { attendanceAvailability, attendanceForEmail, getWmsAttendance } from "@/app/lib/wms-attendance";
import { withoutDuplicateSystemColumns } from "@/app/lib/lead-shared-config";
import { loadWorkspace } from "@/app/lib/crm2/workspace";
import { getSalesManagerTeamMemberIds } from "@/app/lib/sales-manager-team";

type Target = { leadId: string; assignmentId: string };
export type ActionResult = { ok: boolean; message: string; done?: number };
const fd = (o: Record<string, string>) => { const f = new FormData(); Object.entries(o).forEach(([k, v]) => f.set(k, v)); return f; };

export async function refreshWorkspace() {
  const user = await requireUser();
  return loadWorkspace(user);
}

export async function v2ChangeLeadType(leadId: string, leadType: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!user.roles.includes("admin")) return { ok: false, message: "Only an admin can change the lead type." };
  if (!["reference_leads", "qualified_leads", "database_leads", "leads"].includes(leadType)) return { ok: false, message: "Choose a valid lead type." };
  const { data, error } = await createAdminClient().from("leads").update({ lead_database: leadType }).eq("id", leadId).select("id").maybeSingle();
  if (error || !data) return { ok: false, message: error?.message ?? "Lead not found." };
  return { ok: true, message: "Lead type updated." };
}

async function productScope() {
  const user = await requireUser();
  const admin = user.roles.includes("admin");
  const owners = [user.userId, ...(user.roles.includes("sales_manager") ? await getSalesManagerTeamMemberIds(user.userId) : [])];
  return { user, admin, owners };
}

export async function v2LeadProductAssignments(leadId: string) {
  const { admin, owners } = await productScope();
  const db = createAdminClient();
  if (!admin) {
    const { data, error } = await db.from("lead_product_assignments").select("id").eq("lead_id", leadId).eq("is_active", true).in("assigned_to", owners).limit(1);
    if (error || !data?.length) throw new Error("You cannot access this lead.");
  }
  const { data, error } = await db.from("lead_product_assignments").select("id, product_id, stage_id, latest_resolution_id, assigned_to, is_ambassador, product:lead_products(code, name), stage:lead_stages(name), resolution:lead_resolutions(name)").eq("lead_id", leadId).eq("is_active", true);
  if (error) throw new Error("Unable to load products.");
  return (data ?? []).map((raw) => {
    const x = raw as unknown as { id: string; product_id: string; assigned_to: string | null; is_ambassador: boolean; product: { code: string; name: string } | null; stage: { name: string } | null; resolution: { name: string } | null };
    return { id: x.id, productId: x.product_id, code: x.product?.code ?? "", name: x.product?.name ?? "", stage: x.stage?.name ?? "", resolution: x.resolution?.name ?? "", owner: x.assigned_to, canRemove: admin || !!x.assigned_to && owners.includes(x.assigned_to), isAmbassador: x.is_ambassador };
  });
}

export async function v2RemoveProduct(leadId: string, assignmentId: string): Promise<ActionResult> {
  try {
    const { user, admin, owners } = await productScope();
    const { error } = await createAdminClient().rpc("crm_remove_product", { p_lead: leadId, p_assignment: assignmentId, p_actor: user.userId, p_allowed_owners: owners, p_admin: admin });
    if (error) throw new Error(error.message);
    return { ok: true, message: "Product removed. Its history is preserved." };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "Unable to remove product." }; }
}

export async function v2SelectLeadProducts(leadId: string, assignmentId: string, expected: string[], selected: string[]): Promise<ActionResult> {
  try {
    const { user, admin, owners } = await productScope();
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (![leadId, assignmentId, ...expected, ...selected].every((id) => uuid.test(id)) || expected.length > 100 || selected.length > 100) return { ok: false, message: "Invalid product selection." };
    const { error } = await createAdminClient().rpc("crm_select_products", { p_lead: leadId, p_source: assignmentId, p_actor: user.userId, p_allowed_owners: owners, p_admin: admin, p_expected: expected, p_selected: selected });
    if (error) throw new Error(error.message);
    return { ok: true, message: "Products updated." };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "Unable to update products." }; }
}

/** Change one field on many rows. Fields map 1:1 to existing actions.
 * `extra` only applies to the "resolutionId" field — it carries the follow-up date/note the caller
 * collected (e.g. via a prompt for resolutions like "Follow up"/"Verbal Yes" that require them). */
export async function v2UpdateField(targets: Target[], field: string, value: string, extra?: { followUpAt?: string; followUpNote?: string }): Promise<ActionResult> {
  await requireUser();
  if (!targets.length) return { ok: false, message: "Nothing selected." };
  try {
    if (field === "owner") {
      for (let i = 0; i < targets.length; i += 100) { const f = new FormData(); f.set("assigneeId", value); targets.slice(i, i + 100).forEach((t) => f.append("assignmentId", t.assignmentId)); await manuallyAssignLeads(f); }
      return { ok: true, message: `Reassigned ${targets.length}`, done: targets.length };
    }
    let done = 0;
    for (const t of targets) {
      if (field === "resolutionId") await updateLeadResolutionInline(fd({ leadId: t.leadId, assignmentId: t.assignmentId, resolutionId: value, followUpAt: extra?.followUpAt ?? "", followUpNote: extra?.followUpNote ?? "" }));
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

/** Add an extra product to leads that already have other product work, keeping their existing products,
 * stage history and owner untouched — same action the classic Lead Details "Add product" uses. Skips (rather
 * than fails) a lead that already has that product, since addProductToLeadDetails rejects duplicates. */
export async function v2AddProduct(targets: Target[], productId: string): Promise<ActionResult> {
  await requireUser();
  if (!targets.length) return { ok: false, message: "Nothing selected." };
  let added = 0; let skipped = 0; let lastError = "";
  for (const t of targets) {
    try {
      await addProductToLeadDetails(fd({ leadId: t.leadId, sourceAssignmentId: t.assignmentId, productId }));
      added++;
    } catch (e) {
      skipped++;
      lastError = e instanceof Error ? e.message : "Unable to add product.";
    }
  }
  return { ok: added > 0 || !skipped, message: skipped ? `${added ? `Added to ${added}. ` : ""}${lastError}` : `Added to ${added}`, done: added };
}

/** Claim an unassigned lead from Global Search — assigneeId defaults to the caller themselves. */
export async function v2ClaimLead(assignmentId: string, assigneeId?: string): Promise<ActionResult> {
  try {
    const r = await claimUnassignedLeadAssignment(fd({ assignmentId, ...(assigneeId ? { assigneeId } : {}) }));
    return { ok: true, message: r?.message ?? "Assigned." };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Unable to assign this lead." };
  }
}

export async function v2LogCall(t: Target, resolutionId: string, followUpAt: string, note: string): Promise<ActionResult> {
  try {
    await updateLeadResolutionInline(fd({ leadId: t.leadId, assignmentId: t.assignmentId, resolutionId, followUpAt, followUpNote: note }));
    return { ok: true, message: "Call logged" };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "Could not log the call." }; }
}

/** Refresh this lead's call activity/transcripts from Altus Contacts — matched by the lead's phone number, so
 * a call placed by anyone (not just the viewer) still ends up attached here. */
export async function v2SyncLeadCalls(t: Target): Promise<ActionResult> {
  try {
    const r = await syncLeadCallTranscripts(fd({ leadId: t.leadId, assignmentId: t.assignmentId }));
    return { ok: r.ok, message: r.message };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "Could not sync calls." }; }
}

export async function v2UpdateBant(t: Target, field: "b" | "a" | "n" | "t", value: string, detail = ""): Promise<ActionResult> {
  try {
    await updateLeadBantField(fd({ leadId: t.leadId, assignmentId: t.assignmentId, field, value, detail }));
    return { ok: true, message: "BANT updated" };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "Could not update BANT." }; }
}

/** Confirmed authority asks for the decision maker's details and records them as a Secondary Contact
 * on this lead, same as the Add Contact tab. */
export async function v2AddDecisionMakerContact(t: Target, contact: { firstName: string; lastName: string; phone: string; email: string }): Promise<ActionResult> {
  // Tag the contact's Designation as "Decision Maker" so it stands out in Add Contact — but only when
  // that's already a configured option on this workspace's Designation dropdown; createLeadContact
  // rejects any designation value that isn't one of the dropdown's configured options.
  const admin = createAdminClient();
  const { data: dropdowns } = await admin.from("lead_table_columns").select("label, options").eq("source", "custom").eq("field_type", "dropdown");
  const designationColumn = (dropdowns ?? []).find((c) => c.label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "") === "designation");
  const designation = Array.isArray(designationColumn?.options) && designationColumn.options.includes("Decision Maker") ? "Decision Maker" : "";
  const r = await createLeadContact(fd({ leadId: t.leadId, assignmentId: t.assignmentId, firstName: contact.firstName, lastName: contact.lastName, phone: contact.phone, email: contact.email, designation, contactType: "secondary" }));
  return { ok: r.ok, message: r.ok ? "Decision maker added to Add Contact as a Secondary Contact." : r.message };
}

export async function v2AddNote(t: Target, note: string): Promise<ActionResult> {
  try { await createLeadNote(fd({ leadId: t.leadId, assignmentId: t.assignmentId, note })); return { ok: true, message: "Note saved" }; }
  catch (e) { return { ok: false, message: e instanceof Error ? e.message : "Could not save the note." }; }
}

export async function v2AddAttachment(t: Target, file: { url: string; name: string; mime: string; size: number } | null, note: string): Promise<ActionResult> {
  const f = new FormData(); f.set("leadId", t.leadId); f.set("assignmentId", t.assignmentId); f.set("note", note);
  if (file) { f.set("attachmentUrl", file.url); f.set("attachmentName", file.name); f.set("attachmentMime", file.mime); f.set("attachmentSize", String(file.size)); }
  return createLeadNoteWithAttachment(f);
}

/* ---------- Proposals: upload / approve (admin only) / send ---------- */
export async function v2CreateProposal(t: Target, file: { url: string; name: string; mime: string; size: number }, details: string): Promise<ActionResult> {
  return createLeadProposal(fd({ leadId: t.leadId, assignmentId: t.assignmentId, fileUrl: file.url, fileName: file.name, fileMime: file.mime, fileSize: String(file.size), details }));
}
export async function v2SetProposalApproval(proposalId: string, approved: boolean): Promise<ActionResult> {
  return setLeadProposalApproval(fd({ proposalId, approved: String(approved) }));
}
export async function v2SendProposalEmail(t: Target, proposalId: string, emails: string[]): Promise<ActionResult> {
  const f = new FormData(); f.set("leadId", t.leadId); f.set("assignmentId", t.assignmentId); f.set("proposalId", proposalId); emails.forEach((e) => f.append("email", e));
  return sendLeadProposalEmail(f);
}
export async function v2LogProposalWhatsAppShare(t: Target, proposalId: string, contactLabel: string): Promise<ActionResult> {
  return logLeadProposalWhatsAppShare(fd({ leadId: t.leadId, assignmentId: t.assignmentId, proposalId, contactLabel }));
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
export async function v2SaveTarget(userId: string, patch: Partial<{ demos: number; references_per_week: number; ambassadors: number; calls_per_day: number; leads: number; meetings: number; focused_calls: number; product_targets: Record<string, number> }>): Promise<ActionResult> {
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
export type V2ManagedUser = ManagedUser & { salesPersonId: string | null; salesPersonName: string | null; ambassadorNames: string[] };
export async function v2ListUsers(): Promise<{ users: V2ManagedUser[]; transferUsers: { id: string; name: string }[] }> {
  await requireAdmin();
  const admin = createAdminClient();
  const { data: authData, error: authError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (authError) throw new Error("Unable to load users.");
  const userIds = authData.users.map((u) => u.id);
  const [{ data: profiles }, { data: userRoles }, { data: relManagers }] = await Promise.all([
    userIds.length ? admin.from("profiles").select("id, first_name, last_name, full_name, phone, is_suspended").in("id", userIds) : Promise.resolve({ data: [] }),
    userIds.length ? admin.from("user_roles").select("user_id, role").in("user_id", userIds) : Promise.resolve({ data: [] }),
    // Which CRM sales person is the relationship manager for an Ambassador — same table the "Ambassador Accounts"/"My Ambassador" reads use.
    userIds.length ? admin.from("ambassador_relationship_managers").select("ambassador_id, crm_user_id").in("ambassador_id", userIds) : Promise.resolve({ data: [] }),
  ]);
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
  const rolesByUserId = new Map<string, AppRole[]>();
  (userRoles ?? []).forEach((item) => { const existing = rolesByUserId.get(item.user_id) ?? []; existing.push(item.role as AppRole); rolesByUserId.set(item.user_id, existing); });
  const salesPersonByAmbassador = new Map((relManagers ?? []).map((r) => [r.ambassador_id as string, r.crm_user_id as string]));
  const ambassadorIdsByCrmUser = new Map<string, string[]>();
  (relManagers ?? []).forEach((r) => { const list = ambassadorIdsByCrmUser.get(r.crm_user_id as string) ?? []; list.push(r.ambassador_id as string); ambassadorIdsByCrmUser.set(r.crm_user_id as string, list); });
  const users: ManagedUser[] = authData.users.map((user) => {
    const profile = profileById.get(user.id);
    const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || profile?.full_name || user.email || "Unnamed user";
    return { id: user.id, name, firstName: profile?.first_name ?? "", lastName: profile?.last_name ?? "", email: user.email ?? "—", phone: profile?.phone ?? "—", roles: rolesByUserId.get(user.id) ?? [], isSuspended: profile?.is_suspended ?? false };
  });
  const nameById = new Map(users.map((u) => [u.id, u.name]));
  const usersOut: V2ManagedUser[] = users.map((u) => {
    const spId = u.roles.includes("ambassador") ? salesPersonByAmbassador.get(u.id) ?? null : null;
    const ambassadorNames = (ambassadorIdsByCrmUser.get(u.id) ?? []).map((id) => nameById.get(id) ?? "Unknown").sort();
    return { ...u, salesPersonId: spId, salesPersonName: spId ? nameById.get(spId) ?? "Unknown" : null, ambassadorNames };
  });
  const transferUsers = users.filter((u) => !u.isSuspended && u.roles.some((r) => ["sales_executive", "sales_manager", "consultant"].includes(r))).map((u) => ({ id: u.id, name: u.name }));
  return { users: usersOut, transferUsers };
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

/** An Ambassador is also a lead, but it needs more than a plain lead insert — Pre Sales/Onboarding
 * stage routing, is_ambassador, and moving any prior product work off the same phone number — so
 * this routes to the exact same createOwnAmbassador() the dedicated Add Ambassador modal uses,
 * rather than createManualLead (which deliberately refuses the AMBASSADOR product). */
export async function v2CreateAmbassadorLead(input: { firstName: string; lastName: string; phone: string; email: string }): Promise<ActionResult> {
  return createOwnAmbassador({ firstName: input.firstName, lastName: input.lastName, cellNumber: input.phone, email: input.email, salesPersonId: "" });
}
