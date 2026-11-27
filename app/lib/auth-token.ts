import "server-only";
import type { NextRequest } from "next/server";
import type { AppRole } from "@/app/lib/roles";
import { createAdminClient } from "@/app/lib/supabase/admin";
import { createBearerClient } from "@/app/lib/supabase/bearer";

export type MobileUser = { userId: string; email: string; displayName: string; roles: AppRole[] };

function bearerToken(request: NextRequest): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer (.+)$/i.exec(header.trim());
  return match ? match[1] : null;
}

/** Mobile equivalent of app/lib/auth.ts's requireUser() — verifies a client-supplied Supabase
 * access token instead of reading a cookie session, and returns null instead of redirect()ing so
 * every app/api/mobile/* route can turn a failure into a 401 JSON response. */
export async function requireMobileUser(request: NextRequest): Promise<MobileUser | null> {
  const token = bearerToken(request);
  if (!token) return null;

  const bearer = createBearerClient();
  const [{ data: claims }, { data: userData }] = await Promise.all([
    bearer.auth.getClaims(token),
    bearer.auth.getUser(token),
  ]);
  const userId = claims?.claims.sub;
  const sessionIssuedAt = claims?.claims.iat;
  const user = userData?.user;
  if (!userId || !user) return null;
  if (user.app_metadata.must_change_password) return null;

  const admin = createAdminClient();
  const [{ data: profile, error: profileError }, { data: roles, error: rolesError }] = await Promise.all([
    admin.from("profiles").select("is_suspended, first_name, last_name, full_name, password_changed_at").eq("id", userId).single(),
    admin.from("user_roles").select("role").eq("user_id", userId),
  ]);
  if (profileError || profile?.is_suspended) return null;

  // Same session-revocation check requireUser() does: a password change after this token was
  // issued must invalidate it on the user's very next request, not just on their next web login.
  if (profile?.password_changed_at && sessionIssuedAt) {
    const passwordChangedAtSeconds = Math.floor(new Date(profile.password_changed_at).getTime() / 1000);
    if (passwordChangedAtSeconds > sessionIssuedAt) return null;
  }

  if (rolesError || !roles?.length) return null;

  return {
    userId,
    email: user.email?.trim().toLowerCase() ?? "",
    displayName: [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.full_name?.trim() || user.user_metadata.full_name?.trim() || user.email?.split("@")[0] || "CRM User",
    roles: roles.map((item) => item.role as AppRole),
  };
}
