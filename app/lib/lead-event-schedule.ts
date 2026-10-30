const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
  september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

export function indiaToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

// Supports source values such as "6 June 2026" and "Thu, 13 Aug 4:30 pm IST".
// A year omitted by a Google Sheet is treated as the next occurrence of that date.
export function scheduledIndiaDate(value: string, now = new Date()) {
  const match = value.trim().match(/\b(\d{1,2})\s+([a-z]+)(?:\s+(\d{4}))?\b/i);
  if (!match) return null;
  const day = Number(match[1]);
  const month = MONTHS[match[2].toLowerCase()];
  if (!month) return null;
  const today = indiaToday(now);
  const currentYear = Number(today.slice(0, 4));
  let year = match[3] ? Number(match[3]) : currentYear;
  let candidate = formatDate(year, month, day);
  if (!match[3] && candidate < today) candidate = formatDate(++year, month, day);
  return candidate;
}

function formatDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return "";
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
