"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireUser } from "@/app/lib/auth";
import { createClient } from "@/app/lib/supabase/server";
import { createAdminClient } from "@/app/lib/supabase/admin";
import { sendLeadMeetingInvitation } from "@/app/lib/email";
import { createZoomMeeting } from "@/app/lib/zoom";

type ImportResult = { ok: boolean; message: string; imported?: number; skipped?: number };

function normalizeHeader(value: string) {
  return value.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"' && quoted && text[index + 1] === '"') { field += '"'; index += 1; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (char === "," && !quoted) { row.push(field.trim()); field = ""; continue; }
    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = []; field = ""; continue;
    }
    field += char;
  }
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

export async function importLeadsCsv(formData: FormData): Promise<ImportResult> {
  const { userId } = await requireAdmin();
  const file = formData.get("file");
  const leadDatabase = String(formData.get("leadDatabase") ?? "");
  const allowedDatabases = ["leads", "reference_leads", "qualified_leads", "database_leads"];
  if (!(file instanceof File) || !file.size) return { ok: false, message: "Choose a CSV file to import." };
  if (!allowedDatabases.includes(leadDatabase)) return { ok: false, message: "Choose the database category for these leads." };
  if (file.size > 1024 * 1024) return { ok: false, message: "This first importer supports CSV files up to 1 MB. Use smaller batches for now." };

  const rows = parseCsv(await file.text());
  if (rows.length < 2) return { ok: false, message: "The CSV needs a header row and at least one lead." };
  const headers = rows[0].map(normalizeHeader);
  const supabase = await createClient();
  const [{ data: products }, { data: stages }, { data: resolutions }, { data: mappings }, { data: tableColumns }] = await Promise.all([
    supabase.from("lead_products").select("id, code"),
    supabase.from("lead_stages").select("id, product_id, name"),
    supabase.from("lead_resolutions").select("id, name"),
    supabase.from("lead_product_resolutions").select("product_id, resolution_id"),
    supabase.from("lead_table_columns").select("field_key, label, source, computed_from"),
  ]);
  const productsByCode = new Map((products ?? []).map((product) => [product.code.toLowerCase(), product]));
  const stagesByKey = new Map((stages ?? []).map((stage) => [`${stage.product_id}:${stage.name.toLowerCase()}`, stage.id]));
  const resolutionByName = new Map((resolutions ?? []).map((resolution) => [resolution.name.toLowerCase(), resolution.id]));
  const mappingKeys = new Set((mappings ?? []).map((mapping) => `${mapping.product_id}:${mapping.resolution_id}`));
  const importableColumns = (tableColumns ?? []).filter((column) => !column.computed_from?.length);
  const configuredFieldsByHeader = new Map(importableColumns.map((column) => [normalizeHeader(column.label), column.field_key]));
  const customColumnsByHeader = new Map(importableColumns.filter((column) => column.source === "custom").map((column) => [normalizeHeader(column.label), column.field_key]));
  const headerFields = headers.map((header) => configuredFieldsByHeader.get(header) ?? header);
  const fieldAt = (record: string[], ...aliases: string[]) => {
    const index = aliases.map(normalizeHeader).map((alias) => {
      const configuredIndex = headerFields.indexOf(alias);
      return configuredIndex >= 0 ? configuredIndex : headers.indexOf(alias);
    }).find((item) => item >= 0) ?? -1;
    return index >= 0 ? (record[index] ?? "").trim() : "";
  };
  const knownHeaders = new Set(["lead_name", "first_name", "first", "name", "last_name", "last", "email", "phone", "phone_number", "product", "product_code", "stage", "call_resolution", "resolution"]);
  const records: Record<string, unknown>[] = [];
  let skipped = 0;

  for (const record of rows.slice(1)) {
    const firstName = fieldAt(record, "first name", "first_name", "first", "name", "lead_name");
    const productCode = fieldAt(record, "product", "product code", "product_code").toLowerCase();
    const product = productsByCode.get(productCode);
    if (!firstName || !product) { skipped += 1; continue; }
    const stageName = fieldAt(record, "stage").toLowerCase();
    const resolutionName = fieldAt(record, "call resolution", "resolution").toLowerCase();
    const resolutionId = resolutionByName.get(resolutionName) ?? null;
    const customData: Record<string, string> = {};
    headers.forEach((header, index) => { const key = customColumnsByHeader.get(header); if (key && !knownHeaders.has(headerFields[index]) && !knownHeaders.has(header) && record[index]?.trim()) customData[key] = record[index].trim(); });
    records.push({ product_id: product.id, stage_id: stagesByKey.get(`${product.id}:${stageName}`) ?? null, latest_resolution_id: resolutionId && mappingKeys.has(`${product.id}:${resolutionId}`) ? resolutionId : null, first_name: firstName, last_name: fieldAt(record, "last name", "last_name", "last") || null, email: fieldAt(record, "email") || null, phone: fieldAt(record, "phone", "phone number", "phone_number") || null, custom_data: customData, created_by: userId, lead_database: leadDatabase });
  }
  if (!records.length) return { ok: false, message: "No valid rows found. Each row needs First Name and a valid Product code (PSO, BSSO, or PS).", skipped };
  for (let index = 0; index < records.length; index += 200) {
    const { data: insertedLeads, error } = await supabase.from("leads").insert(records.slice(index, index + 200)).select("id");
    if (error) return { ok: false, message: error.message, imported: index, skipped };
    if (insertedLeads?.length) {
      const { error: activityError } = await supabase.from("lead_activities").insert(insertedLeads.map((lead) => ({
        lead_id: lead.id,
        activity_type: "lead_created",
        note: "Lead imported to CRM.",
        metadata: { source: "csv_import", lead_database: leadDatabase },
        created_by: userId,
      })));
      if (activityError) return { ok: false, message: activityError.message, imported: index, skipped };
    }
  }
  revalidatePath("/dashboard/leads");
  return { ok: true, message: "Leads imported successfully.", imported: records.length, skipped };
}

