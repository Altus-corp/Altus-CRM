import "server-only";

import { createAdminClient } from "@/app/lib/supabase/admin";

export async function notifyLeadAssignment({
  userId,
  count,
  source,
}: {
  userId: string;
  count: number;
  source: "manual" | "round_robin";
}) {
  if (!userId || count < 1) return;
  const description =
    source === "round_robin"
      ? "Round robin assigned new leads to you."
      : "An admin assigned new leads to you.";
  const { error } = await createAdminClient()
    .from("crm_notifications")
    .insert({
      user_id: userId,
      notification_type: "lead_assigned",
      title: `${count} lead${count === 1 ? "" : "s"} assigned`,
      body: description,
      href: "/dashboard/leads?view=focused",
      metadata: { count, source },
    });

  // Assignment must still succeed until the notification migration is deployed.
  if (error && error.code !== "42P01" && error.code !== "PGRST205")
    throw new Error(error.message);
}

export async function notifyFreshFormLead({
  userId,
  leadName,
  productCode,
  stageName,
  assignmentId,
}: {
  userId: string;
  leadName: string;
  productCode: string;
  stageName: string;
  assignmentId: string;
}) {
  if (!userId) return;
  const { error } = await createAdminClient()
    .from("crm_notifications")
    .insert({
      user_id: userId,
      notification_type: "fresh_form_lead",
      title: `New ${productCode} lead received`,
      body: `${leadName || "A lead"} has registered and is now in ${stageName}.`,
      href: "/dashboard/leads?view=focused",
      metadata: {
        assignment_id: assignmentId,
        product_code: productCode,
        stage_name: stageName,
        lead_name: leadName,
      },
    });
  if (error && error.code !== "42P01" && error.code !== "PGRST205")
    throw new Error(error.message);
}

export async function notifyPaidPreStageLead({
  userId,
  leadName,
  productCode,
  stageName,
  assignmentId,
}: {
  userId: string;
  leadName: string;
  productCode: string;
  stageName: string;
  assignmentId: string;
}) {
  if (!userId || !/^pre\s*(pso|bsso)$/i.test(stageName.trim())) return;
  const { error } = await createAdminClient()
    .from("crm_notifications")
    .insert({
      user_id: userId,
      notification_type: "pre_paid_lead",
      title: `New ${productCode} paid lead assigned`,
      body: `${leadName || "A lead"} is assigned to you at ${stageName}.`,
      href: "/dashboard/leads?view=focused",
      metadata: {
        assignment_id: assignmentId,
        product_code: productCode,
        stage_name: stageName,
        lead_name: leadName,
      },
    });
  if (error && error.code !== "42P01" && error.code !== "PGRST205")
    throw new Error(error.message);
}
