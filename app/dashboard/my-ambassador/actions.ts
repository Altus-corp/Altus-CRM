"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/app/lib/auth";
import { sendAccountCredentials } from "@/app/lib/email";
import { createAdminClient } from "@/app/lib/supabase/admin";
import { notifyLeadMovedToAmbassador } from "@/app/lib/lead-notifications";
import { indiaToday } from "@/app/lib/lead-event-schedule";
import { getSalesManagerTeamMemberIds } from "@/app/lib/sales-manager-team";

const AGREEMENT_STATUSES = new Set(["Abandoned", "Agreement Sent", "Agreement Signed", "Not Pitched", "Pitched", "Query", "Said No", "Verbal Yes"]);
const SIGNED_RESOLUTION_KEYS = ["agreementsignedwaived", "agreementsignedorwaived", "agreementsignedwaivedoff", "agreementsignedorwaivedoff"];

// Agreement Status is not merely display text: it controls the real stage
// and resolution that power the Pre Sales/Onboarding Ambassador views.
// "Agreement Signed" (in whichever spelling the Signed/Waived resolution is
// configured with) is the only outcome that reaches Onboarding Ambassador;
// every other outcome belongs in Pre Sales until it is signed, so every
// write path (manual create, admin edit, sales status change, document
// upload) must resolve the same stage/resolution for a given status.
async function resolveAmbassadorWorkflowPatch(supabase: ReturnType<typeof createAdminClient>, productId: string, agreementStatus: string) {
  const [{ data: stages, error: stagesError }, { data: resolutions, error: resolutionsError }] = await Promise.all([
    supabase.from("lead_stages").select("id, name").eq("product_id", productId).eq("is_active", true),
    supabase.from("lead_resolutions").select("id, name").eq("is_active", true),
  ]);
  if (stagesError || resolutionsError) throw new Error(stagesError?.message || resolutionsError?.message || "Unable to load the Ambassador workflow.");
  const patch: Record<string, unknown> = { is_ambassador: true, is_active: true };
  if (agreementStatus === "Agreement Signed") {
    const onboarding = (stages ?? []).find((stage) => workflowKey(stage.name) === "onboardingambassador");
    const signed = (resolutions ?? []).find((resolution) => SIGNED_RESOLUTION_KEYS.includes(workflowKey(resolution.name)));
    if (!onboarding || !signed) throw new Error("Configure Onboarding Ambassador and Agreement Signed / Waived before marking this Ambassador as signed.");
    return Object.assign(patch, { stage_id: onboarding.id, latest_resolution_id: signed.id, is_closed: true, focused_on: null, next_follow_up_at: null });
  }
  const preSales = (stages ?? []).find((stage) => workflowKey(stage.name) === "presales");
  if (!preSales) throw new Error("Configure Pre Sales before saving this Ambassador.");
  patch.stage_id = preSales.id;
  patch.is_closed = false;
  const matchedResolution = (resolutions ?? []).find((resolution) => workflowKey(resolution.name) === workflowKey(agreementStatus));
  if (matchedResolution) patch.latest_resolution_id = matchedResolution.id;
  return patch;
}

