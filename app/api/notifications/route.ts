import { NextRequest } from "next/server";
import { requireUser } from "@/app/lib/auth";
import { createAdminClient } from "@/app/lib/supabase/admin";

export async function GET() {
  const { userId } = await requireUser();
  const { data, error } = await createAdminClient()
    .from("crm_notifications")
    .select("id, notification_type, title, body, href, metadata, created_at")
    .eq("user_id", userId)
    .is("read_at", null)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error && error.code !== "42P01" && error.code !== "PGRST205")
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true, notifications: data ?? [] });
}

export async function POST(request: NextRequest) {
  const { userId } = await requireUser();
  const body = (await request.json().catch(() => ({}))) as {
    notificationIds?: unknown;
  };
  const ids = Array.isArray(body.notificationIds)
    ? body.notificationIds
        .filter((id): id is string => typeof id === "string")
        .slice(0, 20)
    : [];
  if (!ids.length) return Response.json({ ok: true });
  const { error } = await createAdminClient()
    .from("crm_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .in("id", ids);
  if (error && error.code !== "42P01" && error.code !== "PGRST205")
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