export async function manuallyAssignLeads(formData: FormData) {
  const { userId } = await requireAdmin();
  const assigneeId = String(formData.get("assigneeId") ?? "");
  const leadIds = [...new Set(formData.getAll("leadId").map(String).filter(Boolean))];
  if (!assigneeId || !leadIds.length || leadIds.length > 100) throw new Error("Choose a user and one or more leads to assign.");

  const supabase = await createClient();
  const [{ data: profile, error: profileError }, { data: roles, error: rolesError }] = await Promise.all([
    supabase.from("profiles").select("id, is_suspended, first_name, last_name, full_name").eq("id", assigneeId).single(),
    supabase.from("user_roles").select("role").eq("user_id", assigneeId).in("role", ["sales_executive", "sales_manager", "consultant"]),
  ]);
  if (profileError || !profile || profile.is_suspended || rolesError || !roles?.length) throw new Error("Choose an active eligible sales user.");

  const { error } = await supabase.from("leads").update({ assigned_to: assigneeId, assigned_at: new Date().toISOString() }).in("id", leadIds);
  if (error) throw new Error(error.message);
  const assigneeName = profile.full_name || [profile.first_name, profile.last_name].filter(Boolean).join(" ") || "a sales user";
  const { error: activityError } = await supabase.from("lead_activities").insert(leadIds.map((leadId) => ({
    lead_id: leadId,
    activity_type: "assigned",
    note: `Lead assigned to ${assigneeName}.`,
    metadata: { assigned_to: assigneeId, assigned_to_name: assigneeName },
    created_by: userId,
  })));
  if (activityError) throw new Error(activityError.message);
  revalidatePath("/dashboard/leads");
}

async function getEditableLead(leadId: string) {
  const user = await requireUser();
  if (!user.roles.includes("admin") && !user.roles.some((role) => role === "sales_executive" || role === "sales_manager")) throw new Error("You do not have permission to update leads.");
  const supabase = createAdminClient();
  const { data: lead, error } = await supabase.from("leads").select("id, product_id, assigned_to").eq("id", leadId).single();
  if (error || !lead) throw new Error("This lead is no longer available to update.");
  if (!user.roles.includes("admin") && lead.assigned_to !== user.userId) throw new Error("You can update only leads assigned to you.");
  return { supabase, lead, userId: user.userId };
}

