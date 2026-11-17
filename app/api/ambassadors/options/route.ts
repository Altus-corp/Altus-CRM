import { requireUser } from "@/app/lib/auth";
import { createAdminClient } from "@/app/lib/supabase/admin";

// This is intentionally based on CRM users with the Ambassador role. It does
// not include Pre-Sales or Onboarding lead records.
export async function GET() {
  const user = await requireUser();
  if (!user.roles.some((role) => ["admin", "sales_manager", "sales_executive"].includes(role))) {
    return Response.json({ ok: false, error: "You cannot select Ambassadors." }, { status: 403 });
  }

  const admin = createAdminClient();
  const [rolesResult, profilesResult] = await Promise.all([
    admin.from("user_roles").select("user_id").eq("role", "ambassador"),
    admin.from("profiles").select("id, first_name, last_name, full_name, is_suspended"),
  ]);
  if (rolesResult.error || profilesResult.error) {
    return Response.json({ ok: false, error: "Ambassador users could not be loaded." }, { status: 500 });
  }

  const ambassadorIds = new Set((rolesResult.data ?? []).map((role) => role.user_id));
  const options = (profilesResult.data ?? [])
    .filter((profile) => ambassadorIds.has(profile.id) && !profile.is_suspended)
    .map((profile) => ({
      id: profile.id,
      name: [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.full_name || "Unnamed Ambassador",
    }))
    .sort((left, right) => left.name.localeCompare(right.name));

  return Response.json({ ok: true, options });
}
