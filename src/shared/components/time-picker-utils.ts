/** Parses flexible typed strings ("6:30 pm", "18:30", "630p", "9a", etc.) into 24-hr "HH:mm" */
export function parseTimeString(input: string): string | null {
  const raw = input.trim().toLowerCase();
  if (!raw) return null;

  // Pattern 1: HH:mm with optional am/pm (e.g. "6:30 pm", "06:30", "18:30", "6:30p")
  const matchColon = raw.match(/^(\d{1,2}):(\d{1,2})\s*([ap]m?)?$/);
  if (matchColon) {
    let h = parseInt(matchColon[1], 10);
    const m = parseInt(matchColon[2], 10);
    const p = matchColon[3];
    if (m < 0 || m > 59) return null;
    if (p) {
      if (h < 1 || h > 12) return null;
      if (p.startsWith("p") && h < 12) h += 12;
      if (p.startsWith("a") && h === 12) h = 0;
    } else {
      if (h < 0 || h > 23) return null;
    }
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  // Pattern 2: 3 or 4 digits without colon (e.g. "630", "0630", "1830", "630p", "630pm")
  const matchDigits = raw.match(/^(\d{3,4})\s*([ap]m?)?$/);
  if (matchDigits) {
    const numStr = matchDigits[1];
    const p = matchDigits[2];
    const m = parseInt(numStr.slice(-2), 10);
    let h = parseInt(numStr.slice(0, -2), 10);
    if (m < 0 || m > 59) return null;
    if (p) {
      if (h < 1 || h > 12) return null;
      if (p.startsWith("p") && h < 12) h += 12;
      if (p.startsWith("a") && h === 12) h = 0;
    } else {
      if (h < 0 || h > 23) return null;
    }
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  // Pattern 3: Single hour with am/pm (e.g. "6pm", "6p", "9am", "9a", "12pm")
  const matchHourWithPeriod = raw.match(/^(\d{1,2})\s*([ap]m?)$/);
  if (matchHourWithPeriod) {
    let h = parseInt(matchHourWithPeriod[1], 10);
    const p = matchHourWithPeriod[2];
    if (h < 1 || h > 12) return null;
    if (p.startsWith("p") && h < 12) h += 12;
    if (p.startsWith("a") && h === 12) h = 0;
    return `${String(h).padStart(2, "0")}:00`;
  }

  // Pattern 4: Standalone hour number 0..23 (e.g. "9" -> "09:00", "18" -> "18:00")
  const matchJustHour = raw.match(/^(\d{1,2})$/);
  if (matchJustHour) {
    const h = parseInt(matchJustHour[1], 10);
    if (h >= 0 && h <= 23) {
      return `${String(h).padStart(2, "0")}:00`;
    }
  }

  return null;
}

/** Formats stored 24h "HH:mm" into "hh:mm AM/PM" for display */
export function formatDisplayTime(stored: string | undefined): string {
  if (!stored) return "";
  const parts = stored.split(":");
  if (parts.length < 2) return "";
  const h24 = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h24) || isNaN(m)) return "";

  const period = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 || 12;
  return `${String(h12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${period}`;
}

/** Decomposes 24h "HH:mm" into 12h components */
export function decompose24(stored: string | undefined): {
  hour12: number;
  minute: number;
  period: "AM" | "PM";
} {
  if (!stored) {
    const now = new Date();
    const h = now.getHours();
    return {
      hour12: h % 12 || 12,
      minute: now.getMinutes(),
      period: h >= 12 ? "PM" : "AM",
    };
  }
  const parts = stored.split(":");
  const h24 = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h24) || isNaN(m)) {
    return { hour12: 12, minute: 0, period: "AM" };
  }
  const period = h24 >= 12 ? "PM" : "AM";
  const hour12 = h24 % 12 || 12;
  return { hour12, minute: m, period };
}

/** Composes 12h parts into 24h "HH:mm" format */
export function compose24(hour12: number, minute: number, period: "AM" | "PM"): string {
  let h24 = hour12;
  if (period === "AM") {
    if (h24 === 12) h24 = 0;
  } else {
    if (h24 < 12) h24 += 12;
  }
  return `${String(h24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}
