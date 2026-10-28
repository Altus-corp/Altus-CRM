"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireUser } from "@/app/lib/auth";
import { createClient } from "@/app/lib/supabase/server";
import { createAdminClient } from "@/app/lib/supabase/admin";
import { sendLeadMeetingInvitation } from "@/app/lib/email";
import { createZoomMeeting } from "@/app/lib/zoom";
import { createGoogleMeetEvent } from "@/app/lib/google-calendar";
import { altusContactsRequest } from "@/app/lib/altus-contacts";
import { callHasPhone, extractAltusTranscript, normalizePhone, type AltusCall } from "@/app/lib/altus-call-transcripts";

type ImportResult = { ok: boolean; message: string; imported?: number; skipped?: number };
type ProductivityShastraLead = Record<string, unknown>;
type MananvasaLead = { id?: string | number; source?: string; first_name?: string; email?: string; phone?: string | null; topic?: string | null; message?: string | null; status?: string | null; payload_json?: Record<string, unknown> | null };
type AltusCorpExternalLead = { id?: string; submittedAt?: string; name?: string; company?: string | null; email?: string | null; phone?: string | null; interest?: string | null; turnover?: string | null; message?: string | null; form?: string | null; status?: string | null };

function stringValue(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function productivityShastraRecords(payload: unknown): ProductivityShastraLead[] {
  if (Array.isArray(payload)) return payload.filter((item): item is ProductivityShastraLead => Boolean(item) && typeof item === "object");
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  const candidates = [root.data, root.leads, root.items, root.results];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate.filter((item): item is ProductivityShastraLead => Boolean(item) && typeof item === "object");
    if (candidate && typeof candidate === "object") {
      const nested = candidate as Record<string, unknown>;
      for (const value of [nested.data, nested.leads, nested.items, nested.results]) {
        if (Array.isArray(value)) return value.filter((item): item is ProductivityShastraLead => Boolean(item) && typeof item === "object");
      }
    }
  }
  return [];
}

function productivityShastraName(lead: ProductivityShastraLead) {
  const firstName = stringValue(lead.first_name ?? lead.firstName ?? lead.name ?? lead.full_name ?? lead.fullName);
  const lastName = stringValue(lead.last_name ?? lead.lastName);
  if (lastName || !firstName.includes(" ")) return { firstName, lastName };
  const [first, ...rest] = firstName.split(/\s+/);
  return { firstName: first, lastName: rest.join(" ") };
}

function mananvasaName(lead: MananvasaLead) {
  const payload = lead.payload_json ?? {};
  const rawName = stringValue(lead.first_name ?? payload.first_name ?? payload["First Name"] ?? payload.Name);
  const lastName = stringValue(payload.last_name ?? payload["Last Name"]);
  if (lastName || !rawName.includes(" ")) return { firstName: rawName, lastName };
  const [firstName, ...rest] = rawName.split(/\s+/);
  return { firstName, lastName: rest.join(" ") };
}

function mananvasaPhone(lead: MananvasaLead) {
  const payload = lead.payload_json ?? {};
  return stringValue(lead.phone ?? payload.contact ?? payload["Cell Number"] ?? payload.phone ?? payload.mobile) || null;
}

function splitLeadName(name: unknown) {
  const fullName = stringValue(name);
  if (!fullName.includes(" ")) return { firstName: fullName, lastName: "" };
  const [firstName, ...rest] = fullName.split(/\s+/);
  return { firstName, lastName: rest.join(" ") };
}

function altusCorpProductCode(interest: unknown) {
  const normalized = stringValue(interest).toLowerCase().replace(/\s+/g, " ");
  // Website forms without an interest are Altus OS qualified leads by default.
  if (!normalized) return "ALTUS_OS";
  if (normalized.includes("workshop")) return "PSO";
  if (normalized.includes("outsourced cxo") || normalized.includes("business process") || normalized.includes("coaching")) return "RETAINER";
  if (normalized.includes("dashboard ceo") || normalized.includes("altus operating system")) return "ALTUS_OS";
  if (normalized.includes("keynote")) return "KEYNOTE";
  if (normalized.includes("channel partner") || normalized === "other") return "AMBASSADOR";
  return "";
}

function websiteLeadFallbackName(email: string, externalId: string) {
  const localPart = email.split("@")[0]?.replace(/[._-]+/g, " ").trim();
  return localPart || `Website lead ${externalId.slice(0, 8)}`;
}

function altusCallActivityNote(call: AltusCall, transcript: string) {
  const direction = String(call.direction ?? "").toLowerCase() === "incoming" ? "Incoming" : "Outgoing";
  const seconds = Math.max(0, Number(call.duration_seconds ?? call.duration ?? 0));
  const duration = seconds ? `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s` : "duration unavailable";
  const startedAt = typeof call.started_at === "string" ? new Date(call.started_at) : null;
  const time = startedAt && !Number.isNaN(startedAt.getTime()) ? ` · ${startedAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}` : "";
  return `${direction} Altus Contact call · ${duration}${time}\n\nTranscript:\n${transcript}`;
}

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