// A one-time admin fix for Ambassador records created before stage/resolution
// routing existed on every write path. Reads whichever resolution each
// record already carries (set by hand on the lead) and moves its stage to
// match — Onboarding Ambassador if that resolution is a Signed/Waived
// variant, Pre Sales otherwise — without anyone re-selecting anything.
export async function backfillAmbassadorWorkflowStages(): Promise<{ ok: boolean; message: string }> {
  try {
    const user = await requireAdmin();
    const supabase = createAdminClient();
    const { data: product, error: productError } = await supabase.from("lead_products").select("id").eq("code", "AMBASSADOR").maybeSingle();
    if (productError || !product) throw new Error("AMBASSADOR product is not configured.");
    const [{ data: stages, error: stagesError }, { data: resolutions, error: resolutionsError }] = await Promise.all([
      supabase.from("lead_stages").select("id, name").eq("product_id", product.id).eq("is_active", true),
      supabase.from("lead_resolutions").select("id, name").eq("is_active", true),
    ]);
    if (stagesError || resolutionsError) throw new Error(stagesError?.message || resolutionsError?.message || "Unable to load the Ambassador workflow.");
    const preSales = (stages ?? []).find((stage) => workflowKey(stage.name) === "presales");
    const onboarding = (stages ?? []).find((stage) => workflowKey(stage.name) === "onboardingambassador");
    if (!preSales || !onboarding) throw new Error("Configure Pre Sales and Onboarding Ambassador stages before running this.");
    const signedResolutionIds = new Set((resolutions ?? []).filter((resolution) => SIGNED_RESOLUTION_KEYS.includes(workflowKey(resolution.name))).map((resolution) => resolution.id));
    const resolutionNameById = new Map((resolutions ?? []).map((resolution) => [resolution.id, resolution.name]));

    const { data: assignments, error: assignmentsError } = await supabase
      .from("lead_product_assignments")
      .select("id, lead_id, latest_resolution_id, stage_id, ambassador_agreement_status")
      .eq("product_id", product.id)
      .eq("is_active", true);
    if (assignmentsError) throw new Error(assignmentsError.message);

    let movedToOnboarding = 0;
    let movedToPreSales = 0;
    for (const assignment of assignments ?? []) {
      const isSigned = Boolean(assignment.latest_resolution_id && signedResolutionIds.has(assignment.latest_resolution_id));
      const resolutionName = assignment.latest_resolution_id ? resolutionNameById.get(assignment.latest_resolution_id) ?? null : null;
      const patch: Record<string, unknown> = {
        is_ambassador: true,
        stage_id: isSigned ? onboarding.id : preSales.id,
        is_closed: isSigned,
        updated_at: new Date().toISOString(),
      };
      if (isSigned) {
        patch.ambassador_agreement_status = "Agreement Signed";
        patch.focused_on = null;
        patch.next_follow_up_at = null;
      } else if (resolutionName && AGREEMENT_STATUSES.has(resolutionName)) {
        patch.ambassador_agreement_status = resolutionName;
      }
      const { error } = await supabase.from("lead_product_assignments").update(patch).eq("id", assignment.id);
      if (error) throw new Error(error.message);
      await supabase.from("lead_activities").insert({
        lead_id: assignment.lead_id,
        lead_product_assignment_id: assignment.id,
        activity_type: "ambassador_record_updated",
        note: `Ambassador stage synced to its current resolution (moved to ${isSigned ? "Onboarding Ambassador" : "Pre Sales"}).`,
        created_by: user.userId,
      });
      if (isSigned) movedToOnboarding += 1; else movedToPreSales += 1;
    }
    revalidatePath("/dashboard/my-ambassador");
    revalidatePath("/dashboard/leads");
    revalidatePath("/dashboard/senior-ambassadors");
    const total = movedToOnboarding + movedToPreSales;
    return { ok: true, message: total ? `${total} Ambassador record${total === 1 ? "" : "s"} synced (${movedToOnboarding} to Onboarding Ambassador, ${movedToPreSales} to Pre Sales).` : "No Ambassador records needed syncing." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Unable to sync Ambassador stages." };
  }
}

type AltusCorpExternalAmbassador = {
  id?: string;
  createdAt?: string;
  updatedAt?: string;
  status?: string;
  referralFeePercent?: number | string | null;
  agreementDate?: string | null;
  agreementAcceptedAt?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  city?: string | null;
  entityName?: string | null;
  entityType?: string | null;
  legalName?: string | null;
  designation?: string | null;
  ambassadorName?: string | null;
  email?: string | null;
  contactNumber?: string | null;
  address?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  state?: string | null;
  postalCode?: string | null;
  landmark?: string | null;
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
    aadhaarNumber?: string | null;
    aadhaarOrGovId?: string | null;
    documentsUploaded?: {
      cancelledCheque?: boolean | null;
      selfie?: boolean | null;
      panCopy?: boolean | null;
      kycIdProof?: boolean | null;
      gstCertificate?: boolean | null;
    } | null;
    hasCancelledCheque?: boolean | null;
    hasPanCopy?: boolean | null;
    hasKycIdProof?: boolean | null;
    hasGstCertificate?: boolean | null;
  } | null;
  altusSignatory?: { name?: string | null; designation?: string | null; signedAt?: string | null } | null;
  approvedAt?: string | null;
  hasSignedPdf?: boolean | null;
  // Each entry is a short-lived (5-minute) signed Supabase Storage URL, so it
  // is never stored directly. The lead instead gets a link to our own proxy
  // route, which re-fetches a fresh URL from AltusCorp at click time.
  documents?: Partial<Record<"selfie" | "panCopy" | "cancelledCheque" | "kycIdProof" | "gstCertificate" | "ambassadorSignature" | "altusSignature", { url?: string | null; path?: string | null; expiresIn?: number | null } | null>> | null;
};

