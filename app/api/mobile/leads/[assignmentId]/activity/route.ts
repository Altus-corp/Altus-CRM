import type { NextRequest } from "next/server";
import { requireMobileUser } from "@/app/lib/auth-token";
import { loadMobileLeadActivity, resolveOwnedAssignment } from "@/app/lib/crm2/mobileLeads";
import { mobileError, mobileJson } from "@/app/api/mobile/_lib/respond";

export async function GET(request: NextRequest, context: { params: Promise<{ assignmentId: string }> }) {
  const user = await requireMobileUser(request);
  if (!user) return mobileError("Session is invalid or expired.", 401);
  const { assignmentId } = await context.params;
  const owned = await resolveOwnedAssignment(user, assignmentId);
  if (!owned) return mobileError("This lead is not available.", 404);
  try {
    const activity = await loadMobileLeadActivity(assignmentId);
    return mobileJson({ activity });
  } catch (e) {
    return mobileError(e instanceof Error ? e.message : "Unable to load activity.", 500);
  }
}

export { mobileOptions as OPTIONS } from "@/app/api/mobile/_lib/respond";
