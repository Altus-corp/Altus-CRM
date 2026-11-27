import type { NextRequest } from "next/server";
import { requireMobileUser } from "@/app/lib/auth-token";
import { resolveOwnedAssignment } from "@/app/lib/crm2/mobileLeads";
import { updateLeadBantField } from "@/app/dashboard/leads/actions";
import { BANT_FIELD_LABELS, type BantField } from "@/app/lib/bant";
import { mobileError, mobileJson } from "@/app/api/mobile/_lib/respond";

export async function POST(request: NextRequest, context: { params: Promise<{ assignmentId: string }> }) {
  const user = await requireMobileUser(request);
  if (!user) return mobileError("Session is invalid or expired.", 401);
  const { assignmentId } = await context.params;
  const owned = await resolveOwnedAssignment(user, assignmentId);
  if (!owned) return mobileError("This lead is not available.", 404);

  let body: { field?: unknown; value?: unknown; detail?: unknown };
  try { body = await request.json(); } catch { return mobileError("Invalid request body."); }
  const field = String(body.field ?? "") as BantField;
  if (!BANT_FIELD_LABELS[field]) return mobileError("Choose a valid BANT field.");

  const form = new FormData();
  form.set("leadId", owned.leadId);
  form.set("assignmentId", assignmentId);
  form.set("field", field);
  form.set("value", String(body.value ?? ""));
  if (body.detail) form.set("detail", String(body.detail));

  try {
    await updateLeadBantField(form, user);
    return mobileJson({ message: "BANT updated." });
  } catch (e) {
    return mobileError(e instanceof Error ? e.message : "Could not update BANT.", 400);
  }
}
