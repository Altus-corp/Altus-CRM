import "server-only";

type GoogleTokenResponse = { access_token?: string; error?: string; error_description?: string };
type GoogleEventResponse = {
  id?: string;
  htmlLink?: string;
  error?: { message?: string };
};
type MeetSpaceResponse = {
  meetingUri?: string;
  config?: { artifactConfig?: { recordingConfig?: { autoRecordingGeneration?: string } } };
  error?: { message?: string };
};

function googleCalendarConfig() {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim();
  const refreshToken = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN?.trim();
  if (!clientId || !clientSecret || !refreshToken) throw new Error("Google Meet is not configured. Add Google Calendar OAuth credentials and the common host refresh token to .env.local.");
  return { clientId, clientSecret, refreshToken };
}

async function getGoogleCalendarAccessToken() {
  const { clientId, clientSecret, refreshToken } = googleCalendarConfig();
  const body = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" });
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body, cache: "no-store" });
  const result = await response.json() as GoogleTokenResponse;
  if (!response.ok || !result.access_token) throw new Error(result.error_description || result.error || "Google Calendar could not authorize the CRM.");
  return result.access_token;
}

// Created directly through the Meet API (not Calendar's auto-generated
// conferenceData) so recording starts the moment the call begins, with no
// dependency on the host account, or anyone specific, actually joining.
async function createAutoRecordingMeetSpace(accessToken: string) {
  const response = await fetch("https://meet.googleapis.com/v2/spaces", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ config: { accessType: "OPEN", artifactConfig: { recordingConfig: { autoRecordingGeneration: "ON" } } } }),
    cache: "no-store",
  });
  const space = await response.json() as MeetSpaceResponse;
  if (!response.ok || !space.meetingUri) throw new Error(space.error?.message || "Could not create a Google Meet space with auto-recording. Your Workspace edition may not support recording.");
  const acceptedRecording = space.config?.artifactConfig?.recordingConfig?.autoRecordingGeneration;
  // Google's API accepts unknown/unsupported fields silently instead of
  // rejecting the request, so the only reliable way to know whether
  // auto-recording actually applied is to check what it echoes back.
  console.error(`Google Meet space created (${space.meetingUri}); autoRecordingGeneration echoed back as: ${acceptedRecording ?? "not present in response"}.`);
  return { meetUrl: space.meetingUri, autoRecordingAccepted: acceptedRecording === "ON" };
}

export async function createGoogleMeetEvent(input: { topic: string; description: string; startTime: string; duration: number; attendeeEmails: string[] }) {
  const accessToken = await getGoogleCalendarAccessToken();
  const { meetUrl, autoRecordingAccepted } = await createAutoRecordingMeetSpace(accessToken);
  const endTime = new Date(new Date(input.startTime).getTime() + input.duration * 60_000).toISOString();
  const attendees = [...new Set(input.attendeeEmails.map((email) => email.trim().toLowerCase()).filter(Boolean))].map((email) => ({ email }));
  const response = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      summary: input.topic,
      description: `${input.description}\n\nJoin with Google Meet: ${meetUrl}`.trim(),
      location: meetUrl,
      start: { dateTime: input.startTime, timeZone: "Asia/Kolkata" },
      end: { dateTime: endTime, timeZone: "Asia/Kolkata" },
      attendees,
    }),
    cache: "no-store",
  });
  const result = await response.json() as GoogleEventResponse;
  if (!response.ok || !result.id) throw new Error(result.error?.message || "Google Calendar could not create the Meet link.");
  return { eventId: result.id, meetUrl, calendarUrl: result.htmlLink ?? null, autoRecordingAccepted };
}

export async function getGoogleMeetArtifacts(eventId: string) {
  const accessToken = await getGoogleCalendarAccessToken();
  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const event = await response.json() as { attachments?: { fileUrl?: string; title?: string; mimeType?: string }[]; error?: { message?: string } };
  if (!response.ok) throw new Error(event.error?.message || "Could not check for the Meet recording.");
  const attachments = event.attachments ?? [];
  const recordingUrl = attachments.find(
    (attachment) => attachment.mimeType?.startsWith("video/") || attachment.title?.toLowerCase().includes("recording"),
  )?.fileUrl ?? null;
  // Meet writes the transcript as a Google Doc attached to the same event, titled e.g. "<topic> - Transcript".
  const transcriptUrl = attachments.find(
    (attachment) => attachment.mimeType === "application/vnd.google-apps.document" && attachment.title?.toLowerCase().includes("transcript"),
  )?.fileUrl ?? null;
  return { recordingUrl, transcriptUrl };
}
