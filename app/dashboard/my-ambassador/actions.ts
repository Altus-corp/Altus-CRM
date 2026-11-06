"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/app/lib/auth";
import { createAdminClient } from "@/app/lib/supabase/admin";
import { notifyLeadMovedToAmbassador } from "@/app/lib/lead-notifications";
import { indiaToday } from "@/app/lib/lead-event-schedule";

const AGREEMENT_STATUSES = new Set(["Abandoned", "Agreement Sent", "Agreement Signed", "Not Pitched", "Pitched", "Query", "Said No", "Verbal Yes"]);

type AltusCorpExternalAmbassador = {
  id?: string;
  createdAt?: string;
  updatedAt?: string;
  status?: string;
  referralFeePercent?: number | string | null;
  agreementDate?: string | null;
  entityName?: string | null;
  entityType?: string | null;
  legalName?: string | null;
  designation?: string | null;
  ambassadorName?: string | null;
  email?: string | null;
  contactNumber?: string | null;
  address?: string | null;
  pan?: string | null;
  gstin?: string | null;
  bank?: {
    bankName?: string | null;
    accountHolderName?: string | null;
    accountNumber?: string | null;
    ifscCode?: string | null;
    invoiceEmail?: string | null;
  } | null;
  kyc?: {
    aadhaarOrGovId?: string | null;
    hasCancelledCheque?: boolean | null;
    hasPanCopy?: boolean | null;
    hasKycIdProof?: boolean | null;
    hasGstCertificate?: boolean | null;
  } | null;
  altusSignatory?: { name?: string | null; designation?: string | null; signedAt?: string | null } | null;
  approvedAt?: string | null;
  hasSignedPdf?: boolean | null;
};

export type AmbassadorInput = {
  firstName: string;
  lastName: string;
  cellNumber: string;
  salesPersonId: string;
  commission?: string;
  commissionNotes?: string;
  priority?: string;
  agreementStatus?: string;
  signedAgreementLink?: string;
  lastCalledOn?: string;
  lastCallNotes?: string;
  remark?: string;
  mananSirNotes?: string;
  targetLeads?: string;
  targetDemo?: string;
  targetProposals?: string;
  targetSales?: string;
};

function cleanText(value: unknown, max = 4000) {
  return String(value ?? "").trim().slice(0, max);
}

