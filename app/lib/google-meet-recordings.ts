import "server-only";
import { createAdminClient } from "@/app/lib/supabase/admin";
import { getGoogleMeetArtifacts } from "@/app/lib/google-calendar";

export async function syncGoogleMeetRecordings() {
  const admin = createAdminClient();
  const oldestToCheck = new Date(Date.now() - 2 * 24 * 60 * 60_000).toISOString();
  const { data: meetings, error } = await admin
    .from("lead_google_meetings")
    .select("id, lead_id, lead_product_assignment_id, google_event_id, topic, start_time, duration_minutes, host_user_id, recording_url, transcript_url")
    .or("recording_url.is.null,transcript_url.is.null")
    .gte("start_time", oldestToCheck);
  if (error) return { ok: false, message: error.message, updated: 0 };

  let updated = 0;
  for (const meeting of meetings ?? []) {
    const endsAt = new Date(meeting.start_time).getTime() + meeting.duration_minutes * 60_000;
    if (endsAt > Date.now() - 15 * 60_000) continue; // Meet can take a while after the call ends to finish processing the recording and transcript.
    try {
      const { recordingUrl, transcriptUrl } = await getGoogleMeetArtifacts(meeting.google_event_id);
      const patch: Record<string, string> = {};
      if (recordingUrl && !meeting.recording_url) patch.recording_url = recordingUrl;
      if (transcriptUrl && !meeting.transcript_url) { patch.transcript_url = transcriptUrl; patch.transcript_received_at = new Date().toISOString(); }
      if (!Object.keys(patch).length) continue;
      await admin.from("lead_google_meetings").update(patch).eq("id", meeting.id);
      if (patch.recording_url)
        await admin.from("lead_activities").insert({
          lead_id: meeting.lead_id,
          lead_product_assignment_id: meeting.lead_product_assignment_id,
          activity_type: "google_meet_recording_ready",
          note: `Recording is ready for Google Meet: ${meeting.topic}.`,
          metadata: { attachments: [{ url: recordingUrl, name: "Watch recording" }] },
          created_by: meeting.host_user_id,
        });
      if (patch.transcript_url)
        await admin.from("lead_activities").insert({
          lead_id: meeting.lead_id,
          lead_product_assignment_id: meeting.lead_product_assignment_id,
          activity_type: "google_meet_transcript_ready",
          note: `Transcript is ready for Google Meet: ${meeting.topic}.`,
          metadata: { attachments: [{ url: transcriptUrl, name: "View transcript" }] },
          created_by: meeting.host_user_id,
        });
      updated += 1;
    } catch {
      // Not ready yet, or Drive/Calendar scope is missing — retried on the next run.
    }
  }
  return { ok: true, message: `Checked ${meetings?.length ?? 0} meeting(s); ${updated} updated with a recording and/or transcript.`, updated };
}
