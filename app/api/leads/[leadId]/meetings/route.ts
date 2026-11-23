import { requireUser } from "@/app/lib/auth";
import { createClient } from "@/app/lib/supabase/server";
import { createAdminClient } from "@/app/lib/supabase/admin";
import { getSalesManagerTeamMemberIds } from "@/app/lib/sales-manager-team";

export async function GET(request: Request, context: { params: Promise<{ leadId: string }> }) {
  try {
    const user = await requireUser();
    const { leadId } = await context.params;
    const assignmentId = new URL(request.url).searchParams.get("assignmentId");
    if (!assignmentId) return Response.json({ ok: false, error: "Product assignment is required." }, { status: 400 });
    let supabase = await createClient();
    if (!user.roles.includes("admin")) {
      const allowedOwnerIds = user.roles.includes("sales_manager")
        ? [user.userId, ...(await getSalesManagerTeamMemberIds(user.userId))]
        : [user.userId];
      const admin = createAdminClient();
      const { data: assignment, error: assignmentError } = await admin
        .from("lead_product_assignments")
        .select("id")
        .eq("id", assignmentId)
        .eq("lead_id", leadId)
        .in("assigned_to", allowedOwnerIds)
        .maybeSingle();
      if (assignmentError || !assignment) return Response.json({ ok: false, error: "This lead is not assigned to you or your team." }, { status: 403 });
      supabase = admin;
    }
    const [zoom, meet] = await Promise.all([
      supabase
        .from("lead_zoom_meetings")
        .select("id, topic, agenda, start_time, duration_minutes, join_url, recording_url, transcript_text, transcript_download_url, host_user_id")
        .eq("lead_id", leadId)
        .order("start_time", { ascending: false }),
      supabase
        .from("lead_google_meetings")
        .select("id, topic, description, start_time, duration_minutes, meet_url, calendar_url, recording_url, transcript_url, host_user_id")
        .eq("lead_id", leadId)
        .order("start_time", { ascending: false }),
    ]);
    if (zoom.error) return Response.json({ ok: false, error: zoom.error.message }, { status: 400 });
    if (meet.error) return Response.json({ ok: false, error: meet.error.message }, { status: 400 });
    const meetings = [
      ...(zoom.data ?? []).map((m) => ({ id: m.id, kind: "Zoom" as const, topic: m.topic, notes: m.agenda, startTime: m.start_time, durationMinutes: m.duration_minutes, joinUrl: m.join_url, recordingUrl: m.recording_url, transcriptText: m.transcript_text, transcriptUrl: m.transcript_download_url, hostUserId: m.host_user_id })),
      ...(meet.data ?? []).map((m) => ({ id: m.id, kind: "Google Meet" as const, topic: m.topic, notes: m.description, startTime: m.start_time, durationMinutes: m.duration_minutes, joinUrl: m.meet_url, calendarUrl: m.calendar_url, recordingUrl: m.recording_url, transcriptText: null as string | null, transcriptUrl: m.transcript_url, hostUserId: m.host_user_id })),
    ].sort((a, b) => +new Date(b.startTime) - +new Date(a.startTime));
    return Response.json({ ok: true, meetings });
  } catch {
    return Response.json({ ok: false, error: "Unable to load meetings." }, { status: 401 });
  }
}
