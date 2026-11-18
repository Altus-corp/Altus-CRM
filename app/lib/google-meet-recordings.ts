import "server-only";
import { createAdminClient } from "@/app/lib/supabase/admin";
import { getGoogleMeetRecordingUrl } from "@/app/lib/google-calendar";

export async function syncGoogleMeetRecordings() {
  const admin = createAdminClient();
  const oldestToCheck = new Date(Date.now() - 2 * 24 * 60 * 60_000).toISOString();
  const { data: meetings, error } = await admin
    .from("lead_google_meetings")
    .select("id, lead_id, lead_product_assignment_id, google_event_id, topic, start_time, duration_minutes, host_user_id")
    .is("recording_url", null)
    .gte("start_time", oldestToCheck);
  if (error) return { ok: false, message: error.message, updated: 0 };

  let updated = 0;
  for (const meeting of meetings ?? []) {
    const endsAt = new Date(meeting.start_time).getTime() + meeting.duration_minutes * 60_000;
    if (endsAt > Date.now() - 15 * 60_000) continue; // Meet can take a while after the call ends to finish processing the recording.
    try {
      const recordingUrl = await getGoogleMeetRecordingUrl(meeting.google_event_id);
      if (!recordingUrl) continue;
      await admin.from("lead_google_meetings").update({ recording_url: recordingUrl }).eq("id", meeting.id);
      await admin.from("lead_activities").insert({
        lead_id: meeting.lead_id,
        lead_product_assignment_id: meeting.lead_product_assignment_id,
        activity_type: "google_meet_recording_ready",
        note: `Recording is ready for Google Meet: ${meeting.topic}.`,
        metadata: { attachments: [{ url: recordingUrl, name: "Watch recording" }] },
        created_by: meeting.host_user_id,
      });
      updated += 1;
    } catch {
      // Not ready yet, or Drive/Calendar scope is missing — retried on the next run.
    }
  }
  return { ok: true, message: `Checked ${meetings?.length ?? 0} meeting(s); ${updated} recording(s) found.`, updated };
}
