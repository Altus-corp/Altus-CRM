import type { NextRequest } from "next/server";
import { createAdminClient } from "@/app/lib/supabase/admin";
import { createBearerClient } from "@/app/lib/supabase/bearer";
import { mobileError, mobileJson } from "@/app/api/mobile/_lib/respond";
import type { AppRole } from "@/app/lib/roles";

export async function POST(request: NextRequest) {
  let body: { email?: unknown; password?: unknown };
  try { body = await request.json(); } catch { return mobileError("Invalid request body."); }
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (!email || !password) return mobileError("Enter an email and password.");

  const bearer = createBearerClient();
  const { data: signIn, error: signInError } = await bearer.auth.signInWithPassword({ email, password });
  if (signInError || !signIn.session || !signIn.user) return mobileError("Incorrect email or password.", 401);

  // Enforce the same suspension/role rules requireUser() applies on the web, before this session
  // is considered valid for the CRM — a suspended account must never receive a usable token even
  // though Supabase itself authenticated the password correctly.
  const userId = signIn.user.id;
  const admin = createAdminClient();
  const [{ data: profile, error: profileError }, { data: roles, error: rolesError }] = await Promise.all([
    admin.from("profiles").select("is_suspended, first_name, last_name, full_name").eq("id", userId).single(),
    admin.from("user_roles").select("role").eq("user_id", userId),
  ]);
  if (profileError || profile?.is_suspended) {
    await bearer.auth.signOut();
    return mobileError("This account has been suspended.", 403);
  }
  if (rolesError || !roles?.length) {
    await bearer.auth.signOut();
    return mobileError("This account is not authorized for the CRM.", 403);
  }

  const displayName = [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.full_name?.trim() || signIn.user.email?.split("@")[0] || "CRM User";
  return mobileJson({
    session: {
      accessToken: signIn.session.access_token,
      refreshToken: signIn.session.refresh_token,
      expiresAt: signIn.session.expires_at ?? null,
    },
    user: { userId, email, displayName, roles: roles.map((item) => item.role as AppRole) },
  });
}

export { mobileOptions as OPTIONS } from "@/app/api/mobile/_lib/respond";