export async function syncProductivityShastraQualifiedLeads(): Promise<{ ok: boolean; message: string; imported?: number; updated?: number; skipped?: number }> {
  try {
    const { userId } = await requireAdmin();
    const apiKey = process.env.PRODUCTIVITY_SHASTRA_API_KEY?.trim();
    const baseUrl = (process.env.PRODUCTIVITY_SHASTRA_API_BASE_URL?.trim() || "https://productivityshastra.com/api/v1").replace(/\/+$/, "");
    if (!apiKey) return { ok: false, message: "Productivity Shastra is not configured. Add PRODUCTIVITY_SHASTRA_API_KEY to .env.local." };

    const supabase = createAdminClient();
    const { data: product } = await supabase.from("lead_products").select("id, code").eq("code", "PSO").eq("is_active", true).maybeSingle();
    if (!product) return { ok: false, message: "The active PSO product is required before Productivity Shastra leads can be synced." };
    const sourceUrl = new URL(`${baseUrl}/leads`);
    sourceUrl.searchParams.set("status", "new");
    sourceUrl.searchParams.set("page", "1");
    sourceUrl.searchParams.set("per_page", "100");
    const response = await fetch(sourceUrl, { headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" }, cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) return { ok: false, message: `Productivity Shastra returned ${response.status}.` };
    const records = productivityShastraRecords(payload);
    if (!records.length) return { ok: true, message: "No new Productivity Shastra leads were returned.", imported: 0, updated: 0, skipped: 0 };

    const candidates = records.map((record) => {
      const { firstName, lastName } = productivityShastraName(record);
      const externalId = stringValue(record.id ?? record.lead_id ?? record.uuid);
      const phone = stringValue(record.phone ?? record.phone_number ?? record.mobile ?? record.mobile_number) || null;
      return {
        externalId,
        first_name: firstName,
        last_name: lastName || null,
        email: stringValue(record.email ?? record.email_address) || null,
        phone,
        phoneKey: normalizePhone(phone),
      };
    }).filter((record) => record.externalId && record.first_name);
    const skipped = records.length - candidates.length;
    if (!candidates.length) return { ok: false, message: "The source response did not contain a lead ID and first name. Check the Productivity Shastra API payload.", skipped };

    const externalIds = [...new Set(candidates.map((record) => record.externalId))];
    const { data: existing, error: existingError } = await supabase.from("leads").select("id, external_id").eq("external_source", "productivity_shastra").in("external_id", externalIds);
    if (existingError) return { ok: false, message: "Lead source tracking is unavailable. Run the Productivity Shastra leads migration first." };
    const existingByExternalId = new Map((existing ?? []).map((lead) => [lead.external_id, lead.id]));
    const phoneKeys = [...new Set(candidates.map((record) => record.phoneKey).filter(Boolean))];
    const { data: existingPhones, error: phoneError } = phoneKeys.length ? await supabase.from("leads").select("id, phone_key").in("phone_key", phoneKeys) : { data: [], error: null };
    if (phoneError) return { ok: false, message: "Phone uniqueness is unavailable. Run the unique lead phone migration first." };
    const existingByPhoneKey = new Map((existingPhones ?? []).filter((lead) => lead.phone_key).map((lead) => [lead.phone_key, lead.id]));
    const seenPhoneKeys = new Set<string>();
    let phoneDuplicates = 0;
    const eligibleCandidates = candidates.filter((record) => {
      if (!record.phoneKey) return true;
      const matchingLeadId = existingByPhoneKey.get(record.phoneKey);
      const sourceLeadId = existingByExternalId.get(record.externalId);
      if ((matchingLeadId && matchingLeadId !== sourceLeadId) || seenPhoneKeys.has(record.phoneKey)) { phoneDuplicates += 1; return false; }
      seenPhoneKeys.add(record.phoneKey);
      return true;
    });
    const newRecords = eligibleCandidates.filter((record) => !existingByExternalId.has(record.externalId));
    const updateRecords = eligibleCandidates.filter((record) => existingByExternalId.has(record.externalId));

    if (newRecords.length) {
      const { data: inserted, error: insertError } = await supabase.from("leads").insert(newRecords.map(({ externalId, first_name, last_name, email, phone }) => ({
        first_name,
        last_name,
        email,
        phone,
        product_id: product.id,
        created_by: userId,
        lead_database: "qualified_leads",
        external_source: "productivity_shastra",
        external_id: externalId,
      }))).select("id");
      if (insertError) return { ok: false, message: insertError.message };
      if (inserted?.length) {
        const { error: activityError } = await supabase.from("lead_activities").insert(inserted.map((lead) => ({
          lead_id: lead.id,
          activity_type: "lead_created",
          note: `Imported from Productivity Shastra as a qualified lead for ${product.code}.`,
          metadata: { source: "productivity_shastra", lead_database: "qualified_leads" },
          created_by: userId,
        })));
        if (activityError) return { ok: false, message: activityError.message };
      }
    }

    const updateResults = await Promise.all(updateRecords.map((record) => supabase.from("leads").update({ first_name: record.first_name, last_name: record.last_name, email: record.email, phone: record.phone, lead_database: "qualified_leads" }).eq("id", existingByExternalId.get(record.externalId)!)));
    const updateError = updateResults.find((result) => result.error)?.error;
    if (updateError) return { ok: false, message: updateError.message };
    revalidatePath("/dashboard/leads");
    return { ok: true, message: `Productivity Shastra sync completed for ${product.code}.${phoneDuplicates ? ` ${phoneDuplicates} duplicate phone record${phoneDuplicates === 1 ? " was" : "s were"} skipped.` : ""}`, imported: newRecords.length, updated: updateRecords.length, skipped: skipped + phoneDuplicates };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Unable to sync Productivity Shastra leads." };
  }
}

export async function syncMananvasaQualifiedLeads(): Promise<{ ok: boolean; message: string; imported?: number; updated?: number; skipped?: number }> {
  try {
    const { userId } = await requireAdmin();
    const apiKey = process.env.MANANVASA_API_TOKEN?.trim();
    const baseUrl = (process.env.MANANVASA_API_BASE_URL?.trim() || "https://mananvasa.com/admin/api").replace(/\/+$/, "");
    if (!apiKey) return { ok: false, message: "Mananvasa is not configured. Add MANANVASA_API_TOKEN to .env.local." };

    const supabase = createAdminClient();
    const requiredProducts = [{ code: "KEYNOTE", name: "Keynote" }, { code: "RETAINER", name: "Retainer" }];
    for (const requiredProduct of requiredProducts) {
      const { data: existing, error: existingError } = await supabase.from("lead_products").select("id, code, is_active").eq("code", requiredProduct.code).maybeSingle();
      if (existingError) return { ok: false, message: existingError.message };
      if (existing && !existing.is_active) return { ok: false, message: `${requiredProduct.code} exists but is inactive. Activate it in Product Management before syncing.` };
      if (!existing) {
        const { error: createError } = await supabase.from("lead_products").insert(requiredProduct);
        if (createError) return { ok: false, message: createError.message };
      }
    }
    const { data: products, error: productError } = await supabase.from("lead_products").select("id, code").in("code", ["KEYNOTE", "RETAINER"]).eq("is_active", true);
    if (productError || !products?.length) return { ok: false, message: productError?.message ?? "Keynote and Retainer products are unavailable." };
    const productsByCode = new Map(products.map((product) => [product.code.toUpperCase(), product]));

    const records: MananvasaLead[] = [];
    let afterId: string | number | null = 0;
    for (let page = 0; page < 20; page += 1) {
      const url = new URL(`${baseUrl}/leads`);
      url.searchParams.set("limit", "50");
      if (afterId) url.searchParams.set("after_id", String(afterId));
      const response = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" }, cache: "no-store" });
      const payload = await response.json().catch(() => null) as { data?: MananvasaLead[]; pagination?: { has_more?: boolean; next_after_id?: string | number | null } } | null;
      if (!response.ok) return { ok: false, message: `Mananvasa returned ${response.status}.` };
      records.push(...(Array.isArray(payload?.data) ? payload.data : []));
      const nextAfterId = payload?.pagination?.next_after_id ?? null;
      if (!payload?.pagination?.has_more || !nextAfterId) break;
      afterId = nextAfterId;
    }
    if (!records.length) return { ok: true, message: "No Mananvasa leads were returned.", imported: 0, updated: 0, skipped: 0 };

    let unsupportedSources = 0;
    const candidates = records.flatMap((lead) => {
      const source = stringValue(lead.source).toLowerCase();
      const productCode = source === "keynote" ? "KEYNOTE" : source === "apply" || source === "tool" ? "RETAINER" : "";
      const product = productsByCode.get(productCode);
      const { firstName, lastName } = mananvasaName(lead);
      const externalId = stringValue(lead.id);
      if (!productCode) { unsupportedSources += 1; return []; }
      if (!product) throw new Error(`Create an active ${productCode} product before syncing Mananvasa leads.`);
      if (!externalId || !firstName) return [];
      const phone = mananvasaPhone(lead);
      return [{
        externalId,
        product,
        first_name: firstName,
        last_name: lastName || null,
        email: stringValue(lead.email ?? lead.payload_json?.email ?? lead.payload_json?.Email) || null,
        phone,
        phoneKey: normalizePhone(phone),
        custom_data: {
          mananvasa_source: source,
          mananvasa_topic: stringValue(lead.topic),
          mananvasa_message: stringValue(lead.message),
          mananvasa_status: stringValue(lead.status),
        },
      }];
    });
    const skipped = records.length - candidates.length;
    if (!candidates.length) return { ok: false, message: "No eligible Mananvasa records found. Only keynote, apply, and tool sources are imported.", skipped };

    const externalIds = [...new Set(candidates.map((record) => record.externalId))];
    const { data: existing, error: existingError } = await supabase.from("leads").select("id, external_id").eq("external_source", "mananvasa").in("external_id", externalIds);
    if (existingError) return { ok: false, message: "Lead source tracking is unavailable. Run the external lead-source migration first." };
    const existingByExternalId = new Map((existing ?? []).map((lead) => [lead.external_id, lead.id]));
    const phoneKeys = [...new Set(candidates.map((record) => record.phoneKey).filter(Boolean))];
    const { data: existingPhones, error: phoneError } = phoneKeys.length ? await supabase.from("leads").select("id, phone_key").in("phone_key", phoneKeys) : { data: [], error: null };
    if (phoneError) return { ok: false, message: "Phone uniqueness is unavailable. Run the unique lead phone migration first." };
    const existingByPhoneKey = new Map((existingPhones ?? []).filter((lead) => lead.phone_key).map((lead) => [lead.phone_key, lead.id]));
    const seenPhoneKeys = new Set<string>();
    let phoneDuplicates = 0;
    const eligibleCandidates = candidates.filter((record) => {
      if (!record.phoneKey) return true;
      const matchingLeadId = existingByPhoneKey.get(record.phoneKey);
      const sourceLeadId = existingByExternalId.get(record.externalId);
      if ((matchingLeadId && matchingLeadId !== sourceLeadId) || seenPhoneKeys.has(record.phoneKey)) { phoneDuplicates += 1; return false; }
      seenPhoneKeys.add(record.phoneKey);
      return true;
    });
    const newRecords = eligibleCandidates.filter((record) => !existingByExternalId.has(record.externalId));
    const updateRecords = eligibleCandidates.filter((record) => existingByExternalId.has(record.externalId));

    if (newRecords.length) {
      const { data: inserted, error: insertError } = await supabase.from("leads").insert(newRecords.map(({ externalId, product, first_name, last_name, email, phone, custom_data }) => ({
        first_name, last_name, email, phone, custom_data,
        product_id: product.id,
        created_by: userId,
        lead_database: "qualified_leads",
        external_source: "mananvasa",
        external_id: externalId,
      }))).select("id");
      if (insertError) return { ok: false, message: insertError.message };
      if (inserted?.length) {
        const { error: activityError } = await supabase.from("lead_activities").insert(inserted.map((lead) => ({
          lead_id: lead.id,
          activity_type: "lead_created",
          note: "Imported from Mananvasa as a qualified lead.",
          metadata: { source: "mananvasa", lead_database: "qualified_leads" },
          created_by: userId,
        })));
        if (activityError) return { ok: false, message: activityError.message };
      }
    }

    const updateResults = await Promise.all(updateRecords.map((record) => supabase.from("leads").update({ first_name: record.first_name, last_name: record.last_name, email: record.email, phone: record.phone, custom_data: record.custom_data, lead_database: "qualified_leads" }).eq("id", existingByExternalId.get(record.externalId)!)));
    const updateError = updateResults.find((result) => result.error)?.error;
    if (updateError) return { ok: false, message: updateError.message };
    revalidatePath("/dashboard/leads");
    return { ok: true, message: `Mananvasa sync completed.${phoneDuplicates ? ` ${phoneDuplicates} duplicate phone record${phoneDuplicates === 1 ? " was" : "s were"} skipped.` : ""}${unsupportedSources ? ` ${unsupportedSources} unsupported source record${unsupportedSources === 1 ? " was" : "s were"} skipped.` : ""}`, imported: newRecords.length, updated: updateRecords.length, skipped: skipped + phoneDuplicates };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Unable to sync Mananvasa leads." };
  }
}

export async function syncAltusCorpQualifiedLeads(): Promise<{ ok: boolean; message: string; imported?: number; updated?: number; skipped?: number }> {
  try {
    const { userId } = await requireAdmin();
    const apiKey = process.env.ALTUSCORP_EXTERNAL_LEADS_API_KEY?.trim();
    const baseUrl = (process.env.ALTUSCORP_EXTERNAL_LEADS_API_BASE_URL?.trim() || "https://altuscorp.in/api/external").replace(/\/+$/, "");
    if (!apiKey) return { ok: false, message: "AltusCorp website leads are not configured. Add ALTUSCORP_EXTERNAL_LEADS_API_KEY to .env.local." };

    const supabase = createAdminClient();
    const requiredProducts = [
      { code: "PSO", name: "Productivity Shashtra Orientation" },
      { code: "RETAINER", name: "Retainer" },
      { code: "ALTUS_OS", name: "Altus OS" },
      { code: "KEYNOTE", name: "Keynote" },
      { code: "AMBASSADOR", name: "Ambassador" },
    ];
    for (const requiredProduct of requiredProducts) {
      const { data: existing, error } = await supabase.from("lead_products").select("id, is_active").eq("code", requiredProduct.code).maybeSingle();
      if (error) return { ok: false, message: error.message };
      if (existing && !existing.is_active) return { ok: false, message: `${requiredProduct.code} exists but is inactive. Activate it in Product Management before syncing.` };
      if (!existing) {
        const { error: createError } = await supabase.from("lead_products").insert(requiredProduct);
        if (createError) return { ok: false, message: createError.message };
      }
    }
    const { data: products, error: productError } = await supabase.from("lead_products").select("id, code").in("code", requiredProducts.map((product) => product.code)).eq("is_active", true);
    if (productError || !products?.length) return { ok: false, message: productError?.message ?? "Required AltusCorp products are unavailable." };
    const productsByCode = new Map(products.map((product) => [product.code.toUpperCase(), product]));

    const records: AltusCorpExternalLead[] = [];
    let offset = 0;
    for (let page = 0; page < 100; page += 1) {
      const url = new URL(`${baseUrl}/leads`);
      url.searchParams.set("limit", "50");
      url.searchParams.set("offset", String(offset));
      const response = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" }, cache: "no-store" });
      const payload = await response.json().catch(() => null) as { ok?: boolean; data?: AltusCorpExternalLead[]; pagination?: { total?: number; nextOffset?: number | null } } | null;
      if (!response.ok || payload?.ok === false) return { ok: false, message: `AltusCorp website API returned ${response.status}.` };
      const pageRecords = Array.isArray(payload?.data) ? payload.data : [];
      records.push(...pageRecords);
      const nextOffset = payload?.pagination?.nextOffset;
      if (!pageRecords.length || nextOffset === null || nextOffset === undefined || nextOffset <= offset) break;
      offset = nextOffset;
    }
    if (!records.length) return { ok: true, message: "No AltusCorp website leads were returned.", imported: 0, updated: 0, skipped: 0 };

    let unsupportedInterests = 0;
    const candidates = records.flatMap((lead) => {
      const productCode = altusCorpProductCode(lead.interest);
      const product = productsByCode.get(productCode);
      const externalId = stringValue(lead.id);
      const email = stringValue(lead.email) || null;
      const { firstName: suppliedFirstName, lastName } = splitLeadName(lead.name);
      const firstName = suppliedFirstName || websiteLeadFallbackName(email ?? "", externalId);
      if (!productCode) { unsupportedInterests += 1; return []; }
      if (!product || !externalId) return [];
      const phone = stringValue(lead.phone) || null;
      return [{
        externalId,
        product,
        first_name: firstName,
        last_name: lastName || null,
        email,
        phone,
        phoneKey: normalizePhone(phone),
        custom_data: {
          altuscorp_interest: stringValue(lead.interest),
          altuscorp_company: stringValue(lead.company),
          altuscorp_turnover: stringValue(lead.turnover),
          altuscorp_message: stringValue(lead.message),
          altuscorp_form: stringValue(lead.form),
          altuscorp_status: stringValue(lead.status),
          altuscorp_submitted_at: stringValue(lead.submittedAt),
        },
      }];
    });
    const skipped = records.length - candidates.length;
    if (!candidates.length) return { ok: false, message: "No eligible AltusCorp leads found. Check that their interest matches the configured product rules.", skipped };

    const externalIds = [...new Set(candidates.map((record) => record.externalId))];
    const { data: existing, error: existingError } = await supabase.from("leads").select("id, external_id").eq("external_source", "altuscorp_website").in("external_id", externalIds);
    if (existingError) return { ok: false, message: "Lead source tracking is unavailable. Run the external lead-source migration first." };
    const existingByExternalId = new Map((existing ?? []).map((lead) => [lead.external_id, lead.id]));
    const phoneKeys = [...new Set(candidates.map((record) => record.phoneKey).filter(Boolean))];
    const { data: existingPhones, error: phoneError } = phoneKeys.length ? await supabase.from("leads").select("id, phone_key").in("phone_key", phoneKeys) : { data: [], error: null };
    if (phoneError) return { ok: false, message: "Phone uniqueness is unavailable. Run the unique lead phone migration first." };
    const existingByPhoneKey = new Map((existingPhones ?? []).filter((lead) => lead.phone_key).map((lead) => [lead.phone_key, lead.id]));
    const seenPhoneKeys = new Set<string>();
    let phoneDuplicates = 0;
    const eligible = candidates.filter((record) => {
      if (!record.phoneKey) return true;
      const sourceLeadId = existingByExternalId.get(record.externalId);
      if ((existingByPhoneKey.get(record.phoneKey) && existingByPhoneKey.get(record.phoneKey) !== sourceLeadId) || seenPhoneKeys.has(record.phoneKey)) { phoneDuplicates += 1; return false; }
      seenPhoneKeys.add(record.phoneKey);
      return true;
    });
    const newRecords = eligible.filter((record) => !existingByExternalId.has(record.externalId));
    const updateRecords = eligible.filter((record) => existingByExternalId.has(record.externalId));
    if (newRecords.length) {
      const { data: inserted, error: insertError } = await supabase.from("leads").insert(newRecords.map(({ externalId, product, first_name, last_name, email, phone, custom_data }) => ({
        first_name, last_name, email, phone, custom_data, product_id: product.id, created_by: userId,
        lead_database: "qualified_leads", external_source: "altuscorp_website", external_id: externalId,
      }))).select("id");
      if (insertError) return { ok: false, message: insertError.message };
      if (inserted?.length) {
        const { error: activityError } = await supabase.from("lead_activities").insert(inserted.map((lead) => ({
          lead_id: lead.id, activity_type: "lead_created", note: "Imported from AltusCorp website as a qualified lead.",
          metadata: { source: "altuscorp_website", lead_database: "qualified_leads" }, created_by: userId,
        })));
        if (activityError) return { ok: false, message: activityError.message };
      }
    }
    const updateResults = await Promise.all(updateRecords.map((record) => supabase.from("leads").update({
      first_name: record.first_name, last_name: record.last_name, email: record.email, phone: record.phone,
      custom_data: record.custom_data, lead_database: "qualified_leads",
    }).eq("id", existingByExternalId.get(record.externalId)!)));
    const updateError = updateResults.find((result) => result.error)?.error;
    if (updateError) return { ok: false, message: updateError.message };
    revalidatePath("/dashboard/leads");
    return { ok: true, message: `AltusCorp website sync completed.${phoneDuplicates ? ` ${phoneDuplicates} duplicate phone record${phoneDuplicates === 1 ? " was" : "s were"} skipped.` : ""}${unsupportedInterests ? ` ${unsupportedInterests} lead${unsupportedInterests === 1 ? " had" : "s had"} an unmapped interest and ${unsupportedInterests === 1 ? "was" : "were"} skipped.` : ""}`, imported: newRecords.length, updated: updateRecords.length, skipped: skipped + phoneDuplicates };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Unable to sync AltusCorp website leads." };
  }
}

export async function createManualLead(formData: FormData): Promise<{ ok: boolean; message: string }> {
  const user = await requireUser();
  if (!user.roles.some((role) => ["admin", "sales_executive", "sales_manager", "consultant"].includes(role))) return { ok: false, message: "You do not have permission to add leads." };
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phone = String(formData.get("phone") ?? "").trim();
  const productId = String(formData.get("productId") ?? "");
  const stageId = String(formData.get("stageId") ?? "");
  if (!firstName || firstName.length > 120 || lastName.length > 120 || email.length > 254 || phone.length > 30 || !productId) return { ok: false, message: "Enter a first name and choose a product. Check the field lengths." };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, message: "Enter a valid email address." };
  const supabase = createAdminClient();
  const { data: product } = await supabase.from("lead_products").select("id, code").eq("id", productId).eq("is_active", true).maybeSingle();
  if (!product) return { ok: false, message: "Choose an active product." };
  if (stageId) {
    const { data: stage } = await supabase.from("lead_stages").select("id").eq("id", stageId).eq("product_id", productId).eq("is_active", true).maybeSingle();
    if (!stage) return { ok: false, message: "Choose a stage that belongs to the selected product." };
  }
  const assignedAt = new Date().toISOString();
  const { data: lead, error } = await supabase.from("leads").insert({ first_name: firstName, last_name: lastName || null, email: email || null, phone: phone || null, product_id: productId, stage_id: stageId || null, assigned_to: user.userId, assigned_at: assignedAt, created_by: user.userId, lead_database: "leads" }).select("id").single();
  if (error || !lead) return { ok: false, message: error?.message || "Unable to create the lead." };
  const { data: assignment } = await supabase.from("lead_product_assignments").select("id").eq("lead_id", lead.id).eq("product_id", productId).maybeSingle();
  if (assignment) {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    await supabase.from("lead_product_assignments").update({ focused_on: today, assignment_origin: "manual" }).eq("id", assignment.id);
  }
  const { error: activityError } = await supabase.from("lead_activities").insert({ lead_id: lead.id, lead_product_assignment_id: assignment?.id ?? null, activity_type: "lead_created", note: `Lead manually added and assigned to the creating CRM user for ${product.code}.`, metadata: { source: "manual_lead_creation", assigned_to: user.userId, product_id: productId }, created_by: user.userId });
  if (activityError) return { ok: false, message: activityError.message };
  revalidatePath("/dashboard/leads");
  return { ok: true, message: "Lead created and assigned to you." };
}

export async function manuallyAssignLeads(formData: FormData) {
  const { userId } = await requireAdmin();
  const assigneeId = String(formData.get("assigneeId") ?? "");
  const assignmentIds = [...new Set(formData.getAll("assignmentId").map(String).filter(Boolean))];
  if (!assigneeId || !assignmentIds.length || assignmentIds.length > 100) throw new Error("Choose a user and one or more product assignments to assign.");

  const supabase = await createClient();
  const [{ data: profile, error: profileError }, { data: roles, error: rolesError }] = await Promise.all([
    supabase.from("profiles").select("id, is_suspended, first_name, last_name, full_name").eq("id", assigneeId).single(),
    supabase.from("user_roles").select("role").eq("user_id", assigneeId).in("role", ["sales_executive", "sales_manager", "consultant"]),
  ]);
  if (profileError || !profile || profile.is_suspended || rolesError || !roles?.length) throw new Error("Choose an active eligible sales user.");

  const { data: assignments, error: assignmentsError } = await supabase.from("lead_product_assignments").select("id, lead_id, product_id").in("id", assignmentIds);
  if (assignmentsError || !assignments?.length) throw new Error("The selected product assignments are no longer available.");
  const assignedAt = new Date().toISOString();
  const focusedOn = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const { error } = await supabase.from("lead_product_assignments").update({ assigned_to: assigneeId, assigned_at: assignedAt, focused_on: focusedOn, assignment_origin: "manual" }).in("id", assignments.map((assignment) => assignment.id));
  if (error) throw new Error(error.message);
  const assigneeName = profile.full_name || [profile.first_name, profile.last_name].filter(Boolean).join(" ") || "a sales user";
  const { error: activityError } = await supabase.from("lead_activities").insert(assignments.map((assignment) => ({
    lead_id: assignment.lead_id,
    lead_product_assignment_id: assignment.id,
    activity_type: "assigned",
    note: `Product work assigned to ${assigneeName}.`,
    metadata: { assigned_to: assigneeId, assigned_to_name: assigneeName, product_id: assignment.product_id },
    created_by: userId,
  })));
  if (activityError) throw new Error(activityError.message);
  revalidatePath("/dashboard/leads");
}

export async function addLeadProductAssignment(formData: FormData) {
  const { userId } = await requireAdmin();
  const leadId = String(formData.get("leadId") ?? "");
  const productId = String(formData.get("productId") ?? "");
  const assigneeId = String(formData.get("assigneeId") ?? "");
  if (!leadId || !productId) throw new Error("Choose one lead and a product.");
  const supabase = await createClient();
  const { data: product, error: productError } = await supabase.from("lead_products").select("id, code").eq("id", productId).eq("is_active", true).single();
  if (productError || !product) throw new Error("Choose an active product.");
  if (assigneeId) {
    const [{ data: profile }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("id, is_suspended").eq("id", assigneeId).single(),
      supabase.from("user_roles").select("role").eq("user_id", assigneeId).in("role", ["sales_executive", "sales_manager", "consultant"]),
    ]);
    if (!profile || profile.is_suspended || !roles?.length) throw new Error("Choose an active eligible sales user.");
  }
  const { data: assignment, error } = await supabase.from("lead_product_assignments").insert({ lead_id: leadId, product_id: productId, assigned_to: assigneeId || null, assigned_at: assigneeId ? new Date().toISOString() : null, created_by: userId }).select("id").single();
  if (error) {
    if (error.code === "23505") throw new Error(`This lead already has ${product.code} work assigned.`);
    throw new Error(error.message);
  }
  const { error: activityError } = await supabase.from("lead_activities").insert({ lead_id: leadId, lead_product_assignment_id: assignment.id, activity_type: "product_added", note: `${product.code} product work added${assigneeId ? " and assigned" : ""}.`, metadata: { product_id: productId, assigned_to: assigneeId || null }, created_by: userId });
  if (activityError) throw new Error(activityError.message);
  revalidatePath("/dashboard/leads");
}

