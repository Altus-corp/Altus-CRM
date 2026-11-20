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
