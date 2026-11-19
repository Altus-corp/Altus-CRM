// No Google account or API credentials needed: this builds a link to
// Google's own "create event" page, pre-filled, for the user to save with
// one click into their own already-signed-in Google account.
export function googleCalendarCreateUrl({ title, description, start, end }: { title: string; description: string; start: Date; end: Date }) {
  const toUtc = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const params = new URLSearchParams({ action: "TEMPLATE", text: title, dates: `${toUtc(start)}/${toUtc(end)}` });
  if (description) params.set("details", description);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