export async function addProductToMyLead(formData: FormData) {
  const leadId = String(formData.get("leadId") ?? "");
  const sourceAssignmentId = String(formData.get("sourceAssignmentId") ?? "");
  const productId = String(formData.get("productId") ?? "");
  if (!leadId || !sourceAssignmentId || !productId) throw new Error("Choose a product to add.");
  const { supabase, userId } = await getEditableLead(leadId, sourceAssignmentId);
  const { data: product, error: productError } = await supabase.from("lead_products").select("id, code").eq("id", productId).eq("is_active", true).single();
  if (productError || !product) throw new Error("Choose an active product.");
  const { data: assignment, error } = await supabase.from("lead_product_assignments").insert({ lead_id: leadId, product_id: productId, assigned_to: userId, assigned_at: new Date().toISOString(), created_by: userId }).select("id").single();
  if (error) {
    if (error.code === "23505") throw new Error(`This lead already has ${product.code} product work.`);
    throw new Error(error.message);
  }
  const { error: activityError } = await supabase.from("lead_activities").insert({ lead_id: leadId, lead_product_assignment_id: assignment.id, activity_type: "product_added", note: `${product.code} product work added by the assigned CRM user.`, metadata: { product_id: productId, source_assignment_id: sourceAssignmentId }, created_by: userId });
  if (activityError) throw new Error(activityError.message);
  revalidatePath("/dashboard/leads");
}

