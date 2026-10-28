export type ContactCall = { id?: string | number; user?: string } & Record<string, unknown>;

export function indiaDayRange(now = new Date()) {
  const india = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const start = new Date(Date.UTC(india.getUTCFullYear(), india.getUTCMonth(), india.getUTCDate(), -5, -30));
  return { start, end: new Date(start.getTime() + 86_400_000) };
}

export function dateFromCall(call: ContactCall) {
  const values = [call.created_at, call.started_at, call.call_time, call.timestamp, call.date, call.createdAt, call.startedAt];
  for (const value of values) {
    const date = new Date(typeof value === "string" || typeof value === "number" ? value : "");
    if (!Number.isNaN(date.getTime())) return date;
  }
  return null;
}

export function numberKey(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : "";
}

export function callNumbers(call: ContactCall) {
  const contact = call.contact && typeof call.contact === "object" ? call.contact as Record<string, unknown> : {};
  return [call.number, call.phone, call.to, call.from, call.caller, call.callee, call.destination, call.source, contact.number, contact.phone, contact.mobile]
    .map(numberKey).filter(Boolean);
}

export function isConnected(call: ContactCall) {
  const status = String(call.status ?? call.call_status ?? call.disposition ?? "").toLowerCase();
  const duration = Number(call.duration ?? call.duration_seconds ?? call.talk_time ?? 0);
  if (duration > 0 || call.connected === true || call.answered === true) return true;
  return /connected|answered|completed|success/.test(status) && !/not connected|failed|missed|rejected|busy|no answer/.test(status);
}

// IST (UTC+05:30) calendar helpers. Keys are "YYYY-MM-DD" and "YYYY-MM".
export const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
export const MONTH_KEY = /^\d{4}-\d{2}$/;

export function istTodayKey(now = new Date()) {
  return new Date(now.getTime() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function istDayRange(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, day, -5, -30));
  return { start, end: new Date(start.getTime() + 86_400_000) };
}

export function istMonthRange(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return { start: new Date(Date.UTC(year, month - 1, 1, -5, -30)), end: new Date(Date.UTC(year, month, 1, -5, -30)) };
}

export function istDayOfMonth(value: string | Date) {
  return new Date(new Date(value).getTime() + 5.5 * 60 * 60 * 1000).getUTCDate();
}
