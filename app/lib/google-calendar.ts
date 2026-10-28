import "server-only";

type GoogleTokenResponse = { access_token?: string; error?: string; error_description?: string };
type GoogleEventResponse = {
  id?: string;
  htmlLink?: string;
  conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] };
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

export async function createGoogleMeetEvent(input: { topic: string; description: string; startTime: string; duration: number; attendeeEmail: string }) {
  const accessToken = await getGoogleCalendarAccessToken();
  const endTime = new Date(new Date(input.startTime).getTime() + input.duration * 60_000).toISOString();
  const response = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      summary: input.topic,
      description: input.description,
      start: { dateTime: input.startTime, timeZone: "Asia/Kolkata" },
      end: { dateTime: endTime, timeZone: "Asia/Kolkata" },
      attendees: [{ email: input.attendeeEmail }],
      conferenceData: { createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } } },
    }),
    cache: "no-store",
  });
  const result = await response.json() as GoogleEventResponse;
  const meetUrl = result.conferenceData?.entryPoints?.find((entry) => entry.entryPointType === "video")?.uri;
  if (!response.ok || !result.id || !meetUrl) throw new Error(result.error?.message || "Google Calendar could not create the Meet link.");
  return { eventId: result.id, meetUrl, calendarUrl: result.htmlLink ?? null };
}
