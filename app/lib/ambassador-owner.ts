import "server-only";
import { requireUser } from "@/app/lib/auth";
import { isAmbassadorWorkspace } from "@/app/lib/roles";
import { createAdminClient } from "@/app/lib/supabase/admin";

export type AmbassadorOwner = {
  label: string;
  phone?: string;
};

const ownerName = (owner: { first_name: string | null; last_name: string | null; full_name: string | null }) =>
  [owner.first_name, owner.last_name].filter(Boolean).join(" ") || owner.full_name || "CRM user";

export async function getAmbassadorOwner(): Promise<AmbassadorOwner | undefined> {
  const { roles, email, userId } = await requireUser();
  if (!isAmbassadorWorkspace(roles)) return undefined;

  const admin = createAdminClient();
  // Channel Partner selection is the explicit current relationship between an
  // Ambassador account and a CRM lead. Its active Sales Person is the most
  // reliable relationship manager for that Ambassador.
  const { data: sharedLinks, error: sharedLinksError } = await admin
    .from("lead_channel_partners")
    .select("lead_id")
    .eq("ambassador_id", userId);
  if (!sharedLinksError && sharedLinks?.length) {
    const { data: sharedAssignments, error: sharedAssignmentsError } = await admin
      .from("lead_product_assignments")
      .select("assigned_to")
      .in("lead_id", sharedLinks.map((link) => link.lead_id))
      .eq("is_active", true)
      .not("assigned_to", "is", null);
    const sharedOwnerIds = [
      ...new Set(
        (sharedAssignmentsError ? [] : sharedAssignments ?? [])
          .map((assignment) => assignment.assigned_to)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    if (sharedOwnerIds.length) {
      const { data: owners } = await admin
        .from("profiles")
        .select("id, first_name, last_name, full_name, phone")
        .in("id", sharedOwnerIds);
      if (owners?.length)
        return {
          label: owners.map(ownerName).join(", "),
          phone: owners.find((owner) => owner.phone)?.phone ?? undefined,
        };
    }
  }

  if (!email) return { label: "CRM user not assigned" };
  // Only the authenticated Ambassador's email may be used for this service read.
  // Escape ILIKE wildcards so addresses containing underscores match literally.
  const literalEmail = email.replace(/[\\%_]/g, (character) => `\\${character}`);
  // A CRM user may be assigned before the Ambassador completes the agreement
  // step. Therefore use the active AMBASSADOR product work itself instead of
  // relying on the later `is_ambassador` status flag.
  const { data: assignments, error } = await admin.from("lead_product_assignments")
    .select("assigned_to, lead:leads!inner(email), product:lead_products!inner(code)")
    .eq("is_active", true)
    .eq("product.code", "AMBASSADOR")
    .ilike("lead.email", literalEmail);
  if (error) return { label: "CRM user unavailable" };
  const ownerIds = [...new Set((assignments ?? []).map((assignment) => assignment.assigned_to).filter((id): id is string => Boolean(id)))];
  if (!ownerIds.length) return { label: "CRM user not assigned" };
  const { data: owners, error: ownerError } = await admin.from("profiles")
    .select("id, first_name, last_name, full_name, phone").in("id", ownerIds);
  if (ownerError || !owners?.length) return { label: "CRM user unavailable" };
  return {
    label: owners.map(ownerName).join(", "),
    phone: owners.find((owner) => owner.phone)?.phone ?? undefined,
  };
}

export async function getAmbassadorOwnerLabel(): Promise<string | undefined> {
  return (await getAmbassadorOwner())?.label;
}
