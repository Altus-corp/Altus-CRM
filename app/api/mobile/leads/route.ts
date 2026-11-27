import type { NextRequest } from "next/server";
import { requireMobileUser } from "@/app/lib/auth-token";
import { listMyAssignments } from "@/app/lib/crm2/mobileLeads";
import { mobileError, mobileJson } from "@/app/api/mobile/_lib/respond";

export async function GET(request: NextRequest) {
  const user = await requireMobileUser(request);
  if (!user) return mobileError("Session is invalid or expired.", 401);

  const cursor = Number(request.nextUrl.searchParams.get("cursor") ?? "0") || 0;
  const limit = Number(request.nextUrl.searchParams.get("limit") ?? "25") || 25;
  try {
    const { rows, nextCursor } = await listMyAssignments(user, { cursor, limit });
    return mobileJson({ leads: rows, nextCursor });
  } catch (e) {
    return mobileError(e instanceof Error ? e.message : "Unable to load your leads.", 500);
  }
}