function workflowKey(value: unknown) {
  return cleanText(value, 200).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function normalizePhone(value: unknown) {
  const digits = cleanText(value, 40).replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : "";
}

function splitName(value: unknown) {
  const fullName = cleanText(value, 240);
  const [firstName = "", ...rest] = fullName.split(/\s+/).filter(Boolean);
  return { firstName, lastName: rest.join(" ") };
}

function mask(value: unknown, visible = 4) {
  const text = cleanText(value, 500);
  return text.length > visible ? `${"•".repeat(Math.max(4, text.length - visible))}${text.slice(-visible)}` : text;
}

function ambassadorFormMessage(record: AltusCorpExternalAmbassador) {
  // Do not copy raw bank-account numbers or government-ID values into the
  // sales workspace. The source API remains the authoritative KYC record.
  const rows = [
    ["External source", "AltusCorp Ambassador"],
    ["External status", cleanText(record.status, 120)],
    ["External updated at", cleanText(record.updatedAt, 120)],
    ["Agreement date", cleanText(record.agreementDate, 120)],
    ["Entity name", cleanText(record.entityName, 240)],
    ["Entity type", cleanText(record.entityType, 120)],
    ["Legal name", mask(record.legalName)],
    ["Designation", cleanText(record.designation, 160)],
    ["Address", cleanText(record.address, 2000)],
    ["PAN", mask(record.pan)],
    ["GSTIN", mask(record.gstin)],
    ["Bank", cleanText(record.bank?.bankName, 160)],
    ["Account holder", cleanText(record.bank?.accountHolderName, 240)],
    ["Account number", mask(record.bank?.accountNumber)],
    ["IFSC", mask(record.bank?.ifscCode)],
    ["Invoice email", cleanText(record.bank?.invoiceEmail, 254)],
    ["Cancelled cheque", String(Boolean(record.kyc?.hasCancelledCheque))],
    ["PAN copy", String(Boolean(record.kyc?.hasPanCopy))],
    ["KYC ID proof", String(Boolean(record.kyc?.hasKycIdProof))],
    ["GST certificate", String(Boolean(record.kyc?.hasGstCertificate))],
    ["Altus signatory", cleanText(record.altusSignatory?.name, 240)],
    ["Signatory designation", cleanText(record.altusSignatory?.designation, 160)],
    ["Signed at", cleanText(record.altusSignatory?.signedAt, 120)],
    ["Approved at", cleanText(record.approvedAt, 120)],
    ["Signed PDF", record.hasSignedPdf ? "Yes" : "No"],
  ].filter(([, value]) => value);
  return rows.map(([label, value]) => `${label}: ${value}`).join("\n");
}

function externalAmbassadorRecords(payload: unknown): AltusCorpExternalAmbassador[] {
  if (Array.isArray(payload)) return payload.filter((item): item is AltusCorpExternalAmbassador => Boolean(item) && typeof item === "object");
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  for (const candidate of [root.data, root.ambassadors, root.items, root.results]) {
    if (Array.isArray(candidate)) return candidate.filter((item): item is AltusCorpExternalAmbassador => Boolean(item) && typeof item === "object");
  }
  return [];
}

function parseInput(value: AmbassadorInput) {
  const firstName = cleanText(value.firstName, 120);
  const lastName = cleanText(value.lastName, 120);
  const cellNumber = cleanText(value.cellNumber, 30).replace(/\D/g, "").slice(-10);
  const salesPersonId = cleanText(value.salesPersonId, 36);
  const priorityText = cleanText(value.priority, 1);
  const priority = priorityText ? Number(priorityText) : null;
  const commissionText = cleanText(value.commission, 40).replace(/,/g, "");
  const commission = commissionText ? Number(commissionText) : null;
  const agreementStatus = cleanText(value.agreementStatus, 80);
  const signedAgreementLink = cleanText(value.signedAgreementLink, 2000);
  const lastCalledOn = cleanText(value.lastCalledOn, 40);
  const parseTarget = (target: unknown, label: string) => {
    const text = cleanText(target, 12);
    if (!text) return null;
    const number = Number(text);
    if (!Number.isInteger(number) || number < 0) throw new Error(`${label} must be a whole number of zero or more.`);
    return number;
  };
  if (!firstName || !lastName || !/^\d{10}$/.test(cellNumber)) throw new Error("First Name, Last Name, and a valid 10-digit Cell Number are required.");
  if (salesPersonId && !/^[0-9a-f-]{36}$/i.test(salesPersonId)) throw new Error("Choose a valid Sales Person.");
  if (priority !== null && ![1, 2, 3].includes(priority)) throw new Error("Priority must be 1, 2, or 3.");
  if (commission !== null && (!Number.isFinite(commission) || commission < 0)) throw new Error("Commission must be a valid positive amount.");
  if (agreementStatus && !AGREEMENT_STATUSES.has(agreementStatus)) throw new Error("Choose a valid Agreement Status.");
  if (signedAgreementLink) {
    try { new URL(signedAgreementLink); } catch { throw new Error("Signed Agreement Link must be a valid URL."); }
  }
  const parsedDate = lastCalledOn ? new Date(lastCalledOn) : null;
  if (parsedDate && Number.isNaN(parsedDate.getTime())) throw new Error("Last Called On must be a valid date.");
  return {
    firstName, lastName, cellNumber, salesPersonId: salesPersonId || null, priority, commission, agreementStatus: agreementStatus || null,
    commissionNotes: cleanText(value.commissionNotes), signedAgreementLink: signedAgreementLink || null,
    lastCalledOn: parsedDate?.toISOString() ?? null, lastCallNotes: cleanText(value.lastCallNotes),
    remark: cleanText(value.remark), mananSirNotes: cleanText(value.mananSirNotes),
    targetLeads: parseTarget(value.targetLeads, "Target Leads"),
    targetDemo: parseTarget(value.targetDemo, "Target Demo"),
    targetProposals: parseTarget(value.targetProposals, "Target Proposals"),
    targetSales: parseTarget(value.targetSales, "Target Sales"),
  };
}

async function requireAdmin() {
  const user = await requireUser();
  if (!user.roles.includes("admin")) throw new Error("Only an admin can manage Ambassador records.");
  return user;
}

type ExternalAmbassadorSyncResult = { ok: boolean; message: string; imported?: number; updated?: number; skipped?: number };

export async function syncAltusCorpAmbassadors(actorUserId?: string): Promise<ExternalAmbassadorSyncResult> {
  try {
    const actor = actorUserId ? { userId: actorUserId } : await requireAdmin();
    const apiKey = process.env.ALTUSCORP_EXTERNAL_LEADS_API_KEY?.trim();
    if (!apiKey) throw new Error("ALTUSCORP_EXTERNAL_LEADS_API_KEY is not configured.");
    const baseUrl = (process.env.ALTUSCORP_EXTERNAL_LEADS_API_BASE_URL?.trim() || "https://altuscorp.in/api/external").replace(/\/$/, "");
    const response = await fetch(`${baseUrl}/ambassadors`, { headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" }, cache: "no-store" });
    if (!response.ok) throw new Error(`AltusCorp Ambassador API returned ${response.status}.`);
    const records = externalAmbassadorRecords(await response.json());
    if (!records.length) return { ok: true, message: "AltusCorp Ambassador sync completed. No records were returned.", imported: 0, updated: 0, skipped: 0 };

    const supabase = createAdminClient();
    const [{ data: product }, { data: stages }, { data: resolutions }] = await Promise.all([
      supabase.from("lead_products").select("id").eq("code", "AMBASSADOR").eq("is_active", true).maybeSingle(),
      supabase.from("lead_stages").select("id, product_id, name").eq("is_active", true),
      supabase.from("lead_resolutions").select("id, name").eq("is_active", true),
    ]);
    if (!product) throw new Error("Create an active AMBASSADOR product before syncing Ambassador records.");
    const key = (value: string | null | undefined) => cleanText(value, 200).toLowerCase().replace(/[^a-z0-9]+/g, "");
    const preSales = (stages ?? []).find((stage) => stage.product_id === product.id && key(stage.name) === "presales");
    const onboarding = (stages ?? []).find((stage) => stage.product_id === product.id && key(stage.name) === "onboardingambassador");
    const agreementSent = (resolutions ?? []).find((resolution) => key(resolution.name) === "agreementsent");
    const agreementSigned = (resolutions ?? []).find((resolution) => ["agreementsignedwaived", "agreementsignedorwaived", "agreementsignedwaivedoff", "agreementsignedorwaivedoff"].includes(key(resolution.name)));
    if (!preSales || !onboarding || !agreementSent || !agreementSigned) throw new Error("Configure Pre Sales, Onboarding Ambassador, Agreement Sent, and Agreement Signed / Waived before syncing.");

    const source = "altuscorp_ambassador";
    const unique = [...new Map(records.filter((record) => cleanText(record.id, 120)).map((record) => [cleanText(record.id, 120), record])).values()];
    const ids = unique.map((record) => cleanText(record.id, 120));
    const phones = [...new Set(unique.map((record) => normalizePhone(record.contactNumber)).filter(Boolean))];
    const [{ data: mappings }, { data: legacy }, { data: byPhone }] = await Promise.all([
      supabase.from("lead_external_sources").select("external_id, lead_id").eq("source", source).in("external_id", ids),
      supabase.from("leads").select("id, external_id, phone_key, custom_data").eq("external_source", source).in("external_id", ids),
      phones.length ? supabase.from("leads").select("id, phone_key, custom_data").in("phone_key", phones) : Promise.resolve({ data: [] }),
    ]);
    const mapped = new Map<string, string>();
    for (const row of mappings ?? []) mapped.set(row.external_id, row.lead_id);
    for (const row of legacy ?? []) if (row.external_id) mapped.set(row.external_id, row.id);
    const mappedLeadIds = [...new Set((mappings ?? []).map((row) => row.lead_id))];
    const { data: mappedLeads } = mappedLeadIds.length
      ? await supabase.from("leads").select("id, phone_key, custom_data").in("id", mappedLeadIds)
      : { data: [] };
    const found = [...(legacy ?? []), ...(byPhone ?? []), ...(mappedLeads ?? [])];
    const leadById = new Map(found.map((lead) => [lead.id, lead]));
    const leadByPhone = new Map((byPhone ?? []).filter((lead) => lead.phone_key).map((lead) => [lead.phone_key as string, lead]));
    const leadIds = [...new Set(found.map((lead) => lead.id))];
    const { data: allAssignments } = leadIds.length ? await supabase.from("lead_product_assignments").select("lead_id, product_id, assigned_to, assigned_at, is_active").in("lead_id", leadIds) : { data: [] };
    const assignmentsByLead = new Map<string, NonNullable<typeof allAssignments>>();
    for (const assignment of allAssignments ?? []) assignmentsByLead.set(assignment.lead_id, [...(assignmentsByLead.get(assignment.lead_id) ?? []), assignment]);

    let imported = 0, updated = 0, skipped = 0;
    const skipReasons: string[] = [];
    for (const record of unique) {
      const externalId = cleanText(record.id, 120);
      const phone = normalizePhone(record.contactNumber);
      const names = splitName(record.ambassadorName || record.entityName);
      if (!phone || !names.firstName) { skipped += 1; if (skipReasons.length < 3) skipReasons.push("A source record is missing a valid name or 10-digit Cell Number."); continue; }
      const signed = record.hasSignedPdf === true;
      const priorLead = mapped.get(externalId) ? leadById.get(mapped.get(externalId)!) : leadByPhone.get(phone);
      const sourceState = priorLead?.custom_data && typeof priorLead.custom_data.altuscorp_ambassador === "object" && priorLead.custom_data.altuscorp_ambassador !== null
        ? priorLead.custom_data.altuscorp_ambassador as Record<string, unknown>
        : null;
      // Do not recreate an API record deliberately removed by an admin.
      if (sourceState?.locally_deleted_at) { skipped += 1; if (skipReasons.length < 3) skipReasons.push("A previously deleted Ambassador record was intentionally kept suppressed."); continue; }
      const owner = priorLead ? (assignmentsByLead.get(priorLead.id) ?? [])
        .filter((item) => item.assigned_to && item.is_active)
        .sort((a, b) => Number(b.product_id === product.id) - Number(a.product_id === product.id) || String(b.assigned_at ?? "").localeCompare(String(a.assigned_at ?? "")))[0]?.assigned_to ?? null : null;
      const customData = {
        ...(priorLead?.custom_data ?? {}), form_message: ambassadorFormMessage(record),
        altuscorp_ambassador: { external_id: externalId, updated_at: record.updatedAt ?? null, status: record.status ?? null, referral_fee_percent: record.referralFeePercent ?? null, agreement_date: record.agreementDate ?? null, has_signed_pdf: signed },
      };
      let leadId = priorLead?.id;
      if (leadId) {
        const { error } = await supabase.from("leads").update({ first_name: names.firstName, last_name: names.lastName || null, email: cleanText(record.email, 254) || null, phone, custom_data: customData, updated_at: new Date().toISOString() }).eq("id", leadId);
        if (error) { skipped += 1; if (skipReasons.length < 3) skipReasons.push(error.message); continue; }
        updated += 1;
      } else {
        const { data, error } = await supabase.from("leads").insert({ first_name: names.firstName, last_name: names.lastName || null, email: cleanText(record.email, 254) || null, phone, product_id: product.id, lead_database: "leads", external_source: source, external_id: externalId, custom_data: customData, created_by: actor.userId }).select("id").single();
        if (error || !data) { skipped += 1; if (skipReasons.length < 3) skipReasons.push(error?.message || "The CRM lead could not be created."); continue; }
        leadId = data.id; imported += 1;
      }
      const { data: assignment, error: assignmentError } = await supabase.from("lead_product_assignments").upsert({
        lead_id: leadId, product_id: product.id, stage_id: (signed ? onboarding : preSales).id, latest_resolution_id: (signed ? agreementSigned : agreementSent).id,
        assigned_to: owner, assigned_at: owner ? new Date().toISOString() : null, focused_on: !signed && owner ? indiaToday() : null,
        is_active: true, is_closed: signed, is_ambassador: signed, exclude_from_round_robin: true, assignment_origin: "import", created_by: actor.userId,
        ambassador_commission: record.referralFeePercent === null || record.referralFeePercent === undefined || record.referralFeePercent === "" ? null : Number(record.referralFeePercent),
        ambassador_agreement_status: signed ? "Agreement Signed" : "Agreement Sent",
      }, { onConflict: "lead_id,product_id" }).select("id").single();
      if (assignmentError || !assignment) { skipped += 1; if (skipReasons.length < 3) skipReasons.push(assignmentError?.message || "The Ambassador product assignment could not be created."); continue; }
      if (signed) await supabase.from("lead_product_assignments").update({ is_active: false, is_closed: true, focused_on: null, next_follow_up_at: null }).eq("lead_id", leadId).neq("product_id", product.id).eq("is_active", true).eq("is_closed", false);
      await supabase.from("lead_external_sources").upsert({ lead_id: leadId, source, external_id: externalId }, { onConflict: "source,external_id" });
      await supabase.from("lead_activities").insert({ lead_id: leadId, lead_product_assignment_id: assignment.id, activity_type: "altuscorp_ambassador_synced", note: `Ambassador agreement synced from AltusCorp (${signed ? "Onboarding Ambassador" : "Pre Sales"}).`, metadata: { external_id: externalId, has_signed_pdf: signed, updated_at: record.updatedAt ?? null }, created_by: actor.userId });
    }
    revalidatePath("/dashboard/my-ambassador"); revalidatePath("/dashboard/leads"); revalidatePath("/dashboard");
    return { ok: true, message: `AltusCorp Ambassador sync completed. ${imported} added, ${updated} updated${skipped ? `, ${skipped} skipped` : ""}.${skipReasons.length ? ` ${[...new Set(skipReasons)].join(" ")}` : ""}`, imported, updated, skipped };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Unable to sync AltusCorp Ambassadors." };
  }
}

async function saveRecord(input: AmbassadorInput) {
  const user = await requireAdmin();
  const data = parseInput(input);
  // This is an admin-only server action. Use the server admin client after
  // verifying the caller so imports are not blocked by a browser RLS policy
  // that may depend on the same assignment table being upserted.
  const supabase = createAdminClient();
  const [{ data: product }, { data: assignee }] = await Promise.all([
    supabase.from("lead_products").select("id").eq("code", "AMBASSADOR").eq("is_active", true).maybeSingle(),
    data.salesPersonId ? supabase.from("profiles").select("id").eq("id", data.salesPersonId).eq("is_suspended", false).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (!product) throw new Error("Create an active AMBASSADOR product before adding Ambassadors.");
  if (data.salesPersonId && !assignee) throw new Error("The selected Sales Person is not active.");

  // phone_key is the normalized last ten digits; this safely treats +91,
  // 91, spaces, and a plain Indian mobile number as the same lead.
  const { data: existing } = await supabase.from("leads").select("id, first_name, last_name").eq("phone_key", data.cellNumber).maybeSingle();
  let leadId = existing?.id;
  const { data: existingAssignments, error: existingAssignmentsError } = leadId
    ? await supabase
      .from("lead_product_assignments")
      .select("id, assigned_to, assigned_at")
      .eq("lead_id", leadId)
      .eq("is_active", true)
      .eq("is_ambassador", false)
      .order("assigned_at", { ascending: false, nullsFirst: false })
    : { data: [], error: null };
  if (existingAssignmentsError) throw new Error(existingAssignmentsError.message);
  const priorOwnerIds = [...new Set((existingAssignments ?? []).flatMap((assignment) => assignment.assigned_to ? [assignment.assigned_to] : []))];
  // If an administrator leaves Sales Person empty while converting an existing
  // lead, retain its current CRM owner rather than silently making it unassigned.
  const effectiveSalesPersonId = data.salesPersonId ?? existingAssignments?.find((assignment) => assignment.assigned_to)?.assigned_to ?? null;
  if (!leadId) {
    const { data: created, error } = await supabase.from("leads").insert({
      first_name: data.firstName, last_name: data.lastName, phone: data.cellNumber, product_id: product.id,
      assigned_to: effectiveSalesPersonId, assigned_at: effectiveSalesPersonId ? new Date().toISOString() : null,
      lead_database: "leads", created_by: user.userId,
    }).select("id").single();
    if (error || !created) throw new Error(error?.message || "Unable to create the Ambassador lead.");
    leadId = created.id;
  }
  const { data: assignment, error: assignmentError } = await supabase.from("lead_product_assignments").upsert({
    lead_id: leadId, product_id: product.id, is_ambassador: true, is_active: true, is_closed: true,
    assigned_to: effectiveSalesPersonId, assigned_at: effectiveSalesPersonId ? new Date().toISOString() : null, focused_on: null,
    ambassador_commission: data.commission, ambassador_commission_notes: data.commissionNotes || null,
    ambassador_priority: data.priority, ambassador_agreement_status: data.agreementStatus,
    ambassador_signed_agreement_link: data.signedAgreementLink, ambassador_last_called_on: data.lastCalledOn,
    ambassador_last_call_notes: data.lastCallNotes || null, ambassador_remark: data.remark || null,
    ambassador_manan_sir_notes: data.mananSirNotes || null, created_by: user.userId,
    ambassador_target_leads: data.targetLeads, ambassador_target_demo: data.targetDemo,
    ambassador_target_proposals: data.targetProposals, ambassador_target_sales: data.targetSales,
  }, { onConflict: "lead_id,product_id" }).select("id").single();
  if (assignmentError || !assignment) throw new Error(assignmentError?.message || "Unable to save Ambassador details.");

  const movedAssignmentIds = (existingAssignments ?? []).map((item) => item.id);
  if (movedAssignmentIds.length) {
    const { error: closeError } = await supabase
      .from("lead_product_assignments")
      .update({ is_active: false, is_closed: true, focused_on: null, next_follow_up_at: null, updated_at: new Date().toISOString() })
      .in("id", movedAssignmentIds);
    if (closeError) throw new Error(closeError.message);
  }

  const activityRows = [
    {
      lead_id: leadId, lead_product_assignment_id: assignment.id, activity_type: "ambassador_record_saved",
      note: `Ambassador record ${existing ? "updated" : "created"} by an administrator.`, created_by: user.userId,
    },
    ...movedAssignmentIds.map((assignmentId) => ({
      lead_id: leadId, lead_product_assignment_id: assignmentId, activity_type: "moved_to_ambassador",
      note: "Lead was moved from active CRM work to the Ambassador workspace.", created_by: user.userId,
    })),
  ];
  const { error: activityError } = await supabase.from("lead_activities").insert(activityRows);
  if (activityError) throw new Error(activityError.message);

  if (existing && movedAssignmentIds.length) {
    const leadName = [existing.first_name, existing.last_name].filter(Boolean).join(" ") || "A lead";
    await Promise.all(priorOwnerIds.map((ownerId) => notifyLeadMovedToAmbassador({ userId: ownerId, leadName })));
  }
  revalidatePath("/dashboard/my-ambassador");
  revalidatePath("/dashboard/leads");
  return { ok: true, message: existing ? "Ambassador record updated." : "Ambassador record created." };
}

export async function createAmbassador(input: AmbassadorInput) {
  try { return await saveRecord(input); } catch (error) { return { ok: false, message: error instanceof Error ? error.message : "Unable to save Ambassador." }; }
}

export async function importAmbassadors(rows: AmbassadorInput[]) {
  try {
    await requireAdmin();
    if (!Array.isArray(rows) || !rows.length || rows.length > 500) throw new Error("Upload between 1 and 500 Ambassador records at a time.");
    let imported = 0; let skipped = 0; const errors: string[] = [];
    for (const [index, row] of rows.entries()) {
      const result = await createAmbassador(row);
      if (result.ok) imported += 1; else { skipped += 1; if (errors.length < 3) errors.push(`Row ${index + 2}: ${result.message}`); }
    }
    return { ok: imported > 0, message: `${imported} Ambassador record${imported === 1 ? "" : "s"} imported${skipped ? `; ${skipped} skipped` : ""}.${errors.length ? ` ${errors.join(" ")}` : ""}` };
  } catch (error) { return { ok: false, message: error instanceof Error ? error.message : "Unable to import Ambassadors." }; }
}

/** Removes only the Ambassador product assignment. The lead itself remains in
 * CRM and receives a deletion audit entry without being re-imported by sync. */
export async function deleteAmbassadorRecords(assignmentIds: string[]) {
  try {
    const user = await requireAdmin();
    const ids = [...new Set((Array.isArray(assignmentIds) ? assignmentIds : []).filter((id) => /^[0-9a-f-]{36}$/i.test(id)))];
    if (!ids.length || ids.length > 100) throw new Error("Select between 1 and 100 Ambassador records.");
    const supabase = createAdminClient();
    const [{ data: product }, { data: records, error: recordsError }] = await Promise.all([
      supabase.from("lead_products").select("id").eq("code", "AMBASSADOR").maybeSingle(),
      supabase.from("lead_product_assignments").select("id, lead_id, product_id").in("id", ids).eq("is_active", true),
    ]);
    if (!product || recordsError) throw new Error(recordsError?.message || "AMBASSADOR product is not configured.");
    const valid = (records ?? []).filter((record) => record.product_id === product.id);
    if (!valid.length) throw new Error("No active Ambassador records were selected.");
    // Onboarded records are protected by retain_ambassador_assignment, which
    // intentionally turns normal "inactive" updates back on. Deleting the
    // selected product assignment is the explicit administrator removal path.
    const { error } = await supabase.from("lead_product_assignments").delete().in("id", valid.map((record) => record.id));
    if (error) throw new Error(error.message);
    const { data: deletedLeads } = await supabase.from("leads").select("id, custom_data").in("id", valid.map((record) => record.lead_id));
    const deletedAt = new Date().toISOString();
    await Promise.all((deletedLeads ?? []).map((lead) => {
      const priorSource = lead.custom_data && typeof lead.custom_data.altuscorp_ambassador === "object" && lead.custom_data.altuscorp_ambassador !== null
        ? lead.custom_data.altuscorp_ambassador as Record<string, unknown>
        : {};
      return supabase.from("leads").update({
        custom_data: { ...(lead.custom_data ?? {}), altuscorp_ambassador: { ...priorSource, locally_deleted_at: deletedAt } },
      }).eq("id", lead.id);
    }));
    await supabase.from("lead_activities").insert(valid.map((record) => ({
      lead_id: record.lead_id, lead_product_assignment_id: null, activity_type: "ambassador_record_deleted",
      note: "Ambassador product record removed by an administrator. The original lead remains in CRM.", created_by: user.userId,
    })));
    revalidatePath("/dashboard/my-ambassador");
    revalidatePath("/dashboard/leads");
    return { ok: true, message: `${valid.length} Ambassador record${valid.length === 1 ? "" : "s"} deleted.` };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Unable to delete Ambassador records." };
  }
}

export async function updateAmbassadorDetails(assignmentId: string, input: Omit<AmbassadorInput, "firstName" | "lastName" | "cellNumber">) {
  try {
    const user = await requireAdmin();
    if (!/^[0-9a-f-]{36}$/i.test(assignmentId)) throw new Error("Invalid Ambassador record.");
    const supabase = createAdminClient();
    const { data: assignment } = await supabase.from("lead_product_assignments").select("lead_id, product_id, assigned_to, is_ambassador").eq("id", assignmentId).maybeSingle();
    if (!assignment) throw new Error("Ambassador record not found.");
    const { data: product } = await supabase.from("lead_products").select("code").eq("id", assignment.product_id).maybeSingle();
    if (workflowKey(product?.code) !== "ambassador") throw new Error("Ambassador record not found.");
    const data = parseInput({ ...input, firstName: "Record", lastName: "Update", cellNumber: "9999999999" });
    const patch: Record<string, unknown> = {
      assigned_to: data.salesPersonId, assigned_at: data.salesPersonId ? new Date().toISOString() : null,
      ambassador_commission: data.commission, ambassador_commission_notes: data.commissionNotes || null,
      ambassador_priority: data.priority, ambassador_agreement_status: data.agreementStatus,
      ambassador_signed_agreement_link: data.signedAgreementLink, ambassador_last_called_on: data.lastCalledOn,
      ambassador_last_call_notes: data.lastCallNotes || null, ambassador_remark: data.remark || null,
      ambassador_manan_sir_notes: data.mananSirNotes || null, updated_at: new Date().toISOString(),
      ambassador_target_leads: data.targetLeads, ambassador_target_demo: data.targetDemo,
      ambassador_target_proposals: data.targetProposals, ambassador_target_sales: data.targetSales,
    };

    // Agreement Status is not merely display text: it controls the real
    // product resolution and stage that power the Pre Sales/Onboarding views.
    if (data.agreementStatus === "Agreement Signed") {
      const [{ data: stages, error: stagesError }, { data: resolutions, error: resolutionsError }] = await Promise.all([
        supabase.from("lead_stages").select("id, name").eq("product_id", assignment.product_id).eq("is_active", true),
        supabase.from("lead_resolutions").select("id, name").eq("is_active", true),
      ]);
      if (stagesError || resolutionsError) throw new Error(stagesError?.message || resolutionsError?.message || "Unable to load the Ambassador workflow.");
      const onboarding = (stages ?? []).find((stage) => workflowKey(stage.name) === "onboardingambassador");
      const signed = (resolutions ?? []).find((resolution) => ["agreementsignedwaived", "agreementsignedorwaived", "agreementsignedwaivedoff", "agreementsignedorwaivedoff"].includes(workflowKey(resolution.name)));
      if (!onboarding || !signed) throw new Error("Configure Onboarding Ambassador and Agreement Signed / Waived before marking this Ambassador as signed.");
      Object.assign(patch, {
        stage_id: onboarding.id,
        latest_resolution_id: signed.id,
        is_ambassador: true,
        is_active: true,
        is_closed: true,
        focused_on: null,
        next_follow_up_at: null,
      });
    } else if (data.agreementStatus === "Agreement Sent" && !assignment.is_ambassador) {
      const [{ data: stages, error: stagesError }, { data: resolutions, error: resolutionsError }] = await Promise.all([
        supabase.from("lead_stages").select("id, name").eq("product_id", assignment.product_id).eq("is_active", true),
        supabase.from("lead_resolutions").select("id, name").eq("is_active", true),
      ]);
      if (stagesError || resolutionsError) throw new Error(stagesError?.message || resolutionsError?.message || "Unable to load the Ambassador workflow.");
      const preSales = (stages ?? []).find((stage) => workflowKey(stage.name) === "presales");
      const sent = (resolutions ?? []).find((resolution) => workflowKey(resolution.name) === "agreementsent");
      if (!preSales || !sent) throw new Error("Configure Pre Sales and Agreement Sent before saving this Ambassador.");
      Object.assign(patch, { stage_id: preSales.id, latest_resolution_id: sent.id, is_active: true, is_closed: false });
    }

    const { error } = await supabase.from("lead_product_assignments").update(patch).eq("id", assignmentId);
    if (error) throw new Error(error.message);
    const workflowNote = data.agreementStatus === "Agreement Signed" ? " Moved from Pre Sales to Onboarding Ambassador." : "";
    await supabase.from("lead_activities").insert({ lead_id: assignment.lead_id, lead_product_assignment_id: assignmentId, activity_type: "ambassador_record_updated", note: `Ambassador commercial details updated by an administrator.${workflowNote}`, created_by: user.userId });
    revalidatePath("/dashboard/my-ambassador");
    revalidatePath("/dashboard/senior-ambassadors");
    return { ok: true, message: "Ambassador details saved." };
  } catch (error) { return { ok: false, message: error instanceof Error ? error.message : "Unable to update Ambassador." }; }
}

export type AmbassadorActualMetric = "leads" | "demo" | "proposals";
export type AmbassadorActualBreakdownItem = {
  id: string;
  fullName: string;
  cellNumber: string | null;
  email: string | null;
  product: string | null;
  resolution: string | null;
};

export async function getAmbassadorActualBreakdown(assignmentId: string, metric: AmbassadorActualMetric) {
  try {
    const user = await requireUser();
    if (!user.roles.some((role) => role === "sales_executive" || role === "sales_manager")) throw new Error("Only sales users can view Ambassador performance details.");
    if (!/^[0-9a-f-]{36}$/i.test(assignmentId) || !["leads", "demo", "proposals"].includes(metric)) throw new Error("Invalid Ambassador metric request.");
    const supabase = createAdminClient();
    const { data: ambassadorRecord, error: recordError } = await supabase
      .from("lead_product_assignments")
      .select("lead_id, assigned_to, is_ambassador, ambassador_user_id")
      .eq("id", assignmentId)
      .maybeSingle();
    if (recordError || !ambassadorRecord?.is_ambassador || ambassadorRecord.assigned_to !== user.userId) {
      throw new Error("This Ambassador record is not available to you.");
    }
    let ambassadorUserId = ambassadorRecord.ambassador_user_id;
    // Older Ambassador records may predate ambassador_user_id. Repair that
    // link on first use from the same normalized Indian mobile number.
    if (!ambassadorUserId) {
      const [{ data: ambassadorLead }, { data: profiles }, { data: roles }] = await Promise.all([
        supabase.from("leads").select("phone").eq("id", ambassadorRecord.lead_id).maybeSingle(),
        supabase.from("profiles").select("id, phone").not("phone", "is", null),
        supabase.from("user_roles").select("user_id").eq("role", "ambassador"),
      ]);
      const ambassadorIds = new Set((roles ?? []).map((role) => role.user_id));
      const phone = normalizePhone(ambassadorLead?.phone);
      ambassadorUserId = phone ? profiles?.find((profile) => ambassadorIds.has(profile.id) && normalizePhone(profile.phone) === phone)?.id ?? null : null;
      if (ambassadorUserId) {
        await supabase.from("lead_product_assignments")
          .update({ ambassador_user_id: ambassadorUserId, updated_at: new Date().toISOString() })
          .eq("id", assignmentId);
      }
    }
    if (!ambassadorUserId) throw new Error("This Ambassador is not linked to an Ambassador login with the same Cell Number. Ask an admin to add or correct the Ambassador profile Cell Number.");
    const { data: shares, error: sharesError } = await supabase
      .from("lead_channel_partners")
      .select("lead_id")
      .eq("ambassador_id", ambassadorUserId);
    if (sharesError) throw new Error(sharesError.message);
    const leadIds = [...new Set((shares ?? []).map((share) => share.lead_id))];
    if (!leadIds.length) return { ok: true, items: [] as AmbassadorActualBreakdownItem[] };

    const { data: leads, error: leadsError } = await supabase
      .from("leads")
      .select("id, first_name, last_name, phone, email")
      .in("id", leadIds);
    if (leadsError) throw new Error(leadsError.message);
    if (metric === "leads") {
      return {
        ok: true,
        items: (leads ?? []).map((lead) => ({
          id: lead.id,
          fullName: [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Unnamed lead",
          cellNumber: lead.phone,
          email: lead.email,
          product: null,
          resolution: null,
        })),
      };
    }

    const { data: work, error: workError } = await supabase
      .from("lead_product_assignments")
      .select("lead_id, product:lead_products(code, name), resolution:lead_resolutions(name)")
      .in("lead_id", leadIds);
    if (workError) throw new Error(workError.message);
    const qualifying = new Map<string, { product: string; resolution: string }>();
    const normalized = (value: string | null | undefined) => cleanText(value, 120).toLowerCase().replace(/[^a-z0-9]+/g, "");
    for (const item of work ?? []) {
      const product = Array.isArray(item.product) ? item.product[0] ?? null : item.product;
      const resolution = Array.isArray(item.resolution) ? item.resolution[0] ?? null : item.resolution;
      const productCode = normalized(product?.code);
      const resolutionName = normalized(resolution?.name);
      const matches = metric === "demo"
        ? ((["keynote", "retainer", "ambassador"].includes(productCode) && resolutionName === "pitched") || (productCode === "altusos" && resolutionName === "demogiven"))
        : ((["keynote", "retainer", "altusos"].includes(productCode) && resolutionName === "proposalsent") || (productCode === "ambassador" && resolutionName === "agreementsent"));
      if (matches && !qualifying.has(item.lead_id)) qualifying.set(item.lead_id, { product: product?.name || product?.code || "Product", resolution: resolution?.name || "" });
    }
    return {
      ok: true,
      items: (leads ?? []).flatMap((lead) => {
        const outcome = qualifying.get(lead.id);
        return outcome ? [{
          id: lead.id,
          fullName: [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Unnamed lead",
          cellNumber: lead.phone,
          email: lead.email,
          product: outcome.product,
          resolution: outcome.resolution,
        }] : [];
      }),
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Unable to load Ambassador performance details.", items: [] as AmbassadorActualBreakdownItem[] };
  }
}

export async function updateAmbassadorActuals(assignmentId: string, input: { actualSales: string }) {
  try {
    const user = await requireUser();
    if (!user.roles.some((role) => role === "sales_executive" || role === "sales_manager")) throw new Error("Only sales users can update Ambassador actuals.");
    if (!/^[0-9a-f-]{36}$/i.test(assignmentId)) throw new Error("Invalid Ambassador record.");
    const parseActual = (value: string, label: string) => {
      const text = cleanText(value, 12);
      const number = text ? Number(text) : 0;
      if (!Number.isInteger(number) || number < 0) throw new Error(`${label} must be a whole number of zero or more.`);
      return number;
    };
    const actuals = {
      ambassador_actual_sales: parseActual(input.actualSales, "Actual Sales"),
    };
    const supabase = createAdminClient();
    const { data: assignment } = await supabase.from("lead_product_assignments").select("lead_id, assigned_to, is_ambassador").eq("id", assignmentId).maybeSingle();
    if (!assignment?.is_ambassador || assignment.assigned_to !== user.userId) throw new Error("You can update actuals only for your own Ambassador records.");
    const { error } = await supabase.from("lead_product_assignments").update({ ...actuals, updated_at: new Date().toISOString() }).eq("id", assignmentId);
    if (error) throw new Error(error.message);
    await supabase.from("lead_activities").insert({ lead_id: assignment.lead_id, lead_product_assignment_id: assignmentId, activity_type: "ambassador_actuals_updated", note: "Ambassador actual targets updated by the assigned sales user.", metadata: actuals, created_by: user.userId });
    revalidatePath("/dashboard/my-ambassador");
    return { ok: true, message: "Actuals saved." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Unable to save Ambassador actuals." };
  }
}
