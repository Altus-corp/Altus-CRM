import "server-only";
import { requireUser } from "@/app/lib/auth";
import { isAmbassadorWorkspace } from "@/app/lib/roles";
import { createAdminClient } from "@/app/lib/supabase/admin";

export async function getAmbassadorOwnerLabel(): Promise<string | undefined> {
  const { roles, email } = await requireUser();
  if (!isAmbassadorWorkspace(roles)) return undefined;
  if (!email) return "CRM user not assigned";

  const admin = createAdminClient();
  // Only the authenticated Ambassador's email may be used for this service read.
  // Escape ILIKE wildcards so addresses containing underscores match literally.
  const literalEmail = email.replace(/[\\%_]/g, (character) => `\\${character}`);
  const { data: assignments, error } = await admin.from("lead_product_assignments")
    .select("assigned_to, lead:leads!inner(email)")
    .eq("is_ambassador", true).eq("is_active", true).ilike("lead.email", literalEmail);
  if (error) return "CRM user unavailable";
  const ownerIds = [...new Set((assignments ?? []).map((assignment) => assignment.assigned_to).filter((id): id is string => Boolean(id)))];
  if (!ownerIds.length) return "CRM user not assigned";
  const { data: owners, error: ownerError } = await admin.from("profiles")
    .select("id, first_name, last_name, full_name").in("id", ownerIds);
  if (ownerError || !owners?.length) return "CRM user unavailable";
  return owners.map((owner) => [owner.first_name, owner.last_name].filter(Boolean).join(" ") || owner.full_name || "CRM user").join(", ");
}