async function getEditableLead(leadId: string, assignmentId: string) {
  const user = await requireUser();
  if (!user.roles.includes("admin") && !user.roles.some((role) => role === "sales_executive" || role === "sales_manager")) throw new Error("You do not have permission to update leads.");
  if (!assignmentId) throw new Error("Choose the product work record to update.");
  const supabase = createAdminClient();
  const [{ data: lead, error }, { data: assignment, error: assignmentError }] = await Promise.all([
    supabase.from("leads").select("id").eq("id", leadId).single(),
    supabase.from("lead_product_assignments").select("id, lead_id, product_id, assigned_to").eq("id", assignmentId).eq("lead_id", leadId).single(),
  ]);
  if (error || !lead || assignmentError || !assignment) throw new Error("This product work record is no longer available to update.");
  if (!user.roles.includes("admin") && assignment.assigned_to !== user.userId) throw new Error("You can update only product work assigned to you.");
  return { supabase, lead: assignment, userId: user.userId };
}

export async function createLeadActivity(formData: FormData) {
  const leadId = String(formData.get("leadId") ?? "");
  const assignmentId = String(formData.get("assignmentId") ?? "");
  const activityType = String(formData.get("activityType") ?? "").trim();
  const allowedActivityTypes = ["call", "video_call", "offline_meeting", "whatsapp_message", "online_demo", "offline_demo", "linkedin", "online_meeting", "email"];
  if (!leadId || !allowedActivityTypes.includes(activityType)) throw new Error("Choose a valid activity.");
  const { supabase, userId } = await getEditableLead(leadId, assignmentId);
  const { error } = await supabase.from("lead_activities").insert({ lead_id: leadId, lead_product_assignment_id: assignmentId, activity_type: activityType, note: `Recorded ${activityType.replaceAll("_", " ")}.`, created_by: userId });
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/leads");
}

