import type { NextRequest } from "next/server";
import { requireMobileUser } from "@/app/lib/auth-token";
import { loadMobileLead } from "@/app/lib/crm2/mobileLeads";
import { mobileError, mobileJson } from "@/app/api/mobile/_lib/respond";

export async function GET(request: NextRequest, context: { params: Promise<{ assignmentId: string }> }) {
  const user = await requireMobileUser(request);
  if (!user) return mobileError("Session is invalid or expired.", 401);
  const { assignmentId } = await context.params;
  const lead = await loadMobileLead(user, assignmentId);
  if (!lead) return mobileError("This lead is not available.", 404);
  return mobileJson({ lead });
}

export { mobileOptions as OPTIONS } from "@/app/api/mobile/_lib/respond";