export type AmbassadorInput = {
  firstName: string;
  lastName: string;
  cellNumber: string;
  email?: string | null;
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

export type CreateAmbassadorAccountState = {
  error?: string;
  success?: string;
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

function generateAmbassadorPassword() {
  return `Altus!${randomBytes(9).toString("base64url")}`;
}

function isValidAccountPassword(password: string) {
  return password.length >= 12 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password);
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

function yesNo(value: boolean | null | undefined) {
  return value === true ? "Yes" : value === false ? "No" : "";
}

function ambassadorFormMessage(record: AltusCorpExternalAmbassador) {
  // Do not copy raw bank-account numbers or government-ID values into the
  // sales workspace. The source API remains the authoritative KYC record.
  const rows = [
    ["External source", "AltusCorp Ambassador"],
    ["External record ID", cleanText(record.id, 120)],
    ["External created at", cleanText(record.createdAt, 120)],
    ["External status", cleanText(record.status, 120)],
    ["External updated at", cleanText(record.updatedAt, 120)],
    ["Ambassador name", cleanText(record.ambassadorName, 240)],
    ["Contact number", cleanText(record.contactNumber, 40)],
    ["Email", cleanText(record.email, 254)],
    ["Referral fee percent", cleanText(record.referralFeePercent, 40)],
    ["Agreement date", cleanText(record.agreementDate, 120)],
    ["Agreement accepted at", cleanText(record.agreementAcceptedAt, 120)],
    ["First name", cleanText(record.firstName, 120)],
    ["Last name", cleanText(record.lastName, 120)],
    ["City", cleanText(record.city, 160)],
    ["Entity name", cleanText(record.entityName, 240)],
    ["Entity type", cleanText(record.entityType, 120)],
    ["Legal name", mask(record.legalName)],
    ["Designation", cleanText(record.designation, 160)],
    ["Address", cleanText(record.address, 2000)],
    ["Address line 1", cleanText(record.addressLine1, 600)],
    ["Address line 2", cleanText(record.addressLine2, 600)],
    ["State", cleanText(record.state, 160)],
    ["Postal code", cleanText(record.postalCode, 40)],
    ["Landmark", cleanText(record.landmark, 400)],
    ["PAN", mask(record.pan)],
    ["GSTIN", mask(record.gstin)],
    ["Bank", cleanText(record.bank?.bankName, 160)],
    ["Account holder", cleanText(record.bank?.accountHolderName, 240)],
    ["Account number", mask(record.bank?.accountNumber)],
    ["IFSC", mask(record.bank?.ifscCode)],
    ["Invoice email", cleanText(record.bank?.invoiceEmail, 254)],
    ["Cancelled cheque", yesNo(record.kyc?.documentsUploaded?.cancelledCheque ?? record.kyc?.hasCancelledCheque)],
    ["Selfie uploaded", yesNo(record.kyc?.documentsUploaded?.selfie)],
    ["PAN copy", yesNo(record.kyc?.documentsUploaded?.panCopy ?? record.kyc?.hasPanCopy)],
    ["KYC ID proof", yesNo(record.kyc?.documentsUploaded?.kycIdProof ?? record.kyc?.hasKycIdProof)],
    ["Government ID / Aadhaar", mask(record.kyc?.aadhaarNumber ?? record.kyc?.aadhaarOrGovId)],
    ["GST certificate", yesNo(record.kyc?.documentsUploaded?.gstCertificate ?? record.kyc?.hasGstCertificate)],
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
  // Excel/Word paste often leaves invisible Unicode whitespace (non-breaking
  // space, zero-width space/joiner, BOM) inside the text, which looks correct
  // but fails the regex below — strip it rather than reject a valid-looking
  // email outright.
  const email = cleanText(value.email, 254).toLowerCase().replace(/[ ​‌‍﻿]/g, "").trim();
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
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(`Email "${email}" is not a valid email address.`);
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
    firstName, lastName, cellNumber, email: email || null, salesPersonId: salesPersonId || null, priority, commission, agreementStatus: agreementStatus || null,
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

// Sales Managers and Sales Executives can create/import their own Ambassador
// records through the same template admins use, but never assign Ambassador
// ownership to anyone else — that still requires an admin.
async function requireAmbassadorManager() {
  const user = await requireUser();
  const isAdmin = user.roles.includes("admin");
  if (!isAdmin && !user.roles.some((role) => role === "sales_executive" || role === "sales_manager")) {
    throw new Error("Only an admin, Sales Manager, or Sales Executive can manage Ambassador records.");
  }
  return { ...user, isAdmin };
}

export async function createAmbassadorAccount(
  _previousState: CreateAmbassadorAccountState,
  formData: FormData,
): Promise<CreateAmbassadorAccountState> {
  const actor = await requireUser();
  if (!actor.roles.some((role) => role === "sales_executive" || role === "sales_manager")) {
    return { error: "Only Sales Executives and Sales Managers can create Ambassador accounts." };
  }

  const firstName = cleanText(formData.get("firstName"), 120);
  const lastName = cleanText(formData.get("lastName"), 120);
  const email = cleanText(formData.get("email"), 254).toLowerCase();
  const phone = normalizePhone(formData.get("phone"));
  const passwordMode = cleanText(formData.get("passwordMode"), 20) || "manual";
  const manualPassword = String(formData.get("password") ?? "");

  if (!firstName || !lastName || !email || !phone) return { error: "Complete the Ambassador's name, email, and 10-digit mobile number." };
  if (!/^\S+@\S+\.\S+$/.test(email)) return { error: "Enter a valid email address." };
  if (!/^[0-9]{10}$/.test(phone)) return { error: "Enter a valid 10-digit mobile number." };

  const password = passwordMode === "generated" ? generateAmbassadorPassword() : manualPassword;
  if (!isValidAccountPassword(password)) {
    return { error: "Use at least 12 characters, including uppercase, lowercase, a number, and a symbol." };
  }

  const admin = createAdminClient();
  const fullName = `${firstName} ${lastName}`;
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { must_change_password: true },
    user_metadata: { first_name: firstName, last_name: lastName, full_name: fullName, phone },
  });
  if (createError || !created.user) return { error: createError?.message ?? "Unable to create the Ambassador account." };

  const ambassadorId = created.user.id;
  const cleanup = async () => {
    await admin.auth.admin.deleteUser(ambassadorId);
  };

  const [{ error: profileError }, { error: roleError }] = await Promise.all([
    admin.from("profiles").upsert({ id: ambassadorId, first_name: firstName, last_name: lastName, full_name: fullName, phone }, { onConflict: "id" }),
    admin.from("user_roles").insert({ user_id: ambassadorId, role: "ambassador" }),
  ]);
  if (profileError || roleError) {
    await cleanup();
    return { error: "The Ambassador account could not be prepared. Please try again." };
  }

  // If this mobile number already belongs to an Ambassador record, retain that
  // record's current CRM owner. Otherwise, the sales user creating the account
  // becomes the relationship manager for future Ambassador-submitted leads.
  const { data: matchingLead } = await admin
    .from("leads")
    .select("id")
    .eq("phone_key", phone)
    .maybeSingle();
  const { data: existingAmbassadorWork, error: ambassadorWorkError } = matchingLead
    ? await admin
      .from("lead_product_assignments")
      .select("id, assigned_to")
      .eq("lead_id", matchingLead.id)
      .eq("is_ambassador", true)
      .order("updated_at", { ascending: false })
    : { data: [], error: null };
  if (ambassadorWorkError) {
    await cleanup();
    return { error: "The Ambassador account was not created because the existing Ambassador record could not be linked." };
  }

  const relationshipManagerId = existingAmbassadorWork?.find((work) => work.assigned_to)?.assigned_to ?? actor.userId;
  const { error: managerError } = await admin.from("ambassador_relationship_managers").upsert({
    ambassador_id: ambassadorId,
    crm_user_id: relationshipManagerId,
    assigned_by: actor.userId,
    updated_at: new Date().toISOString(),
  }, { onConflict: "ambassador_id" });
  if (managerError) {
    await cleanup();
    return { error: "The Ambassador account was not created because its CRM owner could not be saved." };
  }

  if (existingAmbassadorWork?.length) {
    const { error: linkError } = await admin
      .from("lead_product_assignments")
      .update({ ambassador_user_id: ambassadorId, updated_at: new Date().toISOString() })
      .in("id", existingAmbassadorWork.map((work) => work.id));
    if (linkError) {
      await cleanup();
      return { error: "The Ambassador account was not created because its existing CRM record could not be linked." };
    }
  }

  try {
    await sendAccountCredentials({ email, password, fullName });
  } catch {
    await cleanup();
    return { error: "The Ambassador account was not created because the account email could not be sent. Check the SMTP configuration." };
  }

  revalidatePath("/dashboard/my-ambassador");
  revalidatePath("/dashboard/leads");
  return { success: `${fullName}'s Ambassador login was created and their temporary password was emailed.` };
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
    const [{ data: product }, { data: stages }, { data: resolutions }, { data: customColumns }] = await Promise.all([
      supabase.from("lead_products").select("id").eq("code", "AMBASSADOR").eq("is_active", true).maybeSingle(),
      supabase.from("lead_stages").select("id, product_id, name").eq("is_active", true),
      supabase.from("lead_resolutions").select("id, name").eq("is_active", true),
      supabase.from("lead_table_columns").select("field_key, label").eq("source", "custom"),
    ]);
    if (!product) throw new Error("Create an active AMBASSADOR product before syncing Ambassador records.");
    const key = (value: string | null | undefined) => cleanText(value, 200).toLowerCase().replace(/[^a-z0-9]+/g, "");
    const preSales = (stages ?? []).find((stage) => stage.product_id === product.id && key(stage.name) === "presales");
    const onboarding = (stages ?? []).find((stage) => stage.product_id === product.id && key(stage.name) === "onboardingambassador");
    const agreementSent = (resolutions ?? []).find((resolution) => key(resolution.name) === "agreementsent");
    const agreementSigned = (resolutions ?? []).find((resolution) => ["agreementsignedwaived", "agreementsignedorwaived", "agreementsignedwaivedoff", "agreementsignedorwaivedoff"].includes(key(resolution.name)));
    if (!preSales || !onboarding || !agreementSent || !agreementSigned) throw new Error("Configure Pre Sales, Onboarding Ambassador, Agreement Sent, and Agreement Signed / Waived before syncing.");
    // The actual custom_data key for "Ambassador Import Summary" is
    // admin-generated (label slug + a random suffix) once that column
    // exists, so it is looked up by label instead of assuming a fixed key.
    // This also keeps it from colliding with the unrelated "Form Message"
    // key the PSO/BSSO website sync writes.
    const importSummaryKey =
      (customColumns ?? []).find((column) => key(column.label) === "ambassadorimportsummary")?.field_key ?? "ambassador_import_summary";
    // KYC/bank columns and document links are also looked up by label for
    // the same reason. A missing column simply means that field is skipped.
    const fieldKeyFor = (label: string) => (customColumns ?? []).find((column) => key(column.label) === key(label))?.field_key ?? null;
    const panKey = fieldKeyFor("PAN");
    const gstinKey = fieldKeyFor("GSTIN");
    const bankNameKey = fieldKeyFor("Bank Name");
    const accountHolderNameKey = fieldKeyFor("Account Holder Name");
    const accountNumberKey = fieldKeyFor("Account Number");
    const ifscCodeKey = fieldKeyFor("IFSC Code");
    const governmentIdKey = fieldKeyFor("Government ID / Aadhaar Number");
    const documentColumnKeys: Record<"selfie" | "panCopy" | "cancelledCheque" | "kycIdProof" | "gstCertificate", string | null> = {
      selfie: fieldKeyFor("Selfie"),
      panCopy: fieldKeyFor("PAN Copy"),
      cancelledCheque: fieldKeyFor("Cancelled Cheque"),
      kycIdProof: fieldKeyFor("KYC ID Proof"),
      gstCertificate: fieldKeyFor("GST Certificate"),
    };

    const source = "altuscorp_ambassador";
    const unique = [...new Map(records.filter((record) => cleanText(record.id, 120)).map((record) => [cleanText(record.id, 120), record])).values()];
    const ids = unique.map((record) => cleanText(record.id, 120));
    const phones = [...new Set(unique.map((record) => normalizePhone(record.contactNumber)).filter(Boolean))];
    const [{ data: mappings }, { data: legacy }, { data: byPhone }] = await Promise.all([
      supabase.from("lead_external_sources").select("external_id, lead_id").eq("source", source).in("external_id", ids),
      supabase.from("leads").select("id, external_id, phone_key, assigned_to, custom_data").eq("external_source", source).in("external_id", ids),
      phones.length ? supabase.from("leads").select("id, phone_key, assigned_to, custom_data").in("phone_key", phones) : Promise.resolve({ data: [] }),
    ]);
    const mapped = new Map<string, string>();
    for (const row of mappings ?? []) mapped.set(row.external_id, row.lead_id);
    for (const row of legacy ?? []) if (row.external_id) mapped.set(row.external_id, row.id);
    const mappedLeadIds = [...new Set((mappings ?? []).map((row) => row.lead_id))];
    const { data: mappedLeads } = mappedLeadIds.length
      ? await supabase.from("leads").select("id, phone_key, assigned_to, custom_data").in("id", mappedLeadIds)
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
      const fallbackNames = splitName(record.ambassadorName || record.entityName);
      const names = {
        firstName: cleanText(record.firstName, 120) || fallbackNames.firstName,
        lastName: cleanText(record.lastName, 120) || fallbackNames.lastName,
      };
      if (!phone || !names.firstName) { skipped += 1; if (skipReasons.length < 3) skipReasons.push("A source record is missing a valid name or 10-digit Cell Number."); continue; }
      const signed = record.hasSignedPdf === true;
      // A matching Cell Number is the CRM identity for an Ambassador. Prefer
      // that record over an old API mapping, so a Pre Sales Ambassador is
      // promoted in place as soon as AltusCorp reports a signed PDF.
      const mappedLead = mapped.get(externalId) ? leadById.get(mapped.get(externalId)!) : undefined;
      const phoneMatchedLead = leadByPhone.get(phone);
      const priorLead = phoneMatchedLead ?? mappedLead;
      // An admin can remove the Ambassador product assignment without losing
      // the CRM lead. A later source sync is allowed to restore that missing
      // assignment, which also makes the external sync safe to test.
      const owner = priorLead ? (assignmentsByLead.get(priorLead.id) ?? [])
        .filter((item) => item.assigned_to && item.is_active)
        .sort((a, b) => Number(b.product_id === product.id) - Number(a.product_id === product.id) || String(b.assigned_at ?? "").localeCompare(String(a.assigned_at ?? "")))[0]?.assigned_to ?? priorLead.assigned_to ?? null : null;
      const kycFieldEntries: [string | null, string | undefined][] = [
        [panKey, cleanText(record.pan, 40) || undefined],
        [gstinKey, cleanText(record.gstin, 40) || undefined],
        [bankNameKey, cleanText(record.bank?.bankName, 160) || undefined],
        [accountHolderNameKey, cleanText(record.bank?.accountHolderName, 240) || undefined],
        [accountNumberKey, cleanText(record.bank?.accountNumber, 60) || undefined],
        [ifscCodeKey, cleanText(record.bank?.ifscCode, 40) || undefined],
        [governmentIdKey, cleanText(record.kyc?.aadhaarNumber ?? record.kyc?.aadhaarOrGovId, 40) || undefined],
      ];
      // AltusCorp's document URLs are signed and expire in minutes, so the
      // lead gets a link to our own proxy instead of the raw URL. Clicking
      // it re-fetches a fresh URL from AltusCorp at that moment.
      const documentFieldEntries: [string | null, string | undefined][] = (Object.keys(documentColumnKeys) as (keyof typeof documentColumnKeys)[])
        .map((type) => [documentColumnKeys[type], record.documents?.[type]?.url ? `/api/ambassador-documents/${type}?externalId=${encodeURIComponent(externalId)}` : undefined]);
      const customData = {
        ...(priorLead?.custom_data ?? {}), [importSummaryKey]: ambassadorFormMessage(record),
        altuscorp_ambassador: { external_id: externalId, updated_at: record.updatedAt ?? null, status: record.status ?? null, referral_fee_percent: record.referralFeePercent ?? null, agreement_date: record.agreementDate ?? null, has_signed_pdf: signed },
        ...Object.fromEntries([...kycFieldEntries, ...documentFieldEntries].filter((entry): entry is [string, string] => Boolean(entry[0] && entry[1]))),
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
      // A re-sync must not redo the signing side effects (closing the lead's
      // other active product work) every time it runs — only the first time
      // this Ambassador actually becomes signed. Otherwise a sales team
      // reopening or adding a product on this lead later gets silently
      // closed again on the next scheduled sync.
      const { data: priorAssignment } = await supabase
        .from("lead_product_assignments")
        .select("ambassador_agreement_status")
        .eq("lead_id", leadId)
        .eq("product_id", product.id)
        .maybeSingle();
      const justSigned = signed && priorAssignment?.ambassador_agreement_status !== "Agreement Signed";
      const { data: assignment, error: assignmentError } = await supabase.from("lead_product_assignments").upsert({
        lead_id: leadId, product_id: product.id, stage_id: (signed ? onboarding : preSales).id, latest_resolution_id: (signed ? agreementSigned : agreementSent).id,
        assigned_to: owner, assigned_at: owner ? new Date().toISOString() : null, focused_on: !signed && owner ? indiaToday() : null,
        is_active: true, is_closed: signed, is_ambassador: signed, exclude_from_round_robin: true, assignment_origin: "import", created_by: actor.userId,
        ambassador_commission: record.referralFeePercent === null || record.referralFeePercent === undefined || record.referralFeePercent === "" ? null : Number(record.referralFeePercent),
        ambassador_agreement_status: signed ? "Agreement Signed" : "Agreement Sent",
      }, { onConflict: "lead_id,product_id" }).select("id").single();
      if (assignmentError || !assignment) { skipped += 1; if (skipReasons.length < 3) skipReasons.push(assignmentError?.message || "The Ambassador product assignment could not be created."); continue; }
      if (justSigned) await supabase.from("lead_product_assignments").update({ is_active: false, is_closed: true, focused_on: null, next_follow_up_at: null }).eq("lead_id", leadId).neq("product_id", product.id).eq("is_active", true).eq("is_closed", false);
      await supabase.from("lead_external_sources").upsert({ lead_id: leadId, source, external_id: externalId }, { onConflict: "source,external_id" });
      await supabase.from("lead_activities").insert({ lead_id: leadId, lead_product_assignment_id: assignment.id, activity_type: "altuscorp_ambassador_synced", note: `Ambassador agreement synced from AltusCorp (${signed ? "Agreement Signed / Waived — Onboarding Ambassador" : "Agreement Sent — Pre Sales"}).`, metadata: { external_id: externalId, has_signed_pdf: signed, matched_by_cell_number: Boolean(phoneMatchedLead), updated_at: record.updatedAt ?? null }, created_by: actor.userId });
    }
    revalidatePath("/dashboard/my-ambassador"); revalidatePath("/dashboard/leads"); revalidatePath("/dashboard");
    return { ok: true, message: `AltusCorp Ambassador sync completed. ${imported} added, ${updated} updated${skipped ? `, ${skipped} skipped` : ""}.${skipReasons.length ? ` ${[...new Set(skipReasons)].join(" ")}` : ""}`, imported, updated, skipped };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Unable to sync AltusCorp Ambassadors." };
  }
}

async function saveRecord(input: AmbassadorInput, actor?: { userId: string; isAdmin: boolean }) {
  const user = actor ?? { ...(await requireAdmin()), isAdmin: true };
  const data = parseInput(input);
  // Sales Managers/Executives can only ever own what they import or create —
  // the Sales Person column (or a manual form value) is ignored for them.
  if (!user.isAdmin) data.salesPersonId = user.userId;
  // This runs after the permission check above, so writes use the admin
  // client to avoid being blocked by an RLS policy tied to the same
  // assignment table being upserted here.
  const supabase = createAdminClient();
  const [{ data: product }, { data: assignee }] = await Promise.all([
    supabase.from("lead_products").select("id").eq("code", "AMBASSADOR").eq("is_active", true).maybeSingle(),
    data.salesPersonId ? supabase.from("profiles").select("id").eq("id", data.salesPersonId).eq("is_suspended", false).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (!product) throw new Error("Create an active AMBASSADOR product before adding Ambassadors.");
  if (data.salesPersonId && !assignee) throw new Error("The selected Sales Person is not active.");

  // phone_key is the normalized last ten digits; this safely treats +91,
  // 91, spaces, and a plain Indian mobile number as the same lead.
  const { data: existing } = await supabase.from("leads").select("id, first_name, last_name, email").eq("phone_key", data.cellNumber).maybeSingle();
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
  if (!user.isAdmin && leadId) {
    const { data: existingAmbassadorAssignment } = await supabase
      .from("lead_product_assignments")
      .select("assigned_to")
      .eq("lead_id", leadId).eq("product_id", product.id).eq("is_ambassador", true).eq("is_active", true).maybeSingle();
    if (existingAmbassadorAssignment?.assigned_to && existingAmbassadorAssignment.assigned_to !== user.userId) {
      throw new Error("This phone number already belongs to a different Ambassador. Ask an admin to reassign it.");
    }
  }
  const priorOwnerIds = [...new Set((existingAssignments ?? []).flatMap((assignment) => assignment.assigned_to ? [assignment.assigned_to] : []))];
  // If an administrator leaves Sales Person empty while converting an existing
  // lead, retain its current CRM owner rather than silently making it unassigned.
  const effectiveSalesPersonId = data.salesPersonId ?? existingAssignments?.find((assignment) => assignment.assigned_to)?.assigned_to ?? null;
  if (!leadId) {
    const { data: created, error } = await supabase.from("leads").insert({
      first_name: data.firstName, last_name: data.lastName, email: data.email, phone: data.cellNumber, product_id: product.id,
      assigned_to: effectiveSalesPersonId, assigned_at: effectiveSalesPersonId ? new Date().toISOString() : null,
      lead_database: "leads", created_by: user.userId,
    }).select("id").single();
    if (error || !created) throw new Error(error?.message || "Unable to create the Ambassador lead.");
    leadId = created.id;
  } else if (data.email && data.email !== existing?.email) {
    const { error } = await supabase
      .from("leads")
      .update({ email: data.email, updated_at: new Date().toISOString() })
      .eq("id", leadId);
    if (error) throw new Error(error.message);
  }
  const workflowPatch = await resolveAmbassadorWorkflowPatch(supabase, product.id, data.agreementStatus ?? "");
  const { data: assignment, error: assignmentError } = await supabase.from("lead_product_assignments").upsert({
    lead_id: leadId, product_id: product.id, ...workflowPatch,
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
      note: `Ambassador record ${existing ? "updated" : "created"} by ${user.isAdmin ? "an administrator" : "a Sales Person"}.`, created_by: user.userId,
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

export async function createAmbassador(input: AmbassadorInput, actor?: { userId: string; isAdmin: boolean }) {
  try { return await saveRecord(input, actor); } catch (error) { return { ok: false, message: error instanceof Error ? error.message : "Unable to save Ambassador." }; }
}

// Manual single-record add for Sales Managers/Executives; always owned by
// the caller, same as importAmbassadors.
export async function createOwnAmbassador(input: AmbassadorInput) {
  try {
    const actor = await requireAmbassadorManager();
    return await saveRecord(input, actor);
  } catch (error) { return { ok: false, message: error instanceof Error ? error.message : "Unable to save Ambassador." }; }
}

export async function importAmbassadors(rows: AmbassadorInput[]) {
  try {
    const actor = await requireAmbassadorManager();
    if (!Array.isArray(rows) || !rows.length || rows.length > 500) throw new Error("Upload between 1 and 500 Ambassador records at a time.");
    let imported = 0; let skipped = 0; const errors: string[] = [];
    for (const [index, row] of rows.entries()) {
      const result = await createAmbassador(row, actor);
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

export async function updateAmbassadorDetails(assignmentId: string, input: AmbassadorInput) {
  try {
    const user = await requireAdmin();
    if (!/^[0-9a-f-]{36}$/i.test(assignmentId)) throw new Error("Invalid Ambassador record.");
    const supabase = createAdminClient();
    const { data: assignment } = await supabase.from("lead_product_assignments").select("lead_id, product_id, assigned_to, is_ambassador").eq("id", assignmentId).maybeSingle();
    if (!assignment) throw new Error("Ambassador record not found.");
    const { data: product } = await supabase.from("lead_products").select("code").eq("id", assignment.product_id).maybeSingle();
    if (workflowKey(product?.code) !== "ambassador") throw new Error("Ambassador record not found.");
    const data = parseInput(input);
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

    Object.assign(patch, await resolveAmbassadorWorkflowPatch(supabase, assignment.product_id, data.agreementStatus ?? ""));

    const { error: leadError } = await supabase
      .from("leads")
      .update({ first_name: data.firstName, last_name: data.lastName || null, phone: data.cellNumber, updated_at: new Date().toISOString() })
      .eq("id", assignment.lead_id);
    if (leadError) throw new Error(leadError.message);

    const { error } = await supabase.from("lead_product_assignments").update(patch).eq("id", assignmentId);
    if (error) throw new Error(error.message);
    const workflowNote = data.agreementStatus === "Agreement Signed" ? " Moved from Pre Sales to Onboarding Ambassador." : "";
    await supabase.from("lead_activities").insert({ lead_id: assignment.lead_id, lead_product_assignment_id: assignmentId, activity_type: "ambassador_record_updated", note: `Ambassador commercial details updated by an administrator.${workflowNote}`, created_by: user.userId });
    revalidatePath("/dashboard/my-ambassador");
    revalidatePath("/dashboard/leads");
    revalidatePath("/dashboard/senior-ambassadors");
    return { ok: true, message: "Ambassador details saved." };
  } catch (error) { return { ok: false, message: error instanceof Error ? error.message : "Unable to update Ambassador." }; }
}

// Sales users can change only the agreement outcome on records assigned to
// them. Sales Managers also have that access for their configured team.
export async function updateAmbassadorAgreementStatus(assignmentId: string, agreementStatus: string) {
  try {
    const user = await requireUser();
    if (!user.roles.some((role) => role === "sales_executive" || role === "sales_manager")) {
      throw new Error("Only sales users can update an Ambassador agreement status.");
    }
    if (!/^[0-9a-f-]{36}$/i.test(assignmentId)) throw new Error("Invalid Ambassador record.");
    const status = cleanText(agreementStatus, 120);
    if (!AGREEMENT_STATUSES.has(status)) throw new Error("Choose a valid agreement status.");

    const supabase = createAdminClient();
    const { data: assignment, error: assignmentError } = await supabase
      .from("lead_product_assignments")
      .select("lead_id, product_id, assigned_to, is_ambassador")
      .eq("id", assignmentId)
      .maybeSingle();
    if (assignmentError || !assignment) throw new Error(assignmentError?.message || "Ambassador record not found.");
    const { data: product, error: productError } = await supabase
      .from("lead_products")
      .select("code")
      .eq("id", assignment.product_id)
      .maybeSingle();
    if (productError || workflowKey(product?.code) !== "ambassador") throw new Error("Ambassador record not found.");

    let canUpdate = assignment.assigned_to === user.userId;
    if (!canUpdate && user.roles.includes("sales_manager")) {
      const teamMemberIds = await getSalesManagerTeamMemberIds(user.userId);
      canUpdate = Boolean(assignment.assigned_to && teamMemberIds.includes(assignment.assigned_to));
    }
    if (!canUpdate) throw new Error("This Ambassador record is not assigned to you or your team.");

    const patch: Record<string, unknown> = {
      ambassador_agreement_status: status,
      updated_at: new Date().toISOString(),
    };
    Object.assign(patch, await resolveAmbassadorWorkflowPatch(supabase, assignment.product_id, status));

    const { error } = await supabase.from("lead_product_assignments").update(patch).eq("id", assignmentId);
    if (error) throw new Error(error.message);
    await supabase.from("lead_activities").insert({
      lead_id: assignment.lead_id,
      lead_product_assignment_id: assignmentId,
      activity_type: "ambassador_agreement_status_updated",
      note: `Ambassador agreement status changed to ${status}${status === "Agreement Signed" ? "; moved to Onboarding Ambassador." : "."}`,
      metadata: { agreement_status: status },
      created_by: user.userId,
    });
    revalidatePath("/dashboard/my-ambassador");
    revalidatePath("/dashboard/leads");
    revalidatePath("/dashboard/senior-ambassadors");
    return { ok: true, message: "Agreement status saved." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Unable to save the agreement status." };
  }
}

// A signed agreement PDF is the same real-world event as marking the
// Agreement Status "Agreement Signed": both move the record into Onboarding
// Ambassador and record the Agreement Signed / Waived resolution. Uploading
// the document performs that transition automatically instead of requiring
// a separate status change first.
export async function uploadAmbassadorAgreementDocument(formData: FormData): Promise<{ ok: boolean; message: string }> {
  try {
    const user = await requireUser();
    const assignmentId = String(formData.get("assignmentId") ?? "");
    const documentUrl = String(formData.get("documentUrl") ?? "").trim();
    const documentMime = String(formData.get("documentMime") ?? "").trim().toLowerCase();
    const documentSize = Number(formData.get("documentSize") ?? 0);
    if (!/^[0-9a-f-]{36}$/i.test(assignmentId)) throw new Error("Invalid Ambassador record.");
    if (documentMime !== "application/pdf") throw new Error("Upload the signed agreement as a PDF.");
    if (!Number.isFinite(documentSize) || documentSize < 1 || documentSize > 20 * 1024 * 1024) throw new Error("The agreement PDF must be 20 MB or smaller.");

    const base = process.env.CDN_PUBLIC_BASE_URL?.replace(/\/+$/, "");
    if (!base) throw new Error("CDN attachments are not configured yet.");
    const baseUrl = new URL(base);
    const uploadedUrl = new URL(documentUrl);
    if (uploadedUrl.origin !== baseUrl.origin || !uploadedUrl.pathname.startsWith(`${baseUrl.pathname}/`)) {
      throw new Error("The agreement must be uploaded through the approved CDN.");
    }

    const supabase = createAdminClient();
    const { data: assignment, error: assignmentError } = await supabase
      .from("lead_product_assignments")
      .select("lead_id, product_id, assigned_to")
      .eq("id", assignmentId)
      .maybeSingle();
    if (assignmentError || !assignment) throw new Error(assignmentError?.message || "Ambassador record not found.");
    const { data: product, error: productError } = await supabase.from("lead_products").select("code").eq("id", assignment.product_id).maybeSingle();
    if (productError || workflowKey(product?.code) !== "ambassador") throw new Error("Ambassador record not found.");

    let allowed = user.roles.includes("admin") || assignment.assigned_to === user.userId;
    if (!allowed && user.roles.includes("sales_manager")) {
      const teamMemberIds = await getSalesManagerTeamMemberIds(user.userId);
      allowed = Boolean(assignment.assigned_to && teamMemberIds.includes(assignment.assigned_to));
    }
    if (!allowed) throw new Error("This Ambassador record is not assigned to you or your team.");

    const [{ data: stages, error: stagesError }, { data: resolutions, error: resolutionsError }] = await Promise.all([
      supabase.from("lead_stages").select("id, name").eq("product_id", assignment.product_id).eq("is_active", true),
      supabase.from("lead_resolutions").select("id, name").eq("is_active", true),
    ]);
    if (stagesError || resolutionsError) throw new Error(stagesError?.message || resolutionsError?.message || "Unable to load the Ambassador workflow.");
    const onboarding = (stages ?? []).find((stage) => workflowKey(stage.name) === "onboardingambassador");
    const signed = (resolutions ?? []).find((resolution) => SIGNED_RESOLUTION_KEYS.includes(workflowKey(resolution.name)));
    if (!onboarding || !signed) throw new Error("Configure Onboarding Ambassador and Agreement Signed / Waived before uploading an agreement.");

    const { error } = await supabase.from("lead_product_assignments").update({
      ambassador_signed_agreement_link: uploadedUrl.toString(),
      ambassador_agreement_status: "Agreement Signed",
      stage_id: onboarding.id,
      latest_resolution_id: signed.id,
      is_ambassador: true,
      is_active: true,
      is_closed: true,
      focused_on: null,
      next_follow_up_at: null,
      updated_at: new Date().toISOString(),
    }).eq("id", assignmentId);
    if (error) throw new Error(error.message);

    await supabase.from("lead_activities").insert({
      lead_id: assignment.lead_id,
      lead_product_assignment_id: assignmentId,
      activity_type: "ambassador_agreement_document_uploaded",
      note: "Signed agreement PDF uploaded; agreement marked Signed and moved to Onboarding Ambassador.",
      metadata: { document_url: uploadedUrl.toString() },
      created_by: user.userId,
    });
    revalidatePath("/dashboard/my-ambassador");
    revalidatePath("/dashboard/leads");
    revalidatePath("/dashboard/senior-ambassadors");
    return { ok: true, message: "Agreement uploaded and marked Signed." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Unable to upload this agreement." };
  }
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
    if (recordError || !ambassadorRecord?.is_ambassador) {
      throw new Error("This Ambassador record is not available to you.");
    }
    if (ambassadorRecord.assigned_to !== user.userId) {
      if (!user.roles.includes("sales_manager")) {
        throw new Error("This Ambassador record is not available to you.");
      }
      const { data: teams, error: teamsError } = await supabase
        .from("crm_teams")
        .select("id")
        .eq("manager_id", user.userId);
      if (teamsError) throw new Error("Unable to verify your sales team.");
      const teamIds = (teams ?? []).map((team) => team.id);
      const { data: membership, error: membershipError } = teamIds.length
        ? await supabase
            .from("crm_team_members")
            .select("user_id")
            .in("team_id", teamIds)
            .eq("user_id", ambassadorRecord.assigned_to ?? "")
        : { data: [], error: null };
      if (membershipError || !membership?.length) {
        throw new Error("This Ambassador record is not available to you.");
      }
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