export async function createLeadNote(formData: FormData) {
  const leadId = String(formData.get("leadId") ?? "");
  const assignmentId = String(formData.get("assignmentId") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (!leadId || !note || note.length > 2000) throw new Error("Write a note of up to 2,000 characters.");
  const { supabase, userId } = await getEditableLead(leadId, assignmentId);
  const { error } = await supabase.from("lead_activities").insert({ lead_id: leadId, lead_product_assignment_id: assignmentId, activity_type: "note", note, created_by: userId });
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/leads");
}

export async function syncLeadCallTranscripts(formData: FormData): Promise<{ ok: boolean; message: string; synced?: number }> {
  const leadId = String(formData.get("leadId") ?? "");
  const assignmentId = String(formData.get("assignmentId") ?? "");
  if (!leadId) return { ok: false, message: "Lead is required." };
  const { supabase, userId } = await getEditableLead(leadId, assignmentId);
  const [{ data: lead, error: leadError }, { data: authResult, error: authError }, { data: leadAssignments, error: assignmentsError }] = await Promise.all([
    supabase.from("leads").select("phone").eq("id", leadId).single(),
    supabase.auth.admin.getUserById(userId),
    supabase.from("lead_product_assignments").select("id").eq("lead_id", leadId).eq("is_active", true),
  ]);
  const phone = normalizePhone(lead?.phone);
  const email = authResult.user?.email?.trim().toLowerCase();
  if (leadError || !phone) return { ok: false, message: "This lead needs a valid phone number before transcripts can be matched." };
  if (authError || !email || assignmentsError) return { ok: false, message: "Your CRM email or product assignments are unavailable for Altus Contact sync." };
  const automaticAssignmentId = leadAssignments?.length === 1 ? leadAssignments[0].id : null;
  try {
    const calls = await altusContactsRequest<AltusCall[]>("/calls?limit=100");
    const matched = (calls.data ?? []).filter((call) => call.user?.trim().toLowerCase() === email && callHasPhone(call, phone) && call.id !== undefined && call.id !== null);
    if (!matched.length) return { ok: true, message: "No Altus Contact calls matched this lead's phone number for your CRM account yet.", synced: 0 };
    const callIds = matched.map((call) => String(call.id));
    const { data: existing } = await supabase.from("lead_call_transcripts").select("altus_call_id").in("altus_call_id", callIds);
    const existingIds = new Set((existing ?? []).map((item) => item.altus_call_id));
    let synced = 0;
    let available = 0;
    for (const call of matched) {
      const callId = String(call.id);
      const detailed = await altusContactsRequest<AltusCall>(`/calls/${encodeURIComponent(callId)}`);
      const detailedCall = detailed.data ?? call;
      const transcript = extractAltusTranscript(detailedCall);
      let { data: existingActivity } = await supabase.from("lead_activities").select("id").eq("lead_id", leadId).eq("activity_type", "call").contains("metadata", { source: "altus_contacts", call_id: callId }).maybeSingle();
      if (!existingActivity) {
        const { data: pendingDial } = await supabase.from("lead_activities").select("id").eq("lead_id", leadId).eq("activity_type", "call").contains("metadata", { source: "altus_contacts", request_id: callId }).maybeSingle();
        existingActivity = pendingDial;
      }
      const metadata = { source: "altus_contacts", call_id: callId, direction: detailedCall.direction ?? null, duration_seconds: detailedCall.duration_seconds ?? detailedCall.duration ?? null, started_at: detailedCall.started_at ?? detailedCall.created_at ?? null, transcript: transcript || null };
      if (existingActivity) {
        const { error: activityError } = await supabase.from("lead_activities").update({ note: altusCallActivityNote(detailedCall, transcript), metadata }).eq("id", existingActivity.id);
        if (activityError) throw new Error(activityError.message);
      } else {
        const { error: activityError } = await supabase.from("lead_activities").insert({ lead_id: leadId, lead_product_assignment_id: assignmentId, activity_type: "call", note: altusCallActivityNote(detailedCall, transcript), metadata, created_by: userId });
        if (activityError) throw new Error(activityError.message);
      }
      if (!transcript) continue;
      available += 1;
      const { error } = await supabase.from("lead_call_transcripts").upsert({ lead_id: leadId, lead_product_assignment_id: automaticAssignmentId, altus_call_id: callId, transcript_text: transcript, source_payload: detailed.data ?? call, updated_at: new Date().toISOString() }, { onConflict: "altus_call_id" });
      if (error) throw new Error(error.message);
      if (!existingIds.has(callId)) synced += 1;
    }
    revalidatePath("/dashboard/leads");
    return { ok: true, message: available ? `${matched.length} matching call${matched.length === 1 ? "" : "s"} checked; ${available} transcript${available === 1 ? "" : "s"} available, ${synced} newly saved.` : `${matched.length} matching call${matched.length === 1 ? "" : "s"} found, but Altus Contacts has not finished a transcript for them yet.`, synced };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Unable to sync call transcripts." };
  }
}

export async function syncLeadTranscriptByCallId(formData: FormData): Promise<{ ok: boolean; message: string }> {
  const leadId = String(formData.get("leadId") ?? "");
  const assignmentId = String(formData.get("assignmentId") ?? "");
  const callId = String(formData.get("callId") ?? "").trim();
  if (!leadId || !/^\d+$/.test(callId)) return { ok: false, message: "Enter a valid Altus Contact call ID." };
  const { supabase, userId } = await getEditableLead(leadId, assignmentId);
  const [{ data: lead, error: leadError }, { data: authResult, error: authError }, { data: leadAssignments, error: assignmentsError }] = await Promise.all([
    supabase.from("leads").select("phone").eq("id", leadId).single(),
    supabase.auth.admin.getUserById(userId),
    supabase.from("lead_product_assignments").select("id").eq("lead_id", leadId).eq("is_active", true),
  ]);
  const phone = normalizePhone(lead?.phone);
  const email = authResult.user?.email?.trim().toLowerCase();
  if (leadError || !phone) return { ok: false, message: "This lead needs a valid phone number before transcripts can be matched." };
  if (authError || !email || assignmentsError) return { ok: false, message: "Your CRM email or product assignments are unavailable for Altus Contact sync." };
  const automaticAssignmentId = leadAssignments?.length === 1 ? leadAssignments[0].id : null;
  try {
    const response = await altusContactsRequest<AltusCall>(`/calls/${callId}`);
    const call = response.data;
    if (!call) return { ok: false, message: "Altus Contact could not find that call." };
    if (call.user?.trim().toLowerCase() !== email) return { ok: false, message: "That call belongs to a different Altus Contact user." };
    if (!callHasPhone(call, phone)) return { ok: false, message: "That call's phone number does not match this lead." };
    const transcript = extractAltusTranscript(call);
    let { data: existingActivity } = await supabase.from("lead_activities").select("id").eq("lead_id", leadId).eq("activity_type", "call").contains("metadata", { source: "altus_contacts", call_id: callId }).maybeSingle();
    if (!existingActivity) {
      const { data: pendingDial } = await supabase.from("lead_activities").select("id").eq("lead_id", leadId).eq("activity_type", "call").contains("metadata", { source: "altus_contacts", request_id: callId }).maybeSingle();
      existingActivity = pendingDial;
    }
    const metadata = { source: "altus_contacts", call_id: callId, direction: call.direction ?? null, duration_seconds: call.duration_seconds ?? call.duration ?? null, started_at: call.started_at ?? call.created_at ?? null, transcript: transcript || null };
    if (existingActivity) {
      const { error: activityError } = await supabase.from("lead_activities").update({ note: altusCallActivityNote(call, transcript), metadata }).eq("id", existingActivity.id);
      if (activityError) throw new Error(activityError.message);
    } else {
      const { error: activityError } = await supabase.from("lead_activities").insert({ lead_id: leadId, lead_product_assignment_id: assignmentId, activity_type: "call", note: altusCallActivityNote(call, transcript), metadata, created_by: userId });
      if (activityError) throw new Error(activityError.message);
    }
    if (!transcript) { revalidatePath("/dashboard/leads"); return { ok: true, message: "Call direction, time, and duration were saved. The transcript is not available yet." }; }
    const { data: existing } = await supabase.from("lead_call_transcripts").select("id").eq("altus_call_id", callId).maybeSingle();
    const { error } = await supabase.from("lead_call_transcripts").upsert({ lead_id: leadId, lead_product_assignment_id: automaticAssignmentId, altus_call_id: callId, transcript_text: transcript, source_payload: call, updated_at: new Date().toISOString() }, { onConflict: "altus_call_id" });
    if (error) throw new Error(error.message);
    revalidatePath("/dashboard/leads");
    return { ok: true, message: existing ? "Transcript refreshed." : "Call transcript saved to this lead." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Unable to sync call transcript." };
  }
}

export async function attachTranscriptToProduct(formData: FormData) {
  const leadId = String(formData.get("leadId") ?? "");
  const transcriptId = String(formData.get("transcriptId") ?? "");
  const assignmentId = String(formData.get("assignmentId") ?? "");
  if (!leadId || !transcriptId || !assignmentId) throw new Error("Choose a transcript and product.");
  const { supabase, userId } = await getEditableLead(leadId, assignmentId);
  const [{ data: transcript, error: transcriptError }, { data: assignment, error: assignmentError }] = await Promise.all([
    supabase.from("lead_call_transcripts").select("id, altus_call_id").eq("id", transcriptId).eq("lead_id", leadId).single(),
    supabase.from("lead_product_assignments").select("id, product:lead_products(code)").eq("id", assignmentId).eq("lead_id", leadId).single(),
  ]);
  if (transcriptError || !transcript || assignmentError || !assignment) throw new Error("This transcript or product is no longer available.");
  const { error } = await supabase.from("lead_call_transcripts").update({ lead_product_assignment_id: assignmentId, updated_at: new Date().toISOString() }).eq("id", transcriptId);
  if (error) throw new Error(error.message);
  const product = Array.isArray(assignment.product) ? assignment.product[0] : assignment.product;
  const { error: activityError } = await supabase.from("lead_activities").insert({ lead_id: leadId, lead_product_assignment_id: assignmentId, activity_type: "transcript_attached", note: `Altus call transcript #${transcript.altus_call_id} attached to ${product?.code ?? "this product"}.`, metadata: { transcript_id: transcriptId, altus_call_id: transcript.altus_call_id }, created_by: userId });
  if (activityError) throw new Error(activityError.message);
  revalidatePath("/dashboard/leads");
}

export async function updateLeadDetails(formData: FormData) {
  const leadId = String(formData.get("leadId") ?? "");
  const assignmentId = String(formData.get("assignmentId") ?? "");
  const rawValues = String(formData.get("values") ?? "");
  if (!leadId) throw new Error("Lead is required.");
  let values: { key?: unknown; label?: unknown; value?: unknown }[];
  try { values = JSON.parse(rawValues); } catch { throw new Error("Invalid lead details."); }
  if (!Array.isArray(values) || values.length > 100) throw new Error("Invalid lead details.");

  const { supabase, userId } = await getEditableLead(leadId, assignmentId);
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
    const { error: activityError } = await supabase.from("lead_activities").insert({ lead_id: leadId, lead_product_assignment_id: assignmentId, activity_type: "details_updated", note: `Updated ${updatedFields.join(", ")}.`, metadata: { fields: updatedFields }, created_by: userId });
    if (activityError) throw new Error(activityError.message);
  }
  revalidatePath("/dashboard/leads");
}

export async function updateLeadProductInline(formData: FormData) {
  const leadId = String(formData.get("leadId") ?? "");
  const assignmentId = String(formData.get("assignmentId") ?? "");
  const productId = String(formData.get("productId") ?? "");
  if (!leadId || !productId) throw new Error("A lead and product are required.");
  const { supabase, userId } = await getEditableLead(leadId, assignmentId);
  const { data: product, error: productError } = await supabase.from("lead_products").select("id, code, name").eq("id", productId).eq("is_active", true).single();
  if (productError || !product) throw new Error("Choose an active product.");
  const { error } = await supabase.from("lead_product_assignments").update({ product_id: productId, stage_id: null, latest_resolution_id: null }).eq("id", assignmentId);
  if (error) throw new Error(error.message);
  const { error: activityError } = await supabase.from("lead_activities").insert({ lead_id: leadId, lead_product_assignment_id: assignmentId, activity_type: "product_updated", note: `Product changed to ${product.code || product.name}.`, metadata: { product_id: product.id }, created_by: userId });
  if (activityError) throw new Error(activityError.message);
  revalidatePath("/dashboard/leads");
}

export async function updateLeadStageInline(formData: FormData) {
  const leadId = String(formData.get("leadId") ?? "");
  const assignmentId = String(formData.get("assignmentId") ?? "");
  const stageId = String(formData.get("stageId") ?? "");
  if (!leadId || !stageId) throw new Error("A lead and stage are required.");
  const { supabase, lead, userId } = await getEditableLead(leadId, assignmentId);
  const { data: stage, error: stageError } = await supabase.from("lead_stages").select("id, name").eq("id", stageId).eq("product_id", lead.product_id).eq("is_active", true).single();
  if (stageError || !stage) throw new Error("Choose a stage for this lead's product.");
  const { error } = await supabase.from("lead_product_assignments").update({ stage_id: stageId }).eq("id", assignmentId);
  if (error) throw new Error(error.message);
  const { error: activityError } = await supabase.from("lead_activities").insert({ lead_id: leadId, lead_product_assignment_id: assignmentId, activity_type: "stage_updated", note: `Stage changed to ${stage.name}.`, metadata: { stage_id: stage.id }, created_by: userId });
  if (activityError) throw new Error(activityError.message);
  revalidatePath("/dashboard/leads");
}

export async function updateLeadResolutionInline(formData: FormData) {
  const leadId = String(formData.get("leadId") ?? "");
  const assignmentId = String(formData.get("assignmentId") ?? "");
  const resolutionId = String(formData.get("resolutionId") ?? "");
  const followUpAt = String(formData.get("followUpAt") ?? "");
  if (!leadId || !resolutionId) throw new Error("A lead and call resolution are required.");
  const followUpDate = followUpAt ? new Date(followUpAt) : null;
  if (followUpAt && (!followUpDate || Number.isNaN(followUpDate.getTime()))) throw new Error("Choose a valid follow-up date and time.");
  const { supabase, lead, userId } = await getEditableLead(leadId, assignmentId);
  const { data: mapping, error: mappingError } = await supabase.from("lead_product_resolutions").select("id").eq("product_id", lead.product_id).eq("resolution_id", resolutionId).maybeSingle();
  if (mappingError || !mapping) throw new Error("Choose a call resolution for this lead's product.");
  const update: { latest_resolution_id: string; next_follow_up_at?: string } = { latest_resolution_id: resolutionId };
  if (followUpDate) update.next_follow_up_at = followUpDate.toISOString();
  const { data: resolution } = await supabase.from("lead_resolutions").select("name").eq("id", resolutionId).single();
  const resolutionName = resolution?.name ?? "selected resolution";
  const releasesAssignment = ["dnd", "not interested"].includes(resolutionName.trim().toLowerCase());
  const { error: activityError } = await supabase.from("lead_activities").insert({ lead_id: leadId, lead_product_assignment_id: assignmentId, activity_type: "resolution_updated", note: `Call resolution set to ${resolutionName}.${releasesAssignment ? " Product work will return to Admin's unassigned pool." : ""}`, metadata: { resolution_id: resolutionId, released_to_admin_pool: releasesAssignment }, created_by: userId });
  if (activityError) throw new Error(activityError.message);
  if (releasesAssignment) {
    const { error: releaseActivityError } = await supabase.from("lead_activities").insert({ lead_id: leadId, lead_product_assignment_id: assignmentId, activity_type: "lead_released", note: `Released to Admin's unassigned pool after ${resolutionName}.`, metadata: { resolution_id: resolutionId, released_by: userId }, created_by: userId });
    if (releaseActivityError) throw new Error(releaseActivityError.message);
  }
  const { error } = await supabase.from("lead_product_assignments").update(releasesAssignment ? { ...update, assigned_to: null, assigned_at: null, focused_on: null, assignment_origin: "released" } : update).eq("id", assignmentId);
  if (error) throw new Error(error.message);
  if (followUpDate) {
    const { error: followUpActivityError } = await supabase.from("lead_activities").insert({ lead_id: leadId, lead_product_assignment_id: assignmentId, activity_type: "follow_up_scheduled", note: "Follow-up scheduled.", follow_up_at: followUpDate.toISOString(), created_by: userId });
    if (followUpActivityError) throw new Error(followUpActivityError.message);
  }
  revalidatePath("/dashboard/leads");
}

export async function updateLeadFollowUp(formData: FormData) {
  const leadId = String(formData.get("leadId") ?? "");
  const assignmentId = String(formData.get("assignmentId") ?? "");
  const followUpAt = String(formData.get("followUpAt") ?? "");
  const followUpDate = followUpAt ? new Date(followUpAt) : null;
  if (!leadId || !followUpDate || Number.isNaN(followUpDate.getTime())) throw new Error("Choose a valid follow-up date and time.");
  const { supabase, userId } = await getEditableLead(leadId, assignmentId);
  const { error } = await supabase.from("lead_product_assignments").update({ next_follow_up_at: followUpDate.toISOString() }).eq("id", assignmentId);
  if (error) throw new Error(error.message);
  const { error: activityError } = await supabase.from("lead_activities").insert({
    lead_id: leadId,
    lead_product_assignment_id: assignmentId,
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
  const assignmentId = String(formData.get("assignmentId") ?? "");
  const topic = String(formData.get("topic") ?? "").trim();
  const agenda = String(formData.get("agenda") ?? "").trim();
  const startTime = String(formData.get("startTime") ?? "");
  const duration = Number(formData.get("duration") ?? 0);
  const startDate = new Date(startTime);
  if (!leadId || !topic || topic.length > 200 || agenda.length > 2000 || !startTime || Number.isNaN(startDate.getTime()) || !Number.isInteger(duration) || duration < 5 || duration > 480) return { ok: false, message: "Enter a title, valid meeting time, and duration between 5 and 480 minutes." };

  const { supabase, lead, userId } = await getEditableLead(leadId, assignmentId);
  const { data: leadDetails, error: leadError } = await supabase.from("leads").select("first_name, last_name, email").eq("id", leadId).single();
  if (leadError || !leadDetails?.email) return { ok: false, message: "This lead needs an email address before sending a Zoom invitation." };
  const hostEmail = process.env.ZOOM_HOST_EMAIL?.trim();
  if (!hostEmail) return { ok: false, message: "Zoom host is not configured. Add ZOOM_HOST_EMAIL to .env.local." };

  try {
    const meeting = await createZoomMeeting({ hostEmail, topic, agenda, startTime: startDate.toISOString(), duration });
    const { error: saveError } = await supabase.from("lead_zoom_meetings").insert({ lead_id: lead.lead_id, zoom_meeting_id: String(meeting.id), host_user_id: userId, topic, agenda: agenda || null, start_time: startDate.toISOString(), duration_minutes: duration, join_url: meeting.join_url, start_url: meeting.start_url ?? null });
    if (saveError) throw new Error(saveError.message);
    const name = [leadDetails.first_name, leadDetails.last_name].filter(Boolean).join(" ") || "there";
    let inviteMessage = "Invitation email sent.";
    try { await sendLeadMeetingInvitation({ email: leadDetails.email, name, topic, agenda, startTime: startDate.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }), duration, joinUrl: meeting.join_url }); }
    catch { inviteMessage = "Meeting created, but the invitation email could not be sent. Check SMTP configuration."; }
    const { error: activityError } = await supabase.from("lead_activities").insert({ lead_id: lead.lead_id, lead_product_assignment_id: assignmentId, activity_type: "zoom_meeting_scheduled", note: `Zoom meeting scheduled: ${topic}. ${inviteMessage}`, metadata: { zoom_meeting_id: String(meeting.id), join_url: meeting.join_url, start_time: startDate.toISOString(), duration_minutes: duration }, created_by: userId });
    if (activityError) throw new Error(activityError.message);
    revalidatePath("/dashboard/leads");
    return { ok: true, message: inviteMessage, joinUrl: meeting.join_url };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Unable to schedule Zoom meeting." };
  }
}

export async function scheduleLeadGoogleMeet(formData: FormData): Promise<{ ok: boolean; message: string; meetUrl?: string }> {
  const leadId = String(formData.get("leadId") ?? "");
  const assignmentId = String(formData.get("assignmentId") ?? "");
  const topic = String(formData.get("topic") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const startTime = String(formData.get("startTime") ?? "");
  const duration = Number(formData.get("duration") ?? 0);
  const startDate = new Date(startTime);
  if (!leadId || !assignmentId || !topic || topic.length > 200 || description.length > 2000 || !startTime || Number.isNaN(startDate.getTime()) || !Number.isInteger(duration) || duration < 5 || duration > 480) return { ok: false, message: "Enter a title, valid meeting time, and duration between 5 and 480 minutes." };
  const { supabase, lead, userId } = await getEditableLead(leadId, assignmentId);
  const { data: leadDetails, error: leadError } = await supabase.from("leads").select("first_name, last_name, email").eq("id", leadId).single();
  if (leadError || !leadDetails?.email) return { ok: false, message: "This lead needs an email address before sending a Google Calendar invitation." };
  try {
    const meeting = await createGoogleMeetEvent({ topic, description, startTime: startDate.toISOString(), duration, attendeeEmail: leadDetails.email });
    const { error: saveError } = await supabase.from("lead_google_meetings").insert({ lead_id: lead.lead_id, lead_product_assignment_id: assignmentId, google_event_id: meeting.eventId, host_user_id: userId, topic, description: description || null, start_time: startDate.toISOString(), duration_minutes: duration, meet_url: meeting.meetUrl, calendar_url: meeting.calendarUrl });
    if (saveError) throw new Error(saveError.message);
    const { error: activityError } = await supabase.from("lead_activities").insert({ lead_id: lead.lead_id, lead_product_assignment_id: assignmentId, activity_type: "google_meet_scheduled", note: `Google Meet scheduled: ${topic}. Calendar invitation sent to ${leadDetails.email}.`, metadata: { google_event_id: meeting.eventId, meet_url: meeting.meetUrl, start_time: startDate.toISOString(), duration_minutes: duration }, created_by: userId });
    if (activityError) throw new Error(activityError.message);
    revalidatePath("/dashboard/leads");
    return { ok: true, message: "Google Meet created and Calendar invitation sent.", meetUrl: meeting.meetUrl };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Unable to schedule Google Meet." };
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

export async function savePreConfirmation(formData: FormData) {
  const leadId = String(formData.get("leadId") ?? "");
  const assignmentId = String(formData.get("assignmentId") ?? "");
  const field = String(formData.get("field") ?? "");
  const value = String(formData.get("value") ?? "").trim();
  if (!leadId || !assignmentId) throw new Error("Choose the lead to update.");

  const { supabase, lead, userId } = await getEditableLead(leadId, assignmentId);
  const { data: assignment, error: assignmentError } = await supabase.from("lead_product_assignments").select("product:lead_products(code), stage:lead_stages(name)").eq("id", assignmentId).single();
  const product = Array.isArray(assignment?.product) ? assignment.product[0] : assignment?.product;
  const stage = Array.isArray(assignment?.stage) ? assignment.stage[0] : assignment?.stage;
  if (assignmentError || product?.code?.toUpperCase() !== "PSO" || stage?.name?.toLowerCase() !== "pre pso") throw new Error("Confirmation details apply only to PSO leads in the Pre PSO stage.");

  if (field !== "notes") throw new Error("Unknown confirmation field.");
  if (value.length > 2000) throw new Error("Write confirmation notes of up to 2,000 characters.");
  const update = { confirmation_notes: value || null };

  const { error } = await supabase.from("lead_pre_pso_details").upsert({ assignment_id: assignmentId, lead_id: leadId, ...update, updated_by: userId, updated_at: new Date().toISOString() }, { onConflict: "assignment_id" });
  if (error) throw new Error(error.code === "42P01" || error.code === "PGRST205" ? "Pre PSO details are not set up yet. Run 20261025_create_lead_pre_pso_details.sql in the Supabase SQL Editor." : error.message);
}

// A user's choice in an admin-defined stage dropdown. An empty optionId clears the choice.
export async function saveStageDropdownValue(formData: FormData) {
  const leadId = String(formData.get("leadId") ?? "");
  const assignmentId = String(formData.get("assignmentId") ?? "");
  const dropdownId = String(formData.get("dropdownId") ?? "");
  const optionId = String(formData.get("optionId") ?? "");
  if (!leadId || !assignmentId || !dropdownId) throw new Error("Choose the lead to update.");

  const { supabase, userId } = await getEditableLead(leadId, assignmentId);
  const [{ data: assignment }, { data: dropdown }] = await Promise.all([
    supabase.from("lead_product_assignments").select("stage_id, product_id").eq("id", assignmentId).single(),
    supabase.from("lead_stage_dropdowns").select("id, stage_id, product_id").eq("id", dropdownId).eq("is_active", true).maybeSingle(),
  ]);
  if (!assignment || !dropdown || dropdown.stage_id !== assignment.stage_id || dropdown.product_id !== assignment.product_id) throw new Error("This dropdown does not apply to the lead's current stage.");

  if (!optionId) {
    const { error } = await supabase.from("lead_stage_dropdown_values").delete().eq("assignment_id", assignmentId).eq("dropdown_id", dropdownId);
    if (error) throw new Error(error.message);
    return;
  }
  const { data: option } = await supabase.from("lead_stage_dropdown_options").select("id").eq("id", optionId).eq("dropdown_id", dropdownId).eq("is_active", true).maybeSingle();
  if (!option) throw new Error("Choose one of the options listed for this dropdown.");
  const { error } = await supabase.from("lead_stage_dropdown_values").upsert({ assignment_id: assignmentId, dropdown_id: dropdownId, option_id: optionId, lead_id: leadId, updated_by: userId, updated_at: new Date().toISOString() }, { onConflict: "assignment_id,dropdown_id" });
  if (error) throw new Error(error.message);
}
