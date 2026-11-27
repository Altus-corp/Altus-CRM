import type { NextRequest } from "next/server";
import { requireMobileUser } from "@/app/lib/auth-token";
import { mobileError, mobileJson } from "@/app/api/mobile/_lib/respond";

export async function GET(request: NextRequest) {
  const user = await requireMobileUser(request);
  if (!user) return mobileError("Session is invalid or expired.", 401);
  return mobileJson({ user });
}
