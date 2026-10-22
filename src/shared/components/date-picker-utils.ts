const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

/** Returns today's date formatted as "yyyy-MM-dd" */
export function getTodayString(): string {
  const d = new Date();
  return formatDateISO(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

/** Formats year, month (1..12), day (1..31) into "yyyy-MM-dd" */
export function formatDateISO(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Formats stored "yyyy-MM-dd" into "dd MMM yyyy" (e.g. "21 Oct 2026") */
export function formatDisplayDate(isoString: string | undefined): string {
  if (!isoString) return "";
  const parts = isoString.trim().split("-");
  if (parts.length !== 3) return "";
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);
  if (isNaN(y) || isNaN(m) || isNaN(d) || m < 1 || m > 12 || d < 1 || d > 31) {
    return "";
  }
  const monthName = MONTH_SHORT[m - 1];
  return `${String(d).padStart(2, "0")} ${monthName} ${y}`;
}

/** Parses flexible typed text ("21/10/2026", "21 Oct 2026", "2026-10-21", etc.) into "yyyy-MM-dd" */
export function parseDateString(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  // Pattern 1: ISO "yyyy-MM-dd"
  const isoMatch = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (isoMatch) {
    const y = parseInt(isoMatch[1], 10);
    const m = parseInt(isoMatch[2], 10);
    const d = parseInt(isoMatch[3], 10);
    if (isValidDateParts(y, m, d)) {
      return formatDateISO(y, m, d);
    }
  }

  // Pattern 2: DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  const dmyMatch = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (dmyMatch) {
    const d = parseInt(dmyMatch[1], 10);
    const m = parseInt(dmyMatch[2], 10);
    let y = parseInt(dmyMatch[3], 10);
    if (y < 100) y += 2000;
    if (isValidDateParts(y, m, d)) {
      return formatDateISO(y, m, d);
    }
  }

  // Pattern 3: Text month format (e.g. "21 Oct 2026", "21 October 2026", "Oct 21, 2026", "October 21 2026")
  const textMonthMatch1 = raw.match(/^(\d{1,2})\s+([A-Za-z]+)(?:,?\s+(\d{2,4}))?$/);
  if (textMonthMatch1) {
    const d = parseInt(textMonthMatch1[1], 10);
    const m = parseMonthName(textMonthMatch1[2]);
    let y = textMonthMatch1[3] ? parseInt(textMonthMatch1[3], 10) : new Date().getFullYear();
    if (y < 100) y += 2000;
    if (m !== null && isValidDateParts(y, m, d)) {
      return formatDateISO(y, m, d);
    }
  }

  const textMonthMatch2 = raw.match(/^([A-Za-z]+)\s+(\d{1,2})(?:,?\s+(\d{2,4}))?$/);
  if (textMonthMatch2) {
    const m = parseMonthName(textMonthMatch2[1]);
    const d = parseInt(textMonthMatch2[2], 10);
    let y = textMonthMatch2[3] ? parseInt(textMonthMatch2[3], 10) : new Date().getFullYear();
    if (y < 100) y += 2000;
    if (m !== null && isValidDateParts(y, m, d)) {
      return formatDateISO(y, m, d);
    }
  }

  return null;
}

function parseMonthName(name: string): number | null {
  const clean = name.toLowerCase();
  for (let i = 0; i < 12; i++) {
    if (MONTH_NAMES[i].toLowerCase().startsWith(clean) || MONTH_SHORT[i].toLowerCase() === clean) {
      return i + 1;
    }
  }
  return null;
}

function isValidDateParts(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  if (year < 1900 || year > 2100) return false;

  // Verify days in month (handling leap years)
  const daysInMonth = new Date(year, month, 0).getDate();
  return day <= daysInMonth;
}

/** Returns days in month for a given year and 0-indexed month */
export function getDaysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/** Returns 0-indexed day of week (0=Mon, 6=Sun) for 1st of month */
export function getFirstDayOfWeek(year: number, monthIndex: number): number {
  const d = new Date(year, monthIndex, 1).getDay();
  // Standard Monday-first: Sunday (0) becomes 6, Mon (1) becomes 0, etc.
  return (d + 6) % 7;
}

/** Computes date addition by N days from today in "yyyy-MM-dd" */
export function addDaysFromToday(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return formatDateISO(d.getFullYear(), d.getMonth() + 1, d.getDate());
}
