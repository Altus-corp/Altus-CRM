import "server-only";
import crypto from "crypto";
import { createAdminClient } from "@/app/lib/supabase/admin";

type ZoomWebhookPayload = {
  event?: string;
  payload?: {
    plainToken?: string;
    object?: {
      id?: number | string;
      topic?: string;
      share_url?: string;
      recording_files?: { play_url?: string }[];
    };
  };
};

export async function POST(request: Request) {
  const secretToken = process.env.ZOOM_WEBHOOK_SECRET_TOKEN?.trim();
  if (!secretToken) return Response.json({ ok: false, message: "Zoom webhook secret is not configured." }, { status: 500 });

  const rawBody = await request.text();
  const body = JSON.parse(rawBody) as ZoomWebhookPayload;

  // Zoom sends this once, when you first save the webhook URL, to prove you own the endpoint.
  if (body.event === "endpoint.url_validation" && body.payload?.plainToken) {
    const encryptedToken = crypto.createHmac("sha256", secretToken).update(body.payload.plainToken).digest("hex");
    return Response.json({ plainToken: body.payload.plainToken, encryptedToken });
  }

  const timestamp = request.headers.get("x-zm-request-timestamp");
  const signature = request.headers.get("x-zm-signature");
  const expectedSignature = `v0=${crypto.createHmac("sha256", secretToken).update(`v0:${timestamp}:${rawBody}`).digest("hex")}`;
  if (!signature || signature !== expectedSignature) return Response.json({ ok: false, message: "Invalid signature." }, { status: 401 });

  if (body.event === "recording.completed") {
    const meetingId = String(body.payload?.object?.id ?? "");
    const topic = body.payload?.object?.topic ?? "Zoom meeting";
    const recordingUrl = body.payload?.object?.share_url ?? body.payload?.object?.recording_files?.find((file) => file.play_url)?.play_url ?? null;
    if (meetingId && recordingUrl) {
      const admin = createAdminClient();
      const { data: meeting } = await admin
        .from("lead_zoom_meetings")
        .select("id, lead_id, host_user_id")
        .eq("zoom_meeting_id", meetingId)
        .maybeSingle();
      if (meeting) {
        await admin.from("lead_zoom_meetings").update({ recording_url: recordingUrl }).eq("id", meeting.id);
        await admin.from("lead_activities").insert({
          lead_id: meeting.lead_id,
          activity_type: "zoom_recording_ready",
          note: `Recording is ready for Zoom meeting: ${topic}.`,
          metadata: { attachments: [{ url: recordingUrl, name: "Watch recording" }] },
          created_by: meeting.host_user_id,
        });
      }
    }
  }
  return Response.json({ ok: true });
}
