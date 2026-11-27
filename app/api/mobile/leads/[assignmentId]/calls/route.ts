import type { NextRequest } from "next/server";
import { requireMobileUser } from "@/app/lib/auth-token";
import { resolveOwnedAssignment } from "@/app/lib/crm2/mobileLeads";
import { updateLeadResolutionInline } from "@/app/dashboard/leads/actions";
import { mobileError, mobileJson } from "@/app/api/mobile/_lib/respond";

export async function POST(request: NextRequest, context: { params: Promise<{ assignmentId: string }> }) {
  const user = await requireMobileUser(request);
  if (!user) return mobileError("Session is invalid or expired.", 401);
  const { assignmentId } = await context.params;
  const owned = await resolveOwnedAssignment(user, assignmentId);
  if (!owned) return mobileError("This lead is not available.", 404);

  let body: { resolutionId?: unknown; followUpAt?: unknown; note?: unknown };
  try { body = await request.json(); } catch { return mobileError("Invalid request body."); }
  const resolutionId = String(body.resolutionId ?? "");
  if (!resolutionId) return mobileError("Choose a call resolution.");

  const form = new FormData();
  form.set("leadId", owned.leadId);
  form.set("assignmentId", assignmentId);
  form.set("resolutionId", resolutionId);
  if (body.followUpAt) form.set("followUpAt", String(body.followUpAt));
  if (body.note) form.set("followUpNote", String(body.note));

  try {
    await updateLeadResolutionInline(form, user);
    return mobileJson({ message: "Call logged." });
  } catch (e) {
    return mobileError(e instanceof Error ? e.message : "Could not log the call.", 400);
  }
}
