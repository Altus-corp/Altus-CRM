import type { NextRequest } from "next/server";
import { requireMobileUser } from "@/app/lib/auth-token";
import { listMyMeetings } from "@/app/lib/crm2/mobileLeads";
import { mobileError, mobileJson } from "@/app/api/mobile/_lib/respond";

export async function GET(request: NextRequest) {
  const user = await requireMobileUser(request);
  if (!user) return mobileError("Session is invalid or expired.", 401);

  try {
    const meetings = await listMyMeetings(user);
    return mobileJson({ meetings });
  } catch (e) {
    return mobileError(e instanceof Error ? e.message : "Unable to load your meetings.", 500);
  }
}

export { mobileOptions as OPTIONS } from "@/app/api/mobile/_lib/respond";