export async function createLeadActivity(formData: FormData) {
  const leadId = String(formData.get("leadId") ?? "");
  const activityType = String(formData.get("activityType") ?? "").trim();
  const allowedActivityTypes = ["call", "video_call", "offline_meeting", "whatsapp_message", "online_demo", "offline_demo", "linkedin", "online_meeting", "email"];
  if (!leadId || !allowedActivityTypes.includes(activityType)) throw new Error("Choose a valid activity.");
  const { supabase, userId } = await getEditableLead(leadId);
  const { error } = await supabase.from("lead_activities").insert({ lead_id: leadId, activity_type: activityType, note: `Recorded ${activityType.replaceAll("_", " ")}.`, created_by: userId });
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/leads");
}

export async function createLeadNote(formData: FormData) {
  const leadId = String(formData.get("leadId") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (!leadId || !note || note.length > 2000) throw new Error("Write a note of up to 2,000 characters.");
  const { supabase, userId } = await getEditableLead(leadId);
  const { error } = await supabase.from("lead_activities").insert({ lead_id: leadId, activity_type: "note", note, created_by: userId });
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/leads");
}

export async function updateLeadDetails(formData: FormData) {
  const leadId = String(formData.get("leadId") ?? "");
  const rawValues = String(formData.get("values") ?? "");
  if (!leadId) throw new Error("Lead is required.");
  let values: { key?: unknown; label?: unknown; value?: unknown }[];
  try { values = JSON.parse(rawValues); } catch { throw new Error("Invalid lead details."); }
  if (!Array.isArray(values) || values.length > 100) throw new Error("Invalid lead details.");

  const { supabase, userId } = await getEditableLead(leadId);
  const [{ data: lead, error: leadError }, { data: columns, error: columnsError }] = await Promise.all([
    supabase.from("leads").select("first_name, custom_data").eq("id", leadId).single(),
    supabase.from("lead_table_columns").select("field_key, label, source, computed_from"),
  ]);
  if (leadError || !lead) throw new Error("This lead is no longer available.");
  if (columnsError || !columns) throw new Error("Lead fields are unavailable.");

  const configured = new Map(columns.map((column) => [column.field_key, column]));
  const customData = { ...(lead.custom_data ?? {}) } as Record<string, string>;
  const update: Record<string, unknown> = { custom_data: customData };
  const updatedFields: string[] = [];
  for (const input of values) {
    const key = typeof input.key === "string" ? input.key : "";
    const value = typeof input.value === "string" ? input.value.trim() : "";
    const column = configured.get(key);
    if (!column || column.computed_from?.length) continue;
    const normalizedLabel = column.label.toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (key === "lead_name" || key === "first_name" || normalizedLabel === "firstname") { update.first_name = value; updatedFields.push(column.label); }
    else if (key === "last_name" || normalizedLabel === "lastname") { update.last_name = value || null; updatedFields.push(column.label); }
    else if (key === "email") { update.email = value || null; updatedFields.push(column.label); }
    else if (key === "phone") { update.phone = value || null; updatedFields.push(column.label); }
    else if (column.source === "custom") { customData[key] = value; updatedFields.push(column.label); }
  }
  if ("first_name" in update && !update.first_name) throw new Error("First name is required.");
  const { error } = await supabase.from("leads").update(update).eq("id", leadId);
  if (error) throw new Error(error.message);
  if (updatedFields.length) {
    const { error: activityError } = await supabase.from("lead_activities").insert({ lead_id: leadId, activity_type: "details_updated", note: `Updated ${updatedFields.join(", ")}.`, metadata: { fields: updatedFields }, created_by: userId });
    if (activityError) throw new Error(activityError.message);
  }
  revalidatePath("/dashboard/leads");
}

export async function updateLeadProductInline(formData: FormData) {
  const leadId = String(formData.get("leadId") ?? "");
  const productId = String(formData.get("productId") ?? "");
  if (!leadId || !productId) throw new Error("A lead and product are required.");
  const { supabase, userId } = await getEditableLead(leadId);
  const { data: product, error: productError } = await supabase.from("lead_products").select("id, code, name").eq("id", productId).eq("is_active", true).single();
  if (productError || !product) throw new Error("Choose an active product.");
  const { error } = await supabase.from("leads").update({ product_id: productId, stage_id: null, latest_resolution_id: null }).eq("id", leadId);
  if (error) throw new Error(error.message);
  const { error: activityError } = await supabase.from("lead_activities").insert({ lead_id: leadId, activity_type: "product_updated", note: `Product changed to ${product.code || product.name}.`, metadata: { product_id: product.id }, created_by: userId });
  if (activityError) throw new Error(activityError.message);
  revalidatePath("/dashboard/leads");
}

export async function updateLeadStageInline(formData: FormData) {
  const leadId = String(formData.get("leadId") ?? "");
  const stageId = String(formData.get("stageId") ?? "");
  if (!leadId || !stageId) throw new Error("A lead and stage are required.");
  const { supabase, lead, userId } = await getEditableLead(leadId);
  const { data: stage, error: stageError } = await supabase.from("lead_stages").select("id, name").eq("id", stageId).eq("product_id", lead.product_id).eq("is_active", true).single();
  if (stageError || !stage) throw new Error("Choose a stage for this lead's product.");
  const { error } = await supabase.from("leads").update({ stage_id: stageId }).eq("id", leadId);
  if (error) throw new Error(error.message);
  const { error: activityError } = await supabase.from("lead_activities").insert({ lead_id: leadId, activity_type: "stage_updated", note: `Stage changed to ${stage.name}.`, metadata: { stage_id: stage.id }, created_by: userId });
  if (activityError) throw new Error(activityError.message);
  revalidatePath("/dashboard/leads");
}

export async function updateLeadResolutionInline(formData: FormData) {
  const leadId = String(formData.get("leadId") ?? "");
  const resolutionId = String(formData.get("resolutionId") ?? "");
  const followUpAt = String(formData.get("followUpAt") ?? "");
  if (!leadId || !resolutionId) throw new Error("A lead and call resolution are required.");
  const followUpDate = followUpAt ? new Date(followUpAt) : null;
  if (followUpAt && (!followUpDate || Number.isNaN(followUpDate.getTime()))) throw new Error("Choose a valid follow-up date and time.");
  const { supabase, lead, userId } = await getEditableLead(leadId);
  const { data: mapping, error: mappingError } = await supabase.from("lead_product_resolutions").select("id").eq("product_id", lead.product_id).eq("resolution_id", resolutionId).maybeSingle();
  if (mappingError || !mapping) throw new Error("Choose a call resolution for this lead's product.");
  const update: { latest_resolution_id: string; next_follow_up_at?: string } = { latest_resolution_id: resolutionId };
  if (followUpDate) update.next_follow_up_at = followUpDate.toISOString();
  const { error } = await supabase.from("leads").update(update).eq("id", leadId);
  if (error) throw new Error(error.message);
  const { data: resolution } = await supabase.from("lead_resolutions").select("name").eq("id", resolutionId).single();
  const resolutionName = resolution?.name ?? "selected resolution";
  const { error: activityError } = await supabase.from("lead_activities").insert({ lead_id: leadId, activity_type: "resolution_updated", note: `Call resolution set to ${resolutionName}.`, metadata: { resolution_id: resolutionId }, created_by: userId });
  if (activityError) throw new Error(activityError.message);
  if (followUpDate) {
    const { error: followUpActivityError } = await supabase.from("lead_activities").insert({ lead_id: leadId, activity_type: "follow_up_scheduled", note: "Follow-up scheduled.", follow_up_at: followUpDate.toISOString(), created_by: userId });
    if (followUpActivityError) throw new Error(followUpActivityError.message);
  }
  revalidatePath("/dashboard/leads");
}

export async function updateLeadFollowUp(formData: FormData) {
  const leadId = String(formData.get("leadId") ?? "");
  const followUpAt = String(formData.get("followUpAt") ?? "");
  const followUpDate = followUpAt ? new Date(followUpAt) : null;
  if (!leadId || !followUpDate || Number.isNaN(followUpDate.getTime())) throw new Error("Choose a valid follow-up date and time.");
  const { supabase, userId } = await getEditableLead(leadId);
  const { error } = await supabase.from("leads").update({ next_follow_up_at: followUpDate.toISOString() }).eq("id", leadId);
  if (error) throw new Error(error.message);
  const { error: activityError } = await supabase.from("lead_activities").insert({
    lead_id: leadId,
    activity_type: "follow_up_rescheduled",
    note: "Follow-up date updated.",
    follow_up_at: followUpDate.toISOString(),
    created_by: userId,
  });
  if (activityError) throw new Error(activityError.message);
  revalidatePath("/dashboard/leads");
}

export async function scheduleLeadZoomMeeting(formData: FormData): Promise<{ ok: boolean; message: string; joinUrl?: string }> {
  const leadId = String(formData.get("leadId") ?? "");
  const topic = String(formData.get("topic") ?? "").trim();
  const agenda = String(formData.get("agenda") ?? "").trim();
  const startTime = String(formData.get("startTime") ?? "");
  const duration = Number(formData.get("duration") ?? 0);
  const startDate = new Date(startTime);
  if (!leadId || !topic || topic.length > 200 || agenda.length > 2000 || !startTime || Number.isNaN(startDate.getTime()) || !Number.isInteger(duration) || duration < 5 || duration > 480) return { ok: false, message: "Enter a title, valid meeting time, and duration between 5 and 480 minutes." };

  const { supabase, lead, userId } = await getEditableLead(leadId);
  const { data: leadDetails, error: leadError } = await supabase.from("leads").select("first_name, last_name, email").eq("id", leadId).single();
  if (leadError || !leadDetails?.email) return { ok: false, message: "This lead needs an email address before sending a Zoom invitation." };
  const hostEmail = process.env.ZOOM_HOST_EMAIL?.trim();
  if (!hostEmail) return { ok: false, message: "Zoom host is not configured. Add ZOOM_HOST_EMAIL to .env.local." };

  try {
    const meeting = await createZoomMeeting({ hostEmail, topic, agenda, startTime: startDate.toISOString(), duration });
    const { error: saveError } = await supabase.from("lead_zoom_meetings").insert({ lead_id: lead.id, zoom_meeting_id: String(meeting.id), host_user_id: userId, topic, agenda: agenda || null, start_time: startDate.toISOString(), duration_minutes: duration, join_url: meeting.join_url, start_url: meeting.start_url ?? null });
    if (saveError) throw new Error(saveError.message);
    const name = [leadDetails.first_name, leadDetails.last_name].filter(Boolean).join(" ") || "there";
    let inviteMessage = "Invitation email sent.";
    try { await sendLeadMeetingInvitation({ email: leadDetails.email, name, topic, agenda, startTime: startDate.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }), duration, joinUrl: meeting.join_url }); }
    catch { inviteMessage = "Meeting created, but the invitation email could not be sent. Check SMTP configuration."; }
    const { error: activityError } = await supabase.from("lead_activities").insert({ lead_id: lead.id, activity_type: "zoom_meeting_scheduled", note: `Zoom meeting scheduled: ${topic}. ${inviteMessage}`, metadata: { zoom_meeting_id: String(meeting.id), join_url: meeting.join_url, start_time: startDate.toISOString(), duration_minutes: duration }, created_by: userId });
    if (activityError) throw new Error(activityError.message);
    revalidatePath("/dashboard/leads");
    return { ok: true, message: inviteMessage, joinUrl: meeting.join_url };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Unable to schedule Zoom meeting." };
  }
}

export async function saveLeadTablePreferences(formData: FormData) {
  const { userId } = await requireUser();
  const raw = String(formData.get("preferences") ?? "");
  let preferences: { order?: unknown; widths?: unknown; frozen?: unknown };
  try { preferences = JSON.parse(raw); } catch { throw new Error("Invalid table preferences."); }
  const order = Array.isArray(preferences.order) ? preferences.order.filter((item): item is string => typeof item === "string").slice(0, 100) : [];
  const frozen = Array.isArray(preferences.frozen) ? preferences.frozen.filter((item): item is string => typeof item === "string").slice(0, 20) : [];
  const widths = Object.fromEntries(Object.entries(preferences.widths ?? {}).filter(([key, value]) => typeof key === "string" && typeof value === "number" && value >= 90 && value <= 800).slice(0, 100));
  const supabase = await createClient();
  const { error } = await supabase.from("lead_table_preferences").upsert({ user_id: userId, column_order: order, column_widths: widths, frozen_column_keys: frozen, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/leads");
}
