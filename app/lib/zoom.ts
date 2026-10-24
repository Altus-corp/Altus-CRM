import "server-only";

type ZoomMeetingResponse = { id: number | string; join_url: string; start_url?: string };

function zoomConfig() {
  const accountId = process.env.ZOOM_ACCOUNT_ID;
  const clientId = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;
  if (!accountId || !clientId || !clientSecret) throw new Error("Zoom is not configured. Add the Zoom server-to-server OAuth values to .env.local.");
  return { accountId, clientId, clientSecret };
}

async function getZoomAccessToken() {
  const { accountId, clientId, clientSecret } = zoomConfig();
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch(`https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(accountId)}`, {
    method: "POST",
    headers: { Authorization: `Basic ${credentials}` },
    cache: "no-store",
  });
  const body = await response.json() as { access_token?: string; reason?: string };
  if (!response.ok || !body.access_token) throw new Error(body.reason || "Zoom could not authorize the CRM.");
  return body.access_token;
}

export async function createZoomMeeting(input: { hostEmail: string; topic: string; agenda: string; startTime: string; duration: number }) {
  const token = await getZoomAccessToken();
  const response = await fetch(`https://api.zoom.us/v2/users/${encodeURIComponent(input.hostEmail)}/meetings`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      topic: input.topic,
      agenda: input.agenda,
      type: 2,
      start_time: input.startTime,
      duration: input.duration,
      timezone: "Asia/Kolkata",
      settings: { waiting_room: true, join_before_host: false, auto_recording: "cloud" },
    }),
    cache: "no-store",
  });
  const body = await response.json() as ZoomMeetingResponse & { message?: string };
  if (!response.ok || !body.id || !body.join_url) throw new Error(body.message || "Zoom could not create the meeting. Make sure your CRM email is an active Zoom host.");
  return body;
}

export async function downloadZoomTranscript(meetingId: string) {
  const token = await getZoomAccessToken();
  const response = await fetch(`https://api.zoom.us/v2/meetings/${encodeURIComponent(meetingId)}/transcript`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  const transcript = await response.json() as { download_url?: string; message?: string };
  if (!response.ok || !transcript.download_url) throw new Error(transcript.message || "Zoom transcript is not available yet.");
  const contentResponse = await fetch(transcript.download_url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!contentResponse.ok) throw new Error("Zoom transcript could not be downloaded.");
  return { text: await contentResponse.text(), downloadUrl: transcript.download_url };
}
