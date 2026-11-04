"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/app/lib/auth";
import { createAdminClient } from "@/app/lib/supabase/admin";
import { notifyLeadMovedToAmbassador } from "@/app/lib/lead-notifications";

const AGREEMENT_STATUSES = new Set(["Abandoned", "Agreement Sent", "Agreement Signed", "Not Pitched", "Pitched", "Query", "Said No", "Verbal Yes"]);

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

export async function updateAmbassadorDetails(assignmentId: string, input: Omit<AmbassadorInput, "firstName" | "lastName" | "cellNumber">) {
  try {
    const user = await requireAdmin();
    if (!/^[0-9a-f-]{36}$/i.test(assignmentId)) throw new Error("Invalid Ambassador record.");
    const supabase = createAdminClient();
    const { data: assignment } = await supabase.from("lead_product_assignments").select("lead_id, is_ambassador").eq("id", assignmentId).maybeSingle();
    if (!assignment?.is_ambassador) throw new Error("Ambassador record not found.");
    const data = parseInput({ ...input, firstName: "Record", lastName: "Update", cellNumber: "9999999999" });
    const { error } = await supabase.from("lead_product_assignments").update({
      assigned_to: data.salesPersonId, assigned_at: data.salesPersonId ? new Date().toISOString() : null,
      ambassador_commission: data.commission, ambassador_commission_notes: data.commissionNotes || null,
      ambassador_priority: data.priority, ambassador_agreement_status: data.agreementStatus,
      ambassador_signed_agreement_link: data.signedAgreementLink, ambassador_last_called_on: data.lastCalledOn,
      ambassador_last_call_notes: data.lastCallNotes || null, ambassador_remark: data.remark || null,
      ambassador_manan_sir_notes: data.mananSirNotes || null, updated_at: new Date().toISOString(),
      ambassador_target_leads: data.targetLeads, ambassador_target_demo: data.targetDemo,
      ambassador_target_proposals: data.targetProposals, ambassador_target_sales: data.targetSales,
    }).eq("id", assignmentId);
    if (error) throw new Error(error.message);
    await supabase.from("lead_activities").insert({ lead_id: assignment.lead_id, lead_product_assignment_id: assignmentId, activity_type: "ambassador_record_updated", note: "Ambassador commercial details updated by an administrator.", created_by: user.userId });
    revalidatePath("/dashboard/my-ambassador");
    return { ok: true, message: "Ambassador details saved." };
  } catch (error) { return { ok: false, message: error instanceof Error ? error.message : "Unable to update Ambassador." }; }
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
