import { NextRequest } from "next/server";
import { requireUser } from "@/app/lib/auth";
import { createAdminClient } from "@/app/lib/supabase/admin";

export async function GET() {
  const { userId } = await requireUser();
  const admin = createAdminClient();
  const [{ data, error }, preference] = await Promise.all([
    admin
      .from("crm_notifications")
      .select("id, notification_type, title, body, href, metadata, created_at")
      .eq("user_id", userId)
      .is("read_at", null)
      .order("created_at", { ascending: false })
      // A batch can contain hundreds of assignments. Load the complete batch
      // so the client creates one modal rather than showing pages of popups.
      .limit(500),
    admin
      .from("crm_notification_preferences")
      .select("assignment_popups_enabled")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  if (error && error.code !== "42P01" && error.code !== "PGRST205")
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  if (preference.error && preference.error.code !== "42P01" && preference.error.code !== "PGRST205")
    return Response.json({ ok: false, error: preference.error.message }, { status: 500 });
  return Response.json({
    ok: true,
    notifications: data ?? [],
    assignmentPopupsEnabled: preference.data?.assignment_popups_enabled ?? true,
  });
}

export async function POST(request: NextRequest) {
  const { userId } = await requireUser();
  const body = (await request.json().catch(() => ({}))) as {
    notificationIds?: unknown;
    disableAssignmentPopups?: unknown;
  };
  const ids = Array.isArray(body.notificationIds)
    ? body.notificationIds
        .filter((id): id is string => typeof id === "string")
        .slice(0, 20)
    : [];
  const admin = createAdminClient();
  const disableAssignmentPopups = body.disableAssignmentPopups === true;
  if (disableAssignmentPopups) {
    const { error } = await admin
      .from("crm_notification_preferences")
      .upsert({ user_id: userId, assignment_popups_enabled: false, updated_at: new Date().toISOString() });
    if (error && error.code !== "42P01" && error.code !== "PGRST205")
      return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!ids.length) return Response.json({ ok: true });
  const { error } = await admin
    .from("crm_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .in("id", ids);
  if (error && error.code !== "42P01" && error.code !== "PGRST205")
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
